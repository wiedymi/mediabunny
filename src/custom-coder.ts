import { AudioCodec, VideoCodec } from './codec';
import { EncodedAudioSample, EncodedVideoSample } from './sample';

/** @public */
export class CustomVideoDecoder {
	constructor(
		public codec: VideoCodec,
		public config: VideoDecoderConfig,
		public onFrame: (frame: VideoFrame) => unknown,
	) {}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	static supports(codec: VideoCodec, config: VideoDecoderConfig): boolean {
		return false;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	decode(sample: EncodedVideoSample): Promise<void> | void {}
	flush(): Promise<void> | void {}
}

/** @public */
export class CustomAudioDecoder {
	constructor(
		public codec: AudioCodec,
		public config: AudioDecoderConfig,
		public onData: (data: AudioData) => unknown,
	) {}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	static supports(codec: AudioCodec, config: AudioDecoderConfig): boolean {
		return false;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	decode(sample: EncodedAudioSample): Promise<void> | void {}
	flush(): Promise<void> | void {}
}

/** @public */
export class CustomVideoEncoder {
	constructor(
		public codec: VideoCodec,
		public config: VideoEncoderConfig,
		public onSample: (sample: EncodedVideoSample, meta?: EncodedVideoChunkMetadata) => unknown,
	) {}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	static supports(codec: VideoCodec, config: VideoEncoderConfig): boolean {
		return false;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	encode(videoFrame: VideoFrame, options: VideoEncoderEncodeOptions): Promise<void> | void {}
	flush(): Promise<void> | void {}
}

/** @public */
export class CustomAudioEncoder {
	constructor(
		public codec: AudioCodec,
		public config: AudioEncoderConfig,
		public onSample: (sample: EncodedAudioSample, meta?: EncodedAudioChunkMetadata) => unknown,
	) {}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	static supports(codec: AudioCodec, config: AudioEncoderConfig): boolean {
		return false;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	encode(audioData: AudioData): Promise<void> | void {}
	flush(): Promise<void> | void {}
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
