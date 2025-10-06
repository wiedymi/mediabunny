/*!
 * Copyright (c) 2025-present, Vanilagy and contributors (Wiedy Mi)
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { getXvidModule, setMpeg4WasmUrl } from './xvid-loader.js';
let module;
let encoderState;
let width;
let height;
let initEncoder;
let encodeFrame;
let closeEncoder;
let inputSlice = null;
let outputSlice = null;
const init = async (w, h, bitrate, fpsNum, fpsDen, wasmUrl) => {
    width = w;
    height = h;
    if (wasmUrl) {
        setMpeg4WasmUrl(wasmUrl);
    }
    module = await getXvidModule();
    initEncoder = module.cwrap('init_encoder', 'number', ['number', 'number', 'number', 'number', 'number']);
    encodeFrame = module.cwrap('encode_frame', 'number', ['number', 'number', 'number', 'number', 'number']);
    closeEncoder = module.cwrap('close_encoder', null, ['number']);
    encoderState = initEncoder(width, height, bitrate, fpsNum, fpsDen);
    if (!encoderState) {
        throw new Error('Failed to initialize Xvid encoder');
    }
};
const encode = (yuvData, forceKeyframe) => {
    const yuvBytes = new Uint8Array(yuvData);
    inputSlice = maybeGrowSlice(inputSlice, yuvBytes.length);
    module.HEAPU8.set(yuvBytes, inputSlice.ptr);
    const maxOutputSize = width * height * 2;
    outputSlice = maybeGrowSlice(outputSlice, maxOutputSize);
    const encodedSize = encodeFrame(encoderState, inputSlice.ptr, outputSlice.ptr, maxOutputSize, forceKeyframe ? 1 : 0);
    if (encodedSize < 0) {
        throw new Error(`Xvid encode error: ${encodedSize}`);
    }
    const encodedData = module.HEAPU8.slice(outputSlice.ptr, outputSlice.ptr + encodedSize).buffer;
    return { encodedData };
};
const close = () => {
    if (encoderState) {
        closeEncoder(encoderState);
    }
    return { closed: true };
};
const maybeGrowSlice = (slice, requiredSize) => {
    if (!slice || slice.size < requiredSize) {
        if (slice) {
            module._free(slice.ptr);
        }
        const newSize = 1 << Math.ceil(Math.log2(requiredSize));
        return {
            ptr: module._malloc(newSize),
            size: newSize,
        };
    }
    return slice;
};
const onMessage = async (data) => {
    let responseData;
    let success = true;
    let error;
    try {
        const { command } = data;
        if (command.type === 'init') {
            await init(command.data.width, command.data.height, command.data.bitrate, command.data.fpsNum, command.data.fpsDen, command.data.wasmUrl);
            responseData = null;
        }
        else if (command.type === 'encode') {
            responseData = encode(command.data.yuvData, command.data.forceKeyframe);
        }
        else if (command.type === 'close') {
            close();
            responseData = { closed: true };
        }
        else {
            throw new Error('Unknown command type.');
        }
    }
    catch (e) {
        success = false;
        error = e;
        responseData = { closed: true };
    }
    const response = {
        id: data.id,
        success,
        data: responseData,
        error,
    };
    if (parentPort) {
        parentPort.postMessage(response);
    }
    else {
        self.postMessage(response);
    }
};
let parentPort = null;
if (typeof self === 'undefined') {
    const workerModule = 'worker_threads';
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    parentPort = require(workerModule).parentPort;
}
if (parentPort) {
    parentPort.on('message', onMessage);
}
else {
    self.addEventListener('message', event => void onMessage(event.data));
}
