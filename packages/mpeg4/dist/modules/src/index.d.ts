/*!
 * Copyright (c) 2025-present, Vanilagy and contributors (Wiedy Mi)
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { CustomVideoDecoder, CustomVideoEncoder, VideoCodec, EncodedPacket, VideoSample } from 'mediabunny';
declare class Mpeg4Decoder extends CustomVideoDecoder {
    private worker;
    private nextMessageId;
    private pendingMessages;
    static supports(codec: VideoCodec, config: VideoDecoderConfig): boolean;
    init(): Promise<void>;
    decode(packet: EncodedPacket, meta?: EncodedVideoChunkMetadata): Promise<void>;
    flush(): Promise<void>;
    close(): void;
    private sendCommand;
}
declare class Mpeg4Encoder extends CustomVideoEncoder {
    private worker;
    private nextMessageId;
    private pendingMessages;
    private frameCount;
    static supports(codec: VideoCodec, config: VideoEncoderConfig): boolean;
    init(): Promise<void>;
    encode(videoSample: VideoSample, options: VideoEncoderEncodeOptions): Promise<void>;
    flush(): Promise<void>;
    close(): void;
    private sendCommand;
}
/**
 * Registers the MPEG-4 Part 2 (Xvid) decoder, which Mediabunny will then use automatically when applicable.
 * Make sure to call this function before starting any decoding task.
 *
 * @param wasmUrl - Optional custom URL for xvid.wasm file (e.g., CDN URL)
 * @group \@mediabunny/mpeg4
 * @public
 */
export declare const registerMpeg4Decoder: (wasmUrl?: string) => void;
/**
 * Registers the MPEG-4 Part 2 (Xvid) encoder, which Mediabunny will then use automatically when applicable.
 * Make sure to call this function before starting any encoding task.
 *
 * @param wasmUrl - Optional custom URL for xvid.wasm file (e.g., CDN URL)
 * @group \@mediabunny/mpeg4
 * @public
 */
export declare const registerMpeg4Encoder: (wasmUrl?: string) => void;
export { setMpeg4WasmUrl } from './xvid-loader.js';
//# sourceMappingURL=index.d.ts.map