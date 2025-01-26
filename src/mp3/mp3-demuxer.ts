import { AudioCodec } from '../codec';
import { Demuxer } from '../demuxer';
import { Input } from '../input';
import { InputAudioTrack, InputAudioTrackBacking } from '../input-track';
import { SampleRetrievalOptions } from '../media-sink';
import { assert, binarySearchExact, binarySearchLessOrEqual, last, UNDETERMINED_LANGUAGE } from '../misc';
import { EncodedAudioSample, PLACEHOLDER_DATA } from '../sample';
import { FrameHeader, Mp3Reader } from './mp3-reader';

const AUDIO_SAMPLES_PER_FRAME = 1152;

type Sample = {
	timestamp: number;
	duration: number;
	dataStart: number;
	dataSize: number;
};

export class Mp3Demuxer extends Demuxer {
	reader: Mp3Reader;

	metadataPromise: Promise<void> | null = null;
	firstFrameHeader: FrameHeader | null = null;
	allSamples: Sample[] = [];

	tracks: InputAudioTrack[] = [];

	constructor(input: Input) {
		super(input);

		this.reader = new Mp3Reader(input._mainReader);
	}

	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			const fileSize = await this.input._source._getSize();
			this.reader.fileSize = fileSize;

			// Just load the entire file. Primitive, but the only way to actually ensure 100% correct timestamps.
			// Random access in MP3 can be flaky and unreliable.
			await this.reader.reader.loadRange(0, fileSize);

			const id3Tag = this.reader.readId3();
			if (id3Tag) {
				this.reader.pos += id3Tag.size;
			}

			let nextTimestamp = 0;

			// Let's read all samples
			while (true) {
				const header = this.reader.readNextFrameHeader();
				if (!header) {
					break;
				}

				const xingOffset = header.mpegVersionId === 3
					? (header.channelCount === 1 ? 21 : 36)
					: (header.channelCount === 1 ? 13 : 21);
				this.reader.pos = header.startPos + xingOffset;
				const word = this.reader.readU32();
				const isXing = word === 0x58696e67 // 'Xing'
					|| word === 0x496e666f; // 'Info'

				this.reader.pos = header.startPos + header.totalSize - 1; // -1 in case the frame is 1 byte too short

				if (isXing) {
					// There's no actual audio data in this frame, so let's skip it
					continue;
				}

				if (!this.firstFrameHeader) {
					this.firstFrameHeader = header;
				}

				const sampleDuration = AUDIO_SAMPLES_PER_FRAME / header.sampleRate;
				const sample: Sample = {
					timestamp: nextTimestamp,
					duration: sampleDuration,
					dataStart: header.startPos,
					dataSize: header.totalSize,
				};

				this.allSamples.push(sample);
				nextTimestamp += sampleDuration;
			}

			if (!this.firstFrameHeader) {
				throw new Error('No MP3 frames found.');
			}

			this.tracks = [new InputAudioTrack(new Mp3AudioTrackBacking(this))];
		})();
	}

	async getMimeType() {
		return 'audio/mpeg';
	}

	async getTracks() {
		await this.readMetadata();
		return this.tracks;
	}

	async computeDuration() {
		await this.readMetadata();

		const lastSample = last(this.allSamples);
		assert(lastSample);

		return lastSample.timestamp + lastSample.duration;
	}
}

class Mp3AudioTrackBacking implements InputAudioTrackBacking {
	constructor(public demuxer: Mp3Demuxer) {}

	getId() {
		return 1;
	}

	async getFirstTimestamp() {
		return 0;
	}

	computeDuration() {
		return this.demuxer.computeDuration();
	}

	async getLanguageCode() {
		return UNDETERMINED_LANGUAGE;
	}

	async getCodec(): Promise<AudioCodec> {
		return 'mp3';
	}

	async getNumberOfChannels() {
		assert(this.demuxer.firstFrameHeader);
		return this.demuxer.firstFrameHeader.channelCount;
	}

	async getSampleRate() {
		assert(this.demuxer.firstFrameHeader);
		return this.demuxer.firstFrameHeader.sampleRate;
	}

	async getDecoderConfig(): Promise<AudioDecoderConfig> {
		assert(this.demuxer.firstFrameHeader);

		return {
			codec: 'mp3',
			numberOfChannels: this.demuxer.firstFrameHeader.channelCount,
			sampleRate: this.demuxer.firstFrameHeader.sampleRate,
		};
	}

	getSampleAtIndex(sampleIndex: number, options: SampleRetrievalOptions) {
		if (sampleIndex === -1) {
			return null;
		}

		const rawSample = this.demuxer.allSamples[sampleIndex];
		if (!rawSample) {
			return null;
		}

		let data: Uint8Array;
		if (options.metadataOnly) {
			data = PLACEHOLDER_DATA;
		} else {
			this.demuxer.reader.pos = rawSample.dataStart;
			data = this.demuxer.reader.readBytes(rawSample.dataSize);
		}

		return new EncodedAudioSample(
			data,
			'key',
			rawSample.timestamp,
			rawSample.duration,
		);
	}

	async getFirstSample(options: SampleRetrievalOptions) {
		return this.getSampleAtIndex(0, options);
	}

	async getNextSample(sample: EncodedAudioSample, options: SampleRetrievalOptions) {
		const sampleIndex = binarySearchExact(
			this.demuxer.allSamples,
			sample.timestamp,
			x => x.timestamp,
		);
		if (sampleIndex === -1) {
			throw new Error('Sample was not created from this track.');
		}

		return this.getSampleAtIndex(sampleIndex + 1, options);
	}

	async getSample(timestamp: number, options: SampleRetrievalOptions) {
		const index = binarySearchLessOrEqual(
			this.demuxer.allSamples,
			timestamp,
			x => x.timestamp,
		);
		return this.getSampleAtIndex(index, options);
	}

	getKeySample(timestamp: number, options: SampleRetrievalOptions) {
		return this.getSample(timestamp, options);
	}

	getNextKeySample(sample: EncodedAudioSample, options: SampleRetrievalOptions) {
		return this.getNextSample(sample, options);
	}
}
