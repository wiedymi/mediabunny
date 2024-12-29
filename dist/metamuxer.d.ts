/** @public */
export declare const ALL_FORMATS: InputFormat[];

/** @public */
export declare type AnyIterable<T> = Iterable<T> | AsyncIterable<T>;

/** @public */
export declare class ArrayBufferSource extends Source {
    constructor(buffer: ArrayBuffer);
}

/** @public */
export declare class ArrayBufferTarget extends Target {
    buffer: ArrayBuffer | null;
}

/** @public */
export declare const AUDIO_CODECS: readonly ["aac", "opus"];

/** @public */
export declare class AudioBufferDrain {
    constructor(audioTrack: InputAudioTrack);
    getBuffer(timestamp: number): Promise<WrappedAudioBuffer | null>;
    buffers(startTimestamp?: number, endTimestamp?: number): AsyncGenerator<WrappedAudioBuffer, void, unknown>;
    buffersAtTimestamps(timestamps: AnyIterable<number>): AsyncGenerator<WrappedAudioBuffer | null, void, unknown>;
}

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
export declare class AudioDataDrain extends BaseMediaFrameDrain<EncodedAudioChunk, AudioData> {
    constructor(audioTrack: InputAudioTrack);
    getData(timestamp: number): Promise<AudioData | null>;
    data(startTimestamp?: number, endTimestamp?: number): AsyncGenerator<AudioData, void, unknown>;
    dataAtTimestamps(timestamps: AnyIterable<number>): AsyncGenerator<AudioData | null, void, unknown>;
}

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
export declare abstract class BaseChunkDrain<Chunk extends EncodedVideoChunk | EncodedAudioChunk> {
    abstract getFirstChunk(options?: ChunkRetrievalOptions): Promise<Chunk | null>;
    abstract getChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
    abstract getNextChunk(chunk: Chunk, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
    abstract getKeyChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
    abstract getNextKeyChunk(chunk: Chunk, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
    chunks(startChunk?: Chunk, endTimestamp?: number): AsyncGenerator<Chunk, void, unknown>;
}

/** @public */
export declare abstract class BaseMediaFrameDrain<Chunk extends EncodedVideoChunk | EncodedAudioChunk, MediaFrame extends VideoFrame | AudioData> {
    protected mediaFramesAtTimestamps(timestamps: AnyIterable<number>): AsyncGenerator<MediaFrame | null, void, unknown>;
    protected mediaFramesInRange(startTimestamp?: number, endTimestamp?: number): AsyncGenerator<MediaFrame, void, unknown>;
}

/** @public */
export declare class BlobSource extends Source {
    constructor(blob: Blob);
}

/** @public */
export declare class CanvasDrain {
    constructor(videoTrack: InputVideoTrack, dimensions?: {
        width: number;
        height: number;
    });
    getCanvas(timestamp: number): Promise<WrappedCanvas | null>;
    canvases(startTimestamp?: number, endTimestamp?: number): AsyncGenerator<WrappedCanvas, void, unknown>;
    canvasesAtTimestamps(timestamps: AnyIterable<number>): AsyncGenerator<WrappedCanvas | null, void, unknown>;
}

/** @public */
export declare class CanvasSource extends VideoSource {
    constructor(canvas: HTMLCanvasElement | OffscreenCanvas, codecConfig: VideoCodecConfig);
    digest(timestamp: number, duration?: number): Promise<void>;
}

/** @public */
export declare type ChunkRetrievalOptions = {
    metadataOnly?: boolean;
};

/** @public */
export declare class EncodedAudioChunkDrain extends BaseChunkDrain<EncodedAudioChunk> {
    constructor(audioTrack: InputAudioTrack);
    getFirstChunk(options?: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
    getChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
    getNextChunk(chunk: EncodedAudioChunk, options?: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
    getKeyChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
    getNextKeyChunk(chunk: EncodedAudioChunk, options?: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
}

/** @public */
export declare class EncodedAudioChunkSource extends AudioSource {
    constructor(codec: AudioCodec);
    digest(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): Promise<void>;
}

/** @public */
export declare class EncodedVideoChunkDrain extends BaseChunkDrain<EncodedVideoChunk> {
    constructor(videoTrack: InputVideoTrack);
    getFirstChunk(options?: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
    getChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
    getNextChunk(chunk: EncodedVideoChunk, options?: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
    getKeyChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
    getNextKeyChunk(chunk: EncodedVideoChunk, options?: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
}

/** @public */
export declare class EncodedVideoChunkSource extends VideoSource {
    constructor(codec: VideoCodec);
    digest(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Promise<void>;
}

/** @public */
export declare class Input {
    constructor(options: InputOptions);
    getFormat(): Promise<InputFormat>;
    computeDuration(): Promise<number>;
    getTracks(): Promise<InputTrack[]>;
    getVideoTracks(): Promise<InputVideoTrack[]>;
    getPrimaryVideoTrack(): Promise<InputVideoTrack | null>;
    getAudioTracks(): Promise<InputAudioTrack[]>;
    getPrimaryAudioTrack(): Promise<InputAudioTrack | null>;
    getMimeType(): Promise<string>;
}

/** @public */
export declare class InputAudioTrack extends InputTrack {
    getCodec(): Promise<"aac" | "opus">;
    getNumberOfChannels(): Promise<number>;
    getSampleRate(): Promise<number>;
    getDecoderConfig(): Promise<AudioDecoderConfig>;
    getCodecMimeType(): Promise<string>;
}

/** @public */
export declare abstract class InputFormat {
}

/** @public */
export declare type InputOptions = {
    formats: InputFormat[];
    source: Source;
};

/** @public */
export declare abstract class InputTrack {
    abstract getCodec(): Promise<MediaCodec>;
    abstract getCodecMimeType(): Promise<string>;
    isVideoTrack(): this is InputVideoTrack;
    isAudioTrack(): this is InputAudioTrack;
    computeDuration(): Promise<number>;
}

/** @public */
export declare class InputVideoTrack extends InputTrack {
    getCodec(): Promise<"avc" | "hevc" | "vp8" | "vp9" | "av1">;
    getCodedWidth(): Promise<number>;
    getCodedHeight(): Promise<number>;
    getRotation(): Promise<Rotation>;
    getDisplayWidth(): Promise<number>;
    getDisplayHeight(): Promise<number>;
    getDecoderConfig(): Promise<VideoDecoderConfig>;
    getCodecMimeType(): Promise<string>;
}

/** @public */
export declare const ISOBMFF: IsobmffInputFormat;

/** @public */
export declare class IsobmffInputFormat extends InputFormat {
}

/** @public */
export declare const MATROSKA: MatroskaInputFormat;

/** @public */
export declare class MatroskaInputFormat extends InputFormat {
}

/** @public */
export declare type MediaCodec = VideoCodec | AudioCodec | SubtitleCodec;

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
export declare const MKV: MatroskaInputFormat;

/** @public */
export declare class MkvOutputFormat extends OutputFormat {
    constructor(options?: MkvOutputFormatOptions);
}

/** @public */
export declare type MkvOutputFormatOptions = {
    streamable?: boolean;
};

/** @public */
export declare const MOV: IsobmffInputFormat;

/** @public */
export declare const MP4: IsobmffInputFormat;

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
export declare type Rotation = 0 | 90 | 180 | 270;

/** @public */
export declare abstract class Source {
}

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
export declare class VideoFrameDrain extends BaseMediaFrameDrain<EncodedVideoChunk, VideoFrame> {
    constructor(videoTrack: InputVideoTrack);
    getFrame(timestamp: number): Promise<VideoFrame | null>;
    frames(startTimestamp?: number, endTimestamp?: number): AsyncGenerator<VideoFrame, void, unknown>;
    framesAtTimestamps(timestamps: AnyIterable<number>): AsyncGenerator<VideoFrame | null, void, unknown>;
}

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
export declare const WEBM: MatroskaInputFormat;

/** @public */
export declare class WebMOutputFormat extends MkvOutputFormat {
}

/** @public */
export declare type WebMOutputFormatOptions = MkvOutputFormatOptions;

/** @public */
export declare type WrappedAudioBuffer = {
    buffer: AudioBuffer;
    timestamp: number;
};

/** @public */
export declare type WrappedCanvas = {
    canvas: HTMLCanvasElement;
    timestamp: number;
    duration: number;
};

export { }

export as namespace Metamuxer;