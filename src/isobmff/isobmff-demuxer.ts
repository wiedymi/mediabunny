/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
	AacCodecInfo,
	AudioCodec,
	extractAudioCodecString,
	extractVideoCodecString,
	MediaCodec,
	OPUS_SAMPLE_RATE,
	parseAacAudioSpecificConfig,
	parsePcmCodec,
	PCM_AUDIO_CODECS,
	PcmAudioCodec,
	VideoCodec,
} from '../codec';
import {
	Av1CodecInfo,
	AvcDecoderConfigurationRecord,
	extractAv1CodecInfoFromPacket,
	extractVp9CodecInfoFromPacket,
	FlacBlockType,
	HevcDecoderConfigurationRecord,
	Vp9CodecInfo,
} from '../codec-data';
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
import { PacketRetrievalOptions } from '../media-sink';
import {
	assert,
	AsyncMutex,
	binarySearchExact,
	binarySearchLessOrEqual,
	Bitstream,
	COLOR_PRIMARIES_MAP_INVERSE,
	findLastIndex,
	insertSorted,
	isIso639Dash2LanguageCode,
	last,
	MATRIX_COEFFICIENTS_MAP_INVERSE,
	normalizeRotation,
	roundToMultiple,
	roundToPrecision,
	Rotation,
	textDecoder,
	TransformationMatrix,
	TRANSFER_CHARACTERISTICS_MAP_INVERSE,
	UNDETERMINED_LANGUAGE,
	toDataView,
} from '../misc';
import { EncodedPacket, PLACEHOLDER_DATA } from '../packet';
import { buildIsobmffMimeType } from './isobmff-misc';
import {
	MAX_BOX_HEADER_SIZE,
	MIN_BOX_HEADER_SIZE,
	readBoxHeader,
	readDataBox,
	readFixed_16_16,
	readFixed_2_30,
	readIsomVariableInteger,
	readMetadataStringShort,
} from './isobmff-reader';
import {
	FileSlice,
	readBytes,
	readF64Be,
	readI16Be,
	readI32Be,
	readI64Be,
	Reader,
	readU16Be,
	readU24Be,
	readU32Be,
	readU64Be,
	readU8,
	readAscii,
} from '../reader';
import { MetadataTags, RichImageData } from '../tags';

type InternalTrack = {
	id: number;
	demuxer: IsobmffDemuxer;
	inputTrack: InputTrack | null;
	timescale: number;
	durationInMovieTimescale: number;
	durationInMediaTimescale: number;
	rotation: Rotation;
	internalCodecId: string | null;
	name: string | null;
	languageCode: string;
	sampleTableByteOffset: number;
	sampleTable: SampleTable | null;
	fragmentLookupTable: FragmentLookupTableEntry[] | null;
	currentFragmentState: FragmentTrackState | null;
	fragments: Fragment[];
	fragmentsWithKeyFrame: Fragment[];
	/** The segment durations of all edit list entries leading up to the main one (from which the offset is taken.) */
	editListPreviousSegmentDurations: number;
	/** The media time offset of the main edit list entry (with media time !== -1) */
	editListOffset: number;
} & ({
	info: null;
} | {
	info: {
		type: 'video';
		width: number;
		height: number;
		codec: VideoCodec | null;
		codecDescription: Uint8Array | null;
		colorSpace: VideoColorSpaceInit | null;
		avcCodecInfo: AvcDecoderConfigurationRecord | null;
		hevcCodecInfo: HevcDecoderConfigurationRecord | null;
		vp9CodecInfo: Vp9CodecInfo | null;
		av1CodecInfo: Av1CodecInfo | null;
	};
} | {
	info: {
		type: 'audio';
		numberOfChannels: number;
		sampleRate: number;
		codec: AudioCodec | null;
		codecDescription: Uint8Array | null;
		aacCodecInfo: AacCodecInfo | null;
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
	}[] | null;
	/**
	 * Provides a fast map from sample index to index in the sorted presentation timestamps array - so, a fast map from
	 * decode order to presentation order.
	 */
	presentationTimestampIndexMap: number[] | null;
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
	firstKeyFrameTimestamp: number | null;
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
	isKnownToBeFirstFragment: boolean;
};

export class IsobmffDemuxer extends Demuxer {
	reader: Reader;
	moovSlice: FileSlice | null = null;

	currentTrack: InternalTrack | null = null;
	tracks: InternalTrack[] = [];
	metadataPromise: Promise<void> | null = null;
	movieTimescale = -1;
	movieDurationInTimescale = -1;
	isQuickTime = false;
	metadataTags: MetadataTags = {};
	currentMetadataKeys: Map<number, string> | null = null;

	isFragmented = false;
	fragmentTrackDefaults: FragmentTrackDefaults[] = [];
	fragments: Fragment[] = [];
	currentFragment: Fragment | null = null;
	fragmentLookupMutex = new AsyncMutex();

	constructor(input: Input) {
		super(input);

		this.reader = input._reader;
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

		const codecStrings = await Promise.all(this.tracks.map(x => x.inputTrack!.getCodecParameterString()));

		return buildIsobmffMimeType({
			isQuickTime: this.isQuickTime,
			hasVideo: this.tracks.some(x => x.info?.type === 'video'),
			hasAudio: this.tracks.some(x => x.info?.type === 'audio'),
			codecStrings: codecStrings.filter(Boolean) as string[],
		});
	}

	async getMetadataTags() {
		await this.readMetadata();
		return this.metadataTags;
	}

	readMetadata() {
		return this.metadataPromise ??= (async () => {
			let currentPos = 0;
			while (true) {
				let slice = this.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
				if (slice instanceof Promise) slice = await slice;
				if (!slice) break;

				const startPos = currentPos;
				const boxInfo = readBoxHeader(slice);
				if (!boxInfo) {
					break;
				}

				if (boxInfo.name === 'ftyp') {
					const majorBrand = readAscii(slice, 4);
					this.isQuickTime = majorBrand === 'qt  ';
				} else if (boxInfo.name === 'moov') {
					// Found moov, load it

					let moovSlice = this.reader.requestSlice(slice.filePos, boxInfo.contentSize);
					if (moovSlice instanceof Promise) moovSlice = await moovSlice;
					if (!moovSlice) break;

					this.moovSlice = moovSlice;
					this.readContiguousBoxes(this.moovSlice);

					for (const track of this.tracks) {
						// Modify the edit list offset based on the previous segment durations. They are in different
						// timescales, so we first convert to seconds and then into the track timescale.
						const previousSegmentDurationsInSeconds
							= track.editListPreviousSegmentDurations / this.movieTimescale;
						track.editListOffset -= Math.round(previousSegmentDurationsInSeconds * track.timescale);
					}

					break;
				}

				currentPos = startPos + boxInfo.totalSize;
			}

			if (this.isFragmented && this.reader.fileSize !== null) {
				// The last 4 bytes may contain the size of the mfra box at the end of the file
				let lastWordSlice = this.reader.requestSlice(this.reader.fileSize - 4, 4);
				if (lastWordSlice instanceof Promise) lastWordSlice = await lastWordSlice;
				assert(lastWordSlice);

				const lastWord = readU32Be(lastWordSlice);
				const potentialMfraPos = this.reader.fileSize - lastWord;

				if (potentialMfraPos >= 0 && potentialMfraPos <= this.reader.fileSize - MAX_BOX_HEADER_SIZE) {
					let mfraHeaderSlice = this.reader.requestSliceRange(
						potentialMfraPos,
						MIN_BOX_HEADER_SIZE,
						MAX_BOX_HEADER_SIZE,
					);
					if (mfraHeaderSlice instanceof Promise) mfraHeaderSlice = await mfraHeaderSlice;

					if (mfraHeaderSlice) {
						const boxInfo = readBoxHeader(mfraHeaderSlice);

						if (boxInfo && boxInfo.name === 'mfra') {
							// We found the mfra box, allowing for much better random access. Let's parse it.
							let mfraSlice = this.reader.requestSlice(mfraHeaderSlice.filePos, boxInfo.contentSize);
							if (mfraSlice instanceof Promise) mfraSlice = await mfraSlice;

							if (mfraSlice) {
								this.readContiguousBoxes(mfraSlice);
							}
						}
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
			presentationTimestamps: null,
			presentationTimestampIndexMap: null,
		};
		internalTrack.sampleTable = sampleTable;

		assert(this.moovSlice);
		const stblContainerSlice = this.moovSlice.slice(internalTrack.sampleTableByteOffset);

		this.currentTrack = internalTrack;
		this.traverseBox(stblContainerSlice);
		this.currentTrack = null;

		const isPcmCodec = internalTrack.info?.type === 'audio'
			&& internalTrack.info.codec
			&& (PCM_AUDIO_CODECS as readonly string[]).includes(internalTrack.info.codec);

		if (isPcmCodec && sampleTable.sampleCompositionTimeOffsets.length === 0) {
			// If the audio has PCM samples, the way the samples are defined in the sample table is somewhat
			// suboptimal: Each individual audio sample is its own sample, meaning we can have 48000 samples per second.
			// Because we treat each sample as its own atomic unit that can be decoded, this would lead to a huge
			// amount of very short samples for PCM audio. So instead, we make a transformation: If the audio is in PCM,
			// we say that each chunk (that normally holds many samples) now is one big sample. We can this because
			// the samples in the chunk are contiguous and the format is PCM, so the entire chunk as one thing still
			// encodes valid audio information.

			assert(internalTrack.info?.type === 'audio');
			const pcmInfo = parsePcmCodec(internalTrack.info.codec as PcmAudioCodec);

			const newSampleTimingEntries: SampleTimingEntry[] = [];
			const newSampleSizes: number[] = [];

			for (let i = 0; i < sampleTable.sampleToChunk.length; i++) {
				const chunkEntry = sampleTable.sampleToChunk[i]!;
				const nextEntry = sampleTable.sampleToChunk[i + 1];
				const chunkCount = (nextEntry ? nextEntry.startChunkIndex : sampleTable.chunkOffsets.length)
					- chunkEntry.startChunkIndex;

				for (let j = 0; j < chunkCount; j++) {
					const startSampleIndex = chunkEntry.startSampleIndex + j * chunkEntry.samplesPerChunk;
					const endSampleIndex = startSampleIndex + chunkEntry.samplesPerChunk; // Exclusive, outside of chunk

					const startTimingEntryIndex = binarySearchLessOrEqual(
						sampleTable.sampleTimingEntries,
						startSampleIndex,
						x => x.startIndex,
					);
					const startTimingEntry = sampleTable.sampleTimingEntries[startTimingEntryIndex]!;
					const endTimingEntryIndex = binarySearchLessOrEqual(
						sampleTable.sampleTimingEntries,
						endSampleIndex,
						x => x.startIndex,
					);
					const endTimingEntry = sampleTable.sampleTimingEntries[endTimingEntryIndex]!;

					const firstSampleTimestamp = startTimingEntry.startDecodeTimestamp
						+ (startSampleIndex - startTimingEntry.startIndex) * startTimingEntry.delta;
					const lastSampleTimestamp = endTimingEntry.startDecodeTimestamp
						+ (endSampleIndex - endTimingEntry.startIndex) * endTimingEntry.delta;
					const delta = lastSampleTimestamp - firstSampleTimestamp;

					const lastSampleTimingEntry = last(newSampleTimingEntries);
					if (lastSampleTimingEntry && lastSampleTimingEntry.delta === delta) {
						lastSampleTimingEntry.count++;
					} else {
						// One sample for the entire chunk
						newSampleTimingEntries.push({
							startIndex: chunkEntry.startChunkIndex + j,
							startDecodeTimestamp: firstSampleTimestamp,
							count: 1,
							delta,
						});
					}

					// Instead of determining the chunk's size by looping over the samples sizes in the sample table, we
					// can directly compute it as we know how many PCM frames are in this chunk, and the size of each
					// PCM frame. This also improves compatibility with some files which fail to write proper sample
					// size values into their sample tables in the PCM case.
					const chunkSize = chunkEntry.samplesPerChunk
						* pcmInfo.sampleSize
						* internalTrack.info.numberOfChannels;

					newSampleSizes.push(chunkSize);
				}

				chunkEntry.startSampleIndex = chunkEntry.startChunkIndex;
				chunkEntry.samplesPerChunk = 1;
			}

			sampleTable.sampleTimingEntries = newSampleTimingEntries;
			sampleTable.sampleSizes = newSampleSizes;
		}

		if (sampleTable.sampleCompositionTimeOffsets.length > 0) {
			// If composition time offsets are defined, we must build a list of all presentation timestamps and then
			// sort them
			sampleTable.presentationTimestamps = [];

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

			sampleTable.presentationTimestampIndexMap = Array(sampleTable.presentationTimestamps.length).fill(-1);
			for (let i = 0; i < sampleTable.presentationTimestamps.length; i++) {
				sampleTable.presentationTimestampIndexMap[sampleTable.presentationTimestamps[i]!.sampleIndex] = i;
			}
		} else {
			// If they're not defined, we can simply use the decode timestamps as presentation timestamps
		}

		return sampleTable;
	}

	async readFragment(startPos: number): Promise<Fragment> {
		let headerSlice = this.reader.requestSliceRange(startPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
		if (headerSlice instanceof Promise) headerSlice = await headerSlice;
		assert(headerSlice);

		const moofBoxInfo = readBoxHeader(headerSlice);
		assert(moofBoxInfo?.name === 'moof');

		let entireSlice = this.reader.requestSlice(startPos, moofBoxInfo.totalSize);
		if (entireSlice instanceof Promise) entireSlice = await entireSlice;
		assert(entireSlice);

		this.traverseBox(entireSlice);

		const index = binarySearchExact(this.fragments, startPos, x => x.moofOffset);
		assert(index !== -1);

		const fragment = this.fragments[index]!;
		assert(fragment.moofOffset === startPos);

		// It may be that some tracks don't define the base decode time, i.e. when the fragment begins. This means the
		// only other option is to sum up the duration of all previous fragments.
		for (const [trackId, trackData] of fragment.trackData) {
			if (trackData.startTimestampIsFinal) {
				continue;
			}

			const internalTrack = this.tracks.find(x => x.id === trackId)!;

			let currentPos = 0;
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
				currentPos = currentFragment.moofOffset + currentFragment.moofSize;
			}

			let nextFragmentIsFirstFragment = currentPos === 0;

			while (currentPos <= startPos - MIN_BOX_HEADER_SIZE) {
				if (currentFragment?.nextFragment) {
					currentFragment = currentFragment.nextFragment;
					currentPos = currentFragment.moofOffset + currentFragment.moofSize;
				} else {
					let slice = this.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
					if (slice instanceof Promise) slice = await slice;
					if (!slice) break;

					const boxStartPos = currentPos;
					const boxInfo = readBoxHeader(slice);
					if (!boxInfo) {
						break;
					}

					if (boxInfo.name === 'moof') {
						const index = binarySearchExact(this.fragments, boxStartPos, x => x.moofOffset);

						let fragment: Fragment;
						if (index === -1) {
							fragment = await this.readFragment(boxStartPos); // Recursive call
						} else {
							// We already know this fragment
							fragment = this.fragments[index]!;
						}

						// Even if we already know the fragment, we might not yet know its predecessor; always do this
						if (currentFragment) currentFragment.nextFragment = fragment;
						currentFragment = fragment;

						if (nextFragmentIsFirstFragment) {
							fragment.isKnownToBeFirstFragment = true;
							nextFragmentIsFirstFragment = false;
						}
					}

					currentPos = boxStartPos + boxInfo.totalSize;
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

	readContiguousBoxes(slice: FileSlice) {
		const startIndex = slice.filePos;

		while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
			const foundBox = this.traverseBox(slice);

			if (!foundBox) {
				break;
			}
		}
	}

	// eslint-disable-next-line @stylistic/generator-star-spacing
	*iterateContiguousBoxes(slice: FileSlice) {
		const startIndex = slice.filePos;

		while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
			const startPos = slice.filePos;
			const boxInfo = readBoxHeader(slice);
			if (!boxInfo) {
				break;
			}

			yield { boxInfo, slice };
			slice.filePos = startPos + boxInfo.totalSize;
		}
	}

	traverseBox(slice: FileSlice): boolean {
		const startPos = slice.filePos;
		const boxInfo = readBoxHeader(slice);
		if (!boxInfo) {
			return false;
		}

		const contentStartPos = slice.filePos;
		const boxEndPos = startPos + boxInfo.totalSize;

		switch (boxInfo.name) {
			case 'mdia':
			case 'minf':
			case 'dinf':
			case 'mfra':
			case 'edts': {
				this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
			}; break;

			case 'mvhd': {
				const version = readU8(slice);
				slice.skip(3); // Flags

				if (version === 1) {
					slice.skip(8 + 8);
					this.movieTimescale = readU32Be(slice);
					this.movieDurationInTimescale = readU64Be(slice);
				} else {
					slice.skip(4 + 4);
					this.movieTimescale = readU32Be(slice);
					this.movieDurationInTimescale = readU32Be(slice);
				}
			}; break;

			case 'trak': {
				const track = {
					id: -1,
					demuxer: this,
					inputTrack: null,
					info: null,
					timescale: -1,
					durationInMovieTimescale: -1,
					durationInMediaTimescale: -1,
					rotation: 0,
					internalCodecId: null,
					name: null,
					languageCode: UNDETERMINED_LANGUAGE,
					sampleTableByteOffset: -1,
					sampleTable: null,
					fragmentLookupTable: null,
					currentFragmentState: null,
					fragments: [],
					fragmentsWithKeyFrame: [],
					editListPreviousSegmentDurations: 0,
					editListOffset: 0,
				} satisfies InternalTrack as InternalTrack;
				this.currentTrack = track;

				this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));

				if (track.id !== -1 && track.timescale !== -1 && track.info !== null) {
					if (track.info.type === 'video' && track.info.width !== -1) {
						const videoTrack = track as InternalVideoTrack;
						track.inputTrack = new InputVideoTrack(this.input, new IsobmffVideoTrackBacking(videoTrack));
						this.tracks.push(track);
					} else if (track.info.type === 'audio' && track.info.numberOfChannels !== -1) {
						const audioTrack = track as InternalAudioTrack;
						track.inputTrack = new InputAudioTrack(this.input, new IsobmffAudioTrackBacking(audioTrack));
						this.tracks.push(track);
					}
				}

				this.currentTrack = null;
			}; break;

			case 'tkhd': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				const version = readU8(slice);
				const flags = readU24Be(slice);

				const trackEnabled = (flags & 0x1) !== 0;
				if (!trackEnabled) {
					break;
				}

				// Skip over creation & modification time to reach the track ID
				if (version === 0) {
					slice.skip(8);
					track.id = readU32Be(slice);
					slice.skip(4);
					track.durationInMovieTimescale = readU32Be(slice);
				} else if (version === 1) {
					slice.skip(16);
					track.id = readU32Be(slice);
					slice.skip(4);
					track.durationInMovieTimescale = readU64Be(slice);
				} else {
					throw new Error(`Incorrect track header version ${version}.`);
				}

				slice.skip(2 * 4 + 2 + 2 + 2 + 2);
				const matrix: TransformationMatrix = [
					readFixed_16_16(slice),
					readFixed_16_16(slice),
					readFixed_2_30(slice),
					readFixed_16_16(slice),
					readFixed_16_16(slice),
					readFixed_2_30(slice),
					readFixed_16_16(slice),
					readFixed_16_16(slice),
					readFixed_2_30(slice),
				];

				const rotation = normalizeRotation(roundToMultiple(extractRotationFromMatrix(matrix), 90));
				assert(rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270);

				track.rotation = rotation;
			}; break;

			case 'elst': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				const version = readU8(slice);
				slice.skip(3); // Flags

				let relevantEntryFound = false;
				let previousSegmentDurations = 0;

				const entryCount = readU32Be(slice);
				for (let i = 0; i < entryCount; i++) {
					const segmentDuration = version === 1
						? readU64Be(slice)
						: readU32Be(slice);
					const mediaTime = version === 1
						? readI64Be(slice)
						: readI32Be(slice);
					const mediaRate = readFixed_16_16(slice);

					if (segmentDuration === 0) {
						// Don't care
						continue;
					}

					if (relevantEntryFound) {
						console.warn(
							'Unsupported edit list: multiple edits are not currently supported. Only using first edit.',
						);
						break;
					}

					if (mediaTime === -1) {
						previousSegmentDurations += segmentDuration;
						continue;
					}

					if (mediaRate !== 1) {
						console.warn('Unsupported edit list entry: media rate must be 1.');
						break;
					}

					track.editListPreviousSegmentDurations = previousSegmentDurations;
					track.editListOffset = mediaTime;
					relevantEntryFound = true;
				}
			}; break;

			case 'mdhd': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				const version = readU8(slice);
				slice.skip(3); // Flags

				if (version === 0) {
					slice.skip(8);
					track.timescale = readU32Be(slice);
					track.durationInMediaTimescale = readU32Be(slice);
				} else if (version === 1) {
					slice.skip(16);
					track.timescale = readU32Be(slice);
					track.durationInMediaTimescale = readU64Be(slice);
				}

				let language = readU16Be(slice);

				if (language > 0) {
					track.languageCode = '';

					for (let i = 0; i < 3; i++) {
						track.languageCode = String.fromCharCode(0x60 + (language & 0b11111)) + track.languageCode;
						language >>= 5;
					}

					if (!isIso639Dash2LanguageCode(track.languageCode)) {
						// Sometimes the bytes are garbage
						track.languageCode = UNDETERMINED_LANGUAGE;
					}
				}
			}; break;

			case 'hdlr': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				slice.skip(8); // Version + flags + pre-defined
				const handlerType = readAscii(slice, 4);

				if (handlerType === 'vide') {
					track.info = {
						type: 'video',
						width: -1,
						height: -1,
						codec: null,
						codecDescription: null,
						colorSpace: null,
						avcCodecInfo: null,
						hevcCodecInfo: null,
						vp9CodecInfo: null,
						av1CodecInfo: null,
					};
				} else if (handlerType === 'soun') {
					track.info = {
						type: 'audio',
						numberOfChannels: -1,
						sampleRate: -1,
						codec: null,
						codecDescription: null,
						aacCodecInfo: null,
					};
				}
			}; break;

			case 'stbl': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				track.sampleTableByteOffset = startPos;

				this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
			}; break;

			case 'stsd': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				if (track.info === null || track.sampleTable) {
					break;
				}

				const stsdVersion = readU8(slice);
				slice.skip(3); // Flags

				const entries = readU32Be(slice);

				for (let i = 0; i < entries; i++) {
					const sampleBoxStartPos = slice.filePos;
					const sampleBoxInfo = readBoxHeader(slice);
					if (!sampleBoxInfo) {
						break;
					}

					track.internalCodecId = sampleBoxInfo.name;
					const lowercaseBoxName = sampleBoxInfo.name.toLowerCase();

					if (track.info.type === 'video') {
						if (lowercaseBoxName === 'avc1') {
							track.info.codec = 'avc';
						} else if (lowercaseBoxName === 'hvc1' || lowercaseBoxName === 'hev1') {
							track.info.codec = 'hevc';
						} else if (lowercaseBoxName === 'vp08') {
							track.info.codec = 'vp8';
						} else if (lowercaseBoxName === 'vp09') {
							track.info.codec = 'vp9';
						} else if (lowercaseBoxName === 'av01') {
							track.info.codec = 'av1';
						} else if (lowercaseBoxName === 'mp4v') {
							track.info.codec = 'mpeg4';
						} else {
							console.warn(`Unsupported video codec (sample entry type '${sampleBoxInfo.name}').`);
						}

						slice.skip(6 * 1 + 2 + 2 + 2 + 3 * 4);

						track.info.width = readU16Be(slice);
						track.info.height = readU16Be(slice);

						slice.skip(4 + 4 + 4 + 2 + 32 + 2 + 2);

						this.readContiguousBoxes(
							slice.slice(
								slice.filePos,
								(sampleBoxStartPos + sampleBoxInfo.totalSize) - slice.filePos,
							),
						);
					} else {
						if (lowercaseBoxName === 'mp4a') {
							// We don't know the codec yet (might be AAC, might be MP3), need to read the esds box
						} else if (lowercaseBoxName === 'opus') {
							track.info.codec = 'opus';
						} else if (lowercaseBoxName === 'flac') {
							track.info.codec = 'flac';
						} else if (
							lowercaseBoxName === 'twos'
							|| lowercaseBoxName === 'sowt'
							|| lowercaseBoxName === 'raw '
							|| lowercaseBoxName === 'in24'
							|| lowercaseBoxName === 'in32'
							|| lowercaseBoxName === 'fl32'
							|| lowercaseBoxName === 'fl64'
							|| lowercaseBoxName === 'lpcm'
							|| lowercaseBoxName === 'ipcm' // ISO/IEC 23003-5
							|| lowercaseBoxName === 'fpcm' // "
						) {
							// It's PCM
							// developer.apple.com/documentation/quicktime-file-format/sound_sample_descriptions/
						} else if (lowercaseBoxName === 'ulaw') {
							track.info.codec = 'ulaw';
						} else if (lowercaseBoxName === 'alaw') {
							track.info.codec = 'alaw';
						} else {
							console.warn(`Unsupported audio codec (sample entry type '${sampleBoxInfo.name}').`);
						}

						slice.skip(6 * 1 + 2);

						const version = readU16Be(slice);
						slice.skip(3 * 2);

						let channelCount = readU16Be(slice);
						let sampleSize = readU16Be(slice);

						slice.skip(2 * 2);

						// Can't use fixed16_16 as that's signed
						let sampleRate = readU32Be(slice) / 0x10000;

						if (stsdVersion === 0 && version > 0) {
							// Additional QuickTime fields
							if (version === 1) {
								slice.skip(4);
								sampleSize = 8 * readU32Be(slice);
								slice.skip(2 * 4);
							} else if (version === 2) {
								slice.skip(4);
								sampleRate = readF64Be(slice);
								channelCount = readU32Be(slice);
								slice.skip(4); // Always 0x7f000000

								sampleSize = readU32Be(slice);

								const flags = readU32Be(slice);

								slice.skip(2 * 4);

								if (lowercaseBoxName === 'lpcm') {
									const bytesPerSample = (sampleSize + 7) >> 3;
									const isFloat = Boolean(flags & 1);
									const isBigEndian = Boolean(flags & 2);
									const sFlags = flags & 4 ? -1 : 0; // I guess it means "signed flags" or something?

									if (sampleSize > 0 && sampleSize <= 64) {
										if (isFloat) {
											if (sampleSize === 32) {
												track.info.codec = isBigEndian ? 'pcm-f32be' : 'pcm-f32';
											}
										} else {
											if (sFlags & (1 << (bytesPerSample - 1))) {
												if (bytesPerSample === 1) {
													track.info.codec = 'pcm-s8';
												} else if (bytesPerSample === 2) {
													track.info.codec = isBigEndian ? 'pcm-s16be' : 'pcm-s16';
												} else if (bytesPerSample === 3) {
													track.info.codec = isBigEndian ? 'pcm-s24be' : 'pcm-s24';
												} else if (bytesPerSample === 4) {
													track.info.codec = isBigEndian ? 'pcm-s32be' : 'pcm-s32';
												}
											} else {
												if (bytesPerSample === 1) {
													track.info.codec = 'pcm-u8';
												}
											}
										}
									}

									if (track.info.codec === null) {
										console.warn('Unsupported PCM format.');
									}
								}
							}
						}

						if (track.info.codec === 'opus') {
							sampleRate = OPUS_SAMPLE_RATE; // Always the same
						}

						track.info.numberOfChannels = channelCount;
						track.info.sampleRate = sampleRate;

						// PCM codec assignments
						if (lowercaseBoxName === 'twos') {
							if (sampleSize === 8) {
								track.info.codec = 'pcm-s8';
							} else if (sampleSize === 16) {
								track.info.codec = 'pcm-s16be';
							} else {
								console.warn(`Unsupported sample size ${sampleSize} for codec 'twos'.`);
								track.info.codec = null;
							}
						} else if (lowercaseBoxName === 'sowt') {
							if (sampleSize === 8) {
								track.info.codec = 'pcm-s8';
							} else if (sampleSize === 16) {
								track.info.codec = 'pcm-s16';
							} else {
								console.warn(`Unsupported sample size ${sampleSize} for codec 'sowt'.`);
								track.info.codec = null;
							}
						} else if (lowercaseBoxName === 'raw ') {
							track.info.codec = 'pcm-u8';
						} else if (lowercaseBoxName === 'in24') {
							track.info.codec = 'pcm-s24be';
						} else if (lowercaseBoxName === 'in32') {
							track.info.codec = 'pcm-s32be';
						} else if (lowercaseBoxName === 'fl32') {
							track.info.codec = 'pcm-f32be';
						} else if (lowercaseBoxName === 'fl64') {
							track.info.codec = 'pcm-f64be';
						} else if (lowercaseBoxName === 'ipcm') {
							track.info.codec = 'pcm-s16be'; // Placeholder, will be adjusted by the pcmC box
						} else if (lowercaseBoxName === 'fpcm') {
							track.info.codec = 'pcm-f32be'; // Placeholder, will be adjusted by the pcmC box
						}

						this.readContiguousBoxes(
							slice.slice(
								slice.filePos,
								(sampleBoxStartPos + sampleBoxInfo.totalSize) - slice.filePos,
							),
						);
					}
				}
			}; break;

			case 'avcC': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				assert(track.info);

				track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
			}; break;

			case 'hvcC': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				assert(track.info);

				track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
			}; break;

			case 'vpcC': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				assert(track.info?.type === 'video');

				slice.skip(4); // Version + flags

				const profile = readU8(slice);
				const level = readU8(slice);
				const thirdByte = readU8(slice);
				const bitDepth = thirdByte >> 4;
				const chromaSubsampling = (thirdByte >> 1) & 0b111;
				const videoFullRangeFlag = thirdByte & 1;
				const colourPrimaries = readU8(slice);
				const transferCharacteristics = readU8(slice);
				const matrixCoefficients = readU8(slice);

				track.info.vp9CodecInfo = {
					profile,
					level,
					bitDepth,
					chromaSubsampling,
					videoFullRangeFlag,
					colourPrimaries,
					transferCharacteristics,
					matrixCoefficients,
				};
			}; break;

			case 'av1C': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				assert(track.info?.type === 'video');

				slice.skip(1); // Marker + version

				const secondByte = readU8(slice);
				const profile = secondByte >> 5;
				const level = secondByte & 0b11111;

				const thirdByte = readU8(slice);
				const tier = thirdByte >> 7;
				const highBitDepth = (thirdByte >> 6) & 1;
				const twelveBit = (thirdByte >> 5) & 1;
				const monochrome = (thirdByte >> 4) & 1;
				const chromaSubsamplingX = (thirdByte >> 3) & 1;
				const chromaSubsamplingY = (thirdByte >> 2) & 1;
				const chromaSamplePosition = thirdByte & 0b11;

				// Logic from https://aomediacodec.github.io/av1-spec/av1-spec.pdf
				const bitDepth = profile === 2 && highBitDepth ? (twelveBit ? 12 : 10) : (highBitDepth ? 10 : 8);

				track.info.av1CodecInfo = {
					profile,
					level,
					tier,
					bitDepth,
					monochrome,
					chromaSubsamplingX,
					chromaSubsamplingY,
					chromaSamplePosition,
				};
			}; break;

			case 'colr': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				assert(track.info?.type === 'video');

				const colourType = readAscii(slice, 4);
				if (colourType !== 'nclx') {
					break;
				}

				const colourPrimaries = readU16Be(slice);
				const transferCharacteristics = readU16Be(slice);
				const matrixCoefficients = readU16Be(slice);
				const fullRangeFlag = Boolean(readU8(slice) & 0x80);

				track.info.colorSpace = {
					primaries: COLOR_PRIMARIES_MAP_INVERSE[colourPrimaries],
					transfer: TRANSFER_CHARACTERISTICS_MAP_INVERSE[transferCharacteristics],
					matrix: MATRIX_COEFFICIENTS_MAP_INVERSE[matrixCoefficients],
					fullRange: fullRangeFlag,
				} as VideoColorSpaceInit;
			}; break;

			case 'wave': {
				this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
			}; break;

			case 'esds': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				if (track.info?.type !== 'audio' && track.info?.type !== 'video') {
					break;
				}

				slice.skip(4); // Version + flags

				const tag = readU8(slice);
				assert(tag === 0x03); // ES Descriptor

				readIsomVariableInteger(slice); // Length

				slice.skip(2); // ES ID
				const mixed = readU8(slice);

				const streamDependenceFlag = (mixed & 0x80) !== 0;
				const urlFlag = (mixed & 0x40) !== 0;
				const ocrStreamFlag = (mixed & 0x20) !== 0;

				if (streamDependenceFlag) {
					slice.skip(2);
				}
				if (urlFlag) {
					const urlLength = readU8(slice);
					slice.skip(urlLength);
				}
				if (ocrStreamFlag) {
					slice.skip(2);
				}

				const decoderConfigTag = readU8(slice);
				assert(decoderConfigTag === 0x04); // DecoderConfigDescriptor

				const decoderConfigDescriptorLength = readIsomVariableInteger(slice); // Length

				const payloadStart = slice.filePos;

				const objectTypeIndication = readU8(slice);
				if (track.info.type === 'audio') {
					if (objectTypeIndication === 0x40 || objectTypeIndication === 0x67) {
						track.info.codec = 'aac';
						track.info.aacCodecInfo = { isMpeg2: objectTypeIndication === 0x67 };
					} else if (objectTypeIndication === 0x69 || objectTypeIndication === 0x6b) {
						track.info.codec = 'mp3';
					} else if (objectTypeIndication === 0xdd) {
						track.info.codec = 'vorbis';
					} else {
						console.warn(
							`Unsupported audio codec (objectTypeIndication ${objectTypeIndication}) - discarding track.`,
						);
					}
				} else if (track.info.type === 'video') {
					if (objectTypeIndication === 0x20) {
						track.info.codec = 'mpeg4';
					}
				}

				slice.skip(1 + 3 + 4 + 4);

				if (decoderConfigDescriptorLength > slice.filePos - payloadStart) {
					// There's a DecoderSpecificInfo at the end, let's read it

					const decoderSpecificInfoTag = readU8(slice);
					assert(decoderSpecificInfoTag === 0x05); // DecoderSpecificInfo

					const decoderSpecificInfoLength = readIsomVariableInteger(slice);
					track.info.codecDescription = readBytes(slice, decoderSpecificInfoLength);

					if (track.info.type === 'audio' && track.info.codec === 'aac') {
						// Let's try to deduce more accurate values directly from the AudioSpecificConfig:
						const audioSpecificConfig = parseAacAudioSpecificConfig(track.info.codecDescription);
						if (audioSpecificConfig.numberOfChannels !== null) {
							track.info.numberOfChannels = audioSpecificConfig.numberOfChannels;
						}
						if (audioSpecificConfig.sampleRate !== null) {
							track.info.sampleRate = audioSpecificConfig.sampleRate;
						}
					}
				}
			}; break;

			case 'enda': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				assert(track.info?.type === 'audio');

				const littleEndian = readU16Be(slice) & 0xff; // 0xff is from FFmpeg

				if (littleEndian) {
					if (track.info.codec === 'pcm-s16be') {
						track.info.codec = 'pcm-s16';
					} else if (track.info.codec === 'pcm-s24be') {
						track.info.codec = 'pcm-s24';
					} else if (track.info.codec === 'pcm-s32be') {
						track.info.codec = 'pcm-s32';
					} else if (track.info.codec === 'pcm-f32be') {
						track.info.codec = 'pcm-f32';
					} else if (track.info.codec === 'pcm-f64be') {
						track.info.codec = 'pcm-f64';
					}
				}
			}; break;

			case 'pcmC': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				assert(track.info?.type === 'audio');

				slice.skip(1 + 3); // Version + flags

				// ISO/IEC 23003-5

				const formatFlags = readU8(slice);
				const isLittleEndian = Boolean(formatFlags & 0x01);
				const pcmSampleSize = readU8(slice);

				if (track.info.codec === 'pcm-s16be') {
					// ipcm

					if (isLittleEndian) {
						if (pcmSampleSize === 16) {
							track.info.codec = 'pcm-s16';
						} else if (pcmSampleSize === 24) {
							track.info.codec = 'pcm-s24';
						} else if (pcmSampleSize === 32) {
							track.info.codec = 'pcm-s32';
						} else {
							console.warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
							track.info.codec = null;
						}
					} else {
						if (pcmSampleSize === 16) {
							track.info.codec = 'pcm-s16be';
						} else if (pcmSampleSize === 24) {
							track.info.codec = 'pcm-s24be';
						} else if (pcmSampleSize === 32) {
							track.info.codec = 'pcm-s32be';
						} else {
							console.warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
							track.info.codec = null;
						}
					}
				} else if (track.info.codec === 'pcm-f32be') {
					// fpcm

					if (isLittleEndian) {
						if (pcmSampleSize === 32) {
							track.info.codec = 'pcm-f32';
						} else if (pcmSampleSize === 64) {
							track.info.codec = 'pcm-f64';
						} else {
							console.warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
							track.info.codec = null;
						}
					} else {
						if (pcmSampleSize === 32) {
							track.info.codec = 'pcm-f32be';
						} else if (pcmSampleSize === 64) {
							track.info.codec = 'pcm-f64be';
						} else {
							console.warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
							track.info.codec = null;
						}
					}
				}

				break;
			};

			case 'dOps': { // Used for Opus audio
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				assert(track.info?.type === 'audio');

				slice.skip(1); // Version

				// https://www.opus-codec.org/docs/opus_in_isobmff.html
				const outputChannelCount = readU8(slice);
				const preSkip = readU16Be(slice);
				const inputSampleRate = readU32Be(slice);
				const outputGain = readI16Be(slice);
				const channelMappingFamily = readU8(slice);

				let channelMappingTable: Uint8Array;
				if (channelMappingFamily !== 0) {
					channelMappingTable = readBytes(slice, 2 + outputChannelCount);
				} else {
					channelMappingTable = new Uint8Array(0);
				}

				// https://datatracker.ietf.org/doc/html/draft-ietf-codec-oggopus-06
				const description = new Uint8Array(8 + 1 + 1 + 2 + 4 + 2 + 1 + channelMappingTable.byteLength);
				const view = new DataView(description.buffer);
				view.setUint32(0, 0x4f707573, false); // 'Opus'
				view.setUint32(4, 0x48656164, false); // 'Head'
				view.setUint8(8, 1); // Version
				view.setUint8(9, outputChannelCount);
				view.setUint16(10, preSkip, true);
				view.setUint32(12, inputSampleRate, true);
				view.setInt16(16, outputGain, true);
				view.setUint8(18, channelMappingFamily);
				description.set(channelMappingTable, 19);

				track.info.codecDescription = description;
				track.info.numberOfChannels = outputChannelCount;
				// Don't copy the input sample rate, irrelevant, and output sample rate is fixed
			}; break;

			case 'dfLa': { // Used for FLAC audio
				const track = this.currentTrack;
				if (!track) {
					break;
				}
				assert(track.info?.type === 'audio');

				slice.skip(4); // Version + flags

				// https://datatracker.ietf.org/doc/rfc9639/

				const BLOCK_TYPE_MASK = 0x7f;
				const LAST_METADATA_BLOCK_FLAG_MASK = 0x80;

				const startPos = slice.filePos;

				while (slice.filePos < boxEndPos) {
					const flagAndType = readU8(slice);
					const metadataBlockLength = readU24Be(slice);
					const type = flagAndType & BLOCK_TYPE_MASK;

					// It's a STREAMINFO block; let's extract the actual sample rate and channel count
					if (type === FlacBlockType.STREAMINFO) {
						slice.skip(10);

						// Extract sample rate and channel count
						const word = readU32Be(slice);
						const sampleRate = word >>> 12;
						const numberOfChannels = ((word >> 9) & 0b111) + 1;

						track.info.sampleRate = sampleRate;
						track.info.numberOfChannels = numberOfChannels;

						slice.skip(20);
					} else {
						// Simply skip ahead to the next block
						slice.skip(metadataBlockLength);
					}

					if (flagAndType & LAST_METADATA_BLOCK_FLAG_MASK) {
						break;
					}
				}

				const endPos = slice.filePos;
				slice.filePos = startPos;
				const bytes = readBytes(slice, endPos - startPos);

				const description = new Uint8Array(4 + bytes.byteLength);
				const view = new DataView(description.buffer);
				view.setUint32(0, 0x664c6143, false); // 'fLaC'
				description.set(bytes, 4);

				// Set the codec description to be 'fLaC' + all metadata blocks
				track.info.codecDescription = description;
			}; break;

			case 'stts': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				if (!track.sampleTable) {
					break;
				}

				slice.skip(4); // Version + flags

				const entryCount = readU32Be(slice);

				let currentIndex = 0;
				let currentTimestamp = 0;

				for (let i = 0; i < entryCount; i++) {
					const sampleCount = readU32Be(slice);
					const sampleDelta = readU32Be(slice);

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
				if (!track) {
					break;
				}

				if (!track.sampleTable) {
					break;
				}

				slice.skip(1 + 3); // Version + flags

				const entryCount = readU32Be(slice);

				let sampleIndex = 0;
				for (let i = 0; i < entryCount; i++) {
					const sampleCount = readU32Be(slice);
					const sampleOffset = readI32Be(slice);

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
				if (!track) {
					break;
				}

				if (!track.sampleTable) {
					break;
				}

				slice.skip(4); // Version + flags

				const sampleSize = readU32Be(slice);
				const sampleCount = readU32Be(slice);

				if (sampleSize === 0) {
					for (let i = 0; i < sampleCount; i++) {
						const sampleSize = readU32Be(slice);
						track.sampleTable.sampleSizes.push(sampleSize);
					}
				} else {
					track.sampleTable.sampleSizes.push(sampleSize);
				}
			}; break;

			case 'stz2': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				if (!track.sampleTable) {
					break;
				}

				slice.skip(4); // Version + flags
				slice.skip(3); // Reserved

				const fieldSize = readU8(slice); // in bits
				const sampleCount = readU32Be(slice);

				const bytes = readBytes(slice, Math.ceil(sampleCount * fieldSize / 8));
				const bitstream = new Bitstream(bytes);

				for (let i = 0; i < sampleCount; i++) {
					const sampleSize = bitstream.readBits(fieldSize);
					track.sampleTable.sampleSizes.push(sampleSize);
				}
			}; break;

			case 'stss': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				if (!track.sampleTable) {
					break;
				}

				slice.skip(4); // Version + flags

				track.sampleTable.keySampleIndices = [];

				const entryCount = readU32Be(slice);
				for (let i = 0; i < entryCount; i++) {
					const sampleIndex = readU32Be(slice) - 1; // Convert to 0-indexed
					track.sampleTable.keySampleIndices.push(sampleIndex);
				}

				if (track.sampleTable.keySampleIndices[0] !== 0) {
					// Some files don't mark the first sample a key sample, which is basically almost always incorrect.
					// Here, we correct for that mistake:
					track.sampleTable.keySampleIndices.unshift(0);
				}
			}; break;

			case 'stsc': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				if (!track.sampleTable) {
					break;
				}

				slice.skip(4);

				const entryCount = readU32Be(slice);

				for (let i = 0; i < entryCount; i++) {
					const startChunkIndex = readU32Be(slice) - 1; // Convert to 0-indexed
					const samplesPerChunk = readU32Be(slice);
					const sampleDescriptionIndex = readU32Be(slice);

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
				if (!track) {
					break;
				}

				if (!track.sampleTable) {
					break;
				}

				slice.skip(4); // Version + flags

				const entryCount = readU32Be(slice);

				for (let i = 0; i < entryCount; i++) {
					const chunkOffset = readU32Be(slice);
					track.sampleTable.chunkOffsets.push(chunkOffset);
				}
			}; break;

			case 'co64': {
				const track = this.currentTrack;
				if (!track) {
					break;
				}

				if (!track.sampleTable) {
					break;
				}

				slice.skip(4); // Version + flags

				const entryCount = readU32Be(slice);

				for (let i = 0; i < entryCount; i++) {
					const chunkOffset = readU64Be(slice);
					track.sampleTable.chunkOffsets.push(chunkOffset);
				}
			}; break;

			case 'mvex': {
				this.isFragmented = true;
				this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
			}; break;

			case 'mehd': {
				const version = readU8(slice);
				slice.skip(3); // Flags

				const fragmentDuration = version === 1 ? readU64Be(slice) : readU32Be(slice);
				this.movieDurationInTimescale = fragmentDuration;
			}; break;

			case 'trex': {
				slice.skip(4); // Version + flags

				const trackId = readU32Be(slice);
				const defaultSampleDescriptionIndex = readU32Be(slice);
				const defaultSampleDuration = readU32Be(slice);
				const defaultSampleSize = readU32Be(slice);
				const defaultSampleFlags = readU32Be(slice);

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
				const version = readU8(slice);
				slice.skip(3); // Flags

				const trackId = readU32Be(slice);
				const track = this.tracks.find(x => x.id === trackId);
				if (!track) {
					break;
				}

				track.fragmentLookupTable = [];

				const word = readU32Be(slice);

				const lengthSizeOfTrafNum = (word & 0b110000) >> 4;
				const lengthSizeOfTrunNum = (word & 0b001100) >> 2;
				const lengthSizeOfSampleNum = word & 0b000011;

				const functions = [readU8, readU16Be, readU24Be, readU32Be];

				const readTrafNum = functions[lengthSizeOfTrafNum]!;
				const readTrunNum = functions[lengthSizeOfTrunNum]!;
				const readSampleNum = functions[lengthSizeOfSampleNum]!;

				const numberOfEntries = readU32Be(slice);
				for (let i = 0; i < numberOfEntries; i++) {
					const time = version === 1 ? readU64Be(slice) : readU32Be(slice);
					const moofOffset = version === 1 ? readU64Be(slice) : readU32Be(slice);

					readTrafNum(slice);
					readTrunNum(slice);
					readSampleNum(slice);

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
					isKnownToBeFirstFragment: false,
				};

				this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));

				insertSorted(this.fragments, this.currentFragment, x => x.moofOffset);

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

				this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));

				// It is possible that there is no current track, for example when we don't care about the track
				// referenced in the track fragment header.
				if (this.currentTrack) {
					const trackData = this.currentFragment.trackData.get(this.currentTrack.id);
					if (trackData) {
						// We know there is sample data for this track in this fragment, so let's add it to the
						// track's fragments:
						insertSorted(this.currentTrack.fragments, this.currentFragment, x => x.moofOffset);

						const hasKeyFrame = trackData.firstKeyFrameTimestamp !== null;
						if (hasKeyFrame) {
							insertSorted(
								this.currentTrack.fragmentsWithKeyFrame,
								this.currentFragment,
								x => x.moofOffset,
							);
						}

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

				slice.skip(1); // Version

				const flags = readU24Be(slice);
				const baseDataOffsetPresent = Boolean(flags & 0x000001);
				const sampleDescriptionIndexPresent = Boolean(flags & 0x000002);
				const defaultSampleDurationPresent = Boolean(flags & 0x000008);
				const defaultSampleSizePresent = Boolean(flags & 0x000010);
				const defaultSampleFlagsPresent = Boolean(flags & 0x000020);
				const durationIsEmpty = Boolean(flags & 0x010000);
				const defaultBaseIsMoof = Boolean(flags & 0x020000);

				const trackId = readU32Be(slice);
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
					track.currentFragmentState.baseDataOffset = readU64Be(slice);
				} else if (defaultBaseIsMoof) {
					track.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset;
				}
				if (sampleDescriptionIndexPresent) {
					track.currentFragmentState.sampleDescriptionIndex = readU32Be(slice);
				}
				if (defaultSampleDurationPresent) {
					track.currentFragmentState.defaultSampleDuration = readU32Be(slice);
				}
				if (defaultSampleSizePresent) {
					track.currentFragmentState.defaultSampleSize = readU32Be(slice);
				}
				if (defaultSampleFlagsPresent) {
					track.currentFragmentState.defaultSampleFlags = readU32Be(slice);
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

				const version = readU8(slice);
				slice.skip(3); // Flags

				const baseMediaDecodeTime = version === 0 ? readU32Be(slice) : readU64Be(slice);
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
					console.warn('Can\'t have two trun boxes for the same track in one fragment. Ignoring...');
					break;
				}

				const version = readU8(slice);

				const flags = readU24Be(slice);
				const dataOffsetPresent = Boolean(flags & 0x000001);
				const firstSampleFlagsPresent = Boolean(flags & 0x000004);
				const sampleDurationPresent = Boolean(flags & 0x000100);
				const sampleSizePresent = Boolean(flags & 0x000200);
				const sampleFlagsPresent = Boolean(flags & 0x000400);
				const sampleCompositionTimeOffsetsPresent = Boolean(flags & 0x000800);

				const sampleCount = readU32Be(slice);

				let dataOffset = track.currentFragmentState.baseDataOffset;
				if (dataOffsetPresent) {
					dataOffset += readI32Be(slice);
				}
				let firstSampleFlags: number | null = null;
				if (firstSampleFlagsPresent) {
					firstSampleFlags = readU32Be(slice);
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
					firstKeyFrameTimestamp: null,
					samples: [],
					presentationTimestamps: [],
					startTimestampIsFinal: false,
				};
				this.currentFragment.trackData.set(track.id, trackData);

				for (let i = 0; i < sampleCount; i++) {
					let sampleDuration: number;
					if (sampleDurationPresent) {
						sampleDuration = readU32Be(slice);
					} else {
						assert(track.currentFragmentState.defaultSampleDuration !== null);
						sampleDuration = track.currentFragmentState.defaultSampleDuration;
					}

					let sampleSize: number;
					if (sampleSizePresent) {
						sampleSize = readU32Be(slice);
					} else {
						assert(track.currentFragmentState.defaultSampleSize !== null);
						sampleSize = track.currentFragmentState.defaultSampleSize;
					}

					let sampleFlags: number;
					if (sampleFlagsPresent) {
						sampleFlags = readU32Be(slice);
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
							sampleCompositionTimeOffset = readU32Be(slice);
						} else {
							sampleCompositionTimeOffset = readI32Be(slice);
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

				for (let i = 0; i < trackData.presentationTimestamps.length; i++) {
					const currentEntry = trackData.presentationTimestamps[i]!;
					const currentSample = trackData.samples[currentEntry.sampleIndex]!;

					if (trackData.firstKeyFrameTimestamp === null && currentSample.isKeyFrame) {
						trackData.firstKeyFrameTimestamp = currentSample.presentationTimestamp;
					}

					if (i < trackData.presentationTimestamps.length - 1) {
						// Update sample durations based on presentation order
						const nextEntry = trackData.presentationTimestamps[i + 1]!;
						currentSample.duration = nextEntry.presentationTimestamp - currentEntry.presentationTimestamp;
					}
				}

				const firstSample = trackData.samples[trackData.presentationTimestamps[0]!.sampleIndex]!;
				const lastSample = trackData.samples[last(trackData.presentationTimestamps)!.sampleIndex]!;

				trackData.startTimestamp = firstSample.presentationTimestamp;
				trackData.endTimestamp = lastSample.presentationTimestamp + lastSample.duration;

				this.currentFragment.implicitBaseDataOffset = currentOffset;
			}; break;

				// Metadata section
				// https://exiftool.org/TagNames/QuickTime.html
				// https://mp4workshop.com/about

			case 'udta': { // Contains either movie metadata or track metadata
				const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));

				for (const { boxInfo, slice } of iterator) {
					if (boxInfo.name !== 'meta' && !this.currentTrack) {
						const startPos = slice.filePos;
						this.metadataTags.raw ??= {};

						if (boxInfo.name[0] === '©') {
							// https://mp4workshop.com/about
							// Box name starting with © indicates "international text"
							this.metadataTags.raw[boxInfo.name] ??= readMetadataStringShort(slice);
						} else {
							this.metadataTags.raw[boxInfo.name] ??= readBytes(slice, boxInfo.contentSize);
						}

						slice.filePos = startPos;
					}

					switch (boxInfo.name) {
						case 'meta': {
							slice.skip(-boxInfo.headerSize);
							this.traverseBox(slice);
						}; break;

						case '©nam':
						case 'name': {
							if (this.currentTrack) {
								this.currentTrack.name = textDecoder.decode(readBytes(slice, boxInfo.contentSize));
							} else {
								this.metadataTags.title ??= readMetadataStringShort(slice);
							}
						}; break;

						case '©des': {
							if (!this.currentTrack) {
								this.metadataTags.description ??= readMetadataStringShort(slice);
							}
						}; break;

						case '©ART': {
							if (!this.currentTrack) {
								this.metadataTags.artist ??= readMetadataStringShort(slice);
							}
						}; break;

						case '©alb': {
							if (!this.currentTrack) {
								this.metadataTags.album ??= readMetadataStringShort(slice);
							}
						}; break;

						case 'albr': {
							if (!this.currentTrack) {
								this.metadataTags.albumArtist ??= readMetadataStringShort(slice);
							}
						}; break;

						case '©gen': {
							if (!this.currentTrack) {
								this.metadataTags.genre ??= readMetadataStringShort(slice);
							}
						}; break;

						case '©day': {
							if (!this.currentTrack) {
								const date = new Date(readMetadataStringShort(slice));
								if (!Number.isNaN(date.getTime())) {
									this.metadataTags.date ??= date;
								}
							}
						}; break;

						case '©cmt': {
							if (!this.currentTrack) {
								this.metadataTags.comment ??= readMetadataStringShort(slice);
							}
						}; break;

						case '©lyr': {
							if (!this.currentTrack) {
								this.metadataTags.lyrics ??= readMetadataStringShort(slice);
							}
						}; break;
					}
				}
			}; break;

			case 'meta': {
				if (this.currentTrack) {
					break; // Only care about movie-level metadata for now
				}

				// The 'meta' box comes in two flavors, one with flags/version and one without. To know which is which,
				// let's read the next 4 bytes, which are either the version or the size of the first subbox.
				const word = readU32Be(slice);
				const isQuickTime = word !== 0;

				this.currentMetadataKeys = new Map();

				if (isQuickTime) {
					this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
				} else {
					this.readContiguousBoxes(slice.slice(contentStartPos + 4, boxInfo.contentSize - 4));
				}

				this.currentMetadataKeys = null;
			}; break;

			case 'keys': {
				if (!this.currentMetadataKeys) {
					break;
				}

				slice.skip(4); // Version + flags

				const entryCount = readU32Be(slice);

				for (let i = 0; i < entryCount; i++) {
					const keySize = readU32Be(slice);
					slice.skip(4); // Key namespace
					const keyName = textDecoder.decode(readBytes(slice, keySize - 8));

					this.currentMetadataKeys.set(i + 1, keyName);
				}
			}; break;

			case 'ilst': {
				if (!this.currentMetadataKeys) {
					break;
				}

				const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));

				for (const { boxInfo, slice } of iterator) {
					let metadataKey = boxInfo.name;

					// Interpret the box name as a u32be
					const nameAsNumber = (metadataKey.charCodeAt(0) << 24)
						+ (metadataKey.charCodeAt(1) << 16)
						+ (metadataKey.charCodeAt(2) << 8)
						+ metadataKey.charCodeAt(3);

					if (this.currentMetadataKeys.has(nameAsNumber)) {
						// An entry exists for this number
						metadataKey = this.currentMetadataKeys.get(nameAsNumber)!;
					}

					const data = readDataBox(slice);

					this.metadataTags.raw ??= {};
					this.metadataTags.raw[metadataKey] ??= data;

					switch (metadataKey) {
						case '©nam':
						case 'titl':
						case 'com.apple.quicktime.title':
						case 'title': {
							if (typeof data === 'string') {
								this.metadataTags.title ??= data;
							}
						}; break;

						case '©des':
						case 'desc':
						case 'dscp':
						case 'com.apple.quicktime.description':
						case 'description': {
							if (typeof data === 'string') {
								this.metadataTags.description ??= data;
							}
						}; break;

						case '©ART':
						case 'com.apple.quicktime.artist':
						case 'artist': {
							if (typeof data === 'string') {
								this.metadataTags.artist ??= data;
							}
						}; break;

						case '©alb':
						case 'albm':
						case 'com.apple.quicktime.album':
						case 'album': {
							if (typeof data === 'string') {
								this.metadataTags.album ??= data;
							}
						}; break;

						case 'aART':
						case 'album_artist': {
							if (typeof data === 'string') {
								this.metadataTags.albumArtist ??= data;
							}
						}; break;

						case '©cmt':
						case 'com.apple.quicktime.comment':
						case 'comment': {
							if (typeof data === 'string') {
								this.metadataTags.comment ??= data;
							}
						}; break;

						case '©gen':
						case 'gnre':
						case 'com.apple.quicktime.genre':
						case 'genre': {
							if (typeof data === 'string') {
								this.metadataTags.genre ??= data;
							}
						}; break;

						case '©lyr':
						case 'lyrics': {
							if (typeof data === 'string') {
								this.metadataTags.lyrics ??= data;
							}
						}; break;

						case '©day':
						case 'rldt':
						case 'com.apple.quicktime.creationdate':
						case 'date': {
							if (typeof data === 'string') {
								const date = new Date(data);
								if (!Number.isNaN(date.getTime())) {
									this.metadataTags.date ??= date;
								}
							}
						}; break;

						case 'covr':
						case 'com.apple.quicktime.artwork': {
							if (data instanceof RichImageData) {
								this.metadataTags.images ??= [];
								this.metadataTags.images.push({
									data: data.data,
									kind: 'coverFront',
									mimeType: data.mimeType,
								});
							} else if (data instanceof Uint8Array) {
								this.metadataTags.images ??= [];
								this.metadataTags.images.push({
									data,
									kind: 'coverFront',
									mimeType: 'image/*',
								});
							}
						}; break;

						case 'track': {
							if (typeof data === 'string') {
								const parts = data.split('/');
								const trackNum = Number.parseInt(parts[0]!, 10);
								const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);

								if (Number.isInteger(trackNum) && trackNum > 0) {
									this.metadataTags.trackNumber ??= trackNum;
								}
								if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
									this.metadataTags.tracksTotal ??= tracksTotal;
								}
							}
						}; break;

						case 'trkn': {
							if (data instanceof Uint8Array && data.length >= 6) {
								const view = toDataView(data);

								const trackNumber = view.getUint16(2, false);
								const tracksTotal = view.getUint16(4, false);

								if (trackNumber > 0) {
									this.metadataTags.trackNumber ??= trackNumber;
								}
								if (tracksTotal > 0) {
									this.metadataTags.tracksTotal ??= tracksTotal;
								}
							}
						}; break;

						case 'disc':
						case 'disk': {
							if (data instanceof Uint8Array && data.length >= 6) {
								const view = toDataView(data);

								const discNumber = view.getUint16(2, false);
								const discNumberMax = view.getUint16(4, false);

								if (discNumber > 0) {
									this.metadataTags.discNumber ??= discNumber;
								}
								if (discNumberMax > 0) {
									this.metadataTags.discsTotal ??= discNumberMax;
								}
							}
						}; break;
					}
				}
			}; break;
		}

		slice.filePos = boxEndPos;
		return true;
	}
}

abstract class IsobmffTrackBacking implements InputTrackBacking {
	packetToSampleIndex = new WeakMap<EncodedPacket, number>();
	packetToFragmentLocation = new WeakMap<EncodedPacket, {
		fragment: Fragment;
		sampleIndex: number;
	}>();

	constructor(public internalTrack: InternalTrack) {}

	getId() {
		return this.internalTrack.id;
	}

	getCodec(): MediaCodec | null {
		throw new Error('Not implemented on base class.');
	}

	getInternalCodecId() {
		return this.internalTrack.internalCodecId;
	}

	getName() {
		return this.internalTrack.name;
	}

	getLanguageCode() {
		return this.internalTrack.languageCode;
	}

	getTimeResolution() {
		return this.internalTrack.timescale;
	}

	async computeDuration() {
		const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
		return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
	}

	async getFirstTimestamp() {
		const firstPacket = await this.getFirstPacket({ metadataOnly: true });
		return firstPacket?.timestamp ?? 0;
	}

	async getFirstPacket(options: PacketRetrievalOptions) {
		const regularPacket = await this.fetchPacketForSampleIndex(0, options);
		if (regularPacket || !this.internalTrack.demuxer.isFragmented) {
			// If there's a non-fragmented packet, always prefer that
			return regularPacket;
		}

		return this.performFragmentedLookup(
			() => {
				const startFragment = this.internalTrack.demuxer.fragments[0] ?? null;
				if (startFragment?.isKnownToBeFirstFragment) {
					// Walk from the very first fragment in the file until we find one with our track in it
					let currentFragment: Fragment | null = startFragment;
					while (currentFragment) {
						const trackData = currentFragment.trackData.get(this.internalTrack.id);
						if (trackData) {
							return {
								fragmentIndex: binarySearchExact(
									this.internalTrack.fragments,
									currentFragment.moofOffset,
									x => x.moofOffset,
								),
								sampleIndex: 0,
								correctSampleFound: true,
							};
						}

						currentFragment = currentFragment.nextFragment;
					}
				}

				return {
					fragmentIndex: -1,
					sampleIndex: -1,
					correctSampleFound: false,
				};
			},
			-Infinity, // Use -Infinity as a search timestamp to avoid using the lookup entries
			Infinity,
			options,
		);
	}

	private mapTimestampIntoTimescale(timestamp: number) {
		// Do a little rounding to catch cases where the result is very close to an integer. If it is, it's likely
		// that the number was originally an integer divided by the timescale. For stability, it's best
		// to return the integer in this case.
		return roundToPrecision(timestamp * this.internalTrack.timescale, 14) + this.internalTrack.editListOffset;
	}

	async getPacket(timestamp: number, options: PacketRetrievalOptions) {
		const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);

		const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
		const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
		const regularPacket = await this.fetchPacketForSampleIndex(sampleIndex, options);

		if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
			// Prefer the non-fragmented packet
			return regularPacket;
		}

		return this.performFragmentedLookup(
			() => this.findSampleInFragmentsForTimestamp(timestampInTimescale),
			timestampInTimescale,
			timestampInTimescale,
			options,
		);
	}

	async getNextPacket(packet: EncodedPacket, options: PacketRetrievalOptions) {
		const regularSampleIndex = this.packetToSampleIndex.get(packet);

		if (regularSampleIndex !== undefined) {
			// Prefer the non-fragmented packet
			return this.fetchPacketForSampleIndex(regularSampleIndex + 1, options);
		}

		const locationInFragment = this.packetToFragmentLocation.get(packet);
		if (locationInFragment === undefined) {
			throw new Error('Packet was not created from this track.');
		}

		const trackData = locationInFragment.fragment.trackData.get(this.internalTrack.id)!;

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
			-Infinity, // Use -Infinity as a search timestamp to avoid using the lookup entries
			Infinity,
			options,
		);
	}

	async getKeyPacket(timestamp: number, options: PacketRetrievalOptions) {
		const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);

		const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
		const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
		const keyFrameSampleIndex = sampleIndex === -1
			? -1
			: getRelevantKeyframeIndexForSample(sampleTable, sampleIndex);
		const regularPacket = await this.fetchPacketForSampleIndex(keyFrameSampleIndex, options);

		if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
			// Prefer the non-fragmented packet
			return regularPacket;
		}

		return this.performFragmentedLookup(
			() => this.findKeySampleInFragmentsForTimestamp(timestampInTimescale),
			timestampInTimescale,
			timestampInTimescale,
			options,
		);
	}

	async getNextKeyPacket(packet: EncodedPacket, options: PacketRetrievalOptions) {
		const regularSampleIndex = this.packetToSampleIndex.get(packet);
		if (regularSampleIndex !== undefined) {
			// Prefer the non-fragmented packet
			const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
			const nextKeyFrameSampleIndex = getNextKeyframeIndexForSample(sampleTable, regularSampleIndex);
			return this.fetchPacketForSampleIndex(nextKeyFrameSampleIndex, options);
		}

		const locationInFragment = this.packetToFragmentLocation.get(packet);
		if (locationInFragment === undefined) {
			throw new Error('Packet was not created from this track.');
		}

		const trackData = locationInFragment.fragment.trackData.get(this.internalTrack.id)!;

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
					// Walk the list of fragments until we find the next fragment for this track with a key frame
					let currentFragment = locationInFragment.fragment;
					while (currentFragment.nextFragment) {
						currentFragment = currentFragment.nextFragment;

						const trackData = currentFragment.trackData.get(this.internalTrack.id);
						if (trackData && trackData.firstKeyFrameTimestamp !== null) {
							const fragmentIndex = binarySearchExact(
								this.internalTrack.fragments,
								currentFragment.moofOffset,
								x => x.moofOffset,
							);
							assert(fragmentIndex !== -1);

							const keyFrameIndex = trackData.samples.findIndex(x => x.isKeyFrame);
							assert(keyFrameIndex !== -1); // There must be one

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
			-Infinity, // Use -Infinity as a search timestamp to avoid using the lookup entries
			Infinity,
			options,
		);
	}

	private async fetchPacketForSampleIndex(sampleIndex: number, options: PacketRetrievalOptions) {
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
			data = PLACEHOLDER_DATA;
		} else {
			let slice = this.internalTrack.demuxer.reader.requestSlice(
				sampleInfo.sampleOffset,
				sampleInfo.sampleSize,
			);
			if (slice instanceof Promise) slice = await slice;
			assert(slice);

			data = readBytes(slice, sampleInfo.sampleSize);
		}

		const timestamp = (sampleInfo.presentationTimestamp - this.internalTrack.editListOffset)
			/ this.internalTrack.timescale;
		const duration = sampleInfo.duration / this.internalTrack.timescale;
		const packet = new EncodedPacket(
			data,
			sampleInfo.isKeyFrame ? 'key' : 'delta',
			timestamp,
			duration,
			sampleIndex,
			sampleInfo.sampleSize,
		);

		this.packetToSampleIndex.set(packet, sampleIndex);

		return packet;
	}

	private async fetchPacketInFragment(fragment: Fragment, sampleIndex: number, options: PacketRetrievalOptions) {
		if (sampleIndex === -1) {
			return null;
		}

		const trackData = fragment.trackData.get(this.internalTrack.id)!;
		const fragmentSample = trackData.samples[sampleIndex];
		assert(fragmentSample);

		let data: Uint8Array;
		if (options.metadataOnly) {
			data = PLACEHOLDER_DATA;
		} else {
			let slice = this.internalTrack.demuxer.reader.requestSlice(
				fragmentSample.byteOffset,
				fragmentSample.byteSize,
			);
			if (slice instanceof Promise) slice = await slice;
			assert(slice);

			data = readBytes(slice, fragmentSample.byteSize);
		}

		const timestamp = (fragmentSample.presentationTimestamp - this.internalTrack.editListOffset)
			/ this.internalTrack.timescale;
		const duration = fragmentSample.duration / this.internalTrack.timescale;
		const packet = new EncodedPacket(
			data,
			fragmentSample.isKeyFrame ? 'key' : 'delta',
			timestamp,
			duration,
			fragment.moofOffset + sampleIndex,
			fragmentSample.byteSize,
		);

		this.packetToFragmentLocation.set(packet, { fragment, sampleIndex });

		return packet;
	}

	private findSampleInFragmentsForTimestamp(timestampInTimescale: number) {
		const fragmentIndex = binarySearchLessOrEqual(
			// This array is technically not sorted by start timestamp, but for any reasonable file, it basically is.
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
		const indexInKeyFrameFragments = binarySearchLessOrEqual(
			// This array is technically not sorted by start timestamp, but for any reasonable file, it basically is.
			this.internalTrack.fragmentsWithKeyFrame,
			timestampInTimescale,
			x => x.trackData.get(this.internalTrack.id)!.startTimestamp,
		);

		let fragmentIndex = -1;
		let sampleIndex = -1;
		let correctSampleFound = false;

		if (indexInKeyFrameFragments !== -1) {
			const fragment = this.internalTrack.fragmentsWithKeyFrame[indexInKeyFrameFragments]!;

			// Now, let's find the actual index of the fragment in the list of ALL fragments, not just key frame ones
			fragmentIndex = binarySearchExact(
				this.internalTrack.fragments,
				fragment.moofOffset,
				x => x.moofOffset,
			);
			assert(fragmentIndex !== -1);

			const trackData = fragment.trackData.get(this.internalTrack.id)!;
			const index = findLastIndex(trackData.presentationTimestamps, (x) => {
				const sample = trackData.samples[x.sampleIndex]!;
				return sample.isKeyFrame && x.presentationTimestamp <= timestampInTimescale;
			});
			assert(index !== -1); // It's a key frame fragment, so there must be a key frame

			const entry = trackData.presentationTimestamps[index]!;
			sampleIndex = entry.sampleIndex;
			correctSampleFound = timestampInTimescale < trackData.endTimestamp;
		}

		return { fragmentIndex, sampleIndex, correctSampleFound };
	}

	/** Looks for a packet in the fragments while trying to load as few fragments as possible to retrieve it. */
	private async performFragmentedLookup(
		// This function returns the best-matching sample that is currently loaded. Based on this information, we know
		// which fragments we need to load to find the actual match.
		getBestMatch: () => { fragmentIndex: number; sampleIndex: number; correctSampleFound: boolean },
		// The timestamp with which we can search the lookup table
		searchTimestamp: number,
		// The timestamp for which we know the correct sample will not come after it
		latestTimestamp: number,
		options: PacketRetrievalOptions,
	): Promise<EncodedPacket | null> {
		const demuxer = this.internalTrack.demuxer;
		const release = await demuxer.fragmentLookupMutex.acquire(); // The algorithm requires exclusivity

		try {
			const { fragmentIndex, sampleIndex, correctSampleFound } = getBestMatch();
			if (correctSampleFound) {
				// The correct sample already exists, easy path.
				const fragment = this.internalTrack.fragments[fragmentIndex]!;
				return this.fetchPacketInFragment(fragment, sampleIndex, options);
			}

			let prevFragment: Fragment | null = null;
			let bestFragmentIndex = fragmentIndex;
			let bestSampleIndex = sampleIndex;

			// Search for a lookup entry; this way, we won't need to start searching from the start of the file
			// but can jump right into the correct fragment (or at least nearby).
			const lookupEntryIndex = this.internalTrack.fragmentLookupTable
				? binarySearchLessOrEqual(
						this.internalTrack.fragmentLookupTable,
						searchTimestamp,
						x => x.timestamp,
					)
				: -1;
			const lookupEntry = lookupEntryIndex !== -1
				? this.internalTrack.fragmentLookupTable![lookupEntryIndex]!
				: null;

			let currentPos: number;
			let nextFragmentIsFirstFragment = false;

			if (fragmentIndex === -1) {
				currentPos = lookupEntry?.moofOffset ?? 0;
				nextFragmentIsFirstFragment = currentPos === 0;
			} else {
				const fragment = this.internalTrack.fragments[fragmentIndex]!;

				if (!lookupEntry || fragment.moofOffset >= lookupEntry.moofOffset) {
					currentPos = fragment.moofOffset + fragment.moofSize;
					prevFragment = fragment;
				} else {
					// Use the lookup entry
					currentPos = lookupEntry.moofOffset;
				}
			}

			while (true) {
				if (prevFragment) {
					const trackData = prevFragment.trackData.get(this.internalTrack.id);
					if (trackData && trackData.startTimestamp > latestTimestamp) {
						// We're already past the upper bound, no need to keep searching
						break;
					}

					if (prevFragment.nextFragment) {
						// Skip ahead quickly without needing to read the file again
						currentPos = prevFragment.nextFragment.moofOffset + prevFragment.nextFragment.moofSize;
						prevFragment = prevFragment.nextFragment;
						continue;
					}
				}

				// Load the header
				let slice = demuxer.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
				if (slice instanceof Promise) slice = await slice;
				if (!slice) break;

				const startPos = currentPos;
				const boxInfo = readBoxHeader(slice);
				if (!boxInfo) {
					break;
				}

				if (boxInfo.name === 'moof') {
					const index = binarySearchExact(demuxer.fragments, startPos, x => x.moofOffset);

					let fragment: Fragment;
					if (index === -1) {
						// This is the first time we've seen this fragment
						fragment = await demuxer.readFragment(startPos);
					} else {
						// We already know this fragment
						fragment = demuxer.fragments[index]!;
					}

					// Even if we already know the fragment, we might not yet know its predecessor, so always do this
					if (prevFragment) prevFragment.nextFragment = fragment;
					prevFragment = fragment;

					if (nextFragmentIsFirstFragment) {
						fragment.isKnownToBeFirstFragment = true;
						nextFragmentIsFirstFragment = false;
					}

					const { fragmentIndex, sampleIndex, correctSampleFound } = getBestMatch();
					if (correctSampleFound) {
						const fragment = this.internalTrack.fragments[fragmentIndex]!;
						return this.fetchPacketInFragment(fragment, sampleIndex, options);
					}
					if (fragmentIndex !== -1) {
						bestFragmentIndex = fragmentIndex;
						bestSampleIndex = sampleIndex;
					}
				}

				currentPos = startPos + boxInfo.totalSize;
			}

			const bestFragment = bestFragmentIndex !== -1 ? this.internalTrack.fragments[bestFragmentIndex]! : null;

			// Catch faulty lookup table entries
			if (lookupEntry && (!bestFragment || bestFragment.moofOffset < lookupEntry.moofOffset)) {
				// The lookup table entry lied to us! We found a lookup entry but no fragment there that satisfied
				// the match. In this case, let's search again but using the lookup entry before that.
				const previousLookupEntry = this.internalTrack.fragmentLookupTable![lookupEntryIndex - 1];
				const newSearchTimestamp = previousLookupEntry?.timestamp ?? -Infinity;
				return this.performFragmentedLookup(getBestMatch, newSearchTimestamp, latestTimestamp, options);
			}

			if (bestFragment) {
				// If we finished looping but didn't find a perfect match, still return the best match we found
				return this.fetchPacketInFragment(bestFragment, bestSampleIndex, options);
			}

			return null;
		} finally {
			release();
		}
	}
}

class IsobmffVideoTrackBacking extends IsobmffTrackBacking implements InputVideoTrackBacking {
	override internalTrack: InternalVideoTrack;
	decoderConfigPromise: Promise<VideoDecoderConfig> | null = null;

	constructor(internalTrack: InternalVideoTrack) {
		super(internalTrack);
		this.internalTrack = internalTrack;
	}

	override getCodec(): VideoCodec | null {
		return this.internalTrack.info.codec;
	}

	getCodedWidth() {
		return this.internalTrack.info.width;
	}

	getCodedHeight() {
		return this.internalTrack.info.height;
	}

	getRotation() {
		return this.internalTrack.rotation;
	}

	async getColorSpace(): Promise<VideoColorSpaceInit> {
		return {
			primaries: this.internalTrack.info.colorSpace?.primaries,
			transfer: this.internalTrack.info.colorSpace?.transfer,
			matrix: this.internalTrack.info.colorSpace?.matrix,
			fullRange: this.internalTrack.info.colorSpace?.fullRange,
		};
	}

	async canBeTransparent() {
		return false;
	}

	async getDecoderConfig(): Promise<VideoDecoderConfig | null> {
		if (!this.internalTrack.info.codec) {
			return null;
		}

		return this.decoderConfigPromise ??= (async (): Promise<VideoDecoderConfig> => {
			if (this.internalTrack.info.codec === 'vp9' && !this.internalTrack.info.vp9CodecInfo) {
				const firstPacket = await this.getFirstPacket({});
				this.internalTrack.info.vp9CodecInfo = firstPacket && extractVp9CodecInfoFromPacket(firstPacket.data);
			} else if (this.internalTrack.info.codec === 'av1' && !this.internalTrack.info.av1CodecInfo) {
				const firstPacket = await this.getFirstPacket({});
				this.internalTrack.info.av1CodecInfo = firstPacket && extractAv1CodecInfoFromPacket(firstPacket.data);
			}

			return {
				codec: extractVideoCodecString(this.internalTrack.info),
				codedWidth: this.internalTrack.info.width,
				codedHeight: this.internalTrack.info.height,
				description: this.internalTrack.info.codecDescription ?? undefined,
				colorSpace: this.internalTrack.info.colorSpace ?? undefined,
			};
		})();
	}
}

class IsobmffAudioTrackBacking extends IsobmffTrackBacking implements InputAudioTrackBacking {
	override internalTrack: InternalAudioTrack;
	decoderConfig: AudioDecoderConfig | null = null;

	constructor(internalTrack: InternalAudioTrack) {
		super(internalTrack);
		this.internalTrack = internalTrack;
	}

	override getCodec(): AudioCodec | null {
		return this.internalTrack.info.codec;
	}

	getNumberOfChannels() {
		return this.internalTrack.info.numberOfChannels;
	}

	getSampleRate() {
		return this.internalTrack.info.sampleRate;
	}

	async getDecoderConfig(): Promise<AudioDecoderConfig | null> {
		if (!this.internalTrack.info.codec) {
			return null;
		}

		return this.decoderConfig ??= {
			codec: extractAudioCodecString(this.internalTrack.info),
			numberOfChannels: this.internalTrack.info.numberOfChannels,
			sampleRate: this.internalTrack.info.sampleRate,
			description: this.internalTrack.info.codecDescription ?? undefined,
		};
	}
}

const getSampleIndexForTimestamp = (sampleTable: SampleTable, timescaleUnits: number) => {
	if (sampleTable.presentationTimestamps) {
		const index = binarySearchLessOrEqual(
			sampleTable.presentationTimestamps,
			timescaleUnits,
			x => x.presentationTimestamp,
		);
		if (index === -1) {
			return -1;
		}

		return sampleTable.presentationTimestamps[index]!.sampleIndex;
	} else {
		const index = binarySearchLessOrEqual(
			sampleTable.sampleTimingEntries,
			timescaleUnits,
			x => x.startDecodeTimestamp,
		);
		if (index === -1) {
			return -1;
		}

		const entry = sampleTable.sampleTimingEntries[index]!;
		return entry.startIndex
			+ Math.min(Math.floor((timescaleUnits - entry.startDecodeTimestamp) / entry.delta), entry.count - 1);
	}
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
	if (offsetEntry && sampleIndex - offsetEntry.startIndex < offsetEntry.count) {
		presentationTimestamp += offsetEntry.offset;
	}

	const sampleSize = sampleTable.sampleSizes[Math.min(sampleIndex, sampleTable.sampleSizes.length - 1)]!;
	const chunkEntryIndex = binarySearchLessOrEqual(sampleTable.sampleToChunk, sampleIndex, x => x.startSampleIndex);
	const chunkEntry = sampleTable.sampleToChunk[chunkEntryIndex];
	assert(chunkEntry);

	const chunkIndex = chunkEntry.startChunkIndex
		+ Math.floor((sampleIndex - chunkEntry.startSampleIndex) / chunkEntry.samplesPerChunk);
	const chunkOffset = sampleTable.chunkOffsets[chunkIndex]!;

	const startSampleIndexOfChunk = chunkEntry.startSampleIndex
		+ (chunkIndex - chunkEntry.startChunkIndex) * chunkEntry.samplesPerChunk;
	let chunkSize = 0;
	let sampleOffset = chunkOffset;

	if (sampleTable.sampleSizes.length === 1) {
		sampleOffset += sampleSize * (sampleIndex - startSampleIndexOfChunk);
		chunkSize += sampleSize * chunkEntry.samplesPerChunk;
	} else {
		for (let i = startSampleIndexOfChunk; i < startSampleIndexOfChunk + chunkEntry.samplesPerChunk; i++) {
			const sampleSize = sampleTable.sampleSizes[i]!;

			if (i < sampleIndex) {
				sampleOffset += sampleSize;
			}
			chunkSize += sampleSize;
		}
	}

	let duration = timingEntry.delta;
	if (sampleTable.presentationTimestamps) {
		// In order to accurately compute the duration, we need to take the duration to the next sample in presentation
		// order, not in decode order
		const presentationIndex = sampleTable.presentationTimestampIndexMap![sampleIndex];
		assert(presentationIndex !== undefined);

		if (presentationIndex < sampleTable.presentationTimestamps.length - 1) {
			const nextEntry = sampleTable.presentationTimestamps[presentationIndex + 1]!;
			const nextPresentationTimestamp = nextEntry.presentationTimestamp;
			duration = nextPresentationTimestamp - presentationTimestamp;
		}
	}

	return {
		presentationTimestamp,
		duration,
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

/** Extracts the rotation component from a transformation matrix, in degrees. */
const extractRotationFromMatrix = (matrix: TransformationMatrix) => {
	const [m11, , , m21] = matrix;

	const scaleX = Math.hypot(m11, m21);

	const cosTheta = m11 / scaleX;
	const sinTheta = m21 / scaleX;

	// Invert the rotation because matrices are post-multiplied in ISOBMFF
	const result = -Math.atan2(sinTheta, cosTheta) * (180 / Math.PI);

	if (!Number.isFinite(result)) {
		// Can happen if the entire matrix is 0, for example
		return 0;
	}

	return result;
};

const sampleTableIsEmpty = (sampleTable: SampleTable) => {
	return sampleTable.sampleSizes.length === 0;
};
