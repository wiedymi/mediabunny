/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
export const buildMatroskaMimeType = (info) => {
    const base = info.hasVideo
        ? 'video/'
        : info.hasAudio
            ? 'audio/'
            : 'application/';
    let string = base + (info.isWebM ? 'webm' : 'x-matroska');
    if (info.codecStrings.length > 0) {
        const uniqueCodecMimeTypes = [...new Set(info.codecStrings.filter(Boolean))];
        string += `; codecs="${uniqueCodecMimeTypes.join(', ')}"`;
    }
    return string;
};
