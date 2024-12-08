import { AudioCodec, extractAudioCodecString, extractVideoCodecString, MediaCodec, VideoCodec } from '../codec';
import { Demuxer } from '../demuxer';
import { Input } from '../input';
import {
	InputAudioTrack,
	InputAudioTrackBacking,
	InputTrack,
	InputTrackBacking,
	InputVideoTrack,
	InputVideoTrackBacking,
} from '../input-track';
import {
	assert,
	COLOR_PRIMARIES_MAP_INVERSE,
	MATRIX_COEFFICIENTS_MAP_INVERSE,
	TRANSFER_CHARACTERISTICS_MAP_INVERSE,
	rotationMatrix,
	binarySearchLessOrEqual,
	binarySearchExact,
} from '../misc';
import { Reader } from '../reader';
import { IsobmffReader } from './isobmff-reader';

type InternalTrack = {
	id: number;
	demuxer: IsobmffDemuxer;
	inputTrack: InputTrack | null;
	timescale: number;
	durationInTimescale: number;
	rotation: number;
	sampleTableOffset: number;
	sampleTable: SampleTable | null;
} & ({
	info: null;
} | {
	info: {
		type: 'video';
		width: number;
		height: number;
		codec: VideoCodec | null;
		codecDescription: Uint8Array | null;
		colorSpace?: VideoColorSpaceInit | null;
	};
} | {
	info: {
		type: 'audio';
		numberOfChannels: number;
		sampleRate: number;
		codec: AudioCodec | null;
		codecDescription: Uint8Array | null;
	};
});

type InternalVideoTrack = InternalTrack & {	info: { type: 'video' } };
type InternalAudioTrack = InternalTrack & {	info: { type: 'audio' } };

type SampleTable = {
	sampleTimingEntries: SampleTimingEntry[];
	sampleCompositionTimeOffsets: SampleCompositionTimeOffsetEntry[];
	sampleSizes: number[];
	keySampleIndices: number[] | null; // Samples that are keyframes
	chunkOffsets: number[];
	sampleToChunk: SampleToChunkEntry[];
	presentationTimestamps: {
		presentationTimestamp: number;
		sampleIndex: number;
	}[];
};
type SampleTimingEntry = {
	startIndex: number;
	startDecodeTimestamp: number;
	count: number;
	delta: number;
};
type SampleCompositionTimeOffsetEntry = {
	startIndex: number;
	count: number;
	offset: number;
};
type SampleToChunkEntry = {
	startSampleIndex: number;
	startChunkIndex: number;
	samplesPerChunk: number;
	sampleDescriptionIndex: number;
};

const knownMatrixes = [rotationMatrix(0), rotationMatrix(90), rotationMatrix(180), rotationMatrix(270)];

export class IsobmffDemuxer extends Demuxer {
	private isobmffReader: IsobmffReader;
	private currentTrack: InternalTrack | null = null;
	private tracks: InternalTrack[] = [];
	private metadataPromise: Promise<void> | null = null;
	private movieTimescale = -1;
	private movieDurationInTimescale = -1;

	chunkReader: IsobmffReader;

	constructor(input: Input) {
		super(input);

		this.isobmffReader = new IsobmffReader(input._mainReader);
		this.chunkReader = new IsobmffReader(new Reader(input._source, 64 * 2 ** 20)); // Max 64 MiB of stored chunks
	}

	override async getDuration() {
		await this.readMetadata();

		if (this.movieDurationInTimescale === -1) {
			throw new Error('Could not read movie duration.');
		}

		return this.movieDurationInTimescale / this.movieTimescale;
	}

	override async getTracks() {
		await this.readMetadata();
		return this.tracks.map(track => track.inputTrack!);
	}

	override async getMimeType() {
		await this.readMetadata();

		let string = 'video/mp4';

		if (this.tracks.length > 0) {
			const codecMimeTypes = await Promise.all(this.tracks.map(x => x.inputTrack!.getCodecMimeType()));
			const uniqueCodecMimeTypes = [...new Set(codecMimeTypes)];

			string += `; codecs="${uniqueCodecMimeTypes.join(', ')}"`;
		}

		return string;
	}

	readMetadata() {
		return this.metadataPromise ??= (async () => {
			const sourceSize = await this.isobmffReader.reader.source._getSize();

			while (this.isobmffReader.pos < sourceSize) {
				await this.isobmffReader.reader.loadRange(this.isobmffReader.pos, this.isobmffReader.pos + 16);
				const startPos = this.isobmffReader.pos;
				const boxInfo = this.isobmffReader.readBoxHeader();

				if (boxInfo.name === 'moov') {
					// Found moov, load it
					await this.isobmffReader.reader.loadRange(
						this.isobmffReader.pos,
						this.isobmffReader.pos + boxInfo.contentSize,
					);
					this.readContiguousBoxes(boxInfo.contentSize);

					return;
				}

				this.isobmffReader.pos = startPos + boxInfo.totalSize;
			}
		})();
	}

	getSampleTableForTrack(internalTrack: InternalTrack) {
		if (internalTrack.sampleTable) {
			return internalTrack.sampleTable;
		}

		const sampleTable: SampleTable = {
			sampleTimingEntries: [],
			sampleCompositionTimeOffsets: [],
			sampleSizes: [],
			keySampleIndices: null,
			chunkOffsets: [],
			sampleToChunk: [],
			presentationTimestamps: [],
		};
		internalTrack.sampleTable = sampleTable;

		this.isobmffReader.pos = internalTrack.sampleTableOffset;
		this.currentTrack = internalTrack;
		this.traverseBox();
		this.currentTrack = null;

		for (const entry of sampleTable.sampleTimingEntries) {
			for (let i = 0; i < entry.count; i++) {
				sampleTable.presentationTimestamps.push({
					presentationTimestamp: entry.startDecodeTimestamp + i * entry.delta,
					sampleIndex: entry.startIndex + i,
				});
			}
		}

		for (const entry of sampleTable.sampleCompositionTimeOffsets) {
			for (let i = 0; i < entry.count; i++) {
				const sampleIndex = entry.startIndex + i;
				const sample = sampleTable.presentationTimestamps[sampleIndex];
				if (!sample) {
					continue;
				}

				sample.presentationTimestamp += entry.offset;
			}
		}

		sampleTable.presentationTimestamps.sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);

		return internalTrack.sampleTable;
	}

	readContiguousBoxes(totalSize: number) {
		const startIndex = this.isobmffReader.pos;

		while (this.isobmffReader.pos - startIndex < totalSize) {
			this.traverseBox();
		}
	}

	traverseBox() {
		const startPos = this.isobmffReader.pos;
		const boxInfo = this.isobmffReader.readBoxHeader();
		const boxEndPos = startPos + boxInfo.totalSize;

		switch (boxInfo.name) {
			case 'mdia':
			case 'minf':
			case 'dinf': {
				this.readContiguousBoxes(boxInfo.contentSize);
			}; break;

			case 'mvhd': {
				const version = this.isobmffReader.readU8();
				this.isobmffReader.pos += 3; // Flags

				if (version === 1) {
					this.isobmffReader.pos += 8 + 8;
					this.movieTimescale = this.isobmffReader.readU32();
					this.movieDurationInTimescale = this.isobmffReader.readU64();
				} else {
					this.isobmffReader.pos += 4 + 4;
					this.movieTimescale = this.isobmffReader.readU32();
					this.movieDurationInTimescale = this.isobmffReader.readU32();
				}
			}; break;

			case 'trak': {
				const track = {
					id: -1,
					demuxer: this,
					inputTrack: null,
					info: null,
					timescale: -1,
					durationInTimescale: -1,
					rotation: 0,
					sampleTableOffset: -1,
					sampleTable: null,
				} satisfies InternalTrack as InternalTrack;
				this.currentTrack = track;

				this.readContiguousBoxes(boxInfo.contentSize);

				if (track.id !== -1 && track.timescale !== -1 && track.info !== null) {
					if (track.info.type === 'video' && track.info.codec !== null) {
						const videoTrack = track as InternalVideoTrack;
						track.inputTrack = new InputVideoTrack(new IsobmffVideoTrackBacking(videoTrack));
						this.tracks.push(track);
					} else if (track.info.type === 'audio' && track.info.codec !== null) {
						const audioTrack = track as InternalAudioTrack;
						track.inputTrack = new InputAudioTrack(new IsobmffAudioTrackBacking(audioTrack));
						this.tracks.push(track);
					}
				}

				this.currentTrack = null;
			}; break;

			case 'tkhd': {
				const track = this.currentTrack;
				assert(track);

				const version = this.isobmffReader.readU8();
				const flags = this.isobmffReader.readU24();

				const trackEnabled = (flags & 0x1) !== 0;
				if (!trackEnabled) {
					break;
				}

				// Skip over creation & modification time to reach the track ID
				if (version === 0) {
					this.isobmffReader.pos += 8;
					track.id = this.isobmffReader.readU32();
					this.isobmffReader.pos += 8;
				} else if (version === 1) {
					this.isobmffReader.pos += 16;
					track.id = this.isobmffReader.readU32();
					this.isobmffReader.pos += 12;
				} else {
					throw new Error(`Incorrect track header version ${version}.`);
				}

				this.isobmffReader.pos += 2 * 4 + 2 + 2 + 2 + 2;
				const rotationMatrix: number[] = [];
				rotationMatrix.push(this.isobmffReader.readFixed_16_16(), this.isobmffReader.readFixed_16_16());
				this.isobmffReader.pos += 4;
				rotationMatrix.push(this.isobmffReader.readFixed_16_16(), this.isobmffReader.readFixed_16_16());

				const matrixIndex = knownMatrixes.findIndex(x => x.every((y, i) => y === rotationMatrix[i]));
				if (matrixIndex === -1) {
					// console.warn(`Wacky rotation matrix ${rotationMatrix}; sticking with no rotation.`);
					track.rotation = 0;
				} else {
					track.rotation = 90 * matrixIndex;
				}
			}; break;

			case 'mdhd': {
				const track = this.currentTrack;
				assert(track);

				const version = this.isobmffReader.readU8();
				this.isobmffReader.pos += 3; // Flags

				if (version === 0) {
					this.isobmffReader.pos += 8;
					track.timescale = this.isobmffReader.readU32();
					track.durationInTimescale = this.isobmffReader.readU32();
				} else if (version === 1) {
					this.isobmffReader.pos += 16;
					track.timescale = this.isobmffReader.readU32();
					track.durationInTimescale = this.isobmffReader.readU64();
				}
			}; break;

			case 'hdlr': {
				const track = this.currentTrack;
				assert(track);

				this.isobmffReader.pos += 8; // Version + flags + pre-defined
				const handlerType = this.isobmffReader.readAscii(4);

				if (handlerType === 'vide') {
					track.info = {
						type: 'video',
						width: -1,
						height: -1,
						codec: null,
						codecDescription: null,
						colorSpace: null,
					};
				} else if (handlerType === 'soun') {
					track.info = {
						type: 'audio',
						numberOfChannels: -1,
						sampleRate: -1,
						codec: null,
						codecDescription: null,
					};
				}
			}; break;

			case 'stbl': {
				const track = this.currentTrack;
				assert(track);

				track.sampleTableOffset = startPos;

				this.readContiguousBoxes(boxInfo.contentSize);
			}; break;

			case 'stsd': {
				const track = this.currentTrack;
				assert(track);

				if (track.info === null || track.sampleTable) {
					break;
				}

				const stsdVersion = this.isobmffReader.readU8();
				this.isobmffReader.pos += 3; // Flags

				const entries = this.isobmffReader.readU32();

				for (let i = 0; i < entries; i++) {
					const sampleBoxInfo = this.isobmffReader.readBoxHeader();

					if (track.info.type === 'video') {
						if (sampleBoxInfo.name === 'avc1') {
							track.info.codec = 'avc';
						} else if (sampleBoxInfo.name === 'hvc1' || sampleBoxInfo.name === 'hev1') {
							track.info.codec = 'hevc';
						} else {
							// TODO a more user-friendly message
							console.warn(`Unsupported video sample entry type ${sampleBoxInfo.name}.`);
							break;
						}

						this.isobmffReader.pos += 6 * 1 + 2 + 2 + 2 + 3 * 4;

						track.info.width = this.isobmffReader.readU16();
						track.info.height = this.isobmffReader.readU16();

						this.isobmffReader.pos += 4 + 4 + 4 + 2 + 32 + 2 + 2;

						this.readContiguousBoxes(startPos + sampleBoxInfo.totalSize - this.isobmffReader.pos);
					} else {
						if (sampleBoxInfo.name === 'mp4a') {
							track.info.codec = 'aac';
						} else if (sampleBoxInfo.name.toLowerCase() === 'opus') {
							track.info.codec = 'opus';
						} else {
							console.warn(`Unsupported audio sample entry type ${sampleBoxInfo.name}.`);
							break;
						}

						this.isobmffReader.pos += 6 * 1 + 2;

						const version = this.isobmffReader.readU16();
						this.isobmffReader.pos += 3 * 2;

						let channelCount = this.isobmffReader.readU16();

						this.isobmffReader.pos += 2 + 2 + 2;

						// Can't use fixed16_16 as that's signed
						let sampleRate = this.isobmffReader.readU32() / 0x10000;

						if (stsdVersion === 0 && version > 0) {
							// Additional QuickTime fields
							if (version === 1) {
								this.isobmffReader.pos += 4 * 4;
							} else if (version === 2) {
								this.isobmffReader.pos += 4;
								sampleRate = this.isobmffReader.readF64();
								channelCount = this.isobmffReader.readU32();
								this.isobmffReader.pos += 4; // Always 0x7F000000
								// eslint-disable-next-line @typescript-eslint/no-unused-vars
								const sampleSize = this.isobmffReader.readU32();

								// eslint-disable-next-line @typescript-eslint/no-unused-vars
								const flags = this.isobmffReader.readU32();

								// eslint-disable-next-line @typescript-eslint/no-unused-vars
								const bytesPerFrame = this.isobmffReader.readU32();
								// eslint-disable-next-line @typescript-eslint/no-unused-vars
								const samplesPerFrame = this.isobmffReader.readU32();

								/*
								if (sampleBoxInfo.name === 'lpcm') {
									const bytesPerSample = (sampleSize + 7) >> 3;
									const isFloat = Boolean(flags & 1);
									const isBigEndian = Boolean(flags & 2);
									const sFlags = flags & 4 ? -1 : 0; // I guess it means "signed flags" or something?

									if (sampleSize > 0 && sampleSize <= 64) {
										if (isFloat) {
											if (sampleSize === 32 && !isBigEndian) {
												track.pcmType = 'pcm-f32';
											}
										} else {
											if (sFlags & (1 << (bytesPerSample - 1))) {
												if (bytesPerSample === 2 && !isBigEndian) {
													track.pcmType = 'pcm-s16';
												} else if (bytesPerSample === 3 && !isBigEndian) {
													track.pcmType = 'pcm-s24';
												} else if (bytesPerSample === 4 && !isBigEndian) {
													track.pcmType = 'pcm-s32';
												}
											} else {
												if (bytesPerSample === 1) {
													track.pcmType = 'pcm-u8';
												}
											}
										}
									}

									if (track.pcmType === null) {
										throw new Error(`Unsupported linear PCM type.`);
									}
								}
								*/
							}
						}

						track.info.numberOfChannels = channelCount;
						track.info.sampleRate = sampleRate;

						this.readContiguousBoxes(startPos + sampleBoxInfo.totalSize - this.isobmffReader.pos);
					}
				}
			}; break;

			case 'avcC': {
				const track = this.currentTrack;
				assert(track && track.info);

				track.info.codecDescription = this.isobmffReader.readRange(
					this.isobmffReader.pos,
					this.isobmffReader.pos + boxInfo.contentSize,
				);
			}; break;

			case 'hvcC': {
				const track = this.currentTrack;
				assert(track && track.info);

				track.info.codecDescription = this.isobmffReader.readRange(
					this.isobmffReader.pos,
					this.isobmffReader.pos + boxInfo.contentSize,
				);
			}; break;

			case 'colr': {
				const track = this.currentTrack;
				assert(track && track.info?.type === 'video');

				const colourType = this.isobmffReader.readAscii(4);
				if (colourType !== 'nclx') {
					break;
				}

				const colourPrimaries = this.isobmffReader.readU16();
				const transferCharacteristics = this.isobmffReader.readU16();
				const matrixCoefficients = this.isobmffReader.readU16();
				const fullRangeFlag = Boolean(this.isobmffReader.readU8() & 0x80);

				track.info.colorSpace = {
					primaries: COLOR_PRIMARIES_MAP_INVERSE[colourPrimaries],
					transfer: TRANSFER_CHARACTERISTICS_MAP_INVERSE[transferCharacteristics],
					matrix: MATRIX_COEFFICIENTS_MAP_INVERSE[matrixCoefficients],
					fullRange: fullRangeFlag,
				};
			}; break;

			case 'wave': {
				if (boxInfo.totalSize > 8) {
					this.readContiguousBoxes(boxInfo.contentSize);
				}
			}; break;

			case 'esds': {
				const track = this.currentTrack;
				assert(track && track.info);

				this.isobmffReader.pos += 4; // Version + flags

				const tag = this.isobmffReader.readU8();
				assert(tag === 0x03);

				this.isobmffReader.readIsomVariableInteger(); // Length

				this.isobmffReader.pos += 2; // ES ID
				const mixed = this.isobmffReader.readU8();

				const streamDependenceFlag = (mixed & 0x80) !== 0;
				const urlFlag = (mixed & 0x40) !== 0;
				const ocrStreamFlag = (mixed & 0x20) !== 0;

				if (streamDependenceFlag) {
					this.isobmffReader.pos += 2;
				}
				if (urlFlag) {
					const urlLength = this.isobmffReader.readU8();
					this.isobmffReader.pos += urlLength;
				}
				if (ocrStreamFlag) {
					this.isobmffReader.pos += 2;
				}

				const decoderConfigTag = this.isobmffReader.readU8();
				assert(decoderConfigTag === 0x04);

				this.isobmffReader.readIsomVariableInteger(); // Length

				const objectTypeIndication = this.isobmffReader.readU8();
				assert(objectTypeIndication === 0x40); // Assert it's MPEG-4 audio

				this.isobmffReader.pos += 1 + 3 + 4 + 4;

				const decoderSpecificInfoTag = this.isobmffReader.readU8();
				assert(decoderSpecificInfoTag === 0x05);

				const decoderSpecificInfoLength = this.isobmffReader.readIsomVariableInteger();

				track.info.codecDescription = this.isobmffReader.readRange(
					this.isobmffReader.pos,
					this.isobmffReader.pos + decoderSpecificInfoLength,
				);
			}; break;

			case 'stts': {
				const track = this.currentTrack;
				assert(track);

				if (!track.sampleTable) {
					break;
				}

				this.isobmffReader.pos += 4; // Version + flags

				const entryCount = this.isobmffReader.readU32();

				let currentIndex = 0;
				let currentTimestamp = 0;

				for (let i = 0; i < entryCount; i++) {
					const sampleCount = this.isobmffReader.readU32();
					const sampleDelta = this.isobmffReader.readU32();

					track.sampleTable.sampleTimingEntries.push({
						startIndex: currentIndex,
						startDecodeTimestamp: currentTimestamp,
						count: sampleCount,
						delta: sampleDelta,
					});

					currentIndex += sampleCount;
					currentTimestamp += sampleCount * sampleDelta;
				}
			}; break;

			case 'ctts': {
				const track = this.currentTrack;
				assert(track);

				if (!track.sampleTable) {
					break;
				}

				this.isobmffReader.pos += 1 + 3; // Version + flags

				const entryCount = this.isobmffReader.readU32();

				let sampleIndex = 0;
				for (let i = 0; i < entryCount; i++) {
					const sampleCount = this.isobmffReader.readU32();
					// version === 0 ? this.isobmffReader.readU32() : this.isobmffReader.readI32();
					const sampleOffset = this.isobmffReader.readI32();

					track.sampleTable.sampleCompositionTimeOffsets.push({
						startIndex: sampleIndex,
						count: sampleCount,
						offset: sampleOffset,
					});

					sampleIndex += sampleCount;
				}
			}; break;

			case 'stsz': {
				const track = this.currentTrack;
				assert(track);

				if (!track.sampleTable) {
					break;
				}

				this.isobmffReader.pos += 4; // Version + flags

				const sampleSize = this.isobmffReader.readU32();
				const sampleCount = this.isobmffReader.readU32();

				if (sampleSize === 0) {
					for (let i = 0; i < sampleCount; i++) {
						const sampleSize = this.isobmffReader.readU32();
						track.sampleTable.sampleSizes.push(sampleSize);
					}
				} else {
					track.sampleTable.sampleSizes.push(sampleSize);
				}
			}; break;

			case 'stz2': {
				throw new Error('Unsupported.');
			};

			case 'stss': {
				const track = this.currentTrack;
				assert(track);

				if (!track.sampleTable) {
					break;
				}

				this.isobmffReader.pos += 4; // Version + flags

				track.sampleTable.keySampleIndices = [];

				const entryCount = this.isobmffReader.readU32();
				for (let i = 0; i < entryCount; i++) {
					const sampleIndex = this.isobmffReader.readU32() - 1; // Convert to 0-indexed
					track.sampleTable.keySampleIndices.push(sampleIndex);
				}
			}; break;

			case 'stsc': {
				const track = this.currentTrack;
				assert(track);

				if (!track.sampleTable) {
					break;
				}

				this.isobmffReader.pos += 4;

				const entryCount = this.isobmffReader.readU32();

				for (let i = 0; i < entryCount; i++) {
					const startChunkIndex = this.isobmffReader.readU32() - 1; // Convert to 0-indexed
					const samplesPerChunk = this.isobmffReader.readU32();
					const sampleDescriptionIndex = this.isobmffReader.readU32();

					track.sampleTable.sampleToChunk.push({
						startSampleIndex: -1,
						startChunkIndex,
						samplesPerChunk,
						sampleDescriptionIndex,
					});
				}

				let startSampleIndex = 0;
				for (let i = 0; i < track.sampleTable.sampleToChunk.length; i++) {
					track.sampleTable.sampleToChunk[i]!.startSampleIndex = startSampleIndex;

					if (i < track.sampleTable.sampleToChunk.length - 1) {
						const nextChunk = track.sampleTable.sampleToChunk[i + 1]!;
						const chunkCount = nextChunk.startChunkIndex
							- track.sampleTable.sampleToChunk[i]!.startChunkIndex;
						startSampleIndex += chunkCount * track.sampleTable.sampleToChunk[i]!.samplesPerChunk;
					}
				}
			}; break;

			case 'stco': {
				const track = this.currentTrack;
				assert(track);

				if (!track.sampleTable) {
					break;
				}

				this.isobmffReader.pos += 4; // Version + flags

				const entryCount = this.isobmffReader.readU32();

				for (let i = 0; i < entryCount; i++) {
					const chunkOffset = this.isobmffReader.readU32();
					track.sampleTable.chunkOffsets.push(chunkOffset);
				}
			}; break;

			case 'co64': {
				const track = this.currentTrack;
				assert(track);

				if (!track.sampleTable) {
					break;
				}

				this.isobmffReader.pos += 4; // Version + flags

				const entryCount = this.isobmffReader.readU32();

				for (let i = 0; i < entryCount; i++) {
					const chunkOffset = this.isobmffReader.readU64();
					track.sampleTable.chunkOffsets.push(chunkOffset);
				}
			}; break;
		}

		this.isobmffReader.pos = boxEndPos;
	}
}

abstract class IsobmffTrackBacking implements InputTrackBacking {
	chunkToSampleIndex = new WeakMap<EncodedVideoChunk, number>();
	sampleIndexToChunk = new Map<number, WeakRef<EncodedVideoChunk>>();

	constructor(public internalTrack: InternalTrack) {

	}

	getCodec(): Promise<MediaCodec> {
		throw new Error('Not implemented on base class.');
	}

	async getDuration() {
		return this.internalTrack.durationInTimescale / this.internalTrack.timescale;
	}
}

class IsobmffVideoTrackBacking extends IsobmffTrackBacking implements InputVideoTrackBacking {
	override internalTrack: InternalVideoTrack;

	constructor(internalTrack: InternalVideoTrack) {
		super(internalTrack);
		this.internalTrack = internalTrack;
	}

	override async getCodec(): Promise<VideoCodec> {
		return this.internalTrack.info.codec!;
	}

	async getWidth() {
		return this.internalTrack.info.width;
	}

	async getHeight() {
		return this.internalTrack.info.height;
	}

	async getRotation() {
		return this.internalTrack.rotation;
	}

	async getDecoderConfig(): Promise<VideoDecoderConfig> {
		return {
			codec: extractVideoCodecString(this.internalTrack.info.codec!, this.internalTrack.info.codecDescription),
			codedWidth: this.internalTrack.info.width,
			codedHeight: this.internalTrack.info.height,
			description: this.internalTrack.info.codecDescription ?? undefined,
			colorSpace: this.internalTrack.info.colorSpace ?? undefined,
		};
	}

	private async fetchChunkForSampleIndex(sampleIndex: number) {
		if (sampleIndex === -1) {
			return null;
		}

		const existingChunk = this.sampleIndexToChunk.get(sampleIndex)?.deref();
		if (existingChunk) {
			return existingChunk;
		}

		const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
		const sampleInfo = getSampleInfo(sampleTable, sampleIndex);
		if (!sampleInfo) {
			return null;
		}

		await this.internalTrack.demuxer.chunkReader.reader.loadRange(
			sampleInfo.chunkOffset,
			sampleInfo.chunkOffset + sampleInfo.chunkSize,
		);
		const data = this.internalTrack.demuxer.chunkReader.readRange(
			sampleInfo.sampleOffset,
			sampleInfo.sampleOffset + sampleInfo.sampleSize,
		);

		const chunk = new EncodedVideoChunk({
			data,
			timestamp: (1e6 * sampleInfo.presentationTimestamp) / this.internalTrack.timescale,
			duration: (1e6 * sampleInfo.duration) / this.internalTrack.timescale,
			type: sampleInfo.isKeyFrame ? 'key' : 'delta',
		});

		this.chunkToSampleIndex.set(chunk, sampleIndex);
		this.sampleIndexToChunk.set(sampleIndex, new WeakRef(chunk));

		return chunk;
	}

	async getFirstChunk() {
		return this.fetchChunkForSampleIndex(0);
	}

	async getChunk(timestamp: number) {
		const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
		const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestamp * this.internalTrack.timescale);
		return this.fetchChunkForSampleIndex(sampleIndex);
	}

	async getNextChunk(chunk: EncodedVideoChunk) {
		const sampleIndex = this.chunkToSampleIndex.get(chunk);
		if (sampleIndex === undefined) {
			throw new Error('Chunk was not created from this track.');
		}
		return this.fetchChunkForSampleIndex(sampleIndex + 1);
	}

	async getKeyChunk(timestamp: number) {
		const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
		const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestamp * this.internalTrack.timescale);
		const keyFrameSampleIndex = sampleIndex === -1
			? -1
			: getRelevantKeyframeIndexForSample(sampleTable, sampleIndex);
		return this.fetchChunkForSampleIndex(keyFrameSampleIndex);
	}

	async getNextKeyChunk(chunk: EncodedVideoChunk) {
		const sampleIndex = this.chunkToSampleIndex.get(chunk);
		if (sampleIndex === undefined) {
			throw new Error('Chunk was not created from this track.');
		}
		const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
		const nextKeyFrameSampleIndex = getNextKeyframeIndexForSample(sampleTable, sampleIndex);
		return this.fetchChunkForSampleIndex(nextKeyFrameSampleIndex);
	}
}

class IsobmffAudioTrackBacking extends IsobmffTrackBacking implements InputAudioTrackBacking {
	override internalTrack: InternalAudioTrack;

	constructor(internalTrack: InternalAudioTrack) {
		super(internalTrack);
		this.internalTrack = internalTrack;
	}

	override async getCodec(): Promise<AudioCodec> {
		return this.internalTrack.info.codec!;
	}

	async getNumberOfChannels() {
		return this.internalTrack.info.numberOfChannels;
	}

	async getSampleRate() {
		return this.internalTrack.info.sampleRate;
	}

	async getDecoderConfig(): Promise<AudioDecoderConfig> {
		return {
			codec: extractAudioCodecString(this.internalTrack.info.codec!, this.internalTrack.info.codecDescription),
			numberOfChannels: this.internalTrack.info.numberOfChannels,
			sampleRate: this.internalTrack.info.sampleRate,
			description: this.internalTrack.info.codecDescription ?? undefined,
		};
	}
}

const getSampleIndexForTimestamp = (sampleTable: SampleTable, timescaleUnits: number) => {
	const index = binarySearchLessOrEqual(
		sampleTable.presentationTimestamps,
		timescaleUnits,
		x => x.presentationTimestamp,
	);
	if (index === -1) {
		return -1;
	}

	return sampleTable.presentationTimestamps[index]!.sampleIndex;
};

type SampleInfo = {
	presentationTimestamp: number;
	duration: number;
	sampleOffset: number;
	sampleSize: number;
	chunkOffset: number;
	chunkSize: number;
	isKeyFrame: boolean;
};

const getSampleInfo = (sampleTable: SampleTable, sampleIndex: number): SampleInfo | null => {
	const timingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, sampleIndex, x => x.startIndex);
	const timingEntry = sampleTable.sampleTimingEntries[timingEntryIndex];
	if (!timingEntry || timingEntry.startIndex + timingEntry.count <= sampleIndex) {
		return null;
	}

	const decodeTimestamp = timingEntry.startDecodeTimestamp
		+ (sampleIndex - timingEntry.startIndex) * timingEntry.delta;
	let presentationTimestamp = decodeTimestamp;
	const offsetEntryIndex = binarySearchLessOrEqual(
		sampleTable.sampleCompositionTimeOffsets,
		sampleIndex,
		x => x.startIndex,
	);
	const offsetEntry = sampleTable.sampleCompositionTimeOffsets[offsetEntryIndex];
	if (offsetEntry) {
		presentationTimestamp += offsetEntry.offset;
	}

	const sampleSize = sampleTable.sampleSizes[Math.min(sampleIndex, sampleTable.sampleSizes.length - 1)]!;
	const chunkEntryIndex = binarySearchLessOrEqual(sampleTable.sampleToChunk, sampleIndex, x => x.startSampleIndex);
	const chunkEntry = sampleTable.sampleToChunk[chunkEntryIndex];
	assert(chunkEntry);

	const chunkIndex = chunkEntry.startChunkIndex
		+ Math.floor((sampleIndex - chunkEntry.startSampleIndex) / chunkEntry.samplesPerChunk);
	const chunkOffset = sampleTable.chunkOffsets[chunkIndex]!;

	let chunkSize = 0;

	let sampleOffset = chunkOffset;
	if (sampleTable.sampleSizes.length === 1) {
		sampleOffset += sampleSize * (sampleIndex - chunkEntry.startSampleIndex);
		chunkSize += sampleSize * chunkEntry.samplesPerChunk;
	} else {
		const startSampleIndex = chunkEntry.startSampleIndex
			+ (chunkIndex - chunkEntry.startChunkIndex) * chunkEntry.samplesPerChunk;

		for (let i = startSampleIndex; i < startSampleIndex + chunkEntry.samplesPerChunk; i++) {
			const sampleSize = sampleTable.sampleSizes[i]!;

			if (i < sampleIndex) {
				sampleOffset += sampleSize;
			}
			chunkSize += sampleSize;
		}
	}

	return {
		presentationTimestamp,
		duration: timingEntry.delta,
		sampleOffset,
		sampleSize,
		chunkOffset,
		chunkSize,
		isKeyFrame: sampleTable.keySampleIndices
			? binarySearchExact(sampleTable.keySampleIndices, sampleIndex, x => x) !== -1
			: true,
	};
};

const getRelevantKeyframeIndexForSample = (sampleTable: SampleTable, sampleIndex: number) => {
	if (!sampleTable.keySampleIndices) {
		return sampleIndex;
	}

	const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, x => x);
	return sampleTable.keySampleIndices[index] ?? -1;
};

const getNextKeyframeIndexForSample = (sampleTable: SampleTable, sampleIndex: number) => {
	if (!sampleTable.keySampleIndices) {
		return sampleIndex + 1;
	}

	const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, x => x);
	return sampleTable.keySampleIndices[index + 1] ?? -1;
};
