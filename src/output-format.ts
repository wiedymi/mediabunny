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

/**
 * Specifies an inclusive range of integers.
 * @public
 */
export type InclusiveIntegerRange = {
	/** The integer cannot be less than this. */
	min: number;
	/** The integer cannot be greater than this. */
	max: number;
};

/**
 * Specifies the number of tracks (for each track type and in total) that an output format supports.
 * @public
 */
export type TrackCountLimits = {
	[K in TrackType]: InclusiveIntegerRange;
} & {
	/** Specifies the overall allowed range of track counts for the output format. */
	total: InclusiveIntegerRange;
};

/**
 * Base class representing an output media file format.
 * @public
 */
export abstract class OutputFormat {
	/** @internal */
	abstract _createMuxer(output: Output): Muxer;
	/** @internal */
	abstract get _name(): string;

	/** The file extension used by this output format, beginning with a dot. */
	abstract get fileExtension(): string;
	/** Returns a list of media codecs that this output format can contain. */
	abstract getSupportedCodecs(): MediaCodec[];
	/** Returns the number of tracks that this output format supports. */
	abstract getSupportedTrackCounts(): TrackCountLimits;
	/** Whether this output format supports video rotation metadata. */
	abstract get supportsVideoRotationMetadata(): boolean;

	/** Returns a list of video codecs that this output format can contain. */
	getSupportedVideoCodecs() {
		return this.getSupportedCodecs()
			.filter(codec => (VIDEO_CODECS as readonly string[]).includes(codec)) as VideoCodec[];
	}

	/** Returns a list of audio codecs that this output format can contain. */
	getSupportedAudioCodecs() {
		return this.getSupportedCodecs()
			.filter(codec => (AUDIO_CODECS as readonly string[]).includes(codec)) as AudioCodec[];
	}

	/** Returns a list of subtitle codecs that this output format can contain. */
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

/**
 * Options controlling the format of an output ISOBMFF file.
 * @public
 */
export type IsobmffOutputFormatOptions = {
	/**
	 * Controls the placement of metadata in the file. Placing metadata at the start of the file is known as "Fast
	 * Start", which results in better playback at the cost of more required processing or memory.
	 *
	 * Use `false` to disable Fast Start, placing the metadata at the end of the file. Fastest and uses the least
	 * memory.
	 *
	 * Use `'in-memory'` to produce a file with Fast Start by keeping all media chunks in memory until the file is
	 * finalized. This produces a high-quality and compact output at the cost of a more expensive finalization step and
	 * higher memory requirements. Data will be written monotonically (in order) when this option is set.
	 *
	 * Use `'fragmented'` to place metadata at the start of the file by creating a fragmented file. In a
	 * fragmented file, chunks of media and their metadata are written to the file in "fragments", eliminating the need
	 * to put all metadata in one place. Fragmented files are useful for streaming, as they allow for better random
	 * access. Furthermore, they remain lightweight to create even for very large files, as they don't require all media
	 * to be kept in memory. However, fragmented files are not as widely and wholly supported as regular MP4/MOV files.
	 * Data will be written monotonically (in order) when this option is set.
	 *
	 * When this field is not defined, either `false` or `'in-memory'` will be used, automatically determined based on
	 * the type of output target used.
	 */
	fastStart?: false | 'in-memory' | 'fragmented';
};

/**
 * Format representing files compatible with the ISO base media file format (ISOBMFF), like MP4 or MOV files.
 * @public
 */
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

	get supportsVideoRotationMetadata() {
		return true;
	}

	/** @internal */
	_createMuxer(output: Output) {
		return new IsobmffMuxer(output, this);
	}
}

/**
 * MPEG-4 Part 14 (MP4) file format. Supports all codecs except PCM audio codecs.
 * @public
 */
export class Mp4OutputFormat extends IsobmffOutputFormat {
	/** @internal */
	get _name() {
		return 'MP4';
	}

	get fileExtension() {
		return '.mp4';
	}

	getSupportedCodecs(): MediaCodec[] {
		return [
			...VIDEO_CODECS,
			...NON_PCM_AUDIO_CODECS,
			...SUBTITLE_CODECS,
		];
	}

	/** @internal */
	override _codecUnsupportedHint(codec: MediaCodec) {
		if (new MovOutputFormat().getSupportedCodecs().includes(codec)) {
			return ' Switching to MOV will grant support for this codec.';
		}

		return '';
	}
}

/**
 * QuickTime File Format (QTFF), often called MOV. Supports all video and audio codecs, but not subtitle codecs.
 * @public
 */
export class MovOutputFormat extends IsobmffOutputFormat {
	/** @internal */
	get _name() {
		return 'MOV';
	}

	get fileExtension() {
		return '.mov';
	}

	getSupportedCodecs(): MediaCodec[] {
		return [
			...VIDEO_CODECS,
			...AUDIO_CODECS,
		];
	}

	/** @internal */
	override _codecUnsupportedHint(codec: MediaCodec) {
		if (new Mp4OutputFormat().getSupportedCodecs().includes(codec)) {
			return ' Switching to MP4 will grant support for this codec.';
		}

		return '';
	}
}

/**
 * Options controlling the format of an output Matroska file.
 * @public
 */
export type MkvOutputFormatOptions = {
	/**
	 * Configures the output to only write data monotonically, useful for live-streaming the file as it's being muxed.
	 * When enabled, some features such as storing duration and seeking will be disabled or impacted, so don't use this
	 * option when you want to write out a file for later use.
	 */
	streamable?: boolean;
};

/**
 * Matroska file format.
 * @public
 */
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
	get _name() {
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

	get fileExtension() {
		return '.mkv';
	}

	getSupportedCodecs(): MediaCodec[] {
		return [
			...VIDEO_CODECS,
			...NON_PCM_AUDIO_CODECS,
			...PCM_AUDIO_CODECS.filter(codec => !['pcm-s8', 'pcm-f32be', 'ulaw', 'alaw'].includes(codec)),
			...SUBTITLE_CODECS,
		];
	}

	get supportsVideoRotationMetadata() {
		// While it technically does support it with ProjectionPoseRoll, many players appear to ignore this value
		return false;
	}
}

/**
 * Options controlling the format of an output WebM file.
 * @public
 */
export type WebMOutputFormatOptions = MkvOutputFormatOptions;

/**
 * WebM file format, based on Matroska.
 * @public
 */
export class WebMOutputFormat extends MkvOutputFormat {
	override getSupportedCodecs(): MediaCodec[] {
		return [
			...VIDEO_CODECS.filter(codec => ['vp8', 'vp9', 'av1'].includes(codec)),
			...AUDIO_CODECS.filter(codec => ['opus', 'vorbis'].includes(codec)),
			...SUBTITLE_CODECS,
		];
	}

	/** @internal */
	override get _name() {
		return 'WebM';
	}

	override get fileExtension() {
		return '.webm';
	}

	/** @internal */
	override _codecUnsupportedHint(codec: MediaCodec) {
		if (new MkvOutputFormat().getSupportedCodecs().includes(codec)) {
			return ' Switching to MKV will grant support for this codec.';
		}

		return '';
	}
}

/**
 * MP3 file format.
 * @public
 */
export class Mp3OutputFormat extends OutputFormat {
	/** @internal */
	_createMuxer(output: Output) {
		return new Mp3Muxer(output);
	}

	/** @internal */
	get _name() {
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

	get fileExtension() {
		return '.mp3';
	}

	getSupportedCodecs(): MediaCodec[] {
		return ['mp3'];
	}

	get supportsVideoRotationMetadata() {
		return false;
	}
}

/**
 * WAVE file format, based on RIFF.
 * @public
 */
export class WaveOutputFormat extends OutputFormat {
	/** @internal */
	_createMuxer(output: Output) {
		return new WaveMuxer(output);
	}

	/** @internal */
	get _name() {
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

	get fileExtension() {
		return '.wav';
	}

	getSupportedCodecs(): MediaCodec[] {
		return [
			...PCM_AUDIO_CODECS.filter(codec =>
				['pcm-s16', 'pcm-s24', 'pcm-s32', 'pcm-f32', 'pcm-u8', 'ulaw', 'alaw'].includes(codec),
			),
		];
	}

	get supportsVideoRotationMetadata() {
		return false;
	}
}

/**
 * Ogg file format.
 * @public
 */
export class OggOutputFormat extends OutputFormat {
	/** @internal */
	_createMuxer(output: Output) {
		return new OggMuxer(output);
	}

	/** @internal */
	get _name() {
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

	get fileExtension() {
		return '.ogg';
	}

	getSupportedCodecs(): MediaCodec[] {
		return [
			...AUDIO_CODECS.filter(codec => ['vorbis', 'opus'].includes(codec)),
		];
	}

	get supportsVideoRotationMetadata() {
		return false;
	}
}
