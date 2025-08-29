/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { FileSlice, readAscii, readI32Be, readU32Be, readU64Be, readU8 } from '../reader';

export const MIN_BOX_HEADER_SIZE = 8;
export const MAX_BOX_HEADER_SIZE = 16;

export const readBoxHeader = (slice: FileSlice) => {
	let totalSize = readU32Be(slice);
	const name = readAscii(slice, 4);
	let headerSize = 8;

	const hasLargeSize = totalSize === 1;
	if (hasLargeSize) {
		totalSize = readU64Be(slice);
		headerSize = 16;
	}

	const contentSize = totalSize - headerSize;
	if (contentSize < 0) {
		return null; // Hardly a box is it
	}

	return { name, totalSize, headerSize, contentSize };
};

export const readFixed_16_16 = (slice: FileSlice) => {
	return readI32Be(slice) / 0x10000;
};

export const readFixed_2_30 = (slice: FileSlice) => {
	return readI32Be(slice) / 0x40000000;
};

export const readIsomVariableInteger = (slice: FileSlice) => {
	let result = 0;

	for (let i = 0; i < 4; i++) {
		result <<= 7;
		const nextByte = readU8(slice);
		result |= nextByte & 0x7f;

		if ((nextByte & 0x80) === 0) {
			break;
		}
	}

	return result;
};
