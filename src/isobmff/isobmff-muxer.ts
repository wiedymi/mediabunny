import { Box, free, ftyp, IsobmffBoxWriter, mdat, mfra, moof, moov, vtta, vttc, vtte } from './isobmff-boxes';
import { Muxer } from '../muxer';
import { Output, OutputAudioTrack, OutputSubtitleTrack, OutputTrack, OutputVideoTrack } from '../output';
import { ArrayBufferTargetWriter, Writer } from '../writer';
import { assert, last } from '../misc';
import { IsobmffOutputFormatOptions, IsobmffOutputFormat, MovOutputFormat } from '../output-format';
import { inlineTimestampRegex, SubtitleConfig, SubtitleCue, SubtitleMetadata } from '../subtitles';
import { ArrayBufferTarget } from '../target';
import {
	parsePcmCodec,
	PCM_CODECS,
	PcmAudioCodec,
	validateAudioChunkMetadata,
	validateSubtitleMetadata,
	validateVideoChunkMetadata,
} from '../codec';
import { EncodedAudioSample, EncodedVideoSample } from '../sample';

export const GLOBAL_TIMESCALE = 1000;
const TIMESTAMP_OFFSET = 2_082_844_800; // Seconds between Jan 1 1904 and Jan 1 1970

export type Sample = {
	timestamp: number;
	decodeTimestamp: number;
	duration: number;
	data: Uint8Array | null;
	size: number;
	type: 'key' | 'delta';
	timescaleUnitsToNextSample: number;
};

type Chunk = {
	startTimestamp: number;
	samples: Sample[];
	offset: number | null;
	// In the case of a fragmented file, this indicates the position of the moof box pointing to the data in this chunk
	moofOffset: number | null;
};

export type IsobmffTrackData = {
	timescale: number;
	samples: Sample[];
	sampleQueue: Sample[]; // For fragmented files
	timestampProcessingQueue: Sample[];

	timeToSampleTable: { sampleCount: number; sampleDelta: number }[];
	compositionTimeOffsetTable: { sampleCount: number; sampleCompositionTimeOffset: number }[];
	lastTimescaleUnits: number | null;
	lastSample: Sample | null;
	/**
	 * The "PCM transformation" is making every sample in the sample table be exactly one PCM audio sample long.
	 * Some players expect this for PCM audio.
	 */
	requiresPcmTransformation: boolean;

	finalizedChunks: Chunk[];
	currentChunk: Chunk | null;
	compactlyCodedChunkTable: {
		firstChunk: number;
		samplesPerChunk: number;
	}[];
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
	lastCueEndTimestamp: number;
	cueQueue: SubtitleCue[];
	nextSourceId: number;
	cueToSourceId: WeakMap<SubtitleCue, number>;
});

export type IsobmffVideoTrackData = IsobmffTrackData & { type: 'video' };
export type IsobmffAudioTrackData = IsobmffTrackData & { type: 'audio' };
export type IsobmffSubtitleTrackData = IsobmffTrackData & { type: 'subtitle' };

export const intoTimescale = (timeInSeconds: number, timescale: number, round = true) => {
	const value = timeInSeconds * timescale;
	return round ? Math.round(value) : value;
};

export class IsobmffMuxer extends Muxer {
	private writer: Writer;
	private boxWriter: IsobmffBoxWriter;
	private isMov: boolean;
	private fastStart: NonNullable<IsobmffOutputFormatOptions['fastStart']>;

	private auxTarget = new ArrayBufferTarget();
	private auxWriter = this.auxTarget._createWriter();
	private auxBoxWriter = new IsobmffBoxWriter(this.auxWriter);

	private ftypSize: number | null = null;
	private mdat: Box | null = null;

	private trackDatas: IsobmffTrackData[] = [];

	private creationTime = Math.floor(Date.now() / 1000) + TIMESTAMP_OFFSET;
	private finalizedChunks: Chunk[] = [];

	private nextFragmentNumber = 1;

	constructor(output: Output, format: IsobmffOutputFormat) {
		super(output);

		this.writer = output._writer;
		this.boxWriter = new IsobmffBoxWriter(this.writer);

		this.isMov = format instanceof MovOutputFormat;

		// If the fastStart option isn't defined, enable in-memory fast start if the target is an ArrayBuffer, as the
		// memory usage remains identical
		const fastStartDefault = this.writer instanceof ArrayBufferTargetWriter ? 'in-memory' : false;
		this.fastStart = format._options.fastStart ?? fastStartDefault;

		if (this.fastStart === 'in-memory' || this.fastStart === 'fragmented') {
			this.writer.ensureMonotonicity = true;
		}
	}

	async start() {
		const release = await this.mutex.acquire();

		const holdsAvc = this.output._tracks.some(x => x.type === 'video' && x.source._codec === 'avc');

		// Write the header
		this.boxWriter.writeBox(ftyp({
			isMov: this.isMov,
			holdsAvc: holdsAvc,
			fragmented: this.fastStart === 'fragmented',
		}));

		this.ftypSize = this.writer.getPos();

		if (this.fastStart === 'in-memory') {
			this.mdat = mdat(false);
		} else if (this.fastStart === 'fragmented') {
			// We write the moov box once we write out the first fragment to make sure we get the decoder configs
		} else {
			this.mdat = mdat(true); // Reserve large size by default, can refine this when finalizing.
			this.boxWriter.writeBox(this.mdat);
		}

		await this.writer.flush();

		release();
	}

	private getVideoTrackData(track: OutputVideoTrack, meta?: EncodedVideoChunkMetadata) {
		const existingTrackData = this.trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData as IsobmffVideoTrackData;
		}

		validateVideoChunkMetadata(meta);

		assert(meta);
		assert(meta.decoderConfig);
		assert(meta.decoderConfig.codedWidth !== undefined);
		assert(meta.decoderConfig.codedHeight !== undefined);

		const newTrackData: IsobmffVideoTrackData = {
			track,
			type: 'video',
			info: {
				width: meta.decoderConfig.codedWidth,
				height: meta.decoderConfig.codedHeight,
				decoderConfig: meta.decoderConfig,
			},
			timescale: track.metadata.frameRate ?? 57600,
			samples: [],
			sampleQueue: [],
			timestampProcessingQueue: [],
			timeToSampleTable: [],
			compositionTimeOffsetTable: [],
			lastTimescaleUnits: null,
			lastSample: null,
			finalizedChunks: [],
			currentChunk: null,
			compactlyCodedChunkTable: [],
			requiresPcmTransformation: false,
		};

		this.trackDatas.push(newTrackData);
		this.trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	private getAudioTrackData(track: OutputAudioTrack, meta?: EncodedAudioChunkMetadata) {
		const existingTrackData = this.trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData as IsobmffAudioTrackData;
		}

		validateAudioChunkMetadata(meta);

		assert(meta);
		assert(meta.decoderConfig);

		const newTrackData: IsobmffAudioTrackData = {
			track,
			type: 'audio',
			info: {
				numberOfChannels: meta.decoderConfig.numberOfChannels,
				sampleRate: meta.decoderConfig.sampleRate,
				decoderConfig: meta.decoderConfig,
			},
			timescale: meta.decoderConfig.sampleRate,
			samples: [],
			sampleQueue: [],
			timestampProcessingQueue: [],
			timeToSampleTable: [],
			compositionTimeOffsetTable: [],
			lastTimescaleUnits: null,
			lastSample: null,
			finalizedChunks: [],
			currentChunk: null,
			compactlyCodedChunkTable: [],
			requiresPcmTransformation:
				this.fastStart !== 'fragmented'
				&& (PCM_CODECS as readonly string[]).includes(track.source._codec),
		};

		this.trackDatas.push(newTrackData);
		this.trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	private getSubtitleTrackData(track: OutputSubtitleTrack, meta?: SubtitleMetadata) {
		const existingTrackData = this.trackDatas.find(x => x.track === track);
		if (existingTrackData) {
			return existingTrackData as IsobmffSubtitleTrackData;
		}

		validateSubtitleMetadata(meta);

		assert(meta);
		assert(meta.config);

		const newTrackData: IsobmffSubtitleTrackData = {
			track,
			type: 'subtitle',
			info: {
				config: meta.config,
			},
			timescale: 1000, // Reasonable
			samples: [],
			sampleQueue: [],
			timestampProcessingQueue: [],
			timeToSampleTable: [],
			compositionTimeOffsetTable: [],
			lastTimescaleUnits: null,
			lastSample: null,
			finalizedChunks: [],
			currentChunk: null,
			compactlyCodedChunkTable: [],
			requiresPcmTransformation: false,

			lastCueEndTimestamp: 0,
			cueQueue: [],
			nextSourceId: 0,
			cueToSourceId: new WeakMap(),
		};

		this.trackDatas.push(newTrackData);
		this.trackDatas.sort((a, b) => a.track.id - b.track.id);

		return newTrackData;
	}

	async addEncodedVideoSample(track: OutputVideoTrack, sample: EncodedVideoSample, meta?: EncodedVideoChunkMetadata) {
		const release = await this.mutex.acquire();

		try {
			const trackData = this.getVideoTrackData(track, meta);

			const timestamp = this.validateAndNormalizeTimestamp(
				trackData.track,
				sample.timestamp,
				sample.type === 'key',
			);
			const internalSample = this.createSampleForTrack(
				trackData,
				sample.data,
				timestamp,
				sample.duration,
				sample.type,
			);

			await this.registerSample(trackData, internalSample);
		} finally {
			release();
		}
	}

	async addEncodedAudioSample(track: OutputAudioTrack, sample: EncodedAudioSample, meta?: EncodedAudioChunkMetadata) {
		const release = await this.mutex.acquire();

		try {
			const trackData = this.getAudioTrackData(track, meta);

			const timestamp = this.validateAndNormalizeTimestamp(
				trackData.track,
				sample.timestamp,
				sample.type === 'key',
			);
			const internalSample = this.createSampleForTrack(
				trackData,
				sample.data,
				timestamp,
				sample.duration,
				sample.type,
			);

			if (trackData.requiresPcmTransformation) {
				await this.maybePadWithSilence(trackData, timestamp);
			}

			await this.registerSample(trackData, internalSample);
		} finally {
			release();
		}
	}

	private async maybePadWithSilence(trackData: IsobmffAudioTrackData, untilTimestamp: number) {
		// The PCM transformation assumes that all samples are contiguous. This is not something that is enforced, so
		// we need to pad the "holes" in between samples (and before the first sample) with additional
		// "silence samples".

		const lastSample = last(trackData.samples);
		const lastEndTimestamp = lastSample
			? lastSample.timestamp + lastSample.duration
			: 0;

		const delta = untilTimestamp - lastEndTimestamp;
		const deltaInTimescale = intoTimescale(delta, trackData.timescale);

		if (deltaInTimescale > 0) {
			const { sampleSize, silentValue } = parsePcmCodec(
				trackData.info.decoderConfig.codec as PcmAudioCodec,
			);
			const samplesNeeded = deltaInTimescale * trackData.info.numberOfChannels;
			const data = new Uint8Array(sampleSize * samplesNeeded).fill(silentValue);

			const paddingSample = this.createSampleForTrack(
				trackData,
				new Uint8Array(data.buffer),
				lastEndTimestamp,
				delta,
				'key',
			);
			await this.registerSample(trackData, paddingSample);
		}
	}

	async addSubtitleCue(track: OutputSubtitleTrack, cue: SubtitleCue, meta?: SubtitleMetadata) {
		const release = await this.mutex.acquire();

		try {
			const trackData = this.getSubtitleTrackData(track, meta);

			this.validateAndNormalizeTimestamp(trackData.track, cue.timestamp, true);

			if (track.source._codec === 'webvtt') {
				trackData.cueQueue.push(cue);
				await this.processWebVTTCues(trackData, cue.timestamp);
			} else {
				// TODO
			}
		} finally {
			release();
		}
	}

	private async processWebVTTCues(trackData: IsobmffSubtitleTrackData, until: number) {
		// WebVTT cues need to undergo special processing as empty sections need to be padded out with samples, and
		// overlapping samples require special logic. The algorithm produces the format specified in ISO 14496-30.

		while (trackData.cueQueue.length > 0) {
			const timestamps = new Set<number>([]);
			for (const cue of trackData.cueQueue) {
				assert(cue.timestamp <= until);
				assert(trackData.lastCueEndTimestamp <= cue.timestamp + cue.duration);

				timestamps.add(Math.max(cue.timestamp, trackData.lastCueEndTimestamp)); // Start timestamp
				timestamps.add(cue.timestamp + cue.duration); // End timestamp
			}

			const sortedTimestamps = [...timestamps].sort((a, b) => a - b);

			// These are the timestamps of the next sample we'll create:
			const sampleStart = sortedTimestamps[0]!;
			const sampleEnd = sortedTimestamps[1] ?? sampleStart;

			if (until < sampleEnd) {
				break;
			}

			// We may need to pad out empty space with an vtte box
			if (trackData.lastCueEndTimestamp < sampleStart) {
				this.auxWriter.seek(0);
				const box = vtte();
				this.auxBoxWriter.writeBox(box);

				const body = this.auxWriter.getSlice(0, this.auxWriter.getPos());
				const sample = this.createSampleForTrack(
					trackData,
					body,
					trackData.lastCueEndTimestamp,
					sampleStart - trackData.lastCueEndTimestamp,
					'key',
				);

				await this.registerSample(trackData, sample);
				trackData.lastCueEndTimestamp = sampleStart;
			}

			this.auxWriter.seek(0);

			for (let i = 0; i < trackData.cueQueue.length; i++) {
				const cue = trackData.cueQueue[i]!;

				if (cue.timestamp >= sampleEnd) {
					break;
				}

				inlineTimestampRegex.lastIndex = 0;
				const containsTimestamp = inlineTimestampRegex.test(cue.text);

				const endTimestamp = cue.timestamp + cue.duration;
				let sourceId = trackData.cueToSourceId.get(cue);
				if (sourceId === undefined && sampleEnd < endTimestamp) {
					// We know this cue will appear in more than one sample, therefore we need to mark it with a
					// unique ID
					sourceId = trackData.nextSourceId++;
					trackData.cueToSourceId.set(cue, sourceId);
				}

				if (cue.notes) {
					// Any notes/comments are included in a special vtta box
					const box = vtta(cue.notes);
					this.auxBoxWriter.writeBox(box);
				}

				const box = vttc(
					cue.text,
					containsTimestamp ? sampleStart : null,
					cue.identifier ?? null,
					cue.settings ?? null,
					sourceId ?? null,
				);
				this.auxBoxWriter.writeBox(box);

				if (endTimestamp === sampleEnd) {
					// The cue won't appear in any future sample, so we're done with it
					trackData.cueQueue.splice(i--, 1);
				}
			}

			const body = this.auxWriter.getSlice(0, this.auxWriter.getPos());
			const sample = this.createSampleForTrack(trackData, body, sampleStart, sampleEnd - sampleStart, 'key');

			await this.registerSample(trackData, sample);
			trackData.lastCueEndTimestamp = sampleEnd;
		}
	}

	private createSampleForTrack(
		trackData: IsobmffTrackData,
		data: Uint8Array,
		timestamp: number,
		duration: number,
		type: 'key' | 'delta',
	) {
		const sample: Sample = {
			timestamp,
			decodeTimestamp: timestamp, // This may be refined later
			duration,
			data,
			size: data.byteLength,
			type,
			timescaleUnitsToNextSample: intoTimescale(duration, trackData.timescale), // Will be refined
		};

		return sample;
	}

	private processTimestamps(trackData: IsobmffTrackData) {
		if (trackData.timestampProcessingQueue.length === 0) {
			return;
		}

		if (trackData.requiresPcmTransformation) {
			let totalDuration = 0;

			// Compute the total duration in the track timescale (which is equal to the amount of PCM audio samples)
			// and simply say that's how many new samples there are.

			for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
				const sample = trackData.timestampProcessingQueue[i]!;
				const duration = intoTimescale(sample.duration, trackData.timescale);
				totalDuration += duration;
			}

			if (trackData.timeToSampleTable.length === 0) {
				trackData.timeToSampleTable.push({
					sampleCount: totalDuration,
					sampleDelta: 1,
				});
			} else {
				const lastEntry = last(trackData.timeToSampleTable)!;
				lastEntry.sampleCount += totalDuration;
			}

			trackData.timestampProcessingQueue.length = 0;
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

			if (this.fastStart !== 'fragmented' && trackData.lastTimescaleUnits === null) {
				// In non-fragmented files, the first decode timestamp is always zero. If the first presentation
				// timestamp isn't zero, we'll simply use the composition time offset to achieve it.
				sample.decodeTimestamp = 0;
			}

			const sampleCompositionTimeOffset
				= intoTimescale(sample.timestamp - sample.decodeTimestamp, trackData.timescale);
			const durationInTimescale = intoTimescale(sample.duration, trackData.timescale);

			if (trackData.lastTimescaleUnits !== null) {
				assert(trackData.lastSample);

				const timescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
				const delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
				trackData.lastTimescaleUnits += delta;
				trackData.lastSample.timescaleUnitsToNextSample = delta;

				if (this.fastStart !== 'fragmented') {
					let lastTableEntry = last(trackData.timeToSampleTable);
					assert(lastTableEntry);

					if (lastTableEntry.sampleCount === 1) {
						lastTableEntry.sampleDelta = delta;

						const entryBefore = trackData.timeToSampleTable[trackData.timeToSampleTable.length - 2];
						if (entryBefore && entryBefore.sampleDelta === delta) {
							// If the delta is the same as the previous one, merge the two entries
							entryBefore.sampleCount++;
							trackData.timeToSampleTable.pop();
							lastTableEntry = entryBefore;
						}
					} else if (lastTableEntry.sampleDelta !== delta) {
						// The delta has changed, so we need a new entry to reach the current sample
						lastTableEntry.sampleCount--;
						trackData.timeToSampleTable.push(lastTableEntry = {
							sampleCount: 1,
							sampleDelta: delta,
						});
					}

					if (lastTableEntry.sampleDelta === durationInTimescale) {
						// The sample's duration matches the delta, so we can increment the count
						lastTableEntry.sampleCount++;
					} else {
						// Add a new entry in order to maintain the last sample's true duration
						trackData.timeToSampleTable.push({
							sampleCount: 1,
							sampleDelta: durationInTimescale,
						});
					}

					const lastCompositionTimeOffsetTableEntry = last(trackData.compositionTimeOffsetTable);
					assert(lastCompositionTimeOffsetTableEntry);

					if (
						lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset
					) {
						// Simply increment the count
						lastCompositionTimeOffsetTableEntry.sampleCount++;
					} else {
						// The composition time offset has changed, so create a new entry with the new composition time
						// offset
						trackData.compositionTimeOffsetTable.push({
							sampleCount: 1,
							sampleCompositionTimeOffset: sampleCompositionTimeOffset,
						});
					}
				}
			} else {
				// Decode timestamp of the first sample
				trackData.lastTimescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);

				if (this.fastStart !== 'fragmented') {
					trackData.timeToSampleTable.push({
						sampleCount: 1,
						sampleDelta: durationInTimescale,
					});
					trackData.compositionTimeOffsetTable.push({
						sampleCount: 1,
						sampleCompositionTimeOffset: sampleCompositionTimeOffset,
					});
				}
			}

			trackData.lastSample = sample;
		}

		trackData.timestampProcessingQueue.length = 0;
	}

	private async registerSample(trackData: IsobmffTrackData, sample: Sample) {
		if (this.fastStart === 'fragmented') {
			trackData.sampleQueue.push(sample);
			await this.interleaveSamples();
		} else {
			await this.addSampleToTrack(trackData, sample);
		}
	}

	private async addSampleToTrack(trackData: IsobmffTrackData, sample: Sample) {
		if (sample.type === 'key') {
			this.processTimestamps(trackData);
		}

		if (this.fastStart !== 'fragmented') {
			trackData.samples.push(sample);
		}

		let beginNewChunk = false;
		if (!trackData.currentChunk) {
			beginNewChunk = true;
		} else {
			const currentChunkDuration = sample.timestamp - trackData.currentChunk.startTimestamp;

			if (this.fastStart === 'fragmented') {
				// We can only finalize this fragment (and begin a new one) if we know that each track will be able to
				// start the new one with a key frame.
				const keyFrameQueuedEverywhere = this.trackDatas.every((otherTrackData) => {
					if (otherTrackData.track.source._closed) {
						return true;
					}

					if (trackData === otherTrackData) {
						return sample.type === 'key';
					}

					const firstQueuedSample = otherTrackData.sampleQueue[0];
					return firstQueuedSample && firstQueuedSample.type === 'key';
				});

				if (currentChunkDuration >= 1.0 && keyFrameQueuedEverywhere) {
					beginNewChunk = true;
					await this.finalizeFragment();
				}
			} else {
				beginNewChunk = currentChunkDuration >= 0.5; // Chunk is long enough, we need a new one
			}
		}

		if (beginNewChunk) {
			if (trackData.currentChunk) {
				await this.finalizeCurrentChunk(trackData);
			}

			trackData.currentChunk = {
				startTimestamp: sample.timestamp,
				samples: [],
				offset: null,
				moofOffset: null,
			};
		}

		assert(trackData.currentChunk);
		trackData.currentChunk.samples.push(sample);
		trackData.timestampProcessingQueue.push(sample);
	}

	private async finalizeCurrentChunk(trackData: IsobmffTrackData) {
		assert(this.fastStart !== 'fragmented');

		if (!trackData.currentChunk) return;

		trackData.finalizedChunks.push(trackData.currentChunk);
		this.finalizedChunks.push(trackData.currentChunk);

		let sampleCount = trackData.currentChunk.samples.length;
		if (trackData.requiresPcmTransformation) {
			sampleCount = trackData.currentChunk.samples
				.reduce((acc, sample) => acc + intoTimescale(sample.duration, trackData.timescale), 0);
		}

		if (
			trackData.compactlyCodedChunkTable.length === 0
			|| last(trackData.compactlyCodedChunkTable)!.samplesPerChunk !== sampleCount
		) {
			trackData.compactlyCodedChunkTable.push({
				firstChunk: trackData.finalizedChunks.length, // 1-indexed
				samplesPerChunk: sampleCount,
			});
		}

		if (this.fastStart === 'in-memory') {
			trackData.currentChunk.offset = 0; // We'll compute the proper offset when finalizing
			return;
		}

		// Write out the data
		trackData.currentChunk.offset = this.writer.getPos();
		for (const sample of trackData.currentChunk.samples) {
			assert(sample.data);
			this.writer.write(sample.data);
			sample.data = null; // Can be GC'd
		}

		await this.writer.flush();
	}

	private async interleaveSamples() {
		assert(this.fastStart === 'fragmented');

		for (const track of this.output._tracks) {
			if (!track.source._closed && !this.trackDatas.some(x => x.track === track)) {
				return; // We haven't seen a sample from this open track yet
			}
		}

		outer:
		while (true) {
			let trackWithMinTimestamp: IsobmffTrackData | null = null;
			let minTimestamp = Infinity;

			for (const trackData of this.trackDatas) {
				if (trackData.sampleQueue.length === 0 && !trackData.track.source._closed) {
					break outer;
				}

				if (trackData.sampleQueue.length > 0 && trackData.sampleQueue[0]!.timestamp < minTimestamp) {
					trackWithMinTimestamp = trackData;
					minTimestamp = trackData.sampleQueue[0]!.timestamp;
				}
			}

			if (!trackWithMinTimestamp) {
				break;
			}

			const sample = trackWithMinTimestamp.sampleQueue.shift()!;
			await this.addSampleToTrack(trackWithMinTimestamp, sample);
		}
	}

	private async finalizeFragment(flushWriter = true) {
		assert(this.fastStart === 'fragmented');

		const fragmentNumber = this.nextFragmentNumber++;

		if (fragmentNumber === 1) {
			// Write the moov box now that we have all decoder configs
			const movieBox = moov(this.trackDatas, this.creationTime, true);
			this.boxWriter.writeBox(movieBox);
		}

		// Not all tracks need to be present in every fragment
		const tracksInFragment = this.trackDatas.filter(x => x.currentChunk);

		// Write out an initial moof box; will be overwritten later once actual chunk offsets are known
		const moofOffset = this.writer.getPos();
		const moofBox = moof(fragmentNumber, tracksInFragment);
		this.boxWriter.writeBox(moofBox);

		// Create the mdat box
		{
			const mdatBox = mdat(false); // Initially assume the fragment is not larger than 4 GiB
			let totalTrackSampleSize = 0;

			// Compute the size of the mdat box
			for (const trackData of tracksInFragment) {
				for (const sample of trackData.currentChunk!.samples) {
					totalTrackSampleSize += sample.size;
				}
			}

			let mdatSize = this.boxWriter.measureBox(mdatBox) + totalTrackSampleSize;
			if (mdatSize >= 2 ** 32) {
				// Fragment is larger than 4 GiB, we need to use the large size
				mdatBox.largeSize = true;
				mdatSize = this.boxWriter.measureBox(mdatBox) + totalTrackSampleSize;
			}

			mdatBox.size = mdatSize;
			this.boxWriter.writeBox(mdatBox);
		}

		// Write sample data
		for (const trackData of tracksInFragment) {
			trackData.currentChunk!.offset = this.writer.getPos();
			trackData.currentChunk!.moofOffset = moofOffset;

			for (const sample of trackData.currentChunk!.samples) {
				this.writer.write(sample.data!);
				sample.data = null; // Can be GC'd
			}
		}

		// Now that we set the actual chunk offsets, fix the moof box
		const endPos = this.writer.getPos();
		this.writer.seek(this.boxWriter.offsets.get(moofBox)!);
		const newMoofBox = moof(fragmentNumber, tracksInFragment);
		this.boxWriter.writeBox(newMoofBox);
		this.writer.seek(endPos);

		for (const trackData of tracksInFragment) {
			trackData.finalizedChunks.push(trackData.currentChunk!);
			this.finalizedChunks.push(trackData.currentChunk!);
			trackData.currentChunk = null;
		}

		if (flushWriter) {
			await this.writer.flush();
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	override async onTrackClose(track: OutputTrack) {
		const release = await this.mutex.acquire();

		if (track.type === 'subtitle' && track.source._codec === 'webvtt') {
			const trackData = this.trackDatas.find(x => x.track === track) as IsobmffSubtitleTrackData;
			if (trackData) {
				await this.processWebVTTCues(trackData, Infinity);
			}
		}

		if (this.fastStart === 'fragmented') {
			// Since a track is now closed, we may be able to write out chunks that were previously waiting
			await this.interleaveSamples();
		}

		release();
	}

	/** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
	async finalize() {
		const release = await this.mutex.acquire();

		for (const trackData of this.trackDatas) {
			if (trackData.type === 'subtitle' && trackData.track.source._codec === 'webvtt') {
				await this.processWebVTTCues(trackData, Infinity);
			}
		}

		if (this.fastStart === 'fragmented') {
			for (const trackData of this.trackDatas) {
				for (const sample of trackData.sampleQueue) {
					await this.addSampleToTrack(trackData, sample);
				}

				this.processTimestamps(trackData);
			}

			await this.finalizeFragment(false); // Don't flush the last fragment as we will flush it with the mfra box
		} else {
			for (const trackData of this.trackDatas) {
				this.processTimestamps(trackData);
				await this.finalizeCurrentChunk(trackData);
			}
		}

		if (this.fastStart === 'in-memory') {
			assert(this.mdat);
			let mdatSize: number;

			// We know how many chunks there are, but computing the chunk positions requires an iterative approach:
			// In order to know where the first chunk should go, we first need to know the size of the moov box. But we
			// cannot write a proper moov box without first knowing all chunk positions. So, we generate a tentative
			// moov box with placeholder values (0) for the chunk offsets to be able to compute its size. If it then
			// turns out that appending all chunks exceeds 4 GiB, we need to repeat this process, now with the co64 box
			// being used in the moov box instead, which will make it larger. After that, we definitely know the final
			// size of the moov box and can compute the proper chunk positions.

			for (let i = 0; i < 2; i++) {
				const movieBox = moov(this.trackDatas, this.creationTime);
				const movieBoxSize = this.boxWriter.measureBox(movieBox);
				mdatSize = this.boxWriter.measureBox(this.mdat);
				let currentChunkPos = this.writer.getPos() + movieBoxSize + mdatSize;

				for (const chunk of this.finalizedChunks) {
					chunk.offset = currentChunkPos;
					for (const { data } of chunk.samples) {
						assert(data);
						currentChunkPos += data.byteLength;
						mdatSize += data.byteLength;
					}
				}

				if (currentChunkPos < 2 ** 32) break;
				if (mdatSize >= 2 ** 32) this.mdat.largeSize = true;
			}

			const movieBox = moov(this.trackDatas, this.creationTime);
			this.boxWriter.writeBox(movieBox);

			this.mdat.size = mdatSize!;
			this.boxWriter.writeBox(this.mdat);

			for (const chunk of this.finalizedChunks) {
				for (const sample of chunk.samples) {
					assert(sample.data);
					this.writer.write(sample.data);
					sample.data = null;
				}
			}
		} else if (this.fastStart === 'fragmented') {
			// Append the mfra box to the end of the file for better random access
			const startPos = this.writer.getPos();
			const mfraBox = mfra(this.trackDatas);
			this.boxWriter.writeBox(mfraBox);

			// Patch the 'size' field of the mfro box at the end of the mfra box now that we know its actual size
			const mfraBoxSize = this.writer.getPos() - startPos;
			this.writer.seek(this.writer.getPos() - 4);
			this.boxWriter.writeU32(mfraBoxSize);
		} else {
			assert(this.mdat);
			assert(this.ftypSize !== null);

			const mdatPos = this.boxWriter.offsets.get(this.mdat);
			assert(mdatPos !== undefined);
			const mdatSize = this.writer.getPos() - mdatPos;
			this.mdat.size = mdatSize;
			this.mdat.largeSize = mdatSize >= 2 ** 32; // Only use the large size if we need it
			this.boxWriter.patchBox(this.mdat);

			const movieBox = moov(this.trackDatas, this.creationTime);

			if (typeof this.fastStart === 'object') {
				this.writer.seek(this.ftypSize);
				this.boxWriter.writeBox(movieBox);

				const remainingBytes = mdatPos - this.writer.getPos();
				this.boxWriter.writeBox(free(remainingBytes));
			} else {
				this.boxWriter.writeBox(movieBox);
			}
		}

		release();
	}
}
