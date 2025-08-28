/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { assert, binarySearchLessOrEqual, insertSorted, MaybePromise, mergeObjectsDeeply, promiseWithResolvers, retriedFetch, toDataView } from './misc';

/**
 * The source base class, representing a resource from which bytes can be read.
 * @public
 */
export abstract class Source {
	/** @internal */
	abstract _read(start: number, end: number): Promise<Uint8Array>;
	/** @internal */
	abstract _retrieveSize(): Promise<number>;

	abstract _read2(start: number, end: number): MaybePromise<{
		bytes: Uint8Array;
		view: DataView;
		offset: number;
	} | null>;
	abstract _retrieveSize2(): MaybePromise<number>;

	/** @internal */
	_sizePromise: Promise<number> | null = null;

	/**
	 * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
	 * will retrieve the size.
	 */
	getSize() {
		return this._sizePromise ??= this._retrieveSize();
	}

	/** Called each time data is requested from the source. */
	onread: ((start: number, end: number) => unknown) | null = null;
}

/**
 * A source backed by an ArrayBuffer or ArrayBufferView, with the entire file held in memory.
 * @public
 */
export class BufferSource extends Source {
	/** @internal */
	_bytes: Uint8Array;
	/** @internal */
	_view: DataView;

	constructor(buffer: ArrayBuffer | Uint8Array) {
		if (!(buffer instanceof ArrayBuffer) && !(buffer instanceof Uint8Array)) {
			throw new TypeError('buffer must be an ArrayBuffer or Uint8Array.');
		}

		super();

		this._bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
		this._view = toDataView(this._bytes);
	}

	/** @internal */
	async _read(start: number, end: number) {
		return this._bytes.subarray(start, end);
	}

	_read2(start: number, end: number) {
		if (end > this._bytes.byteLength) {
			return null;
		}

		return {
			bytes: this._bytes,
			view: this._view,
			offset: 0,
		};

		// return this._bytes.subarray(start, end);
	}

	_retrieveSize2() {
		return this._bytes.byteLength;
	}

	/** @internal */
	async _retrieveSize() {
		return this._bytes.byteLength;
	}
}

/**
 * Options for defining a StreamSource.
 * @public
 */
export type StreamSourceOptions = {
	/** Called when data is requested. Should return or resolve to the bytes from the specified byte range. */
	read: (start: number, end: number) => Uint8Array | Promise<Uint8Array>;
	/** Called when the size of the entire file is requested. Should return or resolve to the size in bytes. */
	getSize: () => number | Promise<number>;
};

/**
 * A general-purpose, callback-driven source that can get its data from anywhere.
 * @public
 */
export class StreamSource extends Source {
	/** @internal */
	_options: StreamSourceOptions;

	constructor(options: StreamSourceOptions) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (typeof options.read !== 'function') {
			throw new TypeError('options.read must be a function.');
		}
		if (typeof options.getSize !== 'function') {
			throw new TypeError('options.getSize must be a function.');
		}

		super();

		this._options = options;
	}

	/** @internal */
	async _read(start: number, end: number) {
		return this._options.read(start, end);
	}

	/** @internal */
	async _retrieveSize() {
		return this._options.getSize();
	}
}

type BlobSourceReader = {
	reader: ReadableStreamDefaultReader<Uint8Array>;
	currentPos: number;
	targetPos: number;
	running: boolean;
	pendingSlices: BlobSourcePendingSlice[];
	age: number;
};

type BlobSourceCacheEntry = {
	start: number;
	end: number;
	bytes: Uint8Array;
	view: DataView;
	age: number;
};

type BlobSourcePendingSlice = {
	start: number;
	bytes: Uint8Array;
	holes: {
		start: number;
		end: number;
	}[];
	resolve: (bytes: Uint8Array) => void;
};

/**
 * A source backed by a Blob. Since Files are also Blobs, this is the source to use when reading files off the disk.
 * @public
 */
export class BlobSource extends Source {
	/** @internal */
	_blob: Blob;
	_cache: BlobSourceCacheEntry[] = [];
	_totalCacheSize = 0;
	_readers: BlobSourceReader[] = [];
	_nextAge = 0;

	constructor(blob: Blob) {
		if (!(blob instanceof Blob)) {
			throw new TypeError('blob must be a Blob.');
		}

		super();

		this._blob = blob;
	}

	_read2(start: number, end: number) {
		if (end > this._retrieveSize2()) {
			return null;
		}

		const cacheStartIndex = binarySearchLessOrEqual(this._cache, start, x => x.start);
		const startEntry = cacheStartIndex !== -1 ? this._cache[cacheStartIndex] : null;

		if (startEntry && startEntry.start <= start && end <= startEntry.end) {
			startEntry.age = this._nextAge++;

			return {
				bytes: startEntry.bytes,
				view: startEntry.view,
				offset: startEntry.start,
			};
		}

		const bytes = new Uint8Array(end - start);
		let lastEnd = start;
		const holes: {
			start: number;
			end: number;
		}[] = [];

		if (cacheStartIndex !== -1) {
			for (let i = cacheStartIndex; i < this._cache.length; i++) {
				const entry = this._cache[i]!;
				if (entry.start >= end) {
					break;
				}
				if (entry.end <= start) {
					continue;
				}

				const cappedStart = Math.max(start, entry.start);
				const cappedEnd = Math.min(end, entry.end);
				assert(cappedStart <= cappedEnd);

				if (lastEnd < cappedStart) {
					holes.push({ start: lastEnd, end: cappedStart });
				}
				lastEnd = cappedEnd;

				bytes.set(
					entry.bytes.subarray(cappedStart - entry.start, cappedEnd - entry.start),
					cappedStart - start,
				);
				entry.age = this._nextAge++;
			}

			if (lastEnd < end) {
				holes.push({ start: lastEnd, end });
			}
		} else {
			holes.push({ start, end });
		}

		if (holes.length === 0) {
			return {
				bytes,
				view: toDataView(bytes),
				offset: start,
			};
		}

		const { promise, resolve } = promiseWithResolvers<Uint8Array>();

		for (const hole of holes) {
			const pendingSlice: BlobSourcePendingSlice = {
				start,
				bytes,
				holes,
				resolve,
			};

			const readerStart = Math.min(hole.start, Math.max(this._retrieveSize2() - 131072, 0));
			const readerEnd = hole.end;//  Math.min(Math.max(readerStart + 131072, hole.end), this._retrieveSize2());

			let readerFound = false;
			for (const reader of this._readers) {
				if (reader.currentPos <= readerStart && readerStart - 131072 <= reader.targetPos) {
					reader.targetPos = Math.max(reader.targetPos, readerEnd);
					readerFound = true;

					if (!reader.pendingSlices.includes(pendingSlice)) {
						reader.pendingSlices.push(pendingSlice);
					}

					if (!reader.running) {
						void this._runReader(reader);
					}

					break;
				}
			}

			if (!readerFound) {
				const newReader: BlobSourceReader = {
					reader: this._blob.slice(readerStart).stream().getReader(),
					currentPos: readerStart,
					targetPos: readerEnd,
					running: false,
					pendingSlices: [pendingSlice],
					age: 0, // Will be set once we run it
				};
				this._readers.push(newReader);

				void this._runReader(newReader);

				if (this._readers.length > 4) {
					let oldestIndex = 0;
					let oldestReader = this._readers[0]!;

					for (let i = 1; i < this._readers.length; i++) {
						const reader = this._readers[i]!;

						if (reader.age < oldestReader.age) {
							oldestIndex = i;
							oldestReader = reader;
						}
					}

					this._readers.splice(oldestIndex, 1);
				}
			}
		}

		return promise.then(bytes => ({
			bytes,
			view: toDataView(bytes),
			offset: start,
		}));
	}

	async _runReader(reader: BlobSourceReader) {
		assert(!reader.running);
		reader.running = true;
		reader.age = this._nextAge++;

		while (reader.currentPos < reader.targetPos) {
			const { done, value } = await reader.reader.read();
			if (done) {
				const readerIndex = this._readers.indexOf(reader);
				assert(readerIndex !== -1);

				this._readers.splice(readerIndex, 1);

				break;
			}

			const start = reader.currentPos;
			const end = start + value.length;

			this._insertIntoCache({
				start,
				end,
				bytes: value,
				view: toDataView(value),
				age: this._nextAge++,
			});
			reader.currentPos += value.length;
			reader.targetPos = Math.max(reader.targetPos, reader.currentPos);

			for (let i = 0; i < reader.pendingSlices.length; i++) {
				const pendingSlice = reader.pendingSlices[i]!;

				const clampedStart = Math.max(start, pendingSlice.start);
				const clampedEnd = Math.min(end, pendingSlice.start + pendingSlice.bytes.length);

				if (clampedStart < clampedEnd) {
					pendingSlice.bytes.set(
						value.subarray(clampedStart - start, clampedEnd - start),
						clampedStart - pendingSlice.start,
					);
				}

				for (let j = 0; j < pendingSlice.holes.length; j++) {
					// The hole is intentionally not modified here if the read section starts somewhere in the middle of
					// the hole. We don't need to do "hole splitting", since the readers are spawned *by* the holes,
					// meaning there's always a reader which will consume the hole left to right.
					const hole = pendingSlice.holes[j]!;
					if (start <= hole.start && end > hole.start) {
						hole.start = end;
					}

					if (hole.end <= hole.start) {
						pendingSlice.holes.splice(j, 1);
						j--;
					}
				}

				if (pendingSlice.holes.length === 0) {
					pendingSlice.resolve(pendingSlice.bytes);
					reader.pendingSlices.splice(i, 1);
					i--;
				}
			}
		}

		reader.running = false;
	}

	_insertIntoCache(entry: BlobSourceCacheEntry) {
		let insertionIndex = binarySearchLessOrEqual(this._cache, entry.start, x => x.start) + 1;

		if (insertionIndex > 0) {
			const previous = this._cache[insertionIndex - 1]!;
			if (previous.end >= entry.end) {
				// Previous entry swallows the one to be inserted; we don't need to do anything
				return;
			}

			if (previous.end > entry.start) {
				// Partial overlap with the previous entry, let's join
				const joined = new Uint8Array(entry.end - previous.start);
				joined.set(previous.bytes, 0);
				joined.set(entry.bytes, entry.start - previous.start);

				previous.bytes = joined;
				previous.view = toDataView(joined);
				previous.end = entry.end;

				// Do the rest of the logic with the previous entry instead
				insertionIndex--;
				entry = previous;

				this._totalCacheSize += entry.end - previous.end;
			} else {
				this._cache.splice(insertionIndex, 0, entry);
				this._totalCacheSize += entry.bytes.length;
			}
		} else {
			this._cache.splice(insertionIndex, 0, entry);
			this._totalCacheSize += entry.bytes.length;
		}

		for (let i = insertionIndex + 1; i < this._cache.length; i++) {
			const next = this._cache[i]!;
			if (entry.end <= next.start) {
				// Even if they touch, we don't wanna merge them, no need
				break;
			}

			if (entry.end >= next.end) {
				// The inserted entry completely swallows the next entry
				this._cache.splice(i, 1);
				this._totalCacheSize -= next.bytes.length;
				i--;
				continue;
			}

			// Partial overlap, let's join
			const joined = new Uint8Array(next.end - entry.start);
			joined.set(entry.bytes, 0);
			joined.set(next.bytes, next.start - entry.start);

			entry.bytes = joined;
			entry.view = toDataView(joined);
			entry.end = next.end;
			this._cache.splice(i, 1);

			this._totalCacheSize -= entry.end - next.start;

			break; // After the join case, we're done: the next entry cannot possibly overlap with the inserted one.
		}

		const MAX_CACHE_SIZE = 8 * 2 ** 20; // 8 MiB

		while (this._totalCacheSize > MAX_CACHE_SIZE) {
			let oldestIndex = 0;
			let oldestEntry = this._cache[0]!;

			for (let i = 1; i < this._cache.length; i++) {
				const entry = this._cache[i]!;

				if (entry.age < oldestEntry.age) {
					oldestIndex = i;
					oldestEntry = entry;
				}
			}

			this._cache.splice(oldestIndex, 1);
			this._totalCacheSize -= oldestEntry.bytes.length;
		}
	}

	_cachedSize: number | null = null;
	_retrieveSize2() {
		if (this._cachedSize !== null) {
			return this._cachedSize;
		}

		return this._cachedSize = this._blob.size; // Reading this field is expensive
	}

	/** @internal */
	async _read(start: number, end: number) {
		const slice = this._blob.slice(start, end);
		const buffer = await slice.arrayBuffer();
		return new Uint8Array(buffer);
	}

	/** @internal */
	async _retrieveSize() {
		return this._blob.size;
	}
}

/**
 * Options for UrlSource.
 * @public
 */
export type UrlSourceOptions = {
	/**
	 * The RequestInit used by the Fetch API. Can be used to further control the requests, such as setting
	 * custom headers.
	 */
	requestInit?: RequestInit;

	/**
	 * A function that returns the delay (in seconds) before retrying a failed request. The function is called
	 * with the number of previous, unsuccessful attempts. If the function returns `null`, no more retries will be made.
	 */
	getRetryDelay?: (previousAttempts: number) => number | null;
};

/**
 * A source backed by a URL. This is useful for reading data from the network. Be careful using this source however,
 * as it typically comes with increased latency.
 * @beta
 */
export class UrlSource extends Source {
	/** @internal */
	private _url: URL;
	/** @internal */
	private _options: UrlSourceOptions;
	/** @internal */
	private _fullData: ArrayBuffer | null = null;
	/** @internal */
	private _nextUrlVersion: number | null = null;

	constructor(
		url: string | URL,
		options: UrlSourceOptions = {},
	) {
		if (typeof url !== 'string' && !(url instanceof URL)) {
			throw new TypeError('url must be a string or URL.');
		}
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (options.requestInit !== undefined && (!options.requestInit || typeof options.requestInit !== 'object')) {
			throw new TypeError('options.requestInit, when provided, must be an object.');
		}
		if (options.getRetryDelay !== undefined && typeof options.getRetryDelay !== 'function') {
			throw new TypeError('options.getRetryDelay, when provided, must be a function.');
		}

		super();

		this._url = url instanceof URL ? url : new URL(url, location.href);
		this._options = options;
	}

	/** @internal */
	private async _makeRequest(
		range?: { start: number; end: number },
	): Promise<{ response: ArrayBuffer; statusCode: number }> {
		const headers: HeadersInit = {};

		if (range) {
			headers['Range'] = `bytes=${range.start}-${range.end - 1}`;
		}

		if (this._nextUrlVersion !== null) {
			this._url.searchParams.set('mediabunny_version', this._nextUrlVersion.toString());
			this._nextUrlVersion++;
		}

		const response = await retriedFetch(
			this._url,
			mergeObjectsDeeply(this._options.requestInit ?? {}, {
				method: 'GET',
				headers,
			}),
			this._options.getRetryDelay ?? (() => null),
		);

		if (!response.ok) {
			throw new Error(`Error fetching ${this._url}: ${response.status} ${response.statusText}`);
		}

		const buffer = await response.arrayBuffer();

		if (
			response.status === 206
			&& range
			&& buffer.byteLength !== range.end - range.start
			&& this._nextUrlVersion === null
		) {
			// We did a range request but it resolved with the wrong range; in Chromium, this can be due to a caching
			// bug (https://issues.chromium.org/issues/436025873). Let's circumvent the cache for the rest of the
			// session by appending a version to the URL.
			this._nextUrlVersion = 1;
			return this._makeRequest(range);
		}

		if (response.status === 200) {
			// The server didn't return 206 Partial Content, so it's not a range response
			this._fullData = buffer;
		}

		return {
			response: buffer,
			statusCode: response.status,
		};
	}

	/** @internal */
	async _read(start: number, end: number): Promise<Uint8Array> {
		if (this._fullData) {
			return new Uint8Array(this._fullData, start, end - start);
		}

		const { response, statusCode } = await this._makeRequest({ start, end });

		// If server doesn't support range requests, it will return 200 instead of 206. In that case, let's manually
		// slice the response.
		if (statusCode === 200) {
			const fullData = new Uint8Array(response);
			return fullData.subarray(start, end);
		}

		return new Uint8Array(response);
	}

	/** @internal */
	async _retrieveSize(): Promise<number> {
		if (this._fullData) {
			return this._fullData.byteLength;
		}

		// First, try a HEAD request to get the size
		try {
			const headResponse = await retriedFetch(
				this._url,
				mergeObjectsDeeply(this._options.requestInit ?? {}, {
					method: 'HEAD',
				}),
				this._options.getRetryDelay ?? (() => null),
			);

			if (headResponse.ok) {
				const contentLength = headResponse.headers.get('Content-Length');
				if (contentLength) {
					return parseInt(contentLength);
				}
			}
		} catch {
			// We tried
		}

		// Try a range request to get the Content-Range header
		const rangeResponse = await retriedFetch(
			this._url,
			mergeObjectsDeeply(this._options.requestInit ?? {}, {
				method: 'GET',
				headers: { Range: 'bytes=0-0' },
			}),
			this._options.getRetryDelay ?? (() => null),
		);

		if (rangeResponse.status === 206) {
			const contentRange = rangeResponse.headers.get('Content-Range');
			if (contentRange) {
				const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
				if (match && match[1]) {
					return parseInt(match[1]);
				}
			}
		} else if (rangeResponse.status === 200) {
			// The server just returned the whole thing
			this._fullData = await rangeResponse.arrayBuffer();
			if (this._fullData.byteLength !== 1) {
				return this._fullData.byteLength;
			} else {
				// The server responded with 200, but returned only the requested range, so skip the response
			}
		}

		// If the range request didn't provide the size, make a full GET request
		const { response } = await this._makeRequest();
		return response.byteLength;
	}
}
