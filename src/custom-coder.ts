import { AudioCodec, VideoCodec } from './codec';
import { EncodedPacket } from './packet';
import { AudioSample, VideoSample } from './sample';

/** @public */
export abstract class CustomVideoDecoder {
	codec!: VideoCodec;
	config!: VideoDecoderConfig;
	onSample!: (sample: VideoSample) => unknown;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	static supports(codec: VideoCodec, config: VideoDecoderConfig): boolean {
		return false;
	}

	abstract init(): void;
	abstract decode(packet: EncodedPacket): Promise<void> | void;
	abstract flush(): Promise<void> | void;
	abstract close(): Promise<void> | void;
}

/** @public */
export abstract class CustomAudioDecoder {
	codec!: AudioCodec;
	config!: AudioDecoderConfig;
	onSample!: (sample: AudioSample) => unknown;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	static supports(codec: AudioCodec, config: AudioDecoderConfig): boolean {
		return false;
	}

	abstract init(): void;
	abstract decode(packet: EncodedPacket): Promise<void> | void;
	abstract flush(): Promise<void> | void;
	abstract close(): Promise<void> | void;
}

/** @public */
export abstract class CustomVideoEncoder {
	codec!: VideoCodec;
	config!: VideoEncoderConfig;
	onPacket!: (packet: EncodedPacket, meta?: EncodedVideoChunkMetadata) => unknown;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	static supports(codec: VideoCodec, config: VideoEncoderConfig): boolean {
		return false;
	}

	abstract init(): void;
	abstract encode(videoSample: VideoSample, options: VideoEncoderEncodeOptions): Promise<void> | void;
	abstract flush(): Promise<void> | void;
	abstract close(): Promise<void> | void;
}

/** @public */
export abstract class CustomAudioEncoder {
	codec!: AudioCodec;
	config!: AudioEncoderConfig;
	onPacket!: (packet: EncodedPacket, meta?: EncodedAudioChunkMetadata) => unknown;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	static supports(codec: AudioCodec, config: AudioEncoderConfig): boolean {
		return false;
	}

	abstract init(): void;
	abstract encode(audioSample: AudioSample): Promise<void> | void;
	abstract flush(): Promise<void> | void;
	abstract close(): Promise<void> | void;
}

export const customVideoDecoders: typeof CustomVideoDecoder[] = [];
export const customAudioDecoders: typeof CustomAudioDecoder[] = [];
export const customVideoEncoders: typeof CustomVideoEncoder[] = [];
export const customAudioEncoders: typeof CustomAudioEncoder[] = [];

/** @public */
export const registerDecoder = (decoder: typeof CustomVideoDecoder | typeof CustomAudioDecoder) => {
	if (decoder.prototype instanceof CustomVideoDecoder) {
		customVideoDecoders.push(decoder as typeof CustomVideoDecoder);
	} else if (decoder.prototype instanceof CustomAudioDecoder) {
		customAudioDecoders.push(decoder as typeof CustomAudioDecoder);
	} else {
		throw new TypeError('Decoder must be a CustomVideoDecoder or CustomAudioDecoder.');
	}
};

/** @public */
export const registerEncoder = (encoder: typeof CustomVideoEncoder | typeof CustomAudioEncoder) => {
	if (encoder.prototype instanceof CustomVideoEncoder) {
		customVideoEncoders.push(encoder as	typeof CustomVideoEncoder);
	} else if (encoder.prototype instanceof CustomAudioEncoder) {
		customAudioEncoders.push(encoder as typeof CustomAudioEncoder);
	} else {
		throw new TypeError('Encoder must be a CustomVideoEncoder or CustomAudioEncoder.');
	}
};
