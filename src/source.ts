/** @public */
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
}

/** @public */
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
	override async _read(start: number, end: number) {
		return this._bytes.subarray(start, end);
	}

	/** @internal */
	override async _retrieveSize() {
		return this._bytes.byteLength;
	}
}

/** @public */
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
	override async _read(start: number, end: number) {
		const slice = this._blob.slice(start, end);
		const buffer = await slice.arrayBuffer();
		return new Uint8Array(buffer);
	}

	/** @internal */
	override async _retrieveSize() {
		return this._blob.size;
	}
}

/** @public */
export class UrlSource extends Source {
	/** @internal */
	private _url: string;
	/** @internal */
	private _withCredentials: boolean;
	/** @internal */
	private _fullData: ArrayBuffer | null = null;

	constructor(url: string, options: { withCredentials?: boolean } = {}) {
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
	override async _read(start: number, end: number): Promise<Uint8Array> {
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
	override async _retrieveSize(): Promise<number> {
		if (this._fullData) {
			return this._fullData.byteLength;
		}

		const xhr = new XMLHttpRequest();
		xhr.open('HEAD', this._url, true);
		xhr.withCredentials = this._withCredentials;

		await new Promise<void>((resolve, reject) => {
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve();
				} else {
					reject(new Error(`Error fetching ${this._url} (HEAD): ${xhr.status} ${xhr.statusText}`));
				}
			};

			xhr.onerror = () => {
				resolve();
			};

			xhr.send();
		});

		const contentLength = xhr.getResponseHeader('Content-Length');
		if (!contentLength) {
			// If Content-Length is not available, make a GET request to get the full size
			const { response } = await this._makeRequest();
			return response.byteLength;
		}

		return parseInt(contentLength, 10);
	}
}
