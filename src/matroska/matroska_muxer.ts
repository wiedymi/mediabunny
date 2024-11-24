import { assert, COLOR_PRIMARIES_MAP, colorSpaceIsComplete, MATRIX_COEFFICIENTS_MAP, readBits, textEncoder, toUint8Array, TRANSFER_CHARACTERISTICS_MAP, writeBits } from '../misc';
import { Muxer } from '../muxer';
import { Output, OutputAudioTrack, OutputSubtitleTrack, OutputTrack, OutputVideoTrack } from '../output';
import { MkvOutputFormat, WebMOutputFormat } from '../output_format';
import { AudioCodec, SubtitleCodec, VideoCodec } from '../source';
import { formatSubtitleTimestamp, inlineTimestampRegex, parseSubtitleTimestamp, SubtitleConfig, SubtitleCue, SubtitleMetadata } from '../subtitles';
import { Writer } from '../writer';
import { EBML, EBMLElement, EBMLFloat32, EBMLFloat64, EBMLId, EBMLSignedInt, measureEBMLVarInt, measureSignedInt, measureUnsignedInt } from './ebml';

const MAX_CHUNK_LENGTH_MS = 2**15;
const APP_NAME = 'https://github.com/Vanilagy/webm-muxer'; // TODO
const SEGMENT_SIZE_BYTES = 6;
const CLUSTER_SIZE_BYTES = 5;

type InternalMediaChunk = {
	data: Uint8Array,
	type: 'key' | 'delta',
	timestamp: number,
	duration: number,
	additions: Uint8Array | null,
};

type SeekHead = {
	id: number,
	data: {
		id: number,
		data: ({
			id: number,
			data: Uint8Array,
			size?: undefined
		} | {
			id: number,
			size: number,
			data: number
		})[]
	}[]
};

type MatroskaTrackData = {
	chunkQueue: InternalMediaChunk[],
	lastWrittenMsTimestamp: number | null
} & ({
	track: OutputVideoTrack,
	type: 'video',
	info: {
		width: number,
		height: number,
		decoderConfig: VideoDecoderConfig
	}
} | {
	track: OutputAudioTrack,
	type: 'audio',
	info: {
		numberOfChannels: number,
		sampleRate: number,
		decoderConfig: AudioDecoderConfig
	}
} | {
	track: OutputSubtitleTrack,
	type: 'subtitle',
	info: {
		config: SubtitleConfig
	}
});

type MatroskaVideoTrackData = MatroskaTrackData & { type: 'video' };
type MatroskaAudioTrackData = MatroskaTrackData & { type: 'audio' };
type MatroskaSubtitleTrackData = MatroskaTrackData & { type: 'subtitle' };

const CODEC_STRING_MAP: Record<VideoCodec | AudioCodec | SubtitleCodec, string> = {
	avc: 'V_MPEG4/ISO/AVC',
	hevc: 'V_MPEGH/ISO/HEVC',
	vp8: 'V_VP8',
	vp9: 'V_VP9',
	av1: 'V_AV1',
	aac: 'A_AAC',
	opus: 'A_OPUS',
	webvtt: 'S_TEXT/WEBVTT'
};

const TRACK_TYPE_MAP: Record<OutputTrack['type'], number> = {
	video: 1,
	audio: 2,
	subtitle: 17
};

// TODO: Perhaps we can make this muxer always be streamable. We can do it similar to the MP4 muxer, where for each 
// cluster, we hold onto all of the chunks (called sample there), until it's done, and then we write it out in one go.
// This way, we can set proper headers. Will just mean a bit more memory usage.
// Update: Not really. There are duration fields and seek fields that are just uneditable if streaming is required.

export class MatroskaMuxer extends Muxer {
	override timestampsMustStartAtZero = true;

	#writer: Writer;
	#format: WebMOutputFormat | MkvOutputFormat;

	#helper = new Uint8Array(8);
	#helperView = new DataView(this.#helper.buffer);

	/**
	 * Stores the position from the start of the file to where EBML elements have been written. This is used to
	 * rewrite/edit elements that were already added before, and to measure sizes of things.
	 */
	offsets = new WeakMap<EBML, number>();
	/** Same as offsets, but stores position where the element's data starts (after ID and size fields). */
	dataOffsets = new WeakMap<EBML, number>();

	#trackDatas: MatroskaTrackData[] = [];

	#segment: EBMLElement | null = null;
	#segmentInfo: EBMLElement | null = null;
	#seekHead: SeekHead | null = null;
	#tracksElement: EBMLElement | null = null;
	#segmentDuration: EBMLElement | null = null;
	#cues: EBMLElement | null = null;

	#currentCluster: EBMLElement | null = null;
	#currentClusterMsTimestamp: number | null = null;
	#trackDatasInCurrentCluster = new Set<MatroskaTrackData>();

	#duration = 0;

	constructor(output: Output, format: MkvOutputFormat) {
		super(output);

		this.#writer = output.writer;
		this.#format = format;
	}

	#writeByte(value: number) {
		this.#helperView.setUint8(0, value);
		this.#writer.write(this.#helper.subarray(0, 1));
	}

	#writeFloat32(value: number) {
		this.#helperView.setFloat32(0, value, false);
		this.#writer.write(this.#helper.subarray(0, 4));
	}

	#writeFloat64(value: number) {
		this.#helperView.setFloat64(0, value, false);
		this.#writer.write(this.#helper);
	}

	#writeUnsignedInt(value: number, width = measureUnsignedInt(value)) {
		let pos = 0;

		// Each case falls through:
		switch (width) {
			case 6:
				// Need to use division to access >32 bits of floating point var
				this.#helperView.setUint8(pos++, (value / 2**40) | 0);
			case 5:
				this.#helperView.setUint8(pos++, (value / 2**32) | 0);
			case 4:
				this.#helperView.setUint8(pos++, value >> 24);
			case 3:
				this.#helperView.setUint8(pos++, value >> 16);
			case 2:
				this.#helperView.setUint8(pos++, value >> 8);
			case 1:
				this.#helperView.setUint8(pos++, value);
				break;
			default:
				throw new Error('Bad UINT size ' + width);
		}

		this.#writer.write(this.#helper.subarray(0, pos));
	}

	#writeSignedInt(value: number, width = measureSignedInt(value)) {
		if (value < 0) {
			// Two's complement stuff
			value += 2 ** (width * 8);
		}

		this.#writeUnsignedInt(value, width);
	}

	writeEBMLVarInt(value: number, width = measureEBMLVarInt(value)) {
		let pos = 0;

		switch (width) {
			case 1:
				this.#helperView.setUint8(pos++, (1 << 7) | value);
				break;
			case 2:
				this.#helperView.setUint8(pos++, (1 << 6) | (value >> 8));
				this.#helperView.setUint8(pos++, value);
				break;
			case 3:
				this.#helperView.setUint8(pos++, (1 << 5) | (value >> 16));
				this.#helperView.setUint8(pos++, value >> 8);
				this.#helperView.setUint8(pos++, value);
				break;
			case 4:
				this.#helperView.setUint8(pos++, (1 << 4) | (value >> 24));
				this.#helperView.setUint8(pos++, value >> 16);
				this.#helperView.setUint8(pos++, value >> 8);
				this.#helperView.setUint8(pos++, value);
				break;
			case 5:
				/**
				 * JavaScript converts its doubles to 32-bit integers for bitwise
				 * operations, so we need to do a division by 2^32 instead of a
				 * right-shift of 32 to retain those top 3 bits
				 */
				this.#helperView.setUint8(pos++, (1 << 3) | ((value / 2**32) & 0x7));
				this.#helperView.setUint8(pos++, value >> 24);
				this.#helperView.setUint8(pos++, value >> 16);
				this.#helperView.setUint8(pos++, value >> 8);
				this.#helperView.setUint8(pos++, value);
				break;
			case 6:
				this.#helperView.setUint8(pos++, (1 << 2) | ((value / 2**40) & 0x3));
				this.#helperView.setUint8(pos++, (value / 2**32) | 0);
				this.#helperView.setUint8(pos++, value >> 24);
				this.#helperView.setUint8(pos++, value >> 16);
				this.#helperView.setUint8(pos++, value >> 8);
				this.#helperView.setUint8(pos++, value);
				break;
			default:
				throw new Error('Bad EBML VINT size ' + width);
		}

		this.#writer.write(this.#helper.subarray(0, pos));
	}

	// Assumes the string is ASCII
	#writeString(str: string) {
		this.#writer.write(new Uint8Array(str.split('').map(x => x.charCodeAt(0))));
	}

	writeEBML(data: EBML | null) {
		if (data === null) return;

		if (data instanceof Uint8Array) {
			this.#writer.write(data);
		} else if (Array.isArray(data)) {
			for (let elem of data) {
				this.writeEBML(elem);
			}
		} else {
			this.offsets.set(data, this.#writer.getPos());

			this.#writeUnsignedInt(data.id); // ID field

			if (Array.isArray(data.data)) {
				let sizePos = this.#writer.getPos();
				let sizeSize = data.size === -1 ? 1 : (data.size ?? 4);

				if (data.size === -1) {
					// Write the reserved all-one-bits marker for unknown/unbounded size.
					this.#writeByte(0xff);
				} else {
					this.#writer.seek(this.#writer.getPos() + sizeSize);
				}

				let startPos = this.#writer.getPos();
				this.dataOffsets.set(data, startPos);
				this.writeEBML(data.data);

				if (data.size !== -1) {
					let size = this.#writer.getPos() - startPos;
					let endPos = this.#writer.getPos();
					this.#writer.seek(sizePos);
					this.writeEBMLVarInt(size, sizeSize);
					this.#writer.seek(endPos);
				}
			} else if (typeof data.data === 'number') {
				let size = data.size ?? measureUnsignedInt(data.data);
				this.writeEBMLVarInt(size);
				this.#writeUnsignedInt(data.data, size);
			} else if (typeof data.data === 'string') {
				this.writeEBMLVarInt(data.data.length);
				this.#writeString(data.data);
			} else if (data.data instanceof Uint8Array) {
				this.writeEBMLVarInt(data.data.byteLength, data.size);
				this.#writer.write(data.data);
			} else if (data.data instanceof EBMLFloat32) {
				this.writeEBMLVarInt(4);
				this.#writeFloat32(data.data.value);
			} else if (data.data instanceof EBMLFloat64) {
				this.writeEBMLVarInt(8);
				this.#writeFloat64(data.data.value);
			} else if (data.data instanceof EBMLSignedInt) {
				let size = data.size ?? measureSignedInt(data.data.value);
				this.writeEBMLVarInt(size);
				this.#writeSignedInt(data.data.value, size);
			}
		}
	}

	override beforeTrackAdd(track: OutputTrack) {
		if (!(this.#format instanceof WebMOutputFormat))  {
			return;
		}

		if (track.type === 'video') {
			if (!['vp8', 'vp9', 'av1'].includes(track.source.codec)) {
				throw new Error(`WebM only supports VP8, VP9 and AV1 as video codecs. Switching to MKV removes this restriction.`);
			}
		} else if (track.type === 'audio') {
			if (!['opus', 'vorbis'].includes(track.source.codec)) {
				throw new Error(`WebM only supports Opus and Vorbis as audio codecs. Switching to MKV removes this restriction.`);
			}
		} else if (track.type === 'subtitle') {
			if (track.source.codec !== 'webvtt') {
				throw new Error(`WebM only supports WebVTT as subtitle codec. Switching to MKV removes this restriction.`);
			}
		} else {
			throw new Error('WebM only supports video, audio and subtitle tracks. Switching to MKV removes this restriction.');
		}
	}

	start() {
		this.#writeEBMLHeader();

		if (!this.#format.options.streaming) {
			this.#createSeekHead();
		}

		this.#createSegmentInfo();
		this.#createCues();

		this.#writer.flush();
	}

	#writeEBMLHeader() {
		let ebmlHeader: EBML = { id: EBMLId.EBML, data: [
			{ id: EBMLId.EBMLVersion, data: 1 },
			{ id: EBMLId.EBMLReadVersion, data: 1 },
			{ id: EBMLId.EBMLMaxIDLength, data: 4 },
			{ id: EBMLId.EBMLMaxSizeLength, data: 8 },
			{ id: EBMLId.DocType, data: this.#format instanceof WebMOutputFormat ? 'webm' : 'matroska' },
			{ id: EBMLId.DocTypeVersion, data: 2 },
			{ id: EBMLId.DocTypeReadVersion, data: 2 }
		] };
		this.writeEBML(ebmlHeader);
	}

	/**
	 * Creates a SeekHead element which is positioned near the start of the file and allows the media player to seek to
	 * relevant sections more easily. Since we don't know the positions of those sections yet, we'll set them later.
	 */
	#createSeekHead() {
		const kaxCues = new Uint8Array([ 0x1c, 0x53, 0xbb, 0x6b ]);
		const kaxInfo = new Uint8Array([ 0x15, 0x49, 0xa9, 0x66 ]);
		const kaxTracks = new Uint8Array([ 0x16, 0x54, 0xae, 0x6b ]);

		let seekHead = { id: EBMLId.SeekHead, data: [
			{ id: EBMLId.Seek, data: [
				{ id: EBMLId.SeekID, data: kaxCues },
				{ id: EBMLId.SeekPosition, size: 5, data: 0 }
			] },
			{ id: EBMLId.Seek, data: [
				{ id: EBMLId.SeekID, data: kaxInfo },
				{ id: EBMLId.SeekPosition, size: 5, data: 0 }
			] },
			{ id: EBMLId.Seek, data: [
				{ id: EBMLId.SeekID, data: kaxTracks },
				{ id: EBMLId.SeekPosition, size: 5, data: 0 }
			] }
		] };
		this.#seekHead = seekHead;
	}

	#createSegmentInfo() {
		let segmentDuration: EBML = { id: EBMLId.Duration, data: new EBMLFloat64(0) };
		this.#segmentDuration = segmentDuration;

		let segmentInfo: EBML = { id: EBMLId.Info, data: [
			{ id: EBMLId.TimestampScale, data: 1e6 },
			{ id: EBMLId.MuxingApp, data: APP_NAME },
			{ id: EBMLId.WritingApp, data: APP_NAME },
			!this.#format.options.streaming ? segmentDuration : null
		] };
		this.#segmentInfo = segmentInfo;
	}

	#createTracks() {
		let tracksElement = { id: EBMLId.Tracks, data: [] as EBML[] };
		this.#tracksElement = tracksElement;

		for (let trackData of this.#trackDatas) {
			tracksElement.data.push({ id: EBMLId.TrackEntry, data: [
				{ id: EBMLId.TrackNumber, data: trackData.track.id },
				{ id: EBMLId.TrackUID, data: trackData.track.id },
				{ id: EBMLId.TrackType, data: TRACK_TYPE_MAP[trackData.type] }, // TODO Subtitle case
				{ id: EBMLId.CodecID, data: CODEC_STRING_MAP[trackData.track.source.codec] },
				...(trackData.type === 'video' ? [
					(trackData.info.decoderConfig.description ? { id: EBMLId.CodecPrivate, data: toUint8Array(trackData.info.decoderConfig.description) } : null),
					(trackData.track.metadata.frameRate ? { id: EBMLId.DefaultDuration, data: 1e9 / trackData.track.metadata.frameRate } : null),
					{ id: EBMLId.Video, data: [
						{ id: EBMLId.PixelWidth, data: trackData.info.width },
						{ id: EBMLId.PixelHeight, data: trackData.info.height },
						(() => {
							if (trackData.info.decoderConfig.colorSpace) {
								let colorSpace = trackData.info.decoderConfig.colorSpace;
								if (!colorSpaceIsComplete(colorSpace)) {
									return null;
								}

								return {id: EBMLId.Colour, data: [
									{ id: EBMLId.MatrixCoefficients, data: MATRIX_COEFFICIENTS_MAP[colorSpace.matrix!] },
									{ id: EBMLId.TransferCharacteristics, data: TRANSFER_CHARACTERISTICS_MAP[colorSpace.transfer!] },
									{ id: EBMLId.Primaries, data: COLOR_PRIMARIES_MAP[colorSpace.primaries!] },
									{ id: EBMLId.Range, data: [1, 2][Number(colorSpace.fullRange)]! }
								] };
							}

							return null;
						})()
					] }
				] : []),
				...(trackData.type === 'audio' ? [
					(trackData.info.decoderConfig.description ? { id: EBMLId.CodecPrivate, data: toUint8Array(trackData.info.decoderConfig.description) } : null),
					{ id: EBMLId.Audio, data: [
						{ id: EBMLId.SamplingFrequency, data: new EBMLFloat32(trackData.info.sampleRate) },
						{ id: EBMLId.Channels, data: trackData.info.numberOfChannels },
						// Bit depth for when PCM is a thing
					] }
				] : []),
				...(trackData.type === 'subtitle' ? [
					{ id: EBMLId.CodecPrivate, data: textEncoder.encode(trackData.info.config.description) }
				] : []),
			] })
		}
	}

	#createSegment() {
		let segment: EBML = {
			id: EBMLId.Segment,
			size: this.#format.options.streaming ? -1 : SEGMENT_SIZE_BYTES,
			data: [
				!this.#format.options.streaming ? this.#seekHead as EBML : null,
				this.#segmentInfo,
				this.#tracksElement
			]
		};
		this.#segment = segment;

		this.writeEBML(segment);

		/*
		if (this.#writer instanceof BaseStreamTargetWriter && this.#writer.target.options.onHeader) {
			let { data, start } = this.#writer.getTrackedWrites(); // start should be 0
			this.#writer.target.options.onHeader(data, start);
		}
		*/
	}

	#createCues() {
		this.#cues = { id: EBMLId.Cues, data: [] };
	}

	get #segmentDataOffset() {
		assert(this.#segment);
		return this.dataOffsets.get(this.#segment)!;
	}

	#getVideoTrackData(track: OutputVideoTrack, meta?: EncodedVideoChunkMetadata) {
		const existingTrackData = this.#trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData as MatroskaVideoTrackData;
		}

		// TODO Make proper errors for these
		assert(meta);
		assert(meta.decoderConfig);
		assert(meta.decoderConfig.codedWidth !== undefined);
		assert(meta.decoderConfig.codedHeight !== undefined);

		const newTrackData: MatroskaVideoTrackData = {
			track,
			type: 'video',
			info: {
				width: meta.decoderConfig.codedWidth,
				height: meta.decoderConfig.codedHeight,
				decoderConfig: meta.decoderConfig
			},
			chunkQueue: [],
			lastWrittenMsTimestamp: null
		};

		this.#trackDatas.push(newTrackData);
		this.#trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	#getAudioTrackData(track: OutputAudioTrack, meta?: EncodedAudioChunkMetadata) {
		const existingTrackData = this.#trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData as MatroskaAudioTrackData;
		}

		// TODO Make proper errors for these
		assert(meta);
		assert(meta.decoderConfig);

		const newTrackData: MatroskaAudioTrackData = {
			track,
			type: 'audio',
			info: {
				numberOfChannels: meta.decoderConfig.numberOfChannels,
				sampleRate: meta.decoderConfig.sampleRate,
				decoderConfig: meta.decoderConfig
			},
			chunkQueue: [],
			lastWrittenMsTimestamp: null
		};

		this.#trackDatas.push(newTrackData);
		this.#trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	#getSubtitleTrackData(track: OutputSubtitleTrack, meta?: SubtitleMetadata) {
		const existingTrackData = this.#trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData as MatroskaAudioTrackData;
		}

		// TODO Make proper errors for these
		assert(meta);
		assert(meta.config);

		const newTrackData: MatroskaSubtitleTrackData = {
			track,
			type: 'subtitle',
			info: {
				config: meta.config
			},
			chunkQueue: [],
			lastWrittenMsTimestamp: null
		};

		this.#trackDatas.push(newTrackData);
		this.#trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}
	
	addEncodedVideoChunk(track: OutputVideoTrack, chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
		const trackData = this.#getVideoTrackData(track, meta);

		let data = new Uint8Array(chunk.byteLength);
		chunk.copyTo(data);

		let timestamp = this.validateAndNormalizeTimestamp(trackData.track, chunk.timestamp, chunk.type === 'key');
		let videoChunk = this.#createInternalChunk(data, timestamp, (chunk.duration ?? 0) / 1e6, chunk.type);
		if (track.source.codec === 'vp9') this.#fixVP9ColorSpace(trackData, videoChunk);

		trackData.chunkQueue.push(videoChunk);	
		this.#interleaveChunks();
	}

	addEncodedAudioChunk(track: OutputAudioTrack, chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) {
		const trackData = this.#getAudioTrackData(track, meta);

		let data = new Uint8Array(chunk.byteLength);
		chunk.copyTo(data);

		let timestamp = this.validateAndNormalizeTimestamp(trackData.track, chunk.timestamp, chunk.type === 'key');
		let audioChunk = this.#createInternalChunk(data, timestamp, (chunk.duration ?? 0) / 1e6, chunk.type);

		trackData.chunkQueue.push(audioChunk);
		this.#interleaveChunks();
	}
	
	addSubtitleCue(track: OutputSubtitleTrack, cue: SubtitleCue, meta?: SubtitleMetadata) {
		const trackData = this.#getSubtitleTrackData(track, meta);

		const timestamp = this.validateAndNormalizeTimestamp(trackData.track, 1e6 * cue.timestamp, true);

		let bodyText = cue.text;
		const timestampMs = Math.floor(timestamp * 1000);

		// Replace in-body timestamps so that they're relative to the cue start time
		inlineTimestampRegex.lastIndex = 0;
		bodyText = bodyText.replace(inlineTimestampRegex, (match) => {
			let time = parseSubtitleTimestamp(match.slice(1, -1));
			let offsetTime = time - timestampMs;

			return `<${formatSubtitleTimestamp(offsetTime)}>`;
		});

		const body = textEncoder.encode(bodyText);
		const additions = `${cue.settings ?? ''}\n${cue.identifier ?? ''}\n${cue.notes ?? ''}`;

		let subtitleChunk = this.#createInternalChunk(body, timestamp, cue.duration, 'key', additions.trim() ? textEncoder.encode(additions) : null);

		trackData.chunkQueue.push(subtitleChunk);
		this.#interleaveChunks();
	}

	#interleaveChunks() {
		for (const track of this.output.tracks) {
			if (!track.source.closed && !this.#trackDatas.some(x => x.track === track)) {
				return; // We haven't seen a sample from this open track yet
			}
		}

		outer:
		while (true) {
			let trackWithMinTimestamp: MatroskaTrackData | null = null;
			let minTimestamp = Infinity;

			for (let trackData of this.#trackDatas) {
				if (trackData.chunkQueue.length === 0 && !trackData.track.source.closed) {
					break outer;
				}

				if (trackData.chunkQueue.length > 0 && trackData.chunkQueue[0]!.timestamp < minTimestamp) {
					trackWithMinTimestamp = trackData;
					minTimestamp = trackData.chunkQueue[0]!.timestamp;
				}
			}

			if (!trackWithMinTimestamp) {
				break;
			}

			let chunk = trackWithMinTimestamp.chunkQueue.shift()!;
			this.#writeBlock(trackWithMinTimestamp, chunk);
		}

		this.#writer.flush();
	}

	/** Due to [a bug in Chromium](https://bugs.chromium.org/p/chromium/issues/detail?id=1377842), VP9 streams often
	 * lack color space information. This method patches in that information. */
	// http://downloads.webmproject.org/docs/vp9/vp9-bitstream_superframe-and-uncompressed-header_v1.0.pdf
	#fixVP9ColorSpace(trackData: MatroskaVideoTrackData, chunk: InternalMediaChunk) {
		if (chunk.type !== 'key') return;
		if (!trackData.info.decoderConfig.colorSpace || !trackData.info.decoderConfig.colorSpace.matrix) return;

		let i = 0;
		// Check if it's a "superframe"
		if (readBits(chunk.data, 0, 2) !== 0b10) return; i += 2;

		let profile = (readBits(chunk.data, i+1, i+2) << 1) + readBits(chunk.data, i+0, i+1); i += 2;
		if (profile === 3) i++;

		let showExistingFrame = readBits(chunk.data, i+0, i+1); i++;
		if (showExistingFrame) return;

		let frameType = readBits(chunk.data, i+0, i+1); i++;
		if (frameType !== 0) return; // Just to be sure

		i += 2;

		let syncCode = readBits(chunk.data, i+0, i+24); i += 24;
		if (syncCode !== 0x498342) return;

		if (profile >= 2) i++;

		let colorSpaceID = {
			'rgb': 7,
			'bt709': 2,
			'bt470bg': 1,
			'smpte170m': 3
		}[trackData.info.decoderConfig.colorSpace.matrix];
		writeBits(chunk.data, i+0, i+3, colorSpaceID);
	}

	/** Converts a read-only external chunk into an internal one for easier use. */
	#createInternalChunk(
		data: Uint8Array,
		timestamp: number,
		duration: number,
		type: 'key' | 'delta',
		additions: Uint8Array | null = null
	) {
		let internalChunk: InternalMediaChunk = {
			data,
			type,
			timestamp,
			duration,
			additions
		};

		return internalChunk;
	}

	/** Writes a block containing media data to the file. */
	#writeBlock(trackData: MatroskaTrackData, chunk: InternalMediaChunk) {
		// TODO Update this comment. This code always runs now
		// When streaming, we create the tracks and segment after we've received the first media chunks.
		// Due to the interlacing algorithm, this code will be run once we've seen one chunk from every media track.
		if (!this.#segment) {
			this.#createTracks();
			this.#createSegment();
		}

		let msTimestamp = Math.floor(1000 * chunk.timestamp);
		// We can only finalize this fragment (and begin a new one) if we know that each track will be able to
		// start the new one with a key frame.
		const keyFrameQueuedEverywhere = this.#trackDatas.every(otherTrackData => {
			if (otherTrackData.track.source.closed) {
				return true;
			}

			if (trackData === otherTrackData) {
				return chunk.type === 'key';
			}

			const firstQueuedSample = otherTrackData.chunkQueue[0];
			return firstQueuedSample && firstQueuedSample.type === 'key';
		});

		if (
			!this.#currentCluster ||
			(keyFrameQueuedEverywhere && msTimestamp - this.#currentClusterMsTimestamp! >= 1000)
		) {
			this.#createNewCluster(msTimestamp);
		}

		let relativeTimestamp = msTimestamp - this.#currentClusterMsTimestamp!;
		if (relativeTimestamp < 0) {
			// The chunk lies outside of the current cluster
			return;
		}

		let clusterIsTooLong = relativeTimestamp >= MAX_CHUNK_LENGTH_MS;
		if (clusterIsTooLong) {
			throw new Error(
				`Current Matroska cluster exceeded its maximum allowed length of ${MAX_CHUNK_LENGTH_MS} ` +
				`milliseconds. In order to produce a correct WebM file, you must pass in a key frame at least every ` +
				`${MAX_CHUNK_LENGTH_MS} milliseconds.`
			);
		}

		let prelude = new Uint8Array(4);
		let view = new DataView(prelude.buffer);
		// 0x80 to indicate it's the last byte of a multi-byte number
		view.setUint8(0, 0x80 | trackData.track.id);
		view.setInt16(1, relativeTimestamp, false);

		let msDuration = Math.floor(1000 * chunk.duration);

		if (msDuration === 0 && !chunk.additions) {
			// No duration or additions, we can write out a SimpleBlock
			view.setUint8(3, Number(chunk.type === 'key') << 7); // Flags (keyframe flag only present for SimpleBlock)

			let simpleBlock = { id: EBMLId.SimpleBlock, data: [
				prelude,
				chunk.data
			] };
			this.writeEBML(simpleBlock);
		} else {
			let blockGroup = { id: EBMLId.BlockGroup, data: [
				{ id: EBMLId.Block, data: [
					prelude,
					chunk.data
				] },
				chunk.type === 'delta' ? { id: EBMLId.ReferenceBlock, data: new EBMLSignedInt(trackData.lastWrittenMsTimestamp! - msTimestamp) } : null,
				chunk.additions ? { id: EBMLId.BlockAdditions, data: [
					{ id: EBMLId.BlockMore, data: [
						{ id: EBMLId.BlockAdditional, data: chunk.additions },
						{ id: EBMLId.BlockAddID, data: 1 }
					] }
				] } : null,
				msDuration > 0 ? { id: EBMLId.BlockDuration, data: msDuration } : null
			] };
			this.writeEBML(blockGroup);
		}

		this.#duration = Math.max(this.#duration, msTimestamp + msDuration);
		trackData.lastWrittenMsTimestamp = msTimestamp;

		this.#trackDatasInCurrentCluster.add(trackData);
	}

	/** Creates a new Cluster element to contain media chunks. */
	#createNewCluster(msTimestamp: number) {
		if (this.#currentCluster && !this.#format.options.streaming) {
			this.#finalizeCurrentCluster();
		}

		/*
		if (this.#writer instanceof BaseStreamTargetWriter && this.#writer.target.options.onCluster) {
			this.#writer.startTrackingWrites();
		}
		*/

		this.#currentCluster = {
			id: EBMLId.Cluster,
			size: this.#format.options.streaming ? -1 : CLUSTER_SIZE_BYTES,
			data: [
				{ id: EBMLId.Timestamp, data: msTimestamp }
			]
		};
		this.writeEBML(this.#currentCluster);

		this.#currentClusterMsTimestamp = msTimestamp;
		this.#trackDatasInCurrentCluster.clear();
	}

	#finalizeCurrentCluster() {
		assert(this.#currentCluster);
		let clusterSize = this.#writer.getPos() - this.dataOffsets.get(this.#currentCluster)!;
		let endPos = this.#writer.getPos();

		// Write the size now that we know it
		this.#writer.seek(this.offsets.get(this.#currentCluster)! + 4);
		this.writeEBMLVarInt(clusterSize, CLUSTER_SIZE_BYTES);
		this.#writer.seek(endPos);

		/*
		if (this.#writer instanceof BaseStreamTargetWriter && this.#writer.target.options.onCluster) {
			let { data, start } = this.#writer.getTrackedWrites();
			this.#writer.target.options.onCluster(data, start, this.#currentClusterTimestamp);
		}
		*/

		let clusterOffsetFromSegment =
			this.offsets.get(this.#currentCluster)! - this.#segmentDataOffset;

		assert(this.#cues);

		// Add a CuePoint to the Cues element for better seeking
		(this.#cues.data as EBML[]).push({ id: EBMLId.CuePoint, data: [
			{ id: EBMLId.CueTime, data: this.#currentClusterMsTimestamp! },
			// We only write out cues for tracks that have at least one chunk in this cluster
			...[...this.#trackDatasInCurrentCluster].map(trackData => {
				return { id: EBMLId.CueTrackPositions, data: [
					{ id: EBMLId.CueTrack, data: trackData.track.id },
					{ id: EBMLId.CueClusterPosition, data: clusterOffsetFromSegment }
				] };
			})
		] });
	}

	override onTrackClose() {
		// Since a track is now closed, we may be able to write out chunks that were previously waiting
		this.#interleaveChunks();
	}

	/** Finalizes the file, making it ready for use. Must be called after all media chunks have been added. */
	finalize() {
		// Flush any remaining queued chunks to the file
		for (let trackData of this.#trackDatas) {
			while (trackData.chunkQueue.length > 0) {
				this.#writeBlock(trackData, trackData.chunkQueue.shift()!);
			}
		}

		if (!this.#format.options.streaming) {
			this.#finalizeCurrentCluster();
		}

		assert(this.#cues);
		this.writeEBML(this.#cues);

		if (!this.#format.options.streaming) {
			let endPos = this.#writer.getPos();

			// Write the Segment size
			let segmentSize = this.#writer.getPos() - this.#segmentDataOffset;
			this.#writer.seek(this.offsets.get(this.#segment!)! + 4);
			this.writeEBMLVarInt(segmentSize, SEGMENT_SIZE_BYTES);

			// Write the duration of the media to the Segment
			this.#segmentDuration!.data = new EBMLFloat64(this.#duration);
			this.#writer.seek(this.offsets.get(this.#segmentDuration!)!);
			this.writeEBML(this.#segmentDuration!);

			// Fill in SeekHead position data and write it again
			this.#seekHead!.data[0]!.data[1]!.data =
				this.offsets.get(this.#cues)! - this.#segmentDataOffset;
			this.#seekHead!.data[1]!.data[1]!.data =
				this.offsets.get(this.#segmentInfo!)! - this.#segmentDataOffset;
			this.#seekHead!.data[2]!.data[1]!.data =
				this.offsets.get(this.#tracksElement!)! - this.#segmentDataOffset;

			this.#writer.seek(this.offsets.get(this.#seekHead!)!);
			this.writeEBML(this.#seekHead!);

			this.#writer.seek(endPos);
		}
	}
}