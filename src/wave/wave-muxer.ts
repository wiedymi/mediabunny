import { Muxer } from '../muxer';
import { Output, OutputAudioTrack } from '../output';
import { parsePcmCodec, PcmAudioCodec } from '../codec';
import { WaveFormat } from './wave-demuxer';
import { RiffWriter } from './riff-writer';
import { Writer } from '../writer';
import { EncodedPacket } from '../packet';
import { WaveOutputFormat } from '../output-format';

export class WaveMuxer extends Muxer {
	private format: WaveOutputFormat;
	private writer: Writer;
	private riffWriter: RiffWriter;
	private headerWritten = false;
	private dataSize = 0;

	constructor(output: Output, format: WaveOutputFormat) {
		super(output);

		this.format = format;
		this.writer = output._writer;
		this.riffWriter = new RiffWriter(output._writer);
	}

	async start() {
		// Nothing needed here - we'll write the header with the first sample
	}

	async addEncodedVideoPacket() {
		throw new Error('WAVE does not support video.');
	}

	async addEncodedAudioPacket(
		track: OutputAudioTrack,
		packet: EncodedPacket,
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

			this.validateAndNormalizeTimestamp(track, packet.timestamp, packet.type === 'key');

			this.writer.write(packet.data);
			this.dataSize += packet.data.byteLength;

			await this.writer.flush();
		} finally {
			release();
		}
	}

	async addSubtitleCue() {
		throw new Error('WAVE does not support subtitles.');
	}

	private writeHeader(track: OutputAudioTrack, config: AudioDecoderConfig) {
		if (this.format._options.onHeader) {
			this.writer.startTrackingWrites();
		}

		let format: WaveFormat;

		const codec = track.source._codec;
		const pcmInfo = parsePcmCodec(codec as PcmAudioCodec);

		if (pcmInfo.dataType === 'ulaw') {
			format = WaveFormat.MULAW;
		} else if (pcmInfo.dataType === 'alaw') {
			format = WaveFormat.ALAW;
		} else if (pcmInfo.dataType === 'float') {
			format = WaveFormat.IEEE_FLOAT;
		} else {
			format = WaveFormat.PCM;
		}

		const channels = config.numberOfChannels;
		const sampleRate = config.sampleRate;
		const blockSize = pcmInfo.sampleSize * channels;

		// RIFF header
		this.riffWriter.writeAscii('RIFF');
		this.riffWriter.writeU32(0); // File size placeholder
		this.riffWriter.writeAscii('WAVE');

		// fmt chunk
		this.riffWriter.writeAscii('fmt ');
		this.riffWriter.writeU32(16); // Chunk size
		this.riffWriter.writeU16(format);
		this.riffWriter.writeU16(channels);
		this.riffWriter.writeU32(sampleRate);
		this.riffWriter.writeU32(sampleRate * blockSize); // Bytes per second
		this.riffWriter.writeU16(blockSize);
		this.riffWriter.writeU16(8 * pcmInfo.sampleSize);

		// data chunk
		this.riffWriter.writeAscii('data');
		this.riffWriter.writeU32(0); // Data size placeholder

		if (this.format._options.onHeader) {
			const { data, start } = this.writer.stopTrackingWrites();
			this.format._options.onHeader(data, start);
		}
	}

	async finalize() {
		const release = await this.mutex.acquire();

		const endPos = this.writer.getPos();

		// Write file size
		this.writer.seek(4);
		this.riffWriter.writeU32(this.dataSize + 36); // File size - 8

		// Write data chunk size
		this.writer.seek(40);
		this.riffWriter.writeU32(this.dataSize);

		this.writer.seek(endPos);

		release();
	}
}
