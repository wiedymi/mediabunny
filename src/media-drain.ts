import { InputAudioTrack, InputVideoTrack } from './input-track';
import { AnyIterable, assert, promiseWithResolvers, toAsyncIterator } from './misc';

/** @public */
export type ChunkRetrievalOptions = {
	metadataOnly?: boolean;
};

/** @public */
export abstract class BaseChunkDrain<Chunk extends EncodedVideoChunk | EncodedAudioChunk> {
	abstract getFirstChunk(options?: ChunkRetrievalOptions): Promise<Chunk | null>;
	abstract getChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
	abstract getNextChunk(chunk: Chunk, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
	abstract getKeyChunk(timestamp: number, options?: ChunkRetrievalOptions): Promise<Chunk | null>;
	abstract getNextKeyChunk(chunk: Chunk, options?: ChunkRetrievalOptions): Promise<Chunk | null>;

	async* chunks(startChunk?: Chunk, endTimestamp = Infinity) {
		const chunkQueue: Chunk[] = [];

		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let ended = false;

		const timestamps: number[] = [];
		// The queue should always be big enough to hold 1 second worth of chunks
		const maxQueueSize = () => Math.max(2, timestamps.length);

		// The following is the "pump" process that keeps pumping chunks into the queue
		void (async () => {
			let chunk = startChunk ?? await this.getFirstChunk();

			while (chunk && !ended) {
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
		})();

		try {
			while (true) {
				if (chunkQueue.length > 0) {
					yield chunkQueue.shift()!;
					const now = performance.now();
					timestamps.push(now);

					while (timestamps.length > 0 && now - timestamps[0]! >= 1000) {
						timestamps.shift();
					}

					onQueueDequeue();
				} else if (!ended) {
					await queueNotEmpty;
				} else {
					break;
				}
			}
		} finally {
			ended = true;
			onQueueDequeue();
		}
	}
}

/** @public */
export abstract class BaseMediaFrameDrain<
	Chunk extends EncodedVideoChunk | EncodedAudioChunk,
	MediaFrame extends VideoFrame | AudioData,
> {
	/** @internal */
	abstract _createDecoder(onMedia: (media: MediaFrame) => unknown): Promise<VideoDecoder | AudioDecoder>;
	/** @internal */
	abstract _createChunkDrain(): BaseChunkDrain<Chunk>;

	/** @internal */
	private _duplicateFrame(frame: MediaFrame) {
		return structuredClone(frame);
	}

	protected async* mediaFramesAtTimestamps(timestamps: AnyIterable<number>) {
		const timestampIterator = toAsyncIterator(timestamps);
		const timestampsOfInterest: number[] = [];

		const frameQueue: (MediaFrame | null)[] = [];
		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let decoderIsFlushed = false;
		let ended = false;

		const MAX_QUEUE_SIZE = 8;

		let lastUsedFrame: MediaFrame | null = null;
		const pushToQueue = (frame: MediaFrame | null) => {
			frameQueue.push(frame);
			onQueueNotEmpty();
			({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
		};

		const decoder = await this._createDecoder((frame) => {
			onQueueDequeue();

			if (ended) {
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
		});

		// The following is the "pump" process that keeps pumping chunks into the decoder
		void (async () => {
			const chunkDrain = this._createChunkDrain();
			let lastKeyChunk: Chunk | null = null;
			let lastChunk: Chunk | null = null;

			for await (const timestamp of timestampIterator) {
				while (frameQueue.length + decoder.decodeQueueSize > MAX_QUEUE_SIZE) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
				}

				if (ended) {
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

				if (decoder.decodeQueueSize >= 10) {
					await new Promise(resolve => decoder.addEventListener('dequeue', resolve, { once: true }));
				}
			}

			await decoder.flush();
			decoder.close();

			decoderIsFlushed = true;
			onQueueNotEmpty(); // To unstuck the generator
		})();

		try {
			while (true) {
				if (frameQueue.length > 0) {
					const nextFrame = frameQueue.shift();
					assert(nextFrame !== undefined);
					yield nextFrame;
					onQueueDequeue();
				} else if (!decoderIsFlushed) {
					await queueNotEmpty;
				} else {
					break;
				}
			}
		} finally {
			ended = true;
			onQueueDequeue();

			for (const frame of frameQueue) {
				frame?.close();
			}
			(lastUsedFrame as MediaFrame | null)?.close();
		}
	}

	protected async* mediaFramesInRange(startTimestamp = 0, endTimestamp = Infinity) {
		const frameQueue: MediaFrame[] = [];
		let firstFrameQueued = false;
		let lastFrame: MediaFrame | null = null;
		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let decoderIsFlushed = false;
		let ended = false;

		const MAX_QUEUE_SIZE = 8;

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
					// We don't know ahead of time what the first first is. This is because the first first is the last
					// first whose timestamp is less than or equal to the start timestamp. Therefore we need to wait
					// for the first first after the start timestamp, and then we'll know that the previous first was
					// the first first.
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
		});

		const chunkDrain = this._createChunkDrain();
		const keyChunk = await chunkDrain.getKeyChunk(startTimestamp) ?? await chunkDrain.getFirstChunk();
		if (!keyChunk) {
			return;
		}

		// The following is the "pump" process that keeps pumping chunks into the decoder
		void (async () => {
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
			await chunks.next();

			while (currentChunk && !ended) {
				if (frameQueue.length + decoder.decodeQueueSize > MAX_QUEUE_SIZE) {
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

			await decoder.flush();
			decoder.close();

			if (!firstFrameQueued && lastFrame) {
				frameQueue.push(lastFrame);
			}

			decoderIsFlushed = true;
			onQueueNotEmpty(); // To unstuck the generator
		})();

		try {
			while (true) {
				if (frameQueue.length > 0) {
					yield frameQueue.shift()!;
					onQueueDequeue();
				} else if (!decoderIsFlushed) {
					await queueNotEmpty;
				} else {
					break;
				}
			}
		} finally {
			ended = true;
			onQueueDequeue();

			for (const frame of frameQueue) {
				frame.close();
			}
		}
	}
}

/** @public */
export class EncodedVideoChunkDrain extends BaseChunkDrain<EncodedVideoChunk> {
	/** @internal */
	_videoTrack: InputVideoTrack;

	constructor(videoTrack: InputVideoTrack) {
		super();

		this._videoTrack = videoTrack;
	}

	getFirstChunk(options: ChunkRetrievalOptions = {}) {
		return this._videoTrack._backing.getFirstChunk(options);
	}

	getChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		return this._videoTrack._backing.getChunk(timestamp, options);
	}

	getNextChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions = {}) {
		return this._videoTrack._backing.getNextChunk(chunk, options);
	}

	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		return this._videoTrack._backing.getKeyChunk(timestamp, options);
	}

	getNextKeyChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions = {}) {
		return this._videoTrack._backing.getNextKeyChunk(chunk, options);
	}
}

/** @public */
export class VideoFrameDrain extends BaseMediaFrameDrain<EncodedVideoChunk, VideoFrame> {
	/** @internal */
	_videoTrack: InputVideoTrack;
	/** @internal */
	_decoderConfig: VideoDecoderConfig | null = null;

	constructor(videoTrack: InputVideoTrack) {
		super();

		this._videoTrack = videoTrack;
	}

	/** @internal */
	async _createDecoder(onFrame: (frame: VideoFrame) => unknown) {
		this._decoderConfig ??= await this._videoTrack.getDecoderConfig();

		const decoder = new VideoDecoder({
			output: onFrame,
			error: error => console.error(error),
		});
		decoder.configure(this._decoderConfig);

		return decoder;
	}

	/** @internal */
	_createChunkDrain() {
		return new EncodedVideoChunkDrain(this._videoTrack);
	}

	async getFrame(timestamp: number) {
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
		const frame = await this._videoFrameDrain.getFrame(timestamp);
		return frame && this._videoFrameToWrappedCanvas(frame);
	}

	async* canvases(startTimestamp = 0, endTimestamp = Infinity) {
		for await (const frame of this._videoFrameDrain.frames(startTimestamp, endTimestamp)) {
			yield this._videoFrameToWrappedCanvas(frame);
		}
	}

	async* canvasesAtTimestamps(timestamps: AnyIterable<number>) {
		for await (const frame of this._videoFrameDrain.framesAtTimestamps(timestamps)) {
			yield frame && this._videoFrameToWrappedCanvas(frame);
		}
	}
}

/** @public */
export class EncodedAudioChunkDrain extends BaseChunkDrain<EncodedAudioChunk> {
	/** @internal */
	_audioTrack: InputAudioTrack;

	constructor(audioTrack: InputAudioTrack) {
		super();

		this._audioTrack = audioTrack;
	}

	getFirstChunk(options: ChunkRetrievalOptions = {}) {
		return this._audioTrack._backing.getFirstChunk(options);
	}

	getChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		return this._audioTrack._backing.getChunk(timestamp, options);
	}

	getNextChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions = {}) {
		return this._audioTrack._backing.getNextChunk(chunk, options);
	}

	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		return this._audioTrack._backing.getKeyChunk(timestamp, options);
	}

	getNextKeyChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions = {}) {
		return this._audioTrack._backing.getNextKeyChunk(chunk, options);
	}
}

/** @public */
export class AudioDataDrain extends BaseMediaFrameDrain<EncodedAudioChunk, AudioData> {
	/** @internal */
	_audioTrack: InputAudioTrack;
	/** @internal */
	_decoderConfig: AudioDecoderConfig | null = null;

	constructor(audioTrack: InputAudioTrack) {
		super();

		this._audioTrack = audioTrack;
	}

	/** @internal */
	async _createDecoder(onData: (data: AudioData) => unknown) {
		this._decoderConfig ??= await this._audioTrack.getDecoderConfig();

		const decoder = new AudioDecoder({
			output: onData,
			error: error => console.error(error),
		});
		decoder.configure(this._decoderConfig);

		return decoder;
	}

	/** @internal */
	_createChunkDrain() {
		return new EncodedAudioChunkDrain(this._audioTrack);
	}

	async getData(timestamp: number) {
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
		const data = await this._audioDataDrain.getData(timestamp);
		return data && this._audioDataToWrappedArrayBuffer(data);
	}

	async* buffers(startTimestamp = 0, endTimestamp = Infinity) {
		for await (const data of this._audioDataDrain.data(startTimestamp, endTimestamp)) {
			yield this._audioDataToWrappedArrayBuffer(data);
		}
	}

	async* buffersAtTimestamps(timestamps: AnyIterable<number>) {
		for await (const data of this._audioDataDrain.dataAtTimestamps(timestamps)) {
			yield data && this._audioDataToWrappedArrayBuffer(data);
		}
	}
}
