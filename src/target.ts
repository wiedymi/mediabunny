import { BufferTargetWriter, ChunkedStreamTargetWriter, StreamTargetWriter, Writer } from './writer';
import { Output } from './output';

/** @public */
export abstract class Target {
	/** @internal */
	_output: Output | null = null;

	/** @internal */
	abstract _createWriter(): Writer;
}

/** @public */
export class BufferTarget extends Target {
	buffer: ArrayBuffer | null = null;

	/** @internal */
	_createWriter() {
		return new BufferTargetWriter(this);
	}
}

/** @public */
export type StreamTargetChunk = {
	type: 'write'; // This ensures automatic compatibility with FileSystemWritableFileStream
	data: Uint8Array;
	position: number;
};

/** @public */
export type StreamTargetOptions = {
	chunked?: boolean;
	chunkSize?: number;
};

/** @public */
export class StreamTarget extends Target {
	/** @internal */
	_writable: WritableStream<StreamTargetChunk>;
	/** @internal */
	_options: StreamTargetOptions;

	constructor(
		writable: WritableStream<StreamTargetChunk>,
		options: StreamTargetOptions = {},
	) {
		super();

		if (!(writable instanceof WritableStream)) {
			throw new TypeError('StreamTarget requires a WritableStream instance.');
		}
		if (options != null && typeof options !== 'object') {
			throw new TypeError('StreamTarget options, when provided, must be an object.');
		}
		if (options.chunked !== undefined && typeof options.chunked !== 'boolean') {
			throw new TypeError('options.chunked, when provided, must be a boolean.');
		}
		if (options.chunkSize !== undefined && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
			throw new TypeError('options.chunkSize, when provided, must be a positive integer.');
		}

		this._writable = writable;
		this._options = options;
	}

	/** @internal */
	_createWriter() {
		return this._options.chunked ? new ChunkedStreamTargetWriter(this) : new StreamTargetWriter(this);
	}
}
