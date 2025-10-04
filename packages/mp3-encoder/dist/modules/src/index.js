"use strict";
/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMp3Encoder = void 0;
const mediabunny_1 = require("mediabunny");
const mp3_misc_1 = require("../../../shared/mp3-misc");
// @ts-expect-error - esbuild inline worker plugin handles this
const encode_worker_ts_1 = __importDefault(require("./encode.worker.ts"));
class Mp3Encoder extends mediabunny_1.CustomAudioEncoder {
    constructor() {
        super(...arguments);
        this.worker = null;
        this.nextMessageId = 0;
        this.pendingMessages = new Map();
        this.buffer = new Uint8Array(2 ** 16);
        this.currentBufferOffset = 0;
        this.currentTimestamp = 0;
        this.chunkMetadata = {};
    }
    static supports(codec, config) {
        return codec === 'mp3'
            && (config.numberOfChannels === 1 || config.numberOfChannels === 2)
            && Object.values(mp3_misc_1.SAMPLING_RATES).some(x => x === config.sampleRate || (x / 2) === config.sampleRate || (x / 4) === config.sampleRate);
    }
    async init() {
        this.worker = (await (0, encode_worker_ts_1.default)()); // The actual encoding takes place in this worker
        const onMessage = (data) => {
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
        if (this.worker.addEventListener) {
            this.worker.addEventListener('message', event => onMessage(event.data));
        }
        else {
            const nodeWorker = this.worker;
            nodeWorker.on('message', onMessage);
        }
        assert(this.config.bitrate);
        await this.sendCommand({
            type: 'init',
            data: {
                numberOfChannels: this.config.numberOfChannels,
                sampleRate: this.config.sampleRate,
                bitrate: this.config.bitrate,
            },
        });
        this.chunkMetadata = {
            decoderConfig: {
                codec: 'mp3',
                numberOfChannels: this.config.numberOfChannels,
                sampleRate: this.config.sampleRate,
            },
        };
    }
    async encode(audioSample) {
        const sizePerChannel = audioSample.allocationSize({
            format: 's16-planar',
            planeIndex: 0,
        });
        const requiredBytes = audioSample.numberOfChannels * sizePerChannel;
        const audioData = new ArrayBuffer(requiredBytes);
        const audioBytes = new Uint8Array(audioData);
        for (let i = 0; i < audioSample.numberOfChannels; i++) {
            audioSample.copyTo(audioBytes.subarray(i * sizePerChannel), {
                format: 's16-planar', // LAME wants it in this format
                planeIndex: i,
            });
        }
        const result = await this.sendCommand({
            type: 'encode',
            data: {
                audioData,
                numberOfFrames: audioSample.numberOfFrames,
            },
        }, [audioData]);
        assert('encodedData' in result);
        this.digestOutput(new Uint8Array(result.encodedData));
    }
    async flush() {
        const result = await this.sendCommand({ type: 'flush' });
        assert('flushedData' in result);
        this.digestOutput(new Uint8Array(result.flushedData));
    }
    close() {
        this.worker?.terminate();
    }
    /**
     * LAME returns data in chunks, but a chunk doesn't need to contain a full MP3 frame. Therefore, we must accumulate
     * these chunks and extract the MP3 frames only when they're complete.
     */
    digestOutput(bytes) {
        const requiredBufferSize = this.currentBufferOffset + bytes.length;
        if (requiredBufferSize > this.buffer.length) {
            // Grow the buffer to the required size
            const newSize = 1 << Math.ceil(Math.log2(requiredBufferSize));
            const newBuffer = new Uint8Array(newSize);
            newBuffer.set(this.buffer);
            this.buffer = newBuffer;
        }
        this.buffer.set(bytes, this.currentBufferOffset);
        this.currentBufferOffset = requiredBufferSize;
        let pos = 0;
        while (pos <= this.currentBufferOffset - mp3_misc_1.FRAME_HEADER_SIZE) {
            const word = new DataView(this.buffer.buffer).getUint32(pos, false);
            const header = (0, mp3_misc_1.readFrameHeader)(word, null).header;
            if (!header) {
                break;
            }
            const fits = header.totalSize <= this.currentBufferOffset - pos;
            if (!fits) {
                // The frame isn't complete yet
                break;
            }
            const data = this.buffer.slice(pos, pos + header.totalSize);
            const duration = header.audioSamplesInFrame / header.sampleRate;
            this.onPacket(new mediabunny_1.EncodedPacket(data, 'key', this.currentTimestamp, duration), this.chunkMetadata);
            if (this.currentTimestamp === 0) {
                this.chunkMetadata = {}; // Mimic WebCodecs-like behavior
            }
            this.currentTimestamp += duration;
            pos += header.totalSize;
        }
        if (pos > 0) {
            // Shift the data
            this.buffer.set(this.buffer.subarray(pos, this.currentBufferOffset), 0);
            this.currentBufferOffset -= pos;
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
 * Registers the LAME MP3 encoder, which Mediabunny will then use automatically when applicable. Make sure to call this
 * function before starting any encoding task.
 *
 * Preferably, wrap the call in a condition to avoid overriding any native MP3 encoder:
 *
 * ```ts
 * import { canEncodeAudio } from 'mediabunny';
 * import { registerMp3Encoder } from '@mediabunny/mp3-encoder';
 *
 * if (!(await canEncodeAudio('mp3'))) {
 *     registerMp3Encoder();
 * }
 * ```
 *
 * @group \@mediabunny/mp3-encoder
 * @public
 */
const registerMp3Encoder = () => {
    (0, mediabunny_1.registerEncoder)(Mp3Encoder);
};
exports.registerMp3Encoder = registerMp3Encoder;
function assert(x) {
    if (!x) {
        throw new Error('Assertion failed.');
    }
}
