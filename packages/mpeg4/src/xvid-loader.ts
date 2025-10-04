/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import createModule from '../build/xvid.js';

export type ExtendedEmscriptenModule = EmscriptenModule & {
	cwrap: typeof cwrap;
};

let cachedModule: ExtendedEmscriptenModule | null = null;

// Allow users to override the WASM URL (useful for CDN hosting)
let customWasmUrl: string | null = null;

/**
 * Set custom URL for MPEG-4 WASM file.
 * Useful for loading from CDN or custom hosting.
 * Must be called before any decoder/encoder initialization.
 *
 * @param url - Direct URL to xvid.wasm file
 * @group \@mediabunny/mpeg4
 * @public
 */
export function setMpeg4WasmUrl(url: string): void {
	customWasmUrl = url;
}

function locateWasmFile(): string {
	// User-provided custom URL - skip all auto-detection
	if (customWasmUrl) {
		return customWasmUrl;
	}

	// Auto-detect: Browser with ESM support
	if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
		try {
			if (typeof import.meta !== 'undefined' && import.meta.url) {
				return new URL('xvid.wasm', import.meta.url).href;
			}
		} catch {}
	}

	// Auto-detect: Node.js environment
	if (typeof process !== 'undefined' && process.versions?.node) {
		try {
			const path = typeof require !== 'undefined' ? require('path') : null;
			const fs = typeof require !== 'undefined' ? require('fs') : null;

			if (path && fs) {
				// Try relative to bundle (for dist/bundles/)
				if (typeof __dirname !== 'undefined') {
					const bundlePath = path.join(__dirname, 'xvid.wasm');
					if (fs.existsSync(bundlePath)) {
						return bundlePath;
					}
				}

				// Try using import.meta.url in ESM
				if (typeof import.meta !== 'undefined' && import.meta.url) {
					const url = typeof require !== 'undefined' ? require('url') : null;
					if (url) {
						return url.fileURLToPath(new URL('xvid.wasm', import.meta.url));
					}
				}
			}
		} catch {}
	}

	// Final fallback
	return 'xvid.wasm';
}

export async function getXvidModule(): Promise<ExtendedEmscriptenModule> {
	if (!cachedModule) {
		cachedModule = (await createModule({
			locateFile: (path: string) => {
				if (path.endsWith('.wasm')) {
					return locateWasmFile();
				}
				return path;
			},
		})) as ExtendedEmscriptenModule;
	}
	return cachedModule;
}
