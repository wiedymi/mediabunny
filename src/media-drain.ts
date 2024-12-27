import { ChunkRetrievalOptions, InputAudioTrack, InputVideoTrack } from './input-track';
import { assert, promiseWithResolvers } from './misc';

abstract class BaseChunkDrain<Chunk extends EncodedVideoChunk | EncodedAudioChunk> {
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

abstract class BaseMediaFrameDrain<
	Chunk extends EncodedVideoChunk | EncodedAudioChunk,
	MediaFrame extends VideoFrame | AudioData,
> {
	abstract createDecoder(onMedia: (media: MediaFrame) => unknown): Promise<VideoDecoder | AudioDecoder>;
	abstract createChunkDrain(): BaseChunkDrain<Chunk>;

	protected async getKeyMediaFrame(timestamp: number): Promise<MediaFrame | null> {
		let result: MediaFrame | null = null;

		const decoder = await this.createDecoder(frame => result = frame);
		const chunkDrain = this.createChunkDrain();
		const chunk = await chunkDrain.getKeyChunk(timestamp);
		if (!chunk) {
			return null;
		}

		decoder.decode(chunk);

		await decoder.flush();
		decoder.close();

		return result;
	}

	protected async getMediaFrame(timestamp: number): Promise<MediaFrame | null> {
		let result: MediaFrame | null = null;

		const decoder = await this.createDecoder((frame) => {
			if (frame.timestamp / 1e6 <= timestamp) {
				result?.close();
				result = frame;
			} else {
				frame.close();
			}
		});
		const chunkDrain = this.createChunkDrain();
		const keyChunk = await chunkDrain.getKeyChunk(timestamp);
		if (!keyChunk) {
			return null;
		}

		const targetChunk = await chunkDrain.getChunk(timestamp);
		assert(targetChunk);

		decoder.decode(keyChunk);

		let currentChunk = keyChunk;
		while (currentChunk !== targetChunk) {
			const nextChunk = await chunkDrain.getNextChunk(currentChunk);
			assert(nextChunk);

			currentChunk = nextChunk;
			decoder.decode(nextChunk);

			if (decoder.decodeQueueSize >= 10) {
				await new Promise(resolve => decoder.addEventListener('dequeue', resolve, { once: true }));
			}
		}

		await decoder.flush();
		decoder.close();

		return result;
	}

	protected async* mediaFrames(startTimestamp = 0, endTimestamp = Infinity) {
		const frameQueue: MediaFrame[] = [];
		let firstFrameQueued = false;
		let lastFrame: MediaFrame | null = null;
		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let ended = false;

		const MAX_QUEUE_SIZE = 8;

		const decoder = await this.createDecoder((frame) => {
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

		const chunkDrain = this.createChunkDrain();
		const keyChunk = await chunkDrain.getKeyChunk(startTimestamp) ?? await chunkDrain.getFirstChunk();
		if (!keyChunk) {
			return;
		}

		let decoderIsFlushed = false;

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

export class EncodedVideoChunkDrain extends BaseChunkDrain<EncodedVideoChunk> {
	constructor(public videoTrack: InputVideoTrack) {
		super();
	}

	getFirstChunk(options: ChunkRetrievalOptions = {}) {
		return this.videoTrack._backing.getFirstChunk(options);
	}

	getChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		return this.videoTrack._backing.getChunk(timestamp, options);
	}

	getNextChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions = {}) {
		return this.videoTrack._backing.getNextChunk(chunk, options);
	}

	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		return this.videoTrack._backing.getKeyChunk(timestamp, options);
	}

	getNextKeyChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions = {}) {
		return this.videoTrack._backing.getNextKeyChunk(chunk, options);
	}
}

export class VideoFrameDrain extends BaseMediaFrameDrain<EncodedVideoChunk, VideoFrame> {
	decoderConfig: VideoDecoderConfig | null = null;

	constructor(public videoTrack: InputVideoTrack) {
		super();
	}

	async createDecoder(onFrame: (frame: VideoFrame) => unknown) {
		this.decoderConfig ??= await this.videoTrack.getDecoderConfig();

		const decoder = new VideoDecoder({
			output: onFrame,
			error: error => console.error(error),
		});
		decoder.configure(this.decoderConfig);

		return decoder;
	}

	createChunkDrain() {
		return new EncodedVideoChunkDrain(this.videoTrack);
	}

	getKeyFrame(timestamp: number) {
		return this.getKeyMediaFrame(timestamp);
	}

	getFrame(timestamp: number) {
		return this.getMediaFrame(timestamp);
	}

	frames(startTimestamp = 0, endTimestamp = Infinity) {
		return this.mediaFrames(startTimestamp, endTimestamp);
	}
}

type WrappedCanvas = {
	canvas: HTMLCanvasElement;
	timestamp: number;
	duration: number;
};

export class CanvasDrain {
	videoFrameDrain: VideoFrameDrain;

	constructor(public videoTrack: InputVideoTrack, public dimensions?: { width: number; height: number }) {
		this.videoFrameDrain = new VideoFrameDrain(videoTrack);
	}

	private async videoFrameToWrappedCanvas(frame: VideoFrame): Promise<WrappedCanvas> {
		const width = this.dimensions?.width ?? await this.videoTrack.getRotatedWidth();
		const height = this.dimensions?.height ?? await this.videoTrack.getRotatedHeight();
		const rotation = await this.videoTrack.getRotation();

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
		const frame = await this.videoFrameDrain.getFrame(timestamp);
		return frame && this.videoFrameToWrappedCanvas(frame);
	}

	async* canvases(startTimestamp = 0, endTimestamp = Infinity) {
		for await (const frame of this.videoFrameDrain.frames(startTimestamp, endTimestamp)) {
			yield this.videoFrameToWrappedCanvas(frame);
		}
	}
}

export class EncodedAudioChunkDrain extends BaseChunkDrain<EncodedAudioChunk> {
	constructor(public audioTrack: InputAudioTrack) {
		super();
	}

	getFirstChunk(options: ChunkRetrievalOptions = {}) {
		return this.audioTrack._backing.getFirstChunk(options);
	}

	getChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		return this.audioTrack._backing.getChunk(timestamp, options);
	}

	getNextChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions = {}) {
		return this.audioTrack._backing.getNextChunk(chunk, options);
	}

	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions = {}) {
		return this.audioTrack._backing.getKeyChunk(timestamp, options);
	}

	getNextKeyChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions = {}) {
		return this.audioTrack._backing.getNextKeyChunk(chunk, options);
	}
}

export class AudioDataDrain extends BaseMediaFrameDrain<EncodedAudioChunk, AudioData> {
	decoderConfig: AudioDecoderConfig | null = null;

	constructor(public audioTrack: InputAudioTrack) {
		super();
	}

	async createDecoder(onData: (data: AudioData) => unknown) {
		this.decoderConfig ??= await this.audioTrack.getDecoderConfig();

		const decoder = new AudioDecoder({
			output: onData,
			error: error => console.error(error),
		});
		decoder.configure(this.decoderConfig);

		return decoder;
	}

	createChunkDrain() {
		return new EncodedAudioChunkDrain(this.audioTrack);
	}

	getKeyData(timestamp: number) {
		return this.getKeyMediaFrame(timestamp);
	}

	getData(timestamp: number) {
		return this.getMediaFrame(timestamp);
	}

	data(startTimestamp = 0, endTimestamp = Infinity) {
		return this.mediaFrames(startTimestamp, endTimestamp);
	}
}

type WrappedAudioBuffer = {
	buffer: AudioBuffer;
	timestamp: number;
};

export class AudioBufferDrain {
	audioDataDrain: AudioDataDrain;

	constructor(public audioTrack: InputAudioTrack) {
		this.audioDataDrain = new AudioDataDrain(audioTrack);
	}

	private audioDataToWrappedArrayBuffer(data: AudioData): WrappedAudioBuffer {
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
		const data = await this.audioDataDrain.getData(timestamp);
		return data && this.audioDataToWrappedArrayBuffer(data);
	}

	async* buffers(startTimestamp = 0, endTimestamp = Infinity) {
		for await (const data of this.audioDataDrain.data(startTimestamp, endTimestamp)) {
			yield this.audioDataToWrappedArrayBuffer(data);
		}
	}
}
