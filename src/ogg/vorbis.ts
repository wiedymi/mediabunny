import { readBits } from '../misc';

class Bitstream {
	bytes: Uint8Array;
	pos: number;

	constructor(bytes: Uint8Array) {
		this.bytes = bytes;
		this.pos = 0;
	}

	read(n: number): number {
		const result = readBits(this.bytes, this.pos, this.pos + n);
		this.pos += n;
		return result;
	}

	skip(n: number): void {
		this.pos += n;
	}

	getBitsLeft(): number {
		return this.bytes.length * 8 - this.pos;
	}

	getBitCount(): number {
		return this.pos;
	}

	clone(): Bitstream {
		const clone = new Bitstream(this.bytes);
		clone.pos = this.pos;
		return clone;
	}
}

// Based on vorbis_parser.c from FFmpeg.
export const parseModesFromSetupPacket = (setupHeader: Uint8Array) => {
	// Verify that this is a Setup header.
	if (setupHeader.length < 7) {
		throw new Error('Setup header is too short.');
	}
	if (setupHeader[0] !== 5) {
		throw new Error('Wrong packet type in Setup header.');
	}
	const signature = String.fromCharCode(...setupHeader.slice(1, 7));
	if (signature !== 'vorbis') {
		throw new Error('Invalid packet signature in Setup header.');
	}

	// Reverse the entire buffer.
	const bufSize = setupHeader.length;
	const revBuffer = new Uint8Array(bufSize);
	for (let i = 0; i < bufSize; i++) {
		revBuffer[i] = setupHeader[bufSize - 1 - i]!;
	}

	// Initialize a Bitstream on the reversed buffer.
	const bs = new Bitstream(revBuffer);

	// --- Find the framing bit.
	// In FFmpeg code, we scan until get_bits1() returns 1.
	let gotFramingBit = 0;
	while (bs.getBitsLeft() > 97) {
		if (bs.read(1) === 1) {
			gotFramingBit = bs.getBitCount();
			break;
		}
	}
	if (gotFramingBit === 0) {
		throw new Error('Invalid Setup header: framing bit not found.');
	}

	// --- Search backwards for a valid mode header.
	// We try to “guess” the number of modes by reading a fixed pattern.
	let modeCount = 0;
	let gotModeHeader = false;
	let lastModeCount = 0;
	while (bs.getBitsLeft() >= 97) {
		const tempPos = bs.pos;
		const a = bs.read(8);
		const b = bs.read(16);
		const c = bs.read(16);
		// If a > 63 or b or c nonzero, assume we’ve gone too far.
		if (a > 63 || b !== 0 || c !== 0) {
			bs.pos = tempPos;
			break;
		}
		bs.skip(1);
		modeCount++;
		if (modeCount > 64)
			break;
		const bsClone = bs.clone();
		const candidate = bsClone.read(6) + 1;
		if (candidate === modeCount) {
			gotModeHeader = true;
			lastModeCount = modeCount;
		}
	}
	if (!gotModeHeader) {
		throw new Error('Invalid Setup header: mode header not found.');
	}
	if (lastModeCount > 63) {
		throw new Error(`Unsupported mode count: ${lastModeCount}.`);
	}
	const finalModeCount = lastModeCount;

	// --- Reinitialize the bitstream.
	bs.pos = 0;
	// Skip the bits up to the found framing bit.
	bs.skip(gotFramingBit);

	// --- Now read, for each mode (in reverse order), 40 bits then one bit.
	// That one bit is the mode blockflag.
	const modeBlockflags = Array(finalModeCount).fill(0) as	number[];
	for (let i = finalModeCount - 1; i >= 0; i--) {
		bs.skip(40);
		modeBlockflags[i] = bs.read(1);
	}

	return { modeBlockflags };
};
