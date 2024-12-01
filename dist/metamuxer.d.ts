/** @public */
export declare class ArrayBufferTarget extends Target {
    buffer: ArrayBuffer | null;
}

/** @public */
export declare const AUDIO_CODECS: readonly ["aac", "opus"];

/** @public */
export declare class AudioBufferSource extends AudioSource {
    constructor(codecConfig: AudioCodecConfig);
    digest(audioBuffer: AudioBuffer): Promise<void>;
}

/** @public */
export declare type AudioCodec = typeof AUDIO_CODECS[number];

/** @public */
export declare type AudioCodecConfig = {
    codec: AudioCodec;
    bitrate: number;
};

/** @public */
export declare class AudioDataSource extends AudioSource {
    constructor(codecConfig: AudioCodecConfig);
    digest(audioData: AudioData): Promise<void>;
}

/** @public */
export declare abstract class AudioSource extends MediaSource_2 {
    constructor(codec: AudioCodec);
}

/** @public */
export declare type AudioTrackMetadata = {};

/** @public */
export declare class CanvasSource extends VideoSource {
    constructor(canvas: HTMLCanvasElement | OffscreenCanvas, codecConfig: VideoCodecConfig);
    digest(timestamp: number, duration?: number): Promise<void>;
}

/** @public */
export declare class EncodedAudioChunkSource extends AudioSource {
    constructor(codec: AudioCodec);
    digest(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): Promise<void>;
}

/** @public */
export declare class EncodedVideoChunkSource extends VideoSource {
    constructor(codec: VideoCodec);
    digest(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Promise<void>;
}

/** @public */
declare abstract class MediaSource_2 {
    close(): void;
}
export { MediaSource_2 as MediaSource }

/** @public */
export declare class MediaStreamAudioTrackSource extends AudioSource {
    constructor(track: MediaStreamAudioTrack, codecConfig: AudioCodecConfig);
}

/** @public */
export declare class MediaStreamVideoTrackSource extends VideoSource {
    constructor(track: MediaStreamVideoTrack, codecConfig: VideoCodecConfig);
}

/** @public */
export declare class MkvOutputFormat extends OutputFormat {
    constructor(options?: MkvOutputFormatOptions);
}

/** @public */
export declare type MkvOutputFormatOptions = {
    streamable?: boolean;
};

/** @public */
export declare class Mp4OutputFormat extends OutputFormat {
    constructor(options?: Mp4OutputFormatOptions);
}

/** @public */
export declare type Mp4OutputFormatOptions = {
    fastStart?: false | 'in-memory' | 'fragmented';
};

/** @public */
export declare class Output {
    constructor(options: OutputOptions);
    addVideoTrack(source: VideoSource, metadata?: VideoTrackMetadata): void;
    addAudioTrack(source: AudioSource, metadata?: AudioTrackMetadata): void;
    addSubtitleTrack(source: SubtitleSource, metadata?: SubtitleTrackMetadata): void;
    start(): Promise<void>;
    finalize(): Promise<void>;
}

/** @public */
export declare abstract class OutputFormat {
}

/** @public */
export declare type OutputOptions = {
    format: OutputFormat;
    target: Target;
};

/** @public */
export declare class StreamTarget extends Target {
    constructor(writable: WritableStream<StreamTargetChunk>, options?: StreamTargetOptions);
}

/** @public */
export declare type StreamTargetChunk = {
    type: 'write';
    data: Uint8Array;
    position: number;
};

/** @public */
export declare type StreamTargetOptions = {
    chunked?: boolean;
    chunkSize?: number;
};

/** @public */
export declare const SUBTITLE_CODECS: readonly ["webvtt"];

/** @public */
export declare type SubtitleCodec = typeof SUBTITLE_CODECS[number];

/** @public */
export declare abstract class SubtitleSource extends MediaSource_2 {
    constructor(codec: SubtitleCodec);
}

/** @public */
export declare type SubtitleTrackMetadata = {};

/** @public */
export declare abstract class Target {
}

/** @public */
export declare class TextSubtitleSource extends SubtitleSource {
    constructor(codec: SubtitleCodec);
    digest(text: string): Promise<void>;
}

/** @public */
export declare type TransformationMatrix = [number, number, number, number, number, number, number, number, number];

/** @public */
export declare const VIDEO_CODECS: readonly ["avc", "hevc", "vp8", "vp9", "av1"];

/** @public */
export declare type VideoCodec = typeof VIDEO_CODECS[number];

/** @public */
export declare type VideoCodecConfig = {
    codec: VideoCodec;
    bitrate: number;
    latencyMode?: VideoEncoderConfig['latencyMode'];
};

/** @public */
export declare class VideoFrameSource extends VideoSource {
    constructor(codecConfig: VideoCodecConfig);
    digest(videoFrame: VideoFrame): Promise<void>;
}

/** @public */
export declare abstract class VideoSource extends MediaSource_2 {
    constructor(codec: VideoCodec);
}

/** @public */
export declare type VideoTrackMetadata = {
    rotation?: 0 | 90 | 180 | 270 | TransformationMatrix;
    frameRate?: number;
};

/** @public */
export declare class WebMOutputFormat extends MkvOutputFormat {
}

/** @public */
export declare type WebMOutputFormatOptions = MkvOutputFormatOptions;

export { }

export as namespace Metamuxer;