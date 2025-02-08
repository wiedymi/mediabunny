import { AudioCodec, MediaCodec, VideoCodec } from './codec';
import { customAudioDecoders, customVideoDecoders } from './custom-coder';
import { EncodedAudioSampleSink, EncodedVideoSampleSink, SampleRetrievalOptions } from './media-sink';
import { assert, Rotation } from './misc';
import { TrackType } from './output';
import { EncodedAudioSample, EncodedVideoSample } from './sample';

export interface InputTrackBacking {
	getId(): number;
	getCodec(): MediaCodec | null;
	getLanguageCode(): string;
	getTimeResolution(): number;
	getFirstTimestamp(): Promise<number>;
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

	abstract get type(): TrackType;
	abstract get codec(): MediaCodec | null;
	abstract getCodecMimeType(): Promise<string | null>;
	abstract canDecode(): Promise<boolean>;
	abstract computeSampleStats(): Promise<SampleStats>;

	isVideoTrack(): this is InputVideoTrack {
		return this instanceof InputVideoTrack;
	}

	isAudioTrack(): this is InputAudioTrack {
		return this instanceof InputAudioTrack;
	}

	get id() {
		return this._backing.getId();
	}

	get languageCode() {
		return this._backing.getLanguageCode();
	}

	get timeResolution() {
		return this._backing.getTimeResolution();
	}

	getFirstTimestamp() {
		return this._backing.getFirstTimestamp();
	}

	computeDuration() {
		return this._backing.computeDuration();
	}
}

export interface InputVideoTrackBacking extends InputTrackBacking {
	getCodec(): VideoCodec | null;
	getCodedWidth(): number;
	getCodedHeight(): number;
	getRotation(): Rotation;
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

	get type(): TrackType {
		return 'video';
	}

	get codec() {
		return this._backing.getCodec();
	}

	get codedWidth() {
		return this._backing.getCodedWidth();
	}

	get codedHeight() {
		return this._backing.getCodedHeight();
	}

	get rotation() {
		return this._backing.getRotation();
	}

	get displayWidth() {
		const rotation = this._backing.getRotation();
		return rotation % 180 === 0 ? this._backing.getCodedWidth() : this._backing.getCodedHeight();
	}

	get displayHeight() {
		const rotation = this._backing.getRotation();
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
		const decoderConfig = await this._backing.getDecoderConfig();
		return decoderConfig?.codec ?? null;
	}

	async canDecode() {
		try {
			const decoderConfig = await this._backing.getDecoderConfig();
			if (!decoderConfig) {
				return false;
			}

			const codec = this._backing.getCodec();
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
	getCodec(): AudioCodec | null;
	getNumberOfChannels(): number;
	getSampleRate(): number;
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

	get type(): TrackType {
		return 'audio';
	}

	get codec(): AudioCodec | null {
		return this._backing.getCodec();
	}

	get numberOfChannels() {
		return this._backing.getNumberOfChannels();
	}

	get sampleRate() {
		return this._backing.getSampleRate();
	}

	getDecoderConfig() {
		return this._backing.getDecoderConfig();
	}

	async getCodecMimeType() {
		const decoderConfig = await this._backing.getDecoderConfig();
		return decoderConfig?.codec ?? null;
	}

	async canDecode() {
		try {
			const decoderConfig = await this._backing.getDecoderConfig();
			if (!decoderConfig) {
				return false;
			}

			const codec = this._backing.getCodec();
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
