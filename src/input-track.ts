import { AudioCodec, MediaCodec, VideoCodec } from './codec';
import { customAudioDecoders, customVideoDecoders } from './custom-coder';
import { EncodedAudioSampleSink, EncodedVideoSampleSink, SampleRetrievalOptions } from './media-sink';
import { assert, Rotation } from './misc';
import { TrackType } from './output';
import { EncodedAudioSample, EncodedVideoSample } from './sample';

export interface InputTrackBacking {
	getId(): number;
	getCodec(): Promise<MediaCodec | null>;
	getFirstTimestamp(): Promise<number>;
	computeDuration(): Promise<number>;
	getLanguageCode(): Promise<string>;
}

/** @public */
export abstract class InputTrack {
	/** @internal */
	_backing: InputTrackBacking;

	/** @internal */
	constructor(backing: InputTrackBacking) {
		this._backing = backing;
	}

	abstract getType(): TrackType;
	abstract getCodec(): Promise<MediaCodec | null>;
	abstract getCodecMimeType(): Promise<string | null>;
	abstract canDecode(): Promise<boolean>;
	abstract computeSampleStats(): Promise<SampleStats>;

	isVideoTrack(): this is InputVideoTrack {
		return this instanceof InputVideoTrack;
	}

	isAudioTrack(): this is InputAudioTrack {
		return this instanceof InputAudioTrack;
	}

	getId() {
		return this._backing.getId();
	}

	getFirstTimestamp() {
		return this._backing.getFirstTimestamp();
	}

	computeDuration() {
		return this._backing.computeDuration();
	}

	getLanguageCode() {
		return this._backing.getLanguageCode();
	}
}

export interface InputVideoTrackBacking extends InputTrackBacking {
	getCodec(): Promise<VideoCodec | null>;
	getCodedWidth(): Promise<number>;
	getCodedHeight(): Promise<number>;
	getRotation(): Promise<Rotation>;
	getColorSpace(): Promise<VideoColorSpaceInit>;
	getDecoderConfig(): Promise<VideoDecoderConfig | null>;
	getFirstSample(options: SampleRetrievalOptions): Promise<EncodedVideoSample | null>;
	getSample(timestamp: number, options: SampleRetrievalOptions): Promise<EncodedVideoSample | null>;
	getNextSample(sample: EncodedVideoSample, options: SampleRetrievalOptions): Promise<EncodedVideoSample | null>;
	getKeySample(timestamp: number, options: SampleRetrievalOptions): Promise<EncodedVideoSample | null>;
	getNextKeySample(sample: EncodedVideoSample, options: SampleRetrievalOptions): Promise<EncodedVideoSample | null>;
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

	getType(): TrackType {
		return 'video';
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

	getColorSpace() {
		return this._backing.getColorSpace();
	}

	async hasHighDynamicRange() {
		const colorSpace = await this._backing.getColorSpace();

		return (colorSpace.primaries as string) === 'bt2020' || (colorSpace.primaries as string) === 'smpte432'
			|| (colorSpace.transfer as string) === 'pg' || (colorSpace.transfer as string) === 'hlg'
			|| (colorSpace.matrix as string) === 'bt2020-ncl';
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

			const codec = await this.getCodec();
			assert(codec !== null);

			if (customVideoDecoders.some(x => x.supports(codec, decoderConfig))) {
				return true;
			}

			if (typeof VideoDecoder === 'undefined') {
				return false;
			}

			const support = await VideoDecoder.isConfigSupported(decoderConfig);
			return support.supported === true;
		} catch (error) {
			console.error('Error during decodability check:', error);
			return false;
		}
	}

	computeSampleStats() {
		return computeSampleStats(new EncodedVideoSampleSink(this));
	}
}

export interface InputAudioTrackBacking extends InputTrackBacking {
	getCodec(): Promise<AudioCodec | null>;
	getNumberOfChannels(): Promise<number>;
	getSampleRate(): Promise<number>;
	getDecoderConfig(): Promise<AudioDecoderConfig | null>;
	getFirstSample(options: SampleRetrievalOptions): Promise<EncodedAudioSample | null>;
	getSample(timestamp: number, options: SampleRetrievalOptions): Promise<EncodedAudioSample | null>;
	getNextSample(sample: EncodedAudioSample, options: SampleRetrievalOptions): Promise<EncodedAudioSample | null>;
	getKeySample(timestamp: number, options: SampleRetrievalOptions): Promise<EncodedAudioSample | null>;
	getNextKeySample(sample: EncodedAudioSample, options: SampleRetrievalOptions): Promise<EncodedAudioSample | null>;
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

	getType(): TrackType {
		return 'audio';
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

			const codec = await this.getCodec();
			assert(codec !== null);

			if (customAudioDecoders.some(x => x.supports(codec, decoderConfig))) {
				return true;
			}

			if (decoderConfig.codec.startsWith('pcm-')) {
				return true; // Since we decode it ourselves
			} else {
				if (typeof AudioDecoder === 'undefined') {
					return false;
				}

				const support = await AudioDecoder.isConfigSupported(decoderConfig);
				return support.supported === true;
			}
		} catch (error) {
			console.error('Error during decodability check:', error);
			return false;
		}
	}

	computeSampleStats() {
		return computeSampleStats(new EncodedAudioSampleSink(this));
	}
}

/** @public */
export type SampleStats = {
	sampleCount: number;
	averageSampleRate: number;
	averageBitrate: number;
};

const computeSampleStats = async (sink: EncodedVideoSampleSink | EncodedAudioSampleSink): Promise<SampleStats> => {
	let startTimestamp = Infinity;
	let endTimestamp = -Infinity;
	let sampleCount = 0;
	let totalSampleBytes = 0;

	for await (const sample of sink.samples(undefined, undefined, { metadataOnly: true })) {
		startTimestamp = Math.min(startTimestamp, sample.timestamp);
		endTimestamp = Math.max(endTimestamp, sample.timestamp + sample.duration);

		sampleCount++;
		totalSampleBytes += sample.byteLength;
	}

	return {
		sampleCount,
		averageSampleRate: sampleCount
			? Number((sampleCount / (endTimestamp - startTimestamp)).toPrecision(16))
			: 0,
		averageBitrate: sampleCount
			? Number((8 * totalSampleBytes / (endTimestamp - startTimestamp)).toPrecision(16))
			: 0,
	};
};
