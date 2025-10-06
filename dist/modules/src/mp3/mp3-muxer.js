/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { assert, toDataView } from '../misc.js';
import { metadataTagsAreEmpty } from '../tags.js';
import { Muxer } from '../muxer.js';
import { getXingOffset, INFO, readFrameHeader, XING } from '../../shared/mp3-misc.js';
import { Mp3Writer } from './mp3-writer.js';
import { Id3V2Writer } from '../id3.js';
export class Mp3Muxer extends Muxer {
    constructor(output, format) {
        super(output);
        this.xingFrameData = null;
        this.frameCount = 0;
        this.framePositions = [];
        this.xingFramePos = null;
        this.format = format;
        this.writer = output._writer;
        this.mp3Writer = new Mp3Writer(output._writer);
    }
    async start() {
        if (!metadataTagsAreEmpty(this.output._metadataTags)) {
            const id3Writer = new Id3V2Writer(this.writer);
            id3Writer.writeId3V2Tag(this.output._metadataTags);
        }
    }
    async getMimeType() {
        return 'audio/mpeg';
    }
    async addEncodedVideoPacket() {
        throw new Error('MP3 does not support video.');
    }
    async addEncodedAudioPacket(track, packet) {
        const release = await this.mutex.acquire();
        try {
            const writeXingHeader = this.format._options.xingHeader !== false;
            if (!this.xingFrameData && writeXingHeader) {
                const view = toDataView(packet.data);
                if (view.byteLength < 4) {
                    throw new Error('Invalid MP3 header in sample.');
                }
                const word = view.getUint32(0, false);
                const header = readFrameHeader(word, null).header;
                if (!header) {
                    throw new Error('Invalid MP3 header in sample.');
                }
                const xingOffset = getXingOffset(header.mpegVersionId, header.channel);
                if (view.byteLength >= xingOffset + 4) {
                    const word = view.getUint32(xingOffset, false);
                    const isXing = word === XING || word === INFO;
                    if (isXing) {
                        // This is not a data frame, so let's completely ignore this sample
                        return;
                    }
                }
                this.xingFrameData = {
                    mpegVersionId: header.mpegVersionId,
                    layer: header.layer,
                    frequencyIndex: header.frequencyIndex,
                    sampleRate: header.sampleRate,
                    channel: header.channel,
                    modeExtension: header.modeExtension,
                    copyright: header.copyright,
                    original: header.original,
                    emphasis: header.emphasis,
                    frameCount: null,
                    fileSize: null,
                    toc: null,
                };
                // Write a Xing frame because this muxer doesn't make any bitrate constraints, meaning we don't know if
                // this will be a constant or variable bitrate file. Therefore, always write the Xing frame.
                this.xingFramePos = this.writer.getPos();
                this.mp3Writer.writeXingFrame(this.xingFrameData);
                this.frameCount++;
            }
            this.validateAndNormalizeTimestamp(track, packet.timestamp, packet.type === 'key');
            this.writer.write(packet.data);
            this.frameCount++;
            await this.writer.flush();
            if (writeXingHeader) {
                this.framePositions.push(this.writer.getPos());
            }
        }
        finally {
            release();
        }
    }
    async addSubtitleCue() {
        throw new Error('MP3 does not support subtitles.');
    }
    async finalize() {
        if (!this.xingFrameData || this.xingFramePos === null) {
            return;
        }
        const release = await this.mutex.acquire();
        const endPos = this.writer.getPos();
        this.writer.seek(this.xingFramePos);
        const toc = new Uint8Array(100);
        for (let i = 0; i < 100; i++) {
            const index = Math.floor(this.framePositions.length * (i / 100));
            assert(index !== -1 && index < this.framePositions.length);
            const byteOffset = this.framePositions[index];
            toc[i] = 256 * (byteOffset / endPos);
        }
        this.xingFrameData.frameCount = this.frameCount;
        this.xingFrameData.fileSize = endPos;
        this.xingFrameData.toc = toc;
        if (this.format._options.onXingFrame) {
            this.writer.startTrackingWrites();
        }
        this.mp3Writer.writeXingFrame(this.xingFrameData);
        if (this.format._options.onXingFrame) {
            const { data, start } = this.writer.stopTrackingWrites();
            this.format._options.onXingFrame(data, start);
        }
        this.writer.seek(endPos);
        release();
    }
}
