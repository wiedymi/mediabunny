/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { Demuxer } from '../demuxer.js';
import { EncodedPacket } from '../packet.js';
import { Input } from '../input.js';
import { InputTrack } from '../input-track.js';
import { MetadataTags } from '../tags.js';
import { AVIIndexEntry } from './avi-misc.js';
export declare class AVIDemuxer extends Demuxer {
    private reader;
    private mainHeader;
    private streams;
    private index;
    private moviStart;
    private moviSize;
    private isRIFX;
    private inputTracks;
    private metadataPromise;
    constructor(input: Input);
    static _canReadInput(input: Input): Promise<boolean>;
    private static fourcc;
    computeDuration(): Promise<number>;
    getTracks(): Promise<InputTrack[]>;
    getMimeType(): Promise<string>;
    getMetadataTags(): Promise<MetadataTags>;
    private ensureMetadata;
    private readMetadata;
    private parseChunks;
    private readChunkHeader;
    private parseHeaderList;
    private parseStreamList;
    private parseIndex;
    private processIndex;
    private createTracks;
    readPacket(entry: AVIIndexEntry, timestamp: number, duration?: number, sequenceNumber?: number): Promise<EncodedPacket | null>;
    private calculateTimestamp;
    private calculatePacketDuration;
}
//# sourceMappingURL=avi-demuxer.d.ts.map