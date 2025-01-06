import {
	COLOR_PRIMARIES_MAP,
	MATRIX_COEFFICIENTS_MAP,
	TRANSFER_CHARACTERISTICS_MAP,
	assert,
	colorSpaceIsComplete,
	readBits,
	textEncoder,
	toUint8Array,
	writeBits,
} from '../misc';
import {
	EBML,
	EBMLElement,
	EBMLFloat32,
	EBMLFloat64,
	EBMLId,
	EBMLSignedInt,
	measureEBMLVarInt,
	measureSignedInt,
	measureUnsignedInt,
} from './ebml';
import { MkvOutputFormat, WebMOutputFormat } from '../output-format';
import { Output, OutputAudioTrack, OutputSubtitleTrack, OutputTrack, OutputVideoTrack } from '../output';
import {
	SubtitleConfig,
	SubtitleCue,
	SubtitleMetadata,
	formatSubtitleTimestamp,
	inlineTimestampRegex,
	parseSubtitleTimestamp,
} from '../subtitles';
import {
	AudioCodec,
	PCM_CODECS,
	PcmAudioCodec,
	SubtitleCodec,
	VideoCodec,
	parsePcmCodec,
	validateAudioChunkMetadata,
	validateSubtitleMetadata,
	validateVideoChunkMetadata,
} from '../codec';
import { Muxer } from '../muxer';
import { Writer } from '../writer';
import { EncodedAudioSample, EncodedVideoSample } from '../sample';

const MAX_CHUNK_LENGTH_MS = 2 ** 15;
const APP_NAME = 'https://github.com/Vanilagy/webm-muxer'; // TODO
const SEGMENT_SIZE_BYTES = 6;
const CLUSTER_SIZE_BYTES = 5;

type InternalMediaChunk = {
	data: Uint8Array;
	type: 'key' | 'delta';
	timestamp: number;
	duration: number;
	additions: Uint8Array | null;
};

type SeekHead = {
	id: number;
	data: {
		id: number;
		data: ({
			id: number;
			data: Uint8Array;
			size?: undefined;
		} | {
			id: number;
			size: number;
			data: number;
		})[];
	}[];
};

type MatroskaTrackData = {
	chunkQueue: InternalMediaChunk[];
	lastWrittenMsTimestamp: number | null;
} & ({
	track: OutputVideoTrack;
	type: 'video';
	info: {
		width: number;
		height: number;
		decoderConfig: VideoDecoderConfig;
	};
} | {
	track: OutputAudioTrack;
	type: 'audio';
	info: {
		numberOfChannels: number;
		sampleRate: number;
		decoderConfig: AudioDecoderConfig;
	};
} | {
	track: OutputSubtitleTrack;
	type: 'subtitle';
	info: {
		config: SubtitleConfig;
	};
});

type MatroskaVideoTrackData = MatroskaTrackData & { type: 'video' };
type MatroskaAudioTrackData = MatroskaTrackData & { type: 'audio' };
type MatroskaSubtitleTrackData = MatroskaTrackData & { type: 'subtitle' };

const CODEC_STRING_MAP: Partial<Record<VideoCodec | AudioCodec | SubtitleCodec, string>> = {
	'avc': 'V_MPEG4/ISO/AVC',
	'hevc': 'V_MPEGH/ISO/HEVC',
	'vp8': 'V_VP8',
	'vp9': 'V_VP9',
	'av1': 'V_AV1',

	'aac': 'A_AAC',
	'mp3': 'A_MPEG/L3',
	'opus': 'A_OPUS',
	'vorbis': 'A_VORBIS',
	'flac': 'A_FLAC',
	'pcm-u8': 'A_PCM/INT/LIT',
	'pcm-s16': 'A_PCM/INT/LIT',
	'pcm-s16be': 'A_PCM/INT/BIG',
	'pcm-s24': 'A_PCM/INT/LIT',
	'pcm-s24be': 'A_PCM/INT/BIG',
	'pcm-s32': 'A_PCM/INT/LIT',
	'pcm-s32be': 'A_PCM/INT/BIG',
	'pcm-f32': 'A_PCM/FLOAT/IEEE',

	'webvtt': 'S_TEXT/WEBVTT',
};

const TRACK_TYPE_MAP: Record<OutputTrack['type'], number> = {
	video: 1,
	audio: 2,
	subtitle: 17,
};

export class MatroskaMuxer extends Muxer {
	private writer: Writer;
	private format: WebMOutputFormat | MkvOutputFormat;

	private helper = new Uint8Array(8);
	private helperView = new DataView(this.helper.buffer);

	/**
	 * Stores the position from the start of the file to where EBML elements have been written. This is used to
	 * rewrite/edit elements that were already added before, and to measure sizes of things.
	 */
	private offsets = new WeakMap<EBML, number>();
	/** Same as offsets, but stores position where the element's data starts (after ID and size fields). */
	private dataOffsets = new WeakMap<EBML, number>();

	private trackDatas: MatroskaTrackData[] = [];

	private segment: EBMLElement | null = null;
	private segmentInfo: EBMLElement | null = null;
	private seekHead: SeekHead | null = null;
	private tracksElement: EBMLElement | null = null;
	private segmentDuration: EBMLElement | null = null;
	private cues: EBMLElement | null = null;

	private currentCluster: EBMLElement | null = null;
	private currentClusterMsTimestamp: number | null = null;
	private trackDatasInCurrentCluster = new Set<MatroskaTrackData>();

	private duration = 0;

	constructor(output: Output, format: MkvOutputFormat) {
		super(output);

		this.writer = output._writer;
		this.format = format;

		if (this.format._options.streamable) {
			this.writer.ensureMonotonicity = true;
		}
	}

	private writeByte(value: number) {
		this.helperView.setUint8(0, value);
		this.writer.write(this.helper.subarray(0, 1));
	}

	private writeFloat32(value: number) {
		this.helperView.setFloat32(0, value, false);
		this.writer.write(this.helper.subarray(0, 4));
	}

	private writeFloat64(value: number) {
		this.helperView.setFloat64(0, value, false);
		this.writer.write(this.helper);
	}

	private writeUnsignedInt(value: number, width = measureUnsignedInt(value)) {
		let pos = 0;

		// Each case falls through:
		switch (width) {
			case 6:
				// Need to use division to access >32 bits of floating point var
				this.helperView.setUint8(pos++, (value / 2 ** 40) | 0);
			// eslint-disable-next-line no-fallthrough
			case 5:
				this.helperView.setUint8(pos++, (value / 2 ** 32) | 0);
				// eslint-disable-next-line no-fallthrough
			case 4:
				this.helperView.setUint8(pos++, value >> 24);
				// eslint-disable-next-line no-fallthrough
			case 3:
				this.helperView.setUint8(pos++, value >> 16);
				// eslint-disable-next-line no-fallthrough
			case 2:
				this.helperView.setUint8(pos++, value >> 8);
				// eslint-disable-next-line no-fallthrough
			case 1:
				this.helperView.setUint8(pos++, value);
				break;
			default:
				throw new Error('Bad UINT size ' + width);
		}

		this.writer.write(this.helper.subarray(0, pos));
	}

	private writeSignedInt(value: number, width = measureSignedInt(value)) {
		if (value < 0) {
			// Two's complement stuff
			value += 2 ** (width * 8);
		}

		this.writeUnsignedInt(value, width);
	}

	writeEBMLVarInt(value: number, width = measureEBMLVarInt(value)) {
		let pos = 0;

		switch (width) {
			case 1:
				this.helperView.setUint8(pos++, (1 << 7) | value);
				break;
			case 2:
				this.helperView.setUint8(pos++, (1 << 6) | (value >> 8));
				this.helperView.setUint8(pos++, value);
				break;
			case 3:
				this.helperView.setUint8(pos++, (1 << 5) | (value >> 16));
				this.helperView.setUint8(pos++, value >> 8);
				this.helperView.setUint8(pos++, value);
				break;
			case 4:
				this.helperView.setUint8(pos++, (1 << 4) | (value >> 24));
				this.helperView.setUint8(pos++, value >> 16);
				this.helperView.setUint8(pos++, value >> 8);
				this.helperView.setUint8(pos++, value);
				break;
			case 5:
				/**
				 * JavaScript converts its doubles to 32-bit integers for bitwise
				 * operations, so we need to do a division by 2^32 instead of a
				 * right-shift of 32 to retain those top 3 bits
				 */
				this.helperView.setUint8(pos++, (1 << 3) | ((value / 2 ** 32) & 0x7));
				this.helperView.setUint8(pos++, value >> 24);
				this.helperView.setUint8(pos++, value >> 16);
				this.helperView.setUint8(pos++, value >> 8);
				this.helperView.setUint8(pos++, value);
				break;
			case 6:
				this.helperView.setUint8(pos++, (1 << 2) | ((value / 2 ** 40) & 0x3));
				this.helperView.setUint8(pos++, (value / 2 ** 32) | 0);
				this.helperView.setUint8(pos++, value >> 24);
				this.helperView.setUint8(pos++, value >> 16);
				this.helperView.setUint8(pos++, value >> 8);
				this.helperView.setUint8(pos++, value);
				break;
			default:
				throw new Error('Bad EBML VINT size ' + width);
		}

		this.writer.write(this.helper.subarray(0, pos));
	}

	// Assumes the string is ASCII
	private writeString(str: string) {
		this.writer.write(new Uint8Array(str.split('').map(x => x.charCodeAt(0))));
	}

	private writeEBML(data: EBML | null) {
		if (data === null) return;

		if (data instanceof Uint8Array) {
			this.writer.write(data);
		} else if (Array.isArray(data)) {
			for (const elem of data) {
				this.writeEBML(elem);
			}
		} else {
			this.offsets.set(data, this.writer.getPos());

			this.writeUnsignedInt(data.id); // ID field

			if (Array.isArray(data.data)) {
				const sizePos = this.writer.getPos();
				const sizeSize = data.size === -1 ? 1 : (data.size ?? 4);

				if (data.size === -1) {
					// Write the reserved all-one-bits marker for unknown/unbounded size.
					this.writeByte(0xff);
				} else {
					this.writer.seek(this.writer.getPos() + sizeSize);
				}

				const startPos = this.writer.getPos();
				this.dataOffsets.set(data, startPos);
				this.writeEBML(data.data);

				if (data.size !== -1) {
					const size = this.writer.getPos() - startPos;
					const endPos = this.writer.getPos();
					this.writer.seek(sizePos);
					this.writeEBMLVarInt(size, sizeSize);
					this.writer.seek(endPos);
				}
			} else if (typeof data.data === 'number') {
				const size = data.size ?? measureUnsignedInt(data.data);
				this.writeEBMLVarInt(size);
				this.writeUnsignedInt(data.data, size);
			} else if (typeof data.data === 'string') {
				this.writeEBMLVarInt(data.data.length);
				this.writeString(data.data);
			} else if (data.data instanceof Uint8Array) {
				this.writeEBMLVarInt(data.data.byteLength, data.size);
				this.writer.write(data.data);
			} else if (data.data instanceof EBMLFloat32) {
				this.writeEBMLVarInt(4);
				this.writeFloat32(data.data.value);
			} else if (data.data instanceof EBMLFloat64) {
				this.writeEBMLVarInt(8);
				this.writeFloat64(data.data.value);
			} else if (data.data instanceof EBMLSignedInt) {
				const size = data.size ?? measureSignedInt(data.data.value);
				this.writeEBMLVarInt(size);
				this.writeSignedInt(data.data.value, size);
			}
		}
	}

	async start() {
		const release = await this.mutex.acquire();

		this.writeEBMLHeader();

		if (!this.format._options.streamable) {
			this.createSeekHead();
		}

		this.createSegmentInfo();
		this.createCues();

		await this.writer.flush();

		release();
	}

	private writeEBMLHeader() {
		const ebmlHeader: EBML = { id: EBMLId.EBML, data: [
			{ id: EBMLId.EBMLVersion, data: 1 },
			{ id: EBMLId.EBMLReadVersion, data: 1 },
			{ id: EBMLId.EBMLMaxIDLength, data: 4 },
			{ id: EBMLId.EBMLMaxSizeLength, data: 8 },
			{ id: EBMLId.DocType, data: this.format instanceof WebMOutputFormat ? 'webm' : 'matroska' },
			{ id: EBMLId.DocTypeVersion, data: 2 },
			{ id: EBMLId.DocTypeReadVersion, data: 2 },
		] };
		this.writeEBML(ebmlHeader);
	}

	/**
	 * Creates a SeekHead element which is positioned near the start of the file and allows the media player to seek to
	 * relevant sections more easily. Since we don't know the positions of those sections yet, we'll set them later.
	 */
	private createSeekHead() {
		const kaxCues = new Uint8Array([0x1c, 0x53, 0xbb, 0x6b]);
		const kaxInfo = new Uint8Array([0x15, 0x49, 0xa9, 0x66]);
		const kaxTracks = new Uint8Array([0x16, 0x54, 0xae, 0x6b]);

		const seekHead = { id: EBMLId.SeekHead, data: [
			{ id: EBMLId.Seek, data: [
				{ id: EBMLId.SeekID, data: kaxCues },
				{ id: EBMLId.SeekPosition, size: 5, data: 0 },
			] },
			{ id: EBMLId.Seek, data: [
				{ id: EBMLId.SeekID, data: kaxInfo },
				{ id: EBMLId.SeekPosition, size: 5, data: 0 },
			] },
			{ id: EBMLId.Seek, data: [
				{ id: EBMLId.SeekID, data: kaxTracks },
				{ id: EBMLId.SeekPosition, size: 5, data: 0 },
			] },
		] };
		this.seekHead = seekHead;
	}

	private createSegmentInfo() {
		const segmentDuration: EBML = { id: EBMLId.Duration, data: new EBMLFloat64(0) };
		this.segmentDuration = segmentDuration;

		const segmentInfo: EBML = { id: EBMLId.Info, data: [
			{ id: EBMLId.TimestampScale, data: 1e6 },
			{ id: EBMLId.MuxingApp, data: APP_NAME },
			{ id: EBMLId.WritingApp, data: APP_NAME },
			!this.format._options.streamable ? segmentDuration : null,
		] };
		this.segmentInfo = segmentInfo;
	}

	private createTracks() {
		const tracksElement = { id: EBMLId.Tracks, data: [] as EBML[] };
		this.tracksElement = tracksElement;

		for (const trackData of this.trackDatas) {
			const codecId = CODEC_STRING_MAP[trackData.track.source._codec];
			assert(codecId);

			tracksElement.data.push({ id: EBMLId.TrackEntry, data: [
				{ id: EBMLId.TrackNumber, data: trackData.track.id },
				{ id: EBMLId.TrackUID, data: trackData.track.id },
				{ id: EBMLId.TrackType, data: TRACK_TYPE_MAP[trackData.type] },
				{ id: EBMLId.CodecID, data: codecId },
				(trackData.type === 'video' ? this.videoSpecificTrackInfo(trackData) : null),
				(trackData.type === 'audio' ? this.audioSpecificTrackInfo(trackData) : null),
				(trackData.type === 'subtitle' ? this.subtitleSpecificTrackInfo(trackData) : null),
			] });
		}
	}

	private videoSpecificTrackInfo(trackData: MatroskaVideoTrackData) {
		const elements: EBMLElement['data'] = [
			(trackData.info.decoderConfig.description
				? {
						id: EBMLId.CodecPrivate,
						data: toUint8Array(trackData.info.decoderConfig.description),
					}
				: null),
			(trackData.track.metadata.frameRate
				? {
						id: EBMLId.DefaultDuration,
						data: 1e9 / trackData.track.metadata.frameRate,
					}
				: null),
		];

		const colorSpace = trackData.info.decoderConfig.colorSpace;
		const videoElement: EBMLElement = { id: EBMLId.Video, data: [
			{ id: EBMLId.PixelWidth, data: trackData.info.width },
			{ id: EBMLId.PixelHeight, data: trackData.info.height },
			(colorSpaceIsComplete(colorSpace)
				? {
						id: EBMLId.Colour,
						data: [
							{
								id: EBMLId.MatrixCoefficients,
								data: MATRIX_COEFFICIENTS_MAP[colorSpace.matrix],
							},
							{
								id: EBMLId.TransferCharacteristics,
								data: TRANSFER_CHARACTERISTICS_MAP[colorSpace.transfer],
							},
							{
								id: EBMLId.Primaries,
								data: COLOR_PRIMARIES_MAP[colorSpace.primaries],
							},
							{
								id: EBMLId.Range,
								data: colorSpace.fullRange ? 2 : 1,
							},
						],
					}
				: null),
		] };

		elements.push(videoElement);

		return elements;
	}

	private audioSpecificTrackInfo(trackData: MatroskaAudioTrackData) {
		const pcmInfo = (PCM_CODECS as readonly string[]).includes(trackData.track.source._codec)
			? parsePcmCodec(trackData.track.source._codec as PcmAudioCodec)
			: null;

		return [
			(trackData.info.decoderConfig.description
				? {
						id: EBMLId.CodecPrivate,
						data: toUint8Array(trackData.info.decoderConfig.description),
					}
				: null),
			{ id: EBMLId.Audio, data: [
				{ id: EBMLId.SamplingFrequency, data: new EBMLFloat32(trackData.info.sampleRate) },
				{ id: EBMLId.Channels, data: trackData.info.numberOfChannels },
				pcmInfo ? { id: EBMLId.BitDepth, data: 8 * pcmInfo.sampleSize } : null,
			] },
		];
	}

	private subtitleSpecificTrackInfo(trackData: MatroskaSubtitleTrackData) {
		return [
			{ id: EBMLId.CodecPrivate, data: textEncoder.encode(trackData.info.config.description) },
		];
	}

	private createSegment() {
		const segment: EBML = {
			id: EBMLId.Segment,
			size: this.format._options.streamable ? -1 : SEGMENT_SIZE_BYTES,
			data: [
				!this.format._options.streamable ? this.seekHead as EBML : null,
				this.segmentInfo,
				this.tracksElement,
			],
		};
		this.segment = segment;

		this.writeEBML(segment);

		/*
		if (this.#writer instanceof BaseStreamTargetWriter && this.#writer.target.options.onHeader) {
			let { data, start } = this.#writer.getTrackedWrites(); // start should be 0
			this.#writer.target.options.onHeader(data, start);
		}
		*/
	}

	private createCues() {
		this.cues = { id: EBMLId.Cues, data: [] };
	}

	private get segmentDataOffset() {
		assert(this.segment);
		return this.dataOffsets.get(this.segment)!;
	}

	private getVideoTrackData(track: OutputVideoTrack, meta?: EncodedVideoChunkMetadata) {
		const existingTrackData = this.trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData as MatroskaVideoTrackData;
		}

		validateVideoChunkMetadata(meta);

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
				decoderConfig: meta.decoderConfig,
			},
			chunkQueue: [],
			lastWrittenMsTimestamp: null,
		};

		this.trackDatas.push(newTrackData);
		this.trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	private getAudioTrackData(track: OutputAudioTrack, meta?: EncodedAudioChunkMetadata) {
		const existingTrackData = this.trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData as MatroskaAudioTrackData;
		}

		validateAudioChunkMetadata(meta);

		assert(meta);
		assert(meta.decoderConfig);

		const newTrackData: MatroskaAudioTrackData = {
			track,
			type: 'audio',
			info: {
				numberOfChannels: meta.decoderConfig.numberOfChannels,
				sampleRate: meta.decoderConfig.sampleRate,
				decoderConfig: meta.decoderConfig,
			},
			chunkQueue: [],
			lastWrittenMsTimestamp: null,
		};

		this.trackDatas.push(newTrackData);
		this.trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	private getSubtitleTrackData(track: OutputSubtitleTrack, meta?: SubtitleMetadata) {
		const existingTrackData = this.trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData as MatroskaAudioTrackData;
		}

		validateSubtitleMetadata(meta);

		assert(meta);
		assert(meta.config);

		const newTrackData: MatroskaSubtitleTrackData = {
			track,
			type: 'subtitle',
			info: {
				config: meta.config,
			},
			chunkQueue: [],
			lastWrittenMsTimestamp: null,
		};

		this.trackDatas.push(newTrackData);
		this.trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	async addEncodedVideoSample(track: OutputVideoTrack, sample: EncodedVideoSample, meta?: EncodedVideoChunkMetadata) {
		const release = await this.mutex.acquire();

		try {
			const trackData = this.getVideoTrackData(track, meta);

			const isKeyFrame = sample.type === 'key';
			const timestamp = this.validateAndNormalizeTimestamp(trackData.track, sample.timestamp, isKeyFrame);
			const videoChunk = this.createInternalChunk(sample.data, timestamp, sample.duration, sample.type);
			if (track.source._codec === 'vp9') this.fixVP9ColorSpace(trackData, videoChunk);

			trackData.chunkQueue.push(videoChunk);
			await this.interleaveChunks();
		} finally {
			release();
		}
	}

	async addEncodedAudioSample(track: OutputAudioTrack, sample: EncodedAudioSample, meta?: EncodedAudioChunkMetadata) {
		const release = await this.mutex.acquire();

		try {
			const trackData = this.getAudioTrackData(track, meta);

			const isKeyFrame = sample.type === 'key';
			const timestamp = this.validateAndNormalizeTimestamp(trackData.track, sample.timestamp, isKeyFrame);
			const audioChunk = this.createInternalChunk(sample.data, timestamp, sample.duration, sample.type);

			trackData.chunkQueue.push(audioChunk);
			await this.interleaveChunks();
		} finally {
			release();
		}
	}

	async addSubtitleCue(track: OutputSubtitleTrack, cue: SubtitleCue, meta?: SubtitleMetadata) {
		const release = await this.mutex.acquire();

		try {
			const trackData = this.getSubtitleTrackData(track, meta);

			const timestamp = this.validateAndNormalizeTimestamp(trackData.track, cue.timestamp, true);

			let bodyText = cue.text;
			const timestampMs = Math.floor(timestamp * 1000);

			// Replace in-body timestamps so that they're relative to the cue start time
			inlineTimestampRegex.lastIndex = 0;
			bodyText = bodyText.replace(inlineTimestampRegex, (match) => {
				const time = parseSubtitleTimestamp(match.slice(1, -1));
				const offsetTime = time - timestampMs;

				return `<${formatSubtitleTimestamp(offsetTime)}>`;
			});

			const body = textEncoder.encode(bodyText);
			const additions = `${cue.settings ?? ''}\n${cue.identifier ?? ''}\n${cue.notes ?? ''}`;

			const subtitleChunk = this.createInternalChunk(
				body,
				timestamp,
				cue.duration,
				'key',
				additions.trim() ? textEncoder.encode(additions) : null,
			);

			trackData.chunkQueue.push(subtitleChunk);
			await this.interleaveChunks();
		} finally {
			release();
		}
	}

	private async interleaveChunks() {
		for (const track of this.output._tracks) {
			if (!track.source._closed && !this.trackDatas.some(x => x.track === track)) {
				return; // We haven't seen a sample from this open track yet
			}
		}

		outer:
		while (true) {
			let trackWithMinTimestamp: MatroskaTrackData | null = null;
			let minTimestamp = Infinity;

			for (const trackData of this.trackDatas) {
				if (trackData.chunkQueue.length === 0 && !trackData.track.source._closed) {
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

			const chunk = trackWithMinTimestamp.chunkQueue.shift()!;
			this.writeBlock(trackWithMinTimestamp, chunk);
		}

		await this.writer.flush();
	}

	/** Due to [a bug in Chromium](https://bugs.chromium.org/p/chromium/issues/detail?id=1377842), VP9 streams often
	 * lack color space information. This method patches in that information. */
	// http://downloads.webmproject.org/docs/vp9/vp9-bitstream_superframe-and-uncompressed-header_v1.0.pdf
	private fixVP9ColorSpace(trackData: MatroskaVideoTrackData, chunk: InternalMediaChunk) {
		if (chunk.type !== 'key') return;
		if (!trackData.info.decoderConfig.colorSpace || !trackData.info.decoderConfig.colorSpace.matrix) return;

		let i = 0;
		// Check if it's a "superframe"
		if (readBits(chunk.data, 0, 2) !== 0b10) return;
		i += 2;

		const profile = (readBits(chunk.data, i + 1, i + 2) << 1) + readBits(chunk.data, i + 0, i + 1);
		i += 2;
		if (profile === 3) i++;

		const showExistingFrame = readBits(chunk.data, i + 0, i + 1);
		i++;
		if (showExistingFrame) return;

		const frameType = readBits(chunk.data, i + 0, i + 1);
		i++;
		if (frameType !== 0) return; // Just to be sure

		i += 2;

		const syncCode = readBits(chunk.data, i + 0, i + 24);
		i += 24;
		if (syncCode !== 0x498342) return;

		if (profile >= 2) i++;

		const colorSpaceID = {
			rgb: 7,
			bt709: 2,
			bt470bg: 1,
			smpte170m: 3,
		}[trackData.info.decoderConfig.colorSpace.matrix];
		writeBits(chunk.data, i + 0, i + 3, colorSpaceID);
	}

	/** Converts a read-only external chunk into an internal one for easier use. */
	private createInternalChunk(
		data: Uint8Array,
		timestamp: number,
		duration: number,
		type: 'key' | 'delta',
		additions: Uint8Array | null = null,
	) {
		const internalChunk: InternalMediaChunk = {
			data,
			type,
			timestamp,
			duration,
			additions,
		};

		return internalChunk;
	}

	/** Writes a block containing media data to the file. */
	private writeBlock(trackData: MatroskaTrackData, chunk: InternalMediaChunk) {
		// Due to the interlacing algorithm, this code will be run once we've seen one chunk from every media track.
		if (!this.segment) {
			this.createTracks();
			this.createSegment();
		}

		const msTimestamp = Math.floor(1000 * chunk.timestamp);
		// We can only finalize this fragment (and begin a new one) if we know that each track will be able to
		// start the new one with a key frame.
		const keyFrameQueuedEverywhere = this.trackDatas.every((otherTrackData) => {
			if (otherTrackData.track.source._closed) {
				return true;
			}

			if (trackData === otherTrackData) {
				return chunk.type === 'key';
			}

			const firstQueuedSample = otherTrackData.chunkQueue[0];
			return firstQueuedSample && firstQueuedSample.type === 'key';
		});

		if (
			!this.currentCluster
			|| (keyFrameQueuedEverywhere && msTimestamp - this.currentClusterMsTimestamp! >= 1000)
		) {
			this.createNewCluster(msTimestamp);
		}

		const relativeTimestamp = msTimestamp - this.currentClusterMsTimestamp!;
		if (relativeTimestamp < 0) {
			// The chunk lies outside of the current cluster
			return;
		}

		const clusterIsTooLong = relativeTimestamp >= MAX_CHUNK_LENGTH_MS;
		if (clusterIsTooLong) {
			throw new Error(
				`Current Matroska cluster exceeded its maximum allowed length of ${MAX_CHUNK_LENGTH_MS} `
				+ `milliseconds. In order to produce a correct WebM file, you must pass in a key frame at least every `
				+ `${MAX_CHUNK_LENGTH_MS} milliseconds.`,
			);
		}

		const prelude = new Uint8Array(4);
		const view = new DataView(prelude.buffer);
		// 0x80 to indicate it's the last byte of a multi-byte number
		view.setUint8(0, 0x80 | trackData.track.id);
		view.setInt16(1, relativeTimestamp, false);

		const msDuration = Math.floor(1000 * chunk.duration);

		if (msDuration === 0 && !chunk.additions) {
			// No duration or additions, we can write out a SimpleBlock
			view.setUint8(3, Number(chunk.type === 'key') << 7); // Flags (keyframe flag only present for SimpleBlock)

			const simpleBlock = { id: EBMLId.SimpleBlock, data: [
				prelude,
				chunk.data,
			] };
			this.writeEBML(simpleBlock);
		} else {
			const blockGroup = { id: EBMLId.BlockGroup, data: [
				{ id: EBMLId.Block, data: [
					prelude,
					chunk.data,
				] },
				chunk.type === 'delta'
					? {
							id: EBMLId.ReferenceBlock,
							data: new EBMLSignedInt(trackData.lastWrittenMsTimestamp! - msTimestamp),
						}
					: null,
				chunk.additions
					? { id: EBMLId.BlockAdditions, data: [
							{ id: EBMLId.BlockMore, data: [
								{ id: EBMLId.BlockAdditional, data: chunk.additions },
								{ id: EBMLId.BlockAddID, data: 1 },
							] },
						] }
					: null,
				msDuration > 0 ? { id: EBMLId.BlockDuration, data: msDuration } : null,
			] };
			this.writeEBML(blockGroup);
		}

		this.duration = Math.max(this.duration, msTimestamp + msDuration);
		trackData.lastWrittenMsTimestamp = msTimestamp;

		this.trackDatasInCurrentCluster.add(trackData);
	}

	/** Creates a new Cluster element to contain media chunks. */
	private createNewCluster(msTimestamp: number) {
		if (this.currentCluster && !this.format._options.streamable) {
			this.finalizeCurrentCluster();
		}

		/*
		if (this.#writer instanceof BaseStreamTargetWriter && this.#writer.target.options.onCluster) {
			this.#writer.startTrackingWrites();
		}
		*/

		this.currentCluster = {
			id: EBMLId.Cluster,
			size: this.format._options.streamable ? -1 : CLUSTER_SIZE_BYTES,
			data: [
				{ id: EBMLId.Timestamp, data: msTimestamp },
			],
		};
		this.writeEBML(this.currentCluster);

		this.currentClusterMsTimestamp = msTimestamp;
		this.trackDatasInCurrentCluster.clear();
	}

	private finalizeCurrentCluster() {
		assert(this.currentCluster);
		const clusterSize = this.writer.getPos() - this.dataOffsets.get(this.currentCluster)!;
		const endPos = this.writer.getPos();

		// Write the size now that we know it
		this.writer.seek(this.offsets.get(this.currentCluster)! + 4);
		this.writeEBMLVarInt(clusterSize, CLUSTER_SIZE_BYTES);
		this.writer.seek(endPos);

		/*
		if (this.#writer instanceof BaseStreamTargetWriter && this.#writer.target.options.onCluster) {
			let { data, start } = this.#writer.getTrackedWrites();
			this.#writer.target.options.onCluster(data, start, this.#currentClusterTimestamp);
		}
		*/

		const clusterOffsetFromSegment
			= this.offsets.get(this.currentCluster)! - this.segmentDataOffset;

		assert(this.cues);

		// Add a CuePoint to the Cues element for better seeking
		(this.cues.data as EBML[]).push({ id: EBMLId.CuePoint, data: [
			{ id: EBMLId.CueTime, data: this.currentClusterMsTimestamp! },
			// We only write out cues for tracks that have at least one chunk in this cluster
			...[...this.trackDatasInCurrentCluster].map((trackData) => {
				return { id: EBMLId.CueTrackPositions, data: [
					{ id: EBMLId.CueTrack, data: trackData.track.id },
					{ id: EBMLId.CueClusterPosition, data: clusterOffsetFromSegment },
				] };
			}),
		] });
	}

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	override async onTrackClose() {
		const release = await this.mutex.acquire();

		// Since a track is now closed, we may be able to write out chunks that were previously waiting
		await this.interleaveChunks();

		release();
	}

	/** Finalizes the file, making it ready for use. Must be called after all media chunks have been added. */
	async finalize() {
		const release = await this.mutex.acquire();

		if (!this.segment) {
			this.createTracks();
			this.createSegment();
		}

		// Flush any remaining queued chunks to the file
		for (const trackData of this.trackDatas) {
			while (trackData.chunkQueue.length > 0) {
				this.writeBlock(trackData, trackData.chunkQueue.shift()!);
			}
		}

		if (!this.format._options.streamable && this.currentCluster) {
			this.finalizeCurrentCluster();
		}

		assert(this.cues);
		this.writeEBML(this.cues);

		if (!this.format._options.streamable) {
			const endPos = this.writer.getPos();

			// Write the Segment size
			const segmentSize = this.writer.getPos() - this.segmentDataOffset;
			this.writer.seek(this.offsets.get(this.segment!)! + 4);
			this.writeEBMLVarInt(segmentSize, SEGMENT_SIZE_BYTES);

			// Write the duration of the media to the Segment
			this.segmentDuration!.data = new EBMLFloat64(this.duration);
			this.writer.seek(this.offsets.get(this.segmentDuration!)!);
			this.writeEBML(this.segmentDuration);

			// Fill in SeekHead position data and write it again
			this.seekHead!.data[0]!.data[1]!.data
				= this.offsets.get(this.cues)! - this.segmentDataOffset;
			this.seekHead!.data[1]!.data[1]!.data
				= this.offsets.get(this.segmentInfo!)! - this.segmentDataOffset;
			this.seekHead!.data[2]!.data[1]!.data
				= this.offsets.get(this.tracksElement!)! - this.segmentDataOffset;

			this.writer.seek(this.offsets.get(this.seekHead!)!);
			this.writeEBML(this.seekHead);

			this.writer.seek(endPos);
		}

		release();
	}
}
