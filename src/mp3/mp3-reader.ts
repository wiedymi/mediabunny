import { assert } from '../misc';
import { Reader } from '../reader';

const FRAME_HEADER_SIZE = 4;

// These are in kbps:
const MPEG_V1_BITRATES: Record<number, number[]> = {
	// Layer 3
	1: [-1, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1],
	// Layer 2
	2: [-1, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, -1],
	// Layer 1
	3: [-1, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, -1],
};
const MPEG_V2_BITRATES: Record<number, number[]> = {
	// Layer 3
	1: [-1, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, -1],
	// Layer 2
	2: [-1, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1],
	// Layer 1
	3: [-1, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1],
};
const SAMPLING_RATES: Record<number, number[]> = {
	// MPEG Version 2.5
	0: [11025, 12000, 8000, -1],
	// MPEG Version 2 (ISO/IEC 13818-3)
	2: [22050, 24000, 16000, -1],
	// MPEG Version 1 (ISO/IEC 11172-3)
	3: [44100, 48000, 32000, -1],
};

export type FrameHeader = {
	startPos: number;
	mpegVersionId: number;
	bitrate: number;
	sampleRate: number;
	channelCount: number;
	totalSize: number;
	dataStart: number;
	dataSize: number;
};

export class Mp3Reader {
	pos = 0;
	fileSize: number | null = null;

	constructor(public reader: Reader) {}

	readBytes(length: number) {
		const { view, offset } = this.reader.getViewAndOffset(this.pos, this.pos + length);
		this.pos += length;

		return new Uint8Array(view.buffer, offset, length);
	}

	readU16() {
		const { view, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 2);
		this.pos += 2;

		return view.getUint16(offset, false);
	}

	readU32() {
		const { view, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 4);
		this.pos += 4;

		return view.getUint32(offset, false);
	}

	readAscii(length: number) {
		const { view, offset } = this.reader.getViewAndOffset(this.pos, this.pos + length);
		this.pos += length;

		let str = '';
		for (let i = 0; i < length; i++) {
			str += String.fromCharCode(view.getUint8(offset + i));
		}
		return str;
	}

	readId3() {
		const tag = this.readAscii(3);
		if (tag !== 'ID3') {
			this.pos -= 3;
			return null;
		}

		this.pos += 3;

		const size = decodeSynchsafe(this.readU32());
		return { size };
	}

	readNextFrameHeader(until?: number): FrameHeader | null {
		assert(this.fileSize);
		until ??= this.fileSize;

		while (this.pos < until - FRAME_HEADER_SIZE) {
			const startPos = this.pos;
			const word = this.readU32();

			const firstByte = word >>> 24;
			const secondByte = (word >>> 16) & 0xff;
			const thirdByte = (word >>> 8) & 0xff;
			const fourthByte = word & 0xff;

			if (firstByte !== 0xff && secondByte !== 0xff && thirdByte !== 0xff && fourthByte !== 0xff) {
				continue;
			}

			this.pos -= 3; // For when we continue

			if ((secondByte & 0xe0) !== 0xe0) {
				continue;
			}

			const mpegVersionId = (secondByte >> 3) & 0x3;
			const layer = (secondByte >> 1) & 0x3;

			const bitrateIndex = (thirdByte >> 4) & 0xf;
			const frequencyIndex = (thirdByte >> 2) & 0x3;
			const padding = (thirdByte >> 1) & 0x1;

			const channel = (fourthByte >> 6) & 0x3;

			const kilobitRate = mpegVersionId === 3
				? MPEG_V1_BITRATES[layer]?.[bitrateIndex]
				: MPEG_V2_BITRATES[layer]?.[bitrateIndex];
			if (!kilobitRate || kilobitRate === -1) {
				continue;
			}

			const bitrate = kilobitRate * 1000;

			const sampleRate = SAMPLING_RATES[mpegVersionId]?.[frequencyIndex];
			if (!sampleRate || sampleRate === -1) {
				continue;
			}

			const channelCount = channel === 3 ? 1 : 2;

			const frameLength = Math.floor((144 * bitrate / sampleRate) + padding);

			if (this.fileSize - startPos < frameLength) {
				// The frame doesn't fit into the rest of the file
				return null;
			}

			return {
				startPos,
				mpegVersionId,
				bitrate,
				sampleRate,
				channelCount,
				totalSize: frameLength,
				dataStart: startPos + 4,
				dataSize: frameLength - 4,
			};
		}

		return null;
	}
}

export const decodeSynchsafe = (synchsafed: number) => {
	let mask = 0x7f000000;
	let unsynchsafed = 0;

	while (mask !== 0) {
		unsynchsafed >>= 1;
		unsynchsafed |= synchsafed & mask;
		mask >>= 8;
	}

	return unsynchsafed;
};
