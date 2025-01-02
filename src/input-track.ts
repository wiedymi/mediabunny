import { AudioCodec, MediaCodec, VideoCodec } from './codec';
import { ChunkRetrievalOptions } from './media-drain';
import { Rotation } from './misc';

export interface InputTrackBacking {
	getCodec(): Promise<MediaCodec | null>;
	computeDuration(): Promise<number>;
}

/** @public */
export abstract class InputTrack {
	/** @internal */
	_backing: InputTrackBacking;

	/** @internal */
	constructor(backing: InputTrackBacking) {
		this._backing = backing;
	}

	abstract getCodec(): Promise<MediaCodec | null>;
	abstract getCodecMimeType(): Promise<string | null>;
	abstract canDecode(): Promise<boolean>;

	isVideoTrack(): this is InputVideoTrack {
		return this instanceof InputVideoTrack;
	}

	isAudioTrack(): this is InputAudioTrack {
		return this instanceof InputAudioTrack;
	}

	computeDuration() {
		return this._backing.computeDuration();
	}
}

export interface InputVideoTrackBacking extends InputTrackBacking {
	getCodec(): Promise<VideoCodec | null>;
	getCodedWidth(): Promise<number>;
	getCodedHeight(): Promise<number>;
	getRotation(): Promise<Rotation>;
	getDecoderConfig(): Promise<VideoDecoderConfig | null>;
	getFirstChunk(options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
	getChunk(timestamp: number, options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
	getNextChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
	getNextKeyChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
}

/** @public */
export class InputVideoTrack extends InputTrack {
	/** @internal */
	override _backing: InputVideoTrackBacking;

	/** @internal */
	constructor(backing: InputVideoTrackBacking) {
		super(backing);

		this._backing = backing;
	}

	getCodec(): Promise<VideoCodec | null> {
		return this._backing.getCodec();
	}

	getCodedWidth() {
		return this._backing.getCodedWidth();
	}

	getCodedHeight() {
		return this._backing.getCodedHeight();
	}

	getRotation() {
		return this._backing.getRotation();
	}

	async getDisplayWidth() {
		const rotation = await this._backing.getRotation();
		return rotation % 180 === 0 ? this._backing.getCodedWidth() : this._backing.getCodedHeight();
	}

	async getDisplayHeight() {
		const rotation = await this._backing.getRotation();
		return rotation % 180 === 0 ? this._backing.getCodedHeight() : this._backing.getCodedWidth();
	}

	getDecoderConfig() {
		return this._backing.getDecoderConfig();
	}

	async getCodecMimeType() {
		const decoderConfig = await this.getDecoderConfig();
		return decoderConfig?.codec ?? null;
	}

	async canDecode() {
		try {
			const decoderConfig = await this._backing.getDecoderConfig();
			if (!decoderConfig) {
				return false;
			}

			const support = await VideoDecoder.isConfigSupported(decoderConfig);
			return support.supported === true;
		} catch (error) {
			console.error('Error during decodability check:', error);
			return false;
		}
	}
}

export interface InputAudioTrackBacking extends InputTrackBacking {
	getCodec(): Promise<AudioCodec | null>;
	getNumberOfChannels(): Promise<number>;
	getSampleRate(): Promise<number>;
	getDecoderConfig(): Promise<AudioDecoderConfig | null>;
	getFirstChunk(options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
	getChunk(timestamp: number, options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
	getNextChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
	getNextKeyChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
}

/** @public */
export class InputAudioTrack extends InputTrack {
	/** @internal */
	override _backing: InputAudioTrackBacking;

	/** @internal */
	constructor(backing: InputAudioTrackBacking) {
		super(backing);

		this._backing = backing;
	}

	getCodec(): Promise<AudioCodec | null> {
		return this._backing.getCodec();
	}

	getNumberOfChannels() {
		return this._backing.getNumberOfChannels();
	}

	getSampleRate() {
		return this._backing.getSampleRate();
	}

	getDecoderConfig() {
		return this._backing.getDecoderConfig();
	}

	async getCodecMimeType() {
		const decoderConfig = await this.getDecoderConfig();
		return decoderConfig?.codec ?? null;
	}

	async canDecode() {
		try {
			const decoderConfig = await this._backing.getDecoderConfig();
			if (!decoderConfig) {
				return false;
			}

			if (decoderConfig.codec.startsWith('pcm-')) {
				return true; // Since we decode it ourselves
			} else {
				const support = await AudioDecoder.isConfigSupported(decoderConfig);
				return support.supported === true;
			}
		} catch (error) {
			console.error('Error during decodability check:', error);
			return false;
		}
	}
}
