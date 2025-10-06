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

export { }
export as namespace MediabunnyEac3;
