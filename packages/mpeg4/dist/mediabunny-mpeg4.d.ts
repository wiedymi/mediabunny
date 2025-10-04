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

export { }
export as namespace MediabunnyMpeg4;
