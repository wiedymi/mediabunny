import {
	COLOR_PRIMARIES_MAP,
	MATRIX_COEFFICIENTS_MAP,
	TRANSFER_CHARACTERISTICS_MAP,
	assert,
	bytesToHexString,
	isAllowSharedBufferSource,
	last,
	readBits,
	reverseBitsU32,
} from './misc';
import { SubtitleMetadata } from './subtitles';

/** @public */
export const VIDEO_CODECS = [
	'avc',
	'hevc',
	'vp8',
	'vp9',
	'av1',
] as const;
export const PCM_CODECS = [
	'pcm-u8',
	'pcm-s8',
	'pcm-s16', // We don't prefix 'le' so we're compatible with the WebCodecs-registered PCM codec strings
	'pcm-s16be',
	'pcm-s24',
	'pcm-s24be',
	'pcm-s32',
	'pcm-s32be',
	'pcm-f32',
	'pcm-f32be',
	'ulaw',
	'alaw',
] as const;
/** @public */
export const AUDIO_CODECS = [
	'aac',
	'mp3',
	'opus',
	'vorbis',
	'flac',
	...PCM_CODECS,
] as const; // TODO add the rest
/** @public */
export const SUBTITLE_CODECS = ['webvtt'] as const; // TODO add the rest

/** @public */
export type VideoCodec = typeof VIDEO_CODECS[number];
/** @public */
export type AudioCodec = typeof AUDIO_CODECS[number];
export type PcmAudioCodec = typeof PCM_CODECS[number];
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

const VP9_DEFAULT_SUFFIX = '.01.01.01.01.00';
const AV1_DEFAULT_SUFFIX = '.0.110.01.01.01.0';

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

		return `vp09.${profile}.${levelInfo.level.toString().padStart(2, '0')}.${bitDepth}${VP9_DEFAULT_SUFFIX}`;
	} else if (codec === 'av1') {
		const profile = 0; // Main Profile, single digit

		const pictureSize = width * height;
		const levelInfo = AV1_LEVEL_TABLE.find(
			level => pictureSize <= level.maxPictureSize && bitrate <= level.maxBitrate,
		) ?? last(AV1_LEVEL_TABLE)!;
		const level = levelInfo.level.toString().padStart(2, '0');

		const bitDepth = '08'; // 8-bit

		return `av01.${profile}.${level}${levelInfo.tier}.${bitDepth}${AV1_DEFAULT_SUFFIX}`;
	}

	// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
	throw new TypeError(`Unhandled codec '${codec}'.`);
};

export type Vp9CodecInfo = {
	profile: number;
	level: number;
	bitDepth: number;
	chromaSubsampling: number;
	videoFullRangeFlag: number;
	colourPrimaries: number;
	transferCharacteristics: number;
	matrixCoefficients: number;
};

export type Av1CodecInfo = {
	profile: number;
	level: number;
	tier: number;
	bitDepth: number;
	monochrome: number;
	chromaSubsamplingX: number;
	chromaSubsamplingY: number;
	chromaSamplePosition: number;
};

export const extractVideoCodecString = (trackInfo: {
	codec: VideoCodec | null;
	codecDescription: Uint8Array | null;
	colorSpace: VideoColorSpaceInit | null;
	vp9CodecInfo: Vp9CodecInfo | null;
	av1CodecInfo: Av1CodecInfo | null;
}) => {
	const { codec, codecDescription: description, colorSpace, vp9CodecInfo, av1CodecInfo } = trackInfo;

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
	} else if (codec === 'vp8') {
		return 'vp8'; // Easy, this one
	} else if (codec === 'vp9') {
		if (!vp9CodecInfo) {
			throw new Error('Missing VP9 codec info - unable to construct codec string.');
		}

		const profile = vp9CodecInfo.profile.toString().padStart(2, '0');
		const level = vp9CodecInfo.level.toString().padStart(2, '0');
		const bitDepth = vp9CodecInfo.bitDepth.toString().padStart(2, '0');
		const chromaSubsampling = vp9CodecInfo.chromaSubsampling.toString().padStart(2, '0');
		const colourPrimaries = vp9CodecInfo.colourPrimaries.toString().padStart(2, '0');
		const transferCharacteristics = vp9CodecInfo.transferCharacteristics.toString().padStart(2, '0');
		const matrixCoefficients = vp9CodecInfo.matrixCoefficients.toString().padStart(2, '0');
		const videoFullRangeFlag = vp9CodecInfo.videoFullRangeFlag.toString().padStart(2, '0');

		let string = `vp09.${profile}.${level}.${bitDepth}.${chromaSubsampling}`;
		string += `.${colourPrimaries}.${transferCharacteristics}.${matrixCoefficients}.${videoFullRangeFlag}`;

		const defaultSuffix = '.01.01.01.01.00';
		if (string.endsWith(defaultSuffix)) {
			string = string.slice(0, -defaultSuffix.length);
		}

		return string;
	} else if (codec === 'av1') {
		if (!av1CodecInfo) {
			throw new Error('Missing AV1 codec info - unable to construct codec string.');
		}

		// https://aomediacodec.github.io/av1-isobmff/#codecsparam
		const profile = av1CodecInfo.profile; // Single digit
		const level = av1CodecInfo.level.toString().padStart(2, '0');
		const tier = av1CodecInfo.tier ? 'H' : 'M';
		const bitDepth = av1CodecInfo.bitDepth.toString().padStart(2, '0');
		const monochrome = av1CodecInfo.monochrome ? '1' : '0';
		const chromaSubsampling = 100 * av1CodecInfo.chromaSubsamplingX
			+ 10 * av1CodecInfo.chromaSubsamplingY
			+ 1 * (
				av1CodecInfo.chromaSubsamplingX && av1CodecInfo.chromaSubsamplingY
					? av1CodecInfo.chromaSamplePosition
					: 0
			);

		// The defaults are 1 (ITU-R BT.709)
		const colorPrimaries = colorSpace?.primaries ? COLOR_PRIMARIES_MAP[colorSpace.primaries] : 1;
		const transferCharacteristics = colorSpace?.transfer ? TRANSFER_CHARACTERISTICS_MAP[colorSpace.transfer] : 1;
		const matrixCoefficients = colorSpace?.matrix ? MATRIX_COEFFICIENTS_MAP[colorSpace.matrix] : 1;

		const videoFullRangeFlag = colorSpace?.fullRange ? 1 : 0;

		let string = `av01.${profile}.${level}${tier}.${bitDepth}`;
		string += `.${monochrome}.${chromaSubsampling.toString().padStart(3, '0')}`;
		string += `.${colorPrimaries.toString().padStart(2, '0')}`;
		string += `.${transferCharacteristics.toString().padStart(2, '0')}`;
		string += `.${matrixCoefficients.toString().padStart(2, '0')}`;
		string += `.${videoFullRangeFlag}`;

		const defaultSuffix = '.0.110.01.01.01.0';
		if (string.endsWith(defaultSuffix)) {
			string = string.slice(0, -defaultSuffix.length);
		}

		return string;
	}

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
	} else if (codec === 'mp3') {
		return 'mp3';
	} else if (codec === 'opus') {
		return 'opus';
	} else if (codec === 'vorbis') {
		return 'vorbis';
	} else if (codec === 'flac') {
		return 'flac';
	} else if ((PCM_CODECS as readonly string[]).includes(codec)) {
		return codec;
	}

	throw new TypeError(`Unhandled codec '${codec}'.`);
};

export type AacCodecInfo = {
	isMpeg2: boolean;
};

export const extractAudioCodecString = (trackInfo: {
	codec: AudioCodec | null;
	codecDescription: Uint8Array | null;
	aacCodecInfo: AacCodecInfo | null;
}) => {
	const { codec, codecDescription, aacCodecInfo } = trackInfo;

	if (codec === 'aac') {
		assert(aacCodecInfo);

		if (aacCodecInfo.isMpeg2) {
			return 'mp4a.67';
		} else {
			const audioSpecificConfig = parseAacAudioSpecificConfig(codecDescription);
			return `mp4a.40.${audioSpecificConfig.objectType}`;
		}
	} else if (codec === 'mp3') {
		return 'mp3';
	} else if (codec === 'opus') {
		return 'opus';
	} else if (codec === 'vorbis') {
		return 'vorbis';
	} else if (codec === 'flac') {
		return 'flac';
	} else if (codec && (PCM_CODECS as readonly string[]).includes(codec)) {
		return codec;
	}

	throw new TypeError(`Unhandled codec '${codec}'.`);
};

export const parseAacAudioSpecificConfig = (bytes: Uint8Array | null) => {
	if (!bytes || bytes.byteLength < 2) {
		throw new TypeError('AAC description must be at least 2 bytes long.');
	}

	let bitOffset = 0;

	// 1) Audio Object Type (5 bits)
	let objectType = readBits(bytes, bitOffset, bitOffset + 5);
	bitOffset += 5;
	if (objectType === 31) {
		// (Escape value) -> 6 bits + 32
		objectType = 32 + readBits(bytes, bitOffset, bitOffset + 6);
		bitOffset += 6;
	}

	// 2) Sampling Frequency Index (4 bits)
	const frequencyIndex = readBits(bytes, bitOffset, bitOffset + 4);
	bitOffset += 4;
	let sampleRate: number | null = null;
	if (frequencyIndex === 15) {
		// Explicit sample rate (24 bits)
		sampleRate = readBits(bytes, bitOffset, bitOffset + 24);
		bitOffset += 24;
	} else {
		const freqTable = [
			96000, 88200, 64000, 48000, 44100,
			32000, 24000, 22050, 16000, 12000,
			11025, 8000, 7350,
		];
		if (frequencyIndex < freqTable.length) {
			sampleRate = freqTable[frequencyIndex]!;
		}
	}

	// 3) Channel Configuration (4 bits)
	const channelConfiguration = readBits(bytes, bitOffset, bitOffset + 4);
	bitOffset += 4;
	let numberOfChannels: number | null = null;
	if (channelConfiguration >= 1 && channelConfiguration <= 7) {
		const channelMap = {
			1: 1, 2: 2, 3: 3,
			4: 4, 5: 5, 6: 6,
			7: 8,
		};
		numberOfChannels = channelMap[channelConfiguration as keyof typeof channelMap];
	}

	return {
		objectType,
		frequencyIndex,
		sampleRate,
		channelConfiguration,
		numberOfChannels,
	};
};

const PCM_CODEC_REGEX = /^pcm-([usf])(\d+)+(be)?$/;
export const parsePcmCodec = (codec: PcmAudioCodec) => {
	assert(PCM_CODECS.includes(codec));

	if (codec === 'ulaw') {
		return { dataType: 'ulaw' as const, sampleSize: 1 as const, littleEndian: true, silentValue: 255 };
	} else if (codec === 'alaw') {
		return { dataType: 'alaw' as const, sampleSize: 1 as const, littleEndian: true, silentValue: 213 };
	}

	const match = PCM_CODEC_REGEX.exec(codec);
	assert(match);

	let dataType: 'unsigned' | 'signed' | 'float' | 'ulaw' | 'alaw';
	if (match[1] === 'u') {
		dataType = 'unsigned';
	} else if (match[1] === 's') {
		dataType = 'signed';
	} else {
		dataType = 'float';
	}

	const sampleSize = (Number(match[2]) / 8) as 1 | 2 | 3 | 4;
	const littleEndian = match[3] !== 'be';
	const silentValue = codec === 'pcm-u8' ? 2 ** 7 : 0;

	return { dataType, sampleSize, littleEndian, silentValue };
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

const VALID_VIDEO_CODEC_STRING_PREFIXES = ['avc1', 'avc3', 'hev1', 'hvc1', 'vp8', 'vp09', 'av01'];
const AVC_CODEC_STRING_REGEX = /^(avc1|avc3)\.[0-9a-fA-F]{6}$/;
const HEVC_CODEC_STRING_REGEX = /^(hev1|hvc1)\.(?:[ABC]?\d+)\.[0-9a-fA-F]{1,8}\.[LH]\d+(?:\.[0-9a-fA-F]{1,2}){0,6}$/;
const VP9_CODEC_STRING_REGEX = /^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/;
const AV1_CODEC_STRING_REGEX = /^av01\.\d\.\d{2}[MH]\.\d{2}(?:\.\d\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d)?$/;

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
	if (!VALID_VIDEO_CODEC_STRING_PREFIXES.some(prefix => metadata.decoderConfig!.codec.startsWith(prefix))) {
		throw new TypeError(
			'Video chunk metadata decoder configuration codec string must be a valid video codec string as specified in'
			+ ' the WebCodecs codec registry.',
		);
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

	// AVC-specific validation
	if (metadata.decoderConfig.codec.startsWith('avc1') || metadata.decoderConfig.codec.startsWith('avc3')) {
		if (!AVC_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
			throw new TypeError(
				'Video chunk metadata decoder configuration codec string for AVC must be a valid AVC codec string as'
				+ ' specified in Section 3.4 of RFC 6381.',
			);
		}

		if (!metadata.decoderConfig.description) {
			throw new TypeError(
				'Video chunk metadata decoder configuration for AVC must include a description, which is expected to be'
				+ ' an AVCDecoderConfigurationRecord as specified in ISO 14496-15.',
			);
		}
	}

	// HEVC-specific validation
	if (metadata.decoderConfig.codec.startsWith('hev1') || metadata.decoderConfig.codec.startsWith('hvc1')) {
		if (!HEVC_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
			throw new TypeError(
				'Video chunk metadata decoder configuration codec string for HEVC must be a valid HEVC codec string as'
				+ ' specified in Section E.3 of ISO 14496-15.',
			);
		}

		if (!metadata.decoderConfig.description) {
			throw new TypeError(
				'Video chunk metadata decoder configuration for HEVC must include a description, which is expected to'
				+ ' be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15.',
			);
		}
	}

	// VP8-specific validation
	if (metadata.decoderConfig.codec.startsWith('vp8')) {
		if (metadata.decoderConfig.codec !== 'vp8') {
			throw new TypeError('Video chunk metadata decoder configuration codec string for VP8 must be "vp8".');
		}
	}

	// VP9-specific validation
	if (metadata.decoderConfig.codec.startsWith('vp09')) {
		if (!VP9_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
			throw new TypeError(
				'Video chunk metadata decoder configuration codec string for VP9 must be a valid VP9 codec string as'
				+ ' specified in Section "Codecs Parameter String" of https://www.webmproject.org/vp9/mp4/.',
			);
		}
	}

	// AV1-specific validation
	if (metadata.decoderConfig.codec.startsWith('av01')) {
		if (!AV1_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
			throw new TypeError(
				'Video chunk metadata decoder configuration codec string for AV1 must be a valid AV1 codec string as'
				+ ' specified in Section "Codecs Parameter String" of https://aomediacodec.github.io/av1-isobmff/.',
			);
		}
	}
};

const VALID_AUDIO_CODEC_STRING_PREFIXES = ['mp4a', 'mp3', 'opus', 'vorbis', 'flac', 'ulaw', 'alaw', 'pcm'];

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
	if (!VALID_AUDIO_CODEC_STRING_PREFIXES.some(prefix => metadata.decoderConfig!.codec.startsWith(prefix))) {
		throw new TypeError(
			'Audio chunk metadata decoder configuration codec string must be a valid audio codec string as specified in'
			+ ' the WebCodecs codec registry.',
		);
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

	// AAC-specific validation
	if (metadata.decoderConfig.codec.startsWith('mp4a')) {
		const validStrings = ['mp4a.40.2', 'mp4a.40.02', 'mp4a.40.5', 'mp4a.40.05', 'mp4a.40.29', 'mp4a.67'];
		if (!validStrings.includes(metadata.decoderConfig.codec)) {
			throw new TypeError(
				'Audio chunk metadata decoder configuration codec string for AAC must be a valid AAC codec string as'
				+ ' specified in https://www.w3.org/TR/webcodecs-aac-codec-registration/.',
			);
		}

		if (!metadata.decoderConfig.description) {
			throw new TypeError(
				'Audio chunk metadata decoder configuration for AAC must include a description, which is expected to be'
				+ ' an AudioSpecificConfig as specified in ISO 14496-3.',
			);
		}
	}

	// MP3-specific validation
	if (metadata.decoderConfig.codec === 'mp3') {
		if (metadata.decoderConfig.codec !== 'mp3') {
			throw new TypeError('Audio chunk metadata decoder configuration codec string for MP3 must be "mp3".');
		}
	}

	// Opus-specific validation
	if (metadata.decoderConfig.codec === 'opus') {
		if (metadata.decoderConfig.codec !== 'opus') {
			throw new TypeError('Audio chunk metadata decoder configuration codec string for Opus must be "opus".');
		}

		if (metadata.decoderConfig.description && metadata.decoderConfig.description.byteLength < 18) {
			// Description is optional for Opus per-spec, so we shouldn't enforce it
			throw new TypeError(
				'Audio chunk metadata decoder configuration description, when specified, is expected to be an'
				+ ' Identification Header as specified in Section 5.1 of RFC 7845.',
			);
		}
	}

	// Vorbis-specific validation
	if (metadata.decoderConfig.codec === 'vorbis') {
		if (metadata.decoderConfig.codec !== 'vorbis') {
			throw new TypeError('Audio chunk metadata decoder configuration codec string for Vorbis must be "vorbis".');
		}

		if (!metadata.decoderConfig.description) {
			throw new TypeError(
				'Audio chunk metadata decoder configuration for Vorbis must include a description, which is expected to'
				+ ' adhere to the format described in https://www.w3.org/TR/webcodecs-vorbis-codec-registration/.',
			);
		}
	}

	// FLAC-specific validation
	if (metadata.decoderConfig.codec === 'flac') {
		if (metadata.decoderConfig.codec !== 'flac') {
			throw new TypeError('Audio chunk metadata decoder configuration codec string for FLAC must be "flac".');
		}

		const minDescriptionSize = 4 + 4 + 34; // 'fLaC' + metadata block header + STREAMINFO block
		if (!metadata.decoderConfig.description || metadata.decoderConfig.description.byteLength < minDescriptionSize) {
			throw new TypeError(
				'Audio chunk metadata decoder configuration for FLAC must include a description, which is expected to'
				+ ' adhere to the format described in https://www.w3.org/TR/webcodecs-flac-codec-registration/.',
			);
		}
	}

	// PCM-specific validation
	if (
		metadata.decoderConfig.codec.startsWith('pcm')
		|| metadata.decoderConfig.codec.startsWith('ulaw')
		|| metadata.decoderConfig.codec.startsWith('alaw')
	) {
		if (!(PCM_CODECS as readonly string[]).includes(metadata.decoderConfig.codec)) {
			throw new TypeError(
				'Audio chunk metadata decoder configuration codec string for PCM must be one of the supported PCM'
				+ ` codecs (${PCM_CODECS.join(', ')}).`,
			);
		}
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

/** @public */
export const canEncode = (codec: MediaCodec) => {
	if ((VIDEO_CODECS as readonly string[]).includes(codec)) {
		return canEncodeVideo(codec as VideoCodec);
	} else if ((AUDIO_CODECS as readonly string[]).includes(codec)) {
		return canEncodeAudio(codec as AudioCodec);
	} else if ((SUBTITLE_CODECS as readonly string[]).includes(codec)) {
		return canEncodeSubtitles(codec as SubtitleCodec);
	}

	throw new TypeError(`Unknown codec '${codec}'.`);
};

/** @public */
export const canEncodeVideo = async (codec: VideoCodec, { width = 1280, height = 720, bitrate = 1e6 }: {
	width?: number;
	height?: number;
	bitrate?: 1e6;
} = {}) => {
	if (!VIDEO_CODECS.includes(codec)) {
		return false;
	}
	if (!Number.isInteger(width) || width <= 0) {
		throw new TypeError('width must be a positive integer.');
	}
	if (!Number.isInteger(height) || height <= 0) {
		throw new TypeError('height must be a positive integer.');
	}
	if (!Number.isInteger(bitrate) || bitrate <= 0) {
		throw new TypeError('bitrate must be a positive integer.');
	}

	if (typeof VideoEncoder === 'undefined') {
		return false;
	}

	const support = await VideoEncoder.isConfigSupported({
		codec: buildVideoCodecString(codec, width, height, bitrate),
		width,
		height,
		bitrate,
		...getVideoEncoderConfigExtension(codec),
	});

	return support.supported === true;
};

/** @public */
export const canEncodeAudio = async (codec: AudioCodec, { numberOfChannels = 2, sampleRate = 48000, bitrate = 128e3 }: {
	numberOfChannels?: number;
	sampleRate?: number;
	bitrate?: number;
} = {}) => {
	if (!AUDIO_CODECS.includes(codec)) {
		return false;
	}
	if (!Number.isInteger(numberOfChannels) || numberOfChannels <= 0) {
		throw new TypeError('numberOfChannels must be a positive integer.');
	}
	if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
		throw new TypeError('sampleRate must be a positive integer.');
	}
	if (!Number.isInteger(bitrate) || bitrate <= 0) {
		throw new TypeError('bitrate must be a positive integer.');
	}

	if ((PCM_CODECS as readonly string[]).includes(codec)) {
		return false; // TODO write encoder
	}

	if (typeof AudioEncoder === 'undefined') {
		return false;
	}

	const support = await AudioEncoder.isConfigSupported({
		codec: buildAudioCodecString(codec, numberOfChannels, sampleRate),
		numberOfChannels,
		sampleRate,
		bitrate,
		...getAudioEncoderConfigExtension(codec),
	});

	return support.supported === true;
};

/** @public */

export const canEncodeSubtitles = async (codec: SubtitleCodec) => {
	if (!SUBTITLE_CODECS.includes(codec)) {
		return false;
	}

	return true;
};

/** @public */
export const getEncodableCodecs = async (): Promise<MediaCodec[]> => {
	const [videoCodecs, audioCodecs, subtitleCodecs] = await Promise.all([
		getEncodableVideoCodecs(),
		getEncodableAudioCodecs(),
		getEncodableSubtitleCodecs(),
	]);

	return [...videoCodecs, ...audioCodecs, ...subtitleCodecs];
};

/** @public */
export const getEncodableVideoCodecs = async (): Promise<VideoCodec[]> => {
	const bools = await Promise.all(VIDEO_CODECS.map(canEncode));
	return VIDEO_CODECS.filter((_, i) => bools[i]);
};

/** @public */
export const getEncodableAudioCodecs = async (): Promise<AudioCodec[]> => {
	const bools = await Promise.all(AUDIO_CODECS.map(canEncode));
	return AUDIO_CODECS.filter((_, i) => bools[i]);
};

/** @public */
export const getEncodableSubtitleCodecs = async (): Promise<SubtitleCodec[]> => {
	const bools = await Promise.all(SUBTITLE_CODECS.map(canEncode));
	return SUBTITLE_CODECS.filter((_, i) => bools[i]);
};
