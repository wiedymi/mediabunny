export function assert(x: unknown): asserts x {
	if (!x) {
		throw new Error('Assertion failed.');
	}
}

export type TransformationMatrix = [number, number, number, number, number, number, number, number, number];

export const last = <T>(arr: T[]) => {
	return arr && arr[arr.length - 1];
};

export const isU32 = (value: number) => {
	return value >= 0 && value < 2**32;
};

export const readBits = (bytes: Uint8Array, start: number, end: number) => {
	let result = 0;

	for (let i = start; i < end; i++) {
		let byteIndex = Math.floor(i / 8);
		let byte = bytes[byteIndex]!;
		let bitIndex = 0b111 - (i & 0b111);
		let bit = (byte & (1 << bitIndex)) >> bitIndex;

		result <<= 1;
		result |= bit;
	}

	return result;
};

export const writeBits = (bytes: Uint8Array, start: number, end: number, value: number) => {
	for (let i = start; i < end; i++) {
		let byteIndex = Math.floor(i / 8);
		let byte = bytes[byteIndex]!;
		let bitIndex = 0b111 - (i & 0b111);

		byte &= ~(1 << bitIndex);
		byte |= ((value & (1 << (end - i - 1))) >> (end - i - 1)) << bitIndex;
		bytes[byteIndex] = byte;
	}
};

export const toUint8Array = (source: AllowSharedBufferSource): Uint8Array => {
	if (source instanceof ArrayBuffer) {
		return new Uint8Array(source);
	} else {
		return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
	}
};

export const textEncoder = new TextEncoder();