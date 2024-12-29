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
export class ArrayBufferSource extends Source {
	/** @internal */
	_buffer: ArrayBuffer;

	constructor(buffer: ArrayBuffer) {
		super();

		this._buffer = buffer;
	}

	/** @internal */
	override async _read(start: number, end: number) {
		return new Uint8Array(this._buffer, start, end - start);
	}

	/** @internal */
	override async _retrieveSize() {
		return this._buffer.byteLength;
	}
}

/** @public */
export class BlobSource extends Source {
	/** @internal */
	_blob: Blob;

	constructor(blob: Blob) {
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
