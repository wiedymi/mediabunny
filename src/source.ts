import { buildAudioCodecString, buildVideoCodecString } from "./codec";
import { assert } from "./misc";
import { OutputAudioTrack, OutputSubtitleTrack, OutputTrack, OutputVideoTrack } from "./output";
import { SubtitleParser } from "./subtitles";

const VIDEO_CODECS = ['avc', 'hevc', 'vp8', 'vp9', 'av1'] as const;
const AUDIO_CODECS = ['aac', 'opus'] as const; // TODO add the rest
const SUBTITLE_CODECS = ['webvtt'] as const; // TODO add the rest

export type VideoCodec = typeof VIDEO_CODECS[number];
export type AudioCodec = typeof AUDIO_CODECS[number];
export type SubtitleCodec = typeof SUBTITLE_CODECS[number];

export abstract class MediaSource {
	connectedTrack: OutputTrack | null = null;
	closed = false;
	offsetTimestamps = false;

	// TODO this is also just internal:
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

		if (this.closed) {
			throw new Error('Cannot call digest after source has been closed.');
		}
	}

	// TODO: These are should not be called from the outside lib
	start() {}
	async flush() {}

	close() {
		if (this.closed) {
			throw new Error('Source already closed.');
		}

		if (!this.connectedTrack) {
			throw new Error('Cannot call close without connecting the source to an output track.');
		}

		if (!this.connectedTrack.output.started) {
			throw new Error('Cannot call close before output has been started.');
		}

		this.closed = true;

		if (this.connectedTrack.output.finalizing) {
			return;
		}

		this.connectedTrack.output.muxer.onTrackClose(this.connectedTrack);
	}
}

export abstract class VideoSource extends MediaSource {
	override connectedTrack: OutputVideoTrack | null = null;
	codec: VideoCodec;

	constructor(codec: VideoCodec) {
		super();

		if (!VIDEO_CODECS.includes(codec)) {
			throw new TypeError(`Invalid video codec '${codec}'. Must be one of: ${VIDEO_CODECS.join(', ')}.`);
		}

		this.codec = codec;
	}
}

export class EncodedVideoChunkSource extends VideoSource {
	constructor(codec: VideoCodec) {
		super(codec);
	}

	digest(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
		if (!(chunk instanceof EncodedVideoChunk)) {
			// TODO add polyfill for browsers that don't have this
			throw new TypeError('chunk must be an EncodedVideoChunk.');
		}

		this.ensureValidDigest();
		this.connectedTrack?.output.muxer.addEncodedVideoChunk(this.connectedTrack, chunk, meta);
	}
}

const KEY_FRAME_INTERVAL = 5;

type VideoCodecConfig = {
	codec: VideoCodec,
	bitrate: number,
	latencyMode?: VideoEncoderConfig['latencyMode']
};

const validateVideoCodecConfig = (config: VideoCodecConfig) => {
	if (!config || typeof config !== 'object') {
		throw new TypeError('Codec config must be an object.');
	}
	if (!VIDEO_CODECS.includes(config.codec)) {
		throw new TypeError(`Invalid video codec '${config.codec}'. Must be one of: ${VIDEO_CODECS.join(', ')}.`);
	}
	if (!Number.isInteger(config.bitrate) || config.bitrate <= 0) {
		throw new TypeError('config.bitrate must be a positive integer.');
	}
	if (config.latencyMode !== undefined && ['quality', 'realtime'].includes(config.latencyMode)) {
		throw new TypeError("config.latencyMode, when provided, must be 'quality' or 'realtime'.");
	}
};

class VideoEncoderWrapper {
	private encoder: VideoEncoder | null = null;
	private lastMultipleOfKeyFrameInterval = -1;
	private lastWidth: number | null = null;
	private lastHeight: number | null = null;

	constructor(private source: VideoSource, private codecConfig: VideoCodecConfig) {
		validateVideoCodecConfig(codecConfig);
	}

	digest(videoFrame: VideoFrame) {
		this.source.ensureValidDigest();

		// Ensure video frame size remains constant
		if (this.lastWidth !== null && this.lastHeight !== null) {
			if (videoFrame.codedWidth !== this.lastWidth || videoFrame.codedHeight !== this.lastHeight) {
				throw new Error(`Video frame size must remain constant. Expected ${this.lastWidth}x${this.lastHeight}, got ${videoFrame.codedWidth}x${videoFrame.codedHeight}.`);
			}
		} else {
			this.lastWidth = videoFrame.codedWidth;
			this.lastHeight = videoFrame.codedHeight;
		}

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
			error: (error) => console.error('Video encode error:', error),
		});

		this.encoder.configure({
			codec: buildVideoCodecString(this.codecConfig.codec, videoFrame.codedWidth, videoFrame.codedHeight),
			width: videoFrame.codedWidth,
			height: videoFrame.codedHeight,
			bitrate: this.codecConfig.bitrate,
			framerate: this.source.connectedTrack?.metadata.frameRate,
			latencyMode: this.codecConfig.latencyMode,
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
		if (!(videoFrame instanceof VideoFrame)) {
			throw new TypeError('videoFrame must be a VideoFrame.');
		}

		this.encoder.digest(videoFrame);
	}

	override flush() {
		return this.encoder.flush();
	}
}

export class CanvasSource extends VideoSource {
	private encoder: VideoEncoderWrapper;

	constructor(private canvas: HTMLCanvasElement, codecConfig: VideoCodecConfig) {
		if (!(canvas instanceof HTMLCanvasElement)) {
			throw new TypeError('canvas must be an HTMLCanvasElement.');
		}

		super(codecConfig.codec);
		this.encoder = new VideoEncoderWrapper(this, codecConfig);
	}

	digest(timestamp: number, duration = 0) {
		if (!Number.isFinite(timestamp) || timestamp < 0) {
			throw new TypeError('timestamp must be a non-negative number.');
		}
		if (!Number.isFinite(duration) || duration < 0) {
			throw new TypeError('duration must be a non-negative number.');
		}

		const frame = new VideoFrame(this.canvas, {
			timestamp: Math.round(1e6 * timestamp),
			duration: Math.round(1e6 * duration),
			alpha: 'discard',
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

	override offsetTimestamps = true;

	constructor(private track: MediaStreamVideoTrack, codecConfig: VideoCodecConfig) {
		if (!(track instanceof MediaStreamTrack) || track.kind !== 'video') {
			throw new TypeError('track must be a video MediaStreamTrack.');
		}

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

export abstract class AudioSource extends MediaSource {
	override connectedTrack: OutputAudioTrack | null = null;
	codec: AudioCodec;

	constructor(codec: AudioCodec) {
		super();

		if (!AUDIO_CODECS.includes(codec)) {
			throw new TypeError(`Invalid audio codec '${codec}'. Must be one of: ${AUDIO_CODECS.join(', ')}.`);
		}

		this.codec = codec;
	}
}

export class EncodedAudioChunkSource extends AudioSource {
	constructor(codec: AudioCodec) {
		super(codec);
	}

	digest(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) {
		if (!(chunk instanceof EncodedAudioChunk)) {
			// TODO add polyfill for browsers that don't have this
			throw new TypeError('chunk must be an EncodedAudioChunk.');
		}

		this.ensureValidDigest();
		this.connectedTrack?.output.muxer.addEncodedAudioChunk(this.connectedTrack, chunk, meta);
	}
}

type AudioCodecConfig = {
	codec: AudioCodec,
	bitrate: number
};

const validateAudioCodecConfig = (config: AudioCodecConfig) => {
	if (!config || typeof config !== 'object') {
		throw new TypeError('Codec config must be an object.');
	}
	if (!AUDIO_CODECS.includes(config.codec)) {
		throw new TypeError(`Invalid audio codec '${config.codec}'. Must be one of: ${AUDIO_CODECS.join(', ')}.`);
	}
	if (!Number.isInteger(config.bitrate) || config.bitrate <= 0) {
		throw new TypeError('config.bitrate must be a positive integer.');
	}
};

class AudioEncoderWrapper {
	private encoder: AudioEncoder | null = null;
	private lastNumberOfChannels: number | null = null;
	private lastSampleRate: number | null = null;

	constructor(private source: AudioSource, private codecConfig: AudioCodecConfig) {
		validateAudioCodecConfig(codecConfig);
	}

	digest(audioData: AudioData) {
		this.source.ensureValidDigest();

		// Ensure audio parameters remain constant
		if (this.lastNumberOfChannels !== null && this.lastSampleRate !== null) {
			if (audioData.numberOfChannels !== this.lastNumberOfChannels || audioData.sampleRate !== this.lastSampleRate) {
				throw new Error(`Audio parameters must remain constant. Expected ${this.lastNumberOfChannels} channels at ${this.lastSampleRate} Hz, got ${audioData.numberOfChannels} channels at ${audioData.sampleRate} Hz.`);
			}
		} else {
			this.lastNumberOfChannels = audioData.numberOfChannels;
			this.lastSampleRate = audioData.sampleRate;
		}

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
			error: (error) => console.error('Audio encode error:', error),
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
		if (!(audioData instanceof AudioData)) {
			throw new TypeError('audioData must be an AudioData.');
		}

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
		if (!(audioBuffer instanceof AudioBuffer)) {
			throw new TypeError('audioBuffer must be an AudioBuffer.');
		}

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

	override offsetTimestamps = true;

	constructor(private track: MediaStreamAudioTrack, codecConfig: AudioCodecConfig) {
		if (!(track instanceof MediaStreamTrack) || track.kind !== 'audio') {
			throw new TypeError('track must be an audio MediaStreamTrack.');
		}

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

export abstract class SubtitleSource extends MediaSource {
	override connectedTrack: OutputSubtitleTrack | null = null;
	codec: SubtitleCodec;

	constructor(codec: SubtitleCodec) {
		super();

		if (!SUBTITLE_CODECS.includes(codec)) {
			throw new TypeError(`Invalid subtitle codec '${codec}'. Must be one of: ${SUBTITLE_CODECS.join(', ')}.`);
		}

		this.codec = codec;
	}
}

export class TextSubtitleSource extends SubtitleSource {
	private parser: SubtitleParser;

	constructor(codec: SubtitleCodec) {
		super(codec);

		this.parser = new SubtitleParser({
			codec,
			output: (cue, metadata) => this.connectedTrack?.output.muxer.addSubtitleCue(this.connectedTrack, cue, metadata),
			error: (error) => console.error('Subtitle parse error:', error)
		});
	}

	digest(text: string) {
		if (typeof text !== 'string') {
			throw new TypeError('text must be a string.');
		}

		this.ensureValidDigest();
		this.parser.parse(text);
	}
}