import {
	AudioCodec,
	extractAudioCodecString,
	extractVideoCodecString,
	MediaCodec,
	parseAacAudioSpecificConfig,
	VideoCodec,
} from '../codec';
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
import { ChunkRetrievalOptions } from '../media-drain';
import {
	assert,
	COLOR_PRIMARIES_MAP_INVERSE,
	MATRIX_COEFFICIENTS_MAP_INVERSE,
	TRANSFER_CHARACTERISTICS_MAP_INVERSE,
	rotationMatrix,
	binarySearchLessOrEqual,
	binarySearchExact,
	Rotation,
	last,
	AsyncMutex,
	findLastIndex,
} from '../misc';
import { Reader } from '../reader';
import { IsobmffReader } from './isobmff-reader';

type InternalTrack = {
	id: number;
	demuxer: IsobmffDemuxer;
	inputTrack: InputTrack | null;
	timescale: number;
	durationInTimescale: number;
	rotation: Rotation;
	sampleTableOffset: number;
	sampleTable: SampleTable | null;
	fragmentLookupTable: FragmentLookupTableEntry[] | null;
	currentFragmentState: FragmentTrackState | null;
	fragments: Fragment[];
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

type FragmentTrackDefaults = {
	trackId: number;
	defaultSampleDescriptionIndex: number;
	defaultSampleDuration: number;
	defaultSampleSize: number;
	defaultSampleFlags: number;
};

type FragmentLookupTableEntry = {
	timestamp: number;
	moofOffset: number;
};

type FragmentTrackState = {
	baseDataOffset: number;
	sampleDescriptionIndex: number | null;
	defaultSampleDuration: number | null;
	defaultSampleSize: number | null;
	defaultSampleFlags: number | null;
	startTimestamp: number | null;
};

type FragmentTrackData = {
	startTimestamp: number;
	endTimestamp: number;
	samples: FragmentTrackSample[];
	presentationTimestamps: {
		presentationTimestamp: number;
		sampleIndex: number;
	}[];
	startTimestampIsFinal: boolean;
};

type FragmentTrackSample = {
	presentationTimestamp: number;
	duration: number;
	byteOffset: number;
	byteSize: number;
	isKeyFrame: boolean;
};

type Fragment = {
	moofOffset: number;
	moofSize: number;
	implicitBaseDataOffset: number;
	trackData: Map<InternalTrack['id'], FragmentTrackData>;
	dataStart: number;
	dataEnd: number;
	nextFragment: Fragment | null;
};

const knownMatrixes = [rotationMatrix(0), rotationMatrix(90), rotationMatrix(180), rotationMatrix(270)];

export class IsobmffDemuxer extends Demuxer {
	isobmffReader: IsobmffReader;
	currentTrack: InternalTrack | null = null;
	tracks: InternalTrack[] = [];
	metadataPromise: Promise<void> | null = null;
	movieTimescale = -1;
	movieDurationInTimescale = -1;

	isFragmented = false;
	fragmentTrackDefaults: FragmentTrackDefaults[] = [];
	fragments: Fragment[] = [];
	currentFragment: Fragment | null = null;
	fragmentLookupMutex = new AsyncMutex();

	chunkReader: IsobmffReader;

	constructor(input: Input) {
		super(input);

		this.isobmffReader = new IsobmffReader(input._mainReader);
		this.chunkReader = new IsobmffReader(new Reader(input._source, 64 * 2 ** 20)); // Max 64 MiB of stored chunks
	}

	override async computeDuration() {
		const tracks = await this.getTracks();
		const trackDurations = await Promise.all(tracks.map(x => x.computeDuration()));
		return Math.max(0, ...trackDurations);
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

					break;
				}

				this.isobmffReader.pos = startPos + boxInfo.totalSize;
			}

			if (this.isFragmented) {
				// The last 4 bytes may contain the size of the mfra box at the end of the file
				await this.isobmffReader.reader.loadRange(sourceSize - 4, sourceSize);

				this.isobmffReader.pos = sourceSize - 4;
				const lastWord = this.isobmffReader.readU32();
				const potentialMfraPos = sourceSize - lastWord;

				if (potentialMfraPos >= 0 && potentialMfraPos < sourceSize) {
					await this.isobmffReader.reader.loadRange(potentialMfraPos, sourceSize);

					this.isobmffReader.pos = potentialMfraPos;
					const boxInfo = this.isobmffReader.readBoxHeader();

					if (boxInfo.name === 'mfra') {
						// We found the mfra box, allowing for much better random access. Let's parse it:
						this.readContiguousBoxes(boxInfo.contentSize);
					}
				}
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

	async readFragment(): Promise<Fragment> {
		const startPos = this.isobmffReader.pos;

		await this.isobmffReader.reader.loadRange(this.isobmffReader.pos, this.isobmffReader.pos + 16);

		const moofBoxInfo = this.isobmffReader.readBoxHeader();
		assert(moofBoxInfo.name === 'moof');

		await this.isobmffReader.reader.loadRange(startPos, startPos + moofBoxInfo.totalSize);

		this.isobmffReader.pos = startPos;
		this.traverseBox();

		const index = binarySearchExact(this.fragments, startPos, x => x.moofOffset);
		assert(index !== -1);

		const fragment = this.fragments[index]!;
		assert(fragment.moofOffset === startPos);

		this.isobmffReader.reader.forgetRange(startPos, startPos + moofBoxInfo.totalSize);

		// It may be that some tracks don't define the base decode time, i.e. when the fragment begins. This means the
		// only other option is to sum up the duration of all previous fragments.
		for (const [trackId, trackData] of fragment.trackData) {
			if (trackData.startTimestampIsFinal) {
				continue;
			}

			const internalTrack = this.tracks.find(x => x.id === trackId)!;

			this.isobmffReader.pos = 0;
			let currentFragment: Fragment | null = null;
			let lastFragment: Fragment | null = null;

			const index = binarySearchLessOrEqual(
				internalTrack.fragments,
				startPos - 1,
				x => x.moofOffset,
			);
			if (index !== -1) {
				// Instead of starting at the start of the file, let's start at the previous fragment instead (which
				// already has final timestamps).
				currentFragment = internalTrack.fragments[index]!;
				lastFragment = currentFragment;
				this.isobmffReader.pos = currentFragment.moofOffset + currentFragment.moofSize;
			}

			while (this.isobmffReader.pos < startPos) {
				if (currentFragment?.nextFragment) {
					currentFragment = currentFragment.nextFragment;
					this.isobmffReader.pos = currentFragment.moofOffset + currentFragment.moofSize;
				} else {
					await this.isobmffReader.reader.loadRange(this.isobmffReader.pos, this.isobmffReader.pos + 16);
					const startPos = this.isobmffReader.pos;
					const boxInfo = this.isobmffReader.readBoxHeader();

					if (boxInfo.name === 'moof') {
						const index = binarySearchExact(this.fragments, startPos, x => x.moofOffset);

						if (index === -1) {
							this.isobmffReader.pos = startPos;

							const fragment = await this.readFragment(); // Recursive call
							if (currentFragment) currentFragment.nextFragment = fragment;
							currentFragment = fragment;
						} else {
							// We already know this fragment
							const fragment = this.fragments[index]!;
							if (currentFragment) currentFragment.nextFragment = fragment;
							currentFragment = fragment;
						}
					}

					this.isobmffReader.pos = startPos + boxInfo.totalSize;
				}

				if (currentFragment && currentFragment.trackData.has(trackId)) {
					lastFragment = currentFragment;
				}
			}

			if (lastFragment) {
				const otherTrackData = lastFragment.trackData.get(trackId)!;
				assert(otherTrackData.startTimestampIsFinal);

				offsetFragmentTrackDataByTimestamp(trackData, otherTrackData.endTimestamp);
			}

			trackData.startTimestampIsFinal = true;
		}

		return fragment;
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
			case 'dinf':
			case 'mfra': {
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
					fragmentLookupTable: null,
					currentFragmentState: null,
					fragments: [],
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

						if (track.info.codec === 'aac') {
							// Some videos have metadata mismatch, so let's try to deduce more accurate values directly
							// from the AudioSpecificConfig:
							const audioSpecificConfig = parseAacAudioSpecificConfig(track.info.codecDescription);
							if (audioSpecificConfig.numberOfChannels !== null) {
								track.info.numberOfChannels = audioSpecificConfig.numberOfChannels;
							}
							if (audioSpecificConfig.sampleRate !== null) {
								track.info.sampleRate = audioSpecificConfig.sampleRate;
							}
						}
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
					track.rotation = (90 * matrixIndex) as Rotation;
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

			case 'mvex': {
				this.isFragmented = true;
				this.readContiguousBoxes(boxInfo.contentSize);
			}; break;

			case 'mehd': {
				const version = this.isobmffReader.readU8();
				this.isobmffReader.pos += 3; // Flags

				const fragmentDuration = version === 1 ? this.isobmffReader.readU64() : this.isobmffReader.readU32();
				this.movieDurationInTimescale = fragmentDuration;
			}; break;

			case 'trex': {
				this.isobmffReader.pos += 4; // Version + flags

				const trackId = this.isobmffReader.readU32();
				const defaultSampleDescriptionIndex = this.isobmffReader.readU32();
				const defaultSampleDuration = this.isobmffReader.readU32();
				const defaultSampleSize = this.isobmffReader.readU32();
				const defaultSampleFlags = this.isobmffReader.readU32();

				// We store these separately rather than in the tracks since the tracks may not exist yet
				this.fragmentTrackDefaults.push({
					trackId,
					defaultSampleDescriptionIndex,
					defaultSampleDuration,
					defaultSampleSize,
					defaultSampleFlags,
				});
			}; break;

			case 'tfra': {
				const version = this.isobmffReader.readU8();
				this.isobmffReader.pos += 3; // Flags

				const trackId = this.isobmffReader.readU32();
				const track = this.tracks.find(x => x.id === trackId);
				if (!track) {
					break;
				}

				track.fragmentLookupTable = [];

				const word = this.isobmffReader.readU32();

				const lengthSizeOfTrafNum = (word & 0b110000) >> 4;
				const lengthSizeOfTrunNum = (word & 0b001100) >> 2;
				const lengthSizeOfSampleNum = word & 0b000011;

				const x = this.isobmffReader;
				const functions = [x.readU8.bind(x), x.readU16.bind(x), x.readU24.bind(x), x.readU32.bind(x)];

				const readTrafNum = functions[lengthSizeOfTrafNum]!;
				const readTrunNum = functions[lengthSizeOfTrunNum]!;
				const readSampleNum = functions[lengthSizeOfSampleNum]!;

				const numberOfEntries = this.isobmffReader.readU32();
				for (let i = 0; i < numberOfEntries; i++) {
					const time = version === 1 ? this.isobmffReader.readU64() : this.isobmffReader.readU32();
					const moofOffset = version === 1 ? this.isobmffReader.readU64() : this.isobmffReader.readU32();

					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const trafNumber = readTrafNum();
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const trunNumber = readTrunNum();
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const sampleNumber = readSampleNum();

					track.fragmentLookupTable.push({
						timestamp: time,
						moofOffset,
					});
				}
			}; break;

			case 'moof': {
				this.currentFragment = {
					moofOffset: startPos,
					moofSize: boxInfo.totalSize,
					implicitBaseDataOffset: startPos,
					trackData: new Map(),
					dataStart: Infinity,
					dataEnd: 0,
					nextFragment: null,
				};

				this.readContiguousBoxes(boxInfo.contentSize);

				const insertionIndex = binarySearchLessOrEqual(
					this.fragments,
					this.currentFragment.moofOffset,
					x => x.moofOffset,
				);
				this.fragments.splice(insertionIndex + 1, 0, this.currentFragment);

				// Compute the byte range of the sample data in this fragment, so we can load the whole fragment at once
				for (const [, trackData] of this.currentFragment.trackData) {
					const firstSample = trackData.samples[0]!;
					const lastSample = last(trackData.samples)!;

					this.currentFragment.dataStart = Math.min(
						this.currentFragment.dataStart,
						firstSample.byteOffset,
					);
					this.currentFragment.dataEnd = Math.max(
						this.currentFragment.dataEnd,
						lastSample.byteOffset + lastSample.byteSize,
					);
				}

				this.currentFragment = null;
			}; break;

			case 'traf': {
				assert(this.currentFragment);

				this.readContiguousBoxes(boxInfo.contentSize);

				// It is possible that there is no current track, for example when we don't care about the track
				// referenced in the track fragment header.
				if (this.currentTrack) {
					const trackData = this.currentFragment.trackData.get(this.currentTrack.id);
					if (trackData) {
						// We know there is sample data for this track in this fragment, so let's add it to the
						// track's fragments:
						const insertionIndex = binarySearchLessOrEqual(
							this.currentTrack.fragments,
							this.currentFragment.moofOffset,
							x => x.moofOffset,
						);
						this.currentTrack.fragments.splice(insertionIndex + 1, 0, this.currentFragment);

						const { currentFragmentState } = this.currentTrack;
						assert(currentFragmentState);

						if (currentFragmentState.startTimestamp !== null) {
							offsetFragmentTrackDataByTimestamp(trackData, currentFragmentState.startTimestamp);
							trackData.startTimestampIsFinal = true;
						}
					}

					this.currentTrack.currentFragmentState = null;
					this.currentTrack = null;
				}
			}; break;

			case 'tfhd': {
				assert(this.currentFragment);

				this.isobmffReader.pos += 1; // Version

				const flags = this.isobmffReader.readU24();
				const baseDataOffsetPresent = Boolean(flags & 0x000001);
				const sampleDescriptionIndexPresent = Boolean(flags & 0x000002);
				const defaultSampleDurationPresent = Boolean(flags & 0x000008);
				const defaultSampleSizePresent = Boolean(flags & 0x000010);
				const defaultSampleFlagsPresent = Boolean(flags & 0x000020);
				const durationIsEmpty = Boolean(flags & 0x010000);
				const defaultBaseIsMoof = Boolean(flags & 0x020000);

				const trackId = this.isobmffReader.readU32();
				const track = this.tracks.find(x => x.id === trackId);
				if (!track) {
					// We don't care about this track
					break;
				}

				const defaults = this.fragmentTrackDefaults.find(x => x.trackId === trackId);

				this.currentTrack = track;
				track.currentFragmentState = {
					baseDataOffset: this.currentFragment.implicitBaseDataOffset,
					sampleDescriptionIndex: defaults?.defaultSampleDescriptionIndex ?? null,
					defaultSampleDuration: defaults?.defaultSampleDuration ?? null,
					defaultSampleSize: defaults?.defaultSampleSize ?? null,
					defaultSampleFlags: defaults?.defaultSampleFlags ?? null,
					startTimestamp: null,
				};

				if (baseDataOffsetPresent) {
					track.currentFragmentState.baseDataOffset = this.isobmffReader.readU64();
				} else if (defaultBaseIsMoof) {
					track.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset;
				}
				if (sampleDescriptionIndexPresent) {
					track.currentFragmentState.sampleDescriptionIndex = this.isobmffReader.readU32();
				}
				if (defaultSampleDurationPresent) {
					track.currentFragmentState.defaultSampleDuration = this.isobmffReader.readU32();
				}
				if (defaultSampleSizePresent) {
					track.currentFragmentState.defaultSampleSize = this.isobmffReader.readU32();
				}
				if (defaultSampleFlagsPresent) {
					track.currentFragmentState.defaultSampleFlags = this.isobmffReader.readU32();
				}
				if (durationIsEmpty) {
					track.currentFragmentState.defaultSampleDuration = 0;
				}
			}; break;

			case 'tfdt': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				assert(track.currentFragmentState);

				// break;

				const version = this.isobmffReader.readU8();
				this.isobmffReader.pos += 3; // Flags

				const baseMediaDecodeTime = version === 0 ? this.isobmffReader.readU32() : this.isobmffReader.readU64();
				track.currentFragmentState.startTimestamp = baseMediaDecodeTime;
			}; break;

			case 'trun': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				assert(this.currentFragment);
				assert(track.currentFragmentState);

				if (this.currentFragment.trackData.has(track.id)) {
					throw new Error('Can\'t have two trun boxes for the same track in one fragment.');
				}

				const version = this.isobmffReader.readU8();

				const flags = this.isobmffReader.readU24();
				const dataOffsetPresent = Boolean(flags & 0x000001);
				const firstSampleFlagsPresent = Boolean(flags & 0x000004);
				const sampleDurationPresent = Boolean(flags & 0x000100);
				const sampleSizePresent = Boolean(flags & 0x000200);
				const sampleFlagsPresent = Boolean(flags & 0x000400);
				const sampleCompositionTimeOffsetsPresent = Boolean(flags & 0x000800);

				const sampleCount = this.isobmffReader.readU32();

				let dataOffset = track.currentFragmentState.baseDataOffset;
				if (dataOffsetPresent) {
					dataOffset += this.isobmffReader.readI32();
				}
				let firstSampleFlags: number | null = null;
				if (firstSampleFlagsPresent) {
					firstSampleFlags = this.isobmffReader.readU32();
				}

				let currentOffset = dataOffset;

				if (sampleCount === 0) {
					// Don't associate the fragment with the track if it has no samples, this simplifies other code
					this.currentFragment.implicitBaseDataOffset = currentOffset;
					break;
				}

				let currentTimestamp = 0;

				const trackData: FragmentTrackData = {
					startTimestamp: 0,
					endTimestamp: 0,
					samples: [],
					presentationTimestamps: [],
					startTimestampIsFinal: false,
				};
				this.currentFragment.trackData.set(track.id, trackData);

				for (let i = 0; i < sampleCount; i++) {
					let sampleDuration: number;
					if (sampleDurationPresent) {
						sampleDuration = this.isobmffReader.readU32();
					} else {
						assert(track.currentFragmentState.defaultSampleDuration !== null);
						sampleDuration = track.currentFragmentState.defaultSampleDuration;
					}

					let sampleSize: number;
					if (sampleSizePresent) {
						sampleSize = this.isobmffReader.readU32();
					} else {
						assert(track.currentFragmentState.defaultSampleSize !== null);
						sampleSize = track.currentFragmentState.defaultSampleSize;
					}

					let sampleFlags: number;
					if (sampleFlagsPresent) {
						sampleFlags = this.isobmffReader.readU32();
					} else {
						assert(track.currentFragmentState.defaultSampleFlags !== null);
						sampleFlags = track.currentFragmentState.defaultSampleFlags;
					}
					if (i === 0 && firstSampleFlags !== null) {
						sampleFlags = firstSampleFlags;
					}

					let sampleCompositionTimeOffset = 0;
					if (sampleCompositionTimeOffsetsPresent) {
						if (version === 0) {
							sampleCompositionTimeOffset = this.isobmffReader.readU32();
						} else {
							sampleCompositionTimeOffset = this.isobmffReader.readI32();
						}
					}

					const isKeyFrame = !(sampleFlags & 0x00010000);

					trackData.samples.push({
						presentationTimestamp: currentTimestamp + sampleCompositionTimeOffset,
						duration: sampleDuration,
						byteOffset: currentOffset,
						byteSize: sampleSize,
						isKeyFrame,
					});

					currentOffset += sampleSize;
					currentTimestamp += sampleDuration;
				}

				trackData.presentationTimestamps = trackData.samples
					.map((x, i) => ({ presentationTimestamp: x.presentationTimestamp, sampleIndex: i }))
					.sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);

				const firstSample = trackData.samples[trackData.presentationTimestamps[0]!.sampleIndex]!;
				const lastSample = trackData.samples[last(trackData.presentationTimestamps)!.sampleIndex]!;

				trackData.startTimestamp = firstSample.presentationTimestamp;
				trackData.endTimestamp = lastSample.presentationTimestamp + lastSample.duration;

				this.currentFragment.implicitBaseDataOffset = currentOffset;
			}; break;
		}

		this.isobmffReader.pos = boxEndPos;
	}
}

abstract class IsobmffTrackBacking<Chunk extends EncodedVideoChunk | EncodedAudioChunk> implements InputTrackBacking {
	chunkToSampleIndex = new WeakMap<Chunk, number>();
	chunkToFragmentLocation = new WeakMap<Chunk, {
		fragment: Fragment;
		sampleIndex: number;
	}>();

	constructor(public internalTrack: InternalTrack) {}

	getCodec(): Promise<MediaCodec> {
		throw new Error('Not implemented on base class.');
	}

	async computeDuration() {
		const lastChunk = await this.getChunk(Infinity, { metadataOnly: true });
		const timestamp = lastChunk?.timestamp;
		return timestamp ? timestamp / 1e6 : 0;
	}

	abstract createChunk(
		data: Uint8Array,
		timestamp: number,
		duration: number,
		isKeyFrame: boolean,
	): Chunk;

	async getFirstChunk(options: ChunkRetrievalOptions) {
		if (this.internalTrack.demuxer.isFragmented) {
			return this.performFragmentedLookup(
				() => {
					const fragment = this.internalTrack.fragments[0];
					return {
						fragmentIndex: fragment ? 0 : -1,
						sampleIndex: fragment ? 0 : -1,
						correctSampleFound: !!fragment,
					};
				},
				0,
				Infinity,
				options,
			);
		}

		return this.fetchChunkForSampleIndex(0, options);
	}

	private roundToMicrosecond(timestamp: number) {
		// We transform the timestamp so that chunk retrieval behaves expectedly: All chunks returned have a timestamp
		// that's floored to the microseconds, and that timestamp may be before the actual timestamp. But since the
		// actual timestamp is never communicated to the outside, chunk retrieval should work like the timestamp is
		// exactly equal to its floored version. This means, when we retrieve the chunk for timestamp 0.333333, but the
		// chunk's true, unrounded timestamp is 1/3, then we would not retrieve that chunk, despite the chunk having a
		// floored timestamp of 0.333333. That's why we transform the search timestamp by first flooring it to the
		// microsecond, and then adding "1-eps" to it to make sure get all chunks whose timestamps will round down to
		// a value included by the search timestamp.
		return (Math.floor(timestamp * 1e6) + 0.99999999) / 1e6;
	}

	async getChunk(timestamp: number, options: ChunkRetrievalOptions) {
		timestamp = this.roundToMicrosecond(timestamp);
		const timestampInTimescale = timestamp * this.internalTrack.timescale;

		if (this.internalTrack.demuxer.isFragmented) {
			return this.performFragmentedLookup(
				() => this.findSampleInFragmentsForTimestamp(timestampInTimescale),
				timestampInTimescale,
				timestampInTimescale,
				options,
			);
		} else {
			const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
			const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
			return this.fetchChunkForSampleIndex(sampleIndex, options);
		}
	}

	async getNextChunk(chunk: Chunk, options: ChunkRetrievalOptions) {
		if (this.internalTrack.demuxer.isFragmented) {
			const locationInFragment = this.chunkToFragmentLocation.get(chunk);
			if (locationInFragment === undefined) {
				throw new Error('Chunk was not created from this track.');
			}

			const trackData = locationInFragment.fragment.trackData.get(this.internalTrack.id)!;
			const sample = trackData.samples[locationInFragment.sampleIndex]!;

			const fragmentIndex = binarySearchExact(
				this.internalTrack.fragments,
				locationInFragment.fragment.moofOffset,
				x => x.moofOffset,
			);
			assert(fragmentIndex !== -1);

			return this.performFragmentedLookup(
				() => {
					if (locationInFragment.sampleIndex + 1 < trackData.samples.length) {
						// We can simply take the next sample in the fragment
						return {
							fragmentIndex,
							sampleIndex: locationInFragment.sampleIndex + 1,
							correctSampleFound: true,
						};
					} else {
						// Walk the list of fragments until we find the next fragment for this track
						let currentFragment = locationInFragment.fragment;
						while (currentFragment.nextFragment) {
							currentFragment = currentFragment.nextFragment;

							const trackData = currentFragment.trackData.get(this.internalTrack.id);
							if (trackData) {
								const fragmentIndex = binarySearchExact(
									this.internalTrack.fragments,
									currentFragment.moofOffset,
									x => x.moofOffset,
								);
								assert(fragmentIndex !== -1);
								return {
									fragmentIndex,
									sampleIndex: 0,
									correctSampleFound: true,
								};
							}
						}

						return {
							fragmentIndex,
							sampleIndex: -1,
							correctSampleFound: false,
						};
					}
				},
				sample.presentationTimestamp,
				Infinity,
				options,
			);
		}

		const sampleIndex = this.chunkToSampleIndex.get(chunk);
		if (sampleIndex === undefined) {
			throw new Error('Chunk was not created from this track.');
		}
		return this.fetchChunkForSampleIndex(sampleIndex + 1, options);
	}

	async getKeyChunk(timestamp: number, options: ChunkRetrievalOptions) {
		timestamp = this.roundToMicrosecond(timestamp);
		const timestampInTimescale = timestamp * this.internalTrack.timescale;

		if (this.internalTrack.demuxer.isFragmented) {
			return this.performFragmentedLookup(
				() => this.findKeySampleInFragmentsForTimestamp(timestampInTimescale),
				timestampInTimescale,
				timestampInTimescale,
				options,
			);
		}

		const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
		const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
		const keyFrameSampleIndex = sampleIndex === -1
			? -1
			: getRelevantKeyframeIndexForSample(sampleTable, sampleIndex);
		return this.fetchChunkForSampleIndex(keyFrameSampleIndex, options);
	}

	async getNextKeyChunk(chunk: Chunk, options: ChunkRetrievalOptions) {
		if (this.internalTrack.demuxer.isFragmented) {
			const locationInFragment = this.chunkToFragmentLocation.get(chunk);
			if (locationInFragment === undefined) {
				throw new Error('Chunk was not created from this track.');
			}

			const trackData = locationInFragment.fragment.trackData.get(this.internalTrack.id)!;
			const sample = trackData.samples[locationInFragment.sampleIndex]!;

			const fragmentIndex = binarySearchExact(
				this.internalTrack.fragments,
				locationInFragment.fragment.moofOffset,
				x => x.moofOffset,
			);
			assert(fragmentIndex !== -1);

			return this.performFragmentedLookup(
				() => {
					const nextKeyFrameIndex = trackData.samples.findIndex(
						(x, i) => x.isKeyFrame && i > locationInFragment.sampleIndex,
					);

					if (nextKeyFrameIndex !== -1) {
						// We can simply take the next key frame in the fragment
						return {
							fragmentIndex,
							sampleIndex: nextKeyFrameIndex,
							correctSampleFound: true,
						};
					} else {
						// Walk the list of fragments until we find the next fragment for this track
						let currentFragment = locationInFragment.fragment;
						while (currentFragment.nextFragment) {
							currentFragment = currentFragment.nextFragment;

							const trackData = currentFragment.trackData.get(this.internalTrack.id);
							if (trackData) {
								const fragmentIndex = binarySearchExact(
									this.internalTrack.fragments,
									currentFragment.moofOffset,
									x => x.moofOffset,
								);
								assert(fragmentIndex !== -1);

								const keyFrameIndex = trackData.samples.findIndex(x => x.isKeyFrame);
								if (keyFrameIndex === -1) {
									throw new Error('Not supported: Fragment does not contain key sample.');
								}

								return {
									fragmentIndex,
									sampleIndex: keyFrameIndex,
									correctSampleFound: true,
								};
							}
						}

						return {
							fragmentIndex,
							sampleIndex: -1,
							correctSampleFound: false,
						};
					}
				},
				sample.presentationTimestamp,
				Infinity,
				options,
			);
		}

		const sampleIndex = this.chunkToSampleIndex.get(chunk);
		if (sampleIndex === undefined) {
			throw new Error('Chunk was not created from this track.');
		}
		const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
		const nextKeyFrameSampleIndex = getNextKeyframeIndexForSample(sampleTable, sampleIndex);
		return this.fetchChunkForSampleIndex(nextKeyFrameSampleIndex, options);
	}

	private async fetchChunkForSampleIndex(sampleIndex: number, options: ChunkRetrievalOptions) {
		if (sampleIndex === -1) {
			return null;
		}

		const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
		const sampleInfo = getSampleInfo(sampleTable, sampleIndex);
		if (!sampleInfo) {
			return null;
		}

		let data: Uint8Array;
		if (options.metadataOnly) {
			data = new Uint8Array(0); // Placeholder buffer
		} else {
			// Load the entire chunk
			await this.internalTrack.demuxer.chunkReader.reader.loadRange(
				sampleInfo.chunkOffset,
				sampleInfo.chunkOffset + sampleInfo.chunkSize,
			);

			data = this.internalTrack.demuxer.chunkReader.readRange(
				sampleInfo.sampleOffset,
				sampleInfo.sampleOffset + sampleInfo.sampleSize,
			);
		}

		const timestamp = 1e6 * sampleInfo.presentationTimestamp / this.internalTrack.timescale;
		const duration = 1e6 * sampleInfo.duration / this.internalTrack.timescale;
		const chunk = this.createChunk(data, timestamp, duration, sampleInfo.isKeyFrame);

		this.chunkToSampleIndex.set(chunk, sampleIndex);

		return chunk;
	}

	private async fetchChunkInFragment(fragment: Fragment, sampleIndex: number, options: ChunkRetrievalOptions) {
		if (sampleIndex === -1) {
			return null;
		}

		const trackData = fragment.trackData.get(this.internalTrack.id)!;
		const sample = trackData.samples[sampleIndex];
		assert(sample);

		let data: Uint8Array;
		if (options.metadataOnly) {
			data = new Uint8Array(0); // Placeholder buffer
		} else {
			// Load the entire fragment
			await this.internalTrack.demuxer.chunkReader.reader.loadRange(fragment.dataStart, fragment.dataEnd);

			data = this.internalTrack.demuxer.chunkReader.readRange(
				sample.byteOffset,
				sample.byteOffset + sample.byteSize,
			);
		}

		const timestamp = 1e6 * sample.presentationTimestamp / this.internalTrack.timescale;
		const duration = 1e6 * sample.duration / this.internalTrack.timescale;
		const chunk = this.createChunk(data, timestamp, duration, sample.isKeyFrame);

		this.chunkToFragmentLocation.set(chunk, { fragment, sampleIndex });

		return chunk;
	}

	private findSampleInFragmentsForTimestamp(timestampInTimescale: number) {
		const fragmentIndex = binarySearchLessOrEqual(
			this.internalTrack.fragments,
			timestampInTimescale,
			x => x.trackData.get(this.internalTrack.id)!.startTimestamp,
		);
		let sampleIndex = -1;
		let correctSampleFound = false;

		if (fragmentIndex !== -1) {
			const fragment = this.internalTrack.fragments[fragmentIndex]!;
			const trackData = fragment.trackData.get(this.internalTrack.id)!;

			const index = binarySearchLessOrEqual(
				trackData.presentationTimestamps,
				timestampInTimescale,
				x => x.presentationTimestamp,
			);
			assert(index !== -1);

			sampleIndex = trackData.presentationTimestamps[index]!.sampleIndex;
			correctSampleFound = timestampInTimescale < trackData.endTimestamp;
		}

		return { fragmentIndex, sampleIndex, correctSampleFound };
	}

	private findKeySampleInFragmentsForTimestamp(timestampInTimescale: number) {
		const fragmentIndex = binarySearchLessOrEqual(
			this.internalTrack.fragments,
			timestampInTimescale,
			x => x.trackData.get(this.internalTrack.id)!.startTimestamp,
		);
		let sampleIndex = -1;
		let correctSampleFound = false;

		if (fragmentIndex !== -1) {
			const fragment = this.internalTrack.fragments[fragmentIndex]!;
			const trackData = fragment.trackData.get(this.internalTrack.id)!;
			const index = findLastIndex(trackData.presentationTimestamps, (x) => {
				const sample = trackData.samples[x.sampleIndex]!;
				return sample.isKeyFrame && x.presentationTimestamp <= timestampInTimescale;
			});

			if (index === -1) {
				throw new Error('Not supported: Fragment does not begin with a key sample.');
			}

			const entry = trackData.presentationTimestamps[index]!;
			sampleIndex = entry.sampleIndex;
			correctSampleFound = timestampInTimescale < trackData.endTimestamp;
		}

		return { fragmentIndex, sampleIndex, correctSampleFound };
	}

	/** Looks for a sample in the fragments while trying to load as few fragments as possible to retrieve it. */
	private async performFragmentedLookup(
		// This function returns the best-matching sample that is currently loaded. Based on this information, we know
		// which fragments we need to load to find the actual match.
		getBestMatch: () => { fragmentIndex: number; sampleIndex: number; correctSampleFound: boolean },
		// The timestamp with which we can search the lookup table
		searchTimestamp: number,
		// The timestamp for which we know the correct sample will not come after it
		latestTimestamp: number,
		options: ChunkRetrievalOptions,
	) {
		const demuxer = this.internalTrack.demuxer;
		const release = await demuxer.fragmentLookupMutex.acquire(); // The algorithm requires exclusivity

		try {
			const { fragmentIndex, sampleIndex, correctSampleFound } = getBestMatch();
			if (correctSampleFound) {
				// The correct sample already exists, easy path.
				const fragment = this.internalTrack.fragments[fragmentIndex]!;
				return this.fetchChunkInFragment(fragment, sampleIndex, options);
			}

			const isobmffReader = demuxer.isobmffReader;
			const sourceSize = await isobmffReader.reader.source._getSize();

			let prevFragment: Fragment | null = null;
			let bestFragmentIndex = fragmentIndex;
			let bestSampleIndex = sampleIndex;

			let lookupEntry: FragmentLookupTableEntry | null = null;
			if (this.internalTrack.fragmentLookupTable) {
				// Search for a lookup entry; this way, we won't need to start searching from the start of the file
				// but can jump right into the correct fragment (or at least nearby).
				const index = binarySearchLessOrEqual(
					this.internalTrack.fragmentLookupTable,
					searchTimestamp,
					x => x.timestamp,
				);

				if (index !== -1) {
					lookupEntry = this.internalTrack.fragmentLookupTable[index]!;
				}
			}

			if (fragmentIndex === -1) {
				isobmffReader.pos = lookupEntry?.moofOffset ?? 0;
			} else {
				const fragment = this.internalTrack.fragments[fragmentIndex]!;

				if (!lookupEntry || fragment.moofOffset >= fragment.moofOffset) {
					isobmffReader.pos = fragment.moofOffset + fragment.moofSize;
					prevFragment = fragment;
				} else {
					isobmffReader.pos = lookupEntry.moofOffset;
				}
			}

			while (isobmffReader.pos < sourceSize) {
				if (prevFragment) {
					const trackData = prevFragment.trackData.get(this.internalTrack.id);
					if (trackData && trackData.startTimestamp > latestTimestamp) {
						// We're already past the upper bound, no need to keep searching
						break;
					}

					if (prevFragment.nextFragment) {
						// Skip ahead quickly without needing to read the file again
						isobmffReader.pos = prevFragment.nextFragment.moofOffset + prevFragment.nextFragment.moofSize;
						prevFragment = prevFragment.nextFragment;
						continue;
					}
				}

				// Load the header
				await isobmffReader.reader.loadRange(isobmffReader.pos, isobmffReader.pos + 16);
				const startPos = isobmffReader.pos;
				const boxInfo = isobmffReader.readBoxHeader();

				if (boxInfo.name === 'moof') {
					const index = binarySearchExact(demuxer.fragments, startPos, x => x.moofOffset);

					if (index === -1) {
						// This is the first time we've seen this fragment
						isobmffReader.pos = startPos;

						const fragment = await demuxer.readFragment();
						if (prevFragment) prevFragment.nextFragment = fragment;
						prevFragment = fragment;

						const { fragmentIndex, sampleIndex, correctSampleFound } = getBestMatch();
						if (correctSampleFound) {
							const fragment = this.internalTrack.fragments[fragmentIndex]!;
							return this.fetchChunkInFragment(fragment, sampleIndex, options);
						}
						if (fragmentIndex !== -1) {
							bestFragmentIndex = fragmentIndex;
							bestSampleIndex = sampleIndex;
						}
					} else {
						// We already know this fragment
						const fragment = demuxer.fragments[index]!;
						if (prevFragment) prevFragment.nextFragment = fragment;
						prevFragment = fragment;
					}
				}

				isobmffReader.pos = startPos + boxInfo.totalSize;
			}

			if (bestFragmentIndex !== -1) {
				// If we finished looping but didn't find a perfect match, still return the best match we found
				const fragment = this.internalTrack.fragments[bestFragmentIndex]!;
				return this.fetchChunkInFragment(fragment, bestSampleIndex, options);
			}

			return null;
		} finally {
			release();
		}
	}
}

class IsobmffVideoTrackBacking extends IsobmffTrackBacking<EncodedVideoChunk> implements InputVideoTrackBacking {
	override internalTrack: InternalVideoTrack;

	constructor(internalTrack: InternalVideoTrack) {
		super(internalTrack);
		this.internalTrack = internalTrack;
	}

	override async getCodec(): Promise<VideoCodec> {
		return this.internalTrack.info.codec!;
	}

	async getCodedWidth() {
		return this.internalTrack.info.width;
	}

	async getCodedHeight() {
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

	createChunk(data: Uint8Array, timestamp: number, duration: number, isKeyFrame: boolean) {
		return new EncodedVideoChunk({
			data,
			timestamp,
			duration,
			type: isKeyFrame ? 'key' : 'delta',
		});
	}
}

class IsobmffAudioTrackBacking extends IsobmffTrackBacking<EncodedAudioChunk> implements InputAudioTrackBacking {
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

	createChunk(data: Uint8Array, timestamp: number, duration: number, isKeyFrame: boolean) {
		return new EncodedAudioChunk({
			data,
			timestamp,
			duration,
			type: isKeyFrame ? 'key' : 'delta',
		});
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

const offsetFragmentTrackDataByTimestamp = (trackData: FragmentTrackData, timestamp: number) => {
	trackData.startTimestamp += timestamp;
	trackData.endTimestamp += timestamp;

	for (const sample of trackData.samples) {
		sample.presentationTimestamp += timestamp;
	}
	for (const entry of trackData.presentationTimestamps) {
		entry.presentationTimestamp += timestamp;
	}
};
