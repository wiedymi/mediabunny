import { assert, toDataView } from '../misc';
import { Muxer } from '../muxer';
import { Output, OutputAudioTrack } from '../output';
import { EncodedAudioSample } from '../sample';
import { Writer } from '../writer';
import { getXingOffset, INFO, readFrameHeader, XING } from './mp3-misc';
import { Mp3Writer, XingFrameData } from './mp3-writer';

export class Mp3Muxer extends Muxer {
	private writer: Writer;
	private mp3Writer: Mp3Writer;
	private xingFrameData: XingFrameData | null = null;
	private frameCount = 0;
	private framePositions: number[] = [];

	constructor(output: Output) {
		super(output);

		this.writer = output._writer;
		this.mp3Writer = new Mp3Writer(output._writer);
	}

	async start() {
		// Nothing needed here
	}

	async addEncodedVideoSample() {
		throw new Error('MP3 does not support video.');
	}

	async addEncodedAudioSample(
		track: OutputAudioTrack,
		sample: EncodedAudioSample,
	) {
		const release = await this.mutex.acquire();

		try {
			if (!this.xingFrameData) {
				const view = toDataView(sample.data);
				if (view.byteLength < 4) {
					throw new Error('Invalid MP3 header in sample.');
				}

				const word = view.getUint32(0, false);
				const header = readFrameHeader(word, { pos: 0, fileSize: null });
				if (!header) {
					throw new Error('Invalid MP3 header in sample.');
				}

				const xingOffset = getXingOffset(header.mpegVersionId, header.channel);
				if (view.byteLength >= xingOffset + 4) {
					const word = view.getUint32(xingOffset, false);
					const isXing = word === XING || word === INFO;

					if (isXing) {
						// This is not a data frame, so let's completely ignore this sample
						return;
					}
				}

				this.xingFrameData = {
					mpegVersionId: header.mpegVersionId,
					layer: header.layer,
					frequencyIndex: header.frequencyIndex,
					channel: header.channel,
					modeExtension: header.modeExtension,
					copyright: header.copyright,
					original: header.original,
					emphasis: header.emphasis,

					frameCount: null,
					fileSize: null,
					toc: null,
				};

				// Write a Xing frame because this muxer doesn't make any bitrate constraints, meaning we don't know if
				// this will be a constant or variable bitrate file. Therefore, always write the Xing frame.
				this.mp3Writer.writeXingFrame(this.xingFrameData);

				this.frameCount++;
			}

			this.validateAndNormalizeTimestamp(track, sample.timestamp, sample.type === 'key');

			this.framePositions.push(this.writer.getPos());
			this.writer.write(sample.data);
			this.frameCount++;

			await this.writer.flush();
		} finally {
			release();
		}
	}

	async addSubtitleCue() {
		throw new Error('MP3 does not support subtitles.');
	}

	async finalize() {
		if (!this.xingFrameData) {
			return;
		}

		const endPos = this.writer.getPos();

		this.writer.seek(0);

		const toc = new Uint8Array(100);
		for (let i = 0; i < 100; i++) {
			const index = Math.floor(this.framePositions.length * (i / 100));
			assert(index !== -1 && index < this.framePositions.length);

			const byteOffset = this.framePositions[index]!;
			toc[i] = 256 * (byteOffset / endPos);
		}

		this.xingFrameData.frameCount = this.frameCount;
		this.xingFrameData.fileSize = endPos;
		this.xingFrameData.toc = toc;

		this.mp3Writer.writeXingFrame(this.xingFrameData);

		this.writer.seek(endPos);
	}
}
