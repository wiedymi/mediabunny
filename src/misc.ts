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
