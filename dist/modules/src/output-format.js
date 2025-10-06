/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { AdtsMuxer } from './adts/adts-muxer.js';
import { AUDIO_CODECS, NON_PCM_AUDIO_CODECS, PCM_AUDIO_CODECS, SUBTITLE_CODECS, VIDEO_CODECS, } from './codec.js';
import { FlacMuxer } from './flac/flac-muxer.js';
import { IsobmffMuxer } from './isobmff/isobmff-muxer.js';
import { MatroskaMuxer } from './matroska/matroska-muxer.js';
import { Mp3Muxer } from './mp3/mp3-muxer.js';
import { OggMuxer } from './ogg/ogg-muxer.js';
import { WaveMuxer } from './wave/wave-muxer.js';
import { AVIMuxer } from './avi/avi-muxer.js';
/**
 * Base class representing an output media file format.
 * @group Output formats
 * @public
 */
export class OutputFormat {
    /** Returns a list of video codecs that this output format can contain. */
    getSupportedVideoCodecs() {
        return this.getSupportedCodecs()
            .filter(codec => VIDEO_CODECS.includes(codec));
    }
    /** Returns a list of audio codecs that this output format can contain. */
    getSupportedAudioCodecs() {
        return this.getSupportedCodecs()
            .filter(codec => AUDIO_CODECS.includes(codec));
    }
    /** Returns a list of subtitle codecs that this output format can contain. */
    getSupportedSubtitleCodecs() {
        return this.getSupportedCodecs()
            .filter(codec => SUBTITLE_CODECS.includes(codec));
    }
    /** @internal */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _codecUnsupportedHint(codec) {
        return '';
    }
}
/**
 * Format representing files compatible with the ISO base media file format (ISOBMFF), like MP4 or MOV files.
 * @group Output formats
 * @public
 */
export class IsobmffOutputFormat extends OutputFormat {
    /** Internal constructor. */
    constructor(options = {}) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('options must be an object.');
        }
        if (options.fastStart !== undefined
            && ![false, 'in-memory', 'reserve', 'fragmented'].includes(options.fastStart)) {
            throw new TypeError('options.fastStart, when provided, must be false, \'in-memory\', \'reserve\', or \'fragmented\'.');
        }
        if (options.minimumFragmentDuration !== undefined
            && (!Number.isFinite(options.minimumFragmentDuration) || options.minimumFragmentDuration < 0)) {
            throw new TypeError('options.minimumFragmentDuration, when provided, must be a non-negative number.');
        }
        if (options.onFtyp !== undefined && typeof options.onFtyp !== 'function') {
            throw new TypeError('options.onFtyp, when provided, must be a function.');
        }
        if (options.onMoov !== undefined && typeof options.onMoov !== 'function') {
            throw new TypeError('options.onMoov, when provided, must be a function.');
        }
        if (options.onMdat !== undefined && typeof options.onMdat !== 'function') {
            throw new TypeError('options.onMdat, when provided, must be a function.');
        }
        if (options.onMoof !== undefined && typeof options.onMoof !== 'function') {
            throw new TypeError('options.onMoof, when provided, must be a function.');
        }
        if (options.metadataFormat !== undefined
            && !['mdir', 'mdta', 'udta', 'auto'].includes(options.metadataFormat)) {
            throw new TypeError('options.metadataFormat, when provided, must be either \'auto\', \'mdir\', \'mdta\', or \'udta\'.');
        }
        super();
        this._options = options;
    }
    getSupportedTrackCounts() {
        return {
            video: { min: 0, max: Infinity },
            audio: { min: 0, max: Infinity },
            subtitle: { min: 0, max: Infinity },
            total: { min: 1, max: 2 ** 32 - 1 }, // Have fun reaching this one
        };
    }
    get supportsVideoRotationMetadata() {
        return true;
    }
    /** @internal */
    _createMuxer(output) {
        return new IsobmffMuxer(output, this);
    }
}
/**
 * MPEG-4 Part 14 (MP4) file format. Supports most codecs.
 * @group Output formats
 * @public
 */
export class Mp4OutputFormat extends IsobmffOutputFormat {
    /** Creates a new {@link Mp4OutputFormat} configured with the specified `options`. */
    constructor(options) {
        super(options);
    }
    /** @internal */
    get _name() {
        return 'MP4';
    }
    get fileExtension() {
        return '.mp4';
    }
    get mimeType() {
        return 'video/mp4';
    }
    getSupportedCodecs() {
        return [
            ...VIDEO_CODECS,
            ...NON_PCM_AUDIO_CODECS,
            // These are supported via ISO/IEC 23003-5
            'pcm-s16',
            'pcm-s16be',
            'pcm-s24',
            'pcm-s24be',
            'pcm-s32',
            'pcm-s32be',
            'pcm-f32',
            'pcm-f32be',
            'pcm-f64',
            'pcm-f64be',
            // Only WebVTT subtitles are supported in MP4
            'webvtt',
        ];
    }
    /** @internal */
    _codecUnsupportedHint(codec) {
        if (new MovOutputFormat().getSupportedCodecs().includes(codec)) {
            return ' Switching to MOV will grant support for this codec.';
        }
        return '';
    }
}
/**
 * QuickTime File Format (QTFF), often called MOV. Supports all video and audio codecs, but not subtitle codecs.
 * @group Output formats
 * @public
 */
export class MovOutputFormat extends IsobmffOutputFormat {
    /** Creates a new {@link MovOutputFormat} configured with the specified `options`. */
    constructor(options) {
        super(options);
    }
    /** @internal */
    get _name() {
        return 'MOV';
    }
    get fileExtension() {
        return '.mov';
    }
    get mimeType() {
        return 'video/quicktime';
    }
    getSupportedCodecs() {
        return [
            ...VIDEO_CODECS,
            ...AUDIO_CODECS,
            // Only WebVTT subtitles are supported in MOV
            'webvtt',
        ];
    }
    /** @internal */
    _codecUnsupportedHint(codec) {
        if (new Mp4OutputFormat().getSupportedCodecs().includes(codec)) {
            return ' Switching to MP4 will grant support for this codec.';
        }
        return '';
    }
}
/**
 * Matroska file format.
 *
 * Supports writing transparent video. For a video track to be marked as transparent, the first packet added must
 * contain alpha side data.
 *
 * @group Output formats
 * @public
 */
export class MkvOutputFormat extends OutputFormat {
    /** Creates a new {@link MkvOutputFormat} configured with the specified `options`. */
    constructor(options = {}) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('options must be an object.');
        }
        if (options.appendOnly !== undefined && typeof options.appendOnly !== 'boolean') {
            throw new TypeError('options.appendOnly, when provided, must be a boolean.');
        }
        if (options.minimumClusterDuration !== undefined
            && (!Number.isFinite(options.minimumClusterDuration) || options.minimumClusterDuration < 0)) {
            throw new TypeError('options.minimumClusterDuration, when provided, must be a non-negative number.');
        }
        if (options.onEbmlHeader !== undefined && typeof options.onEbmlHeader !== 'function') {
            throw new TypeError('options.onEbmlHeader, when provided, must be a function.');
        }
        if (options.onSegmentHeader !== undefined && typeof options.onSegmentHeader !== 'function') {
            throw new TypeError('options.onHeader, when provided, must be a function.');
        }
        if (options.onCluster !== undefined && typeof options.onCluster !== 'function') {
            throw new TypeError('options.onCluster, when provided, must be a function.');
        }
        super();
        this._options = options;
    }
    /** @internal */
    _createMuxer(output) {
        return new MatroskaMuxer(output, this);
    }
    /** @internal */
    get _name() {
        return 'Matroska';
    }
    getSupportedTrackCounts() {
        return {
            video: { min: 0, max: Infinity },
            audio: { min: 0, max: Infinity },
            subtitle: { min: 0, max: Infinity },
            total: { min: 1, max: 127 },
        };
    }
    get fileExtension() {
        return '.mkv';
    }
    get mimeType() {
        return 'video/x-matroska';
    }
    getSupportedCodecs() {
        return [
            ...VIDEO_CODECS,
            ...NON_PCM_AUDIO_CODECS,
            ...PCM_AUDIO_CODECS.filter(codec => !['pcm-s8', 'pcm-f32be', 'pcm-f64be', 'ulaw', 'alaw'].includes(codec)),
            ...SUBTITLE_CODECS,
        ];
    }
    get supportsVideoRotationMetadata() {
        // While it technically does support it with ProjectionPoseRoll, many players appear to ignore this value
        return false;
    }
}
/**
 * WebM file format, based on Matroska.
 *
 * Supports writing transparent video. For a video track to be marked as transparent, the first packet added must
 * contain alpha side data.
 *
 * @group Output formats
 * @public
 */
export class WebMOutputFormat extends MkvOutputFormat {
    /** Creates a new {@link WebMOutputFormat} configured with the specified `options`. */
    constructor(options) {
        super(options);
    }
    getSupportedCodecs() {
        return [
            ...VIDEO_CODECS.filter(codec => ['vp8', 'vp9', 'av1'].includes(codec)),
            ...AUDIO_CODECS.filter(codec => ['opus', 'vorbis'].includes(codec)),
            ...SUBTITLE_CODECS,
        ];
    }
    /** @internal */
    get _name() {
        return 'WebM';
    }
    get fileExtension() {
        return '.webm';
    }
    get mimeType() {
        return 'video/webm';
    }
    /** @internal */
    _codecUnsupportedHint(codec) {
        if (new MkvOutputFormat().getSupportedCodecs().includes(codec)) {
            return ' Switching to MKV will grant support for this codec.';
        }
        return '';
    }
}
/**
 * MP3 file format.
 * @group Output formats
 * @public
 */
export class Mp3OutputFormat extends OutputFormat {
    /** Creates a new {@link Mp3OutputFormat} configured with the specified `options`. */
    constructor(options = {}) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('options must be an object.');
        }
        if (options.xingHeader !== undefined && typeof options.xingHeader !== 'boolean') {
            throw new TypeError('options.xingHeader, when provided, must be a boolean.');
        }
        if (options.onXingFrame !== undefined && typeof options.onXingFrame !== 'function') {
            throw new TypeError('options.onXingFrame, when provided, must be a function.');
        }
        super();
        this._options = options;
    }
    /** @internal */
    _createMuxer(output) {
        return new Mp3Muxer(output, this);
    }
    /** @internal */
    get _name() {
        return 'MP3';
    }
    getSupportedTrackCounts() {
        return {
            video: { min: 0, max: 0 },
            audio: { min: 1, max: 1 },
            subtitle: { min: 0, max: 0 },
            total: { min: 1, max: 1 },
        };
    }
    get fileExtension() {
        return '.mp3';
    }
    get mimeType() {
        return 'audio/mpeg';
    }
    getSupportedCodecs() {
        return ['mp3'];
    }
    get supportsVideoRotationMetadata() {
        return false;
    }
}
/**
 * WAVE file format, based on RIFF.
 * @group Output formats
 * @public
 */
export class WavOutputFormat extends OutputFormat {
    /** Creates a new {@link WavOutputFormat} configured with the specified `options`. */
    constructor(options = {}) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('options must be an object.');
        }
        if (options.large !== undefined && typeof options.large !== 'boolean') {
            throw new TypeError('options.large, when provided, must be a boolean.');
        }
        if (options.metadataFormat !== undefined && !['info', 'id3'].includes(options.metadataFormat)) {
            throw new TypeError('options.metadataFormat, when provided, must be either \'info\' or \'id3\'.');
        }
        if (options.onHeader !== undefined && typeof options.onHeader !== 'function') {
            throw new TypeError('options.onHeader, when provided, must be a function.');
        }
        super();
        this._options = options;
    }
    /** @internal */
    _createMuxer(output) {
        return new WaveMuxer(output, this);
    }
    /** @internal */
    get _name() {
        return 'WAVE';
    }
    getSupportedTrackCounts() {
        return {
            video: { min: 0, max: 0 },
            audio: { min: 1, max: 1 },
            subtitle: { min: 0, max: 0 },
            total: { min: 1, max: 1 },
        };
    }
    get fileExtension() {
        return '.wav';
    }
    get mimeType() {
        return 'audio/wav';
    }
    getSupportedCodecs() {
        return [
            ...PCM_AUDIO_CODECS.filter(codec => ['pcm-s16', 'pcm-s24', 'pcm-s32', 'pcm-f32', 'pcm-u8', 'ulaw', 'alaw'].includes(codec)),
        ];
    }
    get supportsVideoRotationMetadata() {
        return false;
    }
}
/**
 * Ogg file format.
 * @group Output formats
 * @public
 */
export class OggOutputFormat extends OutputFormat {
    /** Creates a new {@link OggOutputFormat} configured with the specified `options`. */
    constructor(options = {}) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('options must be an object.');
        }
        if (options.onPage !== undefined && typeof options.onPage !== 'function') {
            throw new TypeError('options.onPage, when provided, must be a function.');
        }
        super();
        this._options = options;
    }
    /** @internal */
    _createMuxer(output) {
        return new OggMuxer(output, this);
    }
    /** @internal */
    get _name() {
        return 'Ogg';
    }
    getSupportedTrackCounts() {
        return {
            video: { min: 0, max: 0 },
            audio: { min: 0, max: Infinity },
            subtitle: { min: 0, max: 0 },
            total: { min: 1, max: 2 ** 32 },
        };
    }
    get fileExtension() {
        return '.ogg';
    }
    get mimeType() {
        return 'application/ogg';
    }
    getSupportedCodecs() {
        return [
            ...AUDIO_CODECS.filter(codec => ['vorbis', 'opus'].includes(codec)),
        ];
    }
    get supportsVideoRotationMetadata() {
        return false;
    }
}
/**
 * ADTS file format.
 * @group Output formats
 * @public
 */
export class AdtsOutputFormat extends OutputFormat {
    /** Creates a new {@link AdtsOutputFormat} configured with the specified `options`. */
    constructor(options = {}) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('options must be an object.');
        }
        if (options.onFrame !== undefined && typeof options.onFrame !== 'function') {
            throw new TypeError('options.onFrame, when provided, must be a function.');
        }
        super();
        this._options = options;
    }
    /** @internal */
    _createMuxer(output) {
        return new AdtsMuxer(output, this);
    }
    /** @internal */
    get _name() {
        return 'ADTS';
    }
    getSupportedTrackCounts() {
        return {
            video: { min: 0, max: 0 },
            audio: { min: 1, max: 1 },
            subtitle: { min: 0, max: 0 },
            total: { min: 1, max: 1 },
        };
    }
    get fileExtension() {
        return '.aac';
    }
    get mimeType() {
        return 'audio/aac';
    }
    getSupportedCodecs() {
        return ['aac'];
    }
    get supportsVideoRotationMetadata() {
        return false;
    }
}
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
export class AviOutputFormat extends OutputFormat {
    /** Creates a new {@link AviOutputFormat} configured with the specified `options`. */
    constructor(options = {}) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('options must be an object.');
        }
        if (options.large !== undefined && typeof options.large !== 'boolean') {
            throw new TypeError('options.large, when provided, must be a boolean.');
        }
        if (options.onHeader !== undefined && typeof options.onHeader !== 'function') {
            throw new TypeError('options.onHeader, when provided, must be a function.');
        }
        if (options.onIndex !== undefined && typeof options.onIndex !== 'function') {
            throw new TypeError('options.onIndex, when provided, must be a function.');
        }
        super();
        this._options = options;
    }
    /** @internal */
    _createMuxer(output) {
        return new AVIMuxer(output, this);
    }
    /** @internal */
    get _name() {
        return 'AVI';
    }
    getSupportedTrackCounts() {
        return {
            video: { min: 0, max: Infinity },
            audio: { min: 0, max: Infinity },
            subtitle: { min: 0, max: 0 },
            total: { min: 1, max: 2 ** 32 - 1 },
        };
    }
    get fileExtension() {
        return '.avi';
    }
    get mimeType() {
        return 'video/x-msvideo';
    }
    getSupportedCodecs() {
        return [
            ...VIDEO_CODECS.filter(codec => ['avc', 'hevc', 'vp8', 'vp9', 'av1', 'mpeg4'].includes(codec)),
            ...AUDIO_CODECS.filter(codec => ['mp3', 'aac', 'vorbis', 'flac', 'ac3', 'pcm-s16', 'pcm-s24', 'pcm-s32', 'pcm-f32', 'pcm-u8', 'ulaw', 'alaw'].includes(codec)),
        ];
    }
    get supportsVideoRotationMetadata() {
        return false;
    }
}
/**
 * FLAC file format.
 * @group Output formats
 * @public
 */
export class FlacOutputFormat extends OutputFormat {
    /** Creates a new {@link FlacOutputFormat} configured with the specified `options`. */
    constructor(options = {}) {
        if (!options || typeof options !== 'object') {
            throw new TypeError('options must be an object.');
        }
        super();
        this._options = options;
    }
    /** @internal */
    _createMuxer(output) {
        return new FlacMuxer(output, this);
    }
    /** @internal */
    get _name() {
        return 'FLAC';
    }
    getSupportedTrackCounts() {
        return {
            video: { min: 0, max: 0 },
            audio: { min: 1, max: 1 },
            subtitle: { min: 0, max: 0 },
            total: { min: 1, max: 1 },
        };
    }
    get fileExtension() {
        return '.flac';
    }
    get mimeType() {
        return 'audio/flac';
    }
    getSupportedCodecs() {
        return ['flac'];
    }
    get supportsVideoRotationMetadata() {
        return false;
    }
}
