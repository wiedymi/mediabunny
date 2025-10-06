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
 * Set custom URL for MPEG-4 WASM file.
 * Useful for loading from CDN or custom hosting.
 * Must be called before any decoder/encoder initialization.
 *
 * @param url - Direct URL to xvid.wasm file
 * @group \@mediabunny/mpeg4
 * @public
 */
export declare function setMpeg4WasmUrl(url: string): void;
export declare function getXvidModule(): Promise<ExtendedEmscriptenModule>;
//# sourceMappingURL=xvid-loader.d.ts.map