/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Environment-aware worker loader that works in:
 * - Browser (ESM modules)
 * - Node.js (worker_threads)
 * - Bundlers (Webpack, Vite, etc.)
 */
export function createWorker(workerPath: string): Worker {
	// Browser environment with ES modules
	if (typeof Worker !== 'undefined' && typeof document !== 'undefined') {
		try {
			// Try to use import.meta.url if available (ESM)
			if (typeof import.meta !== 'undefined' && import.meta.url) {
				const workerUrl = new URL(workerPath, import.meta.url).href;
				return new Worker(workerUrl, { type: 'module' });
			}
		} catch (e) {
			// Fallback for environments without import.meta.url
		}

		// Fallback: assume workerPath is absolute or relative to current page
		return new Worker(workerPath, { type: 'module' });
	}

	// Node.js environment
	if (typeof process !== 'undefined' && process.versions?.node) {
		let WorkerThreads: typeof import('worker_threads');
		let path: typeof import('path');
		let url: typeof import('url');

		try {
			// Dynamic require to avoid bundler issues
			WorkerThreads = require('worker_threads');
			path = require('path');
			url = require('url');

			// Resolve worker path relative to this module
			let resolvedPath: string;

			if (typeof import.meta !== 'undefined' && import.meta.url) {
				// ESM in Node.js
				resolvedPath = url.fileURLToPath(new URL(workerPath, import.meta.url));
			} else if (typeof __dirname !== 'undefined') {
				// CommonJS in Node.js
				resolvedPath = path.resolve(__dirname, workerPath);
			} else {
				throw new Error('Cannot resolve worker path in Node.js');
			}

			return new WorkerThreads.Worker(resolvedPath) as unknown as Worker;
		} catch (error) {
			throw new Error(`Failed to create worker in Node.js: ${error}`);
		}
	}

	throw new Error('Workers not supported in this environment');
}
