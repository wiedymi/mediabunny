/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { Demuxer } from '../demuxer.js';
import { InputAudioTrack } from '../input-track.js';
import { assert, AsyncMutex, binarySearchExact, binarySearchLessOrEqual, UNDETERMINED_LANGUAGE } from '../misc.js';
import { EncodedPacket, PLACEHOLDER_DATA } from '../packet.js';
import { getXingOffset, INFO, XING } from '../../shared/mp3-misc.js';
import { ID3_V1_TAG_SIZE, ID3_V2_HEADER_SIZE, parseId3V1Tag, parseId3V2Tag, readId3V2Header, } from '../id3.js';
import { readNextFrameHeader } from './mp3-reader.js';
import { readAscii, readBytes, readU32Be } from '../reader.js';
export class Mp3Demuxer extends Demuxer {
    constructor(input) {
        super(input);
        this.metadataPromise = null;
        this.firstFrameHeader = null;
        this.loadedSamples = []; // All samples from the start of the file to lastLoadedPos
        this.metadataTags = null;
        this.tracks = [];
        this.readingMutex = new AsyncMutex();
        this.lastSampleLoaded = false;
        this.lastLoadedPos = 0;
        this.nextTimestampInSamples = 0;
        this.reader = input._reader;
    }
    async readMetadata() {
        return this.metadataPromise ??= (async () => {
            // Keep loading until we find the first frame header
            while (!this.firstFrameHeader && !this.lastSampleLoaded) {
                await this.advanceReader();
            }
            if (!this.firstFrameHeader) {
                throw new Error('No valid MP3 frame found.');
            }
            this.tracks = [new InputAudioTrack(this.input, new Mp3AudioTrackBacking(this))];
        })();
    }
    async advanceReader() {
        if (this.lastLoadedPos === 0) {
            // Let's skip all ID3v2 tags at the start of the file
            while (true) {
                let slice = this.reader.requestSlice(this.lastLoadedPos, ID3_V2_HEADER_SIZE);
                if (slice instanceof Promise)
                    slice = await slice;
                if (!slice) {
                    this.lastSampleLoaded = true;
                    return;
                }
                const id3V2Header = readId3V2Header(slice);
                if (!id3V2Header) {
                    break;
                }
                this.lastLoadedPos = slice.filePos + id3V2Header.size;
            }
        }
        const result = await readNextFrameHeader(this.reader, this.lastLoadedPos, this.reader.fileSize);
        if (!result) {
            this.lastSampleLoaded = true;
            return;
        }
        const header = result.header;
        this.lastLoadedPos = result.startPos + header.totalSize - 1; // -1 in case the frame is 1 byte too short
        const xingOffset = getXingOffset(header.mpegVersionId, header.channel);
        let slice = this.reader.requestSlice(result.startPos + xingOffset, 4);
        if (slice instanceof Promise)
            slice = await slice;
        if (slice) {
            const word = readU32Be(slice);
            const isXing = word === XING || word === INFO;
            if (isXing) {
                // There's no actual audio data in this frame, so let's skip it
                return;
            }
        }
        if (!this.firstFrameHeader) {
            this.firstFrameHeader = header;
        }
        if (header.sampleRate !== this.firstFrameHeader.sampleRate) {
            console.warn(`MP3 changed sample rate mid-file: ${this.firstFrameHeader.sampleRate} Hz to ${header.sampleRate} Hz.`
                + ` Might be a bug, so please report this file.`);
        }
        const sampleDuration = header.audioSamplesInFrame / this.firstFrameHeader.sampleRate;
        const sample = {
            timestamp: this.nextTimestampInSamples / this.firstFrameHeader.sampleRate,
            duration: sampleDuration,
            dataStart: result.startPos,
            dataSize: header.totalSize,
        };
        this.loadedSamples.push(sample);
        this.nextTimestampInSamples += header.audioSamplesInFrame;
        return;
    }
    async getMimeType() {
        return 'audio/mpeg';
    }
    async getTracks() {
        await this.readMetadata();
        return this.tracks;
    }
    async computeDuration() {
        await this.readMetadata();
        const track = this.tracks[0];
        assert(track);
        return track.computeDuration();
    }
    async getMetadataTags() {
        const release = await this.readingMutex.acquire();
        try {
            await this.readMetadata();
            if (this.metadataTags) {
                return this.metadataTags;
            }
            this.metadataTags = {};
            let currentPos = 0;
            let id3V2HeaderFound = false;
            while (true) {
                let headerSlice = this.reader.requestSlice(currentPos, ID3_V2_HEADER_SIZE);
                if (headerSlice instanceof Promise)
                    headerSlice = await headerSlice;
                if (!headerSlice)
                    break;
                const id3V2Header = readId3V2Header(headerSlice);
                if (!id3V2Header) {
                    break;
                }
                id3V2HeaderFound = true;
                let contentSlice = this.reader.requestSlice(headerSlice.filePos, id3V2Header.size);
                if (contentSlice instanceof Promise)
                    contentSlice = await contentSlice;
                if (!contentSlice)
                    break;
                parseId3V2Tag(contentSlice, id3V2Header, this.metadataTags);
                currentPos = headerSlice.filePos + id3V2Header.size;
            }
            if (!id3V2HeaderFound && this.reader.fileSize !== null && this.reader.fileSize >= ID3_V1_TAG_SIZE) {
                // Try reading an ID3v1 tag at the end of the file
                let slice = this.reader.requestSlice(this.reader.fileSize - ID3_V1_TAG_SIZE, ID3_V1_TAG_SIZE);
                if (slice instanceof Promise)
                    slice = await slice;
                assert(slice);
                const tag = readAscii(slice, 3);
                if (tag === 'TAG') {
                    parseId3V1Tag(slice, this.metadataTags);
                }
            }
            return this.metadataTags;
        }
        finally {
            release();
        }
    }
}
class Mp3AudioTrackBacking {
    constructor(demuxer) {
        this.demuxer = demuxer;
    }
    getId() {
        return 1;
    }
    async getFirstTimestamp() {
        return 0;
    }
    getTimeResolution() {
        assert(this.demuxer.firstFrameHeader);
        return this.demuxer.firstFrameHeader.sampleRate / this.demuxer.firstFrameHeader.audioSamplesInFrame;
    }
    async computeDuration() {
        const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
        return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
    }
    getName() {
        return null;
    }
    getLanguageCode() {
        return UNDETERMINED_LANGUAGE;
    }
    getCodec() {
        return 'mp3';
    }
    getInternalCodecId() {
        return null;
    }
    getNumberOfChannels() {
        assert(this.demuxer.firstFrameHeader);
        return this.demuxer.firstFrameHeader.channel === 3 ? 1 : 2;
    }
    getSampleRate() {
        assert(this.demuxer.firstFrameHeader);
        return this.demuxer.firstFrameHeader.sampleRate;
    }
    async getDecoderConfig() {
        assert(this.demuxer.firstFrameHeader);
        return {
            codec: 'mp3',
            numberOfChannels: this.demuxer.firstFrameHeader.channel === 3 ? 1 : 2,
            sampleRate: this.demuxer.firstFrameHeader.sampleRate,
        };
    }
    async getPacketAtIndex(sampleIndex, options) {
        if (sampleIndex === -1) {
            return null;
        }
        const rawSample = this.demuxer.loadedSamples[sampleIndex];
        if (!rawSample) {
            return null;
        }
        let data;
        if (options.metadataOnly) {
            data = PLACEHOLDER_DATA;
        }
        else {
            let slice = this.demuxer.reader.requestSlice(rawSample.dataStart, rawSample.dataSize);
            if (slice instanceof Promise)
                slice = await slice;
            if (!slice) {
                return null; // Data didn't fit into the rest of the file
            }
            data = readBytes(slice, rawSample.dataSize);
        }
        return new EncodedPacket(data, 'key', rawSample.timestamp, rawSample.duration, sampleIndex, rawSample.dataSize);
    }
    getFirstPacket(options) {
        return this.getPacketAtIndex(0, options);
    }
    async getNextPacket(packet, options) {
        const release = await this.demuxer.readingMutex.acquire();
        try {
            const sampleIndex = binarySearchExact(this.demuxer.loadedSamples, packet.timestamp, x => x.timestamp);
            if (sampleIndex === -1) {
                throw new Error('Packet was not created from this track.');
            }
            const nextIndex = sampleIndex + 1;
            // Ensure the next sample exists
            while (nextIndex >= this.demuxer.loadedSamples.length
                && !this.demuxer.lastSampleLoaded) {
                await this.demuxer.advanceReader();
            }
            return this.getPacketAtIndex(nextIndex, options);
        }
        finally {
            release();
        }
    }
    async getPacket(timestamp, options) {
        const release = await this.demuxer.readingMutex.acquire();
        try {
            while (true) {
                const index = binarySearchLessOrEqual(this.demuxer.loadedSamples, timestamp, x => x.timestamp);
                if (index === -1 && this.demuxer.loadedSamples.length > 0) {
                    // We're before the first sample
                    return null;
                }
                if (this.demuxer.lastSampleLoaded) {
                    // All data is loaded, return what we found
                    return this.getPacketAtIndex(index, options);
                }
                if (index >= 0 && index + 1 < this.demuxer.loadedSamples.length) {
                    // The next packet also exists, we're done
                    return this.getPacketAtIndex(index, options);
                }
                // Otherwise, keep loading data
                await this.demuxer.advanceReader();
            }
        }
        finally {
            release();
        }
    }
    getKeyPacket(timestamp, options) {
        return this.getPacket(timestamp, options);
    }
    getNextKeyPacket(packet, options) {
        return this.getNextPacket(packet, options);
    }
}
