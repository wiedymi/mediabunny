import { parseOpusTocByte } from '../codec';
import { assert, Bitstream, ilog, toDataView } from '../misc';

export const OGGS = 0x5367674f; // 'OggS'

const OGG_CRC_POLYNOMIAL = 0x04c11db7;
const OGG_CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let crc = n << 24;

	for (let k = 0; k < 8; k++) {
		crc = (crc & 0x80000000)
			? ((crc << 1) ^ OGG_CRC_POLYNOMIAL)
			: (crc << 1);
	}

	OGG_CRC_TABLE[n] = (crc >>> 0) & 0xffffffff;
}

export const computeOggPageCrc = (bytes: Uint8Array) => {
	const view = toDataView(bytes);

	const originalChecksum = view.getUint32(22, true);
	view.setUint32(22, 0, true); // Zero out checksum field

	let crc = 0;
	for (let i = 0; i < bytes.length; i++) {
		const byte = bytes[i]!;
		crc = ((crc << 8) ^ OGG_CRC_TABLE[(crc >>> 24) ^ byte]!) >>> 0;
	}

	view.setUint32(22, originalChecksum, true); // Restore checksum field

	return crc;
};

export type OggCodecInfo = {
	codec: 'vorbis' | 'opus' | null;
	vorbisInfo: {
		blocksizes: number[];
		modeBlockflags: number[];
	} | null;
	opusInfo: {
		preSkip: number;
	} | null;
};

export const extractSampleMetadata = (
	data: Uint8Array,
	codecInfo: OggCodecInfo,
	vorbisLastBlocksize: number | null,
) => {
	let durationInSamples = 0;
	let currentBlocksize: number | null = null;

	if (data.length > 0) {
		// To know sample duration, we'll need to peak inside the packet
		if (codecInfo.codec === 'vorbis') {
			assert(codecInfo.vorbisInfo);

			const vorbisModeCount = codecInfo.vorbisInfo.modeBlockflags.length;
			const bitCount = ilog(vorbisModeCount - 1);
			const modeMask = ((1 << bitCount) - 1) << 1;
			const modeNumber = (data[0]! & modeMask) >> 1;

			if (modeNumber >= codecInfo.vorbisInfo.modeBlockflags.length) {
				throw new Error('Invalid mode number.');
			}

			// In Vorbis, packet duration also depends on the blocksize of the previous packet
			let prevBlocksize = vorbisLastBlocksize;

			const blockflag = codecInfo.vorbisInfo.modeBlockflags[modeNumber]!;
			currentBlocksize = codecInfo.vorbisInfo.blocksizes[blockflag]!;

			if (blockflag === 1) {
				const prevMask = (modeMask | 0x1) + 1;
				const flag = data[0]! & prevMask ? 1 : 0;
				prevBlocksize = codecInfo.vorbisInfo.blocksizes[flag]!;
			}

			durationInSamples = prevBlocksize !== null
				? (prevBlocksize + currentBlocksize) >> 2
				: 0; // The first sample outputs no audio data and therefore has a duration of 0
		} else if (codecInfo.codec === 'opus') {
			const toc = parseOpusTocByte(data);
			durationInSamples = toc.durationInSamples;
		}
	}

	return {
		durationInSamples,
		vorbisBlockSize: currentBlocksize,
	};
};

// Based on vorbis_parser.c from FFmpeg.
export const parseModesFromVorbisSetupPacket = (setupHeader: Uint8Array) => {
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
	const bitstream = new Bitstream(revBuffer);

	// --- Find the framing bit.
	// In FFmpeg code, we scan until get_bits1() returns 1.
	let gotFramingBit = 0;
	while (bitstream.getBitsLeft() > 97) {
		if (bitstream.readBits(1) === 1) {
			gotFramingBit = bitstream.pos;
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
	while (bitstream.getBitsLeft() >= 97) {
		const tempPos = bitstream.pos;
		const a = bitstream.readBits(8);
		const b = bitstream.readBits(16);
		const c = bitstream.readBits(16);
		// If a > 63 or b or c nonzero, assume we’ve gone too far.
		if (a > 63 || b !== 0 || c !== 0) {
			bitstream.pos = tempPos;
			break;
		}
		bitstream.skipBits(1);
		modeCount++;
		if (modeCount > 64) {
			break;
		}
		const bsClone = bitstream.clone();
		const candidate = bsClone.readBits(6) + 1;
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
	bitstream.pos = 0;
	// Skip the bits up to the found framing bit.
	bitstream.skipBits(gotFramingBit);

	// --- Now read, for each mode (in reverse order), 40 bits then one bit.
	// That one bit is the mode blockflag.
	const modeBlockflags = Array(finalModeCount).fill(0) as	number[];
	for (let i = finalModeCount - 1; i >= 0; i--) {
		bitstream.skipBits(40);
		modeBlockflags[i] = bitstream.readBits(1);
	}

	return { modeBlockflags };
};
