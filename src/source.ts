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

export class ArrayBufferSource extends Source {
	constructor(private buffer: ArrayBuffer) {
		super();
	}

	/** @internal */
	override async _read(start: number, end: number) {
		return new Uint8Array(this.buffer, start, end - start);
	}

	/** @internal */
	override async _retrieveSize() {
		return this.buffer.byteLength;
	}
}

export class BlobSource extends Source {
	constructor(private blob: Blob) {
		super();
	}

	/** @internal */
	override async _read(start: number, end: number) {
		const slice = this.blob.slice(start, end);
		const buffer = await slice.arrayBuffer();
		return new Uint8Array(buffer);
	}

	/** @internal */
	override async _retrieveSize() {
		return this.blob.size;
	}
}
