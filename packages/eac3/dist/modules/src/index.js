/*!
 * Copyright (c) 2025-present, Vanilagy and contributors (Wiedy Mi)
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { CustomAudioDecoder, CustomAudioEncoder, EncodedPacket, AudioSample, registerDecoder, registerEncoder } from 'mediabunny';
import { setEac3WasmUrl, getCustomWasmUrl as getCustomEac3WasmUrl } from './eac3-loader.js';
// @ts-expect-error - esbuild inline worker plugin handles this
import createDecodeWorker from './decode.worker.ts';
// @ts-expect-error - esbuild inline worker plugin handles this
import createEncodeWorker from './encode.worker.ts';
class Eac3Decoder extends CustomAudioDecoder {
    constructor() {
        super(...arguments);
        this.worker = null;
        this.nextMessageId = 0;
        this.pendingMessages = new Map();
    }
    static supports(codec, config) {
        return codec === 'eac3' || codec === 'ac3';
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
                sampleRate: this.config.sampleRate,
                channels: this.config.numberOfChannels,
                codec: this.codec,
                wasmUrl: getCustomEac3WasmUrl() ?? undefined,
            },
        });
    }
    async decode(packet) {
        const packetData = packet.data.slice().buffer;
        const result = await this.sendCommand({
            type: 'decode',
            data: { packetData },
        }, [packetData]);
        if (!result || !('pcmData' in result)) {
            return;
        }
        const audioSample = new AudioSample({
            data: new Float32Array(result.pcmData),
            format: 'f32',
            numberOfChannels: result.channels,
            sampleRate: result.sampleRate,
            timestamp: packet.timestamp,
        });
        this.onSample(audioSample);
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
            assert(this.worker);
            if (transferables) {
                this.worker.postMessage({ id, command }, transferables);
            }
            else {
                this.worker.postMessage({ id, command });
            }
        });
    }
}
class Eac3Encoder extends CustomAudioEncoder {
    constructor() {
        super(...arguments);
        this.worker = null;
        this.nextMessageId = 0;
        this.pendingMessages = new Map();
        this.currentTimestamp = 0;
        this.chunkMetadata = {};
    }
    static supports(codec, config) {
        return codec === 'eac3' || codec === 'ac3';
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
        assert(this.config.bitrate);
        await this.sendCommand({
            type: 'init',
            data: {
                sampleRate: this.config.sampleRate,
                channels: this.config.numberOfChannels,
                bitrate: this.config.bitrate,
                codec: this.codec,
                wasmUrl: getCustomEac3WasmUrl() ?? undefined,
            },
        });
        this.chunkMetadata = {
            decoderConfig: {
                codec: this.codec === 'eac3' ? 'ec-3' : 'ac3',
                numberOfChannels: this.config.numberOfChannels,
                sampleRate: this.config.sampleRate,
            },
        };
    }
    async encode(audioSample) {
        const sizePerChannel = audioSample.allocationSize({
            format: 'f32-planar',
            planeIndex: 0,
        });
        const requiredBytes = audioSample.numberOfChannels * sizePerChannel;
        const audioData = new ArrayBuffer(requiredBytes);
        const audioBytes = new Uint8Array(audioData);
        for (let i = 0; i < audioSample.numberOfChannels; i++) {
            audioSample.copyTo(audioBytes.subarray(i * sizePerChannel), {
                format: 'f32-planar',
                planeIndex: i,
            });
        }
        const result = await this.sendCommand({
            type: 'encode',
            data: {
                pcmData: audioData,
                numberOfFrames: audioSample.numberOfFrames,
            },
        }, [audioData]);
        assert(result && 'encodedData' in result);
        const duration = audioSample.numberOfFrames / this.config.sampleRate;
        const encodedPacket = new EncodedPacket(new Uint8Array(result.encodedData), 'key', this.currentTimestamp, duration);
        this.onPacket(encodedPacket, this.currentTimestamp === 0 ? this.chunkMetadata : undefined);
        if (this.currentTimestamp === 0) {
            this.chunkMetadata = {};
        }
        this.currentTimestamp += duration;
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
            assert(this.worker);
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
 * Registers the E-AC-3/AC-3 decoder, which Mediabunny will then use automatically when applicable.
 * Make sure to call this function before starting any decoding task.
 *
 * @param wasmUrl - Optional custom URL for eac3.wasm file (e.g., CDN URL)
 * @group \@mediabunny/eac3
 * @public
 */
export const registerEac3Decoder = (wasmUrl) => {
    if (wasmUrl)
        setEac3WasmUrl(wasmUrl);
    registerDecoder(Eac3Decoder);
};
/**
 * Registers the E-AC-3/AC-3 encoder, which Mediabunny will then use automatically when applicable.
 * Make sure to call this function before starting any encoding task.
 *
 * @param wasmUrl - Optional custom URL for eac3.wasm file (e.g., CDN URL)
 * @group \@mediabunny/eac3
 * @public
 */
export const registerEac3Encoder = (wasmUrl) => {
    if (wasmUrl)
        setEac3WasmUrl(wasmUrl);
    registerEncoder(Eac3Encoder);
};
export { setEac3WasmUrl } from './eac3-loader.js';
function assert(x) {
    if (!x) {
        throw new Error('Assertion failed.');
    }
}
