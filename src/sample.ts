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
		public readonly byteLength = data.byteLength,
	) {}

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
}

/** @public */
export class EncodedAudioSample {
	constructor(
		public readonly data: Uint8Array,
		public readonly type: SampleType,
		public readonly timestamp: number,
		public readonly duration: number,
		public readonly byteLength = data.byteLength,
	) {}

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
}
