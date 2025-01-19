import { parsePcmCodec, PCM_AUDIO_CODECS, PcmAudioCodec } from './codec';
import { InputAudioTrack, InputVideoTrack } from './input-track';
import {
	AnyIterable,
	assert,
	binarySearchLessOrEqual,
	getInt24,
	getUint24,
	mapAsyncGenerator,
	promiseWithResolvers,
	toAsyncIterator,
	validateAnyIterable,
} from './misc';
import { fromAlaw, fromUlaw } from './pcm';
import { EncodedAudioSample, EncodedVideoSample } from './sample';

/** @public */
export type SampleRetrievalOptions = {
	metadataOnly?: boolean;
};

const validateSampleRetrievalOptions = (options: SampleRetrievalOptions) => {
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
export abstract class BaseSampleSink<Sample extends EncodedVideoSample | EncodedAudioSample> {
	abstract getFirstSample(options?: SampleRetrievalOptions): Promise<Sample | null>;
	abstract getSample(timestamp: number, options?: SampleRetrievalOptions): Promise<Sample | null>;
	abstract getNextSample(sample: Sample, options?: SampleRetrievalOptions): Promise<Sample | null>;
	abstract getKeySample(timestamp: number, options?: SampleRetrievalOptions): Promise<Sample | null>;
	abstract getNextKeySample(sample: Sample, options?: SampleRetrievalOptions): Promise<Sample | null>;

	samples(
		startSample?: Sample,
		endTimestamp = Infinity,
		options?: SampleRetrievalOptions,
	): AsyncGenerator<Sample, void, unknown> {
		const sampleQueue: Sample[] = [];

		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let ended = false;
		let terminated = false;

		// This stores errors that are "out of band" in the sense that they didn't occur in the normal flow of this
		// method but instead in a different context. This error should not go unnoticed and must be bubbled up to
		// the consumer.
		let outOfBandError = null as Error | null;

		const timestamps: number[] = [];
		// The queue should always be big enough to hold 1 second worth of samples
		const maxQueueSize = () => Math.max(2, timestamps.length);

		// The following is the "pump" process that keeps pumping samples into the queue
		(async () => {
			let sample = startSample ?? await this.getFirstSample(options);

			while (sample && !terminated) {
				if (sample.timestamp >= endTimestamp) {
					break;
				}

				if (sampleQueue.length > maxQueueSize()) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
					continue;
				}

				sampleQueue.push(sample);

				onQueueNotEmpty();
				({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());

				sample = await this.getNextSample(sample, options);
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
					} else if (sampleQueue.length > 0) {
						const value = sampleQueue.shift()!;
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

export type WrappedMediaFrame<T extends VideoFrame | AudioData, S extends EncodedVideoSample | EncodedAudioSample> = {
	frame: T;
	sample: S;
	timestamp: number;
	duration: number;
};

abstract class DecoderWrapper<
	Sample extends EncodedVideoSample | EncodedAudioSample,
	MediaFrame extends VideoFrame | AudioData,
	WrappedFrame extends WrappedMediaFrame<MediaFrame, Sample> = WrappedMediaFrame<MediaFrame, Sample>,
> {
	constructor(
		public onFrame: (frame: WrappedFrame) => unknown,
		public onError: (error: DOMException) => unknown,
	) {}

	abstract getDecodeQueueSize(): number;
	abstract decode(sample: Sample): void;
	abstract flush(): Promise<void>;
	abstract close(): void;
}

/** @public */
export abstract class BaseMediaFrameSink<
	Sample extends EncodedVideoSample | EncodedAudioSample,
	MediaFrame extends VideoFrame | AudioData,
	/** @internal */
	WrappedFrame extends WrappedMediaFrame<MediaFrame, Sample> = WrappedMediaFrame<MediaFrame, Sample>,
> {
	/** @internal */
	abstract _createDecoder(
		onFrame: (frame: WrappedFrame) => unknown,
		onError: (error: DOMException) => unknown
	): Promise<DecoderWrapper<Sample, MediaFrame>>;
	/** @internal */
	abstract _createSampleSink(): BaseSampleSink<Sample>;

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

		// The following is the "pump" process that keeps pumping samples into the decoder
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

			const sampleSink = this._createSampleSink();
			const keySample = await sampleSink.getKeySample(startTimestamp) ?? await sampleSink.getFirstSample();
			if (!keySample) {
				return;
			}

			let currentSample: Sample | null = keySample;

			let samplesEndTimestamp = Infinity;
			if (endTimestamp < Infinity) {
				// When an end timestamp is set, we cannot simply use that for the sample iterator due to out-of-order
				// frames (B-frames). Instead, we'll need to keep decoding samples until we get a frame that exceeds
				// this end time. However, we can still put a bound on it: Since key frames are by definition never
				// out of order, we can stop at the first key frame after the end timestamp.
				const endSample = await sampleSink.getSample(endTimestamp);
				const endKeySample = !endSample
					? null
					: endSample.type === 'key' && endSample.timestamp === endTimestamp
						? endSample
						: await sampleSink.getNextKeySample(endSample);

				if (endKeySample) {
					samplesEndTimestamp = endKeySample.timestamp;
				}
			}

			const samples = sampleSink.samples(keySample, samplesEndTimestamp);
			await samples.next(); // Skip the start sample as we already have it

			while (currentSample && !ended) {
				if (frameQueue.length + decoder.getDecodeQueueSize() > MAX_QUEUE_SIZE) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
					continue;
				}

				decoder.decode(currentSample);

				const sampleResult = await samples.next();
				if (sampleResult.done) {
					break;
				}

				currentSample = sampleResult.value;
			}

			await samples.return();

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
		const samplesOfInterest: Sample[] = [];

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

		// The following is the "pump" process that keeps pumping samples into the decoder
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
					samplesOfInterest.length > 0
					&& samplesOfInterest[0]!.is(wrappedFrame.sample as EncodedVideoSample & EncodedAudioSample)
				) {
					pushToQueue(this._duplicateFrame(wrappedFrame));
					samplesOfInterest.shift();
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

			const sampleSink = this._createSampleSink();
			let lastKeySample: Sample | null = null;
			let lastSample: Sample | null = null;

			for await (const timestamp of timestampIterator) {
				validateTimestamp(timestamp);

				while (frameQueue.length + decoder.getDecodeQueueSize() > MAX_QUEUE_SIZE && !terminated) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
				}

				if (terminated) {
					break;
				}

				const targetSample = await sampleSink.getSample(timestamp);
				if (!targetSample) {
					pushToQueue(null);
					continue;
				}

				const keySample = await sampleSink.getKeySample(timestamp);
				if (!keySample) {
					pushToQueue(null);
					continue;
				}

				samplesOfInterest.push(targetSample);

				if (
					lastKeySample
					&& keySample.timestamp === lastKeySample.timestamp
					&& targetSample.timestamp >= lastSample!.timestamp
				) {
					assert(lastSample);

					if (targetSample.timestamp === lastSample.timestamp && samplesOfInterest.length === 1) {
						// Special case: We have a repeat sample, but the frame for that sample has already been
						// decoded. Therefore, we need to push the frame here instead of in the decoder callback.
						if (lastUsedFrame) {
							pushToQueue(this._duplicateFrame(lastUsedFrame));
						}
						samplesOfInterest.shift();
					}
				} else {
					lastKeySample = keySample;
					lastSample = keySample;
					decoder.decode(keySample);
				}

				while (lastSample.timestamp !== targetSample.timestamp) {
					const nextSample = await sampleSink.getNextSample(lastSample);
					assert(nextSample);

					lastSample = nextSample;
					decoder.decode(nextSample);
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

/** @public */
export class EncodedVideoSampleSink extends BaseSampleSink<EncodedVideoSample> {
	/** @internal */
	_videoTrack: InputVideoTrack;

	constructor(videoTrack: InputVideoTrack) {
		if (!(videoTrack instanceof InputVideoTrack)) {
			throw new TypeError('videoTrack must be an InputVideoTrack.');
		}

		super();

		this._videoTrack = videoTrack;
	}

	getFirstSample(options: SampleRetrievalOptions = {}) {
		validateSampleRetrievalOptions(options);
		return this._videoTrack._backing.getFirstSample(options);
	}

	getSample(timestamp: number, options: SampleRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validateSampleRetrievalOptions(options);
		return this._videoTrack._backing.getSample(timestamp, options);
	}

	getNextSample(sample: EncodedVideoSample, options: SampleRetrievalOptions = {}) {
		if (!(sample instanceof EncodedVideoSample)) {
			throw new TypeError('sample must be an EncodedVideoSample.');
		}
		validateSampleRetrievalOptions(options);
		return this._videoTrack._backing.getNextSample(sample, options);
	}

	getKeySample(timestamp: number, options: SampleRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validateSampleRetrievalOptions(options);
		return this._videoTrack._backing.getKeySample(timestamp, options);
	}

	getNextKeySample(sample: EncodedVideoSample, options: SampleRetrievalOptions = {}) {
		if (!(sample instanceof EncodedVideoSample)) {
			throw new TypeError('sample must be an EncodedVideoSample.');
		}
		validateSampleRetrievalOptions(options);
		return this._videoTrack._backing.getNextKeySample(sample, options);
	}
}

class VideoDecoderWrapper extends DecoderWrapper<EncodedVideoSample, VideoFrame> {
	decoder: VideoDecoder;
	pendingSamples: EncodedVideoSample[] = [];

	constructor(
		onFrame: (frame: WrappedMediaFrame<VideoFrame, EncodedVideoSample>) => unknown,
		onError: (error: DOMException) => unknown,
		decoderConfig: VideoDecoderConfig,
	) {
		super(onFrame, onError);

		this.decoder = new VideoDecoder({
			output: (frame) => {
				const sample = this.pendingSamples.shift();
				assert(sample);

				// Let's get these from the sample instead of the frame, as the frame has no innate timing info
				// (unlike AudioData), so the sample will always be more accurate.
				const timestamp = sample.timestamp;
				const duration = sample.duration;

				onFrame({
					frame,
					sample,
					timestamp,
					duration,
				});
			},
			error: onError,
		});
		this.decoder.configure(decoderConfig);
	}

	getDecodeQueueSize() {
		return this.decoder.decodeQueueSize;
	}

	decode(sample: EncodedVideoSample) {
		// We know the decoder spits out frames in sorted order, so we need to insert the sample in the right place
		const insertionIndex = binarySearchLessOrEqual(this.pendingSamples, sample.timestamp, x => x.timestamp);
		this.pendingSamples.splice(insertionIndex + 1, 0, sample);

		this.decoder.decode(sample.toEncodedVideoChunk());
	}

	flush() {
		return this.decoder.flush();
	}

	close() {
		this.decoder.close();
	}
}

/** @public */
export type WrappedVideoFrame = {
	frame: VideoFrame;
	timestamp: number;
	duration: number;
};

/** @public */
export class VideoFrameSink extends BaseMediaFrameSink<EncodedVideoSample, VideoFrame> {
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
		onFrame: (frame: WrappedMediaFrame<VideoFrame, EncodedVideoSample>) => unknown,
		onError: (error: DOMException) => unknown,
	) {
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
	_createSampleSink() {
		return new EncodedVideoSampleSink(this._videoTrack);
	}

	/** @internal */
	_wrappedFrameToWrappedVideoFrame(frame: WrappedMediaFrame<VideoFrame, EncodedVideoSample>): WrappedVideoFrame {
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
			async frame => this._wrappedFrameToWrappedVideoFrame(frame),
		);
	}

	framesAtTimestamps(timestamps: AnyIterable<number>) {
		return mapAsyncGenerator(
			this.mediaFramesAtTimestamps(timestamps),
			async frame => frame && this._wrappedFrameToWrappedVideoFrame(frame),
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
export class CanvasSink {
	/** @internal */
	_videoTrack: InputVideoTrack;
	/** @internal */
	_dimensions?: { width: number; height: number };
	/** @internal */
	_videoFrameSink: VideoFrameSink;

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
		this._videoFrameSink = new VideoFrameSink(videoTrack);
	}

	/** @internal */
	async _videoFrameToWrappedCanvas(frame: WrappedVideoFrame): Promise<WrappedCanvas> {
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

		context.drawImage(frame.frame, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);

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
			async frame => frame && this._videoFrameToWrappedCanvas(frame),
		);
	}
}

/** @public */
export class EncodedAudioSampleSink extends BaseSampleSink<EncodedAudioSample> {
	/** @internal */
	_audioTrack: InputAudioTrack;

	constructor(audioTrack: InputAudioTrack) {
		if (!(audioTrack instanceof InputAudioTrack)) {
			throw new TypeError('audioTrack must be an InputAudioTrack.');
		}

		super();

		this._audioTrack = audioTrack;
	}

	getFirstSample(options: SampleRetrievalOptions = {}) {
		validateSampleRetrievalOptions(options);
		return this._audioTrack._backing.getFirstSample(options);
	}

	getSample(timestamp: number, options: SampleRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validateSampleRetrievalOptions(options);
		return this._audioTrack._backing.getSample(timestamp, options);
	}

	getNextSample(sample: EncodedAudioSample, options: SampleRetrievalOptions = {}) {
		if (!(sample instanceof EncodedAudioSample)) {
			throw new TypeError('sample must be an EncodedAudioSample.');
		}
		validateSampleRetrievalOptions(options);
		return this._audioTrack._backing.getNextSample(sample, options);
	}

	getKeySample(timestamp: number, options: SampleRetrievalOptions = {}) {
		validateTimestamp(timestamp);
		validateSampleRetrievalOptions(options);
		return this._audioTrack._backing.getKeySample(timestamp, options);
	}

	getNextKeySample(sample: EncodedAudioSample, options: SampleRetrievalOptions = {}) {
		if (!(sample instanceof EncodedAudioSample)) {
			throw new TypeError('sample must be an EncodedAudioSample.');
		}
		validateSampleRetrievalOptions(options);
		return this._audioTrack._backing.getNextKeySample(sample, options);
	}
}

class AudioDecoderWrapper extends DecoderWrapper<EncodedAudioSample, AudioData> {
	decoder: AudioDecoder;
	pendingSamples: EncodedAudioSample[] = [];

	constructor(
		onData: (data: WrappedMediaFrame<AudioData, EncodedAudioSample>) => unknown,
		onError: (error: DOMException) => unknown,
		decoderConfig: AudioDecoderConfig,
	) {
		super(onData, onError);

		this.decoder = new AudioDecoder({ output: (data) => {
			const sample = this.pendingSamples.shift();
			assert(sample);

			// We use the timing information from the data instead of sample as it will be more accurate. However,
			// we also know these need to be multiple of the sample length, so let's round:
			const timestamp = Math.round(data.timestamp / 1e6 * decoderConfig.sampleRate) / decoderConfig.sampleRate;
			const duration = Math.round(data.duration / 1e6 * decoderConfig.sampleRate) / decoderConfig.sampleRate;

			onData({
				frame: data,
				sample,
				timestamp,
				duration,
			});
		}, error: onError });
		this.decoder.configure(decoderConfig);
	}

	getDecodeQueueSize() {
		return this.decoder.decodeQueueSize;
	}

	decode(sample: EncodedAudioSample) {
		// We know the decoder spits out data in sorted order, so we need to insert the sample in the right place
		const insertionIndex = binarySearchLessOrEqual(this.pendingSamples, sample.timestamp, x => x.timestamp);
		this.pendingSamples.splice(insertionIndex + 1, 0, sample);

		this.decoder.decode(sample.toEncodedAudioChunk());
	}

	flush() {
		return this.decoder.flush();
	}

	close() {
		this.decoder.close();
	}
}

// There are a lot of PCM variants not natively supported by the browser and by AudioData. Therefore we need a simple
// decoder that maps any input PCM format into a PCM format supported by the browser.
class PcmAudioDecoderWrapper extends DecoderWrapper<EncodedAudioSample, AudioData> {
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
		onData: (data: WrappedMediaFrame<AudioData, EncodedAudioSample>) => unknown,
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

	decode(sample: EncodedAudioSample) {
		const inputView = new DataView(sample.data.buffer, sample.data.byteOffset, sample.byteLength);

		const numberOfFrames = sample.byteLength / this.decoderConfig.numberOfChannels / this.inputSampleSize;

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
		if (this.currentTimestamp === null || Math.abs(sample.timestamp - this.currentTimestamp) >= preciseDuration) {
			// We need to sync with the sample timestamp again
			this.currentTimestamp = sample.timestamp;
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
			sample,
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
export class AudioDataSink extends BaseMediaFrameSink<EncodedAudioSample, AudioData> {
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
		onData: (data: WrappedMediaFrame<AudioData, EncodedAudioSample>) => unknown,
		onError: (error: DOMException) => unknown,
	) {
		if (!(await this._audioTrack.canDecode())) {
			throw new Error(
				'This audio track cannot be decoded by this browser. Make sure to check decodability before using'
				+ ' a track.',
			);
		}

		const decoderConfig = await this._audioTrack.getDecoderConfig();
		assert(decoderConfig);

		if ((PCM_AUDIO_CODECS as readonly string[]).includes(decoderConfig.codec)) {
			return new PcmAudioDecoderWrapper(onData, onError, decoderConfig);
		} else {
			return new AudioDecoderWrapper(onData, onError, decoderConfig);
		}
	}

	/** @internal */
	_wrappedFrameToWrappedAudioData(frame: WrappedMediaFrame<AudioData, EncodedAudioSample>): WrappedAudioData {
		return {
			data: frame.frame,
			timestamp: frame.timestamp,
			duration: frame.duration,
		};
	}

	/** @internal */
	_createSampleSink() {
		return new EncodedAudioSampleSink(this._audioTrack);
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
			async data => this._wrappedFrameToWrappedAudioData(data),
		);
	}

	dataAtTimestamps(timestamps: AnyIterable<number>) {
		return mapAsyncGenerator(
			this.mediaFramesAtTimestamps(timestamps),
			async data => data && this._wrappedFrameToWrappedAudioData(data),
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
			async data => this._audioDataToWrappedArrayBuffer(data),
		);
	}

	buffersAtTimestamps(timestamps: AnyIterable<number>) {
		return mapAsyncGenerator(
			this._audioDataSink.dataAtTimestamps(timestamps),
			async data => data && this._audioDataToWrappedArrayBuffer(data),
		);
	}
}
