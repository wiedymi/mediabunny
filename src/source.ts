/**
 * The source base class, representing a resource from which bytes can be read.
 * @public
 */
export abstract class Source {
	/** @internal */
	abstract _read(start: number, end: number): Promise<Uint8Array>;
	/** @internal */
	abstract _retrieveSize(): Promise<number>;

	/** @internal */
	_sizePromise: Promise<number> | null = null;

	/** @internal */
	_getSize() {
		return this._sizePromise ??= this._retrieveSize();
	}

	/** Called each time data is requested from the source. */
	onread: ((range: {
		/** The start byte offset (inclusive). */
		start: number;
		/** The end byte offset (exclusive). */
		end: number;
	}) => unknown) | null = null;
}

/**
 * A source backed by an ArrayBuffer or ArrayBufferView, with the entire file held in memory.
 * @public
 */
export class BufferSource extends Source {
	/** @internal */
	_bytes: Uint8Array;

	constructor(buffer: ArrayBuffer | Uint8Array) {
		if (!(buffer instanceof ArrayBuffer) && !(buffer instanceof Uint8Array)) {
			throw new TypeError('buffer must be an ArrayBuffer or Uint8Array.');
		}

		super();

		this._bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	}

	/** @internal */
	async _read(start: number, end: number) {
		return this._bytes.subarray(start, end);
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

/**
 * A source backed by a Blob. Since Files are also Blobs, this is the source to use when reading files off the disk.
 * @public
 */
export class BlobSource extends Source {
	/** @internal */
	_blob: Blob;

	constructor(blob: Blob) {
		if (!(blob instanceof Blob)) {
			throw new TypeError('blob must be a Blob.');
		}

		super();

		this._blob = blob;
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
 * A source backed by a URL. This is useful for reading data from the network. Be careful using this source however,
 * as it typically comes with increased latency.
 * @public
 */
export class UrlSource extends Source {
	/** @internal */
	private _url: string;
	/** @internal */
	private _withCredentials: boolean;
	/** @internal */
	private _fullData: ArrayBuffer | null = null;

	constructor(
		url: string,
		options: {
			/** If credentials are to be included in a cross-origin request. */
			withCredentials?: boolean;
		} = {},
	) {
		if (typeof url !== 'string') {
			throw new TypeError('url must be a string.');
		}
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (options.withCredentials !== undefined && typeof options.withCredentials !== 'boolean') {
			throw new TypeError('options.withCredentials, when specified, must be a boolean.');
		}

		super();

		this._url = url;
		this._withCredentials = options.withCredentials ?? false;
	}

	/** @internal */
	private _makeRequest(
		range?: { start: number; end: number },
	): Promise<{ response: ArrayBuffer; statusCode: number }> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest(); // We use XMLHttpRequest instead of fetch since it supports more protocols
			xhr.open('GET', this._url, true);
			xhr.responseType = 'arraybuffer';
			xhr.withCredentials = this._withCredentials;

			if (range) {
				xhr.setRequestHeader('Range', `bytes=${range.start}-${range.end - 1}`);
			}

			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					const buffer = xhr.response as ArrayBuffer;

					if (!range) {
						this._fullData = buffer;
					}

					resolve({
						response: buffer,
						statusCode: xhr.status,
					});
				} else {
					reject(new Error(`Error fetching ${this._url}: ${xhr.status} ${xhr.statusText}`));
				}
			};

			xhr.onerror = () => {
				reject(new Error('Network error occurred.'));
			};

			xhr.ontimeout = () => {
				reject(new Error('Request timed out.'));
			};

			xhr.send();
		});
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

		const xhr = new XMLHttpRequest();
		xhr.open('GET', this._url, true);
		xhr.responseType = 'arraybuffer';
		xhr.withCredentials = this._withCredentials;
		xhr.setRequestHeader('Range', 'bytes=0-0');

		await new Promise<void>((resolve, reject) => {
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve();
				} else {
					reject(new Error(`Error fetching ${this._url} (Range): ${xhr.status} ${xhr.statusText}`));
				}
			};

			xhr.onerror = () => {
				reject(new Error('Network error occurred.'));
			};

			xhr.send();
		});

		// Check for Content-Range header (e.g., "bytes 0-0/1234" where 1234 is the total size)
		const contentRange = xhr.getResponseHeader('Content-Range');
		if (contentRange) {
			const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
			if (match && match[1]) {
				return parseInt(match[1], 10);
			}
		}

		// If Content-Range is not available, check Content-Length
		const contentLength = xhr.getResponseHeader('Content-Length');
		if (contentLength) {
			return parseInt(contentLength, 10);
		}

		// If neither header is available, make a full GET request
		const { response } = await this._makeRequest();
		return response.byteLength;
	}
}
