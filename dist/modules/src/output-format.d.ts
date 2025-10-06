/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { AudioCodec, MediaCodec, SubtitleCodec, VideoCodec } from './codec.js';
import { MediaSource } from './media-source.js';
import { TrackType } from './output.js';
/**
 * Specifies an inclusive range of integers.
 * @group Miscellaneous
 * @public
 */
export type InclusiveIntegerRange = {
    /** The integer cannot be less than this. */
    min: number;
    /** The integer cannot be greater than this. */
    max: number;
};
/**
 * Specifies the number of tracks (for each track type and in total) that an output format supports.
 * @group Output formats
 * @public
 */
export type TrackCountLimits = {
    [K in TrackType]: InclusiveIntegerRange;
} & {
    /** Specifies the overall allowed range of track counts for the output format. */
    total: InclusiveIntegerRange;
};
/**
 * Base class representing an output media file format.
 * @group Output formats
 * @public
 */
export declare abstract class OutputFormat {
    /** The file extension used by this output format, beginning with a dot. */
    abstract get fileExtension(): string;
    /** The base MIME type of the output format. */
    abstract get mimeType(): string;
    /** Returns a list of media codecs that this output format can contain. */
    abstract getSupportedCodecs(): MediaCodec[];
    /** Returns the number of tracks that this output format supports. */
    abstract getSupportedTrackCounts(): TrackCountLimits;
    /** Whether this output format supports video rotation metadata. */
    abstract get supportsVideoRotationMetadata(): boolean;
    /** Returns a list of video codecs that this output format can contain. */
    getSupportedVideoCodecs(): VideoCodec[];
    /** Returns a list of audio codecs that this output format can contain. */
    getSupportedAudioCodecs(): AudioCodec[];
    /** Returns a list of subtitle codecs that this output format can contain. */
    getSupportedSubtitleCodecs(): SubtitleCodec[];
}
/**
 * ISOBMFF-specific output options.
 * @group Output formats
 * @public
 */
export type IsobmffOutputFormatOptions = {
    /**
     * Controls the placement of metadata in the file. Placing metadata at the start of the file is known as "Fast
     * Start", which results in better playback at the cost of more required processing or memory.
     *
     * Use `false` to disable Fast Start, placing the metadata at the end of the file. Fastest and uses the least
     * memory.
     *
     * Use `'in-memory'` to produce a file with Fast Start by keeping all media chunks in memory until the file is
     * finalized. This produces a high-quality and compact output at the cost of a more expensive finalization step and
     * higher memory requirements. Data will be written monotonically (in order) when this option is set.
     *
     * Use `'reserve'` to reserve space at the start of the file into which the metadata will be written later.	This
     * produces a file with Fast Start but requires knowledge about the expected length of the file beforehand. When
     * using this option, you must set the {@link BaseTrackMetadata.maximumPacketCount} field in the track metadata
     * for all tracks.
     *
     * Use `'fragmented'` to place metadata at the start of the file by creating a fragmented file (fMP4). In a
     * fragmented file, chunks of media and their metadata are written to the file in "fragments", eliminating the need
     * to put all metadata in one place. Fragmented files are useful for streaming contexts, as each fragment can be
     * played individually without requiring knowledge of the other fragments. Furthermore, they remain lightweight to
     * create even for very large files, as they don't require all media to be kept in memory. However, fragmented files
     * are not as widely and wholly supported as regular MP4/MOV files. Data will be written monotonically (in order)
     * when this option is set.
     *
     * When this field is not defined, either `false` or `'in-memory'` will be used, automatically determined based on
     * the type of output target used.
     */
    fastStart?: false | 'in-memory' | 'reserve' | 'fragmented';
    /**
     * When using `fastStart: 'fragmented'`, this field controls the minimum duration of each fragment, in seconds.
     * New fragments will only be created when the current fragment is longer than this value. Defaults to 1 second.
     */
    minimumFragmentDuration?: number;
    /**
     * The metadata format to use for writing metadata tags.
     *
     * - `'auto'` (default): Behaves like `'mdir'` for MP4 and like `'udta'` for QuickTime, matching FFmpeg's default
     * behavior.
     * - `'mdir'`: Write tags into `moov/udta/meta` using the 'mdir' handler format.
     * - `'mdta'`: Write tags into `moov/udta/meta` using the 'mdta' handler format, equivalent to FFmpeg's
     * `use_metadata_tags` flag. This allows for custom keys of arbitrary length.
     * - `'udta'`: Write tags directly into `moov/udta`.
     */
    metadataFormat?: 'auto' | 'mdir' | 'mdta' | 'udta';
    /**
     * Will be called once the ftyp (File Type) box of the output file has been written.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onFtyp?: (data: Uint8Array, position: number) => unknown;
    /**
     * Will be called once the moov (Movie) box of the output file has been written.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onMoov?: (data: Uint8Array, position: number) => unknown;
    /**
     * Will be called for each finalized mdat (Media Data) box of the output file. Usage of this callback is not
     * recommended when not using `fastStart: 'fragmented'`, as there will be one monolithic mdat box which might
     * require large amounts of memory.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onMdat?: (data: Uint8Array, position: number) => unknown;
    /**
     * Will be called for each finalized moof (Movie Fragment) box of the output file.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     * @param timestamp - The start timestamp of the fragment in seconds.
     */
    onMoof?: (data: Uint8Array, position: number, timestamp: number) => unknown;
};
/**
 * Format representing files compatible with the ISO base media file format (ISOBMFF), like MP4 or MOV files.
 * @group Output formats
 * @public
 */
export declare abstract class IsobmffOutputFormat extends OutputFormat {
    /** Internal constructor. */
    constructor(options?: IsobmffOutputFormatOptions);
    getSupportedTrackCounts(): TrackCountLimits;
    get supportsVideoRotationMetadata(): boolean;
}
/**
 * MPEG-4 Part 14 (MP4) file format. Supports most codecs.
 * @group Output formats
 * @public
 */
export declare class Mp4OutputFormat extends IsobmffOutputFormat {
    /** Creates a new {@link Mp4OutputFormat} configured with the specified `options`. */
    constructor(options?: IsobmffOutputFormatOptions);
    get fileExtension(): string;
    get mimeType(): string;
    getSupportedCodecs(): MediaCodec[];
}
/**
 * QuickTime File Format (QTFF), often called MOV. Supports all video and audio codecs, but not subtitle codecs.
 * @group Output formats
 * @public
 */
export declare class MovOutputFormat extends IsobmffOutputFormat {
    /** Creates a new {@link MovOutputFormat} configured with the specified `options`. */
    constructor(options?: IsobmffOutputFormatOptions);
    get fileExtension(): string;
    get mimeType(): string;
    getSupportedCodecs(): MediaCodec[];
}
/**
 * Matroska-specific output options.
 * @group Output formats
 * @public
 */
export type MkvOutputFormatOptions = {
    /**
     * Configures the output to only append new data at the end, useful for live-streaming the file as it's being
     * created. When enabled, some features such as storing duration and seeking will be disabled or impacted, so don't
     * use this option when you want to write out a clean file for later use.
     */
    appendOnly?: boolean;
    /**
     * This field controls the minimum duration of each Matroska cluster, in seconds. New clusters will only be created
     * when the current cluster is longer than this value. Defaults to 1 second.
     */
    minimumClusterDuration?: number;
    /**
     * Will be called once the EBML header of the output file has been written.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onEbmlHeader?: (data: Uint8Array, position: number) => void;
    /**
     * Will be called once the header part of the Matroska Segment element has been written. The header data includes
     * the Segment element and everything inside it, up to (but excluding) the first Matroska Cluster.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onSegmentHeader?: (data: Uint8Array, position: number) => unknown;
    /**
     * Will be called for each finalized Matroska Cluster of the output file.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     * @param timestamp - The start timestamp of the cluster in seconds.
     */
    onCluster?: (data: Uint8Array, position: number, timestamp: number) => unknown;
};
/**
 * Matroska file format.
 *
 * Supports writing transparent video. For a video track to be marked as transparent, the first packet added must
 * contain alpha side data.
 *
 * @group Output formats
 * @public
 */
export declare class MkvOutputFormat extends OutputFormat {
    /** Creates a new {@link MkvOutputFormat} configured with the specified `options`. */
    constructor(options?: MkvOutputFormatOptions);
    getSupportedTrackCounts(): TrackCountLimits;
    get fileExtension(): string;
    get mimeType(): string;
    getSupportedCodecs(): MediaCodec[];
    get supportsVideoRotationMetadata(): boolean;
}
/**
 * WebM-specific output options.
 * @group Output formats
 * @public
 */
export type WebMOutputFormatOptions = MkvOutputFormatOptions;
/**
 * WebM file format, based on Matroska.
 *
 * Supports writing transparent video. For a video track to be marked as transparent, the first packet added must
 * contain alpha side data.
 *
 * @group Output formats
 * @public
 */
export declare class WebMOutputFormat extends MkvOutputFormat {
    /** Creates a new {@link WebMOutputFormat} configured with the specified `options`. */
    constructor(options?: MkvOutputFormatOptions);
    getSupportedCodecs(): MediaCodec[];
    get fileExtension(): string;
    get mimeType(): string;
}
/**
 * MP3-specific output options.
 * @group Output formats
 * @public
 */
export type Mp3OutputFormatOptions = {
    /**
     * Controls whether the Xing header, which contains additional metadata as well as an index, is written to the start
     * of the MP3 file. When disabled, the writing process becomes append-only. Defaults to `true`.
     */
    xingHeader?: boolean;
    /**
     * Will be called once the Xing metadata frame is finalized.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onXingFrame?: (data: Uint8Array, position: number) => unknown;
};
/**
 * MP3 file format.
 * @group Output formats
 * @public
 */
export declare class Mp3OutputFormat extends OutputFormat {
    /** Creates a new {@link Mp3OutputFormat} configured with the specified `options`. */
    constructor(options?: Mp3OutputFormatOptions);
    getSupportedTrackCounts(): TrackCountLimits;
    get fileExtension(): string;
    get mimeType(): string;
    getSupportedCodecs(): MediaCodec[];
    get supportsVideoRotationMetadata(): boolean;
}
/**
 * WAVE-specific output options.
 * @group Output formats
 * @public
 */
export type WavOutputFormatOptions = {
    /**
     * When enabled, an RF64 file will be written, allowing for file sizes to exceed 4 GiB, which is otherwise not
     * possible for regular WAVE files.
     */
    large?: boolean;
    /**
     * The metadata format to use for writing metadata tags.
     *
     * - `'info'` (default): Writes metadata into a RIFF INFO LIST chunk, the default way to contain metadata tags
     * within WAVE. Only allows for a limited subset of tags to be written.
     * - `'id3'`: Writes metadata into an ID3 chunk. Non-default, but used by many taggers in practice. Allows for a
     * much larger and richer set of tags to be written.
     */
    metadataFormat?: 'info' | 'id3';
    /**
     * Will be called once the file header is written. The header consists of the RIFF header, the format chunk,
     * metadata chunks, and the start of the data chunk (with a placeholder size of 0).
     */
    onHeader?: (data: Uint8Array, position: number) => unknown;
};
/**
 * WAVE file format, based on RIFF.
 * @group Output formats
 * @public
 */
export declare class WavOutputFormat extends OutputFormat {
    /** Creates a new {@link WavOutputFormat} configured with the specified `options`. */
    constructor(options?: WavOutputFormatOptions);
    getSupportedTrackCounts(): TrackCountLimits;
    get fileExtension(): string;
    get mimeType(): string;
    getSupportedCodecs(): MediaCodec[];
    get supportsVideoRotationMetadata(): boolean;
}
/**
 * Ogg-specific output options.
 * @group Output formats
 * @public
 */
export type OggOutputFormatOptions = {
    /**
     * Will be called for each Ogg page that is written.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     * @param source - The {@link MediaSource} backing the page's logical bitstream (track).
     */
    onPage?: (data: Uint8Array, position: number, source: MediaSource) => unknown;
};
/**
 * Ogg file format.
 * @group Output formats
 * @public
 */
export declare class OggOutputFormat extends OutputFormat {
    /** Creates a new {@link OggOutputFormat} configured with the specified `options`. */
    constructor(options?: OggOutputFormatOptions);
    getSupportedTrackCounts(): TrackCountLimits;
    get fileExtension(): string;
    get mimeType(): string;
    getSupportedCodecs(): MediaCodec[];
    get supportsVideoRotationMetadata(): boolean;
}
/**
 * ADTS-specific output options.
 * @group Output formats
 * @public
 */
export type AdtsOutputFormatOptions = {
    /**
     * Will be called for each ADTS frame that is written.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onFrame?: (data: Uint8Array, position: number) => unknown;
};
/**
 * ADTS file format.
 * @group Output formats
 * @public
 */
export declare class AdtsOutputFormat extends OutputFormat {
    /** Creates a new {@link AdtsOutputFormat} configured with the specified `options`. */
    constructor(options?: AdtsOutputFormatOptions);
    getSupportedTrackCounts(): TrackCountLimits;
    get fileExtension(): string;
    get mimeType(): string;
    getSupportedCodecs(): MediaCodec[];
    get supportsVideoRotationMetadata(): boolean;
}
/**
 * FLAC-specific output options.
 * @group Output formats
 * @public
 */
export type FlacOutputFormatOptions = {
    /**
     * Will be called for each FLAC frame that is written.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onFrame?: (data: Uint8Array, position: number) => unknown;
};
/**
 * AVI-specific output options.
 * @group Output formats
 * @public
 */
export type AviOutputFormatOptions = {
    /**
     * When enabled, an RF64 file will be written, allowing for file sizes to exceed 4 GiB, which is otherwise not
     * possible for regular AVI files.
     */
    large?: boolean;
    /**
     * Will be called once the header list (hdrl) is finalized.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onHeader?: (data: Uint8Array, position: number) => unknown;
    /**
     * Will be called once the index (idx1) is finalized.
     *
     * @param data - The raw bytes.
     * @param position - The byte offset of the data in the file.
     */
    onIndex?: (data: Uint8Array, position: number) => unknown;
};
/**
 * AVI file format, based on RIFF.
 *
 * **Note:** MPEG-4 and E-AC-3/AC-3 codecs require their respective extensions
 * ([\@mediabunny/mpeg4](https://www.npmjs.com/package/\@mediabunny/mpeg4),
 * [\@mediabunny/eac3](https://www.npmjs.com/package/\@mediabunny/eac3)) to be registered.
 *
 * @group Output formats
 * @public
 */
export declare class AviOutputFormat extends OutputFormat {
    /** Creates a new {@link AviOutputFormat} configured with the specified `options`. */
    constructor(options?: AviOutputFormatOptions);
    getSupportedTrackCounts(): TrackCountLimits;
    get fileExtension(): string;
    get mimeType(): string;
    getSupportedCodecs(): MediaCodec[];
    get supportsVideoRotationMetadata(): boolean;
}
/**
 * FLAC file format.
 * @group Output formats
 * @public
 */
export declare class FlacOutputFormat extends OutputFormat {
    /** Creates a new {@link FlacOutputFormat} configured with the specified `options`. */
    constructor(options?: FlacOutputFormatOptions);
    getSupportedTrackCounts(): TrackCountLimits;
    get fileExtension(): string;
    get mimeType(): string;
    getSupportedCodecs(): MediaCodec[];
    get supportsVideoRotationMetadata(): boolean;
}
//# sourceMappingURL=output-format.d.ts.map