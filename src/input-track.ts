import { AudioCodec, MediaCodec, VideoCodec } from './codec';

export interface InputTrackBacking {
	getCodec(): Promise<MediaCodec>;
	getDuration(): Promise<number>;
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

	getDuration() {
		return this._backing.getDuration();
	}
}

export interface InputVideoTrackBacking extends InputTrackBacking {
	getCodec(): Promise<VideoCodec>;
	getWidth(): Promise<number>;
	getHeight(): Promise<number>;
	getRotation(): Promise<number>;
	getDecoderConfig(): Promise<VideoDecoderConfig>;
	getFirstChunk(): Promise<EncodedVideoChunk | null>;
	getChunk(timestamp: number): Promise<EncodedVideoChunk | null>;
	getNextChunk(chunk: EncodedVideoChunk): Promise<EncodedVideoChunk | null>;
	getKeyChunk(timestamp: number): Promise<EncodedVideoChunk | null>;
	getNextKeyChunk(chunk: EncodedVideoChunk): Promise<EncodedVideoChunk | null>;
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
