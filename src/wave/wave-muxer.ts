import { Muxer } from '../muxer';
import { Output, OutputAudioTrack } from '../output';
import { EncodedAudioSample } from '../sample';
import { parsePcmCodec, PcmAudioCodec } from '../codec';
import { WaveFormat } from './wave-demuxer';
import { Writer } from '../writer';

export class WaveMuxer extends Muxer {
	private riffWriter: RiffWriter;
	private headerWritten = false;
	private dataSize = 0;

	constructor(output: Output) {
		super(output);
		this.riffWriter = new RiffWriter(output._writer);
	}

	async start() {
		// Nothing needed here - we'll write the header with the first sample
	}

	async addEncodedVideoSample() {
		throw new Error('WAVE format does not support video.');
	}

	async addEncodedAudioSample(
		track: OutputAudioTrack,
		sample: EncodedAudioSample,
		meta?: EncodedAudioChunkMetadata,
	) {
		const release = await this.mutex.acquire();

		try {
			if (!this.headerWritten) {
				if (!meta?.decoderConfig) {
					throw new Error('Decoder config is required for first audio sample.');
				}

				this.writeHeader(track, meta.decoderConfig);
				this.headerWritten = true;
			}

			this.validateAndNormalizeTimestamp(track, sample.timestamp, sample.type === 'key');

			if (sample.data) {
				this.output._writer.write(sample.data);
				this.dataSize += sample.data.byteLength;
			}

			await this.output._writer.flush();
		} finally {
			release();
		}
	}

	async addSubtitleCue() {
		throw new Error('WAVE format does not support subtitles.');
	}

	private writeHeader(track: OutputAudioTrack, config: AudioDecoderConfig) {
		const codec = track.source._codec;
		let format: WaveFormat;
		let sampleSize: number;

		const pcmInfo = parsePcmCodec(codec as PcmAudioCodec);

		if (pcmInfo.dataType === 'ulaw') {
			format = WaveFormat.MULAW;
			sampleSize = 1;
		} else if (pcmInfo.dataType === 'alaw') {
			format = WaveFormat.ALAW;
			sampleSize = 1;
		} else {
			format = pcmInfo.dataType === 'float' ? WaveFormat.IEEE_FLOAT : WaveFormat.PCM;
			sampleSize = pcmInfo.sampleSize;
		}

		const channels = config.numberOfChannels;
		const sampleRate = config.sampleRate;
		const blockSize = sampleSize * channels;

		this.riffWriter.writeHeader(format, channels, sampleRate, blockSize, sampleSize);
	}

	async finalize() {
		this.riffWriter.patchSizes(this.dataSize);
	}
}

class RiffWriter {
	private helper = new Uint8Array(8);
	private helperView = new DataView(this.helper.buffer);

	constructor(private writer: Writer) {}

	writeU32(value: number) {
		this.helperView.setUint32(0, value, true);
		this.writer.write(this.helper.subarray(0, 4));
	}

	writeU16(value: number) {
		this.helperView.setUint16(0, value, true);
		this.writer.write(this.helper.subarray(0, 2));
	}

	writeAscii(text: string) {
		this.writer.write(new TextEncoder().encode(text));
	}

	writeHeader(format: WaveFormat, channels: number, sampleRate: number, blockSize: number, bytesPerSample: number) {
		// RIFF header
		this.writeAscii('RIFF');
		this.writeU32(0); // File size placeholder
		this.writeAscii('WAVE');

		// fmt chunk
		this.writeAscii('fmt ');
		this.writeU32(16); // Chunk size
		this.writeU16(format);
		this.writeU16(channels);
		this.writeU32(sampleRate);
		this.writeU32(sampleRate * blockSize); // Bytes per second
		this.writeU16(blockSize);
		this.writeU16(8 * bytesPerSample);

		// data chunk
		this.writeAscii('data');
		this.writeU32(0); // Data size placeholder
	}

	patchSizes(dataSize: number) {
		const currentPos = this.writer.getPos();

		// Write file size
		this.writer.seek(4);
		this.writeU32(dataSize + 36); // File size - 8

		// Write data chunk size
		this.writer.seek(40);
		this.writeU32(dataSize);

		this.writer.seek(currentPos);
	}
}
