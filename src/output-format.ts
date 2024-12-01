import { IsobmffMuxer } from './isobmff/isobmff-muxer';
import { MatroskaMuxer } from './matroska/matroska-muxer';
import { Muxer } from './muxer';
import { Output } from './output';

/** @public */
export abstract class OutputFormat {
	/** @internal */
	abstract _createMuxer(output: Output): Muxer;
}

/** @public */
export type Mp4OutputFormatOptions = {
	fastStart?: false | 'in-memory' | 'fragmented';
};

/** @public */
export class Mp4OutputFormat extends OutputFormat {
	/** @internal */
	_options: Mp4OutputFormatOptions;

	constructor(options: Mp4OutputFormatOptions = {}) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (options.fastStart !== undefined && ![false, 'in-memory', 'fragmented'].includes(options.fastStart)) {
			throw new TypeError('options.fastStart, when provided, must be false, "in-memory", or "fragmented".');
		}

		super();

		this._options = options;
	}

	/** @internal */
	override _createMuxer(output: Output) {
		return new IsobmffMuxer(output, this);
	}
}

/** @public */
export type MkvOutputFormatOptions = {
	streamable?: boolean;
};

/** @public */
export class MkvOutputFormat extends OutputFormat {
	/** @internal */
	_options: MkvOutputFormatOptions;

	constructor(options: MkvOutputFormatOptions = {}) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (options.streamable !== undefined && typeof options.streamable !== 'boolean') {
			throw new TypeError('options.streamable, when provided, must be a boolean.');
		}

		super();

		this._options = options;
	}

	/** @internal */
	override _createMuxer(output: Output) {
		return new MatroskaMuxer(output, this);
	}
}

/** @public */
export type WebMOutputFormatOptions = MkvOutputFormatOptions;

/** @public */
export class WebMOutputFormat extends MkvOutputFormat {}
