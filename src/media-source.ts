import {
	AUDIO_CODECS,
	AudioCodec,
	buildAudioCodecString,
	buildVideoCodecString,
	getAudioEncoderConfigExtension,
	getVideoEncoderConfigExtension,
	SUBTITLE_CODECS,
	SubtitleCodec,
	VIDEO_CODECS,
	VideoCodec,
} from './codec';
import { OutputAudioTrack, OutputSubtitleTrack, OutputTrack, OutputVideoTrack } from './output';
import { assert } from './misc';
import { Muxer } from './muxer';
import { SubtitleParser } from './subtitles';

/** @public */
export abstract class MediaSource {
	/** @internal */
	_connectedTrack: OutputTrack | null = null;
	/** @internal */
	_closing = false;
	/** @internal */
	_closed = false;
	/** @internal */
	_offsetTimestamps = false;

	/** @internal */
	_ensureValidDigest() {
		if (!this._connectedTrack) {
			throw new Error('Cannot call digest without connecting the source to an output track.');
		}

		if (this._connectedTrack.output._canceled) {
			throw new Error('Cannot call digest after output has been canceled.');
		}

		if (!this._connectedTrack.output._started) {
			throw new Error('Cannot call digest before output has been started.');
		}

		if (this._connectedTrack.output._finalizing) {
			throw new Error('Cannot call digest after output has started finalizing.');
		}

		if (this._closed) {
			throw new Error('Cannot call digest after source has been closed.');
		}
	}

	/** @internal */
	_start() {}
	/** @internal */
	async _flush() {}

	async close() {
		if (this._closing) {
			throw new Error('Source already closed.');
		}

		if (!this._connectedTrack) {
			throw new Error('Cannot call close without connecting the source to an output track.');
		}

		if (!this._connectedTrack.output._started) {
			throw new Error('Cannot call close before output has been started.');
		}

		this._closing = true;

		await this._flush();

		this._closed = true;

		if (this._connectedTrack.output._finalizing) {
			return;
		}

		this._connectedTrack.output._muxer.onTrackClose(this._connectedTrack);
	}
}

/** @public */
export abstract class VideoSource extends MediaSource {
	/** @internal */
	override _connectedTrack: OutputVideoTrack | null = null;
	/** @internal */
	_codec: VideoCodec;

	constructor(codec: VideoCodec) {
		super();

		if (!VIDEO_CODECS.includes(codec)) {
			throw new TypeError(`Invalid video codec '${codec}'. Must be one of: ${VIDEO_CODECS.join(', ')}.`);
		}

		this._codec = codec;
	}
}

/** @public */
export class EncodedVideoChunkSource extends VideoSource {
	constructor(codec: VideoCodec) {
		super(codec);
	}

	digest(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
		if (!(chunk instanceof EncodedVideoChunk)) {
			// TODO add polyfill for browsers that don't have this
			throw new TypeError('chunk must be an EncodedVideoChunk.');
		}

		this._ensureValidDigest();
		return this._connectedTrack!.output._muxer.addEncodedVideoChunk(this._connectedTrack!, chunk, meta);
	}
}

/** @public */
export type VideoEncodingConfig = {
	codec: VideoCodec;
	bitrate: number;
	latencyMode?: VideoEncoderConfig['latencyMode'];
	keyFrameInterval?: number;
	onEncodedChunk?: (chunk: EncodedVideoChunk, meta: EncodedVideoChunkMetadata | undefined) => unknown;
	onEncodingError?: (error: Error) => unknown;
};

const validateVideoEncodingConfig = (config: VideoEncodingConfig) => {
	if (!config || typeof config !== 'object') {
		throw new TypeError('Encoding config must be an object.');
	}
	if (!VIDEO_CODECS.includes(config.codec)) {
		throw new TypeError(`Invalid video codec '${config.codec}'. Must be one of: ${VIDEO_CODECS.join(', ')}.`);
	}
	if (!Number.isInteger(config.bitrate) || config.bitrate <= 0) {
		throw new TypeError('config.bitrate must be a positive integer.');
	}
	if (config.latencyMode !== undefined && !['quality', 'realtime'].includes(config.latencyMode)) {
		throw new TypeError('config.latencyMode, when provided, must be \'quality\' or \'realtime\'.');
	}
	if (
		config.keyFrameInterval !== undefined
		&& (!Number.isFinite(config.keyFrameInterval) || config.keyFrameInterval < 0)
	) {
		throw new TypeError('config.keyFrameInterval, when provided, must be a non-negative number.');
	}
	if (config.onEncodedChunk !== undefined && typeof config.onEncodedChunk !== 'function') {
		throw new TypeError('config.onEncodedChunk, when provided, must be a function.');
	}
	if (config.onEncodingError !== undefined && typeof config.onEncodingError !== 'function') {
		throw new TypeError('config.onEncodingError, when provided, must be a function.');
	}
};

class VideoEncoderWrapper {
	private encoder: VideoEncoder | null = null;
	private muxer: Muxer | null = null;
	private lastMultipleOfKeyFrameInterval = -1;
	private lastWidth: number | null = null;
	private lastHeight: number | null = null;

	constructor(private source: VideoSource, private encodingConfig: VideoEncodingConfig) {
		validateVideoEncodingConfig(encodingConfig);
	}

	async digest(videoFrame: VideoFrame, encodeOptions?: VideoEncoderEncodeOptions) {
		this.source._ensureValidDigest();

		// Ensure video frame size remains constant
		if (this.lastWidth !== null && this.lastHeight !== null) {
			if (videoFrame.codedWidth !== this.lastWidth || videoFrame.codedHeight !== this.lastHeight) {
				throw new Error(
					`Video frame size must remain constant. Expected ${this.lastWidth}x${this.lastHeight},`
					+ ` got ${videoFrame.codedWidth}x${videoFrame.codedHeight}.`,
				);
			}
		} else {
			this.lastWidth = videoFrame.codedWidth;
			this.lastHeight = videoFrame.codedHeight;
		}

		this.ensureEncoder(videoFrame);
		assert(this.encoder);

		const keyFrameInterval = this.encodingConfig.keyFrameInterval ?? 5;
		const multipleOfKeyFrameInterval = Math.floor((videoFrame.timestamp / 1e6) / keyFrameInterval);

		// Ensure a key frame every KEY_FRAME_INTERVAL seconds. It is important that all video tracks follow the same
		// "key frame" rhythm, because aligned key frames are required to start new fragments in ISOBMFF or clusters
		// in Matroska.
		this.encoder.encode(videoFrame, {
			...encodeOptions,
			keyFrame: keyFrameInterval === 0 || multipleOfKeyFrameInterval !== this.lastMultipleOfKeyFrameInterval,
		});

		this.lastMultipleOfKeyFrameInterval = multipleOfKeyFrameInterval;

		// We need to do this after sending the frame to the encoder as the frame otherwise might be closed
		if (this.encoder.encodeQueueSize >= 4) {
			await new Promise(resolve => this.encoder!.addEventListener('dequeue', resolve, { once: true }));
		}

		await this.muxer!.mutex.currentPromise; // Allow the writer to apply backpressure
	}

	private ensureEncoder(videoFrame: VideoFrame) {
		if (this.encoder) {
			return;
		}

		this.encoder = new VideoEncoder({
			output: (chunk, meta) => {
				this.encodingConfig.onEncodedChunk?.(chunk, meta);
				void this.muxer!.addEncodedVideoChunk(this.source._connectedTrack!, chunk, meta);
			},
			error: this.encodingConfig.onEncodingError ?? (error => console.error('VideoEncoder error:', error)),
		});

		this.encoder.configure({
			codec: buildVideoCodecString(
				this.encodingConfig.codec,
				videoFrame.codedWidth,
				videoFrame.codedHeight,
				this.encodingConfig.bitrate,
			),
			width: videoFrame.codedWidth,
			height: videoFrame.codedHeight,
			bitrate: this.encodingConfig.bitrate,
			framerate: this.source._connectedTrack?.metadata.frameRate,
			latencyMode: this.encodingConfig.latencyMode,
			...getVideoEncoderConfigExtension(this.encodingConfig.codec),
		});

		assert(this.source._connectedTrack);
		this.muxer = this.source._connectedTrack.output._muxer;
	}

	async flush() {
		if (this.encoder) {
			await this.encoder.flush();
			this.encoder.close();
		}
	}
}

/** @public */
export class VideoFrameSource extends VideoSource {
	/** @internal */
	private _encoder: VideoEncoderWrapper;

	constructor(encodingConfig: VideoEncodingConfig) {
		super(encodingConfig.codec);
		this._encoder = new VideoEncoderWrapper(this, encodingConfig);
	}

	digest(videoFrame: VideoFrame, encodeOptions?: VideoEncoderEncodeOptions) {
		if (!(videoFrame instanceof VideoFrame)) {
			throw new TypeError('videoFrame must be a VideoFrame.');
		}

		return this._encoder.digest(videoFrame, encodeOptions);
	}

	/** @internal */
	override _flush() {
		return this._encoder.flush();
	}
}

/** @public */
export class CanvasSource extends VideoSource {
	/** @internal */
	private _encoder: VideoEncoderWrapper;
	/** @internal */
	private _canvas: HTMLCanvasElement | OffscreenCanvas;

	constructor(canvas: HTMLCanvasElement | OffscreenCanvas, encodingConfig: VideoEncodingConfig) {
		if (!(canvas instanceof HTMLCanvasElement)) {
			throw new TypeError('canvas must be an HTMLCanvasElement.');
		}

		super(encodingConfig.codec);
		this._encoder = new VideoEncoderWrapper(this, encodingConfig);
		this._canvas = canvas;
	}

	digest(timestamp: number, duration = 0, encodeOptions?: VideoEncoderEncodeOptions) {
		if (!Number.isFinite(timestamp) || timestamp < 0) {
			throw new TypeError('timestamp must be a non-negative number.');
		}
		if (!Number.isFinite(duration) || duration < 0) {
			throw new TypeError('duration must be a non-negative number.');
		}

		const frame = new VideoFrame(this._canvas, {
			timestamp: Math.round(1e6 * timestamp),
			duration: Math.round(1e6 * duration),
			alpha: 'discard',
		});

		const promise = this._encoder.digest(frame, encodeOptions);
		frame.close();

		return promise;
	}

	/** @internal */
	override _flush() {
		return this._encoder.flush();
	}
}

/** @public */
export class MediaStreamVideoTrackSource extends VideoSource {
	/** @internal */
	private _encoder: VideoEncoderWrapper;
	/** @internal */
	private _abortController: AbortController | null = null;
	/** @internal */
	private _track: MediaStreamVideoTrack;

	/** @internal */
	override _offsetTimestamps = true;

	constructor(track: MediaStreamVideoTrack, encodingConfig: VideoEncodingConfig) {
		if (!(track instanceof MediaStreamTrack) || track.kind !== 'video') {
			throw new TypeError('track must be a video MediaStreamTrack.');
		}

		encodingConfig = {
			...encodingConfig,
			latencyMode: 'realtime',
		};

		super(encodingConfig.codec);
		this._encoder = new VideoEncoderWrapper(this, encodingConfig);
		this._track = track;
	}

	/** @internal */
	override _start() {
		this._abortController = new AbortController();

		const processor = new MediaStreamTrackProcessor({ track: this._track });
		const consumer = new WritableStream<VideoFrame>({
			write: (videoFrame) => {
				// TODO: Drop frames if encoder overloaded
				void this._encoder.digest(videoFrame);
				videoFrame.close();
			},
		});

		processor.readable.pipeTo(consumer, {
			signal: this._abortController.signal,
		}).catch((err) => {
			// Handle abort error silently
			if (err instanceof DOMException && err.name === 'AbortError') return;
			// Handle other errors
			console.error('Pipe error:', err);
		});
	}

	/** @internal */
	override async _flush() {
		if (this._abortController) {
			this._abortController.abort();
			this._abortController = null;
		}

		await this._encoder.flush();
	}
}

/** @public */
export abstract class AudioSource extends MediaSource {
	/** @internal */
	override _connectedTrack: OutputAudioTrack | null = null;
	/** @internal */
	_codec: AudioCodec;

	constructor(codec: AudioCodec) {
		super();

		if (!AUDIO_CODECS.includes(codec)) {
			throw new TypeError(`Invalid audio codec '${codec}'. Must be one of: ${AUDIO_CODECS.join(', ')}.`);
		}

		this._codec = codec;
	}
}

/** @public */
export class EncodedAudioChunkSource extends AudioSource {
	constructor(codec: AudioCodec) {
		super(codec);
	}

	digest(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) {
		if (!(chunk instanceof EncodedAudioChunk)) {
			// TODO add polyfill for browsers that don't have this
			throw new TypeError('chunk must be an EncodedAudioChunk.');
		}

		this._ensureValidDigest();
		return this._connectedTrack!.output._muxer.addEncodedAudioChunk(this._connectedTrack!, chunk, meta);
	}
}
/** @public */
export type AudioEncodingConfig = {
	codec: AudioCodec;
	bitrate: number;
	onEncodedChunk?: (chunk: EncodedAudioChunk, meta: EncodedAudioChunkMetadata | undefined) => unknown;
	onEncodingError?: (error: Error) => unknown;
};

const validateAudioEncodingConfig = (config: AudioEncodingConfig) => {
	if (!config || typeof config !== 'object') {
		throw new TypeError('Encoding config must be an object.');
	}
	if (!AUDIO_CODECS.includes(config.codec)) {
		throw new TypeError(`Invalid audio codec '${config.codec}'. Must be one of: ${AUDIO_CODECS.join(', ')}.`);
	}
	if (!Number.isInteger(config.bitrate) || config.bitrate <= 0) {
		throw new TypeError('config.bitrate must be a positive integer.');
	}
	if (config.onEncodingError !== undefined && typeof config.onEncodingError !== 'function') {
		throw new TypeError('config.onEncodingError, when provided, must be a function.');
	}
};

class AudioEncoderWrapper {
	private encoder: AudioEncoder | null = null;
	private muxer: Muxer | null = null;
	private lastNumberOfChannels: number | null = null;
	private lastSampleRate: number | null = null;

	constructor(private source: AudioSource, private encodingConfig: AudioEncodingConfig) {
		validateAudioEncodingConfig(encodingConfig);
	}

	async digest(audioData: AudioData) {
		this.source._ensureValidDigest();

		// Ensure audio parameters remain constant
		if (this.lastNumberOfChannels !== null && this.lastSampleRate !== null) {
			if (
				audioData.numberOfChannels !== this.lastNumberOfChannels
				|| audioData.sampleRate !== this.lastSampleRate
			) {
				throw new Error(
					`Audio parameters must remain constant. Expected ${this.lastNumberOfChannels} channels at`
					+ ` ${this.lastSampleRate} Hz, got ${audioData.numberOfChannels} channels at`
					+ ` ${audioData.sampleRate} Hz.`,
				);
			}
		} else {
			this.lastNumberOfChannels = audioData.numberOfChannels;
			this.lastSampleRate = audioData.sampleRate;
		}

		this.ensureEncoder(audioData);
		assert(this.encoder);

		this.encoder.encode(audioData);

		if (this.encoder.encodeQueueSize >= 4) {
			await new Promise(resolve => this.encoder!.addEventListener('dequeue', resolve, { once: true }));
		}

		await this.muxer!.mutex.currentPromise; // Allow the writer to apply backpressure
	}

	private ensureEncoder(audioData: AudioData) {
		if (this.encoder) {
			return;
		}

		this.encoder = new AudioEncoder({
			output: (chunk, meta) => {
				this.encodingConfig.onEncodedChunk?.(chunk, meta);
				void this.muxer!.addEncodedAudioChunk(this.source._connectedTrack!, chunk, meta);
			},
			error: this.encodingConfig.onEncodingError ?? (error => console.error('AudioEncoder error:', error)),
		});

		this.encoder.configure({
			codec: buildAudioCodecString(this.encodingConfig.codec, audioData.numberOfChannels, audioData.sampleRate),
			numberOfChannels: audioData.numberOfChannels,
			sampleRate: audioData.sampleRate,
			bitrate: this.encodingConfig.bitrate,
			...getAudioEncoderConfigExtension(this.encodingConfig.codec),
		});

		assert(this.source._connectedTrack);
		this.muxer = this.source._connectedTrack.output._muxer;
	}

	async flush() {
		if (this.encoder) {
			await this.encoder.flush();
			this.encoder.close();
		}
	}
}

/** @public */
export class AudioDataSource extends AudioSource {
	/** @internal */
	private _encoder: AudioEncoderWrapper;

	constructor(encodingConfig: AudioEncodingConfig) {
		super(encodingConfig.codec);
		this._encoder = new AudioEncoderWrapper(this, encodingConfig);
	}

	digest(audioData: AudioData) {
		if (!(audioData instanceof AudioData)) {
			throw new TypeError('audioData must be an AudioData.');
		}

		return this._encoder.digest(audioData);
	}

	/** @internal */
	override _flush() {
		return this._encoder.flush();
	}
}

/** @public */
export class AudioBufferSource extends AudioSource {
	/** @internal */
	private _encoder: AudioEncoderWrapper;
	/** @internal */
	private _accumulatedFrameCount = 0;

	constructor(encodingConfig: AudioEncodingConfig) {
		super(encodingConfig.codec);
		this._encoder = new AudioEncoderWrapper(this, encodingConfig);
	}

	digest(audioBuffer: AudioBuffer) {
		if (!(audioBuffer instanceof AudioBuffer)) {
			throw new TypeError('audioBuffer must be an AudioBuffer.');
		}

		const MAX_FLOAT_COUNT = 64 * 1024 * 1024;

		const numberOfChannels = audioBuffer.numberOfChannels;
		const sampleRate = audioBuffer.sampleRate;
		const totalFrames = audioBuffer.length;
		const maxFramesPerChunk = Math.floor(MAX_FLOAT_COUNT / numberOfChannels);

		let currentRelativeFrame = 0;
		let remainingFrames = totalFrames;

		const promises: Promise<void>[] = [];

		// Create AudioData in a chunked fashion so we don't create huge Float32Arrays
		while (remainingFrames > 0) {
			const framesToCopy = Math.min(maxFramesPerChunk, remainingFrames);
			const chunkData = new Float32Array(numberOfChannels * framesToCopy);

			for (let channel = 0; channel < numberOfChannels; channel++) {
				audioBuffer.copyFromChannel(
					chunkData.subarray(channel * framesToCopy, channel * framesToCopy + framesToCopy),
					channel,
					currentRelativeFrame,
				);
			}

			const audioData = new AudioData({
				format: 'f32-planar',
				sampleRate,
				numberOfFrames: framesToCopy,
				numberOfChannels,
				timestamp: (1e6 * (this._accumulatedFrameCount + currentRelativeFrame)) / sampleRate,
				data: chunkData,
			});

			promises.push(this._encoder.digest(audioData));
			audioData.close();

			currentRelativeFrame += framesToCopy;
			remainingFrames -= framesToCopy;
		}

		this._accumulatedFrameCount += totalFrames;
		return Promise.all(promises);
	}

	/** @internal */
	override _flush() {
		return this._encoder.flush();
	}
}

/** @public */
export class MediaStreamAudioTrackSource extends AudioSource {
	/** @internal */
	private _encoder: AudioEncoderWrapper;
	/** @internal */
	private _abortController: AbortController | null = null;
	/** @internal */
	private _track: MediaStreamAudioTrack;

	/** @internal */
	override _offsetTimestamps = true;

	constructor(track: MediaStreamAudioTrack, encodingConfig: AudioEncodingConfig) {
		if (!(track instanceof MediaStreamTrack) || track.kind !== 'audio') {
			throw new TypeError('track must be an audio MediaStreamTrack.');
		}

		super(encodingConfig.codec);
		this._encoder = new AudioEncoderWrapper(this, encodingConfig);
		this._track = track;
	}

	/** @internal */
	override _start() {
		this._abortController = new AbortController();

		const processor = new MediaStreamTrackProcessor({ track: this._track });
		const consumer = new WritableStream<AudioData>({
			write: (audioData) => {
				// TODO: Drop frames if encoder overloaded
				void this._encoder.digest(audioData);
				audioData.close();
			},
		});

		processor.readable.pipeTo(consumer, {
			signal: this._abortController.signal,
		}).catch((err) => {
			// Handle abort error silently
			if (err instanceof DOMException && err.name === 'AbortError') return;
			// Handle other errors
			console.error('Pipe error:', err);
		});
	}

	/** @internal */
	override async _flush() {
		if (this._abortController) {
			this._abortController.abort();
			this._abortController = null;
		}

		await this._encoder.flush();
	}
}

/** @public */
export abstract class SubtitleSource extends MediaSource {
	/** @internal */
	override _connectedTrack: OutputSubtitleTrack | null = null;
	/** @internal */
	_codec: SubtitleCodec;

	constructor(codec: SubtitleCodec) {
		super();

		if (!SUBTITLE_CODECS.includes(codec)) {
			throw new TypeError(`Invalid subtitle codec '${codec}'. Must be one of: ${SUBTITLE_CODECS.join(', ')}.`);
		}

		this._codec = codec;
	}
}

/** @public */
export class TextSubtitleSource extends SubtitleSource {
	/** @internal */
	private _parser: SubtitleParser;

	constructor(codec: SubtitleCodec) {
		super(codec);

		this._parser = new SubtitleParser({
			codec,
			output: (cue, metadata) =>
				this._connectedTrack?.output._muxer.addSubtitleCue(this._connectedTrack, cue, metadata),
		});
	}

	digest(text: string) {
		if (typeof text !== 'string') {
			throw new TypeError('text must be a string.');
		}

		this._ensureValidDigest();
		this._parser.parse(text);

		return this._connectedTrack!.output._muxer.mutex.currentPromise;
	}
}
