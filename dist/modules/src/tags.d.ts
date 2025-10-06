/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * Represents descriptive (non-technical) metadata about a media file, such as title, author, date, cover art, or other
 * attached files. Common tags are normalized by Mediabunny into a uniform format, while the `raw` field can be used to
 * directly read or write the underlying metadata tags (which differ by format).
 *
 * - For MP4/QuickTime files, the metadata refers to the data in `'moov'`-level `'udta'` and `'meta'` atoms.
 * - For WebM/Matroska files, the metadata refers to the Tags and Attachments elements whose target is 50 (MOVIE).
 * - For MP3 files, the metadata refers to the ID3v2 or ID3v1 tags.
 * - For Ogg files, there is no global metadata so instead, the metadata refers to the combined metadata of all tracks,
 * in Vorbis-style comment headers.
 * - For WAVE files, the metadata refers to the chunks within the RIFF INFO chunk.
 * - For ADTS files, there is no metadata.
 * - For FLAC files, the metadata lives in Vorbis style in the Vorbis comment block.
 *
 * @group Metadata tags
 * @public
 */
export type MetadataTags = {
    /** Title of the media (e.g. Gangnam Style, Titanic, etc.) */
    title?: string;
    /** Short description or subtitle of the media. */
    description?: string;
    /** Primary artist(s) or creator(s) of the work. */
    artist?: string;
    /** Album, collection, or compilation the media belongs to. */
    album?: string;
    /** Main credited artist for the album/collection as a whole. */
    albumArtist?: string;
    /** Position of this track within its album or collection (1-based). */
    trackNumber?: number;
    /** Total number of tracks in the album or collection. */
    tracksTotal?: number;
    /** Disc index if the release spans multiple discs (1-based). */
    discNumber?: number;
    /** Total number of discs in the release. */
    discsTotal?: number;
    /** Genre or category describing the media's style or content (e.g. Metal, Horror, etc.) */
    genre?: string;
    /** Release, recording or creation date of the media. */
    date?: Date;
    /** Full text lyrics or transcript associated with the media. */
    lyrics?: string;
    /** Freeform notes, remarks or commentary about the media. */
    comment?: string;
    /** Embedded images such as cover art, booklet scans, artwork or preview frames. */
    images?: AttachedImage[];
    /**
     * The raw, underlying metadata tags.
     *
     * This field can be used for both reading and writing. When reading, it represents the original tags that were used
     * to derive the normalized fields, and any additional metadata that Mediabunny doesn't understand. When writing, it
     * can be used to set arbitrary metadata tags in the output file.
     *
     * The format of these tags differs per format:
     * - MP4/QuickTime: By default, the keys refer to the names of the individual atoms in the `'ilst'` atom inside the
     * `'meta'` atom, and the values are derived from the content of the `'data'` atom inside them. When a `'keys'` atom
     * is also used, then the keys reflect the keys specified there (such as `'com.apple.quicktime.version'`).
     * Additionally, any atoms within the `'udta'` atom are dumped into here, however with unknown internal format
     * (`Uint8Array`).
     * - WebM/Matroska: `SimpleTag` elements whose target is 50 (MOVIE), either containing string or `Uint8Array`
     * values. Additionally, all attached files (such as font files) are included here, where the key corresponds to
     * the FileUID and the value is an {@link AttachedFile}.
     * - MP3: The ID3v2 tags, or a single `'TAG'` key with the contents of the ID3v1 tag.
     * - Ogg: The key-value string pairs from the Vorbis-style comment header (see RFC 7845, Section 5.2).
     * Additionally, the `'vendor'` key refers to the vendor string within this header.
     * - WAVE: The individual metadata chunks within the RIFF INFO chunk. Values are always ISO 8859-1 strings.
     * - FLAC: The key-value string pairs from the vorbis metadata block (see RFC 9639, Section D.2.3).
     * Additionally, the `'vendor'` key refers to the vendor string within this header.
    */
    raw?: Record<string, string | Uint8Array | RichImageData | AttachedFile | null>;
};
/**
 * An embedded image such as cover art, booklet scan, artwork or preview frame.
 *
 * @group Metadata tags
 * @public
 */
export type AttachedImage = {
    /** The raw image data. */
    data: Uint8Array;
    /** An RFC 6838 MIME type (e.g. image/jpeg, image/png, etc.) */
    mimeType: string;
    /** The kind or purpose of the image. */
    kind: 'coverFront' | 'coverBack' | 'unknown';
    /** The name of the image file. */
    name?: string;
    /** A description of the image. */
    description?: string;
};
/**
 * Image data with additional metadata.
 *
 * @group Metadata tags
 * @public
 */
export declare class RichImageData {
    /** The raw image data. */
    data: Uint8Array;
    /** An RFC 6838 MIME type (e.g. image/jpeg, image/png, etc.) */
    mimeType: string;
    /** Creates a new {@link RichImageData}. */
    constructor(
    /** The raw image data. */
    data: Uint8Array, 
    /** An RFC 6838 MIME type (e.g. image/jpeg, image/png, etc.) */
    mimeType: string);
}
/**
 * A file attached to a media file.
 *
 * @group Metadata tags
 * @public
 */
export declare class AttachedFile {
    /** The raw file data. */
    data: Uint8Array;
    /** An RFC 6838 MIME type (e.g. image/jpeg, image/png, font/ttf, etc.) */
    mimeType?: string | undefined;
    /** The name of the file. */
    name?: string | undefined;
    /** A description of the file. */
    description?: string | undefined;
    /** Creates a new {@link AttachedFile}. */
    constructor(
    /** The raw file data. */
    data: Uint8Array, 
    /** An RFC 6838 MIME type (e.g. image/jpeg, image/png, font/ttf, etc.) */
    mimeType?: string | undefined, 
    /** The name of the file. */
    name?: string | undefined, 
    /** A description of the file. */
    description?: string | undefined);
}
export declare const validateMetadataTags: (tags: MetadataTags) => void;
export declare const metadataTagsAreEmpty: (tags: MetadataTags) => boolean;
//# sourceMappingURL=tags.d.ts.map