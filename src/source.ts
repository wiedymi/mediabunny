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
