/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
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
export declare const registerMp3Encoder: () => void;
//# sourceMappingURL=index.d.ts.map