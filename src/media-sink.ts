import { parsePcmCodec, PCM_AUDIO_CODECS, PcmAudioCodec, VideoCodec, AudioCodec } from './codec';
import { CustomVideoDecoder, customVideoDecoders, CustomAudioDecoder, customAudioDecoders } from './custom-coder';
import { InputAudioTrack, InputTrack, InputVideoTrack } from './input-track';
import {
	AnyIterable,
	assert,
	binarySearchLessOrEqual,
	getInt24,
	getUint24,
	last,
	mapAsyncGenerator,
	promiseWithResolvers,
	Rotation,
	toAsyncIterator,
	toDataView,
	validateAnyIterable,
} from './misc';
import { EncodedPacket } from './packet';
import { fromAlaw, fromUlaw } from './pcm';

/** @public */
export type PacketRetrievalOptions = {
	metadataOnly?: boolean;
};

const validatePacketRetrievalOptions = (options: PacketRetrievalOptions) => {
	if (!options || typeof options !== 'object') {
		throw new TypeError('options must be an object.');
	}
	if (options.metadataOnly !== undefined && typeof options.metadataOnly !== 'boolean') {
		throw new TypeError('options.metadataOnly, when defined, must be a boolean.');
	}
};

const validateTimestamp = (timestamp: number) => {
	if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
		throw new TypeError('timestamp must be a number.'); // It can be non-finite, that's fine
	}
};

/** @public */
export class EncodedPacketSink {
	/** @internal */
	_track: InputTrack;

	constructor(track: InputTrack) {
		if (!(track instanceof InputTrack)) {
			throw new TypeError('track must be an InputTrack.');
		}

		this._track = track;
	}

	getFirstPacket(options: PacketRetrievalOptions = {}) {
		validatePacketRetrievalOptions(options);
		return this._track._backing.getFirstPacket(options);
	}

	getPacket(timestamp: number, options: PacketRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validatePacketRetrievalOptions(options);
		return this._track._backing.getPacket(timestamp, options);
	}

	getNextPacket(packet: EncodedPacket, options: PacketRetrievalOptions = {}) {
		if (!(packet instanceof EncodedPacket)) {
			throw new TypeError('packet must be an EncodedPacket.');
		}
		validatePacketRetrievalOptions(options);
		return this._track._backing.getNextPacket(packet, options);
	}

	getKeyPacket(timestamp: number, options: PacketRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validatePacketRetrievalOptions(options);
		return this._track._backing.getKeyPacket(timestamp, options);
	}

	getNextKeyPacket(packet: EncodedPacket, options: PacketRetrievalOptions = {}) {
		if (!(packet instanceof EncodedPacket)) {
			throw new TypeError('packet must be an EncodedPacket.');
		}
		validatePacketRetrievalOptions(options);
		return this._track._backing.getNextKeyPacket(packet, options);
	}

	packets(
		startPacket?: EncodedPacket,
		endTimestamp = Infinity,
		options?: PacketRetrievalOptions,
	): AsyncGenerator<EncodedPacket, void, unknown> {
		const packetQueue: EncodedPacket[] = [];

		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let ended = false;
		let terminated = false;

		// This stores errors that are "out of band" in the sense that they didn't occur in the normal flow of this
		// method but instead in a different context. This error should not go unnoticed and must be bubbled up to
		// the consumer.
		let outOfBandError = null as Error | null;

		const timestamps: number[] = [];
		// The queue should always be big enough to hold 1 second worth of packets
		const maxQueueSize = () => Math.max(2, timestamps.length);

		// The following is the "pump" process that keeps pumping packets into the queue
		(async () => {
			let packet = startPacket ?? await this.getFirstPacket(options);

			while (packet && !terminated) {
				if (packet.timestamp >= endTimestamp) {
					break;
				}

				if (packetQueue.length > maxQueueSize()) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
					continue;
				}

				packetQueue.push(packet);

				onQueueNotEmpty();
				({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());

				packet = await this.getNextPacket(packet, options);
			}

			ended = true;
			onQueueNotEmpty();
		})().catch((error: Error) => {
			if (!outOfBandError) {
				outOfBandError = error;
				onQueueNotEmpty();
			}
		});

		return {
			async next() {
				while (true) {
					if (terminated) {
						return { value: undefined, done: true };
					} else if (outOfBandError) {
						throw outOfBandError;
					} else if (packetQueue.length > 0) {
						const value = packetQueue.shift()!;
						const now = performance.now();
						timestamps.push(now);

						while (timestamps.length > 0 && now - timestamps[0]! >= 1000) {
							timestamps.shift();
						}

						onQueueDequeue();

						return { value, done: false };
					} else if (ended) {
						return { value: undefined, done: true };
					} else {
						await queueNotEmpty;
					}
				}
			},
			async return() {
				terminated = true;
				onQueueDequeue();
				onQueueNotEmpty();

				return { value: undefined, done: true };
			},
			async throw(error) {
				throw error;
			},
			[Symbol.asyncIterator]() {
				return this;
			},
		};
	}
}

export type WrappedMediaFrame<T extends VideoFrame | AudioData> = {
	frame: T;
	timestamp: number;
	duration: number;
};

abstract class DecoderWrapper<
	MediaFrame extends VideoFrame | AudioData,
	WrappedFrame extends WrappedMediaFrame<MediaFrame> = WrappedMediaFrame<MediaFrame>,
> {
	constructor(
		public onFrame: (frame: WrappedFrame) => unknown,
		public onError: (error: DOMException) => unknown,
	) {}

	abstract getDecodeQueueSize(): number;
	abstract decode(packet: EncodedPacket): void;
	abstract flush(): Promise<void>;
	abstract close(): void;
}

/** @public */
export abstract class BaseMediaFrameSink<
	MediaFrame extends VideoFrame | AudioData,
	/** @internal */
	WrappedFrame extends WrappedMediaFrame<MediaFrame> = WrappedMediaFrame<MediaFrame>,
> {
	/** @internal */
	abstract _createDecoder(
		onFrame: (frame: WrappedFrame) => unknown,
		onError: (error: DOMException) => unknown
	): Promise<DecoderWrapper<MediaFrame>>;
	/** @internal */
	abstract _createPacketSink(): EncodedPacketSink;

	/** @internal */
	private _duplicateFrame(frame: WrappedFrame) {
		return structuredClone(frame);
	}

	/** @internal */
	protected mediaFramesInRange(
		startTimestamp = 0,
		endTimestamp = Infinity,
	): AsyncGenerator<WrappedFrame, void, unknown> {
		validateTimestamp(startTimestamp);
		validateTimestamp(endTimestamp);

		const MAX_QUEUE_SIZE = 8;
		const frameQueue: WrappedFrame[] = [];
		let firstFrameQueued = false;
		let lastFrame: WrappedFrame | null = null;
		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let decoderIsFlushed = false;
		let ended = false;
		let terminated = false;

		// This stores errors that are "out of band" in the sense that they didn't occur in the normal flow of this
		// method but instead in a different context. This error should not go unnoticed and must be bubbled up to
		// the consumer.
		let outOfBandError = null as Error | null;

		// The following is the "pump" process that keeps pumping packets into the decoder
		(async () => {
			const decoderError = new Error();
			const decoder = await this._createDecoder((wrappedFrame) => {
				onQueueDequeue();
				if (wrappedFrame.timestamp >= endTimestamp) {
					ended = true;
				}

				if (ended) {
					wrappedFrame.frame.close();
					return;
				}

				if (lastFrame) {
					if (wrappedFrame.timestamp > startTimestamp) {
						// We don't know ahead of time what the first first is. This is because the first first is the
						// last first whose timestamp is less than or equal to the start timestamp. Therefore we need to
						// wait for the first first after the start timestamp, and then we'll know that the previous
						// first was the first first.
						frameQueue.push(lastFrame);
						firstFrameQueued = true;
					} else {
						lastFrame.frame.close();
					}
				}

				if (wrappedFrame.timestamp >= startTimestamp) {
					frameQueue.push(wrappedFrame);
					firstFrameQueued = true;
				}

				lastFrame = firstFrameQueued ? null : wrappedFrame;

				if (frameQueue.length > 0) {
					onQueueNotEmpty();
					({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
				}
			}, (error) => {
				if (!outOfBandError) {
					error.stack = decoderError.stack; // Provide a more useful stack trace
					outOfBandError = error;
					onQueueNotEmpty();
				}
			});

			const packetSink = this._createPacketSink();
			const keyPacket = await packetSink.getKeyPacket(startTimestamp) ?? await packetSink.getFirstPacket();
			if (!keyPacket) {
				return;
			}

			let currentPacket: EncodedPacket | null = keyPacket;

			let packetsEndTimestamp = Infinity;
			if (endTimestamp < Infinity) {
				// When an end timestamp is set, we cannot simply use that for the packet iterator due to out-of-order
				// frames (B-frames). Instead, we'll need to keep decoding packets until we get a frame that exceeds
				// this end time. However, we can still put a bound on it: Since key frames are by definition never
				// out of order, we can stop at the first key frame after the end timestamp.
				const endPacket = await packetSink.getPacket(endTimestamp);
				const endKeyPacket = !endPacket
					? null
					: endPacket.type === 'key' && endPacket.timestamp === endTimestamp
						? endPacket
						: await packetSink.getNextKeyPacket(endPacket);

				if (endKeyPacket) {
					packetsEndTimestamp = endKeyPacket.timestamp;
				}
			}

			const packets = packetSink.packets(keyPacket, packetsEndTimestamp);
			await packets.next(); // Skip the start packet as we already have it

			while (currentPacket && !ended) {
				if (frameQueue.length + decoder.getDecodeQueueSize() > MAX_QUEUE_SIZE) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
					continue;
				}

				decoder.decode(currentPacket);

				const packetResult = await packets.next();
				if (packetResult.done) {
					break;
				}

				currentPacket = packetResult.value;
			}

			await packets.return();

			if (!terminated) await decoder.flush();
			decoder.close();

			if (!firstFrameQueued && lastFrame) {
				frameQueue.push(lastFrame);
			}

			decoderIsFlushed = true;
			onQueueNotEmpty(); // To unstuck the generator
		})().catch((error: Error) => {
			if (!outOfBandError) {
				outOfBandError = error;
				onQueueNotEmpty();
			}
		});

		return {
			async next() {
				while (true) {
					if (terminated) {
						return { value: undefined, done: true };
					} else if (outOfBandError) {
						throw outOfBandError;
					} else if (frameQueue.length > 0) {
						const value = frameQueue.shift()!;
						onQueueDequeue();
						return { value, done: false };
					} else if (!decoderIsFlushed) {
						await queueNotEmpty;
					} else {
						return { value: undefined, done: true };
					}
				}
			},
			async return() {
				terminated = true;
				ended = true;
				onQueueDequeue();
				onQueueNotEmpty();

				lastFrame?.frame.close();

				for (const frame of frameQueue) {
					frame.frame.close();
				}

				return { value: undefined, done: true };
			},
			async throw(error) {
				throw error;
			},
			[Symbol.asyncIterator]() {
				return this;
			},
		};
	}

	/** @internal */
	protected mediaFramesAtTimestamps(
		timestamps: AnyIterable<number>,
	): AsyncGenerator<WrappedFrame | null, void, unknown> {
		validateAnyIterable(timestamps);
		const timestampIterator = toAsyncIterator(timestamps);
		const timestampsOfInterest: number[] = [];

		const MAX_QUEUE_SIZE = 8;
		const frameQueue: (WrappedFrame | null)[] = [];
		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let decoderIsFlushed = false;
		let terminated = false;

		// This stores errors that are "out of band" in the sense that they didn't occur in the normal flow of this
		// method but instead in a different context. This error should not go unnoticed and must be bubbled up to
		// the consumer.
		let outOfBandError = null as Error | null;

		let lastUsedFrame = null as WrappedFrame | null;
		const pushToQueue = (frame: WrappedFrame | null) => {
			frameQueue.push(frame);
			onQueueNotEmpty();
			({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
		};

		// The following is the "pump" process that keeps pumping packets into the decoder
		(async () => {
			const decoderError = new Error();
			const decoder = await this._createDecoder((wrappedFrame) => {
				onQueueDequeue();

				if (terminated) {
					wrappedFrame.frame.close();
					return;
				}

				let frameUsed = false;
				while (
					timestampsOfInterest.length > 0
					&& wrappedFrame.timestamp - timestampsOfInterest[0]! > -1e-10 // Give it a little epsilon
				) {
					pushToQueue(this._duplicateFrame(wrappedFrame));
					timestampsOfInterest.shift();
					frameUsed = true;
				}

				if (frameUsed) {
					lastUsedFrame?.frame.close();
					lastUsedFrame = wrappedFrame;
				} else {
					wrappedFrame.frame.close();
				}
			}, (error) => {
				if (!outOfBandError) {
					error.stack = decoderError.stack; // Provide a more useful stack trace
					outOfBandError = error;
					onQueueNotEmpty();
				}
			});

			const packetSink = this._createPacketSink();
			let lastKeyPacket: EncodedPacket | null = null;
			let lastPacket: EncodedPacket | null = null;

			for await (const timestamp of timestampIterator) {
				validateTimestamp(timestamp);

				while (frameQueue.length + decoder.getDecodeQueueSize() > MAX_QUEUE_SIZE && !terminated) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
				}

				if (terminated) {
					break;
				}

				const targetPacket = await packetSink.getPacket(timestamp);
				if (!targetPacket) {
					pushToQueue(null);
					continue;
				}

				const keyPacket = await packetSink.getKeyPacket(timestamp);
				if (!keyPacket) {
					pushToQueue(null);
					continue;
				}

				if (lastPacket && targetPacket.sequenceNumber < lastPacket.sequenceNumber) {
					// We're going back in time with this one, let's flush and reset to an clean state
					await decoder.flush();
					timestampsOfInterest.length = 0;
				}

				if (
					lastKeyPacket
					&& keyPacket.sequenceNumber === lastKeyPacket.sequenceNumber
					&& targetPacket.timestamp >= lastPacket!.timestamp
				) {
					assert(lastPacket);

					if (
						targetPacket.sequenceNumber === lastPacket.sequenceNumber
						&& timestampsOfInterest.length === 0
					) {
						// Special case: We have a repeat packet, but the frame for that packet has already been
						// decoded. Therefore, we need to push the frame here instead of in the decoder callback.
						if (lastUsedFrame) {
							pushToQueue(this._duplicateFrame(lastUsedFrame));
						}
					} else {
						timestampsOfInterest.push(targetPacket.timestamp);
					}
				} else {
					// The key packet has changed
					lastKeyPacket = keyPacket;
					lastPacket = keyPacket;
					decoder.decode(keyPacket);
					timestampsOfInterest.push(targetPacket.timestamp);
				}

				while (lastPacket.sequenceNumber < targetPacket.sequenceNumber) {
					const nextPacket = await packetSink.getNextPacket(lastPacket);
					assert(nextPacket);

					lastPacket = nextPacket;
					decoder.decode(nextPacket);
				}
			}

			if (!terminated) {
				await decoder.flush();
				lastUsedFrame?.frame.close();
			}
			decoder.close();

			decoderIsFlushed = true;
			onQueueNotEmpty(); // To unstuck the generator
		})().catch((error: Error) => {
			if (!outOfBandError) {
				outOfBandError = error;
				onQueueNotEmpty();
			}
		});

		return {
			async next() {
				while (true) {
					if (terminated) {
						return { value: undefined, done: true };
					} else if (outOfBandError) {
						throw outOfBandError;
					} else if (frameQueue.length > 0) {
						const value = frameQueue.shift();
						assert(value !== undefined);
						onQueueDequeue();
						return { value, done: false };
					} else if (!decoderIsFlushed) {
						await queueNotEmpty;
					} else {
						return { value: undefined, done: true };
					}
				}
			},
			async return() {
				terminated = true;
				onQueueDequeue();
				onQueueNotEmpty();

				for (const frame of frameQueue) {
					frame?.frame.close();
				}
				lastUsedFrame?.frame.close();

				return { value: undefined, done: true };
			},
			async throw(error) {
				throw error;
			},
			[Symbol.asyncIterator]() {
				return this;
			},
		};
	}
}

class VideoDecoderWrapper extends DecoderWrapper<VideoFrame> {
	decoder: VideoDecoder | null = null;

	customDecoder: CustomVideoDecoder | null = null;
	lastCustomDecoderPromise = Promise.resolve();
	customDecoderQueueSize = 0;

	frameQueue: VideoFrame[] = [];

	constructor(
		onFrame: (frame: WrappedMediaFrame<VideoFrame>) => unknown,
		onError: (error: DOMException) => unknown,
		codec: VideoCodec,
		decoderConfig: VideoDecoderConfig,
		public timeResolution: number,
	) {
		super(onFrame, onError);

		const frameHandler = (frame: VideoFrame) => {
			// For correct B-frame handling, we don't just hand over the frames directly but instead add them to a
			// queue, because we want to ensure frames are emitted in presentation order. We flush the queue each time
			// we receive a frame with a timestamp larger than the highest we've seen so far, as we can sure that is
			// not a B-frame. Typically, WebCodecs automatically guarantees that frames are emitted in presentation
			// order, but some browsers (Safari) don't always follow this rule.
			if (this.frameQueue.length > 0 && (frame.timestamp >= last(this.frameQueue)!.timestamp)) {
				for (const frame of this.frameQueue) {
					this.wrapAndEmitFrame(frame);
				}

				this.frameQueue.length = 0;
			}

			const insertionIndex = binarySearchLessOrEqual(
				this.frameQueue,
				frame.timestamp,
				x => x.timestamp,
			);
			this.frameQueue.splice(insertionIndex + 1, 0, frame);
		};

		const MatchingCustomDecoder = customVideoDecoders.find(x => x.supports(codec, decoderConfig));
		if (MatchingCustomDecoder) {
			// @ts-expect-error "Can't create instance of abstract class 🤓"
			this.customDecoder = new MatchingCustomDecoder() as CustomVideoDecoder;
			this.customDecoder.codec = codec;
			this.customDecoder.config = decoderConfig;
			this.customDecoder.onFrame = frameHandler;

			this.customDecoder.init();
		} else {
			this.decoder = new VideoDecoder({
				output: frameHandler,
				error: onError,
			});
			this.decoder.configure(decoderConfig);
		}
	}

	wrapAndEmitFrame(frame: VideoFrame) {
		// Round the microsecond timestamps to the time resolution
		const timestamp = Math.round(frame.timestamp / 1e6 * this.timeResolution) / this.timeResolution;
		const duration = Math.round((frame.duration ?? 0) / 1e6 * this.timeResolution) / this.timeResolution;

		this.onFrame({
			frame,
			timestamp,
			duration,
		});
	}

	getDecodeQueueSize() {
		if (this.customDecoder) {
			return this.customDecoderQueueSize;
		} else {
			assert(this.decoder);
			return this.decoder.decodeQueueSize;
		}
	}

	decode(packet: EncodedPacket) {
		if (this.customDecoder) {
			this.customDecoderQueueSize++;
			this.lastCustomDecoderPromise = this.lastCustomDecoderPromise.then(() => {
				return this.customDecoder!.decode(packet);
			});

			void this.lastCustomDecoderPromise.then(() => this.customDecoderQueueSize--);
		} else {
			assert(this.decoder);
			this.decoder.decode(packet.toEncodedVideoChunk());
		}
	}

	async flush() {
		if (this.customDecoder) {
			await this.lastCustomDecoderPromise.then(() => this.customDecoder!.flush());
		} else {
			assert(this.decoder);
			await this.decoder.flush();
		}

		for (const frame of this.frameQueue) {
			this.wrapAndEmitFrame(frame);
		}
		this.frameQueue.length = 0;
	}

	close() {
		if (this.customDecoder) {
			void this.lastCustomDecoderPromise.then(() => this.customDecoder!.close());
		} else {
			assert(this.decoder);
			this.decoder.close();
		}

		for (const frame of this.frameQueue) {
			frame.close();
		}
		this.frameQueue.length = 0;
	}
}

/** @public */
export type WrappedVideoFrame = {
	frame: VideoFrame;
	timestamp: number;
	duration: number;
};

/** @public */
export class VideoFrameSink extends BaseMediaFrameSink<VideoFrame> {
	/** @internal */
	_videoTrack: InputVideoTrack;

	constructor(videoTrack: InputVideoTrack) {
		if (!(videoTrack instanceof InputVideoTrack)) {
			throw new TypeError('videoTrack must be an InputVideoTrack.');
		}

		super();

		this._videoTrack = videoTrack;
	}

	/** @internal */
	async _createDecoder(
		onFrame: (frame: WrappedMediaFrame<VideoFrame>) => unknown,
		onError: (error: DOMException) => unknown,
	) {
		if (!(await this._videoTrack.canDecode())) {
			throw new Error(
				'This video track cannot be decoded by this browser. Make sure to check decodability before using'
				+ ' a track.',
			);
		}

		const codec = this._videoTrack.codec;
		const decoderConfig = await this._videoTrack.getDecoderConfig();
		const timeResolution = this._videoTrack.timeResolution;
		assert(codec && decoderConfig);

		return new VideoDecoderWrapper(onFrame, onError, codec, decoderConfig, timeResolution);
	}

	/** @internal */
	_createPacketSink() {
		return new EncodedPacketSink(this._videoTrack);
	}

	/** @internal */
	_wrappedFrameToWrappedVideoFrame(frame: WrappedMediaFrame<VideoFrame>): WrappedVideoFrame {
		return {
			frame: frame.frame,
			timestamp: frame.timestamp,
			duration: frame.duration,
		};
	}

	async getFrame(timestamp: number) {
		validateTimestamp(timestamp);

		for await (const frame of this.mediaFramesAtTimestamps([timestamp])) {
			return frame && this._wrappedFrameToWrappedVideoFrame(frame);
		}
		throw new Error('Internal error: Iterator returned nothing.');
	}

	frames(startTimestamp = 0, endTimestamp = Infinity) {
		return mapAsyncGenerator(
			this.mediaFramesInRange(startTimestamp, endTimestamp),
			frame => this._wrappedFrameToWrappedVideoFrame(frame),
		);
	}

	framesAtTimestamps(timestamps: AnyIterable<number>) {
		return mapAsyncGenerator(
			this.mediaFramesAtTimestamps(timestamps),
			frame => frame && this._wrappedFrameToWrappedVideoFrame(frame),
		);
	}
}

/** @public */
export type WrappedCanvas = {
	canvas: HTMLCanvasElement;
	timestamp: number;
	duration: number;
};

/** @public */
export type CanvasSinkOptions = {
	width?: number;
	height?: number;
	fit?: 'fill' | 'contain' | 'cover';
	rotation?: Rotation;
	poolSize?: number;
};

/** @public */
export class CanvasSink {
	/** @internal */
	_videoTrack: InputVideoTrack;
	/** @internal */
	_width: number;
	/** @internal */
	_height: number;
	/** @internal */
	_fit: 'fill' | 'contain' | 'cover';
	/** @internal */
	_rotation: Rotation;
	/** @internal */
	_videoFrameSink: VideoFrameSink;
	/** @internal */
	_canvasPool: (HTMLCanvasElement | null)[];
	/** @internal */
	_nextCanvasIndex = 0;

	constructor(videoTrack: InputVideoTrack, options: CanvasSinkOptions = {}) {
		if (!(videoTrack instanceof InputVideoTrack)) {
			throw new TypeError('videoTrack must be an InputVideoTrack.');
		}
		if (options && typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (options.width !== undefined && (!Number.isInteger(options.width) || options.width <= 0)) {
			throw new TypeError('options.width, when defined, must be a positive integer.');
		}
		if (options.height !== undefined && (!Number.isInteger(options.height) || options.height <= 0)) {
			throw new TypeError('options.height, when defined, must be a positive integer.');
		}
		if (options.fit !== undefined && !['fill', 'contain', 'cover'].includes(options.fit)) {
			throw new TypeError('options.fit, when provided, must be one of "fill", "contain", or "cover".');
		}
		if (
			options.width !== undefined
			&& options.height !== undefined
			&& options.fit === undefined
		) {
			throw new TypeError(
				'When both options.width and options.height are provided, options.fit must also be provided.',
			);
		}
		if (options.rotation !== undefined && ![0, 90, 180, 270].includes(options.rotation)) {
			throw new TypeError('options.rotation, when provided, must be 0, 90, 180 or 270.');
		}
		if (
			options.poolSize !== undefined
			&& (typeof options.poolSize !== 'number' || !Number.isInteger(options.poolSize) || options.poolSize < 0)
		) {
			throw new TypeError('poolSize must be a non-negative integer.');
		}

		const rotation = options.rotation ?? videoTrack.rotation;
		let [width, height] = rotation % 180 === 0
			? [videoTrack.codedWidth, videoTrack.codedHeight]
			: [videoTrack.codedHeight, videoTrack.codedWidth];
		const originalAspectRatio = width / height;

		// If width and height aren't defined together, deduce the missing value using the aspect ratio
		if (options.width !== undefined && options.height === undefined) {
			width = options.width;
			height = Math.round(width / originalAspectRatio);
		} else if (options.width === undefined && options.height !== undefined) {
			height = options.height;
			width = Math.round(height * originalAspectRatio);
		} else if (options.width !== undefined && options.height !== undefined) {
			width = options.width;
			height = options.height;
		}

		this._videoTrack = videoTrack;
		this._width = width;
		this._height = height;
		this._rotation = rotation;
		this._fit = options.fit ?? 'fill';
		this._videoFrameSink = new VideoFrameSink(videoTrack);
		this._canvasPool = Array.from({ length: options.poolSize ?? 0 }, () => null);
	}

	/** @internal */
	_videoFrameToWrappedCanvas(frame: WrappedVideoFrame): WrappedCanvas {
		let canvas = this._canvasPool[this._nextCanvasIndex];
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.width = this._width;
			canvas.height = this._height;

			if (this._canvasPool.length > 0) {
				this._canvasPool[this._nextCanvasIndex] = canvas;
			}
		}

		if (this._canvasPool.length > 0) {
			this._nextCanvasIndex = (this._nextCanvasIndex + 1) % this._canvasPool.length;
		}

		const context = canvas.getContext('2d', { alpha: false });
		assert(context);

		context.resetTransform();

		// These variables specify where the final frame will be drawn on the canvas
		let dx: number;
		let dy: number;
		let newWidth: number;
		let newHeight: number;

		if (this._fit === 'fill') {
			dx = 0;
			dy = 0;
			newWidth = this._width;
			newHeight = this._height;
		} else {
			const [frameWidth, frameHeight] = this._rotation % 180 === 0
				? [frame.frame.codedWidth, frame.frame.codedHeight]
				: [frame.frame.codedHeight, frame.frame.codedWidth];

			const scale = this._fit === 'contain'
				? Math.min(this._width / frameWidth, this._height / frameHeight)
				: Math.max(this._width / frameWidth, this._height / frameHeight);
			newWidth = frameWidth * scale;
			newHeight = frameHeight * scale;
			dx = (this._width - newWidth) / 2;
			dy = (this._height - newHeight) / 2;
		}

		const aspectRatioChange = this._rotation % 180 === 0 ? 1 : newWidth / newHeight;
		context.translate(this._width / 2, this._height / 2);
		context.rotate(this._rotation * Math.PI / 180);
		// This aspect ratio compensation is done so that we can draw the frame with the intended dimensions and
		// don't need to think about how those dimensions change after the rotation
		context.scale(1 / aspectRatioChange, aspectRatioChange);
		context.translate(-this._width / 2, -this._height / 2);

		context.drawImage(frame.frame, dx, dy, newWidth, newHeight);

		const result = {
			canvas,
			timestamp: frame.timestamp,
			duration: frame.duration,
		};

		frame.frame.close();
		return result;
	}

	async getCanvas(timestamp: number) {
		validateTimestamp(timestamp);

		const frame = await this._videoFrameSink.getFrame(timestamp);
		return frame && this._videoFrameToWrappedCanvas(frame);
	}

	canvases(startTimestamp = 0, endTimestamp = Infinity) {
		return mapAsyncGenerator(
			this._videoFrameSink.frames(startTimestamp, endTimestamp),
			frame => this._videoFrameToWrappedCanvas(frame),
		);
	}

	canvasesAtTimestamps(timestamps: AnyIterable<number>) {
		return mapAsyncGenerator(
			this._videoFrameSink.framesAtTimestamps(timestamps),
			frame => frame && this._videoFrameToWrappedCanvas(frame),
		);
	}
}

class AudioDecoderWrapper extends DecoderWrapper<AudioData> {
	decoder: AudioDecoder | null = null;

	customDecoder: CustomAudioDecoder | null = null;
	lastCustomDecoderPromise = Promise.resolve();
	customDecoderQueueSize = 0;

	constructor(
		onData: (data: WrappedMediaFrame<AudioData>) => unknown,
		onError: (error: DOMException) => unknown,
		codec: AudioCodec,
		decoderConfig: AudioDecoderConfig,
	) {
		super(onData, onError);

		const dataHandler = (data: AudioData) => {
			const sampleRate = decoderConfig.sampleRate;

			// Round the microsecond timestamps to the sample rate
			const timestamp = Math.round(data.timestamp / 1e6 * sampleRate) / sampleRate;
			const duration = Math.round(data.duration / 1e6 * sampleRate) / sampleRate;

			onData({
				frame: data,
				timestamp,
				duration,
			});
		};

		const MatchingCustomDecoder = customAudioDecoders.find(x => x.supports(codec, decoderConfig));
		if (MatchingCustomDecoder) {
			// @ts-expect-error "Can't create instance of abstract class 🤓"
			this.customDecoder = new MatchingCustomDecoder() as CustomAudioDecoder;
			this.customDecoder.codec = codec;
			this.customDecoder.config = decoderConfig;
			this.customDecoder.onData = dataHandler;

			this.customDecoder.init();
		} else {
			this.decoder = new AudioDecoder({
				output: dataHandler,
				error: onError,
			});
			this.decoder.configure(decoderConfig);
		}
	}

	getDecodeQueueSize() {
		if (this.customDecoder) {
			return this.customDecoderQueueSize;
		} else {
			assert(this.decoder);
			return this.decoder.decodeQueueSize;
		}
	}

	decode(packet: EncodedPacket) {
		if (this.customDecoder) {
			this.customDecoderQueueSize++;
			this.lastCustomDecoderPromise = this.lastCustomDecoderPromise.then(() => {
				return this.customDecoder!.decode(packet);
			});

			void this.lastCustomDecoderPromise.then(() => this.customDecoderQueueSize--);
		} else {
			assert(this.decoder);
			this.decoder.decode(packet.toEncodedAudioChunk());
		}
	}

	flush() {
		if (this.customDecoder) {
			return this.lastCustomDecoderPromise.then(() => this.customDecoder!.flush());
		} else {
			assert(this.decoder);
			return this.decoder.flush();
		}
	}

	close() {
		if (this.customDecoder) {
			void this.lastCustomDecoderPromise.then(() => this.customDecoder!.close());
		} else {
			assert(this.decoder);
			this.decoder.close();
		}
	}
}

// There are a lot of PCM variants not natively supported by the browser and by AudioData. Therefore we need a simple
// decoder that maps any input PCM format into a PCM format supported by the browser.
class PcmAudioDecoderWrapper extends DecoderWrapper<AudioData> {
	codec: PcmAudioCodec;

	inputSampleSize: 1 | 2 | 3 | 4;
	readInputValue: (view: DataView, byteOffset: number) => number;

	outputSampleSize: 1 | 2 | 4;
	outputFormat: 'u8' | 's16' | 's32' | 'f32';
	writeOutputValue: (view: DataView, byteOffset: number, value: number) => void;

	// Internal state to accumulate a precise current timestamp based on audio durations, not the (potentially
	// inaccurate) sample timestamps.
	currentTimestamp: number | null = null;

	constructor(
		onData: (data: WrappedMediaFrame<AudioData>) => unknown,
		onError: (error: DOMException) => unknown,
		public decoderConfig: AudioDecoderConfig,
	) {
		super(onData, onError);

		assert((PCM_AUDIO_CODECS as readonly string[]).includes(decoderConfig.codec));
		this.codec = decoderConfig.codec as PcmAudioCodec;

		const { dataType, sampleSize, littleEndian } = parsePcmCodec(this.codec);
		this.inputSampleSize = sampleSize;

		switch (sampleSize) {
			case 1: {
				if (dataType === 'unsigned') {
					this.readInputValue = (view, byteOffset) => view.getUint8(byteOffset) - 2 ** 7;
				} else if (dataType === 'signed') {
					this.readInputValue = (view, byteOffset) => view.getInt8(byteOffset);
				} else if (dataType === 'ulaw') {
					this.readInputValue = (view, byteOffset) => fromUlaw(view.getUint8(byteOffset));
				} else if (dataType === 'alaw') {
					this.readInputValue = (view, byteOffset) => fromAlaw(view.getUint8(byteOffset));
				} else {
					assert(false);
				}
			}; break;
			case 2: {
				if (dataType === 'unsigned') {
					this.readInputValue = (view, byteOffset) => view.getUint16(byteOffset, littleEndian) - 2 ** 15;
				} else if (dataType === 'signed') {
					this.readInputValue = (view, byteOffset) => view.getInt16(byteOffset, littleEndian);
				} else {
					assert(false);
				}
			}; break;
			case 3: {
				if (dataType === 'unsigned') {
					this.readInputValue = (view, byteOffset) => getUint24(view, byteOffset, littleEndian) - 2 ** 23;
				} else if (dataType === 'signed') {
					this.readInputValue = (view, byteOffset) => getInt24(view, byteOffset, littleEndian);
				} else {
					assert(false);
				}
			}; break;
			case 4: {
				if (dataType === 'unsigned') {
					this.readInputValue = (view, byteOffset) => view.getUint32(byteOffset, littleEndian) - 2 ** 31;
				} else if (dataType === 'signed') {
					this.readInputValue = (view, byteOffset) => view.getInt32(byteOffset, littleEndian);
				} else if (dataType === 'float') {
					this.readInputValue = (view, byteOffset) => view.getFloat32(byteOffset, littleEndian);
				} else {
					assert(false);
				}
			}; break;
		}

		switch (sampleSize) {
			case 1: {
				if (dataType === 'ulaw' || dataType === 'alaw') {
					this.outputSampleSize = 2;
					this.outputFormat = 's16';
					this.writeOutputValue = (view, byteOffset, value) => view.setInt16(byteOffset, value, true);
				} else {
					this.outputSampleSize = 1;
					this.outputFormat = 'u8';
					this.writeOutputValue = (view, byteOffset, value) => view.setUint8(byteOffset, value + 2 ** 7);
				}
			}; break;
			case 2: {
				this.outputSampleSize = 2;
				this.outputFormat = 's16';
				this.writeOutputValue = (view, byteOffset, value) => view.setInt16(byteOffset, value, true);
			}; break;
			case 3: {
				this.outputSampleSize = 4;
				this.outputFormat = 's32';
				// From https://www.w3.org/TR/webcodecs:
				// AudioData containing 24-bit samples SHOULD store those samples in s32 or f32. When samples are
				// stored in s32, each sample MUST be left-shifted by 8 bits.
				this.writeOutputValue = (view, byteOffset, value) => view.setInt32(byteOffset, value << 8, true);
			}; break;
			case 4: {
				this.outputSampleSize = 4;

				if (dataType === 'float') {
					this.outputFormat = 'f32';
					this.writeOutputValue = (view, byteOffset, value) => view.setFloat32(byteOffset, value, true);
				} else {
					this.outputFormat = 's32';
					this.writeOutputValue = (view, byteOffset, value) => view.setInt32(byteOffset, value, true);
				}
			}; break;
		};
	}

	getDecodeQueueSize() {
		return 0;
	}

	decode(packet: EncodedPacket) {
		const inputView = toDataView(packet.data);

		const numberOfFrames = packet.byteLength / this.decoderConfig.numberOfChannels / this.inputSampleSize;

		const outputBufferSize = numberOfFrames * this.decoderConfig.numberOfChannels * this.outputSampleSize;
		const outputBuffer = new ArrayBuffer(outputBufferSize);
		const outputView = new DataView(outputBuffer);

		for (let i = 0; i < numberOfFrames * this.decoderConfig.numberOfChannels; i++) {
			const inputIndex = i * this.inputSampleSize;
			const outputIndex = i * this.outputSampleSize;

			const value = this.readInputValue(inputView, inputIndex);
			this.writeOutputValue(outputView, outputIndex, value);
		}

		const preciseDuration = numberOfFrames / this.decoderConfig.sampleRate;
		if (this.currentTimestamp === null || Math.abs(packet.timestamp - this.currentTimestamp) >= preciseDuration) {
			// We need to sync with the packet timestamp again
			this.currentTimestamp = packet.timestamp;
		}

		const preciseTimestamp = this.currentTimestamp;
		this.currentTimestamp += preciseDuration;

		const audioData = new AudioData({
			format: this.outputFormat,
			data: outputBuffer,
			numberOfChannels: this.decoderConfig.numberOfChannels,
			sampleRate: this.decoderConfig.sampleRate,
			numberOfFrames,
			timestamp: 1e6 * preciseTimestamp,
		});

		// Since all other decoders are async, we'll make this one behave async as well
		queueMicrotask(() => this.onFrame({
			frame: audioData,
			timestamp: preciseTimestamp,
			duration: preciseDuration,
		}));
	}

	async flush() {
		// Do nothing
	}

	close() {
		// Do nothing
	}
}

/** @public */
export type WrappedAudioData = {
	data: AudioData;
	timestamp: number;
	duration: number;
};

/** @public */
export class AudioDataSink extends BaseMediaFrameSink<AudioData> {
	/** @internal */
	_audioTrack: InputAudioTrack;

	constructor(audioTrack: InputAudioTrack) {
		if (!(audioTrack instanceof InputAudioTrack)) {
			throw new TypeError('audioTrack must be an InputAudioTrack.');
		}

		super();

		this._audioTrack = audioTrack;
	}

	/** @internal */
	async _createDecoder(
		onData: (data: WrappedMediaFrame<AudioData>) => unknown,
		onError: (error: DOMException) => unknown,
	) {
		if (!(await this._audioTrack.canDecode())) {
			throw new Error(
				'This audio track cannot be decoded by this browser. Make sure to check decodability before using'
				+ ' a track.',
			);
		}

		const codec = this._audioTrack.codec;
		const decoderConfig = await this._audioTrack.getDecoderConfig();
		assert(codec && decoderConfig);

		if ((PCM_AUDIO_CODECS as readonly string[]).includes(decoderConfig.codec)) {
			return new PcmAudioDecoderWrapper(onData, onError, decoderConfig);
		} else {
			return new AudioDecoderWrapper(onData, onError, codec, decoderConfig);
		}
	}

	/** @internal */
	_wrappedFrameToWrappedAudioData(frame: WrappedMediaFrame<AudioData>): WrappedAudioData {
		return {
			data: frame.frame,
			timestamp: frame.timestamp,
			duration: frame.duration,
		};
	}

	/** @internal */
	_createPacketSink() {
		return new EncodedPacketSink(this._audioTrack);
	}

	async getData(timestamp: number) {
		validateTimestamp(timestamp);

		for await (const data of this.mediaFramesAtTimestamps([timestamp])) {
			return data && this._wrappedFrameToWrappedAudioData(data);
		}
		throw new Error('Internal error: Iterator returned nothing.');
	}

	data(startTimestamp = 0, endTimestamp = Infinity) {
		return mapAsyncGenerator(
			this.mediaFramesInRange(startTimestamp, endTimestamp),
			data => this._wrappedFrameToWrappedAudioData(data),
		);
	}

	dataAtTimestamps(timestamps: AnyIterable<number>) {
		return mapAsyncGenerator(
			this.mediaFramesAtTimestamps(timestamps),
			data => data && this._wrappedFrameToWrappedAudioData(data),
		);
	}
}

/** @public */
export type WrappedAudioBuffer = {
	buffer: AudioBuffer;
	timestamp: number;
	duration: number;
};

/** @public */
export class AudioBufferSink {
	/** @internal */
	_audioDataSink: AudioDataSink;

	constructor(audioTrack: InputAudioTrack) {
		if (!(audioTrack instanceof InputAudioTrack)) {
			throw new TypeError('audioTrack must be an InputAudioTrack.');
		}

		this._audioDataSink = new AudioDataSink(audioTrack);
	}

	/** @internal */
	_audioDataToWrappedArrayBuffer(data: WrappedAudioData): WrappedAudioBuffer {
		const audioBuffer = new AudioBuffer({
			numberOfChannels: data.data.numberOfChannels,
			length: data.data.numberOfFrames,
			sampleRate: data.data.sampleRate,
		});

		// All user agents are required to support conversion to f32-planar
		const dataBytes = new Float32Array(data.data.allocationSize({ planeIndex: 0, format: 'f32-planar' }) / 4);

		for (let i = 0; i < data.data.numberOfChannels; i++) {
			data.data.copyTo(dataBytes, { planeIndex: i, format: 'f32-planar' });
			audioBuffer.copyToChannel(dataBytes, i);
		}

		const result = {
			buffer: audioBuffer,
			timestamp: data.timestamp,
			duration: data.duration,
		};

		data.data.close();
		return result;
	}

	async getBuffer(timestamp: number) {
		validateTimestamp(timestamp);

		const data = await this._audioDataSink.getData(timestamp);
		return data && this._audioDataToWrappedArrayBuffer(data);
	}

	buffers(startTimestamp = 0, endTimestamp = Infinity) {
		return mapAsyncGenerator(
			this._audioDataSink.data(startTimestamp, endTimestamp),
			data => this._audioDataToWrappedArrayBuffer(data),
		);
	}

	buffersAtTimestamps(timestamps: AnyIterable<number>) {
		return mapAsyncGenerator(
			this._audioDataSink.dataAtTimestamps(timestamps),
			data => data && this._audioDataToWrappedArrayBuffer(data),
		);
	}
}
