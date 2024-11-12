import { buildAudioCodecString, buildVideoCodecString } from "./codec";
import { assert, TransformationMatrix } from "./misc";
import { OutputAudioTrack, OutputTrack, OutputVideoTrack } from "./output";

export type VideoCodec = 'avc' | 'hevc' | 'vp8' | 'vp9' | 'av1';
export type AudioCodec = 'aac' | 'opus' | 'vorbis'; // TODO add the rest

export abstract class VideoSource {
	connectedTrack: OutputVideoTrack | null = null;
	codec: VideoCodec;

	constructor(codec: VideoCodec) {
		this.codec = codec;
	}

	ensureValidDigest() {
		if (!this.connectedTrack) {
			throw new Error('Cannot call digest without connecting the source to an output track.');
		}

		if (!this.connectedTrack.output.started) {
			throw new Error('Cannot call digest before output has been started.');
		}

		if (this.connectedTrack.output.finalizing) {
			throw new Error('Cannot call digest after output has started finalizing.');
		}
	}

	start() {}
	async flush() {}
}

export abstract class AudioSource {
	connectedTrack: OutputAudioTrack | null = null;
	codec: AudioCodec;

	constructor(codec: AudioCodec) {
		this.codec = codec;
	}

	ensureNotFinalizing() {
		if (this.connectedTrack?.output.finalizing) {
			throw new Error('Cannot call digest after output has started finalizing.');
		}
	}

	start() {}
	async flush() {}
}

export type VideoCodecConfig = {
	codec: 'avc' | 'hevc' | 'vp8' | 'vp9' | 'av1',
	bitrate: number 
};

export type AudioCodecConfig = {
	codec: 'aac' | 'opus' | 'vorbis',
	bitrate: number
};

export class EncodedVideoChunkSource extends VideoSource {
	constructor(codec: VideoCodec) {
		super(codec);
	}

	// TODO: Ensure that the first chunk is a key frame (same for the audio case)

	digest(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
		this.ensureValidDigest();
		this.connectedTrack?.output.muxer.addEncodedVideoChunk(this.connectedTrack, chunk, meta);
	}
}

const KEY_FRAME_INTERVAL = 5;

class VideoEncoderWrapper {
	private encoder: VideoEncoder | null = null;
	private lastMultipleOfKeyFrameInterval = -1;

	constructor(private source: VideoSource, private codecConfig: VideoCodecConfig) {}

	// TODO: Ensure video frame size remains constant
	digest(videoFrame: VideoFrame) {
		this.source.ensureValidDigest();

		this.ensureEncoder(videoFrame);
		assert(this.encoder);

		const multipleOfKeyFrameInterval = Math.floor((videoFrame.timestamp / 1e6) / KEY_FRAME_INTERVAL);

		// Ensure a key frame every KEY_FRAME_INTERVAL seconds. It is important that all video tracks follow the same
		// "key frame" rhythm, because aligned key frames are required to start new fragments in ISOBMFF or clusters
		// in Matroska.
		this.encoder.encode(videoFrame, { keyFrame: multipleOfKeyFrameInterval !== this.lastMultipleOfKeyFrameInterval });

		this.lastMultipleOfKeyFrameInterval = multipleOfKeyFrameInterval;
	}

	private ensureEncoder(videoFrame: VideoFrame) {
		if (this.encoder) {
			return;
		}

		this.encoder = new VideoEncoder({
			output: (chunk, meta) => this.source.connectedTrack?.output.muxer.addEncodedVideoChunk(this.source.connectedTrack, chunk, meta),
			error: (error) => console.error(error), // TODO
		});

		this.encoder.configure({
			codec: buildVideoCodecString(this.codecConfig.codec, videoFrame.codedWidth, videoFrame.codedHeight),
			width: videoFrame.codedWidth,
			height: videoFrame.codedHeight,
			bitrate: this.codecConfig.bitrate,
		});
	}
	
	async flush() {
		return this.encoder?.flush();
	}
}

export class VideoFrameSource extends VideoSource {
	private encoder: VideoEncoderWrapper;

	constructor(codecConfig: VideoCodecConfig) {
		super(codecConfig.codec);
		this.encoder = new VideoEncoderWrapper(this, codecConfig);
	}

	digest(videoFrame: VideoFrame) {
		this.encoder.digest(videoFrame);
	}

	override flush() {
		return this.encoder.flush();
	}
}

export class CanvasSource extends VideoSource {
	private encoder: VideoEncoderWrapper;

	constructor(private canvas: HTMLCanvasElement, codecConfig: VideoCodecConfig) {
		super(codecConfig.codec);
		this.encoder = new VideoEncoderWrapper(this, codecConfig);
	}

	digest(timestamp: number, duration = 0) {
		const frame = new VideoFrame(this.canvas, {
			timestamp: Math.round(1e6 * timestamp),
			duration: Math.round(1e6 * duration),
		});

		this.encoder.digest(frame);
		frame.close();
	}

	override flush() {
		return this.encoder.flush();
	}
}

export class MediaStreamVideoTrackSource extends VideoSource {
    private encoder: VideoEncoderWrapper;
    private abortController: AbortController | null = null;

    constructor(private track: MediaStreamVideoTrack, codecConfig: VideoCodecConfig) {
        super(codecConfig.codec);
        this.encoder = new VideoEncoderWrapper(this, codecConfig);
    }

    override start() {
        this.abortController = new AbortController();
        
        const processor = new MediaStreamTrackProcessor({ track: this.track });
        const consumer = new WritableStream<VideoFrame>({
            write: (videoFrame) => {
                this.encoder.digest(videoFrame);
                videoFrame.close();
            }
        });

        processor.readable.pipeTo(consumer, {
            signal: this.abortController.signal
        }).catch(err => {
            // Handle abort error silently
            if (err instanceof DOMException && err.name === 'AbortError') return;
            // Handle other errors
            console.error('Pipe error:', err);
        });
    }

    override async flush() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        await this.encoder.flush();
    }
}

export class EncodedAudioChunkSource extends AudioSource {
	constructor(codec: AudioCodec) {
		super(codec);
	}

	digest(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) {
		this.ensureNotFinalizing();
		this.connectedTrack?.output.muxer.addEncodedAudioChunk(this.connectedTrack, chunk, meta);
	}
}

class AudioEncoderWrapper {
    private encoder: AudioEncoder | null = null;

    constructor(private source: AudioSource, private codecConfig: AudioCodecConfig) {}

	// TODO: Ensure audio parameters remain constant
    digest(audioData: AudioData) {
        this.source.ensureNotFinalizing();

        this.ensureEncoder(audioData);
        assert(this.encoder);

        this.encoder.encode(audioData);
    }

    private ensureEncoder(audioData: AudioData) {
        if (this.encoder) {
            return;
        }

        this.encoder = new AudioEncoder({
            output: (chunk, meta) => this.source.connectedTrack?.output.muxer.addEncodedAudioChunk(this.source.connectedTrack, chunk, meta),
            error: (error) => console.error(error), // TODO
        });

        this.encoder.configure({
            codec: buildAudioCodecString(this.codecConfig.codec, audioData.numberOfChannels, audioData.sampleRate),
            numberOfChannels: audioData.numberOfChannels,
            sampleRate: audioData.sampleRate,
            bitrate: this.codecConfig.bitrate,
        });
    }
    
    async flush() {
        return this.encoder?.flush();
    }
}

export class AudioDataSource extends AudioSource {
    private encoder: AudioEncoderWrapper;

    constructor(codecConfig: AudioCodecConfig) {
        super(codecConfig.codec);
        this.encoder = new AudioEncoderWrapper(this, codecConfig);
    }

    digest(audioData: AudioData) {
        this.encoder.digest(audioData);
    }

    override flush() {
        return this.encoder.flush();
    }
}

export class AudioBufferSource extends AudioSource {
    private encoder: AudioEncoderWrapper;
    private accumulatedFrameCount = 0;

    constructor(codecConfig: AudioCodecConfig) {
        super(codecConfig.codec);
        this.encoder = new AudioEncoderWrapper(this, codecConfig);
    }

    digest(audioBuffer: AudioBuffer) {
        const numberOfChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const numberOfFrames = audioBuffer.length;
        
        // Create a planar F32 array containing all channels
        const data = new Float32Array(numberOfChannels * numberOfFrames);
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            data.set(channelData, channel * numberOfFrames);
        }

        const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate,
            numberOfFrames,
            numberOfChannels,
            timestamp: Math.round(1e6 * this.accumulatedFrameCount / sampleRate),
            data: data
        });

        this.encoder.digest(audioData);
        audioData.close();

		this.accumulatedFrameCount += numberOfFrames;
    }

    override flush() {
        return this.encoder.flush();
    }
}

export class MediaStreamAudioTrackSource extends AudioSource {
    private encoder: AudioEncoderWrapper;
    private abortController: AbortController | null = null;

    constructor(private track: MediaStreamAudioTrack, codecConfig: AudioCodecConfig) {
        super(codecConfig.codec);
        this.encoder = new AudioEncoderWrapper(this, codecConfig);
    }

    override start() {
        this.abortController = new AbortController();
        
        const processor = new MediaStreamTrackProcessor({ track: this.track });
        const consumer = new WritableStream<AudioData>({
            write: (audioData) => {
                this.encoder.digest(audioData);
                audioData.close();
            }
        });

        processor.readable.pipeTo(consumer, {
            signal: this.abortController.signal
        }).catch(err => {
            // Handle abort error silently
            if (err instanceof DOMException && err.name === 'AbortError') return;
            // Handle other errors
            console.error('Pipe error:', err);
        });
    }

    override async flush() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        await this.encoder.flush();
    }
}