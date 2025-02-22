import { SECOND_TO_MICROSECOND_FACTOR } from './misc';

export const PLACEHOLDER_DATA = new Uint8Array(0);

export type PacketType = 'key' | 'delta';

export class EncodedPacket {
	constructor(
		public readonly data: Uint8Array,
		public readonly type: PacketType,
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
		if (!Number.isFinite(sequenceNumber)) {
			throw new TypeError('sequenceNumber must be a number.');
		}
		if (!Number.isInteger(byteLength) || byteLength < 0) {
			throw new TypeError('byteLength must be a non-negative integer.');
		}
	}

	get isMetadataOnly() {
		return this.data === PLACEHOLDER_DATA;
	}

	get microsecondTimestamp() {
		return Math.floor(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
	}

	get microsecondDuration() {
		return Math.floor(SECOND_TO_MICROSECOND_FACTOR * this.duration);
	}

	toEncodedVideoChunk() {
		if (this.isMetadataOnly) {
			throw new TypeError('Metadata-only packets cannot be converted to a video chunk.');
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

	toEncodedAudioChunk() {
		if (this.isMetadataOnly) {
			throw new TypeError('Metadata-only packets cannot be converted to an audio chunk.');
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

	static fromEncodedChunk(chunk: EncodedVideoChunk | EncodedAudioChunk): EncodedPacket {
		if (!(chunk instanceof EncodedVideoChunk || chunk instanceof EncodedAudioChunk)) {
			throw new TypeError('chunk must be an EncodedVideoChunk or EncodedAudioChunk.');
		}

		const data = new Uint8Array(chunk.byteLength);
		chunk.copyTo(data);

		return new EncodedPacket(
			data,
			chunk.type as PacketType,
			chunk.timestamp / 1e6,
			(chunk.duration ?? 0) / 1e6,
		);
	}

	clone(options?: { timestamp?: number; duration?: number }): EncodedPacket {
		if (options !== undefined && (typeof options !== 'object' || options === null)) {
			throw new TypeError('options, when provided, must be an object.');
		}
		if (options?.timestamp !== undefined && !Number.isFinite(options.timestamp)) {
			throw new TypeError('options.timestamp, when provided, must be a number.');
		}
		if (options?.duration !== undefined && !Number.isFinite(options.duration)) {
			throw new TypeError('options.duration, when provided, must be a number.');
		}

		return new EncodedPacket(
			this.data,
			this.type,
			options?.timestamp ?? this.timestamp,
			options?.duration ?? this.duration,
			this.sequenceNumber,
			this.byteLength,
		);
	}
}
