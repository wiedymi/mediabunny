/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import createModule from '../build/eac3.js';

export type ExtendedEmscriptenModule = EmscriptenModule & {
	cwrap: typeof cwrap;
};

let cachedModule: ExtendedEmscriptenModule | null = null;

export async function getEac3Module(): Promise<ExtendedEmscriptenModule> {
	if (!cachedModule) {
		cachedModule = (await createModule({
			locateFile: (path: string) => {
				if (path.endsWith('.wasm')) {
					// For bundles, WASM is in the same directory
					// For modules, use relative path
					try {
						// @ts-ignore - import.meta may not be available in all envs
						return new URL('eac3.wasm', import.meta.url).href;
					} catch {
						// Fallback for non-ESM environments
						return path;
					}
				}
				return path;
			},
		})) as ExtendedEmscriptenModule;
	}
	return cachedModule;
}
