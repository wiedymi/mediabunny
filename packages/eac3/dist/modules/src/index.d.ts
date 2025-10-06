/*!
 * Copyright (c) 2025-present, Vanilagy and contributors (Wiedy Mi)
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * Registers the E-AC-3/AC-3 decoder, which Mediabunny will then use automatically when applicable.
 * Make sure to call this function before starting any decoding task.
 *
 * @param wasmUrl - Optional custom URL for eac3.wasm file (e.g., CDN URL)
 * @group \@mediabunny/eac3
 * @public
 */
export declare const registerEac3Decoder: (wasmUrl?: string) => void;
/**
 * Registers the E-AC-3/AC-3 encoder, which Mediabunny will then use automatically when applicable.
 * Make sure to call this function before starting any encoding task.
 *
 * @param wasmUrl - Optional custom URL for eac3.wasm file (e.g., CDN URL)
 * @group \@mediabunny/eac3
 * @public
 */
export declare const registerEac3Encoder: (wasmUrl?: string) => void;
export { setEac3WasmUrl } from './eac3-loader.js';
//# sourceMappingURL=index.d.ts.map