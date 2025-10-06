/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
export type ExtendedEmscriptenModule = EmscriptenModule & {
    cwrap: typeof cwrap;
};
/**
 * Set custom URL for E-AC-3 WASM file.
 * Useful for loading from CDN or custom hosting.
 * Must be called before any decoder/encoder initialization.
 *
 * @param url - Direct URL to eac3.wasm file
 * @group \@mediabunny/eac3
 * @public
 */
export declare function setEac3WasmUrl(url: string): void;
export declare function getEac3Module(): Promise<ExtendedEmscriptenModule>;
//# sourceMappingURL=eac3-loader.d.ts.map