export const PLACEHOLDER_DATA = new Uint8Array(0);

/** @public */
export type SampleType = 'key' | 'delta';

/** @public */
export class EncodedVideoSample {
	constructor(
		public readonly data: Uint8Array,
		public readonly type: SampleType,
		public readonly timestamp: number,
		public readonly duration: number,
		public readonly sequenceNumber = -1,
		public readonly byteLength = data.byteLength,
	) {
		if (!(data instanceof Uint8Array)) {
			throw new TypeError('data must be a Uint8Array.');
		}
		if (type !== 'key' && type !== 'delta') {
			throw new TypeError('type must be either "key" or "delta".');
		}
		if (!Number.isFinite(timestamp)) {
			throw new TypeError('timestamp must be a number.');
		}
		if (!Number.isFinite(duration) || duration < 0) {
			throw new TypeError('duration must be a non-negative number.');
		}
		if (!Number.isInteger(byteLength) || byteLength < 0) {
			throw new TypeError('byteLength must be a non-negative integer.');
		}
	}

	get isMetadataOnly() {
		return this.data === PLACEHOLDER_DATA;
	}

	get microsecondTimestamp() {
		return Math.floor(1e6 * this.timestamp);
	}

	get microsecondDuration() {
		return Math.floor(1e6 * this.duration);
	}

	toEncodedVideoChunk() {
		if (this.isMetadataOnly) {
			throw new TypeError('Metadata-only samples cannot be converted to a chunk.');
		}

		if (typeof EncodedVideoChunk === 'undefined') {
			throw new Error('Your browser does not support EncodedVideoChunk.');
		}

		return new EncodedVideoChunk({
			data: this.data,
			type: this.type,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration,
		});
	}

	clone(options?: {
		timestamp?: number;
		duration?: number;
	}) {
		if (options !== undefined && (!options || typeof options !== 'object')) {
			throw new TypeError('options, when provided, must be an object.');
		}
		if (options?.timestamp !== undefined && !Number.isFinite(options.timestamp)) {
			throw new TypeError('options.timestamp, when provided, must be a number.');
		}
		if (options?.duration !== undefined && !Number.isFinite(options.duration)) {
			throw new TypeError('options.duration, when provided, must be a number.');
		}

		return new EncodedVideoSample(
			this.data,
			this.type,
			options?.timestamp ?? this.timestamp,
			options?.duration ?? this.duration,
			this.byteLength,
		);
	}

	static fromEncodedVideoChunk(chunk: EncodedVideoChunk) {
		if (!(chunk instanceof EncodedVideoChunk)) {
			throw new TypeError('chunk must be an EncodedVideoChunk.');
		}

		const data = new Uint8Array(chunk.byteLength);
		chunk.copyTo(data);

		return new EncodedVideoSample(
			data,
			chunk.type,
			chunk.timestamp / 1e6,
			(chunk.duration ?? 0) / 1e6,
		);
	}
}

/** @public */
export class EncodedAudioSample {
	constructor(
		public readonly data: Uint8Array,
		public readonly type: SampleType,
		public readonly timestamp: number,
		public readonly duration: number,
		public readonly sequenceNumber = -1,
		public readonly byteLength = data.byteLength,
	) {
		if (!(data instanceof Uint8Array)) {
			throw new TypeError('data must be a Uint8Array.');
		}
		if (type !== 'key' && type !== 'delta') {
			throw new TypeError('type must be either "key" or "delta".');
		}
		if (!Number.isFinite(timestamp)) {
			throw new TypeError('timestamp must be a number.');
		}
		if (!Number.isFinite(duration) || duration < 0) {
			throw new TypeError('duration must be a non-negative number.');
		}
		if (!Number.isInteger(byteLength) || byteLength < 0) {
			throw new TypeError('byteLength must be a non-negative integer.');
		}
	}

	get isMetadataOnly() {
		return this.data === PLACEHOLDER_DATA;
	}

	get microsecondTimestamp() {
		return Math.floor(1e6 * this.timestamp);
	}

	get microsecondDuration() {
		return Math.floor(1e6 * this.duration);
	}

	toEncodedAudioChunk() {
		if (this.isMetadataOnly) {
			throw new TypeError('Metadata-only samples cannot be converted to a chunk.');
		}

		if (typeof EncodedAudioChunk === 'undefined') {
			throw new Error('Your browser does not support EncodedAudioChunk.');
		}

		return new EncodedAudioChunk({
			data: this.data,
			type: this.type,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration,
		});
	}

	clone(options?: {
		timestamp?: number;
		duration?: number;
	}) {
		if (options !== undefined && (!options || typeof options !== 'object')) {
			throw new TypeError('options, when provided, must be an object.');
		}
		if (options?.timestamp !== undefined && !Number.isFinite(options.timestamp)) {
			throw new TypeError('options.timestamp, when provided, must be a number.');
		}
		if (options?.duration !== undefined && !Number.isFinite(options.duration)) {
			throw new TypeError('options.duration, when provided, must be a number.');
		}

		return new EncodedAudioSample(
			this.data,
			this.type,
			options?.timestamp ?? this.timestamp,
			options?.duration ?? this.duration,
			this.byteLength,
		);
	}

	static fromEncodedAudioChunk(chunk: EncodedAudioChunk) {
		if (!(chunk instanceof EncodedAudioChunk)) {
			throw new TypeError('chunk must be an EncodedAudioChunk.');
		}

		const data = new Uint8Array(chunk.byteLength);
		chunk.copyTo(data);

		return new EncodedAudioSample(
			data,
			chunk.type as SampleType, // Typing is weird
			chunk.timestamp / 1e6,
			(chunk.duration ?? 0) / 1e6,
		);
	}
}
