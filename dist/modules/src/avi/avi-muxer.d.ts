/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { Muxer } from '../muxer.js';
import { EncodedPacket } from '../packet.js';
import { Output, OutputAudioTrack, OutputVideoTrack, OutputSubtitleTrack } from '../output.js';
import { AviOutputFormat } from '../output-format.js';
import { SubtitleCue, SubtitleMetadata } from '../subtitles.js';
export declare class AVIMuxer extends Muxer {
    private writer;
    private riffWriter;
    private format;
    private trackDatas;
    private allTracksKnown;
    private fileStartPos;
    private hdrlListSizePos;
    private moviListSizePos;
    private moviDataStart;
    private mainHeaderPos;
    private streamHeaderPositions;
    private index;
    private totalFrames;
    private maxBytesPerSec;
    private duration;
    private headerFinalized;
    constructor(output: Output, format: AviOutputFormat);
    start(): Promise<void>;
    private writeMainHeader;
    private finalizeHeader;
    private writeStreamList;
    getMimeType(): Promise<string>;
    private getVideoTrackData;
    private getAudioTrackData;
    addEncodedVideoPacket(track: OutputVideoTrack, packet: EncodedPacket, meta?: EncodedVideoChunkMetadata): Promise<void>;
    addEncodedAudioPacket(track: OutputAudioTrack, packet: EncodedPacket, meta?: EncodedAudioChunkMetadata): Promise<void>;
    addSubtitleCue(track: OutputSubtitleTrack, cue: SubtitleCue, meta?: SubtitleMetadata): Promise<void>;
    finalize(): Promise<void>;
    private updateMainHeader;
    private updateStreamHeaders;
}
//# sourceMappingURL=avi-muxer.d.ts.map