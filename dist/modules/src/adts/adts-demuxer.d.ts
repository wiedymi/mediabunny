/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { Demuxer } from '../demuxer.js';
import { Input } from '../input.js';
import { InputAudioTrack } from '../input-track.js';
import { AsyncMutex } from '../misc.js';
import { Reader } from '../reader.js';
import { FrameHeader } from './adts-reader.js';
type Sample = {
    timestamp: number;
    duration: number;
    dataStart: number;
    dataSize: number;
};
export declare class AdtsDemuxer extends Demuxer {
    reader: Reader;
    metadataPromise: Promise<void> | null;
    firstFrameHeader: FrameHeader | null;
    loadedSamples: Sample[];
    tracks: InputAudioTrack[];
    readingMutex: AsyncMutex;
    lastSampleLoaded: boolean;
    lastLoadedPos: number;
    nextTimestampInSamples: number;
    constructor(input: Input);
    readMetadata(): Promise<void>;
    advanceReader(): Promise<void>;
    getMimeType(): Promise<string>;
    getTracks(): Promise<InputAudioTrack[]>;
    computeDuration(): Promise<number>;
    getMetadataTags(): Promise<{}>;
}
export {};
//# sourceMappingURL=adts-demuxer.d.ts.map