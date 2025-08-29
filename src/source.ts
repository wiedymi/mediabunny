/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
	assert,
	binarySearchLessOrEqual,
	closedIntervalsOverlap,
	MaybePromise,
	mergeObjectsDeeply,
	promiseWithResolvers,
	retriedFetch,
	toDataView,
} from './misc';

/**
 * The source base class, representing a resource from which bytes can be read.
 * @public
 */
export abstract class Source {
	abstract _read2(start: number, end: number): MaybePromise<{
		bytes: Uint8Array;
		view: DataView;
		offset: number;
	}>;
	abstract _retrieveSize2(): MaybePromise<number>;

	/** @internal */
	_sizePromise: Promise<number> | null = null;

	/**
	 * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
	 * will retrieve the size.
	 */
	async getSize() {
		return this._sizePromise ??= Promise.resolve(this._retrieveSize2());
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

	_retrieveSize2() {
		return this._bytes.byteLength;
	}

	_read2() {
		return {
			bytes: this._bytes,
			view: this._view,
			offset: 0,
		};
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

/**
 * A source backed by a Blob. Since Files are also Blobs, this is the source to use when reading files off the disk.
 * @public
 */
export class BlobSource extends Source {
	/** @internal */
	_blob: Blob;
	_orchestrator: ReadOrchestrator;

	constructor(blob: Blob) {
		if (!(blob instanceof Blob)) {
			throw new TypeError('blob must be a Blob.');
		}

		super();

		this._blob = blob;
		this._orchestrator = new ReadOrchestrator({
			maxCacheSize: 8 * 2 ** 20, // 8 MiB
			maxWorkerCount: 4,
			runWorker: this._runWorker.bind(this),
			getPrefetchRange(start, end) {
				const paddingStart = 2 ** 16;
				const paddingEnd = 2 ** 17;

				start = Math.max(0, Math.floor((start - paddingStart) / paddingStart) * paddingStart);
				end += paddingEnd; // Preload a tad into the future

				return { start, end };
			},
		});
	}

	_retrieveSize2() {
		const size = this._blob.size;
		this._orchestrator.fileSize = size;

		return size;
	}

	_read2(start: number, end: number) {
		return this._orchestrator.read(start, end);
	}

	readers = new WeakMap<ReadWorker, ReadableStreamDefaultReader<Uint8Array>>();

	async _runWorker(worker: ReadWorker) {
		let reader = this.readers.get(worker);
		if (!reader) {
			// Get a reader of the blob starting at the required offset, and then keep it around
			reader = this._blob.slice(worker.currentPos).stream().getReader();
			this.readers.set(worker, reader);
		}

		while (worker.currentPos < worker.targetPos && !worker.aborted) {
			const { done, value } = await reader.read();
			if (done) {
				this._orchestrator.forgetWorker(worker);
				break;
			}

			this._orchestrator.supplyWorkerData(worker, value);
		}
	}
}

const URL_SOURCE_MIN_LOAD_AMOUNT = 0.5 * 2 ** 20; // 0.5 MiB

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
export class UrlSource2 extends Source {
	_url: URL;
	_options: UrlSourceOptions;
	_orchestrator: ReadOrchestrator;

	_existingResponses = new WeakMap<ReadWorker, {
		response: Response;
		abortController: AbortController;
	}>();

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

		this._orchestrator = new ReadOrchestrator({
			maxCacheSize: 64 * 2 ** 20, // 64 MiB
			// Most files in the real-world have a single sequential access pattern, but having two in parallel can
			// also happen
			maxWorkerCount: 2,
			runWorker: this._runWorker.bind(this),
			getPrefetchRange(start, end, workers) {
				// Add a slight bit of start padding because
				const paddingStart = 2 ** 16;
				start = Math.max(0, Math.floor((start - paddingStart) / paddingStart) * paddingStart);

				// Remote resources have extreme latency (relatively speaking), so the benefit from intelligent
				// prefetching is great. The prefetch strategy employed for UrlSource is as follows: When we notice
				// successive reads to a worker's read region, we prefetch more data at the end of that region,
				// growing exponentially (up to a cap). This performs well for real-world use cases: Either we read a
				// small part of the file once and then never need it again, in which case the requested about of data
				// is small. Or, we're repeatedly doing a sequential access pattern (common in media files), in which
				// case we can become more and more confident to prefetch more and more data.
				for (const worker of workers) {
					const maxExtensionAmount = 8 * 2 ** 20; // 8 MiB

					// When the read region cross the threshold point, we trigger a prefetch. This point is typically
					// in the middle of the worker's read region, or a fixed offset from the end if the region has grown
					// really large.
					const thresholdPoint = Math.max(
						(worker.startPos + worker.targetPos) / 2,
						worker.targetPos - maxExtensionAmount,
					);

					if (closedIntervalsOverlap(
						start, end,
						thresholdPoint, worker.targetPos,
					)) {
						const size = worker.targetPos - worker.startPos;

						// If we extend by maxExtensionAmount
						const a = Math.ceil((size + 1) / maxExtensionAmount) * maxExtensionAmount;
						// If we extend to the next power of 2
						const b = 2 ** Math.ceil(Math.log2(size + 1));

						const extent = Math.min(b, a);
						end = Math.max(end, worker.startPos + extent);
					}
				}

				end = Math.max(end, start + URL_SOURCE_MIN_LOAD_AMOUNT);

				return {
					start,
					end,
				};
			},
		});
	}

	async _retrieveSize2() {
		// Retrieving the resource size for UrlSource is optimized: Almost always (= always), the first bytes we have to
		// read are the start of the file. This means it's smart to combine size fetching with fetching the start of the
		// file. We additionally use this step to probe if the server supports range requests, killing three birds with
		// one stone.

		const abortController = new AbortController();
		const response = await retriedFetch(
			this._url,
			mergeObjectsDeeply(this._options.requestInit ?? {}, {
				headers: {
					// We could also send a non-range request to request the same bytes (all of them), but doing it like
					// this is an easy way to check if the server supports range requests in the first place
					Range: 'bytes=0-',
				},
				signal: abortController.signal,
			}),
			this._options.getRetryDelay ?? (() => null),
		);

		if (!response.ok) {
			throw new Error(`Error fetching ${this._url}: ${response.status} ${response.statusText}`);
		}

		let worker: ReadWorker;
		let fileSize: number;

		if (response.status === 206) {
			fileSize = this._getPartialLengthFromRangeResponse(response);
			worker = this._orchestrator.createWorker(0, URL_SOURCE_MIN_LOAD_AMOUNT);
		} else {
			// Server probably returned a 200.

			const contentLength = response.headers.get('Content-Length');
			if (contentLength) {
				fileSize = Number(contentLength);
				worker = this._orchestrator.createWorker(0, fileSize);
				this._orchestrator.options.maxCacheSize = Infinity; // 🤷

				console.warn(
					'HTTP server did not respond with 206 Partial Content, meaning the entire remote resource now has'
					+ ' to be downloaded. For efficient media file streaming across a network, please make sure your'
					+ ' server supports range requests.',
				);
			} else {
				throw new Error(`HTTP response (status ${response.status}) must surface Content-Length header.`);
			}
		}

		this._orchestrator.fileSize = fileSize;

		this._existingResponses.set(worker, { response, abortController });
		this._orchestrator.runWorker(worker);

		return fileSize;
	}

	async _read2(start: number, end: number) {
		return this._orchestrator.read(start, end);
	}

	private async _runWorker(worker: ReadWorker) {
		const existing = this._existingResponses.get(worker);

		let abortController = existing?.abortController;
		let response = existing?.response;

		if (!abortController) {
			abortController = new AbortController();
			response = await retriedFetch(
				this._url,
				mergeObjectsDeeply(this._options.requestInit ?? {}, {
					headers: {
						Range: `bytes=${worker.currentPos}-`,
					},
					signal: abortController.signal,
				}),
				this._options.getRetryDelay ?? (() => null),
			);
		}

		assert(response);

		if (!response.ok) {
			throw new Error(`Error fetching ${this._url}: ${response.status} ${response.statusText}`);
		}

		const length = this._getPartialLengthFromRangeResponse(response);
		const required = worker.targetPos - worker.currentPos;
		if (length < required) {
			throw new Error(
				`HTTP response unexpectedly too short: Needed at least ${required} bytes, got only ${length}.`,
			);
		}

		if (!response.body) {
			throw new Error('Missing HTTP response body.');
		}

		const reader = response.body.getReader();

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				this._orchestrator.forgetWorker(worker);
				break;
			}

			this._orchestrator.supplyWorkerData(worker, value);

			if (worker.currentPos >= worker.targetPos || worker.aborted) {
				abortController.abort();
				this._existingResponses.delete(worker);
				break;
			}
		}

		// The previous UrlSource had logic for circumventing https://issues.chromium.org/issues/436025873; I haven't
		// been able to observe this bug with the new UrlSource (maybe because we're using response streaming), so the
		// logic for that has vanished for now. Leaving a comment here if this becomes relevant again.
	}

	private _getPartialLengthFromRangeResponse(response: Response) {
		const contentRange = response.headers.get('Content-Range');
		if (contentRange) {
			const match = /\/(\d+)/.exec(contentRange);
			if (match) {
				return Number(match[1]);
			} else {
				throw new Error(`Invalid Content-Range header: ${contentRange}`);
			}
		} else {
			const contentLength = response.headers.get('Content-Length');
			if (contentLength) {
				return Number(contentLength);
			} else {
				throw new Error(
					'Partial HTTP response (status 206) must surface either Content-Range or'
					+ ' Content-Length header.',
				);
			}
		}
	}
}

type PendingSlice = {
	start: number;
	bytes: Uint8Array;
	holes: {
		start: number;
		end: number;
	}[];
	resolve: (bytes: Uint8Array) => void;
	reject: (error: unknown) => void;
};

type CacheEntry = {
	start: number;
	end: number;
	bytes: Uint8Array;
	view: DataView;
	age: number;
};

type ReadWorker = {
	startPos: number;
	currentPos: number;
	targetPos: number;
	running: boolean;
	aborted: boolean;
	pendingSlices: PendingSlice[];
	age: number;
};

/**
 * Godclass for orchestrating complex, cached read operations. The reading model is as follows: Any reading task is
 * delegated to a *worker*, which is a sequential reader positioned somewhere along the file. All workers run in
 * parallel and can be stopped and resumed in their forward movement. When read requests come in, this orchestrator will
 * first try to satisfy the request with only the cached data. If this isn't possible, workers are spun up for all
 * missing parts (or existing workers are repurposed), and these workers will then fill the holes in the data as they
 * march along the file.
 */
class ReadOrchestrator {
	fileSize: number | null = null;
	nextAge = 0; // Used for LRU eviction of both cache entries and workers
	workers: ReadWorker[] = [];
	cache: CacheEntry[] = [];
	currentCacheSize = 0;

	constructor(public options: {
		maxCacheSize: number;
		runWorker: (worker: ReadWorker) => Promise<void>;
		getPrefetchRange: (start: number, end: number, workers: ReadWorker[]) => {
			start: number;
			end: number;
		};
		maxWorkerCount: number;
	}) {}

	read(innerStart: number, innerEnd: number) {
		assert(this.fileSize !== null);

		const prefetchRange = this.options.getPrefetchRange(innerStart, innerEnd, this.workers);
		const outerStart = prefetchRange.start;
		const outerEnd = Math.min(prefetchRange.end, this.fileSize);
		assert(outerStart <= innerStart && innerEnd <= outerEnd);

		let result: MaybePromise<{
			bytes: Uint8Array;
			view: DataView;
			offset: number;
		}> | null = null;

		const innerCacheStartIndex = binarySearchLessOrEqual(this.cache, innerStart, x => x.start);
		const innerStartEntry = innerCacheStartIndex !== -1 ? this.cache[innerCacheStartIndex] : null;

		// See if the read request can be satisfied by a single cache entry
		if (innerStartEntry && innerStartEntry.start <= innerStart && innerEnd <= innerStartEntry.end) {
			innerStartEntry.age = this.nextAge++;

			result = {
				bytes: innerStartEntry.bytes,
				view: innerStartEntry.view,
				offset: innerStartEntry.start,
			};
			// Can't return yet though, still need to check if the prefetch range might lie outside the cached area
		}

		const outerCacheStartIndex = binarySearchLessOrEqual(this.cache, outerStart, x => x.start);

		const bytes = result ? null : new Uint8Array(innerEnd - innerStart);
		let contiguousBytesWriteEnd = 0; // Used to track if the cache is able to completely cover the bytes

		let lastEnd = outerStart;
		// The "holes" in the cache (the parts we need to load)
		const holes: {
			start: number;
			end: number;
		}[] = [];

		// Loop over the cache and build up the list of holes
		if (outerCacheStartIndex !== -1) {
			for (let i = outerCacheStartIndex; i < this.cache.length; i++) {
				const entry = this.cache[i]!;
				if (entry.start >= outerEnd) {
					break;
				}
				if (entry.end <= outerStart) {
					continue;
				}

				const cappedOuterStart = Math.max(outerStart, entry.start);
				const cappedOuterEnd = Math.min(outerEnd, entry.end);
				assert(cappedOuterStart <= cappedOuterEnd);

				if (lastEnd < cappedOuterStart) {
					holes.push({ start: lastEnd, end: cappedOuterStart });
				}
				lastEnd = cappedOuterEnd;

				if (bytes) {
					const cappedInnerStart = Math.max(innerStart, entry.start);
					const cappedInnerEnd = Math.min(innerEnd, entry.end);

					if (cappedInnerStart < cappedInnerEnd) {
						const relativeOffset = cappedInnerStart - innerStart;

						// Fill the relevant section of the bytes with the cached data
						bytes.set(
							entry.bytes.subarray(cappedInnerStart - entry.start, cappedInnerEnd - entry.start),
							relativeOffset,
						);

						if (relativeOffset === contiguousBytesWriteEnd) {
							contiguousBytesWriteEnd = cappedInnerEnd - innerStart;
						}
					}
				}
				entry.age = this.nextAge++;
			}

			if (lastEnd < outerEnd) {
				holes.push({ start: lastEnd, end: outerEnd });
			}
		} else {
			holes.push({ start: outerStart, end: outerEnd });
		}

		if (bytes && contiguousBytesWriteEnd >= bytes.length) {
			// Multiple cache entries were able to completely cover the requested bytes!
			result = {
				bytes,
				view: toDataView(bytes),
				offset: innerStart,
			};
		}

		if (holes.length === 0) {
			assert(result);
			return result;
		}

		// We need to read more data, so now we're in async land
		const { promise, resolve, reject } = promiseWithResolvers<Uint8Array>();

		// Fire off workers to take care of patching the holes
		for (const hole of holes) {
			const pendingSlice: PendingSlice | null = bytes && {
				start: innerStart,
				bytes,
				holes, // Not yet correct! These are the outer holes, not the inner holes. Will be fixed further down!
				resolve,
				reject,
			};

			let workerFound = false;
			for (const worker of this.workers) {
				// A small tolerance in the case that the requested region is *just* after the target position of an
				// existing worker. In that case, it's probably more efficient to repurpose that worker than to spawn
				// another one so close to it
				const gapCloserTolerance = 2 ** 17;

				if (closedIntervalsOverlap(
					hole.start - gapCloserTolerance, hole.start,
					worker.currentPos, worker.targetPos,
				)) {
					worker.targetPos = Math.max(worker.targetPos, hole.end); // Update the worker's target position
					workerFound = true;

					if (pendingSlice && !worker.pendingSlices.includes(pendingSlice)) {
						worker.pendingSlices.push(pendingSlice);
					}

					if (!worker.running) {
						// Kick it off if it's idle
						this.runWorker(worker);
					}

					break;
				}
			}

			if (!workerFound) {
				// We need to spawn a new worker
				const newWorker = this.createWorker(hole.start, hole.end);
				if (pendingSlice) {
					newWorker.pendingSlices = [pendingSlice];
				}

				this.runWorker(newWorker);
			}
		}

		// Turn the outer holes into inner holes
		for (let i = 0; i < holes.length; i++) {
			const hole = holes[i]!;
			hole.start = Math.max(innerStart, hole.start);
			hole.end = Math.min(innerEnd, hole.end);

			if (hole.end <= hole.start) {
				// Empty hole
				holes.splice(i, 1);
				i--;
			}
		}

		if (!result) {
			assert(bytes);
			result = promise.then(bytes => ({
				bytes,
				view: toDataView(bytes),
				offset: innerStart,
			}));
		} else {
			// The requested region was satisfied by the cache, but the entire prefetch region was not
		}

		return result;
	}

	createWorker(startPos: number, targetPos: number) {
		const worker: ReadWorker = {
			startPos,
			currentPos: startPos,
			targetPos,
			running: false,
			aborted: false,
			pendingSlices: [],
			age: this.nextAge++,
		};
		this.workers.push(worker);

		// LRU eviction of the other workers
		while (this.workers.length > this.options.maxWorkerCount) {
			let oldestIndex = 0;
			let oldestWorker = this.workers[0]!;

			for (let i = 1; i < this.workers.length; i++) {
				const worker = this.workers[i]!;

				if (worker.age < oldestWorker.age) {
					oldestIndex = i;
					oldestWorker = worker;
				}
			}

			if (oldestWorker.running && oldestWorker.pendingSlices.length > 0) {
				break;
			}

			oldestWorker.aborted = true;
			this.workers.splice(oldestIndex, 1);
		}

		return worker;
	}

	runWorker(worker: ReadWorker) {
		assert(!worker.running);
		assert(worker.currentPos < worker.targetPos);

		worker.running = true;
		worker.age = this.nextAge++;

		void this.options.runWorker(worker)
			.then(() => worker.running = false)
			.catch((error) => {
				if (worker.pendingSlices.length > 0) {
					worker.pendingSlices.forEach(x => x.reject(error)); // Make sure to propagate any errors
				} else {
					throw error; // So it doesn't get swallowed
				}
			});
	}

	/** Called by a worker when it has read some data. */
	supplyWorkerData(worker: ReadWorker, bytes: Uint8Array) {
		const start = worker.currentPos;
		const end = start + bytes.length;

		this.insertIntoCache({
			start,
			end,
			bytes,
			view: toDataView(bytes),
			age: this.nextAge++,
		});
		worker.currentPos += bytes.length;

		// Now, let's see if we can use the read bytes to fill any pending slice
		for (let i = 0; i < worker.pendingSlices.length; i++) {
			const pendingSlice = worker.pendingSlices[i]!;

			const clampedStart = Math.max(start, pendingSlice.start);
			const clampedEnd = Math.min(end, pendingSlice.start + pendingSlice.bytes.length);

			if (clampedStart < clampedEnd) {
				pendingSlice.bytes.set(
					bytes.subarray(clampedStart - start, clampedEnd - start),
					clampedStart - pendingSlice.start,
				);
			}

			for (let j = 0; j < pendingSlice.holes.length; j++) {
				// The hole is intentionally not modified here if the read section starts somewhere in the middle of
				// the hole. We don't need to do "hole splitting", since the workers are spawned *by* the holes,
				// meaning there's always a worker which will consume the hole left to right.
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
				// The slice has been fulfilled, everything has been read. Let's resolve the promise
				pendingSlice.resolve(pendingSlice.bytes);
				worker.pendingSlices.splice(i, 1);
				i--;
			}
		}
	}

	forgetWorker(worker: ReadWorker) {
		const index = this.workers.indexOf(worker);
		assert(index !== -1);

		this.workers.splice(index, 1);
	}

	insertIntoCache(entry: CacheEntry) {
		let insertionIndex = binarySearchLessOrEqual(this.cache, entry.start, x => x.start) + 1;

		if (insertionIndex > 0) {
			const previous = this.cache[insertionIndex - 1]!;
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

				this.currentCacheSize += entry.end - previous.end;
			} else {
				this.cache.splice(insertionIndex, 0, entry);
				this.currentCacheSize += entry.bytes.length;
			}
		} else {
			this.cache.splice(insertionIndex, 0, entry);
			this.currentCacheSize += entry.bytes.length;
		}

		for (let i = insertionIndex + 1; i < this.cache.length; i++) {
			const next = this.cache[i]!;
			if (entry.end <= next.start) {
				// Even if they touch, we don't wanna merge them, no need
				break;
			}

			if (entry.end >= next.end) {
				// The inserted entry completely swallows the next entry
				this.cache.splice(i, 1);
				this.currentCacheSize -= next.bytes.length;
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
			this.cache.splice(i, 1);

			this.currentCacheSize -= entry.end - next.start;

			break; // After the join case, we're done: the next entry cannot possibly overlap with the inserted one.
		}

		// LRU eviction of cache entries
		while (this.currentCacheSize > this.options.maxCacheSize && this.cache.length > 1) {
			let oldestIndex = 0;
			let oldestEntry = this.cache[0]!;

			for (let i = 1; i < this.cache.length; i++) {
				const entry = this.cache[i]!;

				if (entry.age < oldestEntry.age) {
					oldestIndex = i;
					oldestEntry = entry;
				}
			}

			this.cache.splice(oldestIndex, 1);
			this.currentCacheSize -= oldestEntry.bytes.length;
		}
	}
}
