import {
	AUDIO_CODECS,
	AudioCodec,
	buildAudioCodecString,
	buildVideoCodecString,
	getAudioEncoderConfigExtension,
	getVideoEncoderConfigExtension,
	parsePcmCodec,
	PCM_AUDIO_CODECS,
	PcmAudioCodec,
	Quality,
	SUBTITLE_CODECS,
	SubtitleCodec,
	VIDEO_CODECS,
	VideoCodec,
} from './codec';
import { OutputAudioTrack, OutputSubtitleTrack, OutputTrack, OutputVideoTrack } from './output';
import { assert, clamp, promiseWithResolvers, setInt24, setUint24 } from './misc';
import { Muxer } from './muxer';
import { SubtitleParser } from './subtitles';
import { toAlaw, toUlaw } from './pcm';
import {
	CustomVideoEncoder,
	CustomAudioEncoder,
	customVideoEncoders,
	customAudioEncoders,
} from './custom-coder';
import { EncodedPacket } from './packet';

/** @public */
export abstract class MediaSource {
	/** @internal */
	_connectedTrack: OutputTrack | null = null;
	/** @internal */
	_closingPromise: Promise<void> | null = null;
	/** @internal */
	_closed = false;
	/** @internal */
	_offsetTimestamps = false;

	/** @internal */
	_ensureValidAdd() {
		if (!this._connectedTrack) {
			throw new Error('Source is not connected to an output track.');
		}

		if (this._connectedTrack.output._canceled) {
			throw new Error('Output has been canceled.');
		}

		if (!this._connectedTrack.output._started) {
			throw new Error('Output has not started.');
		}

		if (this._connectedTrack.output._finalizing) {
			throw new Error('Output is finalizing.');
		}

		if (this._closed) {
			throw new Error('Source is closed.');
		}
	}

	/** @internal */
	_start() {}
	/** @internal */
	async _flush() {}

	close() {
		if (this._closingPromise) {
			throw new Error('Source already closed.');
		}

		const connectedTrack = this._connectedTrack;

		if (!connectedTrack) {
			throw new Error('Cannot call close without connecting the source to an output track.');
		}

		if (!connectedTrack.output._started) {
			throw new Error('Cannot call close before output has been started.');
		}

		return this._closingPromise = (async () => {
			await this._flush();

			this._closed = true;

			if (connectedTrack.output._finalizing) {
				return;
			}

			connectedTrack.output._muxer.onTrackClose(connectedTrack);
		})();
	}

	/** @internal */
	async _flushOrWaitForClose() {
		if (this._closingPromise) {
			// Since closing also flushes, we don't want to do it twice
			return this._closingPromise;
		} else {
			return this._flush();
		}
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
export class EncodedVideoPacketSource extends VideoSource {
	constructor(codec: VideoCodec) {
		super(codec);
	}

	add(packet: EncodedPacket, meta?: EncodedVideoChunkMetadata) {
		if (!(packet instanceof EncodedPacket)) {
			throw new TypeError('packet must be an EncodedPacket.');
		}
		if (packet.isMetadataOnly) {
			throw new TypeError('Metadata-only packets cannot be added.');
		}

		this._ensureValidAdd();
		return this._connectedTrack!.output._muxer.addEncodedVideoPacket(this._connectedTrack!, packet, meta);
	}
}

/** @public */
export type VideoEncodingConfig = {
	codec: VideoCodec;
	bitrate: number | Quality;
	latencyMode?: VideoEncoderConfig['latencyMode'];
	keyFrameInterval?: number;
	onEncodedPacket?: (packet: EncodedPacket, meta: EncodedVideoChunkMetadata | undefined) => unknown;
	onEncodingError?: (error: Error) => unknown;
};

const validateVideoEncodingConfig = (config: VideoEncodingConfig) => {
	if (!config || typeof config !== 'object') {
		throw new TypeError('Encoding config must be an object.');
	}
	if (!VIDEO_CODECS.includes(config.codec)) {
		throw new TypeError(`Invalid video codec '${config.codec}'. Must be one of: ${VIDEO_CODECS.join(', ')}.`);
	}
	if (!(config.bitrate instanceof Quality) && (!Number.isInteger(config.bitrate) || config.bitrate <= 0)) {
		throw new TypeError('config.bitrate must be a positive integer or a quality.');
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
	if (config.onEncodedPacket !== undefined && typeof config.onEncodedPacket !== 'function') {
		throw new TypeError('config.onEncodedChunk, when provided, must be a function.');
	}
	if (config.onEncodingError !== undefined && typeof config.onEncodingError !== 'function') {
		throw new TypeError('config.onEncodingError, when provided, must be a function.');
	}
};

class VideoEncoderWrapper {
	private ensureEncoderPromise: Promise<void> | null = null;
	private encoderInitialized = false;
	private encoder: VideoEncoder | null = null;
	private muxer: Muxer | null = null;
	private lastMultipleOfKeyFrameInterval = -1;
	private lastWidth: number | null = null;
	private lastHeight: number | null = null;

	private customEncoder: CustomVideoEncoder | null = null;
	private lastCustomEncoderPromise = Promise.resolve();
	private customEncoderQueueSize = 0;

	constructor(private source: VideoSource, private encodingConfig: VideoEncodingConfig) {}

	async add(videoFrame: VideoFrame, shouldClose: boolean, encodeOptions?: VideoEncoderEncodeOptions) {
		this.source._ensureValidAdd();

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

		if (!this.encoderInitialized) {
			if (this.ensureEncoderPromise) {
				await this.ensureEncoderPromise;
			} else {
				await this.ensureEncoder(videoFrame);
			}
		}
		assert(this.encoderInitialized);

		const keyFrameInterval = this.encodingConfig.keyFrameInterval ?? 5;
		const multipleOfKeyFrameInterval = Math.floor((videoFrame.timestamp / 1e6) / keyFrameInterval);

		// Ensure a key frame every KEY_FRAME_INTERVAL seconds. It is important that all video tracks follow the same
		// "key frame" rhythm, because aligned key frames are required to start new fragments in ISOBMFF or clusters
		// in Matroska.
		const finalEncodeOptions = {
			...encodeOptions,
			keyFrame: encodeOptions?.keyFrame
				|| keyFrameInterval === 0
				|| multipleOfKeyFrameInterval !== this.lastMultipleOfKeyFrameInterval,
		};
		this.lastMultipleOfKeyFrameInterval = multipleOfKeyFrameInterval;

		if (this.customEncoder) {
			this.customEncoderQueueSize++;
			this.lastCustomEncoderPromise = this.lastCustomEncoderPromise.then(() => {
				return this.customEncoder!.encode(videoFrame, finalEncodeOptions);
			});

			void this.lastCustomEncoderPromise.then(() => {
				this.customEncoderQueueSize--;

				if (shouldClose) {
					videoFrame.close();
				}
			});

			if (this.customEncoderQueueSize >= 4) {
				await this.lastCustomEncoderPromise;
			}
		} else {
			assert(this.encoder);
			this.encoder.encode(videoFrame, finalEncodeOptions);

			if (shouldClose) {
				videoFrame.close();
			}

			// We need to do this after sending the frame to the encoder as the frame otherwise might be closed
			if (this.encoder.encodeQueueSize >= 4) {
				await new Promise(resolve => this.encoder!.addEventListener('dequeue', resolve, { once: true }));
			}
		}

		await this.muxer!.mutex.currentPromise; // Allow the writer to apply backpressure
	}

	private async ensureEncoder(videoFrame: VideoFrame) {
		if (this.encoder) {
			return;
		}

		const { promise, resolve } = promiseWithResolvers();
		this.ensureEncoderPromise = promise;

		const width = videoFrame.codedWidth;
		const height = videoFrame.codedHeight;
		const bitrate = this.encodingConfig.bitrate instanceof Quality
			? this.encodingConfig.bitrate._toVideoBitrate(this.encodingConfig.codec, width, height)
			: this.encodingConfig.bitrate;

		const encoderConfig: VideoEncoderConfig = {
			codec: buildVideoCodecString(
				this.encodingConfig.codec,
				width,
				height,
				bitrate,
			),
			width,
			height,
			bitrate,
			framerate: this.source._connectedTrack?.metadata.frameRate,
			latencyMode: this.encodingConfig.latencyMode,
			...getVideoEncoderConfigExtension(this.encodingConfig.codec),
		};

		const MatchingCustomEncoder = customVideoEncoders.find(x => x.supports(
			this.encodingConfig.codec,
			encoderConfig,
		));

		if (MatchingCustomEncoder) {
			// @ts-expect-error "Can't create instance of abstract class 🤓"
			this.customEncoder = new MatchingCustomEncoder() as CustomVideoEncoder;
			this.customEncoder.codec = this.encodingConfig.codec;
			this.customEncoder.config = encoderConfig;
			this.customEncoder.onPacket = (packet, meta) => {
				this.encodingConfig.onEncodedPacket?.(packet, meta);
				void this.muxer!.addEncodedVideoPacket(this.source._connectedTrack!, packet, meta);
			};

			this.customEncoder.init();
		} else {
			if (typeof VideoEncoder === 'undefined') {
				throw new Error('VideoEncoder is not supported by this browser.');
			}

			const support = await VideoEncoder.isConfigSupported(encoderConfig);
			if (!support.supported) {
				throw new Error(
					'This specific encoder configuration is not supported by this browser. Consider using another codec'
					+ ' or changing your video parameters.',
				);
			}

			this.encoder = new VideoEncoder({
				output: (chunk, meta) => {
					const packet = EncodedPacket.fromEncodedChunk(chunk);

					this.encodingConfig.onEncodedPacket?.(packet, meta);
					void this.muxer!.addEncodedVideoPacket(this.source._connectedTrack!, packet, meta);
				},
				error: this.encodingConfig.onEncodingError ?? (error => console.error('VideoEncoder error:', error)),
			});
			this.encoder.configure(encoderConfig);
		}

		assert(this.source._connectedTrack);
		this.muxer = this.source._connectedTrack.output._muxer;

		this.encoderInitialized = true;

		resolve();
	}

	async flush() {
		if (this.customEncoder) {
			await this.lastCustomEncoderPromise.then(() => this.customEncoder!.flush());
		} else if (this.encoder) {
			await this.encoder.flush();
			this.encoder.close();
		}
	}

	getQueueSize() {
		if (this.customEncoder) {
			return this.customEncoderQueueSize;
		} else {
			assert(this.encoder);
			return this.encoder.encodeQueueSize;
		}
	}
}

/** @public */
export class VideoFrameSource extends VideoSource {
	/** @internal */
	private _encoder: VideoEncoderWrapper;

	constructor(encodingConfig: VideoEncodingConfig) {
		validateVideoEncodingConfig(encodingConfig);

		super(encodingConfig.codec);
		this._encoder = new VideoEncoderWrapper(this, encodingConfig);
	}

	add(videoFrame: VideoFrame, encodeOptions?: VideoEncoderEncodeOptions) {
		if (!(videoFrame instanceof VideoFrame)) {
			throw new TypeError('videoFrame must be a VideoFrame.');
		}

		return this._encoder.add(videoFrame, false, encodeOptions);
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
		validateVideoEncodingConfig(encodingConfig);

		super(encodingConfig.codec);
		this._encoder = new VideoEncoderWrapper(this, encodingConfig);
		this._canvas = canvas;
	}

	add(timestamp: number, duration = 0, encodeOptions?: VideoEncoderEncodeOptions) {
		if (!Number.isFinite(timestamp) || timestamp < 0) {
			throw new TypeError('timestamp must be a non-negative number.');
		}
		if (!Number.isFinite(duration) || duration < 0) {
			throw new TypeError('duration must be a non-negative number.');
		}

		const frame = new VideoFrame(this._canvas, {
			timestamp: Math.round(1e6 * timestamp),
			duration: Math.round(1e6 * duration) || undefined, // Drag 0 duration to undefined, glitches some codecs
			alpha: 'discard',
		});

		return this._encoder.add(frame, true, encodeOptions);
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
		validateVideoEncodingConfig(encodingConfig);

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
				if (this._encoder.getQueueSize() >= 4) {
					// Drop frames if the encoder is overloaded
					videoFrame.close();
					return;
				}

				void this._encoder.add(videoFrame, true);
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
export class EncodedAudioPacketSource extends AudioSource {
	constructor(codec: AudioCodec) {
		super(codec);
	}

	add(packet: EncodedPacket, meta?: EncodedAudioChunkMetadata) {
		if (!(packet instanceof EncodedPacket)) {
			throw new TypeError('packet must be an EncodedPacket.');
		}
		if (packet.isMetadataOnly) {
			throw new TypeError('Metadata-only packets cannot be added.');
		}

		this._ensureValidAdd();
		return this._connectedTrack!.output._muxer.addEncodedAudioPacket(this._connectedTrack!, packet, meta);
	}
}
/** @public */
export type AudioEncodingConfig = {
	codec: AudioCodec;
	bitrate?: number | Quality;
	onEncodedPacket?: (packet: EncodedPacket, meta: EncodedAudioChunkMetadata | undefined) => unknown;
	onEncodingError?: (error: Error) => unknown;
};

const validateAudioEncodingConfig = (config: AudioEncodingConfig) => {
	if (!config || typeof config !== 'object') {
		throw new TypeError('Encoding config must be an object.');
	}
	if (!AUDIO_CODECS.includes(config.codec)) {
		throw new TypeError(`Invalid audio codec '${config.codec}'. Must be one of: ${AUDIO_CODECS.join(', ')}.`);
	}
	if (
		config.bitrate === undefined
		&& (!(PCM_AUDIO_CODECS as readonly string[]).includes(config.codec) || config.codec === 'flac')
	) {
		throw new TypeError('config.bitrate must be provided for compressed audio codecs.');
	}
	if (
		config.bitrate !== undefined
		&& !(config.bitrate instanceof Quality)
		&& (!Number.isInteger(config.bitrate) || config.bitrate <= 0)
	) {
		throw new TypeError('config.bitrate, when provided, must be a positive integer or a quality.');
	}
	if (config.onEncodingError !== undefined && typeof config.onEncodingError !== 'function') {
		throw new TypeError('config.onEncodingError, when provided, must be a function.');
	}
};

class AudioEncoderWrapper {
	private ensureEncoderPromise: Promise<void> | null = null;
	private encoderInitialized = false;
	private encoder: AudioEncoder | null = null;
	private muxer: Muxer | null = null;
	private lastNumberOfChannels: number | null = null;
	private lastSampleRate: number | null = null;

	private isPcmEncoder = false;
	private outputSampleSize: number | null = null;
	private writeOutputValue: ((view: DataView, byteOffset: number, value: number) => void) | null = null;

	private customEncoder: CustomAudioEncoder | null = null;
	private lastCustomEncoderPromise = Promise.resolve();
	private customEncoderQueueSize = 0;

	constructor(private source: AudioSource, private encodingConfig: AudioEncodingConfig) {}

	async add(audioData: AudioData, shouldClose: boolean) {
		this.source._ensureValidAdd();

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

		if (!this.encoderInitialized) {
			if (this.ensureEncoderPromise) {
				await this.ensureEncoderPromise;
			} else {
				await this.ensureEncoder(audioData);
			}
		}
		assert(this.encoderInitialized);

		if (this.customEncoder) {
			this.customEncoderQueueSize++;
			this.lastCustomEncoderPromise = this.lastCustomEncoderPromise.then(() => {
				return this.customEncoder!.encode(audioData);
			});

			void this.lastCustomEncoderPromise.then(() => {
				this.customEncoderQueueSize--;

				if (shouldClose) {
					audioData.close();
				}
			});

			if (this.customEncoderQueueSize >= 4) {
				await this.lastCustomEncoderPromise;
			}

			await this.muxer!.mutex.currentPromise; // Allow the writer to apply backpressure
		} else if (this.isPcmEncoder) {
			await this.doPcmEncoding(audioData, shouldClose);
		} else {
			assert(this.encoder);
			this.encoder.encode(audioData);

			if (shouldClose) {
				audioData.close();
			}

			if (this.encoder.encodeQueueSize >= 4) {
				await new Promise(resolve => this.encoder!.addEventListener('dequeue', resolve, { once: true }));
			}

			await this.muxer!.mutex.currentPromise; // Allow the writer to apply backpressure
		}
	}

	private async doPcmEncoding(audioData: AudioData, shouldClose: boolean) {
		assert(this.outputSampleSize);
		assert(this.writeOutputValue);

		// Need to extract data from the audio data before we close it
		const { numberOfChannels, numberOfFrames, sampleRate, timestamp } = audioData;

		const CHUNK_SIZE = 2048;
		const outputs: {
			frameCount: number;
			view: DataView;
		}[] = [];

		// Prepare all of the output buffers, each being bounded by CHUNK_SIZE so we don't generate huge packets
		for (let frame = 0; frame < numberOfFrames; frame += CHUNK_SIZE) {
			const frameCount = Math.min(CHUNK_SIZE, audioData.numberOfFrames - frame);
			const outputSize = frameCount * numberOfChannels * this.outputSampleSize;
			const outputBuffer = new ArrayBuffer(outputSize);
			const outputView = new DataView(outputBuffer);

			outputs.push({ frameCount, view: outputView });
		}

		// All user agents are required to support conversion to f32-planar
		const allocationSize = audioData.allocationSize(({ planeIndex: 0, format: 'f32-planar' }));
		const floats = new Float32Array(allocationSize / Float32Array.BYTES_PER_ELEMENT);

		for (let i = 0; i < numberOfChannels; i++) {
			audioData.copyTo(floats, { planeIndex: i, format: 'f32-planar' });

			for (let j = 0; j < outputs.length; j++) {
				const { frameCount, view } = outputs[j]!;

				for (let k = 0; k < frameCount; k++) {
					this.writeOutputValue(
						view,
						(k * numberOfChannels + i) * this.outputSampleSize,
						floats[j * CHUNK_SIZE + k]!,
					);
				}
			}
		}

		if (shouldClose) {
			audioData.close();
		}

		const meta: EncodedAudioChunkMetadata = {
			decoderConfig: {
				codec: this.encodingConfig.codec,
				numberOfChannels,
				sampleRate,
			},
		};

		for (let i = 0; i < outputs.length; i++) {
			const { frameCount, view } = outputs[i]!;
			const outputBuffer = view.buffer;
			const startFrame = i * CHUNK_SIZE;

			const packet = new EncodedPacket(
				new Uint8Array(outputBuffer),
				'key',
				timestamp / 1e6 + startFrame / sampleRate,
				frameCount / sampleRate,
			);

			this.encodingConfig.onEncodedPacket?.(packet, meta);
			await this.muxer!.addEncodedAudioPacket(this.source._connectedTrack!, packet, meta); // With backpressure
		}
	}

	private async ensureEncoder(audioData: AudioData) {
		if (this.encoderInitialized) {
			return;
		}

		const { promise, resolve } = promiseWithResolvers();
		this.ensureEncoderPromise = promise;

		const { numberOfChannels, sampleRate } = audioData;
		const bitrate = this.encodingConfig.bitrate instanceof Quality
			? this.encodingConfig.bitrate._toAudioBitrate(this.encodingConfig.codec)
			: this.encodingConfig.bitrate;

		const encoderConfig: AudioEncoderConfig = {
			codec: buildAudioCodecString(
				this.encodingConfig.codec,
				numberOfChannels,
				sampleRate,
			),
			numberOfChannels,
			sampleRate,
			bitrate,
			...getAudioEncoderConfigExtension(this.encodingConfig.codec),
		};

		const MatchingCustomEncoder = customAudioEncoders.find(x => x.supports(
			this.encodingConfig.codec,
			encoderConfig,
		));

		if (MatchingCustomEncoder) {
			// @ts-expect-error "Can't create instance of abstract class 🤓"
			this.customEncoder = new MatchingCustomEncoder() as CustomAudioEncoder;
			this.customEncoder.codec = this.encodingConfig.codec;
			this.customEncoder.config = encoderConfig;
			this.customEncoder.onPacket = (packet, meta) => {
				this.encodingConfig.onEncodedPacket?.(packet, meta);
				void this.muxer!.addEncodedAudioPacket(this.source._connectedTrack!, packet, meta);
			};

			this.customEncoder.init();
		} else if ((PCM_AUDIO_CODECS as readonly string[]).includes(this.encodingConfig.codec)) {
			this.initPcmEncoder();
		} else {
			if (typeof AudioEncoder === 'undefined') {
				throw new Error('AudioEncoder is not supported by this browser.');
			}

			const support = await AudioEncoder.isConfigSupported(encoderConfig);
			if (!support.supported) {
				throw new Error(
					'This specific encoder configuration not supported by this browser. Consider using another codec or'
					+ ' changing your audio parameters.',
				);
			}

			this.encoder = new AudioEncoder({
				output: (chunk, meta) => {
					const packet = EncodedPacket.fromEncodedChunk(chunk);

					this.encodingConfig.onEncodedPacket?.(packet, meta);
					void this.muxer!.addEncodedAudioPacket(this.source._connectedTrack!, packet, meta);
				},
				error: this.encodingConfig.onEncodingError ?? (error => console.error('AudioEncoder error:', error)),
			});
			this.encoder.configure(encoderConfig);
		}

		assert(this.source._connectedTrack);
		this.muxer = this.source._connectedTrack.output._muxer;

		this.encoderInitialized = true;
		resolve();
	}

	private initPcmEncoder() {
		this.isPcmEncoder = true;

		const codec = this.encodingConfig.codec as PcmAudioCodec;
		const { dataType, sampleSize, littleEndian } = parsePcmCodec(codec);

		this.outputSampleSize = sampleSize;

		// All these functions receive a float sample as input and map it into the desired format

		switch (sampleSize) {
			case 1: {
				if (dataType === 'unsigned') {
					this.writeOutputValue = (view, byteOffset, value) =>
						view.setUint8(byteOffset, clamp((value + 1) * 127.5, 0, 255));
				} else if (dataType === 'signed') {
					this.writeOutputValue = (view, byteOffset, value) => {
						view.setInt8(byteOffset, clamp(Math.round(value * 128), -128, 127));
					};
				} else if (dataType === 'ulaw') {
					this.writeOutputValue = (view, byteOffset, value) => {
						const int16 = clamp(Math.floor(value * 32767), -32768, 32767);
						view.setUint8(byteOffset, toUlaw(int16));
					};
				} else if (dataType === 'alaw') {
					this.writeOutputValue = (view, byteOffset, value) => {
						const int16 = clamp(Math.floor(value * 32767), -32768, 32767);
						view.setUint8(byteOffset, toAlaw(int16));
					};
				} else {
					assert(false);
				}
			}; break;
			case 2: {
				if (dataType === 'unsigned') {
					this.writeOutputValue = (view, byteOffset, value) =>
						view.setUint16(byteOffset, clamp((value + 1) * 32767.5, 0, 65535), littleEndian);
				} else if (dataType === 'signed') {
					this.writeOutputValue = (view, byteOffset, value) =>
						view.setInt16(byteOffset, clamp(Math.round(value * 32767), -32768, 32767), littleEndian);
				} else {
					assert(false);
				}
			}; break;
			case 3: {
				if (dataType === 'unsigned') {
					this.writeOutputValue = (view, byteOffset, value) =>
						setUint24(view, byteOffset, clamp((value + 1) * 8388607.5, 0, 16777215), littleEndian);
				} else if (dataType === 'signed') {
					this.writeOutputValue = (view, byteOffset, value) =>
						setInt24(
							view,
							byteOffset,
							clamp(Math.round(value * 8388607), -8388608, 8388607),
							littleEndian,
						);
				} else {
					assert(false);
				}
			}; break;
			case 4: {
				if (dataType === 'unsigned') {
					this.writeOutputValue = (view, byteOffset, value) =>
						view.setUint32(byteOffset, clamp((value + 1) * 2147483647.5, 0, 4294967295), littleEndian);
				} else if (dataType === 'signed') {
					this.writeOutputValue = (view, byteOffset, value) =>
						view.setInt32(
							byteOffset,
							clamp(Math.round(value * 2147483647), -2147483648, 2147483647),
							littleEndian,
						);
				} else if (dataType === 'float') {
					this.writeOutputValue = (view, byteOffset, value) =>
						view.setFloat32(byteOffset, value, littleEndian);
				} else {
					assert(false);
				}
			}
		}
	}

	async flush() {
		if (this.customEncoder) {
			await this.lastCustomEncoderPromise.then(() => this.customEncoder!.flush());
		} else if (this.encoder) {
			await this.encoder.flush();
			this.encoder.close();
		}
	}

	getQueueSize() {
		if (this.customEncoder) {
			return this.customEncoderQueueSize;
		} else if (this.isPcmEncoder) {
			return 0;
		} else {
			assert(this.encoder);
			return this.encoder.encodeQueueSize;
		}
	}
}

/** @public */
export class AudioDataSource extends AudioSource {
	/** @internal */
	private _encoder: AudioEncoderWrapper;

	constructor(encodingConfig: AudioEncodingConfig) {
		validateAudioEncodingConfig(encodingConfig);

		super(encodingConfig.codec);
		this._encoder = new AudioEncoderWrapper(this, encodingConfig);
	}

	add(audioData: AudioData) {
		if (!(audioData instanceof AudioData)) {
			throw new TypeError('audioData must be an AudioData.');
		}

		return this._encoder.add(audioData, false);
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
		validateAudioEncodingConfig(encodingConfig);

		super(encodingConfig.codec);
		this._encoder = new AudioEncoderWrapper(this, encodingConfig);
	}

	add(audioBuffer: AudioBuffer) {
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

			promises.push(this._encoder.add(audioData, true));

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
		validateAudioEncodingConfig(encodingConfig);

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
				if (this._encoder.getQueueSize() >= 4) {
					// Drop data if the encoder is overloaded
					audioData.close();
					return;
				}

				void this._encoder.add(audioData, true);
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

	add(text: string) {
		if (typeof text !== 'string') {
			throw new TypeError('text must be a string.');
		}

		this._ensureValidAdd();
		this._parser.parse(text);

		return this._connectedTrack!.output._muxer.mutex.currentPromise;
	}
}
