/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { AudioCodec, VideoCodec } from '../codec.js';
export interface AVIMainHeader {
    microSecPerFrame: number;
    maxBytesPerSec: number;
    paddingGranularity: number;
    flags: number;
    totalFrames: number;
    initialFrames: number;
    streams: number;
    suggestedBufferSize: number;
    width: number;
    height: number;
}
export interface AVIStreamHeader {
    fccType: string;
    fccHandler: string;
    flags: number;
    priority: number;
    language: number;
    initialFrames: number;
    scale: number;
    rate: number;
    start: number;
    length: number;
    suggestedBufferSize: number;
    quality: number;
    sampleSize: number;
    frame: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    };
}
export interface AVIBitmapInfoHeader {
    size: number;
    width: number;
    height: number;
    planes: number;
    bitCount: number;
    compression: string;
    sizeImage: number;
    xPelsPerMeter: number;
    yPelsPerMeter: number;
    clrUsed: number;
    clrImportant: number;
}
export interface AVIWaveFormatEx {
    formatTag: number;
    channels: number;
    samplesPerSec: number;
    avgBytesPerSec: number;
    blockAlign: number;
    bitsPerSample: number;
    cbSize?: number;
    extraData?: Uint8Array;
}
export interface AVIIndexEntry {
    ckid: string;
    flags: number;
    offset: number;
    size: number;
}
export declare const AVIIF_KEYFRAME = 16;
export declare const AVIIF_LIST = 1;
export declare const AVIIF_NO_TIME = 256;
export declare function aviVideoFourccToCodec(fourccStr: string): VideoCodec | null;
export declare function aviAudioFormatTagToCodec(formatTag: number): AudioCodec | null;
export declare function aviVideoCodecToFourcc(codec: VideoCodec): string | null;
export declare function aviAudioCodecToFormatTag(codec: AudioCodec): number | null;
export declare function parseMainHeader(data: DataView): AVIMainHeader;
export declare function parseStreamHeader(data: DataView): AVIStreamHeader;
export declare function parseBitmapInfoHeader(data: DataView): AVIBitmapInfoHeader;
export declare function parseWaveFormatEx(data: DataView): AVIWaveFormatEx;
export declare function parseIndexEntry(data: DataView, offset: number): AVIIndexEntry;
export declare function makeStreamChunkId(streamNumber: number, type: 'db' | 'dc' | 'wb' | 'pc'): string;
export declare function parseStreamChunkId(ckid: string): {
    streamNumber: number;
    type: string;
} | null;
//# sourceMappingURL=avi-misc.d.ts.map