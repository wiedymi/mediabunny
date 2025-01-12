import { AUDIO_CODECS, MediaCodec, PCM_CODECS, SUBTITLE_CODECS, VIDEO_CODECS } from './codec';
import { IsobmffMuxer } from './isobmff/isobmff-muxer';
import { MatroskaMuxer } from './matroska/matroska-muxer';
import { Muxer } from './muxer';
import { Output } from './output';
import { WaveMuxer } from './wave/wave-muxer';

/** @public */
export abstract class OutputFormat {
	/** @internal */
	abstract _createMuxer(output: Output): Muxer;

	/** @internal */
	abstract _getName(): string;
	abstract getFileExtension(): string;
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
export type IsobmffOutputFormatOptions = {
	fastStart?: false | 'in-memory' | 'fragmented';
};

/** @public */
export abstract class IsobmffOutputFormat extends OutputFormat {
	/** @internal */
	_options: IsobmffOutputFormatOptions;

	constructor(options: IsobmffOutputFormatOptions = {}) {
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
	_createMuxer(output: Output) {
		return new IsobmffMuxer(output, this);
	}
}

/** @public */
export class Mp4OutputFormat extends IsobmffOutputFormat {
	/** @internal */
	_getName() {
		return 'MP4';
	}

	getFileExtension() {
		return '.mp4';
	}

	getSupportedCodecs() {
		return Mp4OutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return [
			'avc', 'hevc', 'vp8', 'vp9', 'av1',
			'aac', 'mp3', 'opus', 'vorbis', 'flac', // No PCM codecs
			'webvtt',
		];
	}

	/** @internal */
	override _codecUnsupportedHint(codec: MediaCodec) {
		if (MovOutputFormat.getSupportedCodecs().includes(codec)) {
			return ' Switching to MOV will grant support for this codec.';
		}

		return '';
	}
}

/** @public */
export class MovOutputFormat extends IsobmffOutputFormat {
	/** @internal */
	_getName() {
		return 'MOV';
	}

	getFileExtension() {
		return '.mov';
	}

	getSupportedCodecs() {
		return MovOutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return [
			'avc', 'hevc', 'vp8', 'vp9', 'av1',
			'aac', 'mp3', 'opus', 'vorbis', 'flac', ...PCM_CODECS,
		];
	}

	/** @internal */
	override _codecUnsupportedHint(codec: MediaCodec) {
		if (Mp4OutputFormat.getSupportedCodecs().includes(codec)) {
			return ' Switching to MP4 will grant support for this codec.';
		}

		return '';
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
	_createMuxer(output: Output) {
		return new MatroskaMuxer(output, this);
	}

	/** @internal */
	_getName() {
		return 'Matroska';
	}

	getFileExtension() {
		return '.mkv';
	}

	getSupportedCodecs() {
		return MkvOutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return [
			'avc', 'hevc', 'vp8', 'vp9', 'av1',
			'aac', 'mp3', 'opus', 'vorbis', 'flac',
			// pcm-s8, pcm-f32be, ulaw and alaw are not supported
			'pcm-u8', 'pcm-s16', 'pcm-s16be', 'pcm-s24', 'pcm-s24be', 'pcm-s32', 'pcm-s32be', 'pcm-f32',
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

	override getFileExtension() {
		return '.webm';
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
		}

		return '';
	}
}

/** @public */
export class WaveOutputFormat extends OutputFormat {
	/** @internal */
	_createMuxer(output: Output) {
		return new WaveMuxer(output);
	}

	/** @internal */
	_getName() {
		return 'WAVE';
	}

	getFileExtension() {
		return '.wav';
	}

	getSupportedCodecs() {
		return WaveOutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return [
			'pcm-u8', 'pcm-s16', 'pcm-s24', 'pcm-s32', 'pcm-f32', 'ulaw', 'alaw',
		];
	}
}
