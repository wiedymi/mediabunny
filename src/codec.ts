import {
	COLOR_PRIMARIES_MAP,
	MATRIX_COEFFICIENTS_MAP,
	TRANSFER_CHARACTERISTICS_MAP,
	bytesToHexString,
	isAllowSharedBufferSource,
	last,
	reverseBitsU32,
} from './misc';
import { SubtitleMetadata } from './subtitles';

/** @public */
export const VIDEO_CODECS = ['avc', 'hevc', 'vp8', 'vp9', 'av1'] as const;
/** @public */
export const AUDIO_CODECS = ['aac', 'opus'] as const; // TODO add the rest
/** @public */
export const SUBTITLE_CODECS = ['webvtt'] as const; // TODO add the rest

/** @public */
export type VideoCodec = typeof VIDEO_CODECS[number];
/** @public */
export type AudioCodec = typeof AUDIO_CODECS[number];
/** @public */
export type SubtitleCodec = typeof SUBTITLE_CODECS[number];
/** @public */
export type MediaCodec = VideoCodec | AudioCodec | SubtitleCodec;

// https://en.wikipedia.org/wiki/Advanced_Video_Coding
const AVC_LEVEL_TABLE = [
	{ maxMacroblocks: 99, maxBitrate: 64000, level: 0x0A }, // Level 1
	{ maxMacroblocks: 396, maxBitrate: 192000, level: 0x0B }, // Level 1.1
	{ maxMacroblocks: 396, maxBitrate: 384000, level: 0x0C }, // Level 1.2
	{ maxMacroblocks: 396, maxBitrate: 768000, level: 0x0D }, // Level 1.3
	{ maxMacroblocks: 396, maxBitrate: 2000000, level: 0x14 }, // Level 2
	{ maxMacroblocks: 792, maxBitrate: 4000000, level: 0x15 }, // Level 2.1
	{ maxMacroblocks: 1620, maxBitrate: 4000000, level: 0x16 }, // Level 2.2
	{ maxMacroblocks: 1620, maxBitrate: 10000000, level: 0x1E }, // Level 3
	{ maxMacroblocks: 3600, maxBitrate: 14000000, level: 0x1F }, // Level 3.1
	{ maxMacroblocks: 5120, maxBitrate: 20000000, level: 0x20 }, // Level 3.2
	{ maxMacroblocks: 8192, maxBitrate: 20000000, level: 0x28 }, // Level 4
	{ maxMacroblocks: 8192, maxBitrate: 50000000, level: 0x29 }, // Level 4.1
	{ maxMacroblocks: 8704, maxBitrate: 50000000, level: 0x2A }, // Level 4.2
	{ maxMacroblocks: 22080, maxBitrate: 135000000, level: 0x32 }, // Level 5
	{ maxMacroblocks: 36864, maxBitrate: 240000000, level: 0x33 }, // Level 5.1
	{ maxMacroblocks: 36864, maxBitrate: 240000000, level: 0x34 }, // Level 5.2
	{ maxMacroblocks: 139264, maxBitrate: 240000000, level: 0x3C }, // Level 6
	{ maxMacroblocks: 139264, maxBitrate: 480000000, level: 0x3D }, // Level 6.1
	{ maxMacroblocks: 139264, maxBitrate: 800000000, level: 0x3E }, // Level 6.2
];

// https://en.wikipedia.org/wiki/High_Efficiency_Video_Coding
const HEVC_LEVEL_TABLE = [
	{ maxPictureSize: 36864, maxBitrate: 128000, tier: 'L', level: 30 }, // Level 1 (Low Tier)
	{ maxPictureSize: 122880, maxBitrate: 1500000, tier: 'L', level: 60 }, // Level 2 (Low Tier)
	{ maxPictureSize: 245760, maxBitrate: 3000000, tier: 'L', level: 63 }, // Level 2.1 (Low Tier)
	{ maxPictureSize: 552960, maxBitrate: 6000000, tier: 'L', level: 90 }, // Level 3 (Low Tier)
	{ maxPictureSize: 983040, maxBitrate: 10000000, tier: 'L', level: 93 }, // Level 3.1 (Low Tier)
	{ maxPictureSize: 2228224, maxBitrate: 12000000, tier: 'L', level: 120 }, // Level 4 (Low Tier)
	{ maxPictureSize: 2228224, maxBitrate: 30000000, tier: 'H', level: 120 }, // Level 4 (High Tier)
	{ maxPictureSize: 2228224, maxBitrate: 20000000, tier: 'L', level: 123 }, // Level 4.1 (Low Tier)
	{ maxPictureSize: 2228224, maxBitrate: 50000000, tier: 'H', level: 123 }, // Level 4.1 (High Tier)
	{ maxPictureSize: 8912896, maxBitrate: 25000000, tier: 'L', level: 150 }, // Level 5 (Low Tier)
	{ maxPictureSize: 8912896, maxBitrate: 100000000, tier: 'H', level: 150 }, // Level 5 (High Tier)
	{ maxPictureSize: 8912896, maxBitrate: 40000000, tier: 'L', level: 153 }, // Level 5.1 (Low Tier)
	{ maxPictureSize: 8912896, maxBitrate: 160000000, tier: 'H', level: 153 }, // Level 5.1 (High Tier)
	{ maxPictureSize: 8912896, maxBitrate: 60000000, tier: 'L', level: 156 }, // Level 5.2 (Low Tier)
	{ maxPictureSize: 8912896, maxBitrate: 240000000, tier: 'H', level: 156 }, // Level 5.2 (High Tier)
	{ maxPictureSize: 35651584, maxBitrate: 60000000, tier: 'L', level: 180 }, // Level 6 (Low Tier)
	{ maxPictureSize: 35651584, maxBitrate: 240000000, tier: 'H', level: 180 }, // Level 6 (High Tier)
	{ maxPictureSize: 35651584, maxBitrate: 120000000, tier: 'L', level: 183 }, // Level 6.1 (Low Tier)
	{ maxPictureSize: 35651584, maxBitrate: 480000000, tier: 'H', level: 183 }, // Level 6.1 (High Tier)
	{ maxPictureSize: 35651584, maxBitrate: 240000000, tier: 'L', level: 186 }, // Level 6.2 (Low Tier)
	{ maxPictureSize: 35651584, maxBitrate: 800000000, tier: 'H', level: 186 }, // Level 6.2 (High Tier)
];

// https://en.wikipedia.org/wiki/VP9
const VP9_LEVEL_TABLE = [
	{ maxPictureSize: 36864, maxBitrate: 200000, level: 10 }, // Level 1
	{ maxPictureSize: 73728, maxBitrate: 800000, level: 11 }, // Level 1.1
	{ maxPictureSize: 122880, maxBitrate: 1800000, level: 20 }, // Level 2
	{ maxPictureSize: 245760, maxBitrate: 3600000, level: 21 }, // Level 2.1
	{ maxPictureSize: 552960, maxBitrate: 7200000, level: 30 }, // Level 3
	{ maxPictureSize: 983040, maxBitrate: 12000000, level: 31 }, // Level 3.1
	{ maxPictureSize: 2228224, maxBitrate: 18000000, level: 40 }, // Level 4
	{ maxPictureSize: 2228224, maxBitrate: 30000000, level: 41 }, // Level 4.1
	{ maxPictureSize: 8912896, maxBitrate: 60000000, level: 50 }, // Level 5
	{ maxPictureSize: 8912896, maxBitrate: 120000000, level: 51 }, // Level 5.1
	{ maxPictureSize: 8912896, maxBitrate: 180000000, level: 52 }, // Level 5.2
	{ maxPictureSize: 35651584, maxBitrate: 180000000, level: 60 }, // Level 6
	{ maxPictureSize: 35651584, maxBitrate: 240000000, level: 61 }, // Level 6.1
	{ maxPictureSize: 35651584, maxBitrate: 480000000, level: 62 }, // Level 6.2
];

// https://en.wikipedia.org/wiki/AV1
const AV1_LEVEL_TABLE = [
	{ maxPictureSize: 147456, maxBitrate: 1500000, tier: 'M', level: 0 }, // Level 2.0 (Main Tier)
	{ maxPictureSize: 278784, maxBitrate: 3000000, tier: 'M', level: 1 }, // Level 2.1 (Main Tier)
	{ maxPictureSize: 665856, maxBitrate: 6000000, tier: 'M', level: 4 }, // Level 3.0 (Main Tier)
	{ maxPictureSize: 1065024, maxBitrate: 10000000, tier: 'M', level: 5 }, // Level 3.1 (Main Tier)
	{ maxPictureSize: 2359296, maxBitrate: 12000000, tier: 'M', level: 8 }, // Level 4.0 (Main Tier)
	{ maxPictureSize: 2359296, maxBitrate: 30000000, tier: 'H', level: 8 }, // Level 4.0 (High Tier)
	{ maxPictureSize: 2359296, maxBitrate: 20000000, tier: 'M', level: 9 }, // Level 4.1 (Main Tier)
	{ maxPictureSize: 2359296, maxBitrate: 50000000, tier: 'H', level: 9 }, // Level 4.1 (High Tier)
	{ maxPictureSize: 8912896, maxBitrate: 30000000, tier: 'M', level: 12 }, // Level 5.0 (Main Tier)
	{ maxPictureSize: 8912896, maxBitrate: 100000000, tier: 'H', level: 12 }, // Level 5.0 (High Tier)
	{ maxPictureSize: 8912896, maxBitrate: 40000000, tier: 'M', level: 13 }, // Level 5.1 (Main Tier)
	{ maxPictureSize: 8912896, maxBitrate: 160000000, tier: 'H', level: 13 }, // Level 5.1 (High Tier)
	{ maxPictureSize: 8912896, maxBitrate: 60000000, tier: 'M', level: 14 }, // Level 5.2 (Main Tier)
	{ maxPictureSize: 8912896, maxBitrate: 240000000, tier: 'H', level: 14 }, // Level 5.2 (High Tier)
	{ maxPictureSize: 35651584, maxBitrate: 60000000, tier: 'M', level: 15 }, // Level 5.3 (Main Tier)
	{ maxPictureSize: 35651584, maxBitrate: 240000000, tier: 'H', level: 15 }, // Level 5.3 (High Tier)
	{ maxPictureSize: 35651584, maxBitrate: 60000000, tier: 'M', level: 16 }, // Level 6.0 (Main Tier)
	{ maxPictureSize: 35651584, maxBitrate: 240000000, tier: 'H', level: 16 }, // Level 6.0 (High Tier)
	{ maxPictureSize: 35651584, maxBitrate: 100000000, tier: 'M', level: 17 }, // Level 6.1 (Main Tier)
	{ maxPictureSize: 35651584, maxBitrate: 480000000, tier: 'H', level: 17 }, // Level 6.1 (High Tier)
	{ maxPictureSize: 35651584, maxBitrate: 160000000, tier: 'M', level: 18 }, // Level 6.2 (Main Tier)
	{ maxPictureSize: 35651584, maxBitrate: 800000000, tier: 'H', level: 18 }, // Level 6.2 (High Tier)
	{ maxPictureSize: 35651584, maxBitrate: 160000000, tier: 'M', level: 19 }, // Level 6.3 (Main Tier)
	{ maxPictureSize: 35651584, maxBitrate: 800000000, tier: 'H', level: 19 }, // Level 6.3 (High Tier)
];

export const buildVideoCodecString = (codec: VideoCodec, width: number, height: number, bitrate: number) => {
	if (codec === 'avc') {
		const profileIndication = 0x64; // High Profile
		const totalMacroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);

		// Determine the level based on the table
		const levelInfo = AVC_LEVEL_TABLE.find(
			level => totalMacroblocks <= level.maxMacroblocks && bitrate <= level.maxBitrate,
		) ?? last(AVC_LEVEL_TABLE)!;
		const levelIndication = levelInfo ? levelInfo.level : 0;

		const hexProfileIndication = profileIndication.toString(16).padStart(2, '0');
		const hexProfileCompatibility = '00';
		const hexLevelIndication = levelIndication.toString(16).padStart(2, '0');

		return `avc1.${hexProfileIndication}${hexProfileCompatibility}${hexLevelIndication}`;
	} else if (codec === 'hevc') {
		const profilePrefix = ''; // Profile space 0
		const profileIdc = 1; // Main Profile

		const compatibilityFlags = '6'; // Taken from the example in ISO 14496-15

		const pictureSize = width * height;
		const levelInfo = HEVC_LEVEL_TABLE.find(
			level => pictureSize <= level.maxPictureSize && bitrate <= level.maxBitrate,
		) ?? last(HEVC_LEVEL_TABLE)!;

		const constraintFlags = 'B0'; // Progressive source flag

		return 'hev1.'
			+ `${profilePrefix}${profileIdc}.`
			+ `${compatibilityFlags}.`
			+ `${levelInfo.tier}${levelInfo.level}.`
			+ `${constraintFlags}`;
	} else if (codec === 'vp8') {
		return 'vp8'; // Easy, this one
	} else if (codec === 'vp9') {
		const profile = '00'; // Profile 0

		const pictureSize = width * height;
		const levelInfo = VP9_LEVEL_TABLE.find(
			level => pictureSize <= level.maxPictureSize && bitrate <= level.maxBitrate,
		) ?? last(VP9_LEVEL_TABLE)!;

		const bitDepth = '08'; // 8-bit

		return `vp09.${profile}.${levelInfo.level}.${bitDepth}`;
	} else if (codec === 'av1') {
		const profile = 0; // Main Profile

		const pictureSize = width * height;
		const levelInfo = AV1_LEVEL_TABLE.find(
			level => pictureSize <= level.maxPictureSize && bitrate <= level.maxBitrate,
		) ?? last(AV1_LEVEL_TABLE)!;

		const bitDepth = '08'; // 8-bit

		return `av01.${profile}.${levelInfo.level.toString().padStart(2, '0')}${levelInfo.tier}.${bitDepth}`;
	}

	// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
	throw new TypeError(`Unhandled codec '${codec}'.`);
};

export const extractVideoCodecString = (codec: VideoCodec, description: Uint8Array | null) => {
	if (codec === 'avc') {
		if (!description || description.byteLength < 4) {
			throw new TypeError('AVC description must be at least 4 bytes long.');
		}

		// TODO: The "temp hack". Something is amiss with the second byte in the hex string, check the specification

		return `avc1.${bytesToHexString(description.subarray(1, 4))}`;
	} else if (codec === 'hevc') {
		if (!description) {
			throw new TypeError('HEVC description must be provided.');
		}

		const view = new DataView(description.buffer, description.byteOffset, description.byteLength);
		let codecString = 'hev1.';

		// general_profile_space and general_profile_idc
		const generalProfileSpace = (description[1]! >> 6) & 0x03;
		const generalProfileIdc = description[1]! & 0x1F;
		codecString += ['', 'A', 'B', 'C'][generalProfileSpace]! + generalProfileIdc;

		codecString += '.';

		// general_profile_compatibility_flags (in reverse bit order)
		const compatibilityFlags = reverseBitsU32(view.getUint32(2));
		codecString += compatibilityFlags.toString(16);

		codecString += '.';

		// general_tier_flag and general_level_idc
		const generalTierFlag = (description[1]! >> 5) & 0x01;
		const generalLevelIdc = description[12]!;
		codecString += generalTierFlag === 0 ? 'L' : 'H';
		codecString += generalLevelIdc;

		codecString += '.';

		// constraint_flags (6 bytes)
		const constraintFlags: number[] = [];
		for (let i = 0; i < 6; i++) {
			const byte = description[i + 13]!;
			constraintFlags.push(byte);
		}

		while (constraintFlags[constraintFlags.length - 1] === 0) {
			constraintFlags.pop();
		}

		codecString += constraintFlags.map(x => x.toString(16)).join('.');

		return codecString;
	}

	// TODO

	throw new TypeError(`Unhandled codec '${codec}'.`);
};

export const buildAudioCodecString = (codec: AudioCodec, numberOfChannels: number, sampleRate: number) => {
	if (codec === 'aac') {
		// If stereo or higher channels and lower sample rate, likely using HE-AAC v2 with PS
		if (numberOfChannels >= 2 && sampleRate <= 24000) {
			return 'mp4a.40.29'; // HE-AAC v2 (AAC LC + SBR + PS)
		}

		// If sample rate is low, likely using HE-AAC v1 with SBR
		if (sampleRate <= 24000) {
			return 'mp4a.40.5'; // HE-AAC v1 (AAC LC + SBR)
		}

		// Default to standard AAC-LC for higher sample rates
		return 'mp4a.40.2'; // AAC-LC
	} else if (codec === 'opus') {
		return 'opus'; // Easy, this one
	} else if (codec === 'vorbis') {
		return 'vorbis'; // Also easy, this one
	}

	// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
	throw new TypeError(`Unhandled codec '${codec}'.`);
};

export const extractAudioCodecString = (codec: AudioCodec, description: Uint8Array | null) => {
	if (codec === 'aac') {
		if (!description || description.byteLength < 2) {
			throw new TypeError('AAC description must be at least 2 bytes long.');
		}

		// TODO: Is this correct? Give a source/reason
		const mpeg4AudioObjectType = description[0]! >> 3;
		return `mp4a.40.${mpeg4AudioObjectType}`;
	} else if (codec === 'opus') {
		return 'opus';
	} else if (codec === 'vorbis') {
		return 'vorbis';
	}

	// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
	throw new TypeError(`Unhandled codec '${codec}'.`);
};

export const getVideoEncoderConfigExtension = (codec: VideoCodec) => {
	if (codec === 'avc') {
		return {
			avc: {
				format: 'avc' as const, // Ensure the format is not Annex B
			},
		};
	} else if (codec === 'hevc') {
		return {
			hevc: {
				format: 'hevc' as const, // Ensure the format is not Annex B
			},
		};
	}

	return {};
};

export const getAudioEncoderConfigExtension = (codec: AudioCodec) => {
	if (codec === 'aac') {
		return {
			aac: {
				format: 'aac' as const, // Ensure the format is not ADTS
			},
		};
	} else if (codec === 'opus') {
		return {
			opus: {
				format: 'opus' as const,
			},
		};
	}

	return {};
};

export const validateVideoChunkMetadata = (metadata: EncodedVideoChunkMetadata | undefined) => {
	if (!metadata) {
		throw new TypeError('Video chunk metadata must be provided.');
	}
	if (typeof metadata !== 'object') {
		throw new TypeError('Video chunk metadata must be an object.');
	}
	if (!metadata.decoderConfig) {
		throw new TypeError('Video chunk metadata must include a decoder configuration.');
	}
	if (typeof metadata.decoderConfig !== 'object') {
		throw new TypeError('Video chunk metadata decoder configuration must be an object.');
	}
	if (typeof metadata.decoderConfig.codec !== 'string') {
		throw new TypeError('Video chunk metadata decoder configuration must specify a codec string.');
	}
	if (!Number.isInteger(metadata.decoderConfig.codedWidth) || metadata.decoderConfig.codedWidth! <= 0) {
		throw new TypeError(
			'Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer).',
		);
	}
	if (!Number.isInteger(metadata.decoderConfig.codedHeight) || metadata.decoderConfig.codedHeight! <= 0) {
		throw new TypeError(
			'Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer).',
		);
	}
	if (metadata.decoderConfig.description !== undefined) {
		if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
			throw new TypeError(
				'Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an'
				+ ' ArrayBuffer view.',
			);
		}
	}
	if (metadata.decoderConfig.colorSpace !== undefined) {
		const { colorSpace } = metadata.decoderConfig;

		if (typeof colorSpace !== 'object') {
			throw new TypeError(
				'Video chunk metadata decoder configuration colorSpace, when provided, must be an object.',
			);
		}

		const primariesValues = Object.keys(COLOR_PRIMARIES_MAP);
		if (colorSpace.primaries != null && !primariesValues.includes(colorSpace.primaries)) {
			throw new TypeError(
				`Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of`
				+ ` ${primariesValues.join(', ')}.`,
			);
		}

		const transferValues = Object.keys(TRANSFER_CHARACTERISTICS_MAP);
		if (colorSpace.transfer != null && !transferValues.includes(colorSpace.transfer)) {
			throw new TypeError(
				`Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of`
				+ ` ${transferValues.join(', ')}.`,
			);
		}

		const matrixValues = Object.keys(MATRIX_COEFFICIENTS_MAP);
		if (colorSpace.matrix != null && !matrixValues.includes(colorSpace.matrix)) {
			throw new TypeError(
				`Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of`
				+ ` ${matrixValues.join(', ')}.`,
			);
		}

		if (colorSpace.fullRange != null && typeof colorSpace.fullRange !== 'boolean') {
			throw new TypeError(
				'Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean.',
			);
		}
	}

	if (
		(metadata.decoderConfig.codec.startsWith('avc1') || metadata.decoderConfig.codec.startsWith('avc3'))
		&& !metadata.decoderConfig.description
	) {
		throw new TypeError(
			'Video chunk metadata decoder configuration for AVC must include a description, which is expected to be an'
			+ ' AVCDecoderConfigurationRecord as specified in ISO 14496-15.',
		);
	}
	if (
		(metadata.decoderConfig.codec.startsWith('hev1') || metadata.decoderConfig.codec.startsWith('hvc1'))
		&& !metadata.decoderConfig.description
	) {
		throw new TypeError(
			'Video chunk metadata decoder configuration for HEVC must include a description, which is expected to be an'
			+ ' HEVCDecoderConfigurationRecord as specified in ISO 14496-15.',
		);
	}
	if (
		(metadata.decoderConfig.codec === 'vp8' || metadata.decoderConfig.codec.startsWith('vp09'))
		&& metadata.decoderConfig.colorSpace === undefined
	) {
		throw new TypeError('Video chunk metadata decoder configuration for VP8/VP9 must include a colorSpace.');
	}
	// No added requirements for AV1 (based)
};

export const validateAudioChunkMetadata = (metadata: EncodedAudioChunkMetadata | undefined) => {
	if (!metadata) {
		throw new TypeError('Audio chunk metadata must be provided.');
	}
	if (typeof metadata !== 'object') {
		throw new TypeError('Audio chunk metadata must be an object.');
	}
	if (!metadata.decoderConfig) {
		throw new TypeError('Audio chunk metadata must include a decoder configuration.');
	}
	if (typeof metadata.decoderConfig !== 'object') {
		throw new TypeError('Audio chunk metadata decoder configuration must be an object.');
	}
	if (typeof metadata.decoderConfig.codec !== 'string') {
		throw new TypeError('Audio chunk metadata decoder configuration must specify a codec string.');
	}
	if (!Number.isInteger(metadata.decoderConfig.sampleRate) || metadata.decoderConfig.sampleRate <= 0) {
		throw new TypeError(
			'Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer).',
		);
	}
	if (!Number.isInteger(metadata.decoderConfig.numberOfChannels) || metadata.decoderConfig.numberOfChannels <= 0) {
		throw new TypeError(
			'Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer).',
		);
	}
	if (metadata.decoderConfig.description !== undefined) {
		if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
			throw new TypeError(
				'Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an'
				+ ' ArrayBuffer view.',
			);
		}
	}

	if (metadata.decoderConfig.codec.startsWith('mp4a') && !metadata.decoderConfig.description) {
		throw new TypeError(
			'Audio chunk metadata decoder configuration for AAC must include a description, which is expected to be an'
			+ ' AudioSpecificConfig as specified in ISO 14496-3.',
		);
	}
	if (
		metadata.decoderConfig.codec === 'opus'
		&& metadata.decoderConfig.description
		&& metadata.decoderConfig.description.byteLength < 18
	) {
		throw new TypeError('Invalid decoder description provided for Opus; must be at least 18 bytes long.');
	}
};

export const validateSubtitleMetadata = (metadata: SubtitleMetadata | undefined) => {
	if (!metadata) {
		throw new TypeError('Subtitle metadata must be provided.');
	}
	if (typeof metadata !== 'object') {
		throw new TypeError('Subtitle metadata must be an object.');
	}
	if (!metadata.config) {
		throw new TypeError('Subtitle metadata must include a config object.');
	}
	if (typeof metadata.config !== 'object') {
		throw new TypeError('Subtitle metadata config must be an object.');
	}
	if (typeof metadata.config.description !== 'string') {
		throw new TypeError('Subtitle metadata config description must be a string.');
	}
};
