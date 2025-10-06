/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { Writer } from '../writer.js';
import { IsobmffAudioTrackData, IsobmffMuxer, IsobmffSubtitleTrackData, IsobmffTrackData, IsobmffVideoTrackData } from './isobmff-muxer.js';
export declare class IsobmffBoxWriter {
    private writer;
    private helper;
    private helperView;
    /**
     * Stores the position from the start of the file to where boxes elements have been written. This is used to
     * rewrite/edit elements that were already added before, and to measure sizes of things.
     */
    offsets: WeakMap<Box, number>;
    constructor(writer: Writer);
    writeU32(value: number): void;
    writeU64(value: number): void;
    writeAscii(text: string): void;
    writeBox(box: Box): void;
    writeBoxHeader(box: Box, size: number): void;
    measureBoxHeader(box: Box): number;
    patchBox(box: Box): void;
    measureBox(box: Box): number;
}
export interface Box {
    type: string;
    contents?: Uint8Array;
    children?: (Box | null)[];
    size?: number;
    largeSize?: boolean;
}
type NestedNumberArray = (number | NestedNumberArray)[];
export declare const box: (type: string, contents?: NestedNumberArray, children?: (Box | null)[]) => Box;
/** A FullBox always starts with a version byte, followed by three flag bytes. */
export declare const fullBox: (type: string, version: number, flags: number, contents?: NestedNumberArray, children?: Box[]) => Box;
/**
 * File Type Compatibility Box: Allows the reader to determine whether this is a type of file that the
 * reader understands.
 */
export declare const ftyp: (details: {
    isQuickTime: boolean;
    holdsAvc: boolean;
    fragmented: boolean;
}) => Box;
/** Movie Sample Data Box. Contains the actual frames/samples of the media. */
export declare const mdat: (reserveLargeSize: boolean) => Box;
/** Free Space Box: A box that designates unused space in the movie data file. */
export declare const free: (size: number) => Box;
/**
 * Movie Box: Used to specify the information that defines a movie - that is, the information that allows
 * an application to interpret the sample data that is stored elsewhere.
 */
export declare const moov: (muxer: IsobmffMuxer) => Box;
/** Movie Header Box: Used to specify the characteristics of the entire movie, such as timescale and duration. */
export declare const mvhd: (creationTime: number, trackDatas: IsobmffTrackData[]) => Box;
/**
 * Track Box: Defines a single track of a movie. A movie may consist of one or more tracks. Each track is
 * independent of the other tracks in the movie and carries its own temporal and spatial information. Each Track Box
 * contains its associated Media Box.
 */
export declare const trak: (trackData: IsobmffTrackData, creationTime: number) => Box;
/** Track Header Box: Specifies the characteristics of a single track within a movie. */
export declare const tkhd: (trackData: IsobmffTrackData, creationTime: number) => Box;
/** Media Box: Describes and define a track's media type and sample data. */
export declare const mdia: (trackData: IsobmffTrackData, creationTime: number) => Box;
/** Media Header Box: Specifies the characteristics of a media, including timescale and duration. */
export declare const mdhd: (trackData: IsobmffTrackData, creationTime: number) => Box;
/** Handler Reference Box. */
export declare const hdlr: (hasComponentType: boolean, handlerType: string, name: string, manufacturer?: string) => Box;
/**
 * Media Information Box: Stores handler-specific information for a track's media data. The media handler uses this
 * information to map from media time to media data and to process the media data.
 */
export declare const minf: (trackData: IsobmffTrackData) => Box;
/** Video Media Information Header Box: Defines specific color and graphics mode information. */
export declare const vmhd: () => Box;
/** Sound Media Information Header Box: Stores the sound media's control information, such as balance. */
export declare const smhd: () => Box;
/** Null Media Header Box. */
export declare const nmhd: () => Box;
/**
 * Data Information Box: Contains information specifying the data handler component that provides access to the
 * media data. The data handler component uses the Data Information Box to interpret the media's data.
 */
export declare const dinf: () => Box;
/**
 * Data Reference Box: Contains tabular data that instructs the data handler component how to access the media's data.
 */
export declare const dref: () => Box;
export declare const url: () => Box;
/**
 * Sample Table Box: Contains information for converting from media time to sample number to sample location. This box
 * also indicates how to interpret the sample (for example, whether to decompress the video data and, if so, how).
 */
export declare const stbl: (trackData: IsobmffTrackData) => Box;
/**
 * Sample Description Box: Stores information that allows you to decode samples in the media. The data stored in the
 * sample description varies, depending on the media type.
 */
export declare const stsd: (trackData: IsobmffTrackData) => Box;
/** Video Sample Description Box: Contains information that defines how to interpret video media data. */
export declare const videoSampleDescription: (compressionType: string, trackData: IsobmffVideoTrackData) => Box;
/** Colour Information Box: Specifies the color space of the video. */
export declare const colr: (trackData: IsobmffVideoTrackData) => Box;
/** AVC Configuration Box: Provides additional information to the decoder. */
export declare const avcC: (trackData: IsobmffVideoTrackData) => Box;
/** HEVC Configuration Box: Provides additional information to the decoder. */
export declare const hvcC: (trackData: IsobmffVideoTrackData) => Box;
/** VP Configuration Box: Provides additional information to the decoder. */
export declare const vpcC: (trackData: IsobmffVideoTrackData) => Box | null;
/** AV1 Configuration Box: Provides additional information to the decoder. */
export declare const av1C: (trackData: IsobmffVideoTrackData) => Box;
/** Sound Sample Description Box: Contains information that defines how to interpret sound media data. */
export declare const soundSampleDescription: (compressionType: string, trackData: IsobmffAudioTrackData) => Box;
/** MPEG-4 Elementary Stream Descriptor Box. */
export declare const esds: (trackData: IsobmffAudioTrackData) => Box;
export declare const wave: (trackData: IsobmffAudioTrackData) => Box;
export declare const frma: (trackData: IsobmffAudioTrackData) => Box;
export declare const enda: (trackData: IsobmffAudioTrackData) => Box;
/** Opus Specific Box. */
export declare const dOps: (trackData: IsobmffAudioTrackData) => Box;
/** FLAC specific box. */
export declare const dfLa: (trackData: IsobmffAudioTrackData) => Box;
export declare const subtitleSampleDescription: (compressionType: string, trackData: IsobmffSubtitleTrackData) => Box;
export declare const vttC: (trackData: IsobmffSubtitleTrackData) => Box;
export declare const txtC: (textConfig: Uint8Array) => Box;
/**
 * Time-To-Sample Box: Stores duration information for a media's samples, providing a mapping from a time in a media
 * to the corresponding data sample. The table is compact, meaning that consecutive samples with the same time delta
 * will be grouped.
 */
export declare const stts: (trackData: IsobmffTrackData) => Box;
/** Sync Sample Box: Identifies the key frames in the media, marking the random access points within a stream. */
export declare const stss: (trackData: IsobmffTrackData) => Box | null;
/**
 * Sample-To-Chunk Box: As samples are added to a media, they are collected into chunks that allow optimized data
 * access. A chunk contains one or more samples. Chunks in a media may have different sizes, and the samples within a
 * chunk may have different sizes. The Sample-To-Chunk Box stores chunk information for the samples in a media, stored
 * in a compactly-coded fashion.
 */
export declare const stsc: (trackData: IsobmffTrackData) => Box;
/** Sample Size Box: Specifies the byte size of each sample in the media. */
export declare const stsz: (trackData: IsobmffTrackData) => Box;
/** Chunk Offset Box: Identifies the location of each chunk of data in the media's data stream, relative to the file. */
export declare const stco: (trackData: IsobmffTrackData) => Box;
/**
 * Composition Time to Sample Box: Stores composition time offset information (PTS-DTS) for a
 * media's samples. The table is compact, meaning that consecutive samples with the same time
 * composition time offset will be grouped.
 */
export declare const ctts: (trackData: IsobmffTrackData) => Box;
/**
 * Composition to Decode Box: Stores information about the composition and display times of the media samples.
 */
export declare const cslg: (trackData: IsobmffTrackData) => Box | null;
/**
 * Movie Extends Box: This box signals to readers that the file is fragmented. Contains a single Track Extends Box
 * for each track in the movie.
 */
export declare const mvex: (trackDatas: IsobmffTrackData[]) => Box;
/** Track Extends Box: Contains the default values used by the movie fragments. */
export declare const trex: (trackData: IsobmffTrackData) => Box;
/**
 * Movie Fragment Box: The movie fragments extend the presentation in time. They provide the information that would
 * previously have been	in the Movie Box.
 */
export declare const moof: (sequenceNumber: number, trackDatas: IsobmffTrackData[]) => Box;
/** Movie Fragment Header Box: Contains a sequence number as a safety check. */
export declare const mfhd: (sequenceNumber: number) => Box;
/** Track Fragment Box */
export declare const traf: (trackData: IsobmffTrackData) => Box;
/** Track Fragment Header Box: Provides a reference to the extended track, and flags. */
export declare const tfhd: (trackData: IsobmffTrackData) => Box;
/**
 * Track Fragment Decode Time Box: Provides the absolute decode time of the first sample of the fragment. This is
 * useful for performing random access on the media file.
 */
export declare const tfdt: (trackData: IsobmffTrackData) => Box;
/** Track Run Box: Specifies a run of contiguous samples for a given track. */
export declare const trun: (trackData: IsobmffTrackData) => Box;
/**
 * Movie Fragment Random Access Box: For each track, provides pointers to sync samples within the file
 * for random access.
 */
export declare const mfra: (trackDatas: IsobmffTrackData[]) => Box;
/** Track Fragment Random Access Box: Provides pointers to sync samples within the file for random access. */
export declare const tfra: (trackData: IsobmffTrackData, trackIndex: number) => Box;
/**
 * Movie Fragment Random Access Offset Box: Provides the size of the enclosing mfra box. This box can be used by readers
 * to quickly locate the mfra box by searching from the end of the file.
 */
export declare const mfro: () => Box;
/** VTT Empty Cue Box */
export declare const vtte: () => Box;
/** VTT Cue Box */
export declare const vttc: (payload: string, timestamp: number | null, identifier: string | null, settings: string | null, sourceId: number | null) => Box;
/** VTT Additional Text Box */
export declare const vtta: (notes: string) => Box;
export {};
//# sourceMappingURL=isobmff-boxes.d.ts.map