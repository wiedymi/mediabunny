/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { Demuxer } from '../demuxer.js';
import { InputAudioTrack } from '../input-track.js';
import { assert, UNDETERMINED_LANGUAGE } from '../misc.js';
import { EncodedPacket, PLACEHOLDER_DATA } from '../packet.js';
import { readAscii, readBytes, readU16, readU32, readU64 } from '../reader.js';
import { parseId3V2Tag, readId3V2Header } from '../id3.js';
export var WaveFormat;
(function (WaveFormat) {
    WaveFormat[WaveFormat["PCM"] = 1] = "PCM";
    WaveFormat[WaveFormat["IEEE_FLOAT"] = 3] = "IEEE_FLOAT";
    WaveFormat[WaveFormat["ALAW"] = 6] = "ALAW";
    WaveFormat[WaveFormat["MULAW"] = 7] = "MULAW";
    WaveFormat[WaveFormat["EXTENSIBLE"] = 65534] = "EXTENSIBLE";
})(WaveFormat || (WaveFormat = {}));
export class WaveDemuxer extends Demuxer {
    constructor(input) {
        super(input);
        this.metadataPromise = null;
        this.dataStart = -1;
        this.dataSize = -1;
        this.audioInfo = null;
        this.tracks = [];
        this.lastKnownPacketIndex = 0;
        this.metadataTags = {};
        this.reader = input._reader;
    }
    async readMetadata() {
        return this.metadataPromise ??= (async () => {
            let slice = this.reader.requestSlice(0, 12);
            if (slice instanceof Promise)
                slice = await slice;
            assert(slice);
            const riffType = readAscii(slice, 4);
            const littleEndian = riffType !== 'RIFX';
            const isRf64 = riffType === 'RF64';
            const outerChunkSize = readU32(slice, littleEndian);
            let totalFileSize = isRf64
                ? this.reader.fileSize
                : Math.min(outerChunkSize + 8, this.reader.fileSize ?? Infinity);
            const format = readAscii(slice, 4);
            if (format !== 'WAVE') {
                throw new Error('Invalid WAVE file - wrong format');
            }
            let chunksRead = 0;
            let dataChunkSize = null;
            let currentPos = slice.filePos;
            while (totalFileSize === null || currentPos < totalFileSize) {
                let slice = this.reader.requestSlice(currentPos, 8);
                if (slice instanceof Promise)
                    slice = await slice;
                if (!slice)
                    break;
                const chunkId = readAscii(slice, 4);
                const chunkSize = readU32(slice, littleEndian);
                const startPos = slice.filePos;
                if (isRf64 && chunksRead === 0 && chunkId !== 'ds64') {
                    throw new Error('Invalid RF64 file: First chunk must be "ds64".');
                }
                if (chunkId === 'fmt ') {
                    await this.parseFmtChunk(startPos, chunkSize, littleEndian);
                }
                else if (chunkId === 'data') {
                    dataChunkSize ??= chunkSize;
                    this.dataStart = slice.filePos;
                    this.dataSize = Math.min(dataChunkSize, (totalFileSize ?? Infinity) - this.dataStart);
                    if (this.reader.fileSize === null) {
                        break; // Stop once we hit the data chunk
                    }
                }
                else if (chunkId === 'ds64') {
                    // File and data chunk sizes are defined in here instead
                    let ds64Slice = this.reader.requestSlice(startPos, chunkSize);
                    if (ds64Slice instanceof Promise)
                        ds64Slice = await ds64Slice;
                    if (!ds64Slice)
                        break;
                    const riffChunkSize = readU64(ds64Slice, littleEndian);
                    dataChunkSize = readU64(ds64Slice, littleEndian);
                    totalFileSize = Math.min(riffChunkSize + 8, this.reader.fileSize ?? Infinity);
                }
                else if (chunkId === 'LIST') {
                    await this.parseListChunk(startPos, chunkSize, littleEndian);
                }
                else if (chunkId === 'ID3 ' || chunkId === 'id3 ') {
                    await this.parseId3Chunk(startPos, chunkSize);
                }
                currentPos = startPos + chunkSize + (chunkSize & 1); // Handle padding
                chunksRead++;
            }
            if (!this.audioInfo) {
                throw new Error('Invalid WAVE file - missing "fmt " chunk');
            }
            if (this.dataStart === -1) {
                throw new Error('Invalid WAVE file - missing "data" chunk');
            }
            const blockSize = this.audioInfo.blockSizeInBytes;
            this.dataSize = Math.floor(this.dataSize / blockSize) * blockSize;
            this.tracks.push(new InputAudioTrack(this.input, new WaveAudioTrackBacking(this)));
        })();
    }
    async parseFmtChunk(startPos, size, littleEndian) {
        let slice = this.reader.requestSlice(startPos, size);
        if (slice instanceof Promise)
            slice = await slice;
        if (!slice)
            return; // File too short
        let formatTag = readU16(slice, littleEndian);
        const numChannels = readU16(slice, littleEndian);
        const sampleRate = readU32(slice, littleEndian);
        slice.skip(4); // Bytes per second
        const blockAlign = readU16(slice, littleEndian);
        let bitsPerSample;
        if (size === 14) { // Plain WAVEFORMAT
            bitsPerSample = 8;
        }
        else {
            bitsPerSample = readU16(slice, littleEndian);
        }
        // Handle WAVEFORMATEXTENSIBLE
        if (size >= 18 && formatTag !== 0x0165) {
            const cbSize = readU16(slice, littleEndian);
            const remainingSize = size - 18;
            const extensionSize = Math.min(remainingSize, cbSize);
            if (extensionSize >= 22 && formatTag === WaveFormat.EXTENSIBLE) {
                // Parse WAVEFORMATEXTENSIBLE
                slice.skip(2 + 4);
                const subFormat = readBytes(slice, 16);
                // Get actual format from subFormat GUID
                formatTag = subFormat[0] | (subFormat[1] << 8);
            }
        }
        if (formatTag === WaveFormat.MULAW || formatTag === WaveFormat.ALAW) {
            bitsPerSample = 8;
        }
        this.audioInfo = {
            format: formatTag,
            numberOfChannels: numChannels,
            sampleRate,
            sampleSizeInBytes: Math.ceil(bitsPerSample / 8),
            blockSizeInBytes: blockAlign,
        };
    }
    async parseListChunk(startPos, size, littleEndian) {
        let slice = this.reader.requestSlice(startPos, size);
        if (slice instanceof Promise)
            slice = await slice;
        if (!slice)
            return; // File too short
        const infoType = readAscii(slice, 4);
        if (infoType !== 'INFO' && infoType !== 'INF0') { // exiftool.org claims INF0 can happen
            return; // Not an INFO chunk
        }
        let currentPos = slice.filePos;
        while (currentPos <= startPos + size - 8) {
            slice.filePos = currentPos;
            const chunkName = readAscii(slice, 4);
            const chunkSize = readU32(slice, littleEndian);
            const bytes = readBytes(slice, chunkSize);
            let stringLength = 0;
            for (let i = 0; i < bytes.length; i++) {
                if (bytes[i] === 0) {
                    break;
                }
                stringLength++;
            }
            const value = String.fromCharCode(...bytes.subarray(0, stringLength));
            this.metadataTags.raw ??= {};
            this.metadataTags.raw[chunkName] = value;
            switch (chunkName) {
                case 'INAM':
                case 'TITL':
                    {
                        this.metadataTags.title ??= value;
                    }
                    ;
                    break;
                case 'TIT3':
                    {
                        this.metadataTags.description ??= value;
                    }
                    ;
                    break;
                case 'IART':
                    {
                        this.metadataTags.artist ??= value;
                    }
                    ;
                    break;
                case 'IPRD':
                    {
                        this.metadataTags.album ??= value;
                    }
                    ;
                    break;
                case 'IPRT':
                case 'ITRK':
                case 'TRCK':
                    {
                        const parts = value.split('/');
                        const trackNum = Number.parseInt(parts[0], 10);
                        const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
                        if (Number.isInteger(trackNum) && trackNum > 0) {
                            this.metadataTags.trackNumber ??= trackNum;
                        }
                        if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
                            this.metadataTags.tracksTotal ??= tracksTotal;
                        }
                    }
                    ;
                    break;
                case 'ICRD':
                case 'IDIT':
                    {
                        const date = new Date(value);
                        if (!Number.isNaN(date.getTime())) {
                            this.metadataTags.date ??= date;
                        }
                    }
                    ;
                    break;
                case 'YEAR':
                    {
                        const year = Number.parseInt(value, 10);
                        if (Number.isInteger(year) && year > 0) {
                            this.metadataTags.date ??= new Date(year, 0, 1);
                        }
                    }
                    ;
                    break;
                case 'IGNR':
                case 'GENR':
                    {
                        this.metadataTags.genre ??= value;
                    }
                    ;
                    break;
                case 'ICMT':
                case 'CMNT':
                case 'COMM':
                    {
                        this.metadataTags.comment ??= value;
                    }
                    ;
                    break;
            }
            currentPos += 8 + chunkSize + (chunkSize & 1); // Handle padding
        }
    }
    async parseId3Chunk(startPos, size) {
        // Parse ID3 tag embedded in WAV file (non-default, but used a lot in practice anyway)
        let slice = this.reader.requestSlice(startPos, size);
        if (slice instanceof Promise)
            slice = await slice;
        if (!slice)
            return; // File too short
        const id3V2Header = readId3V2Header(slice);
        if (id3V2Header) {
            // Extract the content portion (skip the 10-byte header)
            const contentSlice = slice.slice(startPos + 10, id3V2Header.size);
            parseId3V2Tag(contentSlice, id3V2Header, this.metadataTags);
        }
    }
    getCodec() {
        assert(this.audioInfo);
        if (this.audioInfo.format === WaveFormat.MULAW) {
            return 'ulaw';
        }
        if (this.audioInfo.format === WaveFormat.ALAW) {
            return 'alaw';
        }
        if (this.audioInfo.format === WaveFormat.PCM) {
            // All formats are little-endian
            if (this.audioInfo.sampleSizeInBytes === 1) {
                return 'pcm-u8';
            }
            else if (this.audioInfo.sampleSizeInBytes === 2) {
                return 'pcm-s16';
            }
            else if (this.audioInfo.sampleSizeInBytes === 3) {
                return 'pcm-s24';
            }
            else if (this.audioInfo.sampleSizeInBytes === 4) {
                return 'pcm-s32';
            }
        }
        if (this.audioInfo.format === WaveFormat.IEEE_FLOAT) {
            if (this.audioInfo.sampleSizeInBytes === 4) {
                return 'pcm-f32';
            }
        }
        return null;
    }
    async getMimeType() {
        return 'audio/wav';
    }
    async computeDuration() {
        await this.readMetadata();
        const track = this.tracks[0];
        assert(track);
        return track.computeDuration();
    }
    async getTracks() {
        await this.readMetadata();
        return this.tracks;
    }
    async getMetadataTags() {
        await this.readMetadata();
        return this.metadataTags;
    }
}
const PACKET_SIZE_IN_FRAMES = 2048;
class WaveAudioTrackBacking {
    constructor(demuxer) {
        this.demuxer = demuxer;
    }
    getId() {
        return 1;
    }
    getCodec() {
        return this.demuxer.getCodec();
    }
    getInternalCodecId() {
        assert(this.demuxer.audioInfo);
        return this.demuxer.audioInfo.format;
    }
    async getDecoderConfig() {
        const codec = this.demuxer.getCodec();
        if (!codec) {
            return null;
        }
        assert(this.demuxer.audioInfo);
        return {
            codec,
            numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
            sampleRate: this.demuxer.audioInfo.sampleRate,
        };
    }
    async computeDuration() {
        const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
        return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
    }
    getNumberOfChannels() {
        assert(this.demuxer.audioInfo);
        return this.demuxer.audioInfo.numberOfChannels;
    }
    getSampleRate() {
        assert(this.demuxer.audioInfo);
        return this.demuxer.audioInfo.sampleRate;
    }
    getTimeResolution() {
        assert(this.demuxer.audioInfo);
        return this.demuxer.audioInfo.sampleRate;
    }
    getName() {
        return null;
    }
    getLanguageCode() {
        return UNDETERMINED_LANGUAGE;
    }
    async getFirstTimestamp() {
        return 0;
    }
    async getPacketAtIndex(packetIndex, options) {
        assert(this.demuxer.audioInfo);
        const startOffset = packetIndex * PACKET_SIZE_IN_FRAMES * this.demuxer.audioInfo.blockSizeInBytes;
        if (startOffset >= this.demuxer.dataSize) {
            return null;
        }
        const sizeInBytes = Math.min(PACKET_SIZE_IN_FRAMES * this.demuxer.audioInfo.blockSizeInBytes, this.demuxer.dataSize - startOffset);
        if (this.demuxer.reader.fileSize === null) {
            // If the file size is unknown, we weren't able to cap the dataSize in the init logic and we instead have to
            // rely on the headers telling us how large the file is. But, these might be wrong, so let's check if the
            // requested slice actually exists.
            let slice = this.demuxer.reader.requestSlice(this.demuxer.dataStart + startOffset, sizeInBytes);
            if (slice instanceof Promise)
                slice = await slice;
            if (!slice) {
                return null;
            }
        }
        let data;
        if (options.metadataOnly) {
            data = PLACEHOLDER_DATA;
        }
        else {
            let slice = this.demuxer.reader.requestSlice(this.demuxer.dataStart + startOffset, sizeInBytes);
            if (slice instanceof Promise)
                slice = await slice;
            assert(slice);
            data = readBytes(slice, sizeInBytes);
        }
        const timestamp = packetIndex * PACKET_SIZE_IN_FRAMES / this.demuxer.audioInfo.sampleRate;
        const duration = sizeInBytes / this.demuxer.audioInfo.blockSizeInBytes / this.demuxer.audioInfo.sampleRate;
        this.demuxer.lastKnownPacketIndex = Math.max(packetIndex, timestamp);
        return new EncodedPacket(data, 'key', timestamp, duration, packetIndex, sizeInBytes);
    }
    getFirstPacket(options) {
        return this.getPacketAtIndex(0, options);
    }
    async getPacket(timestamp, options) {
        assert(this.demuxer.audioInfo);
        const packetIndex = Math.floor(Math.min(timestamp * this.demuxer.audioInfo.sampleRate / PACKET_SIZE_IN_FRAMES, (this.demuxer.dataSize - 1) / (PACKET_SIZE_IN_FRAMES * this.demuxer.audioInfo.blockSizeInBytes)));
        const packet = await this.getPacketAtIndex(packetIndex, options);
        if (packet) {
            return packet;
        }
        if (packetIndex === 0) {
            return null; // Empty data chunk
        }
        assert(this.demuxer.reader.fileSize === null);
        // The file is shorter than we thought, meaning the packet we were looking for doesn't exist. So, let's find
        // the last packet by doing a sequential scan, instead.
        let currentPacket = await this.getPacketAtIndex(this.demuxer.lastKnownPacketIndex, options);
        while (currentPacket) {
            const nextPacket = await this.getNextPacket(currentPacket, options);
            if (!nextPacket) {
                break;
            }
            currentPacket = nextPacket;
        }
        return currentPacket;
    }
    getNextPacket(packet, options) {
        assert(this.demuxer.audioInfo);
        const packetIndex = Math.round(packet.timestamp * this.demuxer.audioInfo.sampleRate / PACKET_SIZE_IN_FRAMES);
        return this.getPacketAtIndex(packetIndex + 1, options);
    }
    getKeyPacket(timestamp, options) {
        return this.getPacket(timestamp, options);
    }
    getNextKeyPacket(packet, options) {
        return this.getNextPacket(packet, options);
    }
}
