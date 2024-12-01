export function assert(x: unknown): asserts x {
	if (!x) {
		throw new Error('Assertion failed.');
	}
}

/** @public */
export type TransformationMatrix = [number, number, number, number, number, number, number, number, number];

export const last = <T>(arr: T[]) => {
	return arr && arr[arr.length - 1];
};

export const isU32 = (value: number) => {
	return value >= 0 && value < 2 ** 32;
};

export const readBits = (bytes: Uint8Array, start: number, end: number) => {
	let result = 0;

	for (let i = start; i < end; i++) {
		const byteIndex = Math.floor(i / 8);
		const byte = bytes[byteIndex]!;
		const bitIndex = 0b111 - (i & 0b111);
		const bit = (byte & (1 << bitIndex)) >> bitIndex;

		result <<= 1;
		result |= bit;
	}

	return result;
};

export const writeBits = (bytes: Uint8Array, start: number, end: number, value: number) => {
	for (let i = start; i < end; i++) {
		const byteIndex = Math.floor(i / 8);
		let byte = bytes[byteIndex]!;
		const bitIndex = 0b111 - (i & 0b111);

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

// These maps are taken from https://www.matroska.org/technical/elements.html,
// which references the tables in ITU-T H.273 - they should be valid for Matroska and ISOBMFF.
export const COLOR_PRIMARIES_MAP: Record<VideoColorPrimaries, number> = {
	bt709: 1, // ITU-R BT.709
	bt470bg: 5, // ITU-R BT.470BG
	smpte170m: 6, // ITU-R BT.601 525 - SMPTE 170M
};
export const TRANSFER_CHARACTERISTICS_MAP: Record<VideoTransferCharacteristics, number> = {
	'bt709': 1, // ITU-R BT.709
	'smpte170m': 6, // SMPTE 170M
	'iec61966-2-1': 13, // IEC 61966-2-1
};
export const MATRIX_COEFFICIENTS_MAP: Record<VideoMatrixCoefficients, number> = {
	rgb: 0, // Identity
	bt709: 1, // ITU-R BT.709
	bt470bg: 5, // ITU-R BT.470BG
	smpte170m: 6, // SMPTE 170M
};

export type RequiredNonNull<T> = {
	[K in keyof T]-?: NonNullable<T[K]>;
};

export const colorSpaceIsComplete = (
	colorSpace: VideoColorSpaceInit | undefined,
): colorSpace is RequiredNonNull<VideoColorSpaceInit> => {
	return (
		!!colorSpace
		&& !!colorSpace.primaries
		&& !!colorSpace.transfer
		&& !!colorSpace.matrix
		&& colorSpace.fullRange !== undefined
	);
};

export const isAllowSharedBufferSource = (x: unknown) => {
	// Quite a mouthful:
	return (
		x instanceof ArrayBuffer
		|| (typeof SharedArrayBuffer !== 'undefined' && x instanceof SharedArrayBuffer)
		|| (ArrayBuffer.isView(x) && !(x instanceof DataView))
	);
};

export class AsyncMutex {
	currentPromise = Promise.resolve();

	async acquire() {
		let resolver: () => void;
		const nextPromise = new Promise<void>((resolve) => {
			resolver = resolve;
		});

		const currentPromiseAlias = this.currentPromise;
		this.currentPromise = nextPromise;

		await currentPromiseAlias;

		return resolver!;
	}
}
