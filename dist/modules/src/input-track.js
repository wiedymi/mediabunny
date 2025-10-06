/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { determineVideoPacketType } from './codec-data.js';
import { customAudioDecoders, customVideoDecoders } from './custom-coder.js';
import { EncodedPacketSink } from './media-sink.js';
import { assert } from './misc.js';
import { EncodedPacket } from './packet.js';
/**
 * Represents a media track in an input file.
 * @group Input files & tracks
 * @public
 */
export class InputTrack {
    /** @internal */
    constructor(input, backing) {
        this.input = input;
        this._backing = backing;
    }
    /** Returns true if and only if this track is a video track. */
    isVideoTrack() {
        return this instanceof InputVideoTrack;
    }
    /** Returns true if and only if this track is an audio track. */
    isAudioTrack() {
        return this instanceof InputAudioTrack;
    }
    /** Returns true if and only if this track is a subtitle track. */
    isSubtitleTrack() {
        return this instanceof InputSubtitleTrack;
    }
    /** The unique ID of this track in the input file. */
    get id() {
        return this._backing.getId();
    }
    /**
     * The identifier of the codec used internally by the container. It is not homogenized by Mediabunny
     * and depends entirely on the container format.
     *
     * This field can be used to determine the codec of a track in case Mediabunny doesn't know that codec.
     *
     * - For ISOBMFF files, this field returns the name of the Sample Description Box (e.g. `'avc1'`).
     * - For Matroska files, this field returns the value of the `CodecID` element.
     * - For WAVE files, this field returns the value of the format tag in the `'fmt '` chunk.
     * - For ADTS files, this field contains the `MPEG-4 Audio Object Type`.
     * - In all other cases, this field is `null`.
     */
    get internalCodecId() {
        return this._backing.getInternalCodecId();
    }
    /**
     * The ISO 639-2/T language code for this track. If the language is unknown, this field is `'und'` (undetermined).
     */
    get languageCode() {
        return this._backing.getLanguageCode();
    }
    /** A user-defined name for this track. */
    get name() {
        return this._backing.getName();
    }
    /**
     * A positive number x such that all timestamps and durations of all packets of this track are
     * integer multiples of 1/x.
     */
    get timeResolution() {
        return this._backing.getTimeResolution();
    }
    /**
     * Returns the start timestamp of the first packet of this track, in seconds. While often near zero, this value
     * may be positive or even negative. A negative starting timestamp means the track's timing has been offset. Samples
     * with a negative timestamp should not be presented.
     */
    getFirstTimestamp() {
        return this._backing.getFirstTimestamp();
    }
    /** Returns the end timestamp of the last packet of this track, in seconds. */
    computeDuration() {
        return this._backing.computeDuration();
    }
    /**
     * Computes aggregate packet statistics for this track, such as average packet rate or bitrate.
     *
     * @param targetPacketCount - This optional parameter sets a target for how many packets this method must have
     * looked at before it can return early; this means, you can use it to aggregate only a subset (prefix) of all
     * packets. This is very useful for getting a great estimate of video frame rate without having to scan through the
     * entire file.
     */
    async computePacketStats(targetPacketCount = Infinity) {
        const sink = new EncodedPacketSink(this);
        let startTimestamp = Infinity;
        let endTimestamp = -Infinity;
        let packetCount = 0;
        let totalPacketBytes = 0;
        for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
            if (packetCount >= targetPacketCount
                // This additional condition is needed to produce correct results with out-of-presentation-order packets
                && packet.timestamp >= endTimestamp) {
                break;
            }
            startTimestamp = Math.min(startTimestamp, packet.timestamp);
            endTimestamp = Math.max(endTimestamp, packet.timestamp + packet.duration);
            packetCount++;
            totalPacketBytes += packet.byteLength;
        }
        return {
            packetCount,
            averagePacketRate: packetCount
                ? Number((packetCount / (endTimestamp - startTimestamp)).toPrecision(16))
                : 0,
            averageBitrate: packetCount
                ? Number((8 * totalPacketBytes / (endTimestamp - startTimestamp)).toPrecision(16))
                : 0,
        };
    }
}
/**
 * Represents a video track in an input file.
 * @group Input files & tracks
 * @public
 */
export class InputVideoTrack extends InputTrack {
    /** @internal */
    constructor(input, backing) {
        super(input, backing);
        this._backing = backing;
    }
    get type() {
        return 'video';
    }
    get codec() {
        return this._backing.getCodec();
    }
    /** The width in pixels of the track's coded samples, before any transformations or rotations. */
    get codedWidth() {
        return this._backing.getCodedWidth();
    }
    /** The height in pixels of the track's coded samples, before any transformations or rotations. */
    get codedHeight() {
        return this._backing.getCodedHeight();
    }
    /** The angle in degrees by which the track's frames should be rotated (clockwise). */
    get rotation() {
        return this._backing.getRotation();
    }
    /** The width in pixels of the track's frames after rotation. */
    get displayWidth() {
        const rotation = this._backing.getRotation();
        return rotation % 180 === 0 ? this._backing.getCodedWidth() : this._backing.getCodedHeight();
    }
    /** The height in pixels of the track's frames after rotation. */
    get displayHeight() {
        const rotation = this._backing.getRotation();
        return rotation % 180 === 0 ? this._backing.getCodedHeight() : this._backing.getCodedWidth();
    }
    /** Returns the color space of the track's samples. */
    getColorSpace() {
        return this._backing.getColorSpace();
    }
    /** If this method returns true, the track's samples use a high dynamic range (HDR). */
    async hasHighDynamicRange() {
        const colorSpace = await this._backing.getColorSpace();
        return colorSpace.primaries === 'bt2020' || colorSpace.primaries === 'smpte432'
            || colorSpace.transfer === 'pg' || colorSpace.transfer === 'hlg'
            || colorSpace.matrix === 'bt2020-ncl';
    }
    /** Checks if this track may contain transparent samples with alpha data. */
    canBeTransparent() {
        return this._backing.canBeTransparent();
    }
    /**
     * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#video-decoder-config) for decoding the
     * track's packets using a [`VideoDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder). Returns
     * null if the track's codec is unknown.
     */
    getDecoderConfig() {
        return this._backing.getDecoderConfig();
    }
    async getCodecParameterString() {
        const decoderConfig = await this._backing.getDecoderConfig();
        return decoderConfig?.codec ?? null;
    }
    async canDecode() {
        try {
            const decoderConfig = await this._backing.getDecoderConfig();
            if (!decoderConfig) {
                return false;
            }
            const codec = this._backing.getCodec();
            assert(codec !== null);
            if (customVideoDecoders.some(x => x.supports(codec, decoderConfig))) {
                return true;
            }
            if (typeof VideoDecoder === 'undefined') {
                return false;
            }
            const support = await VideoDecoder.isConfigSupported(decoderConfig);
            return support.supported === true;
        }
        catch (error) {
            console.error('Error during decodability check:', error);
            return false;
        }
    }
    async determinePacketType(packet) {
        if (!(packet instanceof EncodedPacket)) {
            throw new TypeError('packet must be an EncodedPacket.');
        }
        if (packet.isMetadataOnly) {
            throw new TypeError('packet must not be metadata-only to determine its type.');
        }
        if (this.codec === null) {
            return null;
        }
        const decoderConfig = await this.getDecoderConfig();
        assert(decoderConfig);
        return determineVideoPacketType(this.codec, decoderConfig, packet.data);
    }
}
/**
 * Represents an audio track in an input file.
 * @group Input files & tracks
 * @public
 */
export class InputAudioTrack extends InputTrack {
    /** @internal */
    constructor(input, backing) {
        super(input, backing);
        this._backing = backing;
    }
    get type() {
        return 'audio';
    }
    get codec() {
        return this._backing.getCodec();
    }
    /** The number of audio channels in the track. */
    get numberOfChannels() {
        return this._backing.getNumberOfChannels();
    }
    /** The track's audio sample rate in hertz. */
    get sampleRate() {
        return this._backing.getSampleRate();
    }
    /**
     * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#audio-decoder-config) for decoding the
     * track's packets using an [`AudioDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/AudioDecoder). Returns
     * null if the track's codec is unknown.
     */
    getDecoderConfig() {
        return this._backing.getDecoderConfig();
    }
    async getCodecParameterString() {
        const decoderConfig = await this._backing.getDecoderConfig();
        return decoderConfig?.codec ?? null;
    }
    async canDecode() {
        try {
            const decoderConfig = await this._backing.getDecoderConfig();
            if (!decoderConfig) {
                return false;
            }
            const codec = this._backing.getCodec();
            assert(codec !== null);
            if (customAudioDecoders.some(x => x.supports(codec, decoderConfig))) {
                return true;
            }
            if (decoderConfig.codec.startsWith('pcm-')) {
                return true; // Since we decode it ourselves
            }
            else {
                if (typeof AudioDecoder === 'undefined') {
                    return false;
                }
                const support = await AudioDecoder.isConfigSupported(decoderConfig);
                return support.supported === true;
            }
        }
        catch (error) {
            console.error('Error during decodability check:', error);
            return false;
        }
    }
    async determinePacketType(packet) {
        if (!(packet instanceof EncodedPacket)) {
            throw new TypeError('packet must be an EncodedPacket.');
        }
        if (this.codec === null) {
            return null;
        }
        return 'key'; // No audio codec with delta packets
    }
}
/**
 * Represents a subtitle track in an input file.
 * @group Input files & tracks
 * @public
 */
export class InputSubtitleTrack extends InputTrack {
    /** @internal */
    constructor(input, backing) {
        super(input, backing);
        this._backing = backing;
    }
    get type() {
        return 'subtitle';
    }
    get codec() {
        return this._backing.getCodec();
    }
    /**
     * Returns an async iterator that yields all subtitle cues in this track.
     */
    getCues() {
        return this._backing.getCues();
    }
    /**
     * Exports all subtitle cues to text format. If targetFormat is specified,
     * attempts to convert to that format (limited conversion support).
     */
    async exportToText(targetFormat) {
        const cues = [];
        for await (const cue of this.getCues()) {
            cues.push(cue);
        }
        const codec = targetFormat || this.codec;
        const codecPrivate = this._backing.getCodecPrivate();
        if (codec === 'srt') {
            const { formatCuesToSrt } = await import('./subtitles.js');
            return formatCuesToSrt(cues);
        }
        else if (codec === 'ass' || codec === 'ssa') {
            const { formatCuesToAss, splitAssIntoCues } = await import('./subtitles.js');
            // For ASS, we need to merge Comment lines from CodecPrivate with Dialogue lines from blocks
            // CodecPrivate contains: header + Comment lines
            // Blocks contain: Dialogue lines (without timestamps)
            // We need to reconstruct full ASS file
            // Parse CodecPrivate to extract the header with Comments preserved
            const parsed = codecPrivate ? splitAssIntoCues(codecPrivate) : { header: '', cues: [] };
            // Use the header (includes Comment lines) and add our cues (from blocks)
            return formatCuesToAss(cues, parsed.header);
        }
        else if (codec === 'webvtt') {
            const { formatCuesToWebVTT } = await import('./subtitles.js');
            // Use codecPrivate as preamble if available
            return formatCuesToWebVTT(cues, codecPrivate || undefined);
        }
        else {
            // Fallback to SRT for unknown formats
            const { formatCuesToSrt } = await import('./subtitles.js');
            return formatCuesToSrt(cues);
        }
    }
    async getCodecParameterString() {
        return this.codec;
    }
    async canDecode() {
        // Subtitles are always text-based and can be decoded
        return this.codec !== null;
    }
    async determinePacketType(packet) {
        // Subtitle packets are always key packets
        return 'key';
    }
}
