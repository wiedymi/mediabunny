import { PCM_CODECS, PcmAudioCodec } from './codec';
import { InputAudioTrack, InputVideoTrack } from './input-track';
import {
	AnyIterable,
	assert,
	getInt24,
	getUint24,
	mapAsyncGenerator,
	promiseWithResolvers,
	toAsyncIterator,
	validateAnyIterable,
} from './misc';

/** @public */
export type ChunkRetrievalOptions = {
	metadataOnly?: boolean;
};

const validateChunkRetrievalOptions = (options: ChunkRetrievalOptions) => {
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
export abstract class BaseChunkDrain<Chunk extends EncodedVideoChunk | EncodedAudioChunk> {
	abstract getFirstChunk(options?: ChunkRetrievalOptions): Promise<Chunk | null>;
	abstract getChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
	abstract getNextChunk(chunk: Chunk, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
	abstract getKeyChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
	abstract getNextKeyChunk(chunk: Chunk, options?: ChunkRetrievalOptions): Promise<Chunk | null>;

	chunks(startChunk?: Chunk, endTimestamp = Infinity): AsyncGenerator<Chunk, void, unknown> {
		const chunkQueue: Chunk[] = [];

		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let ended = false;
		let terminated = false;

		// This stores errors that are "out of band" in the sense that they didn't occur in the normal flow of this
		// method but instead in a different context. This error should not go unnoticed and must be bubbled up to
		// the consumer.
		let outOfBandError = null as Error | null;

		const timestamps: number[] = [];
		// The queue should always be big enough to hold 1 second worth of chunks
		const maxQueueSize = () => Math.max(2, timestamps.length);

		// The following is the "pump" process that keeps pumping chunks into the queue
		(async () => {
			let chunk = startChunk ?? await this.getFirstChunk();

			while (chunk && !terminated) {
				if (chunk.timestamp / 1e6 >= endTimestamp) {
					break;
				}

				if (chunkQueue.length > maxQueueSize()) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
					continue;
				}

				chunkQueue.push(chunk);

				onQueueNotEmpty();
				({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());

				chunk = await this.getNextChunk(chunk);
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
					} else if (chunkQueue.length > 0) {
						const value = chunkQueue.shift()!;
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

abstract class DecoderWrapper<
	Chunk extends EncodedVideoChunk | EncodedAudioChunk,
	MediaFrame extends VideoFrame | AudioData,
> {
	constructor(
		public onMedia: (media: MediaFrame) => unknown,
		public onError: (error: DOMException) => unknown,
	) {}

	abstract getDecodeQueueSize(): number;
	abstract decode(chunk: Chunk): void;
	abstract flush(): Promise<void>;
	abstract close(): void;
}

/** @public */
export abstract class BaseMediaFrameDrain<
	Chunk extends EncodedVideoChunk | EncodedAudioChunk,
	MediaFrame extends VideoFrame | AudioData,
> {
	/** @internal */
	abstract _createDecoder(
		onMedia: (media: MediaFrame) => unknown,
		onError: (error: DOMException) => unknown
	): Promise<DecoderWrapper<Chunk, MediaFrame>>;
	/** @internal */
	abstract _createChunkDrain(): BaseChunkDrain<Chunk>;

	/** @internal */
	private _duplicateFrame(frame: MediaFrame) {
		return structuredClone(frame);
	}

	protected mediaFramesAtTimestamps(
		timestamps: AnyIterable<number>,
	): AsyncGenerator<MediaFrame | null, void, unknown> {
		validateAnyIterable(timestamps);
		const timestampIterator = toAsyncIterator(timestamps);
		const timestampsOfInterest: number[] = [];

		const MAX_QUEUE_SIZE = 8;
		const frameQueue: (MediaFrame | null)[] = [];
		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let decoderIsFlushed = false;
		let terminated = false;

		// This stores errors that are "out of band" in the sense that they didn't occur in the normal flow of this
		// method but instead in a different context. This error should not go unnoticed and must be bubbled up to
		// the consumer.
		let outOfBandError = null as Error | null;

		let lastUsedFrame = null as MediaFrame | null;
		const pushToQueue = (frame: MediaFrame | null) => {
			frameQueue.push(frame);
			onQueueNotEmpty();
			({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
		};

		// The following is the "pump" process that keeps pumping chunks into the decoder
		(async () => {
			const decoderError = new Error();
			const decoder = await this._createDecoder((frame) => {
				onQueueDequeue();

				if (terminated) {
					frame.close();
					return;
				}

				let frameUsed = false;
				while (timestampsOfInterest.length > 0 && timestampsOfInterest[0] === frame.timestamp) {
					pushToQueue(this._duplicateFrame(frame));
					timestampsOfInterest.shift();
					frameUsed = true;
				}

				if (frameUsed) {
					lastUsedFrame?.close();
					lastUsedFrame = frame;
				} else {
					frame.close();
				}
			}, (error) => {
				if (!outOfBandError) {
					error.stack = decoderError.stack; // Provide a more useful stack trace
					outOfBandError = error;
					onQueueNotEmpty();
				}
			});

			const chunkDrain = this._createChunkDrain();
			let lastKeyChunk: Chunk | null = null;
			let lastChunk: Chunk | null = null;

			for await (const timestamp of timestampIterator) {
				validateTimestamp(timestamp);

				while (frameQueue.length + decoder.getDecodeQueueSize() > MAX_QUEUE_SIZE && !terminated) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
				}

				if (terminated) {
					break;
				}

				const targetChunk = await chunkDrain.getChunk(timestamp);
				if (!targetChunk) {
					pushToQueue(null);
					continue;
				}

				const keyChunk = await chunkDrain.getKeyChunk(timestamp);
				if (!keyChunk) {
					pushToQueue(null);
					continue;
				}

				timestampsOfInterest.push(targetChunk.timestamp);

				if (
					lastKeyChunk
					&& keyChunk.timestamp === lastKeyChunk.timestamp
					&& targetChunk.timestamp >= lastChunk!.timestamp
				) {
					assert(lastChunk);

					if (targetChunk.timestamp === lastChunk.timestamp && timestampsOfInterest.length === 1) {
						// Special case: We have a repeat chunk, but the frame for that chunk has already been decoded.
						// Therefore, we need to push the frame here instead of in the decoder callback.
						if (lastUsedFrame) {
							pushToQueue(this._duplicateFrame(lastUsedFrame));
						}
						timestampsOfInterest.shift();
					}
				} else {
					lastKeyChunk = keyChunk;
					lastChunk = keyChunk;
					decoder.decode(keyChunk);
				}

				while (lastChunk.timestamp !== targetChunk.timestamp) {
					const nextChunk = await chunkDrain.getNextChunk(lastChunk);
					assert(nextChunk);

					lastChunk = nextChunk;
					decoder.decode(nextChunk);
				}
			}

			if (!terminated) await decoder.flush();
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
					frame?.close();
				}
				lastUsedFrame?.close();

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

	protected mediaFramesInRange(
		startTimestamp = 0,
		endTimestamp = Infinity,
	): AsyncGenerator<MediaFrame, void, unknown> {
		validateTimestamp(startTimestamp);
		validateTimestamp(endTimestamp);

		const MAX_QUEUE_SIZE = 8;
		const frameQueue: MediaFrame[] = [];
		let firstFrameQueued = false;
		let lastFrame: MediaFrame | null = null;
		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let decoderIsFlushed = false;
		let ended = false;
		let terminated = false;

		// This stores errors that are "out of band" in the sense that they didn't occur in the normal flow of this
		// method but instead in a different context. This error should not go unnoticed and must be bubbled up to
		// the consumer.
		let outOfBandError = null as Error | null;

		// The following is the "pump" process that keeps pumping chunks into the decoder
		(async () => {
			const decoderError = new Error();
			const decoder = await this._createDecoder((frame) => {
				onQueueDequeue();
				const frameTimestamp = frame.timestamp / 1e6;

				if (frameTimestamp >= endTimestamp) {
					ended = true;
				}

				if (ended) {
					frame.close();
					return;
				}

				if (lastFrame) {
					if (frameTimestamp > startTimestamp) {
						// We don't know ahead of time what the first first is. This is because the first first is the
						// last first whose timestamp is less than or equal to the start timestamp. Therefore we need to
						// wait for the first first after the start timestamp, and then we'll know that the previous
						// first was the first first.
						frameQueue.push(lastFrame);
						firstFrameQueued = true;
					} else {
						lastFrame.close();
					}
				}

				if (frameTimestamp >= startTimestamp) {
					frameQueue.push(frame);
					firstFrameQueued = true;
				}

				lastFrame = firstFrameQueued ? null : frame;

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

			const chunkDrain = this._createChunkDrain();
			const keyChunk = await chunkDrain.getKeyChunk(startTimestamp) ?? await chunkDrain.getFirstChunk();
			if (!keyChunk) {
				return;
			}

			let currentChunk: Chunk | null = keyChunk;

			let chunksEndTimestamp = Infinity;
			if (endTimestamp < Infinity) {
				// When an end timestamp is set, we cannot simply use that for the chunk iterator due to out-of-order
				// frames (B-frames). Instead, we'll need to keep decoding chunks until we get a frame that exceeds
				// this end time. However, we can still put a bound on it: Since key frames are by definition never
				// out of order, we can stop at the first key frame after the end timestamp.
				const endFrame = await chunkDrain.getChunk(endTimestamp);
				const endKeyFrame = !endFrame
					? null
					: endFrame.type === 'key' && endFrame.timestamp / 1e6 === endTimestamp
						? endFrame
						: await chunkDrain.getNextKeyChunk(endFrame);

				if (endKeyFrame) {
					chunksEndTimestamp = endKeyFrame.timestamp / 1e6;
				}
			}

			const chunks = chunkDrain.chunks(keyChunk, chunksEndTimestamp);
			await chunks.next(); // Skip the start chunk as we already have it

			while (currentChunk && !ended) {
				if (frameQueue.length + decoder.getDecodeQueueSize() > MAX_QUEUE_SIZE) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
					continue;
				}

				decoder.decode(currentChunk);

				const chunkResult = await chunks.next();
				if (chunkResult.done) {
					break;
				}

				currentChunk = chunkResult.value;
			}

			await chunks.return();

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

				for (const frame of frameQueue) {
					frame.close();
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
}

/** @public */
export class EncodedVideoChunkDrain extends BaseChunkDrain<EncodedVideoChunk> {
	/** @internal */
	_videoTrack: InputVideoTrack;

	constructor(videoTrack: InputVideoTrack) {
		if (!(videoTrack instanceof InputVideoTrack)) {
			throw new TypeError('videoTrack must be an InputVideoTrack.');
		}

		super();

		this._videoTrack = videoTrack;
	}

	getFirstChunk(options: ChunkRetrievalOptions = {}) {
		validateChunkRetrievalOptions(options);
		return this._videoTrack._backing.getFirstChunk(options);
	}

	getChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validateChunkRetrievalOptions(options);
		return this._videoTrack._backing.getChunk(timestamp, options);
	}

	getNextChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions = {}) {
		if (!(chunk instanceof EncodedVideoChunk)) {
			throw new TypeError('chunk must be an EncodedVideoChunk.');
		}
		validateChunkRetrievalOptions(options);
		return this._videoTrack._backing.getNextChunk(chunk, options);
	}

	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validateChunkRetrievalOptions(options);
		return this._videoTrack._backing.getKeyChunk(timestamp, options);
	}

	getNextKeyChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions = {}) {
		if (!(chunk instanceof EncodedVideoChunk)) {
			throw new TypeError('chunk must be an EncodedVideoChunk.');
		}
		validateChunkRetrievalOptions(options);
		return this._videoTrack._backing.getNextKeyChunk(chunk, options);
	}
}

class VideoDecoderWrapper extends DecoderWrapper<EncodedVideoChunk, VideoFrame> {
	decoder: VideoDecoder;

	constructor(
		onFrame: (frame: VideoFrame) => unknown,
		onError: (error: DOMException) => unknown,
		decoderConfig: VideoDecoderConfig,
	) {
		super(onFrame, onError);

		this.decoder = new VideoDecoder({ output: onFrame, error: onError });
		this.decoder.configure(decoderConfig);
	}

	getDecodeQueueSize() {
		return this.decoder.decodeQueueSize;
	}

	decode(chunk: EncodedVideoChunk) {
		this.decoder.decode(chunk);
	}

	flush() {
		return this.decoder.flush();
	}

	close() {
		this.decoder.close();
	}
}

/** @public */
export class VideoFrameDrain extends BaseMediaFrameDrain<EncodedVideoChunk, VideoFrame> {
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
	async _createDecoder(onFrame: (frame: VideoFrame) => unknown, onError: (error: DOMException) => unknown) {
		if (!(await this._videoTrack.canDecode())) {
			throw new Error(
				'This video track cannot be decoded by this browser. Make sure to check decodability before using'
				+ ' a track.',
			);
		}

		const decoderConfig = await this._videoTrack.getDecoderConfig();
		assert(decoderConfig);

		return new VideoDecoderWrapper(onFrame, onError, decoderConfig);
	}

	/** @internal */
	_createChunkDrain() {
		return new EncodedVideoChunkDrain(this._videoTrack);
	}

	async getFrame(timestamp: number) {
		validateTimestamp(timestamp);

		for await (const frame of this.mediaFramesAtTimestamps([timestamp])) {
			return frame;
		}
		throw new Error('Internal error: Iterator returned nothing.');
	}

	frames(startTimestamp = 0, endTimestamp = Infinity) {
		return this.mediaFramesInRange(startTimestamp, endTimestamp);
	}

	framesAtTimestamps(timestamps: AnyIterable<number>) {
		return this.mediaFramesAtTimestamps(timestamps);
	}
}

/** @public */
export type WrappedCanvas = {
	canvas: HTMLCanvasElement;
	timestamp: number;
	duration: number;
};

/** @public */
export class CanvasDrain {
	/** @internal */
	_videoTrack: InputVideoTrack;
	/** @internal */
	_dimensions?: { width: number; height: number };
	/** @internal */
	_videoFrameDrain: VideoFrameDrain;

	constructor(videoTrack: InputVideoTrack, dimensions?: { width: number; height: number }) {
		if (!(videoTrack instanceof InputVideoTrack)) {
			throw new TypeError('videoTrack must be an InputVideoTrack.');
		}
		if (dimensions && typeof dimensions !== 'object') {
			throw new TypeError('dimensions, when defined, must be an object.');
		}
		if (dimensions && (!Number.isInteger(dimensions.width) || dimensions.width <= 0)) {
			throw new TypeError('dimensions.width must be a positive integer.');
		}
		if (dimensions && (!Number.isInteger(dimensions.height) || dimensions.height <= 0)) {
			throw new TypeError('dimensions.height must be a positive integer.');
		}

		this._videoTrack = videoTrack;
		this._dimensions = dimensions;
		this._videoFrameDrain = new VideoFrameDrain(videoTrack);
	}

	/** @internal */
	async _videoFrameToWrappedCanvas(frame: VideoFrame): Promise<WrappedCanvas> {
		const width = this._dimensions?.width ?? await this._videoTrack.getDisplayWidth();
		const height = this._dimensions?.height ?? await this._videoTrack.getDisplayHeight();
		const rotation = await this._videoTrack.getRotation();

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext('2d', { alpha: false });
		assert(context);

		context.translate(width / 2, height / 2);
		context.rotate(rotation * Math.PI / 180);
		context.translate(-width / 2, -height / 2);

		const [imageWidth, imageHeight] = rotation % 180 === 0 ? [width, height] : [height, width];

		context.drawImage(frame, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);

		const result = {
			canvas,
			timestamp: frame.timestamp / 1e6,
			duration: (frame.duration ?? 0) / 1e6,
		};

		frame.close();
		return result;
	}

	async getCanvas(timestamp: number) {
		validateTimestamp(timestamp);

		const frame = await this._videoFrameDrain.getFrame(timestamp);
		return frame && this._videoFrameToWrappedCanvas(frame);
	}

	canvases(startTimestamp = 0, endTimestamp = Infinity) {
		return mapAsyncGenerator(
			this._videoFrameDrain.frames(startTimestamp, endTimestamp),
			frame => this._videoFrameToWrappedCanvas(frame),
		);
	}

	canvasesAtTimestamps(timestamps: AnyIterable<number>) {
		return mapAsyncGenerator(
			this._videoFrameDrain.framesAtTimestamps(timestamps),
			async frame => frame && this._videoFrameToWrappedCanvas(frame),
		);
	}
}

/** @public */
export class EncodedAudioChunkDrain extends BaseChunkDrain<EncodedAudioChunk> {
	/** @internal */
	_audioTrack: InputAudioTrack;

	constructor(audioTrack: InputAudioTrack) {
		if (!(audioTrack instanceof InputAudioTrack)) {
			throw new TypeError('audioTrack must be an InputAudioTrack.');
		}

		super();

		this._audioTrack = audioTrack;
	}

	getFirstChunk(options: ChunkRetrievalOptions = {}) {
		validateChunkRetrievalOptions(options);
		return this._audioTrack._backing.getFirstChunk(options);
	}

	getChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validateChunkRetrievalOptions(options);
		return this._audioTrack._backing.getChunk(timestamp, options);
	}

	getNextChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions = {}) {
		if (!(chunk instanceof EncodedAudioChunk)) {
			throw new TypeError('chunk must be an EncodedAudioChunk.');
		}
		validateChunkRetrievalOptions(options);
		return this._audioTrack._backing.getNextChunk(chunk, options);
	}

	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validateChunkRetrievalOptions(options);
		return this._audioTrack._backing.getKeyChunk(timestamp, options);
	}

	getNextKeyChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions = {}) {
		if (!(chunk instanceof EncodedAudioChunk)) {
			throw new TypeError('chunk must be an EncodedAudioChunk.');
		}
		validateChunkRetrievalOptions(options);
		return this._audioTrack._backing.getNextKeyChunk(chunk, options);
	}
}

class AudioDecoderWrapper extends DecoderWrapper<EncodedAudioChunk, AudioData> {
	decoder: AudioDecoder;

	constructor(
		onData: (data: AudioData) => unknown,
		onError: (error: DOMException) => unknown,
		decoderConfig: AudioDecoderConfig,
	) {
		super(onData, onError);

		this.decoder = new AudioDecoder({ output: onData, error: onError });
		this.decoder.configure(decoderConfig);
	}

	getDecodeQueueSize() {
		return this.decoder.decodeQueueSize;
	}

	decode(chunk: EncodedAudioChunk) {
		this.decoder.decode(chunk);
	}

	flush() {
		return this.decoder.flush();
	}

	close() {
		this.decoder.close();
	}
}

const PCM_CODEC_REGEX = /^pcm-([usf])(\d+)+(be)?$/;

// There are a lot of PCM variants not natively supported by the browser and by AudioData. Therefore we need a simple
// decoder that maps any input PCM format into a PCM format supported by the browser.
class PcmAudioDecoderWrapper extends DecoderWrapper<EncodedAudioChunk, AudioData> {
	codec: PcmAudioCodec;

	inputSampleSize: 1 | 2 | 3 | 4;
	readInputValue: (view: DataView, byteOffset: number) => number;

	outputSampleSize: 1 | 2 | 4;
	outputFormat: 'u8' | 's16' | 's32' | 'f32';
	writeOutputValue: (view: DataView, byteOffset: number, value: number) => void;

	constructor(
		onData: (data: AudioData) => unknown,
		onError: (error: DOMException) => unknown,
		public decoderConfig: AudioDecoderConfig,
	) {
		super(onData, onError);

		assert((PCM_CODECS as readonly string[]).includes(decoderConfig.codec));
		this.codec = decoderConfig.codec as PcmAudioCodec;

		const match = this.codec.match(PCM_CODEC_REGEX);
		assert(match);

		let dataType: 'unsigned' | 'signed' | 'float';
		if (match[1] === 'u') {
			dataType = 'unsigned';
		} else if (match[1] === 's') {
			dataType = 'signed';
		} else {
			dataType = 'float';
		}

		this.inputSampleSize = (Number(match[2]) / 8) as 1 | 2 | 3 | 4;
		const littleEndian = match[3] !== 'be';

		switch (this.inputSampleSize) {
			case 1: {
				if (dataType === 'unsigned') {
					this.readInputValue = (view, byteOffset) => view.getUint8(byteOffset) - 2 ** 7;
				} else {
					this.readInputValue = (view, byteOffset) => view.getInt8(byteOffset);
				}
			}; break;
			case 2: {
				if (dataType === 'unsigned') {
					this.readInputValue = (view, byteOffset) => view.getUint16(byteOffset, littleEndian) - 2 ** 15;
				} else {
					this.readInputValue = (view, byteOffset) => view.getInt16(byteOffset, littleEndian);
				}
			}; break;
			case 3: {
				if (dataType === 'unsigned') {
					this.readInputValue = (view, byteOffset) => getUint24(view, byteOffset, littleEndian) - 2 ** 23;
				} else {
					this.readInputValue = (view, byteOffset) => getInt24(view, byteOffset, littleEndian);
				}
			}; break;
			case 4: {
				if (dataType === 'unsigned') {
					this.readInputValue = (view, byteOffset) => view.getUint32(byteOffset, littleEndian) - 2 ** 31;
				} else if (dataType === 'signed') {
					this.readInputValue = (view, byteOffset) => view.getInt32(byteOffset, littleEndian);
				} else {
					this.readInputValue = (view, byteOffset) => view.getFloat32(byteOffset, littleEndian);
				}
			}; break;
		}

		switch (this.inputSampleSize) {
			case 1: {
				this.outputSampleSize = 1;
				this.outputFormat = 'u8';
				this.writeOutputValue = (view, byteOffset, value) => view.setUint8(byteOffset, value + 2 ** 7);
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

	decode(chunk: EncodedAudioChunk) {
		const inputBuffer = new ArrayBuffer(chunk.byteLength);
		const inputView = new DataView(inputBuffer);
		chunk.copyTo(inputBuffer);

		const numberOfFrames = chunk.byteLength / this.decoderConfig.numberOfChannels / this.inputSampleSize;

		const outputBufferSize = numberOfFrames * this.decoderConfig.numberOfChannels * this.outputSampleSize;
		const outputBuffer = new ArrayBuffer(outputBufferSize);
		const outputView = new DataView(outputBuffer);

		for (let i = 0; i < numberOfFrames * this.decoderConfig.numberOfChannels; i++) {
			const inputIndex = i * this.inputSampleSize;
			const outputIndex = i * this.outputSampleSize;

			const value = this.readInputValue(inputView, inputIndex);
			this.writeOutputValue(outputView, outputIndex, value);
		}

		const audioData = new AudioData({
			format: this.outputFormat,
			data: outputBuffer,
			numberOfChannels: this.decoderConfig.numberOfChannels,
			sampleRate: this.decoderConfig.sampleRate,
			numberOfFrames,
			timestamp: chunk.timestamp,
		});

		// Since all other decoders are async, we'll make this one behave async as well
		queueMicrotask(() => this.onMedia(audioData));
	}

	async flush() {
		// Do nothing
	}

	close() {
		// Do nothing
	}
}

/** @public */
export class AudioDataDrain extends BaseMediaFrameDrain<EncodedAudioChunk, AudioData> {
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
	async _createDecoder(onData: (data: AudioData) => unknown, onError: (error: DOMException) => unknown) {
		if (!(await this._audioTrack.canDecode())) {
			throw new Error(
				'This audio track cannot be decoded by this browser. Make sure to check decodability before using'
				+ ' a track.',
			);
		}

		const decoderConfig = await this._audioTrack.getDecoderConfig();
		assert(decoderConfig);

		if (decoderConfig.codec.startsWith('pcm-')) {
			return new PcmAudioDecoderWrapper(onData, onError, decoderConfig);
		} else {
			return new AudioDecoderWrapper(onData, onError, decoderConfig);
		}
	}

	/** @internal */
	_createChunkDrain() {
		return new EncodedAudioChunkDrain(this._audioTrack);
	}

	async getData(timestamp: number) {
		validateTimestamp(timestamp);

		for await (const data of this.mediaFramesAtTimestamps([timestamp])) {
			return data;
		}
		throw new Error('Internal error: Iterator returned nothing.');
	}

	data(startTimestamp = 0, endTimestamp = Infinity) {
		return this.mediaFramesInRange(startTimestamp, endTimestamp);
	}

	dataAtTimestamps(timestamps: AnyIterable<number>) {
		return this.mediaFramesAtTimestamps(timestamps);
	}
}

/** @public */
export type WrappedAudioBuffer = {
	buffer: AudioBuffer;
	timestamp: number;
};

/** @public */
export class AudioBufferDrain {
	/** @internal */
	_audioDataDrain: AudioDataDrain;

	constructor(audioTrack: InputAudioTrack) {
		if (!(audioTrack instanceof InputAudioTrack)) {
			throw new TypeError('audioTrack must be an InputAudioTrack.');
		}

		this._audioDataDrain = new AudioDataDrain(audioTrack);
	}

	/** @internal */
	_audioDataToWrappedArrayBuffer(data: AudioData): WrappedAudioBuffer {
		const audioBuffer = new AudioBuffer({
			numberOfChannels: data.numberOfChannels,
			length: data.numberOfFrames,
			sampleRate: data.sampleRate,
		});

		// All user agents are required to support conversion to f32-planar
		const dataBytes = new Float32Array(data.allocationSize({ planeIndex: 0, format: 'f32-planar' }) / 4);

		for (let i = 0; i < data.numberOfChannels; i++) {
			data.copyTo(dataBytes, { planeIndex: i, format: 'f32-planar' });
			audioBuffer.copyToChannel(dataBytes, i);
		}

		const sampleDuration = 1 / data.sampleRate;

		const result = {
			buffer: audioBuffer,
			// Rounding the timestamp based on the sample duration removes audio playback artifacts
			timestamp: Math.round(data.timestamp / 1e6 / sampleDuration) * sampleDuration,
		};

		data.close();
		return result;
	}

	async getBuffer(timestamp: number) {
		validateTimestamp(timestamp);

		const data = await this._audioDataDrain.getData(timestamp);
		return data && this._audioDataToWrappedArrayBuffer(data);
	}

	buffers(startTimestamp = 0, endTimestamp = Infinity) {
		return mapAsyncGenerator(
			this._audioDataDrain.data(startTimestamp, endTimestamp),
			async data => this._audioDataToWrappedArrayBuffer(data),
		);
	}

	buffersAtTimestamps(timestamps: AnyIterable<number>) {
		return mapAsyncGenerator(
			this._audioDataDrain.dataAtTimestamps(timestamps),
			async data => data && this._audioDataToWrappedArrayBuffer(data),
		);
	}
}
