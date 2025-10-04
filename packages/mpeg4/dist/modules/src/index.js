/*!
 * Copyright (c) 2025-present, Vanilagy and contributors (Wiedy Mi)
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { CustomVideoDecoder, CustomVideoEncoder, EncodedPacket, VideoSample, registerDecoder, registerEncoder } from 'mediabunny';
import { setMpeg4WasmUrl, getCustomWasmUrl as getCustomMpeg4WasmUrl } from './xvid-loader.js';
// @ts-expect-error - esbuild inline worker plugin handles this
import createDecodeWorker from './decode.worker.ts';
// @ts-expect-error - esbuild inline worker plugin handles this
import createEncodeWorker from './encode.worker.ts';
class Mpeg4Decoder extends CustomVideoDecoder {
    constructor() {
        super(...arguments);
        this.worker = null;
        this.nextMessageId = 0;
        this.pendingMessages = new Map();
    }
    static supports(codec, config) {
        return codec === 'mpeg4';
    }
    async init() {
        this.worker = (await createDecodeWorker());
        const onMessage = (event) => {
            const data = event.data;
            const pending = this.pendingMessages.get(data.id);
            assert(pending !== undefined);
            this.pendingMessages.delete(data.id);
            if (data.success) {
                pending.resolve(data.data);
            }
            else {
                pending.reject(data.error);
            }
        };
        this.worker.addEventListener('message', onMessage);
        await this.sendCommand({
            type: 'init',
            data: {
                width: this.config.codedWidth,
                height: this.config.codedHeight,
                wasmUrl: getCustomMpeg4WasmUrl() ?? undefined,
            },
        });
    }
    async decode(packet, meta) {
        const frameData = packet.data.slice().buffer;
        const result = await this.sendCommand({
            type: 'decode',
            data: {
                frameData,
            },
        }, [frameData]);
        if (!result || !('yuvData' in result)) {
            return;
        }
        const videoFrame = new VideoFrame(new Uint8Array(result.yuvData), {
            format: 'I420',
            codedWidth: result.width,
            codedHeight: result.height,
            timestamp: packet.timestamp * 1_000_000,
        });
        const videoSample = new VideoSample(videoFrame);
        this.onSample(videoSample);
    }
    async flush() {
        await this.sendCommand({ type: 'flush' });
    }
    close() {
        if (this.worker) {
            void this.sendCommand({ type: 'close' });
            this.worker.terminate();
        }
    }
    sendCommand(command, transferables) {
        return new Promise((resolve, reject) => {
            const id = this.nextMessageId++;
            this.pendingMessages.set(id, { resolve, reject });
            assert(this.worker !== null);
            if (transferables) {
                this.worker.postMessage({ id, command }, transferables);
            }
            else {
                this.worker.postMessage({ id, command });
            }
        });
    }
}
class Mpeg4Encoder extends CustomVideoEncoder {
    constructor() {
        super(...arguments);
        this.worker = null;
        this.nextMessageId = 0;
        this.pendingMessages = new Map();
        this.frameCount = 0;
    }
    static supports(codec, config) {
        return codec === 'mpeg4';
    }
    async init() {
        this.worker = (await createEncodeWorker());
        const onMessage = (event) => {
            const data = event.data;
            const pending = this.pendingMessages.get(data.id);
            assert(pending !== undefined);
            this.pendingMessages.delete(data.id);
            if (data.success) {
                pending.resolve(data.data);
            }
            else {
                pending.reject(data.error);
            }
        };
        this.worker.addEventListener('message', onMessage);
        const fpsNum = Math.round((this.config.framerate ?? 30) * 1000);
        const fpsDen = 1000;
        await this.sendCommand({
            type: 'init',
            data: {
                width: this.config.width,
                height: this.config.height,
                bitrate: this.config.bitrate ?? 2000000,
                fpsNum,
                fpsDen,
                wasmUrl: getCustomMpeg4WasmUrl() ?? undefined,
            },
        });
    }
    async encode(videoSample, options) {
        const yuvSize = videoSample.codedWidth * videoSample.codedHeight * 3 / 2;
        const yuvData = new ArrayBuffer(yuvSize);
        const yuvBytes = new Uint8Array(yuvData);
        await videoSample.copyTo(yuvBytes);
        const result = await this.sendCommand({
            type: 'encode',
            data: {
                yuvData,
                forceKeyframe: options.keyFrame ?? false,
            },
        }, [yuvData]);
        assert(result && 'encodedData' in result);
        const encodedPacket = new EncodedPacket(new Uint8Array(result.encodedData), options.keyFrame ? 'key' : 'delta', videoSample.timestamp, videoSample.duration, this.frameCount++);
        this.onPacket(encodedPacket, this.frameCount === 1
            ? {
                decoderConfig: {
                    codec: 'mpeg4',
                    codedWidth: this.config.width,
                    codedHeight: this.config.height,
                },
            }
            : undefined);
    }
    async flush() {
    }
    close() {
        if (this.worker) {
            void this.sendCommand({ type: 'close' });
            this.worker.terminate();
        }
    }
    sendCommand(command, transferables) {
        return new Promise((resolve, reject) => {
            const id = this.nextMessageId++;
            this.pendingMessages.set(id, { resolve, reject });
            assert(this.worker !== null);
            if (transferables) {
                this.worker.postMessage({ id, command }, transferables);
            }
            else {
                this.worker.postMessage({ id, command });
            }
        });
    }
}
/**
 * The MPEG-4 Part 2 decoder class.
 * @internal
 */
export { Mpeg4Decoder };
/**
 * The MPEG-4 Part 2 encoder class.
 * @internal
 */
export { Mpeg4Encoder };
/**
 * Registers the MPEG-4 Part 2 (Xvid) decoder, which Mediabunny will then use automatically when applicable.
 * Make sure to call this function before starting any decoding task.
 *
 * @param wasmUrl - Optional custom URL for xvid.wasm file (e.g., CDN URL)
 * @group \@mediabunny/mpeg4
 * @public
 */
export const registerMpeg4Decoder = (wasmUrl) => {
    if (wasmUrl)
        setMpeg4WasmUrl(wasmUrl);
    registerDecoder(Mpeg4Decoder);
};
/**
 * Registers the MPEG-4 Part 2 (Xvid) encoder, which Mediabunny will then use automatically when applicable.
 * Make sure to call this function before starting any encoding task.
 *
 * @param wasmUrl - Optional custom URL for xvid.wasm file (e.g., CDN URL)
 * @group \@mediabunny/mpeg4
 * @public
 */
export const registerMpeg4Encoder = (wasmUrl) => {
    if (wasmUrl)
        setMpeg4WasmUrl(wasmUrl);
    registerEncoder(Mpeg4Encoder);
};
export { setMpeg4WasmUrl } from './xvid-loader.js';
function assert(x) {
    if (!x) {
        throw new Error('Assertion failed.');
    }
}
