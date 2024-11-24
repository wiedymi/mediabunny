import { toUint8Array, assert, isU32, last, TransformationMatrix, textEncoder } from '../misc';
import { AudioCodec, AudioSource, SubtitleCodec, VideoCodec, VideoSource } from '../source';
import { formatSubtitleTimestamp } from '../subtitles';
import { Writer } from '../writer';
import { GLOBAL_TIMESCALE, intoTimescale, IsobmffAudioTrackData, IsobmffSubtitleTrackData, IsobmffTrackData, IsobmffVideoTrackData, Sample } from './isobmff_muxer';

export class IsobmffBoxWriter {
	private helper = new Uint8Array(8);
	private helperView = new DataView(this.helper.buffer);

	/**
	 * Stores the position from the start of the file to where boxes elements have been written. This is used to
	 * rewrite/edit elements that were already added before, and to measure sizes of things.
	 */
	offsets = new WeakMap<Box, number>();

	constructor(private writer: Writer) {}

	writeU32(value: number) {
		this.helperView.setUint32(0, value, false);
		this.writer.write(this.helper.subarray(0, 4));
	}

	writeU64(value: number) {
		this.helperView.setUint32(0, Math.floor(value / 2**32), false);
		this.helperView.setUint32(4, value, false);
		this.writer.write(this.helper.subarray(0, 8));
	}

	writeAscii(text: string) {
		for (let i = 0; i < text.length; i++) {
			this.helperView.setUint8(i % 8, text.charCodeAt(i));
			if (i % 8 === 7) this.writer.write(this.helper);
		}

		if (text.length % 8 !== 0) {
			this.writer.write(this.helper.subarray(0, text.length % 8));
		}
	}

	writeBox(box: Box) {
		this.offsets.set(box, this.writer.getPos());

		if (box.contents && !box.children) {
			this.writeBoxHeader(box, box.size ?? box.contents.byteLength + 8);
			this.writer.write(box.contents);
		} else {
			let startPos = this.writer.getPos();
			this.writeBoxHeader(box, 0);

			if (box.contents) this.writer.write(box.contents);
			if (box.children) for (let child of box.children) if (child) this.writeBox(child);

			let endPos = this.writer.getPos();
			let size = box.size ?? endPos - startPos;
			this.writer.seek(startPos);
			this.writeBoxHeader(box, size);
			this.writer.seek(endPos);
		}
	}

	writeBoxHeader(box: Box, size: number) {
		this.writeU32(box.largeSize ? 1 : size);
		this.writeAscii(box.type);
		if (box.largeSize) this.writeU64(size);
	}

	measureBoxHeader(box: Box) {
		return 8 + (box.largeSize ? 8 : 0);
	}

	patchBox(box: Box) {
		const boxOffset = this.offsets.get(box);
		assert(boxOffset !== undefined);

		let endPos = this.writer.getPos();
		this.writer.seek(boxOffset);
		this.writeBox(box);
		this.writer.seek(endPos);
	}

	measureBox(box: Box) {
		if (box.contents && !box.children) {
			let headerSize = this.measureBoxHeader(box);
			return headerSize + box.contents.byteLength;
		} else {
			let result = this.measureBoxHeader(box);
			if (box.contents) result += box.contents.byteLength;
			if (box.children) for (let child of box.children) if (child) result += this.measureBox(child);

			return result;
		}
	}
}

let bytes = new Uint8Array(8);
let view = new DataView(bytes.buffer);

const u8 = (value: number) => {
	return [(value % 0x100 + 0x100) % 0x100];
};

const u16 = (value: number) => {
	view.setUint16(0, value, false);
	return [bytes[0], bytes[1]] as number[];
};

const i16 = (value: number) => {
	view.setInt16(0, value, false);
	return [bytes[0], bytes[1]] as number[];
};

const u24 = (value: number) => {
	view.setUint32(0, value, false);
	return [bytes[1], bytes[2], bytes[3]] as number[];
};

const u32 = (value: number) => {
	view.setUint32(0, value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3]] as number[];
};

const i32 = (value: number) => {
	view.setInt32(0, value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3]] as number[];
};

const u64 = (value: number) => {
	view.setUint32(0, Math.floor(value / 2**32), false);
	view.setUint32(4, value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]] as number[];
};

const fixed_8_8 = (value: number) => {
	view.setInt16(0, 2**8 * value, false);
	return [bytes[0], bytes[1]] as number[];
};

const fixed_16_16 = (value: number) => {
	view.setInt32(0, 2**16 * value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3]] as number[];
};

const fixed_2_30 = (value: number) => {
	view.setInt32(0, 2**30 * value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3]] as number[];
};

const ascii = (text: string, nullTerminated = false) => {
	let bytes = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
	if (nullTerminated) bytes.push(0x00);
	return bytes;
};

const lastPresentedSample = (samples: Sample[]) => {
	let result: Sample | null = null;

	for (let sample of samples) {
		if (!result || sample.timestamp > result.timestamp) {
			result = sample;
		}
	}

	return result;
};

const rotationMatrix = (rotationInDegrees: number): TransformationMatrix => {
	let theta = rotationInDegrees * (Math.PI / 180);
	let cosTheta = Math.cos(theta);
	let sinTheta = Math.sin(theta);

	// Matrices are post-multiplied in ISOBMFF, meaning this is the transpose of your typical rotation matrix
	return [
		cosTheta, sinTheta, 0,
		-sinTheta, cosTheta, 0,
		0, 0, 1
	];
};

const IDENTITY_MATRIX = rotationMatrix(0);

const matrixToBytes = (matrix: TransformationMatrix) => {
	return [
		fixed_16_16(matrix[0]), fixed_16_16(matrix[1]), fixed_2_30(matrix[2]),
		fixed_16_16(matrix[3]), fixed_16_16(matrix[4]), fixed_2_30(matrix[5]),
		fixed_16_16(matrix[6]), fixed_16_16(matrix[7]), fixed_2_30(matrix[8])
	];
};

export interface Box {
	type: string,
	contents?: Uint8Array,
	children?: (Box | null)[],
	size?: number,
	largeSize?: boolean
}

type NestedNumberArray = (number | NestedNumberArray)[];

export const box = (type: string, contents?: NestedNumberArray, children?: (Box | null)[]): Box => ({
	type,
	contents: contents && new Uint8Array(contents.flat(10) as number[]),
	children
});

/** A FullBox always starts with a version byte, followed by three flag bytes. */
export const fullBox = (
	type: string,
	version: number,
	flags: number,
	contents?: NestedNumberArray,
	children?: Box[]
) => box(
	type,
	[u8(version), u24(flags), contents ?? []],
	children
);

/**
 * File Type Compatibility Box: Allows the reader to determine whether this is a type of file that the
 * reader understands.
 */
export const ftyp = (details: {
	holdsAvc: boolean,
	fragmented: boolean
}) => {
	// You can find the full logic for this at
	// https://github.com/FFmpeg/FFmpeg/blob/de2fb43e785773738c660cdafb9309b1ef1bc80d/libavformat/movenc.c#L5518
	// Obviously, this lib only needs a small subset of that logic.

	let minorVersion = 0x200;

	if (details.fragmented) return box('ftyp', [
		ascii('iso5'), // Major brand
		u32(minorVersion), // Minor version
		// Compatible brands
		ascii('iso5'),
		ascii('iso6'),
		ascii('mp41')
	]);

	return box('ftyp', [
		ascii('isom'), // Major brand
		u32(minorVersion), // Minor version
		// Compatible brands
		ascii('isom'),
		details.holdsAvc ? ascii('avc1') : [],
		ascii('mp41')
	]);
};

/** Movie Sample Data Box. Contains the actual frames/samples of the media. */
export const mdat = (reserveLargeSize: boolean): Box => ({ type: 'mdat', largeSize: reserveLargeSize });

/** Free Space Box: A box that designates unused space in the movie data file. */
export const free = (size: number): Box => ({ type: 'free', size });

/**
 * Movie Box: Used to specify the information that defines a movie - that is, the information that allows
 * an application to interpret the sample data that is stored elsewhere.
 */
export const moov = (trackDatas: IsobmffTrackData[], creationTime: number, fragmented = false) => box('moov', undefined, [
	mvhd(creationTime, trackDatas),
	...trackDatas.map(x => trak(x, creationTime)),
	fragmented ? mvex(trackDatas) : null
]);

/** Movie Header Box: Used to specify the characteristics of the entire movie, such as timescale and duration. */
export const mvhd = (
	creationTime: number,
	trackDatas: IsobmffTrackData[]
) => {
	let duration = intoTimescale(Math.max(
		0,
		...trackDatas.
			filter(x => x.samples.length > 0).
			map(x => {
				const lastSample = lastPresentedSample(x.samples)!;
				return lastSample.timestamp + lastSample.duration;
			})
	), GLOBAL_TIMESCALE);
	let nextTrackId = Math.max(...trackDatas.map(x => x.track.id)) + 1;

	// Conditionally use u64 if u32 isn't enough
	let needsU64 = !isU32(creationTime) || !isU32(duration);
	let u32OrU64 = needsU64 ? u64 : u32;

	return fullBox('mvhd', +needsU64, 0, [
		u32OrU64(creationTime), // Creation time
		u32OrU64(creationTime), // Modification time
		u32(GLOBAL_TIMESCALE), // Timescale
		u32OrU64(duration), // Duration
		fixed_16_16(1), // Preferred rate
		fixed_8_8(1), // Preferred volume
		Array(10).fill(0), // Reserved
		matrixToBytes(IDENTITY_MATRIX), // Matrix
		Array(24).fill(0), // Pre-defined
		u32(nextTrackId) // Next track ID
	]);
};

/**
 * Track Box: Defines a single track of a movie. A movie may consist of one or more tracks. Each track is
 * independent of the other tracks in the movie and carries its own temporal and spatial information. Each Track Box
 * contains its associated Media Box.
 */
export const trak = (trackData: IsobmffTrackData, creationTime: number) => box('trak', undefined, [
	tkhd(trackData, creationTime),
	mdia(trackData, creationTime)
]);

/** Track Header Box: Specifies the characteristics of a single track within a movie. */
export const tkhd = (
	trackData: IsobmffTrackData,
	creationTime: number
) => {
	let lastSample = lastPresentedSample(trackData.samples);
	let durationInGlobalTimescale = intoTimescale(
		lastSample ? lastSample.timestamp + lastSample.duration : 0,
		GLOBAL_TIMESCALE
	);

	let needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
	let u32OrU64 = needsU64 ? u64 : u32;

	let matrix: TransformationMatrix;
	if (trackData.type === 'video') {
		const rotation = trackData.track.metadata.rotation;
		matrix = rotation === undefined || typeof rotation === 'number' ? rotationMatrix(rotation ?? 0) : rotation;
	} else {
		matrix = IDENTITY_MATRIX;
	}

	return fullBox('tkhd', +needsU64, 3, [
		u32OrU64(creationTime), // Creation time
		u32OrU64(creationTime), // Modification time
		u32(trackData.track.id), // Track ID
		u32(0), // Reserved
		u32OrU64(durationInGlobalTimescale), // Duration
		Array(8).fill(0), // Reserved
		u16(0), // Layer
		u16(trackData.track.id), // Alternate group
		fixed_8_8(trackData.type === 'audio' ? 1 : 0), // Volume
		u16(0), // Reserved
		matrixToBytes(matrix), // Matrix
		fixed_16_16(trackData.type === 'video' ? trackData.info.width : 0), // Track width
		fixed_16_16(trackData.type === 'video' ? trackData.info.height : 0) // Track height
	]);
};

/** Media Box: Describes and define a track's media type and sample data. */
export const mdia = (trackData: IsobmffTrackData, creationTime: number) => box('mdia', undefined, [
	mdhd(trackData, creationTime),
	hdlr(trackData),
	minf(trackData)
]);

/** Media Header Box: Specifies the characteristics of a media, including timescale and duration. */
export const mdhd = (
	trackData: IsobmffTrackData,
	creationTime: number
) => {
	let lastSample = lastPresentedSample(trackData.samples);
	let localDuration = intoTimescale(
		lastSample ? lastSample.timestamp + lastSample.duration : 0,
		trackData.timescale
	);

	let needsU64 = !isU32(creationTime) || !isU32(localDuration);
	let u32OrU64 = needsU64 ? u64 : u32;

	return fullBox('mdhd', +needsU64, 0, [
		u32OrU64(creationTime), // Creation time
		u32OrU64(creationTime), // Modification time
		u32(trackData.timescale), // Timescale
		u32OrU64(localDuration), // Duration
		u16(0b01010101_11000100), // Language ("und", undetermined)
		u16(0) // Quality
	]);
};

const TRACK_TYPE_TO_COMPONENT_SUBTYPE: Record<IsobmffTrackData['type'], string> = {
	video: 'vide',
	audio: 'soun',
	subtitle: 'text'
};

const TRACK_TYPE_TO_HANDLER_NAME: Record<IsobmffTrackData['type'], string> = {
	video: 'VideoHandler',
	audio: 'SoundHandler',
	subtitle: 'TextHandler'
};

/** Handler Reference Box: Specifies the media handler component that is to be used to interpret the media's data. */
export const hdlr = (trackData: IsobmffTrackData) => fullBox('hdlr', 0, 0, [
	ascii('mhlr'), // Component type
	ascii(TRACK_TYPE_TO_COMPONENT_SUBTYPE[trackData.type]), // Component subtype
	u32(0), // Component manufacturer
	u32(0), // Component flags
	u32(0), // Component flags mask
	ascii(TRACK_TYPE_TO_HANDLER_NAME[trackData.type], true) // Component name
]);

/**
 * Media Information Box: Stores handler-specific information for a track's media data. The media handler uses this
 * information to map from media time to media data and to process the media data.
 */
export const minf = (trackData: IsobmffTrackData) => box('minf', undefined, [
	TRACK_TYPE_TO_HEADER_BOX[trackData.type](),
	dinf(),
	stbl(trackData)
]);

/** Video Media Information Header Box: Defines specific color and graphics mode information. */
export const vmhd = () => fullBox('vmhd', 0, 1, [
	u16(0), // Graphics mode
	u16(0), // Opcolor R
	u16(0), // Opcolor G
	u16(0) // Opcolor B
]);

/** Sound Media Information Header Box: Stores the sound media's control information, such as balance. */
export const smhd = () => fullBox('smhd', 0, 0, [
	u16(0), // Balance
	u16(0) // Reserved
]);

/** Null Media Header Box. */
export const nmhd = () => fullBox('nmhd', 0, 0);	

const TRACK_TYPE_TO_HEADER_BOX: Record<IsobmffTrackData['type'], () => Box> = {
	video: vmhd,
	audio: smhd,
	subtitle: nmhd
};

/**
 * Data Information Box: Contains information specifying the data handler component that provides access to the
 * media data. The data handler component uses the Data Information Box to interpret the media's data.
 */
export const dinf = () => box('dinf', undefined, [
	dref()
]);

/**
 * Data Reference Box: Contains tabular data that instructs the data handler component how to access the media's data.
 */
export const dref = () => fullBox('dref', 0, 0, [
	u32(1) // Entry count
], [
	url()
]);

export const url = () => fullBox('url ', 0, 1); // Self-reference flag enabled

/**
 * Sample Table Box: Contains information for converting from media time to sample number to sample location. This box
 * also indicates how to interpret the sample (for example, whether to decompress the video data and, if so, how).
 */
export const stbl = (trackData: IsobmffTrackData) => {
	const needsCtts = trackData.compositionTimeOffsetTable.length > 1 ||
		trackData.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);

	return box('stbl', undefined, [
		stsd(trackData),
		stts(trackData),
		stss(trackData),
		stsc(trackData),
		stsz(trackData),
		stco(trackData),
		needsCtts ? ctts(trackData) : null
	]);
};

/**
 * Sample Description Box: Stores information that allows you to decode samples in the media. The data stored in the
 * sample description varies, depending on the media type.
 */
export const stsd = (trackData: IsobmffTrackData) => {
	let sampleDescription: Box;

	if (trackData.type === 'video') {
		sampleDescription = videoSampleDescription(
			VIDEO_CODEC_TO_BOX_NAME[trackData.track.source.codec],
			trackData
		)
	} else if (trackData.type === 'audio') {
		sampleDescription = soundSampleDescription(
			AUDIO_CODEC_TO_BOX_NAME[trackData.track.source.codec],
			trackData
		);
	} else if (trackData.type === 'subtitle') {
		sampleDescription = subtitleSampleDescription(
			SUBTITLE_CODEC_TO_BOX_NAME[trackData.track.source.codec],
			trackData
		);
	}

	assert(sampleDescription!);

	return fullBox('stsd', 0, 0, [
		u32(1) // Entry count
	], [
		sampleDescription
	]);
};

/** Video Sample Description Box: Contains information that defines how to interpret video media data. */
export const videoSampleDescription = (
	compressionType: string,
	trackData: IsobmffVideoTrackData
) => box(compressionType, [
	Array(6).fill(0), // Reserved
	u16(1), // Data reference index
	u16(0), // Pre-defined
	u16(0), // Reserved
	Array(12).fill(0), // Pre-defined
	u16(trackData.info.width), // Width
	u16(trackData.info.height), // Height
	u32(0x00480000), // Horizontal resolution
	u32(0x00480000), // Vertical resolution
	u32(0), // Reserved
	u16(1), // Frame count
	Array(32).fill(0), // Compressor name
	u16(0x0018), // Depth
	i16(0xffff) // Pre-defined
], [
	VIDEO_CODEC_TO_CONFIGURATION_BOX[trackData.track.source.codec](trackData)
	// TODO colr
]);

// TODO: All muxers should ensure that the decoder config description is provided for the codecs that require it. This
// is relevant when the user skips WebCodecs and uses their own encoder.

/** AVC Configuration Box: Provides additional information to the decoder. */
export const avcC = (trackData: IsobmffVideoTrackData) => trackData.info.decoderConfig && box('avcC', [
	// For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
	...toUint8Array(trackData.info.decoderConfig.description!)
]);

/** HEVC Configuration Box: Provides additional information to the decoder. */
export const hvcC = (trackData: IsobmffVideoTrackData) => trackData.info.decoderConfig && box('hvcC', [
	// For HEVC, description is a HEVCDecoderConfigurationRecord, so nothing else to do here
	...toUint8Array(trackData.info.decoderConfig.description!)
]);

/** VP Configuration Box: Provides additional information to the decoder. */
export const vpcC = (trackData: IsobmffVideoTrackData) => {
	// Reference: https://www.webmproject.org/vp9/mp4/

	if (!trackData.info.decoderConfig) {
		return null;
	}

	let decoderConfig = trackData.info.decoderConfig;
	if (!decoderConfig.colorSpace) {
		throw new Error(`'colorSpace' is required in the decoder config for VP8/VP9.`);
	}

	let parts = decoderConfig.codec.split('.');
	let profile = Number(parts[1]);
	let level = Number(parts[2]);

	let bitDepth = Number(parts[3]);
	let chromaSubsampling = 0;
	let thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + Number(decoderConfig.colorSpace.fullRange);

	// Set all to undetermined. We could determine them using the codec color space info, but there's no need.
	let colourPrimaries = 2;
	let transferCharacteristics = 2;
	let matrixCoefficients = 2;

	return fullBox('vpcC', 1, 0, [
		u8(profile), // Profile
		u8(level), // Level
		u8(thirdByte), // Bit depth, chroma subsampling, full range
		u8(colourPrimaries), // Colour primaries
		u8(transferCharacteristics), // Transfer characteristics
		u8(matrixCoefficients), // Matrix coefficients
		u16(0) // Codec initialization data size
	]);
};

/** AV1 Configuration Box: Provides additional information to the decoder. */
export const av1C = () => {
	// Reference: https://aomediacodec.github.io/av1-isobmff/

	let marker = 1;
	let version = 1;
	let firstByte = (marker << 7) + version;

	// The box contents are not correct like this, but its length is. Getting the values for the last three bytes
	// requires peeking into the bitstream of the coded chunks. Might come back later.
	return box('av1C', [
		firstByte,
		0,
		0,
		0
	]);
};

/** Sound Sample Description Box: Contains information that defines how to interpret sound media data. */
export const soundSampleDescription = (
	compressionType: string,
	trackData: IsobmffAudioTrackData
) => box(compressionType, [
	Array(6).fill(0), // Reserved
	u16(1), // Data reference index
	u16(0), // Version
	u16(0), // Revision level
	u32(0), // Vendor
	u16(trackData.info.numberOfChannels), // Number of channels
	u16(16), // Sample size (bits)
	u16(0), // Compression ID
	u16(0), // Packet size
	fixed_16_16(trackData.info.sampleRate) // Sample rate
], [
	AUDIO_CODEC_TO_CONFIGURATION_BOX[trackData.track.source.codec](trackData)
]);

/** MPEG-4 Elementary Stream Descriptor Box. */
export const esds = (trackData: IsobmffAudioTrackData) => {
	let description = toUint8Array(trackData.info.decoderConfig.description ?? new ArrayBuffer(0));

	// TODO Compact the 808080 stuff, it's superfluous

	return fullBox('esds', 0, 0, [
		// https://stackoverflow.com/a/54803118
		u32(0x03808080), // TAG(3) = Object Descriptor ([2])
		u8(0x20 + description.byteLength), // length of this OD (which includes the next 2 tags)
		u16(1), // ES_ID = 1
		u8(0x00), // flags etc = 0
		u32(0x04808080), // TAG(4) = ES Descriptor ([2]) embedded in above OD
		u8(0x12 + description.byteLength), // length of this ESD
		u8(0x40), // MPEG-4 Audio
		u8(0x15), // stream type(6bits)=5 audio, flags(2bits)=1
		u24(0), // 24bit buffer size
		u32(0x0001FC17), // max bitrate
		u32(0x0001FC17), // avg bitrate
		u32(0x05808080), // TAG(5) = ASC ([2],[3]) embedded in above OD
		u8(description.byteLength), // length
		...description,
		u32(0x06808080), // TAG(6)
		u8(0x01), // length
		u8(0x02) // data
	]);
};

/** Opus Specific Box. */
export const dOps = (trackData: IsobmffAudioTrackData) => {
	// Default PreSkip, should be at least 80 milliseconds worth of playback, measured in 48000 Hz samples
	let preskip = 3840;
	let gain = 0;

	// Read preskip and from codec private data from the encoder
	// https://www.rfc-editor.org/rfc/rfc7845#section-5
	const description = trackData.info.decoderConfig?.description;
	if (description) {
		if (description.byteLength < 18) {
			throw new TypeError('Invalid decoder description provided for Opus; must be at least 18 bytes long.');
		}

		const view = ArrayBuffer.isView(description)
			? new DataView(description.buffer, description.byteOffset, description.byteLength)
			: new DataView(description);
		preskip = view.getUint16(10, true);
		gain = view.getInt16(14, true);
	}

	return box('dOps', [
		u8(0), // Version
		u8(trackData.info.numberOfChannels), // OutputChannelCount
		u16(preskip),
		u32(trackData.info.sampleRate), // InputSampleRate
		fixed_8_8(gain), // OutputGain
		u8(0) // ChannelMappingFamily
	]);
};

export const subtitleSampleDescription = (
	compressionType: string,
	trackData: IsobmffSubtitleTrackData
) => box(compressionType, [
	Array(6).fill(0), // Reserved
	u16(1), // Data reference index
], [
	SUBTITLE_CODEC_TO_CONFIGURATION_BOX[trackData.track.source.codec](trackData)
])

export const vttC = (trackData: IsobmffSubtitleTrackData) => box('vttC', [
	...textEncoder.encode(trackData.info.config.description)
]);

export const txtC = (textConfig: Uint8Array) => fullBox('txtC', 0, 0, [
	...textConfig, 0 // Text config (null-terminated)
]);

/**
 * Time-To-Sample Box: Stores duration information for a media's samples, providing a mapping from a time in a media
 * to the corresponding data sample. The table is compact, meaning that consecutive samples with the same time delta
 * will be grouped.
 */
export const stts = (trackData: IsobmffTrackData) => {
	return fullBox('stts', 0, 0, [
		u32(trackData.timeToSampleTable.length), // Number of entries
		trackData.timeToSampleTable.map(x => [ // Time-to-sample table
			u32(x.sampleCount), // Sample count
			u32(x.sampleDelta) // Sample duration
		])
	]);
};

/** Sync Sample Box: Identifies the key frames in the media, marking the random access points within a stream. */
export const stss = (trackData: IsobmffTrackData) => {
	if (trackData.samples.every(x => x.type === 'key')) return null; // No stss box -> every frame is a key frame

	let keySamples = [...trackData.samples.entries()].filter(([, sample]) => sample.type === 'key');
	return fullBox('stss', 0, 0, [
		u32(keySamples.length), // Number of entries
		keySamples.map(([index]) => u32(index + 1)) // Sync sample table
	]);
};

/**
 * Sample-To-Chunk Box: As samples are added to a media, they are collected into chunks that allow optimized data
 * access. A chunk contains one or more samples. Chunks in a media may have different sizes, and the samples within a
 * chunk may have different sizes. The Sample-To-Chunk Box stores chunk information for the samples in a media, stored
 * in a compactly-coded fashion.
 */
export const stsc = (trackData: IsobmffTrackData) => {
	return fullBox('stsc', 0, 0, [
		u32(trackData.compactlyCodedChunkTable.length), // Number of entries
		trackData.compactlyCodedChunkTable.map(x => [ // Sample-to-chunk table
			u32(x.firstChunk), // First chunk
			u32(x.samplesPerChunk), // Samples per chunk
			u32(1) // Sample description index
		])
	]);
};

/** Sample Size Box: Specifies the byte size of each sample in the media. */
export const stsz = (trackData: IsobmffTrackData) => fullBox('stsz', 0, 0, [
	u32(0), // Sample size (0 means non-constant size)
	u32(trackData.samples.length), // Number of entries
	trackData.samples.map(x => u32(x.size)) // Sample size table
]);

/** Chunk Offset Box: Identifies the location of each chunk of data in the media's data stream, relative to the file. */
export const stco = (trackData: IsobmffTrackData) => {
	if (trackData.finalizedChunks.length > 0 && last(trackData.finalizedChunks)!.offset! >= 2**32) {
		// If the file is large, use the co64 box
		return fullBox('co64', 0, 0, [
			u32(trackData.finalizedChunks.length), // Number of entries
			trackData.finalizedChunks.map(x => u64(x.offset!)) // Chunk offset table
		]);
	}

	return fullBox('stco', 0, 0, [
		u32(trackData.finalizedChunks.length), // Number of entries
		trackData.finalizedChunks.map(x => u32(x.offset!)) // Chunk offset table
	]);
};

/** Composition Time to Sample Box: Stores composition time offset information (PTS-DTS) for a
 * media's samples. The table is compact, meaning that consecutive samples with the same time
 * composition time offset will be grouped. */
export const ctts = (trackData: IsobmffTrackData) => {
	return fullBox('ctts', 0, 0, [
		u32(trackData.compositionTimeOffsetTable.length), // Number of entries
		trackData.compositionTimeOffsetTable.map(x => [ // Time-to-sample table
			u32(x.sampleCount), // Sample count
			u32(x.sampleCompositionTimeOffset) // Sample offset
		])
	]);
};

/**
 * Movie Extends Box: This box signals to readers that the file is fragmented. Contains a single Track Extends Box
 * for each track in the movie.
 */
export const mvex = (trackDatas: IsobmffTrackData[]) => {
	return box('mvex', undefined, trackDatas.map(trex));
};

/** Track Extends Box: Contains the default values used by the movie fragments. */
export const trex = (trackData: IsobmffTrackData) => {
	return fullBox('trex', 0, 0, [
		u32(trackData.track.id), // Track ID
		u32(1), // Default sample description index
		u32(0), // Default sample duration
		u32(0), // Default sample size
		u32(0) // Default sample flags
	]);
};

/**
 * Movie Fragment Box: The movie fragments extend the presentation in time. They provide the information that would
 * previously have been	in the Movie Box.
 */
export const moof = (sequenceNumber: number, trackDatas: IsobmffTrackData[]) => {
	return box('moof', undefined, [
		mfhd(sequenceNumber),
		...trackDatas.map(traf)
	]);
};

/** Movie Fragment Header Box: Contains a sequence number as a safety check. */
export const mfhd = (sequenceNumber: number) => {
	return fullBox('mfhd', 0, 0, [
		u32(sequenceNumber) // Sequence number
	]);
};

const fragmentSampleFlags = (sample: Sample) => {
	let byte1 = 0;
	let byte2 = 0;
	let byte3 = 0;
	let byte4 = 0;

	let sampleIsDifferenceSample = sample.type === 'delta';
	byte2 |= +sampleIsDifferenceSample;

	if (sampleIsDifferenceSample) {
		byte1 |= 1; // There is redundant coding in this sample
	} else {
		byte1 |= 2; // There is no redundant coding in this sample
	}

	// Note that there are a lot of other flags to potentially set here, but most are irrelevant / non-necessary
	return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
};

/** Track Fragment Box */
export const traf = (trackData: IsobmffTrackData) => {
	return box('traf', undefined, [
		tfhd(trackData),
		tfdt(trackData),
		trun(trackData)
	]);
};

/** Track Fragment Header Box: Provides a reference to the extended track, and flags. */
export const tfhd = (trackData: IsobmffTrackData) => {
	assert(trackData.currentChunk);

	let tfFlags = 0;
	tfFlags |= 0x00008; // Default sample duration present
	tfFlags |= 0x00010; // Default sample size present
	tfFlags |= 0x00020; // Default sample flags present
	tfFlags |= 0x20000; // Default base is moof

	// Prefer the second sample over the first one, as the first one is a sync sample and therefore the "odd one out"
	let referenceSample = trackData.currentChunk.samples[1] ?? trackData.currentChunk.samples[0]!;
	let referenceSampleInfo = {
		duration: referenceSample.timescaleUnitsToNextSample,
		size: referenceSample.size,
		flags: fragmentSampleFlags(referenceSample)
	};

	return fullBox('tfhd', 0, tfFlags, [
		u32(trackData.track.id), // Track ID
		u32(referenceSampleInfo.duration), // Default sample duration
		u32(referenceSampleInfo.size), // Default sample size
		u32(referenceSampleInfo.flags) // Default sample flags
	]);
};

/**
 * Track Fragment Decode Time Box: Provides the absolute decode time of the first sample of the fragment. This is
 * useful for performing random access on the media file.
 */
export const tfdt = (trackData: IsobmffTrackData) => {
	assert(trackData.currentChunk);

	return fullBox('tfdt', 1, 0, [
		u64(intoTimescale(trackData.currentChunk.startTimestamp, trackData.timescale)) // Base Media Decode Time
	]);
};

/** Track Run Box: Specifies a run of contiguous samples for a given track. */
export const trun = (trackData: IsobmffTrackData) => {
	assert(trackData.currentChunk);

	let allSampleDurations = trackData.currentChunk.samples.map(x => x.timescaleUnitsToNextSample);
	let allSampleSizes = trackData.currentChunk.samples.map(x => x.size);
	let allSampleFlags = trackData.currentChunk.samples.map(fragmentSampleFlags);
	let allSampleCompositionTimeOffsets = trackData.currentChunk.samples.
		map(x => intoTimescale(x.timestamp - x.decodeTimestamp, trackData.timescale));

	let uniqueSampleDurations = new Set(allSampleDurations);
	let uniqueSampleSizes = new Set(allSampleSizes);
	let uniqueSampleFlags = new Set(allSampleFlags);
	let uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);

	let firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
	let sampleDurationPresent = uniqueSampleDurations.size > 1;
	let sampleSizePresent = uniqueSampleSizes.size > 1;
	let sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
	let sampleCompositionTimeOffsetsPresent =
		uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some(x => x !== 0);

	let flags = 0;
	flags |= 0x0001; // Data offset present
	flags |= 0x0004 * +firstSampleFlagsPresent; // First sample flags present
	flags |= 0x0100 * +sampleDurationPresent; // Sample duration present
	flags |= 0x0200 * +sampleSizePresent; // Sample size present
	flags |= 0x0400 * +sampleFlagsPresent; // Sample flags present
	flags |= 0x0800 * +sampleCompositionTimeOffsetsPresent; // Sample composition time offsets present

	return fullBox('trun', 1, flags, [
		u32(trackData.currentChunk.samples.length), // Sample count
		u32(trackData.currentChunk.offset! - trackData.currentChunk.moofOffset! || 0), // Data offset
		firstSampleFlagsPresent ? u32(allSampleFlags[0]!) : [],
		trackData.currentChunk.samples.map((_, i) => [
			sampleDurationPresent ? u32(allSampleDurations[i]!) : [], // Sample duration
			sampleSizePresent ? u32(allSampleSizes[i]!) : [], // Sample size
			sampleFlagsPresent ? u32(allSampleFlags[i]!) : [], // Sample flags
			// Sample composition time offsets
			sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]!) : []
		])
	]);
};

/**
 * Movie Fragment Random Access Box: For each track, provides pointers to sync samples within the file
 * for random access.
 */
export const mfra = (trackDatas: IsobmffTrackData[]) => {
	return box('mfra', undefined, [
		...trackDatas.map(tfra),
		mfro()
	]);
};

/** Track Fragment Random Access Box: Provides pointers to sync samples within the file for random access. */
export const tfra = (trackData: IsobmffTrackData, trackIndex: number) => {
	let version = 1; // Using this version allows us to use 64-bit time and offset values

	return fullBox('tfra', version, 0, [
		u32(trackData.track.id), // Track ID
		u32(0b111111), // This specifies that traf number, trun number and sample number are 32-bit ints
		u32(trackData.finalizedChunks.length), // Number of entries
		trackData.finalizedChunks.map(chunk => [
			u64(intoTimescale(chunk.startTimestamp, trackData.timescale)), // Time
			u64(chunk.moofOffset!), // moof offset
			u32(trackIndex + 1), // traf number
			u32(1), // trun number
			u32(1) // Sample number
		])
	]);
};

/**
 * Movie Fragment Random Access Offset Box: Provides the size of the enclosing mfra box. This box can be used by readers
 * to quickly locate the mfra box by searching from the end of the file.
 */
export const mfro = () => {
	return fullBox('mfro', 0, 0, [
		// This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
		// is known
		u32(0) // Size
	]);
};

/** VTT Empty Cue Box */
export const vtte = () => box('vtte');

/** VTT Cue Box */
export const vttc = (payload: string, timestamp: number | null, identifier: string | null, settings: string | null, sourceId: number | null) => box('vttc', undefined, [
	sourceId !== null ? box('vsid', [i32(sourceId)]) : null,
	identifier !== null ? box('iden', [...textEncoder.encode(identifier)]) : null,
	timestamp !== null ? box('ctim', [...textEncoder.encode(formatSubtitleTimestamp(timestamp))]) : null,
	settings !== null ? box('sttg', [...textEncoder.encode(settings)]) : null,
	box('payl', [...textEncoder.encode(payload)])
]);

/** VTT Additional Text Box */
export const vtta = (notes: string) => box('vtta', [...textEncoder.encode(notes)]);

const VIDEO_CODEC_TO_BOX_NAME: Record<VideoCodec, string> = {
	'avc': 'avc1',
	'hevc': 'hvc1',
	'vp8': 'vp08',
	'vp9': 'vp09',
	'av1': 'av01'
};

const VIDEO_CODEC_TO_CONFIGURATION_BOX: Record<VideoCodec, (trackData: IsobmffVideoTrackData) => Box | null> = {
	'avc': avcC,
	'hevc': hvcC,
	'vp8': vpcC,
	'vp9': vpcC,
	'av1': av1C
};

const AUDIO_CODEC_TO_BOX_NAME: Record<AudioCodec, string> = {
	'aac': 'mp4a',
	'opus': 'Opus'
};

const AUDIO_CODEC_TO_CONFIGURATION_BOX: Record<AudioCodec, (trackData: IsobmffAudioTrackData) => Box | null> = {
	'aac': esds,
	'opus': dOps
};

const SUBTITLE_CODEC_TO_BOX_NAME: Record<SubtitleCodec, string> = {
	'webvtt': 'wvtt'
};

const SUBTITLE_CODEC_TO_CONFIGURATION_BOX: Record<SubtitleCodec, (trackData: IsobmffSubtitleTrackData) => Box | null> = {
	'webvtt': vttC
};