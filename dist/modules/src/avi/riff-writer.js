/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { textEncoder } from '../misc.js';
export class RIFFWriter {
    constructor(writer, isRIFX = false) {
        this.isRIFX = false; // Big-endian variant
        this.writer = writer;
        this.isRIFX = isRIFX;
    }
    writeString(str) {
        this.writer.write(textEncoder.encode(str));
    }
    writeFourCC(fourcc) {
        const buffer = new Uint8Array(4);
        for (let i = 0; i < 4 && i < fourcc.length; i++) {
            buffer[i] = fourcc.charCodeAt(i);
        }
        this.writer.write(buffer);
    }
    writeUint32(value) {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setUint32(0, value, !this.isRIFX);
        this.writer.write(new Uint8Array(buffer));
    }
    writeUint16(value) {
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);
        view.setUint16(0, value, !this.isRIFX);
        this.writer.write(new Uint8Array(buffer));
    }
    writeInt32(value) {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setInt32(0, value, !this.isRIFX);
        this.writer.write(new Uint8Array(buffer));
    }
    writeInt16(value) {
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);
        view.setInt16(0, value, !this.isRIFX);
        this.writer.write(new Uint8Array(buffer));
    }
    writeBytes(data) {
        this.writer.write(data);
    }
    writePadding() {
        // RIFF chunks must be word-aligned
        if (this.writer.getPos() % 2 !== 0) {
            this.writer.write(new Uint8Array(1));
        }
    }
    startList(fourcc) {
        this.writeFourCC('LIST');
        const sizePos = this.writer.getPos();
        this.writeUint32(0); // Size placeholder
        this.writeFourCC(fourcc);
        return sizePos;
    }
    endList(sizePos) {
        const currentPos = this.writer.getPos();
        const size = currentPos - sizePos - 8;
        this.writer.seek(sizePos);
        this.writeUint32(size);
        this.writer.seek(currentPos);
    }
    startChunk(fourcc) {
        this.writeFourCC(fourcc);
        const sizePos = this.writer.getPos();
        this.writeUint32(0); // Size placeholder
        return sizePos;
    }
    endChunk(sizePos) {
        const currentPos = this.writer.getPos();
        const size = currentPos - sizePos - 4;
        this.writer.seek(sizePos);
        this.writeUint32(size);
        this.writer.seek(currentPos);
        this.writePadding();
    }
}
