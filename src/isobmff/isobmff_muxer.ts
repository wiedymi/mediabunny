import { Box, free, ftyp, mdat, mfra, moof, moov } from './isobmff_boxes';
import { Muxer } from '../muxer';
import { Output, OutputAudioTrack, OutputTrack, OutputVideoTrack } from '../output';
import { Writer } from '../writer';
import { assert, last, TransformationMatrix } from '../misc';
import { Mp4OutputFormat } from '../output_format';

export const GLOBAL_TIMESCALE = 1000;
const TIMESTAMP_OFFSET = 2_082_844_800; // Seconds between Jan 1 1904 and Jan 1 1970

export type Sample = {
	timestamp: number,
	decodeTimestamp: number,
	duration: number,
	data: Uint8Array | null,
	size: number,
	type: 'key' | 'delta',
	timescaleUnitsToNextSample: number
};

type Chunk = {
	startTimestamp: number,
	samples: Sample[],
	offset: number | null,
	// In the case of a fragmented file, this indicates the position of the moof box pointing to the data in this chunk
	moofOffset: number | null
};

export type IsobmffTrackData = {
	timescale: number,
	samples: Sample[],
	sampleQueue: Sample[], // For fragmented files
	timestampProcessingQueue: Sample[],

	firstTimestamp: number | null,
	lastKeyFrameTimestamp: number | null,

	timeToSampleTable: { sampleCount: number, sampleDelta: number }[];
	compositionTimeOffsetTable: { sampleCount: number, sampleCompositionTimeOffset: number }[];
	lastTimescaleUnits: number | null,
	lastSample: Sample | null,

	finalizedChunks: Chunk[],
	currentChunk: Chunk | null,
	compactlyCodedChunkTable: {
		firstChunk: number,
		samplesPerChunk: number
	}[]
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
});

export type IsobmffVideoTrackData = IsobmffTrackData & { type: 'video' };
export type IsobmffAudioTrackData = IsobmffTrackData & { type: 'audio' };

export const intoTimescale = (timeInSeconds: number, timescale: number, round = true) => {
	let value = timeInSeconds * timescale;
	return round ? Math.round(value) : value;
};

export class IsobmffMuxer extends Muxer {
	#writer: Writer;
	#format: Mp4OutputFormat;
	#helper = new Uint8Array(8);
	#helperView = new DataView(this.#helper.buffer);

	/**
	 * Stores the position from the start of the file to where boxes elements have been written. This is used to
	 * rewrite/edit elements that were already added before, and to measure sizes of things.
	 */
	offsets = new WeakMap<Box, number>();

	#ftypSize: number | null = null;
	#mdat: Box | null = null;

	#trackDatas: IsobmffTrackData[] = [];

	#creationTime = Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET;
	#finalizedChunks: Chunk[] = [];

	#nextFragmentNumber = 1;

	constructor(output: Output, format: Mp4OutputFormat) {
		super(output);

		this.#writer = output.writer;
		this.#format = format;
	}

	writeU32(value: number) {
		this.#helperView.setUint32(0, value, false);
		this.#writer.write(this.#helper.subarray(0, 4));
	}

	writeU64(value: number) {
		this.#helperView.setUint32(0, Math.floor(value / 2**32), false);
		this.#helperView.setUint32(4, value, false);
		this.#writer.write(this.#helper.subarray(0, 8));
	}

	writeAscii(text: string) {
		for (let i = 0; i < text.length; i++) {
			this.#helperView.setUint8(i % 8, text.charCodeAt(i));
			if (i % 8 === 7) this.#writer.write(this.#helper);
		}

		if (text.length % 8 !== 0) {
			this.#writer.write(this.#helper.subarray(0, text.length % 8));
		}
	}

	writeBox(box: Box) {
		this.offsets.set(box, this.#writer.getPos());

		if (box.contents && !box.children) {
			this.writeBoxHeader(box, box.size ?? box.contents.byteLength + 8);
			this.#writer.write(box.contents);
		} else {
			let startPos = this.#writer.getPos();
			this.writeBoxHeader(box, 0);

			if (box.contents) this.#writer.write(box.contents);
			if (box.children) for (let child of box.children) if (child) this.writeBox(child);

			let endPos = this.#writer.getPos();
			let size = box.size ?? endPos - startPos;
			this.#writer.seek(startPos);
			this.writeBoxHeader(box, size);
			this.#writer.seek(endPos);
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

		let endPos = this.#writer.getPos();
		this.#writer.seek(boxOffset);
		this.writeBox(box);
		this.#writer.seek(endPos);
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

	start() {
		const holdsAvc = this.output.tracks.some(x => x.type === 'video' && x.source.codec === 'avc');
		
		// Write the header
		this.writeBox(ftyp({
			holdsAvc: holdsAvc,
			fragmented: this.#format.options.fastStart === 'fragmented'
		}));

		this.#ftypSize = this.#writer.getPos();

		if (this.#format.options.fastStart === 'in-memory') {
			this.#mdat = mdat(false);
		} else if (this.#format.options.fastStart === 'fragmented') {
			// We write the moov box once we write out the first fragment to make sure we get the decoder configs
		} else {
			if (typeof this.#format.options.fastStart === 'object') {
				let moovSizeUpperBound = this.#computeMoovSizeUpperBound();
				this.#writer.seek(this.#writer.getPos() + moovSizeUpperBound);
			}

			this.#mdat = mdat(true); // Reserve large size by default, can refine this when finalizing.
			this.writeBox(this.#mdat);
		}

		this.#writer.flush();
	}

	#computeMoovSizeUpperBound() {
		assert(typeof this.#format.options.fastStart === 'object');

		let upperBound = 0;
		let sampleCounts = [
			this.#format.options.fastStart.expectedVideoChunks,
			this.#format.options.fastStart.expectedAudioChunks
		];

		for (let n of sampleCounts) {
			if (!n) continue;

			// Given the max allowed sample count, compute the space they'll take up in the Sample Table Box, assuming
			// the worst case for each individual box:

			// stts box - since it is compactly coded, the maximum length of this table will be 2/3n
			upperBound += (4 + 4) * Math.ceil(2/3 * n);
			// stss box - 1 entry per sample
			upperBound += 4 * n;
			// stsc box - since it is compactly coded, the maximum length of this table will be 2/3n
			upperBound += (4 + 4 + 4) * Math.ceil(2/3 * n);
			// stsz box - 1 entry per sample
			upperBound += 4 * n;
			// co64 box - we assume 1 sample per chunk and 64-bit chunk offsets
			upperBound += 8 * n;
		}

		upperBound += 4096; // Assume a generous 4 kB for everything else: Track metadata, codec descriptors, etc.

		return upperBound;
	}

	#getVideoTrackData(track: OutputVideoTrack, chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
		const existingTrackData = this.#trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData;
		}

		// TODO Make proper errors for these
		assert(meta);
		assert(meta.decoderConfig);
		assert(meta.decoderConfig.codedWidth !== undefined);
		assert(meta.decoderConfig.codedHeight !== undefined);

		const newTrackData: IsobmffTrackData = {
			track,
			type: 'video',
			info: {
				width: meta.decoderConfig.codedWidth,
				height: meta.decoderConfig.codedHeight,
				decoderConfig: meta.decoderConfig
			},
			timescale: track.metadata.frameRate ?? 57600,
			samples: [],
			sampleQueue: [],
			timestampProcessingQueue: [],
			firstTimestamp: null,
			lastKeyFrameTimestamp: null,
			timeToSampleTable: [],
			compositionTimeOffsetTable: [],
			lastTimescaleUnits: null,
			lastSample: null,
			finalizedChunks: [],
			currentChunk: null,
			compactlyCodedChunkTable: []
		};

		this.#trackDatas.push(newTrackData);
		this.#trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	#getAudioTrackData(track: OutputAudioTrack, chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) {
		const existingTrackData = this.#trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData;
		}

		// TODO Make proper errors for these
		assert(meta);
		assert(meta.decoderConfig);

		const newTrackData: IsobmffTrackData = {
			track,
			type: 'audio',
			info: {
				numberOfChannels: meta.decoderConfig.numberOfChannels,
				sampleRate: meta.decoderConfig.sampleRate,
				decoderConfig: meta.decoderConfig
			},
			timescale: meta.decoderConfig.sampleRate,
			samples: [],
			sampleQueue: [],
			timestampProcessingQueue: [],
			firstTimestamp: null,
			lastKeyFrameTimestamp: null,
			timeToSampleTable: [],
			compositionTimeOffsetTable: [],
			lastTimescaleUnits: null,
			lastSample: null,
			finalizedChunks: [],
			currentChunk: null,
			compactlyCodedChunkTable: []
		};

		this.#trackDatas.push(newTrackData);
		this.#trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	addEncodedVideoChunk(track: OutputVideoTrack, chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
		const trackData = this.#getVideoTrackData(track, chunk, meta);

		if (
			typeof this.#format.options.fastStart === 'object' &&
			trackData.samples.length === this.#format.options.fastStart.expectedVideoChunks
		) {
			// TODO reference track id
			throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${
				this.#format.options.fastStart.expectedVideoChunks
			}).`);
		}

		let videoSample = this.#createSampleForTrack(trackData, chunk);

		if (this.#format.options.fastStart === 'fragmented') {
			trackData.sampleQueue.push(videoSample);
			this.#interleaveSamples();
		} else {
			this.#addSampleToTrack(trackData, videoSample);
		}
	}

	addEncodedAudioChunk(track: OutputAudioTrack, chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) {
		const trackData = this.#getAudioTrackData(track, chunk, meta);

		if (
			typeof this.#format.options.fastStart === 'object' &&
			trackData.samples.length === this.#format.options.fastStart.expectedAudioChunks
		) {
			// TODO reference track id
			throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${
				this.#format.options.fastStart.expectedAudioChunks
			}).`);
		}

		let audioSample = this.#createSampleForTrack(trackData, chunk);

		if (this.#format.options.fastStart === 'fragmented') {
			trackData.sampleQueue.push(audioSample);
			this.#interleaveSamples();
		} else {
			this.#addSampleToTrack(trackData, audioSample);
		}
	}

	#createSampleForTrack(
		trackData: IsobmffTrackData,
		chunk: EncodedVideoChunk | EncodedAudioChunk
	) {
		let timestampInSeconds = this.#validateTimestamp(trackData, chunk);
		let durationInSeconds = (chunk.duration ?? 0) / 1e6;

		let data = new Uint8Array(chunk.byteLength);
		chunk.copyTo(data);

		let sample: Sample = {
			timestamp: timestampInSeconds,
			decodeTimestamp: timestampInSeconds, // We may refine this later
			duration: durationInSeconds,
			data: data,
			size: data.byteLength,
			type: chunk.type,
			// Will be refined once the next sample comes in
			timescaleUnitsToNextSample: intoTimescale(durationInSeconds, trackData.timescale)
		};

		return sample;
	}

	#processTimestamps(trackData: IsobmffTrackData) {
		if (trackData.timestampProcessingQueue.length === 0) {
			return;
		}

		const sortedTimestamps = trackData.timestampProcessingQueue.map(x => x.timestamp).sort((a, b) => a - b);

		for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
			const sample = trackData.timestampProcessingQueue[i]!;

			// Since the user only supplies presentation time, but these may be out of order, we reverse-engineer from
			// that a sensible decode timestamp. The notion of a decode timestamp doesn't really make sense
			// (presentation timestamp & decode order are all you need), but it is a concept in ISOBMFF so we need to
			// model it.
			sample.decodeTimestamp = sortedTimestamps[i]!;

			const sampleCompositionTimeOffset =
				intoTimescale(sample.timestamp - sample.decodeTimestamp, trackData.timescale);

			if (trackData.lastTimescaleUnits !== null) {
				assert(trackData.lastSample);
	
				let timescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
				let delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
				trackData.lastTimescaleUnits += delta;
				trackData.lastSample.timescaleUnitsToNextSample = delta;
	
				if (this.#format.options.fastStart !== 'fragmented') {
					let lastTableEntry = last(trackData.timeToSampleTable);
					assert(lastTableEntry);
	
					if (lastTableEntry.sampleCount === 1) {
						// If we hit this case, we're the second sample
						lastTableEntry.sampleDelta = delta;
						lastTableEntry.sampleCount++;
					} else if (lastTableEntry.sampleDelta === delta) {
						// Simply increment the count
						lastTableEntry.sampleCount++;
					} else {
						// The delta has changed, subtract one from the previous run and create a new run with the new delta
						lastTableEntry.sampleCount--;
						trackData.timeToSampleTable.push({
							sampleCount: 2,
							sampleDelta: delta
						});
					}
	
					const lastCompositionTimeOffsetTableEntry = last(trackData.compositionTimeOffsetTable);
					assert(lastCompositionTimeOffsetTableEntry);
	
					if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
						// Simply increment the count
						lastCompositionTimeOffsetTableEntry.sampleCount++;
					} else {
						// The composition time offset has changed, so create a new entry with the new composition time
						// offset
						trackData.compositionTimeOffsetTable.push({
							sampleCount: 1,
							sampleCompositionTimeOffset: sampleCompositionTimeOffset
						});
					}
				}
			} else {
				trackData.lastTimescaleUnits = 0;
	
				if (this.#format.options.fastStart !== 'fragmented') {
					trackData.timeToSampleTable.push({
						sampleCount: 1,
						sampleDelta: intoTimescale(sample.duration, trackData.timescale)
					});
					trackData.compositionTimeOffsetTable.push({
						sampleCount: 1,
						sampleCompositionTimeOffset: sampleCompositionTimeOffset
					});
				}
			}

			trackData.lastSample = sample;
		}

		trackData.timestampProcessingQueue.length = 0;
	}

	#addSampleToTrack(
		trackData: IsobmffTrackData,
		sample: Sample
	) {
		if (sample.type === 'key') {
			this.#processTimestamps(trackData);
		}

		if (this.#format.options.fastStart !== 'fragmented') {
			trackData.samples.push(sample);
		}

		let beginNewChunk = false;
		if (!trackData.currentChunk) {
			beginNewChunk = true;
		} else {
			let currentChunkDuration = sample.timestamp - trackData.currentChunk.startTimestamp;

			if (this.#format.options.fastStart === 'fragmented') {
				// We can only finalize this fragment (and begin a new one) if we know that each track will be able to
				// start the new one with a key frame.
				const keyFrameQueuedEverywhere = this.#trackDatas.every(otherTrackData => {
					if (trackData === otherTrackData) {
						return sample.type === 'key';
					}

					const firstQueuedSample = otherTrackData.sampleQueue[0];
					return firstQueuedSample && firstQueuedSample.type === 'key';
				});

				if (currentChunkDuration >= 1.0 && keyFrameQueuedEverywhere) {
					beginNewChunk = true;
					this.#finalizeFragment();
				}
			} else {
				beginNewChunk = currentChunkDuration >= 0.5; // Chunk is long enough, we need a new one
			}
		}

		if (beginNewChunk) {
			if (trackData.currentChunk) {
				this.#finalizeCurrentChunk(trackData);
			}

			trackData.currentChunk = {
				startTimestamp: sample.timestamp,
				samples: [],
				offset: null,
				moofOffset: null
			};
		}

		assert(trackData.currentChunk);
		trackData.currentChunk.samples.push(sample);
		trackData.timestampProcessingQueue.push(sample);
	}

	#validateTimestamp(trackData: IsobmffTrackData, chunk: EncodedVideoChunk | EncodedAudioChunk) {
		let timestampInSeconds = chunk.timestamp / 1e6;

		if (timestampInSeconds < 0) {
			throw new Error(`Timestamps must be non-negative (got ${timestampInSeconds}s).`);
		}

		if (trackData.firstTimestamp === null) {
			trackData.firstTimestamp = timestampInSeconds;
		}

		timestampInSeconds -= trackData.firstTimestamp;

		if (trackData.lastKeyFrameTimestamp !== null && timestampInSeconds < trackData.lastKeyFrameTimestamp) {
			throw new Error(`Timestamp cannot be before last key frame's timestamp (got ${timestampInSeconds}s, last key frame at ${trackData.lastKeyFrameTimestamp}s).`);
		}

		if (chunk.type === 'key') {
			trackData.lastKeyFrameTimestamp = timestampInSeconds;
		}

		return timestampInSeconds;
	}

	#finalizeCurrentChunk(trackData: IsobmffTrackData) {
		assert(this.#format.options.fastStart !== 'fragmented');

		if (!trackData.currentChunk) return;

		trackData.finalizedChunks.push(trackData.currentChunk);
		this.#finalizedChunks.push(trackData.currentChunk);

		if (
			trackData.compactlyCodedChunkTable.length === 0
			|| last(trackData.compactlyCodedChunkTable)!.samplesPerChunk !== trackData.currentChunk.samples.length
		) {
			trackData.compactlyCodedChunkTable.push({
				firstChunk: trackData.finalizedChunks.length, // 1-indexed
				samplesPerChunk: trackData.currentChunk.samples.length
			});
		}

		if (this.#format.options.fastStart === 'in-memory') {
			trackData.currentChunk.offset = 0; // We'll compute the proper offset when finalizing
			return;
		}

		// Write out the data
		trackData.currentChunk.offset = this.#writer.getPos();
		for (let sample of trackData.currentChunk.samples) {
			assert(sample.data);
			this.#writer.write(sample.data);
			sample.data = null; // Can be GC'd
		}

		this.#writer.flush();
	}

	#interleaveSamples() {
		assert(this.#format.options.fastStart === 'fragmented');

		if (this.#trackDatas.length < this.output.tracks.length) {
			return; // We haven't seen a sample from each track yet
		}

		outer:
		while (true) {
			let trackWithMinTimestamp: IsobmffTrackData | null = null;
			let minTimestamp = Infinity;

			for (let trackData of this.#trackDatas) {
				if (trackData.sampleQueue.length === 0) {
					break outer;
				}

				if (trackData.sampleQueue[0]!.timestamp < minTimestamp) {
					trackWithMinTimestamp = trackData;
					minTimestamp = trackData.sampleQueue[0]!.timestamp;
				}
			}

			if (!trackWithMinTimestamp) {
				break;
			}

			let sample = trackWithMinTimestamp.sampleQueue.shift()!;
			this.#addSampleToTrack(trackWithMinTimestamp, sample);
		}
	}

	#finalizeFragment(flushWriter = true) {
		assert(this.#format.options.fastStart === 'fragmented');

		let fragmentNumber = this.#nextFragmentNumber++;

		if (fragmentNumber === 1) {
			// Write the moov box now that we have all decoder configs
			let movieBox = moov(this.#trackDatas, this.#creationTime, true);
			this.writeBox(movieBox);
		}

		// Write out an initial moof box; will be overwritten later once actual chunk offsets are known
		let moofOffset = this.#writer.getPos();
		let moofBox = moof(fragmentNumber, this.#trackDatas);
		this.writeBox(moofBox);

		// Create the mdat box
		{
			let mdatBox = mdat(false); // Initially assume no fragment is larger than 4 GiB
			let totalTrackSampleSize = 0;

			// Compute the size of the mdat box
			for (let trackData of this.#trackDatas) {
				assert(trackData.currentChunk);
				for (let sample of trackData.currentChunk.samples) {
					totalTrackSampleSize += sample.size;
				}
			}

			let mdatSize = this.measureBox(mdatBox) + totalTrackSampleSize;
			if (mdatSize >= 2**32) {
				// Fragment is larger than 4 GiB, we need to use the large size
				mdatBox.largeSize = true;
				mdatSize = this.measureBox(mdatBox) + totalTrackSampleSize;
			}

			mdatBox.size = mdatSize;
			this.writeBox(mdatBox);
		}

		// Write sample data
		for (let trackData of this.#trackDatas) {
			trackData.currentChunk!.offset = this.#writer.getPos();
			trackData.currentChunk!.moofOffset = moofOffset;

			for (let sample of trackData.currentChunk!.samples) {
				this.#writer.write(sample.data!);
				sample.data = null; // Can be GC'd
			}
		}

		// Now that we set the actual chunk offsets, fix the moof box
		let endPos = this.#writer.getPos();
		this.#writer.seek(this.offsets.get(moofBox)!);
		let newMoofBox = moof(fragmentNumber, this.#trackDatas);
		this.writeBox(newMoofBox);
		this.#writer.seek(endPos);

		for (let trackData of this.#trackDatas) {
			trackData.finalizedChunks.push(trackData.currentChunk!);
			this.#finalizedChunks.push(trackData.currentChunk!);
			trackData.currentChunk = null;
		}

		if (flushWriter) {
			this.#writer.flush();
		}
	}

	/** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
	finalize() {
		if (this.#format.options.fastStart === 'fragmented') {
			for (let trackData of this.#trackDatas) {
				for (let sample of trackData.sampleQueue) {
					this.#addSampleToTrack(trackData, sample);
				}

				this.#processTimestamps(trackData);
			}

			this.#finalizeFragment(false); // Don't flush the last fragment as we will flush it with the mfra box soon
		} else {
		 	for (let trackData of this.#trackDatas) {
				this.#processTimestamps(trackData);
				this.#finalizeCurrentChunk(trackData);
			}
		}

		if (this.#format.options.fastStart === 'in-memory') {
			assert(this.#mdat);
			let mdatSize: number;

			// We know how many chunks there are, but computing the chunk positions requires an iterative approach:
			// In order to know where the first chunk should go, we first need to know the size of the moov box. But we
			// cannot write a proper moov box without first knowing all chunk positions. So, we generate a tentative
			// moov box with placeholder values (0) for the chunk offsets to be able to compute its size. If it then
			// turns out that appending all chunks exceeds 4 GiB, we need to repeat this process, now with the co64 box
			// being used in the moov box instead, which will make it larger. After that, we definitely know the final
			// size of the moov box and can compute the proper chunk positions.

			for (let i = 0; i < 2; i++) {
				let movieBox = moov(this.#trackDatas, this.#creationTime);
				let movieBoxSize = this.measureBox(movieBox);
				mdatSize = this.measureBox(this.#mdat);
				let currentChunkPos = this.#writer.getPos() + movieBoxSize + mdatSize;

				for (let chunk of this.#finalizedChunks) {
					chunk.offset = currentChunkPos;
					for (let { data } of chunk.samples) {
						assert(data);
						currentChunkPos += data.byteLength;
						mdatSize += data.byteLength;
					}
				}

				if (currentChunkPos < 2**32) break;
				if (mdatSize >= 2**32) this.#mdat.largeSize = true;
			}

			let movieBox = moov(this.#trackDatas, this.#creationTime);
			this.writeBox(movieBox);

			this.#mdat.size = mdatSize!;
			this.writeBox(this.#mdat);

			for (let chunk of this.#finalizedChunks) {
				for (let sample of chunk.samples) {
					assert(sample.data);
					this.#writer.write(sample.data);
					sample.data = null;
				}
			}
		} else if (this.#format.options.fastStart === 'fragmented') {
			// Append the mfra box to the end of the file for better random access
			let startPos = this.#writer.getPos();
			let mfraBox = mfra(this.#trackDatas);
			this.writeBox(mfraBox);

			// Patch the 'size' field of the mfro box at the end of the mfra box now that we know its actual size
			let mfraBoxSize = this.#writer.getPos() - startPos;
			this.#writer.seek(this.#writer.getPos() - 4);
			this.writeU32(mfraBoxSize);
		} else {
			assert(this.#mdat);
			assert(this.#ftypSize !== null);

			let mdatPos = this.offsets.get(this.#mdat);
			assert(mdatPos !== undefined);
			let mdatSize = this.#writer.getPos() - mdatPos;
			this.#mdat.size = mdatSize;
			this.#mdat.largeSize = mdatSize >= 2**32; // Only use the large size if we need it
			this.patchBox(this.#mdat);

			let movieBox = moov(this.#trackDatas, this.#creationTime);

			if (typeof this.#format.options.fastStart === 'object') {
				this.#writer.seek(this.#ftypSize);
				this.writeBox(movieBox);

				let remainingBytes = mdatPos - this.#writer.getPos();
				this.writeBox(free(remainingBytes));
			} else {
				this.writeBox(movieBox);
			}
		}
	}
}
