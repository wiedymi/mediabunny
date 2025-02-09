import {
	AUDIO_CODECS,
	AudioCodec,
	MediaCodec,
	NON_PCM_AUDIO_CODECS,
	PCM_AUDIO_CODECS,
	SUBTITLE_CODECS,
	SubtitleCodec,
	VIDEO_CODECS,
	VideoCodec,
} from './codec';
import { IsobmffMuxer } from './isobmff/isobmff-muxer';
import { MatroskaMuxer } from './matroska/matroska-muxer';
import { Mp3Muxer } from './mp3/mp3-muxer';
import { Muxer } from './muxer';
import { OggMuxer } from './ogg/ogg-muxer';
import { Output, TrackType } from './output';
import { WaveMuxer } from './wave/wave-muxer';

/** @public */
export type InclusiveRange = { min: number; max: number };
/** @public */
export type TrackCountLimits = {
	[K in TrackType]: InclusiveRange;
} & {
	total: InclusiveRange;
};

/** @public */
export abstract class OutputFormat {
	/** @internal */
	abstract _createMuxer(output: Output): Muxer;
	/** @internal */
	abstract _getName(): string;

	abstract getFileExtension(): string;
	abstract getSupportedCodecs(): MediaCodec[];
	abstract getSupportedTrackCounts(): TrackCountLimits;

	getSupportedVideoCodecs() {
		return this.getSupportedCodecs()
			.filter(codec => (VIDEO_CODECS as readonly string[]).includes(codec)) as VideoCodec[];
	}

	getSupportedAudioCodecs() {
		return this.getSupportedCodecs()
			.filter(codec => (AUDIO_CODECS as readonly string[]).includes(codec)) as AudioCodec[];
	}

	getSupportedSubtitleCodecs() {
		return this.getSupportedCodecs()
			.filter(codec => (SUBTITLE_CODECS as readonly string[]).includes(codec)) as SubtitleCodec[];
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

	getSupportedTrackCounts(): TrackCountLimits {
		return {
			video: { min: 0, max: Infinity },
			audio: { min: 0, max: Infinity },
			subtitle: { min: 0, max: Infinity },
			total: { min: 1, max: 2 ** 32 - 1 }, // Have fun reaching this one
		};
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
			...VIDEO_CODECS,
			...NON_PCM_AUDIO_CODECS,
			...SUBTITLE_CODECS,
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
			...VIDEO_CODECS,
			...AUDIO_CODECS,
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

	getSupportedTrackCounts(): TrackCountLimits {
		return {
			video: { min: 0, max: Infinity },
			audio: { min: 0, max: Infinity },
			subtitle: { min: 0, max: Infinity },
			total: { min: 1, max: 127 },
		};
	}

	getFileExtension() {
		return '.mkv';
	}

	getSupportedCodecs() {
		return MkvOutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return [
			...VIDEO_CODECS,
			...NON_PCM_AUDIO_CODECS,
			...PCM_AUDIO_CODECS.filter(codec => !['pcm-s8', 'pcm-f32be', 'ulaw', 'alaw'].includes(codec)),
			...SUBTITLE_CODECS,
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
			...VIDEO_CODECS.filter(codec => ['vp8', 'vp9', 'av1'].includes(codec)),
			...AUDIO_CODECS.filter(codec => ['opus', 'vorbis'].includes(codec)),
			...SUBTITLE_CODECS,
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
export class Mp3OutputFormat extends OutputFormat {
	/** @internal */
	_createMuxer(output: Output) {
		return new Mp3Muxer(output);
	}

	/** @internal */
	_getName() {
		return 'MP3';
	}

	getSupportedTrackCounts(): TrackCountLimits {
		return {
			video: { min: 0, max: 0 },
			audio: { min: 1, max: 1 },
			subtitle: { min: 0, max: 0 },
			total: { min: 1, max: 1 },
		};
	}

	getFileExtension() {
		return '.mp3';
	}

	getSupportedCodecs() {
		return Mp3OutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return ['mp3'];
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

	getSupportedTrackCounts(): TrackCountLimits {
		return {
			video: { min: 0, max: 0 },
			audio: { min: 1, max: 1 },
			subtitle: { min: 0, max: 0 },
			total: { min: 1, max: 1 },
		};
	}

	getFileExtension() {
		return '.wav';
	}

	getSupportedCodecs() {
		return WaveOutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return [
			...PCM_AUDIO_CODECS.filter(codec =>
				['pcm-s16', 'pcm-s24', 'pcm-s32', 'pcm-f32', 'pcm-u8', 'ulaw', 'alaw'].includes(codec),
			),
		];
	}
}

/** @public */
export class OggOutputFormat extends OutputFormat {
	/** @internal */
	_createMuxer(output: Output) {
		return new OggMuxer(output);
	}

	/** @internal */
	_getName() {
		return 'Ogg';
	}

	getSupportedTrackCounts(): TrackCountLimits {
		return {
			video: { min: 0, max: 0 },
			audio: { min: 0, max: Infinity },
			subtitle: { min: 0, max: 0 },
			total: { min: 1, max: 2 ** 32 },
		};
	}

	getFileExtension() {
		return '.ogg';
	}

	getSupportedCodecs() {
		return OggOutputFormat.getSupportedCodecs();
	}

	static getSupportedCodecs(): MediaCodec[] {
		return [
			...AUDIO_CODECS.filter(codec => ['vorbis', 'opus'].includes(codec)),
		];
	}
}
