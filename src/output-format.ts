import { AUDIO_CODECS, MediaCodec, SUBTITLE_CODECS, VIDEO_CODECS } from './codec';
import { IsobmffMuxer } from './isobmff/isobmff-muxer';
import { MatroskaMuxer } from './matroska/matroska-muxer';
import { Muxer } from './muxer';
import { Output } from './output';

/** @public */
export abstract class OutputFormat {
	/** @internal */
	abstract _createMuxer(output: Output): Muxer;

	/** @internal */
	abstract _getName(): string;
	abstract getSupportedCodecs(): MediaCodec[];

	getSupportedVideoCodecs() {
		return this.getSupportedCodecs().filter(codec => (VIDEO_CODECS as readonly string[]).includes(codec));
	}

	getSupportedAudioCodecs() {
		return this.getSupportedCodecs().filter(codec => (AUDIO_CODECS as readonly string[]).includes(codec));
	}

	getSupportedSubtitleCodecs() {
		return this.getSupportedCodecs().filter(codec => (SUBTITLE_CODECS as readonly string[]).includes(codec));
	}

	/** @internal */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_codecUnsupportedHint(codec: MediaCodec) {
		return '';
	}
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

	/** @internal */
	_getName() {
		return 'MP4';
	}

	getSupportedCodecs() {
		return Mp4OutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return [
			'avc', 'hevc', 'vp8', 'vp9', 'av1',
			'aac', 'opus',
			'webvtt',
		];
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

	/** @internal */
	_getName() {
		return 'Matroska';
	}

	getSupportedCodecs() {
		return MkvOutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return [
			'avc', 'hevc', 'vp8', 'vp9', 'av1',
			'aac', 'opus', 'vorbis',
			'webvtt',
		];
	}
}

/** @public */
export type WebMOutputFormatOptions = MkvOutputFormatOptions;

/** @public */
export class WebMOutputFormat extends MkvOutputFormat {
	override getSupportedCodecs() {
		return WebMOutputFormat.getSupportedCodecs();
	}

	/** @internal */
	override _getName() {
		return 'WebM';
	}

	static override getSupportedCodecs(): MediaCodec[] {
		return [
			'vp8', 'vp9', 'av1',
			'opus', 'vorbis',
			'webvtt',
		];
	}

	/** @internal */
	override _codecUnsupportedHint(codec: MediaCodec) {
		if (MkvOutputFormat.getSupportedCodecs().includes(codec)) {
			return ' Switching to MKV will grant support for this codec.';
		} else {
			return '';
		}
	}
}
