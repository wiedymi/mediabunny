import { AudioCodec, MediaCodec, VideoCodec } from './codec';
import { Rotation } from './misc';

export interface InputTrackBacking {
	getCodec(): Promise<MediaCodec>;
	computeDuration(): Promise<number>;
}

export abstract class InputTrack {
	/** @internal */
	_backing: InputTrackBacking;

	/** @internal */
	constructor(backing: InputTrackBacking) {
		this._backing = backing;
	}

	abstract getCodec(): Promise<MediaCodec>;
	abstract getCodecMimeType(): Promise<string>;

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

export type ChunkRetrievalOptions = {
	metadataOnly?: boolean;
};

export interface InputVideoTrackBacking extends InputTrackBacking {
	getCodec(): Promise<VideoCodec>;
	getWidth(): Promise<number>;
	getHeight(): Promise<number>;
	getRotation(): Promise<Rotation>;
	getDecoderConfig(): Promise<VideoDecoderConfig>;
	getFirstChunk(options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
	getChunk(timestamp: number, options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
	getNextChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
	getNextKeyChunk(chunk: EncodedVideoChunk, options: ChunkRetrievalOptions): Promise<EncodedVideoChunk | null>;
}

export class InputVideoTrack extends InputTrack {
	/** @internal */
	override _backing: InputVideoTrackBacking;

	/** @internal */
	constructor(backing: InputVideoTrackBacking) {
		super(backing);

		this._backing = backing;
	}

	getCodec() {
		return this._backing.getCodec();
	}

	getWidth() {
		return this._backing.getWidth();
	}

	getHeight() {
		return this._backing.getHeight();
	}

	getRotation() {
		return this._backing.getRotation();
	}

	getDecoderConfig() {
		return this._backing.getDecoderConfig();
	}

	async getCodecMimeType() {
		const decoderConfig = await this.getDecoderConfig();
		return decoderConfig.codec;
	}
}

export interface InputAudioTrackBacking extends InputTrackBacking {
	getCodec(): Promise<AudioCodec>;
	getNumberOfChannels(): Promise<number>;
	getSampleRate(): Promise<number>;
	getDecoderConfig(): Promise<AudioDecoderConfig>;
	getFirstChunk(options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
	getChunk(timestamp: number, options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
	getNextChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
	getKeyChunk(timestamp: number, options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
	getNextKeyChunk(chunk: EncodedAudioChunk, options: ChunkRetrievalOptions): Promise<EncodedAudioChunk | null>;
}

export class InputAudioTrack extends InputTrack {
	/** @internal */
	override _backing: InputAudioTrackBacking;

	/** @internal */
	constructor(backing: InputAudioTrackBacking) {
		super(backing);

		this._backing = backing;
	}

	getCodec() {
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
		return decoderConfig.codec;
	}
}
