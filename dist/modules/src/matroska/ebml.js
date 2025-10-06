/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { assertNever, textDecoder, textEncoder } from '../misc.js';
import { readBytes, readF32Be, readF64Be, readU8 } from '../reader.js';
/** Wrapper around a number to be able to differentiate it in the writer. */
export class EBMLFloat32 {
    constructor(value) {
        this.value = value;
    }
}
/** Wrapper around a number to be able to differentiate it in the writer. */
export class EBMLFloat64 {
    constructor(value) {
        this.value = value;
    }
}
/** Wrapper around a number to be able to differentiate it in the writer. */
export class EBMLSignedInt {
    constructor(value) {
        this.value = value;
    }
}
export class EBMLUnicodeString {
    constructor(value) {
        this.value = value;
    }
}
/** Defines some of the EBML IDs used by Matroska files. */
export var EBMLId;
(function (EBMLId) {
    EBMLId[EBMLId["EBML"] = 440786851] = "EBML";
    EBMLId[EBMLId["EBMLVersion"] = 17030] = "EBMLVersion";
    EBMLId[EBMLId["EBMLReadVersion"] = 17143] = "EBMLReadVersion";
    EBMLId[EBMLId["EBMLMaxIDLength"] = 17138] = "EBMLMaxIDLength";
    EBMLId[EBMLId["EBMLMaxSizeLength"] = 17139] = "EBMLMaxSizeLength";
    EBMLId[EBMLId["DocType"] = 17026] = "DocType";
    EBMLId[EBMLId["DocTypeVersion"] = 17031] = "DocTypeVersion";
    EBMLId[EBMLId["DocTypeReadVersion"] = 17029] = "DocTypeReadVersion";
    EBMLId[EBMLId["Void"] = 236] = "Void";
    EBMLId[EBMLId["Segment"] = 408125543] = "Segment";
    EBMLId[EBMLId["SeekHead"] = 290298740] = "SeekHead";
    EBMLId[EBMLId["Seek"] = 19899] = "Seek";
    EBMLId[EBMLId["SeekID"] = 21419] = "SeekID";
    EBMLId[EBMLId["SeekPosition"] = 21420] = "SeekPosition";
    EBMLId[EBMLId["Duration"] = 17545] = "Duration";
    EBMLId[EBMLId["Info"] = 357149030] = "Info";
    EBMLId[EBMLId["TimestampScale"] = 2807729] = "TimestampScale";
    EBMLId[EBMLId["MuxingApp"] = 19840] = "MuxingApp";
    EBMLId[EBMLId["WritingApp"] = 22337] = "WritingApp";
    EBMLId[EBMLId["Tracks"] = 374648427] = "Tracks";
    EBMLId[EBMLId["TrackEntry"] = 174] = "TrackEntry";
    EBMLId[EBMLId["TrackNumber"] = 215] = "TrackNumber";
    EBMLId[EBMLId["TrackUID"] = 29637] = "TrackUID";
    EBMLId[EBMLId["TrackType"] = 131] = "TrackType";
    EBMLId[EBMLId["FlagEnabled"] = 185] = "FlagEnabled";
    EBMLId[EBMLId["FlagDefault"] = 136] = "FlagDefault";
    EBMLId[EBMLId["FlagForced"] = 21930] = "FlagForced";
    EBMLId[EBMLId["FlagLacing"] = 156] = "FlagLacing";
    EBMLId[EBMLId["Name"] = 21358] = "Name";
    EBMLId[EBMLId["Language"] = 2274716] = "Language";
    EBMLId[EBMLId["LanguageBCP47"] = 2274717] = "LanguageBCP47";
    EBMLId[EBMLId["CodecID"] = 134] = "CodecID";
    EBMLId[EBMLId["CodecPrivate"] = 25506] = "CodecPrivate";
    EBMLId[EBMLId["CodecDelay"] = 22186] = "CodecDelay";
    EBMLId[EBMLId["SeekPreRoll"] = 22203] = "SeekPreRoll";
    EBMLId[EBMLId["DefaultDuration"] = 2352003] = "DefaultDuration";
    EBMLId[EBMLId["Video"] = 224] = "Video";
    EBMLId[EBMLId["PixelWidth"] = 176] = "PixelWidth";
    EBMLId[EBMLId["PixelHeight"] = 186] = "PixelHeight";
    EBMLId[EBMLId["AlphaMode"] = 21440] = "AlphaMode";
    EBMLId[EBMLId["Audio"] = 225] = "Audio";
    EBMLId[EBMLId["SamplingFrequency"] = 181] = "SamplingFrequency";
    EBMLId[EBMLId["Channels"] = 159] = "Channels";
    EBMLId[EBMLId["BitDepth"] = 25188] = "BitDepth";
    EBMLId[EBMLId["SimpleBlock"] = 163] = "SimpleBlock";
    EBMLId[EBMLId["BlockGroup"] = 160] = "BlockGroup";
    EBMLId[EBMLId["Block"] = 161] = "Block";
    EBMLId[EBMLId["BlockAdditions"] = 30113] = "BlockAdditions";
    EBMLId[EBMLId["BlockMore"] = 166] = "BlockMore";
    EBMLId[EBMLId["BlockAdditional"] = 165] = "BlockAdditional";
    EBMLId[EBMLId["BlockAddID"] = 238] = "BlockAddID";
    EBMLId[EBMLId["BlockDuration"] = 155] = "BlockDuration";
    EBMLId[EBMLId["ReferenceBlock"] = 251] = "ReferenceBlock";
    EBMLId[EBMLId["Cluster"] = 524531317] = "Cluster";
    EBMLId[EBMLId["Timestamp"] = 231] = "Timestamp";
    EBMLId[EBMLId["Cues"] = 475249515] = "Cues";
    EBMLId[EBMLId["CuePoint"] = 187] = "CuePoint";
    EBMLId[EBMLId["CueTime"] = 179] = "CueTime";
    EBMLId[EBMLId["CueTrackPositions"] = 183] = "CueTrackPositions";
    EBMLId[EBMLId["CueTrack"] = 247] = "CueTrack";
    EBMLId[EBMLId["CueClusterPosition"] = 241] = "CueClusterPosition";
    EBMLId[EBMLId["Colour"] = 21936] = "Colour";
    EBMLId[EBMLId["MatrixCoefficients"] = 21937] = "MatrixCoefficients";
    EBMLId[EBMLId["TransferCharacteristics"] = 21946] = "TransferCharacteristics";
    EBMLId[EBMLId["Primaries"] = 21947] = "Primaries";
    EBMLId[EBMLId["Range"] = 21945] = "Range";
    EBMLId[EBMLId["Projection"] = 30320] = "Projection";
    EBMLId[EBMLId["ProjectionType"] = 30321] = "ProjectionType";
    EBMLId[EBMLId["ProjectionPoseRoll"] = 30325] = "ProjectionPoseRoll";
    EBMLId[EBMLId["Attachments"] = 423732329] = "Attachments";
    EBMLId[EBMLId["AttachedFile"] = 24999] = "AttachedFile";
    EBMLId[EBMLId["FileDescription"] = 18046] = "FileDescription";
    EBMLId[EBMLId["FileName"] = 18030] = "FileName";
    EBMLId[EBMLId["FileMediaType"] = 18016] = "FileMediaType";
    EBMLId[EBMLId["FileData"] = 18012] = "FileData";
    EBMLId[EBMLId["FileUID"] = 18094] = "FileUID";
    EBMLId[EBMLId["Chapters"] = 272869232] = "Chapters";
    EBMLId[EBMLId["Tags"] = 307544935] = "Tags";
    EBMLId[EBMLId["Tag"] = 29555] = "Tag";
    EBMLId[EBMLId["Targets"] = 25536] = "Targets";
    EBMLId[EBMLId["TargetTypeValue"] = 26826] = "TargetTypeValue";
    EBMLId[EBMLId["TargetType"] = 25546] = "TargetType";
    EBMLId[EBMLId["TagTrackUID"] = 25541] = "TagTrackUID";
    EBMLId[EBMLId["TagEditionUID"] = 25545] = "TagEditionUID";
    EBMLId[EBMLId["TagChapterUID"] = 25540] = "TagChapterUID";
    EBMLId[EBMLId["TagAttachmentUID"] = 25542] = "TagAttachmentUID";
    EBMLId[EBMLId["SimpleTag"] = 26568] = "SimpleTag";
    EBMLId[EBMLId["TagName"] = 17827] = "TagName";
    EBMLId[EBMLId["TagLanguage"] = 17530] = "TagLanguage";
    EBMLId[EBMLId["TagString"] = 17543] = "TagString";
    EBMLId[EBMLId["TagBinary"] = 17541] = "TagBinary";
    EBMLId[EBMLId["ContentEncodings"] = 28032] = "ContentEncodings";
    EBMLId[EBMLId["ContentEncoding"] = 25152] = "ContentEncoding";
    EBMLId[EBMLId["ContentEncodingOrder"] = 20529] = "ContentEncodingOrder";
    EBMLId[EBMLId["ContentEncodingScope"] = 20530] = "ContentEncodingScope";
    EBMLId[EBMLId["ContentCompression"] = 20532] = "ContentCompression";
    EBMLId[EBMLId["ContentCompAlgo"] = 16980] = "ContentCompAlgo";
    EBMLId[EBMLId["ContentCompSettings"] = 16981] = "ContentCompSettings";
    EBMLId[EBMLId["ContentEncryption"] = 20533] = "ContentEncryption";
})(EBMLId || (EBMLId = {}));
export const LEVEL_0_EBML_IDS = [
    EBMLId.EBML,
    EBMLId.Segment,
];
// All the stuff that can appear in a segment, basically
export const LEVEL_1_EBML_IDS = [
    EBMLId.SeekHead,
    EBMLId.Info,
    EBMLId.Cluster,
    EBMLId.Tracks,
    EBMLId.Cues,
    EBMLId.Attachments,
    EBMLId.Chapters,
    EBMLId.Tags,
];
export const LEVEL_0_AND_1_EBML_IDS = [
    ...LEVEL_0_EBML_IDS,
    ...LEVEL_1_EBML_IDS,
];
export const measureUnsignedInt = (value) => {
    if (value < (1 << 8)) {
        return 1;
    }
    else if (value < (1 << 16)) {
        return 2;
    }
    else if (value < (1 << 24)) {
        return 3;
    }
    else if (value < 2 ** 32) {
        return 4;
    }
    else if (value < 2 ** 40) {
        return 5;
    }
    else {
        return 6;
    }
};
export const measureUnsignedBigInt = (value) => {
    if (value < (1n << 8n)) {
        return 1;
    }
    else if (value < (1n << 16n)) {
        return 2;
    }
    else if (value < (1n << 24n)) {
        return 3;
    }
    else if (value < (1n << 32n)) {
        return 4;
    }
    else if (value < (1n << 40n)) {
        return 5;
    }
    else if (value < (1n << 48n)) {
        return 6;
    }
    else if (value < (1n << 56n)) {
        return 7;
    }
    else {
        return 8;
    }
};
export const measureSignedInt = (value) => {
    if (value >= -(1 << 6) && value < (1 << 6)) {
        return 1;
    }
    else if (value >= -(1 << 13) && value < (1 << 13)) {
        return 2;
    }
    else if (value >= -(1 << 20) && value < (1 << 20)) {
        return 3;
    }
    else if (value >= -(1 << 27) && value < (1 << 27)) {
        return 4;
    }
    else if (value >= -(2 ** 34) && value < 2 ** 34) {
        return 5;
    }
    else {
        return 6;
    }
};
export const measureVarInt = (value) => {
    if (value < (1 << 7) - 1) {
        /** Top bit is set, leaving 7 bits to hold the integer, but we can't store
         * 127 because "all bits set to one" is a reserved value. Same thing for the
         * other cases below:
         */
        return 1;
    }
    else if (value < (1 << 14) - 1) {
        return 2;
    }
    else if (value < (1 << 21) - 1) {
        return 3;
    }
    else if (value < (1 << 28) - 1) {
        return 4;
    }
    else if (value < 2 ** 35 - 1) {
        return 5;
    }
    else if (value < 2 ** 42 - 1) {
        return 6;
    }
    else {
        throw new Error('EBML varint size not supported ' + value);
    }
};
export class EBMLWriter {
    constructor(writer) {
        this.writer = writer;
        this.helper = new Uint8Array(8);
        this.helperView = new DataView(this.helper.buffer);
        /**
         * Stores the position from the start of the file to where EBML elements have been written. This is used to
         * rewrite/edit elements that were already added before, and to measure sizes of things.
         */
        this.offsets = new WeakMap();
        /** Same as offsets, but stores position where the element's data starts (after ID and size fields). */
        this.dataOffsets = new WeakMap();
    }
    writeByte(value) {
        this.helperView.setUint8(0, value);
        this.writer.write(this.helper.subarray(0, 1));
    }
    writeFloat32(value) {
        this.helperView.setFloat32(0, value, false);
        this.writer.write(this.helper.subarray(0, 4));
    }
    writeFloat64(value) {
        this.helperView.setFloat64(0, value, false);
        this.writer.write(this.helper);
    }
    writeUnsignedInt(value, width = measureUnsignedInt(value)) {
        let pos = 0;
        // Each case falls through:
        switch (width) {
            case 6:
                // Need to use division to access >32 bits of floating point var
                this.helperView.setUint8(pos++, (value / 2 ** 40) | 0);
            // eslint-disable-next-line no-fallthrough
            case 5:
                this.helperView.setUint8(pos++, (value / 2 ** 32) | 0);
            // eslint-disable-next-line no-fallthrough
            case 4:
                this.helperView.setUint8(pos++, value >> 24);
            // eslint-disable-next-line no-fallthrough
            case 3:
                this.helperView.setUint8(pos++, value >> 16);
            // eslint-disable-next-line no-fallthrough
            case 2:
                this.helperView.setUint8(pos++, value >> 8);
            // eslint-disable-next-line no-fallthrough
            case 1:
                this.helperView.setUint8(pos++, value);
                break;
            default:
                throw new Error('Bad unsigned int size ' + width);
        }
        this.writer.write(this.helper.subarray(0, pos));
    }
    writeUnsignedBigInt(value, width = measureUnsignedBigInt(value)) {
        let pos = 0;
        for (let i = width - 1; i >= 0; i--) {
            this.helperView.setUint8(pos++, Number((value >> BigInt(i * 8)) & 0xffn));
        }
        this.writer.write(this.helper.subarray(0, pos));
    }
    writeSignedInt(value, width = measureSignedInt(value)) {
        if (value < 0) {
            // Two's complement stuff
            value += 2 ** (width * 8);
        }
        this.writeUnsignedInt(value, width);
    }
    writeVarInt(value, width = measureVarInt(value)) {
        let pos = 0;
        switch (width) {
            case 1:
                this.helperView.setUint8(pos++, (1 << 7) | value);
                break;
            case 2:
                this.helperView.setUint8(pos++, (1 << 6) | (value >> 8));
                this.helperView.setUint8(pos++, value);
                break;
            case 3:
                this.helperView.setUint8(pos++, (1 << 5) | (value >> 16));
                this.helperView.setUint8(pos++, value >> 8);
                this.helperView.setUint8(pos++, value);
                break;
            case 4:
                this.helperView.setUint8(pos++, (1 << 4) | (value >> 24));
                this.helperView.setUint8(pos++, value >> 16);
                this.helperView.setUint8(pos++, value >> 8);
                this.helperView.setUint8(pos++, value);
                break;
            case 5:
                /**
                 * JavaScript converts its doubles to 32-bit integers for bitwise
                 * operations, so we need to do a division by 2^32 instead of a
                 * right-shift of 32 to retain those top 3 bits
                 */
                this.helperView.setUint8(pos++, (1 << 3) | ((value / 2 ** 32) & 0x7));
                this.helperView.setUint8(pos++, value >> 24);
                this.helperView.setUint8(pos++, value >> 16);
                this.helperView.setUint8(pos++, value >> 8);
                this.helperView.setUint8(pos++, value);
                break;
            case 6:
                this.helperView.setUint8(pos++, (1 << 2) | ((value / 2 ** 40) & 0x3));
                this.helperView.setUint8(pos++, (value / 2 ** 32) | 0);
                this.helperView.setUint8(pos++, value >> 24);
                this.helperView.setUint8(pos++, value >> 16);
                this.helperView.setUint8(pos++, value >> 8);
                this.helperView.setUint8(pos++, value);
                break;
            default:
                throw new Error('Bad EBML varint size ' + width);
        }
        this.writer.write(this.helper.subarray(0, pos));
    }
    writeAsciiString(str) {
        this.writer.write(new Uint8Array(str.split('').map(x => x.charCodeAt(0))));
    }
    writeEBML(data) {
        if (data === null)
            return;
        if (data instanceof Uint8Array) {
            this.writer.write(data);
        }
        else if (Array.isArray(data)) {
            for (const elem of data) {
                this.writeEBML(elem);
            }
        }
        else {
            this.offsets.set(data, this.writer.getPos());
            this.writeUnsignedInt(data.id); // ID field
            if (Array.isArray(data.data)) {
                const sizePos = this.writer.getPos();
                const sizeSize = data.size === -1 ? 1 : (data.size ?? 4);
                if (data.size === -1) {
                    // Write the reserved all-one-bits marker for unknown/unbounded size.
                    this.writeByte(0xff);
                }
                else {
                    this.writer.seek(this.writer.getPos() + sizeSize);
                }
                const startPos = this.writer.getPos();
                this.dataOffsets.set(data, startPos);
                this.writeEBML(data.data);
                if (data.size !== -1) {
                    const size = this.writer.getPos() - startPos;
                    const endPos = this.writer.getPos();
                    this.writer.seek(sizePos);
                    this.writeVarInt(size, sizeSize);
                    this.writer.seek(endPos);
                }
            }
            else if (typeof data.data === 'number') {
                const size = data.size ?? measureUnsignedInt(data.data);
                this.writeVarInt(size);
                this.writeUnsignedInt(data.data, size);
            }
            else if (typeof data.data === 'bigint') {
                const size = data.size ?? measureUnsignedBigInt(data.data);
                this.writeVarInt(size);
                this.writeUnsignedBigInt(data.data, size);
            }
            else if (typeof data.data === 'string') {
                this.writeVarInt(data.data.length);
                this.writeAsciiString(data.data);
            }
            else if (data.data instanceof Uint8Array) {
                this.writeVarInt(data.data.byteLength, data.size);
                this.writer.write(data.data);
            }
            else if (data.data instanceof EBMLFloat32) {
                this.writeVarInt(4);
                this.writeFloat32(data.data.value);
            }
            else if (data.data instanceof EBMLFloat64) {
                this.writeVarInt(8);
                this.writeFloat64(data.data.value);
            }
            else if (data.data instanceof EBMLSignedInt) {
                const size = data.size ?? measureSignedInt(data.data.value);
                this.writeVarInt(size);
                this.writeSignedInt(data.data.value, size);
            }
            else if (data.data instanceof EBMLUnicodeString) {
                const bytes = textEncoder.encode(data.data.value);
                this.writeVarInt(bytes.length);
                this.writer.write(bytes);
            }
            else {
                assertNever(data.data);
            }
        }
    }
}
export const MAX_VAR_INT_SIZE = 8;
export const MIN_HEADER_SIZE = 2; // 1-byte ID and 1-byte size
export const MAX_HEADER_SIZE = 2 * MAX_VAR_INT_SIZE; // 8-byte ID and 8-byte size
export const readVarIntSize = (slice) => {
    const firstByte = readU8(slice);
    slice.skip(-1);
    if (firstByte === 0) {
        return null; // Invalid VINT
    }
    let width = 1;
    let mask = 0x80;
    while ((firstByte & mask) === 0) {
        width++;
        mask >>= 1;
    }
    return width;
};
export const readVarInt = (slice) => {
    // Read the first byte to determine the width of the variable-length integer
    const firstByte = readU8(slice);
    if (firstByte === 0) {
        return null; // Invalid VINT
    }
    // Find the position of VINT_MARKER, which determines the width
    let width = 1;
    let mask = 1 << 7;
    while ((firstByte & mask) === 0) {
        width++;
        mask >>= 1;
    }
    // First byte's value needs the marker bit cleared
    let value = firstByte & (mask - 1);
    // Read remaining bytes
    for (let i = 1; i < width; i++) {
        value *= 1 << 8;
        value += readU8(slice);
    }
    return value;
};
export const readUnsignedInt = (slice, width) => {
    if (width < 1 || width > 8) {
        throw new Error('Bad unsigned int size ' + width);
    }
    let value = 0;
    // Read bytes from most significant to least significant
    for (let i = 0; i < width; i++) {
        value *= 1 << 8;
        value += readU8(slice);
    }
    return value;
};
export const readUnsignedBigInt = (slice, width) => {
    if (width < 1) {
        throw new Error('Bad unsigned int size ' + width);
    }
    let value = 0n;
    for (let i = 0; i < width; i++) {
        value <<= 8n;
        value += BigInt(readU8(slice));
    }
    return value;
};
export const readSignedInt = (slice, width) => {
    let value = readUnsignedInt(slice, width);
    // If the highest bit is set, convert from two's complement
    if (value & (1 << (width * 8 - 1))) {
        value -= 2 ** (width * 8);
    }
    return value;
};
export const readElementId = (slice) => {
    const size = readVarIntSize(slice);
    if (size === null) {
        return null;
    }
    const id = readUnsignedInt(slice, size);
    return id;
};
export const readElementSize = (slice) => {
    let size = readU8(slice);
    if (size === 0xff) {
        size = null;
    }
    else {
        slice.skip(-1);
        size = readVarInt(slice);
        // In some (livestreamed) files, this is the value of the size field. While this technically is just a very
        // large number, it is intended to behave like the reserved size 0xFF, meaning the size is undefined. We
        // catch the number here. Note that it cannot be perfectly represented as a double, but the comparison works
        // nonetheless.
        // eslint-disable-next-line no-loss-of-precision
        if (size === 0x00ffffffffffffff) {
            size = null;
        }
    }
    return size;
};
export const readElementHeader = (slice) => {
    const id = readElementId(slice);
    if (id === null) {
        return null;
    }
    const size = readElementSize(slice);
    return { id, size };
};
export const readAsciiString = (slice, length) => {
    const bytes = readBytes(slice, length);
    // Actual string length might be shorter due to null terminators
    let strLength = 0;
    while (strLength < length && bytes[strLength] !== 0) {
        strLength += 1;
    }
    return String.fromCharCode(...bytes.subarray(0, strLength));
};
export const readUnicodeString = (slice, length) => {
    const bytes = readBytes(slice, length);
    // Actual string length might be shorter due to null terminators
    let strLength = 0;
    while (strLength < length && bytes[strLength] !== 0) {
        strLength += 1;
    }
    return textDecoder.decode(bytes.subarray(0, strLength));
};
export const readFloat = (slice, width) => {
    if (width === 0) {
        return 0;
    }
    if (width !== 4 && width !== 8) {
        throw new Error('Bad float size ' + width);
    }
    return width === 4 ? readF32Be(slice) : readF64Be(slice);
};
/** Returns the byte offset in the file of the next element with a matching ID. */
export const searchForNextElementId = async (reader, startPos, ids, until) => {
    const idsSet = new Set(ids);
    let currentPos = startPos;
    while (until === null || currentPos < until) {
        let slice = reader.requestSliceRange(currentPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
        if (slice instanceof Promise)
            slice = await slice;
        if (!slice)
            break;
        const elementHeader = readElementHeader(slice);
        if (!elementHeader) {
            break;
        }
        if (idsSet.has(elementHeader.id)) {
            return { pos: currentPos, found: true };
        }
        assertDefinedSize(elementHeader.size);
        currentPos = slice.filePos + elementHeader.size;
    }
    return { pos: (until !== null && until > currentPos) ? until : currentPos, found: false };
};
/** Searches for the next occurrence of an element ID using a naive byte-wise search. */
export const resync = async (reader, startPos, ids, until) => {
    const CHUNK_SIZE = 2 ** 16; // So we don't need to grab thousands of slices
    const idsSet = new Set(ids);
    let currentPos = startPos;
    while (currentPos < until) {
        let slice = reader.requestSliceRange(currentPos, 0, Math.min(CHUNK_SIZE, until - currentPos));
        if (slice instanceof Promise)
            slice = await slice;
        if (!slice)
            break;
        if (slice.length < MAX_VAR_INT_SIZE)
            break;
        for (let i = 0; i < slice.length - MAX_VAR_INT_SIZE; i++) {
            slice.filePos = currentPos;
            const elementId = readElementId(slice);
            if (elementId !== null && idsSet.has(elementId)) {
                return currentPos;
            }
            currentPos++;
        }
    }
    return null;
};
export const CODEC_STRING_MAP = {
    'avc': 'V_MPEG4/ISO/AVC',
    'hevc': 'V_MPEGH/ISO/HEVC',
    'vp8': 'V_VP8',
    'vp9': 'V_VP9',
    'av1': 'V_AV1',
    'mpeg4': 'V_MPEG4/ISO/ASP',
    'aac': 'A_AAC',
    'mp3': 'A_MPEG/L3',
    'opus': 'A_OPUS',
    'vorbis': 'A_VORBIS',
    'flac': 'A_FLAC',
    'ac3': 'A_AC3',
    'eac3': 'A_EAC3',
    'pcm-u8': 'A_PCM/INT/LIT',
    'pcm-s16': 'A_PCM/INT/LIT',
    'pcm-s16be': 'A_PCM/INT/BIG',
    'pcm-s24': 'A_PCM/INT/LIT',
    'pcm-s24be': 'A_PCM/INT/BIG',
    'pcm-s32': 'A_PCM/INT/LIT',
    'pcm-s32be': 'A_PCM/INT/BIG',
    'pcm-f32': 'A_PCM/FLOAT/IEEE',
    'pcm-f64': 'A_PCM/FLOAT/IEEE',
    'webvtt': 'S_TEXT/WEBVTT',
    'srt': 'S_TEXT/UTF8',
    'ass': 'S_TEXT/ASS',
    'ssa': 'S_TEXT/SSA',
};
export function assertDefinedSize(size) {
    if (size === null) {
        throw new Error('Undefined element size is used in a place where it is not supported.');
    }
}
;
