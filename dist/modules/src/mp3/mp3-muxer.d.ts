/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { Muxer } from '../muxer.js';
import { Output, OutputAudioTrack } from '../output.js';
import { Mp3OutputFormat } from '../output-format.js';
import { EncodedPacket } from '../packet.js';
export declare class Mp3Muxer extends Muxer {
    private format;
    private writer;
    private mp3Writer;
    private xingFrameData;
    private frameCount;
    private framePositions;
    private xingFramePos;
    constructor(output: Output, format: Mp3OutputFormat);
    start(): Promise<void>;
    getMimeType(): Promise<string>;
    addEncodedVideoPacket(): Promise<void>;
    addEncodedAudioPacket(track: OutputAudioTrack, packet: EncodedPacket): Promise<void>;
    addSubtitleCue(): Promise<void>;
    finalize(): Promise<void>;
}
//# sourceMappingURL=mp3-muxer.d.ts.map