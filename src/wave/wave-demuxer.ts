import { AudioCodec } from '../codec';
import { Demuxer } from '../demuxer';
import { Input } from '../input';
import { InputAudioTrack, InputAudioTrackBacking } from '../input-track';
import { SampleRetrievalOptions } from '../media-sink';
import { assert, UNDETERMINED_LANGUAGE } from '../misc';
import { Reader } from '../reader';
import { EncodedAudioSample, PLACEHOLDER_DATA } from '../sample';
import { RiffReader } from './riff-reader';

export enum WaveFormat {
	PCM = 0x0001,
	IEEE_FLOAT = 0x0003,
	ALAW = 0x0006,
	MULAW = 0x0007,
	EXTENSIBLE = 0xFFFE,
}

export class WaveDemuxer extends Demuxer {
	riffReader: RiffReader;
	chunkReader: RiffReader;

	metadataPromise: Promise<void> | null = null;
	dataStart = -1;
	dataSize = -1;
	audioInfo: {
		format: number;
		numberOfChannels: number;
		sampleRate: number;
		sampleSizeInBytes: number;
		blockSizeInBytes: number;
	} | null = null;

	tracks: InputAudioTrack[] = [];

	constructor(input: Input) {
		super(input);

		this.riffReader = new RiffReader(input._mainReader);
		this.chunkReader = new RiffReader(new Reader(input._source, 64 * 2 ** 20));
	}

	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			const riffType = this.riffReader.readAscii(4);
			this.riffReader.littleEndian = riffType === 'RIFF';

			const totalFileSize = this.riffReader.readU32() + 8;
			const format = this.riffReader.readAscii(4);

			if (format !== 'WAVE') {
				throw new Error('Invalid WAVE file - wrong format');
			}

			this.riffReader.pos = 12;
			while (this.riffReader.pos < totalFileSize) {
				await this.riffReader.reader.loadRange(this.riffReader.pos, this.riffReader.pos + 8);

				const chunkId = this.riffReader.readAscii(4);
				const chunkSize = this.riffReader.readU32();
				const startPos = this.riffReader.pos;

				if (chunkId === 'fmt ') {
					await this.parseFmtChunk(chunkSize);
				} else if (chunkId === 'data') {
					this.dataStart = this.riffReader.pos;
					this.dataSize = chunkSize;
				}

				this.riffReader.pos = startPos + chunkSize + (chunkSize & 1); // Handle padding
			}

			if (!this.audioInfo) {
				throw new Error('Invalid WAVE file - missing "fmt " chunk');
			}
			if (this.dataStart === -1) {
				throw new Error('Invalid WAVE file - missing "data" chunk');
			}

			const blockSize = this.audioInfo.blockSizeInBytes;
			this.dataSize = Math.floor(this.dataSize / blockSize) * blockSize;

			this.tracks.push(new InputAudioTrack(new WaveAudioTrackBacking(this)));
		})();
	}

	private async parseFmtChunk(size: number) {
		await this.riffReader.reader.loadRange(this.riffReader.pos, this.riffReader.pos + size);

		let formatTag = this.riffReader.readU16();
		const numChannels = this.riffReader.readU16();
		const sampleRate = this.riffReader.readU32();
		this.riffReader.pos += 4;
		const blockAlign = this.riffReader.readU16();

		let bitsPerSample: number;

		if (size === 14) { // Plain WAVEFORMAT
			bitsPerSample = 8;
		} else {
			bitsPerSample = this.riffReader.readU16();
		}

		// Handle WAVEFORMATEXTENSIBLE
		if (size >= 18 && formatTag !== 0x0165) {
			const cbSize = this.riffReader.readU16();
			const remainingSize = size - 18;
			const extensionSize = Math.min(remainingSize, cbSize);

			if (extensionSize >= 22 && formatTag === WaveFormat.EXTENSIBLE) {
				// Parse WAVEFORMATEXTENSIBLE
				this.riffReader.pos += 2 + 4;
				const subFormat = this.riffReader.readBytes(16);

				// Get actual format from subFormat GUID
				formatTag = subFormat[0]! | (subFormat[1]! << 8);
			}
		}

		if (formatTag === WaveFormat.MULAW || formatTag === WaveFormat.ALAW) {
			bitsPerSample = 8;
		}

		this.audioInfo = {
			format: formatTag,
			numberOfChannels: numChannels,
			sampleRate,
			sampleSizeInBytes: Math.ceil(bitsPerSample / 8),
			blockSizeInBytes: blockAlign,
		};
	}

	getCodec(): AudioCodec | null {
		assert(this.audioInfo);

		if (this.audioInfo.format === WaveFormat.MULAW) {
			return 'ulaw';
		}
		if (this.audioInfo.format === WaveFormat.ALAW) {
			return 'alaw';
		}
		if (this.audioInfo.format === WaveFormat.PCM) {
			// All formats are little-endian
			if (this.audioInfo.sampleSizeInBytes === 1) {
				return 'pcm-u8';
			} else if (this.audioInfo.sampleSizeInBytes === 2) {
				return 'pcm-s16';
			} else if (this.audioInfo.sampleSizeInBytes === 3) {
				return 'pcm-s24';
			} else if (this.audioInfo.sampleSizeInBytes === 4) {
				return 'pcm-s32';
			}
		}
		if (this.audioInfo.format === WaveFormat.IEEE_FLOAT) {
			if (this.audioInfo.sampleSizeInBytes === 4) {
				return 'pcm-f32';
			}
		}

		return null;
	}

	async getMimeType() {
		return 'audio/wav';
	}

	async computeDuration() {
		await this.readMetadata();
		assert(this.audioInfo);

		const numberOfBlocks = this.dataSize / this.audioInfo.blockSizeInBytes;
		return numberOfBlocks / this.audioInfo.sampleRate;
	}

	async getTracks() {
		await this.readMetadata();
		return this.tracks;
	}
}

const SAMPLE_SIZE_IN_FRAMES = 2048;

class WaveAudioTrackBacking implements InputAudioTrackBacking {
	constructor(public demuxer: WaveDemuxer) {}

	getId() {
		return 1;
	}

	async getCodec() {
		return this.demuxer.getCodec();
	}

	async getDecoderConfig(): Promise<AudioDecoderConfig | null> {
		const codec = this.demuxer.getCodec();
		if (!codec) {
			return null;
		}

		assert(this.demuxer.audioInfo);
		return {
			codec,
			numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
			sampleRate: this.demuxer.audioInfo.sampleRate,
		};
	}

	computeDuration() {
		return this.demuxer.computeDuration();
	}

	async getNumberOfChannels() {
		assert(this.demuxer.audioInfo);
		return this.demuxer.audioInfo.numberOfChannels;
	}

	async getSampleRate() {
		assert(this.demuxer.audioInfo);
		return this.demuxer.audioInfo.sampleRate;
	}

	async getLanguageCode() {
		return UNDETERMINED_LANGUAGE;
	}

	async getFirstTimestamp() {
		return 0;
	}

	private async getSampleAtIndex(
		sampleIndex: number,
		options: SampleRetrievalOptions,
	): Promise<EncodedAudioSample | null> {
		assert(this.demuxer.audioInfo);
		const startOffset = sampleIndex * SAMPLE_SIZE_IN_FRAMES * this.demuxer.audioInfo.blockSizeInBytes;
		if (startOffset >= this.demuxer.dataSize) {
			return null;
		}

		const sizeInBytes = Math.min(
			SAMPLE_SIZE_IN_FRAMES * this.demuxer.audioInfo.blockSizeInBytes,
			this.demuxer.dataSize - startOffset,
		);

		let data: Uint8Array;
		if (options.metadataOnly) {
			data = PLACEHOLDER_DATA;
		} else {
			const sizeOfOneSample = SAMPLE_SIZE_IN_FRAMES * this.demuxer.audioInfo.blockSizeInBytes;
			const chunkSize = Math.ceil(2 ** 19 / sizeOfOneSample) * sizeOfOneSample;
			const chunkStart = Math.floor(startOffset / chunkSize) * chunkSize;
			const chunkEnd = chunkStart + chunkSize;

			// Always load large 0.5 MiB chunks instead of just the required sample
			await this.demuxer.chunkReader.reader.loadRange(
				this.demuxer.dataStart + chunkStart,
				this.demuxer.dataStart + chunkEnd,
			);

			this.demuxer.chunkReader.pos = this.demuxer.dataStart + startOffset;
			data = this.demuxer.chunkReader.readBytes(sizeInBytes);
		}

		const timestamp = sampleIndex * SAMPLE_SIZE_IN_FRAMES / this.demuxer.audioInfo.sampleRate;
		const duration = sizeInBytes / this.demuxer.audioInfo.blockSizeInBytes / this.demuxer.audioInfo.sampleRate;

		return new EncodedAudioSample(
			data,
			'key',
			timestamp,
			duration,
		);
	}

	getFirstSample(options: SampleRetrievalOptions) {
		return this.getSampleAtIndex(0, options);
	}

	getSample(timestamp: number, options: SampleRetrievalOptions) {
		assert(this.demuxer.audioInfo);
		const sampleIndex = Math.floor(timestamp * this.demuxer.audioInfo.sampleRate / SAMPLE_SIZE_IN_FRAMES);

		return this.getSampleAtIndex(sampleIndex, options);
	}

	getNextSample(sample: EncodedAudioSample, options: SampleRetrievalOptions) {
		assert(this.demuxer.audioInfo);
		const sampleIndex = Math.round(sample.timestamp * this.demuxer.audioInfo.sampleRate / SAMPLE_SIZE_IN_FRAMES);

		return this.getSampleAtIndex(sampleIndex + 1, options);
	}

	getKeySample(timestamp: number, options: SampleRetrievalOptions) {
		return this.getSample(timestamp, options);
	}

	getNextKeySample(sample: EncodedAudioSample, options: SampleRetrievalOptions) {
		return this.getNextSample(sample, options);
	}
}
