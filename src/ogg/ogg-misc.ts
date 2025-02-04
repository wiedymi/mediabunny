import { toDataView } from '../misc';

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
