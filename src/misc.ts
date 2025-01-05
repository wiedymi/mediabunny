export function assert(x: unknown): asserts x {
	if (!x) {
		throw new Error('Assertion failed.');
	}
}

/** @public */
export type Rotation = 0 | 90 | 180 | 270;

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

const invertObject = <K extends PropertyKey, V extends PropertyKey>(object: Record<K, V>) => {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [value, key])) as Record<V, K>;
};

// These maps are taken from https://www.matroska.org/technical/elements.html,
// which references the tables in ITU-T H.273 - they should be valid for Matroska and ISOBMFF.
export const COLOR_PRIMARIES_MAP: Record<VideoColorPrimaries, number> = {
	bt709: 1, // ITU-R BT.709
	bt470bg: 5, // ITU-R BT.470BG
	smpte170m: 6, // ITU-R BT.601 525 - SMPTE 170M
};
export const COLOR_PRIMARIES_MAP_INVERSE = invertObject(COLOR_PRIMARIES_MAP);

export const TRANSFER_CHARACTERISTICS_MAP: Record<VideoTransferCharacteristics, number> = {
	'bt709': 1, // ITU-R BT.709
	'smpte170m': 6, // SMPTE 170M
	'iec61966-2-1': 13, // IEC 61966-2-1
};
export const TRANSFER_CHARACTERISTICS_MAP_INVERSE = invertObject(TRANSFER_CHARACTERISTICS_MAP);

export const MATRIX_COEFFICIENTS_MAP: Record<VideoMatrixCoefficients, number> = {
	rgb: 0, // Identity
	bt709: 1, // ITU-R BT.709
	bt470bg: 5, // ITU-R BT.470BG
	smpte170m: 6, // SMPTE 170M
};
export const MATRIX_COEFFICIENTS_MAP_INVERSE = invertObject(MATRIX_COEFFICIENTS_MAP);

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

export const rotationMatrix = (rotationInDegrees: Rotation): TransformationMatrix => {
	const theta = rotationInDegrees * (Math.PI / 180);
	const cosTheta = Math.round(Math.cos(theta));
	const sinTheta = Math.round(Math.sin(theta));

	// Matrices are post-multiplied in ISOBMFF, meaning this is the transpose of your typical rotation matrix
	return [
		cosTheta, sinTheta, 0,
		-sinTheta, cosTheta, 0,
		0, 0, 1,
	];
};

export const IDENTITY_MATRIX = rotationMatrix(0);

export const bytesToHexString = (bytes: Uint8Array) => {
	return [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
};

export const reverseBitsU32 = (x: number): number => {
	x = ((x >> 1) & 0x55555555) | ((x & 0x55555555) << 1);
	x = ((x >> 2) & 0x33333333) | ((x & 0x33333333) << 2);
	x = ((x >> 4) & 0x0f0f0f0f) | ((x & 0x0f0f0f0f) << 4);
	x = ((x >> 8) & 0x00ff00ff) | ((x & 0x00ff00ff) << 8);
	x = ((x >> 16) & 0x0000ffff) | ((x & 0x0000ffff) << 16);
	return x >>> 0; // Ensure it's treated as an unsigned 32-bit integer
};

export const binarySearchExact = <T>(arr: T[], key: number, valueGetter: (x: T) => number): number => {
	let low = 0;
	let high = arr.length - 1;
	let res = -1;

	while (low <= high) {
		const mid = (low + high) >> 1;
		const midVal = valueGetter(arr[mid]!);

		if (midVal === key) {
			res = mid;
			high = mid - 1; // Continue searching left to find the lowest index
		} else if (midVal < key) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return res;
};

export const binarySearchLessOrEqual = <T>(arr: T[], key: number, valueGetter: (x: T) => number) => {
	let ans = -1;
	let low = 0;
	let high = arr.length - 1;

	while (low <= high) {
		const mid = (low + (high - low + 1) / 2) | 0;
		const midVal = valueGetter(arr[mid]!);

		if (midVal <= key) {
			ans = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return ans;
};

export const promiseWithResolvers = <T = void>() => {
	let resolve: (value: T) => void;
	let reject: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve: resolve!, reject: reject! };
};

export const removeItem = <T>(arr: T[], item: T) => {
	const index = arr.indexOf(item);
	if (index !== -1) {
		arr.splice(index, 1);
	}
};

export const findLastIndex = <T>(arr: T[], predicate: (x: T) => boolean) => {
	for (let i = arr.length - 1; i >= 0; i--) {
		if (predicate(arr[i]!)) {
			return i;
		}
	}

	return -1;
};

/** @public */
export type AnyIterable<T> =
	| Iterable<T>
	| AsyncIterable<T>;

export const toAsyncIterator = async function* <T>(source: AnyIterable<T>): AsyncGenerator<T, void, unknown> {
	if (Symbol.iterator in source) {
		// @ts-expect-error Trust me
		yield* source[Symbol.iterator]();
	} else {
		// @ts-expect-error Trust me
		yield* source[Symbol.asyncIterator]();
	}
};

export const validateAnyIterable = (iterable: AnyIterable<unknown>) => {
	if (!(Symbol.iterator in iterable) && !(Symbol.asyncIterator in iterable)) {
		throw new TypeError('Argument must be an iterable or async iterable.');
	}
};

export const assertNever = (x: never) => {
	// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
	throw new Error(`Unexpected value: ${x}`);
};

export const getUint24 = (view: DataView, byteOffset: number, littleEndian: boolean) => {
	const byte1 = view.getUint8(byteOffset);
	const byte2 = view.getUint8(byteOffset + 1);
	const byte3 = view.getUint8(byteOffset + 2);

	if (littleEndian) {
		return byte1 | (byte2 << 8) | (byte3 << 16);
	} else {
		return (byte1 << 16) | (byte2 << 8) | byte3;
	}
};

export const getInt24 = (view: DataView, byteOffset: number, littleEndian: boolean) => {
	// The left shift pushes the most significant bit into the sign bit region, and the subsequent right shift
	// then correctly interprets the sign bit.
	return getUint24(view, byteOffset, littleEndian) << 8 >> 8;
};

export const setUint24 = (view: DataView, byteOffset: number, value: number, littleEndian: boolean) => {
	// Ensure the value is within 24-bit unsigned range (0 to 16777215)
	value = value >>> 0; // Convert to unsigned 32-bit
	value = value & 0xFFFFFF; // Mask to 24 bits

	if (littleEndian) {
		view.setUint8(byteOffset, value & 0xFF);
		view.setUint8(byteOffset + 1, (value >>> 8) & 0xFF);
		view.setUint8(byteOffset + 2, (value >>> 16) & 0xFF);
	} else {
		view.setUint8(byteOffset, (value >>> 16) & 0xFF);
		view.setUint8(byteOffset + 1, (value >>> 8) & 0xFF);
		view.setUint8(byteOffset + 2, value & 0xFF);
	}
};

export const setInt24 = (view: DataView, byteOffset: number, value: number, littleEndian: boolean) => {
	// Ensure the value is within 24-bit signed range (-8388608 to 8388607)
	value = clamp(value, -8388608, 8388607);

	// Convert negative values to their 24-bit representation
	if (value < 0) {
		value = (value + 0x1000000) & 0xFFFFFF;
	}

	setUint24(view, byteOffset, value, littleEndian);
};

/**
 * Calls a function on each value spat out by an async generator. The reason for writing this manually instead of
 * using a generator function is that the generator function queues return() calls - here, we forward them immediately.
 */
export const mapAsyncGenerator = <T, U>(
	generator: AsyncGenerator<T, void, unknown>,
	map: (t: T) => Promise<U>,
): AsyncGenerator<U, void, unknown> => {
	return {
		async next() {
			const result = await generator.next();
			if (result.done) {
				return { value: undefined, done: true };
			} else {
				return { value: await map(result.value), done: false };
			}
		},
		return() {
			return generator.return() as ReturnType<AsyncGenerator<U, void, unknown>['return']>;
		},
		throw(error) {
			return generator.throw(error) as ReturnType<AsyncGenerator<U, void, unknown>['throw']>;
		},
		[Symbol.asyncIterator]() {
			return this;
		},
	};
};

export const clamp = (value: number, min: number, max: number) => {
	return Math.max(min, Math.min(max, value));
};
