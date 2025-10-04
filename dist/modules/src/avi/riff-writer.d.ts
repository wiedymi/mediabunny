/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { Writer } from '../writer.js';
export declare class RIFFWriter {
    private writer;
    private isRIFX;
    constructor(writer: Writer, isRIFX?: boolean);
    writeString(str: string): void;
    writeFourCC(fourcc: string): void;
    writeUint32(value: number): void;
    writeUint16(value: number): void;
    writeInt32(value: number): void;
    writeInt16(value: number): void;
    writeBytes(data: Uint8Array): void;
    writePadding(): void;
    startList(fourcc: string): number;
    endList(sizePos: number): void;
    startChunk(fourcc: string): number;
    endChunk(sizePos: number): void;
}
//# sourceMappingURL=riff-writer.d.ts.map