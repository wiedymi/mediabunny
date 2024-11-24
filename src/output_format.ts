import { IsobmffMuxer } from "./isobmff/isobmff_muxer";
import { MatroskaMuxer } from "./matroska/matroska_muxer";
import { Muxer } from "./muxer";
import { Output } from "./output";

export abstract class OutputFormat {
	abstract createMuxer(output: Output): Muxer;
}

export class Mp4OutputFormat extends OutputFormat {
	constructor(public options: {
		fastStart?: false | 'in-memory' | 'fragmented',
	} = {}) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (options.fastStart !== undefined && ![false, 'in-memory', 'fragmented'].includes(options.fastStart)) {
			throw new TypeError('options.fastStart, when provided, must be false, "in-memory", or "fragmented".');
		}

		super();
	}

	override createMuxer(output: Output) {
		return new IsobmffMuxer(output, this);
	}
}

export class MkvOutputFormat extends OutputFormat {
	constructor(public options: {
		streamable?: boolean
	} = {}) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (options.streamable !== undefined && typeof options.streamable !== 'boolean') {
			throw new TypeError('options.streamable, when provided, must be a boolean.');
		}

		super();
	}

	override createMuxer(output: Output) {
		return new MatroskaMuxer(output, this);
	}
}

export class WebMOutputFormat extends MkvOutputFormat {}