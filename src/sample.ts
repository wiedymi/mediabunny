import {
	assert,
	clamp,
	isAllowSharedBufferSource,
	Rotation,
	SECOND_TO_MICROSECOND_FACTOR,
	toDataView,
	toUint8Array,
	SetRequired,
} from './misc';

/** @public */
export type VideoSampleInit = {
	format?: VideoPixelFormat;
	codedWidth?: number;
	codedHeight?: number;
	rotation?: Rotation;
	timestamp?: number;
	duration?: number;
	colorSpace?: VideoColorSpaceInit;
};

/** @public */
export class VideoSample {
	/** @internal */
	_data!: VideoFrame | OffscreenCanvas | Uint8Array | null;
	/** @internal */
	_closed: boolean = false;

	readonly format!: VideoPixelFormat | null;
	readonly codedWidth!: number;
	readonly codedHeight!: number;
	readonly rotation!: Rotation;
	readonly timestamp!: number;
	readonly duration!: number;
	readonly colorSpace!: VideoColorSpace;

	get displayWidth() {
		return this.rotation % 180 === 0 ? this.codedWidth : this.codedHeight;
	}

	get displayHeight() {
		return this.rotation % 180 === 0 ? this.codedHeight : this.codedWidth;
	}

	get microsecondTimestamp() {
		return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
	}

	get microsecondDuration() {
		return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
	}

	constructor(data: VideoFrame, init?: VideoSampleInit);
	constructor(data: CanvasImageSource, init: SetRequired<VideoSampleInit, 'timestamp'>);
	constructor(
		data: BufferSource,
		init: SetRequired<VideoSampleInit, 'format' | 'codedWidth' | 'codedHeight' | 'timestamp'>
	);
	constructor(
		data: VideoFrame | CanvasImageSource | BufferSource,
		init?: VideoSampleInit,
	) {
		if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
			if (!init || typeof init !== 'object') {
				throw new TypeError('init must be an object.');
			}
			if (!('format' in init) || typeof init.format !== 'string') {
				throw new TypeError('init.format must be a string.');
			}
			if (!Number.isInteger(init.codedWidth) || init.codedWidth! <= 0) {
				throw new TypeError('init.codedWidth must be a positive integer.');
			}
			if (!Number.isInteger(init.codedHeight) || init.codedHeight! <= 0) {
				throw new TypeError('init.codedHeight must be a positive integer.');
			}
			if (init.rotation !== undefined && ![0, 90, 180, 270].includes(init.rotation)) {
				throw new TypeError('init.rotation, when provided, must be 0, 90, 180, or 270.');
			}
			if (!Number.isFinite(init.timestamp)) {
				throw new TypeError('init.timestamp must be a number.');
			}
			if (init.duration !== undefined && (!Number.isFinite(init.duration) || init.duration < 0)) {
				throw new TypeError('init.duration, when provided, must be a non-negative number.');
			}

			this._data = toUint8Array(data).slice(); // Copy it

			this.format = init.format;
			this.codedWidth = init.codedWidth!;
			this.codedHeight = init.codedHeight!;
			this.rotation = init.rotation ?? 0;
			this.timestamp = init.timestamp!;
			this.duration = init.duration ?? 0;
			this.colorSpace = new VideoColorSpace(init.colorSpace);
		} else if (typeof VideoFrame !== 'undefined' && data instanceof VideoFrame) {
			if (init?.rotation !== undefined && ![0, 90, 180, 270].includes(init.rotation)) {
				throw new TypeError('init.rotation, when provided, must be 0, 90, 180, or 270.');
			}
			if (init?.timestamp !== undefined && !Number.isFinite(init?.timestamp)) {
				throw new TypeError('init.timestamp, when provided, must be a number.');
			}
			if (init?.duration !== undefined && (!Number.isFinite(init.duration) || init.duration < 0)) {
				throw new TypeError('init.duration, when provided, must be a non-negative number.');
			}

			this._data = data;

			this.format = data.format;
			this.codedWidth = data.codedWidth;
			this.codedHeight = data.codedHeight;
			this.rotation = init?.rotation ?? 0;
			this.timestamp = init?.timestamp ?? data.timestamp / 1e6;
			this.duration = init?.duration ?? (data.duration ?? 0) / 1e6;
			this.colorSpace = data.colorSpace;
		} else if (
			(typeof HTMLImageElement !== 'undefined' && data instanceof HTMLImageElement)
			|| (typeof SVGImageElement !== 'undefined' && data instanceof SVGImageElement)
			|| (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap)
			|| (typeof HTMLVideoElement !== 'undefined' && data instanceof HTMLVideoElement)
			|| (typeof HTMLCanvasElement !== 'undefined' && data instanceof HTMLCanvasElement)
			|| (typeof OffscreenCanvas !== 'undefined' && data instanceof OffscreenCanvas)
		) {
			if (!init || typeof init !== 'object') {
				throw new TypeError('init must be an object.');
			}
			if (init.rotation !== undefined && ![0, 90, 180, 270].includes(init.rotation)) {
				throw new TypeError('init.rotation, when provided, must be 0, 90, 180, or 270.');
			}
			if (!Number.isFinite(init.timestamp)) {
				throw new TypeError('init.timestamp must be a number.');
			}
			if (init.duration !== undefined && (!Number.isFinite(init.duration) || init.duration < 0)) {
				throw new TypeError('init.duration, when provided, must be a non-negative number.');
			}

			if (typeof VideoFrame !== 'undefined') {
				return new VideoSample(
					new VideoFrame(data, {
						timestamp: Math.trunc(init.timestamp! * SECOND_TO_MICROSECOND_FACTOR),
						duration: Math.trunc((init.duration ?? 0) * SECOND_TO_MICROSECOND_FACTOR),
					}),
					init,
				);
			}

			let width = 0;
			let height = 0;

			// Determine the dimensions of the thing
			if ('naturalWidth' in data) {
				width = data.naturalWidth;
				height = data.naturalHeight;
			} else if ('videoWidth' in data) {
				width = data.videoWidth;
				height = data.videoHeight;
			} else if ('width' in data) {
				width = Number(data.width);
				height = Number(data.height);
			}

			if (!width || !height) {
				throw new TypeError('Could not determine dimensions.');
			}

			const canvas = new OffscreenCanvas(width, height);
			const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
			assert(context);

			// Draw it to a canvas
			context.drawImage(data, 0, 0);
			this._data = canvas;

			this.format = 'RGBX';
			this.codedWidth = width;
			this.codedHeight = height;
			this.rotation = init.rotation ?? 0;
			this.timestamp = init.timestamp!;
			this.duration = init.duration ?? 0;
			this.colorSpace = new VideoColorSpace({
				matrix: 'rgb',
				primaries: 'bt709',
				transfer: 'iec61966-2-1',
				fullRange: true,
			});
		} else {
			throw new TypeError('Invalid data type: Must be a BufferSource or CanvasImageSource.');
		}
	}

	clone() {
		if (this._closed) {
			throw new Error('VideoSample is closed.');
		}

		assert(this._data !== null);

		if (isVideoFrame(this._data)) {
			return new VideoSample(this._data.clone());
		} else if (this._data instanceof Uint8Array) {
			return new VideoSample(this._data.slice(), {
				format: this.format!,
				codedWidth: this.codedWidth,
				codedHeight: this.codedHeight,
				timestamp: this.timestamp,
				duration: this.duration,
				colorSpace: this.colorSpace,
			});
		} else {
			return new VideoSample(this._data, {
				format: this.format!,
				codedWidth: this.codedWidth,
				codedHeight: this.codedHeight,
				timestamp: this.timestamp,
				duration: this.duration,
				colorSpace: this.colorSpace,
			});
		}
	}

	close() {
		if (this._closed) {
			return;
		}

		if (isVideoFrame(this._data)) {
			this._data.close();
		} else {
			this._data = null; // GC that shit
		}

		this._closed = true;
	}

	allocationSize() {
		if (this._closed) {
			throw new Error('VideoSample is closed.');
		}

		assert(this._data !== null);

		if (isVideoFrame(this._data)) {
			return this._data.allocationSize();
		} else if (this._data instanceof Uint8Array) {
			return this._data.byteLength;
		} else {
			return this.codedWidth * this.codedHeight * 4; // RGBX
		}
	}

	async copyTo(destination: AllowSharedBufferSource) {
		if (!isAllowSharedBufferSource(destination)) {
			throw new TypeError('destination must be an ArrayBuffer or an ArrayBuffer view.');
		}

		if (this._closed) {
			throw new Error('VideoSample is closed.');
		}

		assert(this._data !== null);

		if (isVideoFrame(this._data)) {
			await this._data.copyTo(destination);
		} else if (this._data instanceof Uint8Array) {
			const dest = toUint8Array(destination);
			dest.set(this._data);
		} else {
			const canvas = this._data;
			const context = canvas.getContext('2d', { alpha: false });
			assert(context);

			const imageData = context.getImageData(0, 0, this.codedWidth, this.codedHeight);
			const dest = toUint8Array(destination);
			dest.set(imageData.data);
		}
	}

	toVideoFrame() {
		if (this._closed) {
			throw new Error('VideoSample is closed.');
		}

		assert(this._data !== null);

		if (isVideoFrame(this._data)) {
			return new VideoFrame(this._data, {
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration || undefined, // Drag 0 duration to undefined, glitches some codecs
			});
		} else if (this._data instanceof Uint8Array) {
			return new VideoFrame(this._data, {
				format: this.format!,
				codedWidth: this.codedWidth,
				codedHeight: this.codedHeight,
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration,
				colorSpace: this.colorSpace,
			});
		} else {
			return new VideoFrame(this._data, {
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration,
			});
		}
	}

	draw(
		context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		dx: number,
		dy: number,
		dWidth: number = this.displayWidth,
		dHeight: number = this.displayHeight,
	) {
		if (!(
			(typeof CanvasRenderingContext2D !== 'undefined' && context instanceof CanvasRenderingContext2D)
			|| (
				typeof OffscreenCanvasRenderingContext2D !== 'undefined'
				&& context instanceof OffscreenCanvasRenderingContext2D
			)
		)) {
			throw new TypeError('context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.');
		}
		if (!Number.isFinite(dx)) {
			throw new TypeError('dx must be a number.');
		}
		if (!Number.isFinite(dy)) {
			throw new TypeError('dy must be a number.');
		}
		if (!Number.isFinite(dWidth) || dWidth < 0) {
			throw new TypeError('dWidth must be a non-negative number.');
		}
		if (!Number.isFinite(dHeight) || dHeight < 0) {
			throw new TypeError('dHeight must be a non-negative number.');
		}

		if (this._closed) {
			throw new Error('VideoSample is closed.');
		}

		const source = this.toCanvasImageSource();

		context.save();

		const centerX = dx + dWidth / 2;
		const centerY = dy + dHeight / 2;

		context.translate(centerX, centerY);
		context.rotate(this.rotation * Math.PI / 180);

		const aspectRatioChange = this.rotation % 180 === 0 ? 1 : dWidth / dHeight;

		// Scale to compensate for aspect ratio changes when rotated
		context.scale(1 / aspectRatioChange, aspectRatioChange);

		context.drawImage(
			source,
			-dWidth / 2,
			-dHeight / 2,
			dWidth,
			dHeight,
		);

		// Restore the previous transformation state
		context.restore();
	}

	toCanvasImageSource() {
		if (this._closed) {
			throw new Error('VideoSample is closed.');
		}

		assert(this._data !== null);

		if (this._data instanceof Uint8Array) {
			// Requires VideoFrame to be defined
			return this.toVideoFrame();
		} else {
			return this._data;
		}
	}

	setRotation(newRotation: Rotation) {
		if (![0, 90, 180, 270].includes(newRotation)) {
			throw new TypeError('newRotation must be 0, 90, 180, or 270.');
		}

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		(this.rotation as Rotation) = newRotation;
	}

	setTimestamp(newTimestamp: number) {
		if (!Number.isFinite(newTimestamp)) {
			throw new TypeError('newTimestamp must be a number.');
		}

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		(this.timestamp as number) = newTimestamp;
	}

	setDuration(newDuration: number) {
		if (!Number.isFinite(newDuration) || newDuration < 0) {
			throw new TypeError('newDuration must be a non-negative number.');
		}

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		(this.duration as number) = newDuration;
	}
}

const isVideoFrame = (x: unknown): x is VideoFrame => {
	return typeof VideoFrame !== 'undefined' && x instanceof VideoFrame;
};

const AUDIO_SAMPLE_FORMATS = new Set(
	['f32', 'f32-planar', 's16', 's16-planar', 's32', 's32-planar', 'u8', 'u8-planar'],
);

/** @public */
export type AudioSampleInit = {
	data: AllowSharedBufferSource;
	format: AudioSampleFormat;
	numberOfChannels: number;
	sampleRate: number;
	timestamp: number;
};

/** @public */
export class AudioSample {
	/** @internal */
	_data: AudioData | Uint8Array;
	/** @internal */
	_closed: boolean = false;

	readonly format: AudioSampleFormat;
	readonly sampleRate: number;
	readonly numberOfFrames: number;
	readonly numberOfChannels: number;
	readonly duration: number;
	readonly timestamp: number;

	get microsecondTimestamp() {
		return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
	}

	get microsecondDuration() {
		return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
	}

	constructor(init: AudioData | AudioSampleInit) {
		if (isAudioData(init)) {
			if (init.format === null) {
				throw new TypeError('AudioData with null format is not supported.');
			}

			this._data = init;

			this.format = init.format;
			this.sampleRate = init.sampleRate;
			this.numberOfFrames = init.numberOfFrames;
			this.numberOfChannels = init.numberOfChannels;
			this.timestamp = init.timestamp / 1e6;
			this.duration = init.numberOfFrames / init.sampleRate;
		} else {
			if (!init || typeof init !== 'object') {
				throw new TypeError('Invalid AudioDataInit: must be an object.');
			}

			if (!AUDIO_SAMPLE_FORMATS.has(init.format)) {
				throw new TypeError('Invalid AudioDataInit: invalid format.');
			}
			if (!Number.isFinite(init.sampleRate) || init.sampleRate <= 0) {
				throw new TypeError('Invalid AudioDataInit: sampleRate must be > 0.');
			}
			if (!Number.isInteger(init.numberOfChannels) || init.numberOfChannels === 0) {
				throw new TypeError('Invalid AudioDataInit: numberOfChannels must be an integer > 0.');
			}
			if (!Number.isFinite(init?.timestamp)) {
				throw new TypeError('init.timestamp must be a number.');
			}

			const numberOfFrames
				= init.data.byteLength / (getBytesPerSample(init.format) * init.numberOfChannels);
			if (!Number.isInteger(numberOfFrames)) {
				throw new TypeError('Invalid AudioDataInit: data size is not a multiple of frame size.');
			}

			this.format = init.format;
			this.sampleRate = init.sampleRate;
			this.numberOfFrames = numberOfFrames;
			this.numberOfChannels = init.numberOfChannels;
			this.timestamp = init.timestamp;
			this.duration = numberOfFrames / init.sampleRate;

			let dataBuffer: Uint8Array;
			if (init.data instanceof ArrayBuffer) {
				dataBuffer = new Uint8Array(init.data);
			} else if (ArrayBuffer.isView(init.data)) {
				dataBuffer = new Uint8Array(init.data.buffer, init.data.byteOffset, init.data.byteLength);
			} else {
				throw new TypeError('Invalid AudioDataInit: data is not a BufferSource.');
			}

			const expectedSize
                = this.numberOfFrames * this.numberOfChannels * getBytesPerSample(this.format);
			if (dataBuffer.byteLength < expectedSize) {
				throw new TypeError('Invalid AudioDataInit: insufficient data size.');
			}

			this._data = dataBuffer;
		}
	}

	allocationSize(options: {
		planeIndex: number;
		format?: AudioSampleFormat;
		frameOffset?: number;
		frameCount?: number;
	}) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (!Number.isInteger(options.planeIndex) || options.planeIndex < 0) {
			throw new TypeError('planeIndex must be a non-negative integer.');
		}

		if (options.format !== undefined && !AUDIO_SAMPLE_FORMATS.has(options.format)) {
			throw new TypeError('Invalid format.');
		}
		if (options.frameOffset !== undefined && (!Number.isInteger(options.frameOffset) || options.frameOffset < 0)) {
			throw new TypeError('frameOffset must be a non-negative integer.');
		}
		if (options.frameCount !== undefined && (!Number.isInteger(options.frameCount) || options.frameCount < 0)) {
			throw new TypeError('frameCount must be a non-negative integer.');
		}

		if (this._closed) {
			throw new Error('AudioSample is closed.');
		}

		const destFormat = options.format ?? this.format;

		const frameOffset = options.frameOffset ?? 0;
		if (frameOffset >= this.numberOfFrames) {
			throw new RangeError('frameOffset out of range');
		}

		const copyFrameCount
            = options.frameCount !== undefined ? options.frameCount : (this.numberOfFrames - frameOffset);
		if (copyFrameCount > (this.numberOfFrames - frameOffset)) {
			throw new RangeError('frameCount out of range');
		}

		const bytesPerSample = getBytesPerSample(destFormat);
		const isPlanar = formatIsPlanar(destFormat);
		if (isPlanar && options.planeIndex >= this.numberOfChannels) {
			throw new RangeError('planeIndex out of range');
		}
		if (!isPlanar && options.planeIndex !== 0) {
			throw new RangeError('planeIndex out of range');
		}

		const elementCount = isPlanar ? copyFrameCount : copyFrameCount * this.numberOfChannels;
		return elementCount * bytesPerSample;
	}

	copyTo(
		destination: AllowSharedBufferSource,
		options: {
			planeIndex: number;
			format?: AudioSampleFormat;
			frameOffset?: number;
			frameCount?: number;
		},
	) {
		if (!isAllowSharedBufferSource(destination)) {
			throw new TypeError('destination must be an ArrayBuffer or an ArrayBuffer view.');
		}
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (!Number.isInteger(options.planeIndex) || options.planeIndex < 0) {
			throw new TypeError('planeIndex must be a non-negative integer.');
		}

		if (options.format !== undefined && !AUDIO_SAMPLE_FORMATS.has(options.format)) {
			throw new TypeError('Invalid format.');
		}
		if (options.frameOffset !== undefined && (!Number.isInteger(options.frameOffset) || options.frameOffset < 0)) {
			throw new TypeError('frameOffset must be a non-negative integer.');
		}
		if (options.frameCount !== undefined && (!Number.isInteger(options.frameCount) || options.frameCount < 0)) {
			throw new TypeError('frameCount must be a non-negative integer.');
		}

		if (this._closed) {
			throw new Error('AudioSample is closed.');
		}

		const { planeIndex, format, frameCount: optFrameCount, frameOffset: optFrameOffset } = options;

		const destFormat = format ?? this.format;
		if (!destFormat) throw new Error('Destination format not determined');

		const numFrames = this.numberOfFrames;
		const numChannels = this.numberOfChannels;
		const frameOffset = optFrameOffset ?? 0;
		if (frameOffset >= numFrames) {
			throw new RangeError('frameOffset out of range');
		}

		const copyFrameCount = optFrameCount !== undefined ? optFrameCount : (numFrames - frameOffset);
		if (copyFrameCount > (numFrames - frameOffset)) {
			throw new RangeError('frameCount out of range');
		}

		const destBytesPerSample = getBytesPerSample(destFormat);
		const destIsPlanar = formatIsPlanar(destFormat);
		if (destIsPlanar && planeIndex >= numChannels) {
			throw new RangeError('planeIndex out of range');
		}
		if (!destIsPlanar && planeIndex !== 0) {
			throw new RangeError('planeIndex out of range');
		}

		const destElementCount = destIsPlanar ? copyFrameCount : copyFrameCount * numChannels;
		const requiredSize = destElementCount * destBytesPerSample;
		if (destination.byteLength < requiredSize) {
			throw new RangeError('Destination buffer is too small');
		}

		const destView = toDataView(destination);
		const writeFn = getWriteFunction(destFormat);

		if (isAudioData(this._data)) {
			if (destIsPlanar) {
				if (destFormat === 'f32-planar') {
					// Simple, since the browser must support f32-planar, we can just delegate here
					this._data.copyTo(destination, {
						planeIndex,
						frameOffset,
						frameCount: copyFrameCount,
						format: 'f32-planar',
					});
				} else {
					// Allocate temporary buffer for f32-planar data
					const tempBuffer = new ArrayBuffer(copyFrameCount * 4);
					const tempArray = new Float32Array(tempBuffer);
					this._data.copyTo(tempArray, {
						planeIndex,
						frameOffset,
						frameCount: copyFrameCount,
						format: 'f32-planar',
					});

					// Convert each f32 sample to destination format
					const tempView = new DataView(tempBuffer);
					for (let i = 0; i < copyFrameCount; i++) {
						const destOffset = i * destBytesPerSample;
						const sample = tempView.getFloat32(i * 4, true);
						writeFn(destView, destOffset, sample);
					}
				}
			} else {
				// Destination is interleaved.
				// Allocate a temporary Float32Array to hold one channel's worth of data.
				const numCh = numChannels;
				const temp = new Float32Array(copyFrameCount);
				for (let ch = 0; ch < numCh; ch++) {
					this._data.copyTo(temp, {
						planeIndex: ch,
						frameOffset,
						frameCount: copyFrameCount,
						format: 'f32-planar',
					});
					for (let i = 0; i < copyFrameCount; i++) {
						const destIndex = i * numCh + ch;
						const destOffset = destIndex * destBytesPerSample;
						writeFn(destView, destOffset, temp[i]!);
					}
				}
			}
		} else {
			// Branch for Uint8Array data (non-AudioData)
			const uint8Data = this._data;
			const srcView = new DataView(uint8Data.buffer, uint8Data.byteOffset, uint8Data.byteLength);

			const srcFormat = this.format;
			const readFn = getReadFunction(srcFormat);
			const srcBytesPerSample = getBytesPerSample(srcFormat);
			const srcIsPlanar = formatIsPlanar(srcFormat);

			for (let i = 0; i < copyFrameCount; i++) {
				if (destIsPlanar) {
					const destOffset = i * destBytesPerSample;
					let srcOffset: number;
					if (srcIsPlanar) {
						srcOffset = (planeIndex * numFrames + (i + frameOffset)) * srcBytesPerSample;
					} else {
						srcOffset = (((i + frameOffset) * numChannels) + planeIndex) * srcBytesPerSample;
					}

					const normalized = readFn(srcView, srcOffset);
					writeFn(destView, destOffset, normalized);
				} else {
					for (let ch = 0; ch < numChannels; ch++) {
						const destIndex = i * numChannels + ch;
						const destOffset = destIndex * destBytesPerSample;
						let srcOffset: number;
						if (srcIsPlanar) {
							srcOffset = (ch * numFrames + (i + frameOffset)) * srcBytesPerSample;
						} else {
							srcOffset = (((i + frameOffset) * numChannels) + ch) * srcBytesPerSample;
						}

						const normalized = readFn(srcView, srcOffset);
						writeFn(destView, destOffset, normalized);
					}
				}
			}
		}
	}

	clone(): AudioSample {
		if (this._closed) {
			throw new Error('AudioSample is closed.');
		}

		if (isAudioData(this._data)) {
			return new AudioSample(this._data.clone());
		} else {
			return new AudioSample({

				format: this.format,
				sampleRate: this.sampleRate,
				numberOfFrames: this.numberOfFrames,
				numberOfChannels: this.numberOfChannels,
				timestamp: this.timestamp,
				data: this._data,
			});
		}
	}

	close(): void {
		if (this._closed) {
			return;
		}

		if (isAudioData(this._data)) {
			this._data.close();
		} else {
			this._data = new Uint8Array(0);
		}

		this._closed = true;
	}

	toAudioData() {
		if (this._closed) {
			throw new Error('AudioSample is closed.');
		}

		if (isAudioData(this._data)) {
			if (this._data.timestamp === this.microsecondTimestamp) {
				// Timestamp matches, let's just return the data (but cloned)
				return this._data.clone();
			} else {
				// It's impossible to simply change an AudioData's timestamp, so we'll need to create a new one
				if (formatIsPlanar(this.format)) {
					const size = this.allocationSize({ planeIndex: 0, format: this.format });
					const data = new ArrayBuffer(size * this.numberOfChannels);

					// We gotta read out each plane individually
					for (let i = 0; i < this.numberOfChannels; i++) {
						this.copyTo(new Uint8Array(data, i * size, size), { planeIndex: i, format: this.format });
					}

					return new AudioData({

						format: this.format,
						sampleRate: this.sampleRate,
						numberOfFrames: this.numberOfFrames,
						numberOfChannels: this.numberOfChannels,
						timestamp: this.microsecondTimestamp,
						data,
					});
				} else {
					const data = new ArrayBuffer(this.allocationSize({ planeIndex: 0, format: this.format }));

					this.copyTo(new DataView(data), { planeIndex: 0, format: this.format });

					return new AudioData({

						format: this.format,
						sampleRate: this.sampleRate,
						numberOfFrames: this.numberOfFrames,
						numberOfChannels: this.numberOfChannels,
						timestamp: this.microsecondTimestamp,
						data,
					});
				}
			}
		} else {
			return new AudioData({

				format: this.format,
				sampleRate: this.sampleRate,
				numberOfFrames: this.numberOfFrames,
				numberOfChannels: this.numberOfChannels,
				timestamp: this.microsecondTimestamp,
				data: this._data,
			});
		}
	}

	toAudioBuffer() {
		if (this._closed) {
			throw new Error('AudioSample is closed.');
		}

		const audioBuffer = new AudioBuffer({
			numberOfChannels: this.numberOfChannels,
			length: this.numberOfFrames,
			sampleRate: this.sampleRate,
		});

		const dataBytes = new Float32Array(this.allocationSize({ planeIndex: 0, format: 'f32-planar' }) / 4);

		for (let i = 0; i < this.numberOfChannels; i++) {
			this.copyTo(dataBytes, { planeIndex: i, format: 'f32-planar' });
			audioBuffer.copyToChannel(dataBytes, i);
		}

		return audioBuffer;
	}

	setTimestamp(newTimestamp: number) {
		if (!Number.isFinite(newTimestamp)) {
			throw new TypeError('newTimestamp must be a number.');
		}

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		(this.timestamp as number) = newTimestamp;
	}
}

const getBytesPerSample = (format: AudioSampleFormat): number => {
	switch (format) {
		case 'u8':
		case 'u8-planar':
			return 1;
		case 's16':
		case 's16-planar':
			return 2;
		case 's32':
		case 's32-planar':
			return 4;
		case 'f32':
		case 'f32-planar':
			return 4;
		default:
			throw new Error('Unknown AudioSampleFormat');
	}
};

const formatIsPlanar = (format: AudioSampleFormat): boolean => {
	switch (format) {
		case 'u8-planar':
		case 's16-planar':
		case 's32-planar':
		case 'f32-planar':
			return true;
		default:
			return false;
	}
};

const getReadFunction = (format: AudioSampleFormat): (view: DataView, offset: number) => number => {
	switch (format) {
		case 'u8':
		case 'u8-planar':
			return (view, offset) => (view.getUint8(offset) - 128) / 128;
		case 's16':
		case 's16-planar':
			return (view, offset) => view.getInt16(offset, true) / 32768;
		case 's32':
		case 's32-planar':
			return (view, offset) => view.getInt32(offset, true) / 2147483648;
		case 'f32':
		case 'f32-planar':
			return (view, offset) => view.getFloat32(offset, true);
	}
};

const getWriteFunction = (format: AudioSampleFormat): (view: DataView, offset: number, value: number) => void => {
	switch (format) {
		case 'u8':
		case 'u8-planar':
			return (view, offset, value) =>
				view.setUint8(offset, clamp((value + 1) * 127.5, 0, 255));
		case 's16':
		case 's16-planar':
			return (view, offset, value) =>
				view.setInt16(offset, clamp(Math.round(value * 32767), -32768, 32767), true);
		case 's32':
		case 's32-planar':
			return (view, offset, value) =>
				view.setInt32(offset, clamp(Math.round(value * 2147483647), -2147483648, 2147483647), true);
		case 'f32':
		case 'f32-planar':
			return (view, offset, value) => view.setFloat32(offset, value, true);
	}
};

const isAudioData = (x: unknown): x is AudioData => {
	return typeof AudioData !== 'undefined' && x instanceof AudioData;
};
