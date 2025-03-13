import {
	AUDIO_CODECS,
	AudioCodec,
	getEncodableAudioCodecs,
	getEncodableVideoCodecs,
	NON_PCM_AUDIO_CODECS,
	Quality,
	QUALITY_HIGH,
	VIDEO_CODECS,
	VideoCodec,
} from './codec';
import { Input } from './input';
import { InputAudioTrack, InputTrack, InputVideoTrack } from './input-track';
import {
	AudioBufferSink,
	AudioSampleSink,
	CanvasSink,
	EncodedPacketSink,
	VideoSampleSink,
} from './media-sink';
import {
	AudioBufferSource,
	AudioEncodingConfig,
	AudioSource,
	EncodedVideoPacketSource,
	EncodedAudioPacketSource,
	VideoEncodingConfig,
	VideoSource,
	VideoSampleSource,
	AudioSampleSource,
} from './media-source';
import { assert, clamp, normalizeRotation, promiseWithResolvers, Rotation } from './misc';
import { Output, TrackType } from './output';
import { VideoSample } from './sample';

/** @public */
export type ConversionOptions = {
	input: Input;
	output: Output;

	video?: {
		discard?: boolean;
		codec?: VideoCodec;
		bitrate?: VideoEncodingConfig['bitrate'];
		width?: number;
		height?: number;
		fit?: 'fill' | 'contain' | 'cover';
		rotate?: Rotation;
		forceReencode?: boolean;
	};

	audio?: {
		discard?: boolean;
		codec?: AudioCodec;
		bitrate?: AudioEncodingConfig['bitrate'];
		numberOfChannels?: number;
		sampleRate?: number;
		forceReencode?: boolean;
	};

	trim?: {
		start: number;
		end: number;
	};

	computeProgress?: boolean;
};

const FALLBACK_NUMBER_OF_CHANNELS = 2;
const FALLBACK_SAMPLE_RATE = 48000;

/** @public */
export const convert = async (options: ConversionOptions) => {
	const conversion = await Conversion.init(options);
	await conversion.execute();
	return conversion;
};

/** @public */
export class Conversion {
	/** @internal */
	_options: ConversionOptions;
	/** @internal */
	_input: Input;
	/** @internal */
	_output: Output;
	/** @internal */
	_startTimestamp: number;
	/** @internal */
	_endTimestamp: number;

	/** @internal */
	_addedCounts: Record<TrackType, number> = {
		video: 0,
		audio: 0,
		subtitle: 0,
	};

	/** @internal */
	_totalTrackCount = 0;

	/** @internal */
	_trackPromises: Promise<void>[] = [];

	/** @internal */
	_started: Promise<void>;
	/** @internal */
	_start: () => void;
	/** @internal */
	_executed = false;

	/** @internal */
	_synchronizer = new TrackSynchronizer();

	/** @internal */
	_totalDuration: number | null = null;
	/** @internal */
	_maxTimestamps = new Map<number, number>(); // Track ID -> timestamp

	/** @internal */
	_canceled = false;

	progress = 0;
	onProgress?: () => unknown = undefined;
	utilizedTracks: InputTrack[] = [];
	discardedTracks: {
		track: InputTrack;
		reason:
			| 'discardedByUser'
			| 'maxTrackCountReached'
			| 'maxTrackCountOfTypeReached'
			| 'unknownSourceCodec'
			| 'undecodableSourceCodec'
			| 'noEncodableTargetCodec';
	}[] = [];

	static async init(options: ConversionOptions) {
		const conversion = new Conversion(options);
		await conversion._init();

		return conversion;
	}

	private constructor(options: ConversionOptions) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (!(options.input instanceof Input)) {
			throw new TypeError('options.input must be an Input.');
		}
		if (!(options.output instanceof Output)) {
			throw new TypeError('options.output must be an Output.');
		}
		if (options.video !== undefined && (!options.video || typeof options.video !== 'object')) {
			throw new TypeError('options.video, when provided, must be an object.');
		}
		if (options.video?.discard !== undefined && typeof options.video.discard !== 'boolean') {
			throw new TypeError('options.video.discard, when provided, must be a boolean.');
		}
		if (options.video?.forceReencode !== undefined && typeof options.video.forceReencode !== 'boolean') {
			throw new TypeError('options.video.forceReencode, when provided, must be a boolean.');
		}
		if (options.video?.codec !== undefined && !VIDEO_CODECS.includes(options.video.codec)) {
			throw new TypeError(
				`options.video.codec, when provided, must be one of: ${VIDEO_CODECS.join(', ')}.`,
			);
		}
		if (
			options.video?.bitrate !== undefined
			&& !(options.video.bitrate instanceof Quality)
			&& (!Number.isInteger(options.video.bitrate) || options.video.bitrate <= 0)
		) {
			throw new TypeError('options.video.bitrate, when provided, must be a positive integer or a quality.');
		}
		if (
			options.video?.width !== undefined
			&& (!Number.isInteger(options.video.width) || options.video.width <= 0)
		) {
			throw new TypeError('options.video.width, when provided, must be a positive integer.');
		}
		if (
			options.video?.height !== undefined
			&& (!Number.isInteger(options.video.height) || options.video.height <= 0)
		) {
			throw new TypeError('options.video.height, when provided, must be a positive integer.');
		}
		if (options.video?.fit !== undefined && !['fill', 'contain', 'cover'].includes(options.video.fit)) {
			throw new TypeError('options.video.fit, when provided, must be one of "fill", "contain", or "cover".');
		}
		if (
			options.video?.width !== undefined
			&& options.video.height !== undefined
			&& options.video.fit === undefined
		) {
			throw new TypeError(
				'When both options.video.width and options.video.height are provided, options.video.fit must also be'
				+ ' provided.',
			);
		}
		if (options.video?.rotate !== undefined && ![0, 90, 180, 270].includes(options.video.rotate)) {
			throw new TypeError('options.video.rotate, when provided, must be 0, 90, 180 or 270.');
		}
		if (options.audio !== undefined && (!options.audio || typeof options.audio !== 'object')) {
			throw new TypeError('options.video, when provided, must be an object.');
		}
		if (options.audio?.discard !== undefined && typeof options.audio.discard !== 'boolean') {
			throw new TypeError('options.audio.discard, when provided, must be a boolean.');
		}
		if (options.audio?.forceReencode !== undefined && typeof options.audio.forceReencode !== 'boolean') {
			throw new TypeError('options.audio.forceReencode, when provided, must be a boolean.');
		}
		if (options.audio?.codec !== undefined && !AUDIO_CODECS.includes(options.audio.codec)) {
			throw new TypeError(
				`options.audio.codec, when provided, must be one of: ${AUDIO_CODECS.join(', ')}.`,
			);
		}
		if (
			options.audio?.bitrate !== undefined
			&& !(options.audio.bitrate instanceof Quality)
			&& (!Number.isInteger(options.audio.bitrate) || options.audio.bitrate <= 0)
		) {
			throw new TypeError('options.audio.bitrate, when provided, must be a positive integer or a quality.');
		}
		if (
			options.audio?.numberOfChannels !== undefined
			&& (!Number.isInteger(options.audio.numberOfChannels) || options.audio.numberOfChannels <= 0)
		) {
			throw new TypeError('options.audio.numberOfChannels, when provided, must be a positive integer.');
		}
		if (
			options.audio?.sampleRate !== undefined
			&& (!Number.isInteger(options.audio.sampleRate) || options.audio.sampleRate <= 0)
		) {
			throw new TypeError('options.audio.sampleRate, when provided, must be a positive integer.');
		}
		if (options.trim !== undefined && (!options.trim || typeof options.trim !== 'object')) {
			throw new TypeError('options.trim, when provided, must be an object.');
		}
		if (options.trim?.start !== undefined && (!Number.isFinite(options.trim.start) || options.trim.start < 0)) {
			throw new TypeError('options.trim.start, when provided, must be a non-negative number.');
		}
		if (options.trim?.end !== undefined && (!Number.isFinite(options.trim.end) || options.trim.end < 0)) {
			throw new TypeError('options.trim.end, when provided, must be a non-negative number.');
		}
		if (
			options.trim?.start !== undefined
			&& options.trim.end !== undefined
			&& options.trim.start >= options.trim.end) {
			throw new TypeError('options.trim.start must be less than options.trim.end.');
		}
		if (options.computeProgress !== undefined && typeof options.computeProgress !== 'boolean') {
			throw new TypeError('options.computeProgress, when provided, must be a boolean.');
		}

		this._options = options;
		this._input = options.input;
		this._output = options.output;

		this._startTimestamp = options.trim?.start ?? 0;
		this._endTimestamp = options.trim?.end ?? Infinity;

		const { promise: started, resolve: start } = promiseWithResolvers();
		this._started = started;
		this._start = start;
	}

	/** @internal */
	async _init() {
		const inputTracks = await this._input.getTracks();
		const outputTrackCounts = this._output.format.getSupportedTrackCounts();

		for (const track of inputTracks) {
			if (this._totalTrackCount === outputTrackCounts.total.max) {
				this.discardedTracks.push({
					track,
					reason: 'maxTrackCountReached',
				});
				continue;
			}

			if (this._addedCounts[track.type] === outputTrackCounts[track.type].max) {
				this.discardedTracks.push({
					track,
					reason: 'maxTrackCountOfTypeReached',
				});
				continue;
			}

			if (track.isVideoTrack()) {
				if (this._options.video?.discard) {
					this.discardedTracks.push({
						track,
						reason: 'discardedByUser',
					});
					continue;
				}

				await this._processVideoTrack(track);
			} else if (track.isAudioTrack()) {
				if (this._options.audio?.discard) {
					this.discardedTracks.push({
						track,
						reason: 'discardedByUser',
					});
					continue;
				}

				await this._processAudioTrack(track);
			}
		}

		if (this._options.computeProgress) {
			this._totalDuration = Math.min(
				await this._input.computeDuration() - this._startTimestamp,
				this._endTimestamp - this._startTimestamp,
			);
			this.onProgress?.();
		}
	}

	async execute() {
		if (this._executed) {
			throw new Error('Conversion cannot be executed twice.');
		}

		this._executed = true;

		await this._output.start();
		this._start();

		await Promise.all(this._trackPromises);

		if (this._canceled) {
			await new Promise(() => {}); // Never resolve
		}

		await this._output.finalize();

		if (this._options.computeProgress) {
			this.progress = 1;
			this.onProgress?.();
		}
	}

	async cancel() {
		if (this._output.state === 'finalizing' || this._output.state === 'finalized') {
			return;
		}

		if (this._canceled) {
			console.warn('Conversion already canceled.');
			return;
		}

		this._canceled = true;
		await this._output.cancel();
	}

	/** @internal */
	async _processVideoTrack(track: InputVideoTrack) {
		const sourceCodec = track.codec;
		if (!sourceCodec) {
			this.discardedTracks.push({
				track,
				reason: 'unknownSourceCodec',
			});
			return;
		}

		let videoSource: VideoSource;

		const totalRotation = normalizeRotation(track.rotation + (this._options.video?.rotate ?? 0));
		const outputSupportsRotation = this._output.format.supportsVideoRotationMetadata;

		const [originalWidth, originalHeight] = totalRotation % 180 === 0
			? [track.codedWidth, track.codedHeight]
			: [track.codedHeight, track.codedWidth];

		let width = originalWidth;
		let height = originalHeight;
		const aspectRatio = width / height;

		// A lot of video encoders require that the dimensions be multiples of 2
		const ceilToMultipleOfTwo = (value: number) => Math.ceil(value / 2) * 2;

		if (this._options.video?.width !== undefined && this._options.video.height === undefined) {
			width = ceilToMultipleOfTwo(this._options.video.width);
			height = ceilToMultipleOfTwo(Math.round(width / aspectRatio));
		} else if (this._options.video?.width === undefined && this._options.video?.height !== undefined) {
			height = ceilToMultipleOfTwo(this._options.video.height);
			width = ceilToMultipleOfTwo(Math.round(height * aspectRatio));
		} else if (this._options.video?.width !== undefined && this._options.video.height !== undefined) {
			width = ceilToMultipleOfTwo(this._options.video.width);
			height = ceilToMultipleOfTwo(this._options.video.height);
		}

		const firstTimestamp = await track.getFirstTimestamp();
		const needsReencode = !!this._options.video?.forceReencode || this._startTimestamp > 0 || firstTimestamp < 0;
		const needsRerender = width !== originalWidth
			|| height !== originalHeight
			|| (totalRotation !== 0 && !outputSupportsRotation);

		let videoCodecs = this._output.format.getSupportedVideoCodecs();
		if (
			!needsReencode
			&& !this._options.video?.bitrate
			&& !needsRerender
			&& videoCodecs.includes(sourceCodec)
			&& (!this._options.video?.codec || this._options.video?.codec === sourceCodec)
		) {
			// Fast path, we can simply copy over the encoded packets

			const source = new EncodedVideoPacketSource(sourceCodec);
			videoSource = source;

			this._trackPromises.push((async () => {
				await this._started;

				const sink = new EncodedPacketSink(track);
				const decoderConfig = await track.getDecoderConfig();
				const meta: EncodedVideoChunkMetadata = { decoderConfig: decoderConfig ?? undefined };

				for await (const packet of sink.packets(undefined, this._endTimestamp)) {
					if (this._synchronizer.shouldWait(track.id, packet.timestamp)) {
						await this._synchronizer.wait(packet.timestamp);
					}

					if (this._canceled) {
						return;
					}

					await source.add(packet, meta);
					this._reportProgress(track.id, packet.timestamp + packet.duration);
				}

				await source.close();
				this._synchronizer.closeTrack(track.id);
			})());
		} else {
			// We need to decode & reencode the video

			const canDecode = await track.canDecode();
			if (!canDecode) {
				this.discardedTracks.push({
					track,
					reason: 'undecodableSourceCodec',
				});
				return;
			}

			if (this._options.video?.codec) {
				videoCodecs = videoCodecs.filter(codec => codec === this._options.video?.codec);
			}

			const encodableCodecs = await getEncodableVideoCodecs(videoCodecs, { width, height });
			if (encodableCodecs.length === 0) {
				this.discardedTracks.push({
					track,
					reason: 'noEncodableTargetCodec',
				});
				return;
			}

			const encodingConfig: VideoEncodingConfig = {
				codec: encodableCodecs[0]!,
				bitrate: this._options.video?.bitrate ?? QUALITY_HIGH,
				onEncodedPacket: sample => this._reportProgress(track.id, sample.timestamp + sample.duration),
			};

			if (needsRerender) {
				const source = new VideoSampleSource(encodingConfig);
				videoSource = source;

				this._trackPromises.push((async () => {
					await this._started;

					const sink = new CanvasSink(track, {
						width,
						height,
						fit: this._options.video?.fit ?? 'fill',
						rotation: totalRotation, // Bake the rotation into the output
						poolSize: 1,
					});
					const iterator = sink.canvases(this._startTimestamp, this._endTimestamp);

					for await (const { canvas, timestamp, duration } of iterator) {
						if (this._synchronizer.shouldWait(track.id, timestamp)) {
							await this._synchronizer.wait(timestamp);
						}

						if (this._canceled) {
							return;
						}

						const sample = new VideoSample(canvas, {
							timestamp: Math.max(timestamp - this._startTimestamp, 0),
							duration,
						});

						await source.add(sample);
						sample.close();
					}
				})());
			} else {
				const source = new VideoSampleSource(encodingConfig);
				videoSource = source;

				this._trackPromises.push((async () => {
					await this._started;

					const sink = new VideoSampleSink(track);

					for await (const sample of sink.samples(this._startTimestamp, this._endTimestamp)) {
						if (this._synchronizer.shouldWait(track.id, sample.timestamp)) {
							await this._synchronizer.wait(sample.timestamp);
						}

						sample.setTimestamp(Math.max(sample.timestamp - this._startTimestamp, 0));

						if (this._canceled) {
							return;
						}

						await source.add(sample);
						sample.close();
					}

					await source.close();
					this._synchronizer.closeTrack(track.id);
				})());
			}
		}

		this._output.addVideoTrack(videoSource, {
			languageCode: track.languageCode,
			rotation: needsRerender ? 0 : totalRotation, // Rerendering will bake the rotation into the output
		});
		this._addedCounts.video++;
		this._totalTrackCount++;

		this.utilizedTracks.push(track);
	}

	/** @internal */
	async _processAudioTrack(track: InputAudioTrack) {
		const sourceCodec = track.codec;
		if (!sourceCodec) {
			this.discardedTracks.push({
				track,
				reason: 'unknownSourceCodec',
			});
			return;
		}

		let audioSource: AudioSource;

		const originalNumberOfChannels = track.numberOfChannels;
		const originalSampleRate = track.sampleRate;

		const firstTimestamp = await track.getFirstTimestamp();

		let numberOfChannels = this._options.audio?.numberOfChannels ?? originalNumberOfChannels;
		let sampleRate = this._options.audio?.sampleRate ?? originalSampleRate;
		let needsResample = numberOfChannels !== originalNumberOfChannels
			|| sampleRate !== originalSampleRate
			|| this._startTimestamp > 0
			|| firstTimestamp < 0;

		let audioCodecs = this._output.format.getSupportedAudioCodecs();
		if (
			!this._options.audio?.forceReencode
			&& !this._options.audio?.bitrate
			&& !needsResample
			&& audioCodecs.includes(sourceCodec)
			&& (!this._options.audio?.codec || this._options.audio.codec === sourceCodec)
		) {
			// Fast path, we can simply copy over the encoded packets

			const source = new EncodedAudioPacketSource(sourceCodec);
			audioSource = source;

			this._trackPromises.push((async () => {
				await this._started;

				const sink = new EncodedPacketSink(track);
				const decoderConfig = await track.getDecoderConfig();
				const meta: EncodedAudioChunkMetadata = { decoderConfig: decoderConfig ?? undefined };

				for await (const packet of sink.packets(undefined, this._endTimestamp)) {
					if (this._synchronizer.shouldWait(track.id, packet.timestamp)) {
						await this._synchronizer.wait(packet.timestamp);
					}

					if (this._canceled) {
						return;
					}

					await source.add(packet, meta);
					this._reportProgress(track.id, packet.timestamp + packet.duration);
				}

				await source.close();
				this._synchronizer.closeTrack(track.id);
			})());
		} else {
			// We need to decode & reencode the audio

			const canDecode = await track.canDecode();
			if (!canDecode) {
				this.discardedTracks.push({
					track,
					reason: 'undecodableSourceCodec',
				});
				return;
			}

			let codecOfChoice: AudioCodec | null = null;

			if (this._options.audio?.codec) {
				audioCodecs = audioCodecs.filter(codec => codec === this._options.audio!.codec);
			}

			const encodableCodecs = await getEncodableAudioCodecs(audioCodecs, {
				numberOfChannels,
				sampleRate,
			});

			if (
				!encodableCodecs.some(codec => (NON_PCM_AUDIO_CODECS as readonly string[]).includes(codec))
				&& audioCodecs.some(codec => (NON_PCM_AUDIO_CODECS as readonly string[]).includes(codec))
				&& (numberOfChannels !== FALLBACK_NUMBER_OF_CHANNELS || sampleRate !== FALLBACK_SAMPLE_RATE)
			) {
				// We could not find a compatible non-PCM codec despite the container supporting them. This can be
				// caused by strange channel count or sample rate configurations. Therefore, let's try again but with
				// fallback parameters.

				const encodableCodecsWithDefaultParams = await getEncodableAudioCodecs(audioCodecs, {
					numberOfChannels: FALLBACK_NUMBER_OF_CHANNELS,
					sampleRate: FALLBACK_SAMPLE_RATE,
				});

				if (
					encodableCodecsWithDefaultParams
						.some(codec => (NON_PCM_AUDIO_CODECS as readonly string[]).includes(codec))
				) {
					// We are able to encode using a non-PCM codec, but it'll require resampling
					needsResample = true;
					codecOfChoice = encodableCodecsWithDefaultParams[0]!;
					numberOfChannels = FALLBACK_NUMBER_OF_CHANNELS;
					sampleRate = FALLBACK_SAMPLE_RATE;
				}
			} else {
				codecOfChoice = encodableCodecs[0] ?? null;
			}

			if (codecOfChoice === null) {
				this.discardedTracks.push({
					track,
					reason: 'noEncodableTargetCodec',
				});
				return;
			}

			if (needsResample) {
				audioSource = this._resampleAudio(track, codecOfChoice, numberOfChannels, sampleRate);
			} else {
				const source = new AudioSampleSource({
					codec: codecOfChoice,
					bitrate: this._options.audio?.bitrate ?? QUALITY_HIGH,
					onEncodedPacket: packet => this._reportProgress(track.id, packet.timestamp + packet.duration),
				});
				audioSource = source;

				this._trackPromises.push((async () => {
					await this._started;

					const sink = new AudioSampleSink(track);
					for await (const sample of sink.samples(undefined, this._endTimestamp)) {
						if (this._synchronizer.shouldWait(track.id, sample.timestamp)) {
							await this._synchronizer.wait(sample.timestamp);
						}

						if (this._canceled) {
							return;
						}

						await source.add(sample);
						sample.close();
					}

					await source.close();
					this._synchronizer.closeTrack(track.id);
				})());
			}
		}

		this._output.addAudioTrack(audioSource, {
			languageCode: track.languageCode,
		});
		this._addedCounts.audio++;
		this._totalTrackCount++;

		this.utilizedTracks.push(track);
	}

	/**
	 * Resamples the audio by decoding it, playing it onto an OfflineAudioContext and encoding the
	 * resulting AudioBuffer.
	 * @internal
	 */
	_resampleAudio(
		track: InputAudioTrack,
		codec: AudioCodec,
		targetNumberOfChannels: number,
		targetSampleRate: number,
	) {
		const source = new AudioBufferSource({
			codec,
			bitrate: this._options.audio?.bitrate ?? QUALITY_HIGH,
			onEncodedPacket: packet => this._reportProgress(track.id, packet.timestamp + packet.duration),
		});

		this._trackPromises.push((async () => {
			await this._started;

			const trackDuration = Math.min(
				await track.computeDuration() - this._startTimestamp,
				this._endTimestamp - this._startTimestamp,
			);
			const totalFrameCount = Math.round(trackDuration * targetSampleRate);
			const maxChunkLength = 5 * targetSampleRate;

			let currentContextStartFrame = 0;
			let currentContext: OfflineAudioContext | null = new OfflineAudioContext({
				length: Math.min(totalFrameCount - currentContextStartFrame, maxChunkLength),
				numberOfChannels: targetNumberOfChannels,
				sampleRate: targetSampleRate,
			});

			const sink = new AudioBufferSink(track);
			const iterator = sink.buffers(this._startTimestamp, this._endTimestamp);

			for await (const { buffer, timestamp, duration } of iterator) {
				if (this._synchronizer.shouldWait(track.id, timestamp)) {
					await this._synchronizer.wait(timestamp);
				}

				const offsetTimestamp = timestamp - this._startTimestamp;
				const endTimestamp = offsetTimestamp + duration;

				// while loop, as a single source buffer may span multiple audio contexts
				while (currentContext) {
					const currentContextStartTime = currentContextStartFrame / targetSampleRate;
					const currentContextEndTime
								= (currentContextStartFrame + currentContext.length) / targetSampleRate;

					if (offsetTimestamp < currentContextEndTime) {
						// The buffer lies within the context, let's play it
						const node = currentContext.createBufferSource();
						node.buffer = buffer;
						node.connect(currentContext.destination);

						if (offsetTimestamp < currentContextStartTime) {
							node.start(0, currentContextStartTime - offsetTimestamp);
						} else {
							node.start(offsetTimestamp - currentContextStartTime);
						}
					}

					if (endTimestamp >= currentContextEndTime) {
						// Render the audio
						const renderedBuffer = await currentContext.startRendering();

						if (this._canceled) {
							return;
						}

						await source.add(renderedBuffer);

						currentContextStartFrame += currentContext.length;

						const newLength = Math.min(
							totalFrameCount - currentContextStartFrame,
							maxChunkLength,
						);
						currentContext = newLength > 0
							? new OfflineAudioContext({
								length: newLength,
								numberOfChannels: targetNumberOfChannels,
								sampleRate: targetSampleRate,
							})
							: null;
					} else {
						break;
					}
				}
			}

			if (currentContext) {
				const renderedBuffer = await currentContext.startRendering();

				if (this._canceled) {
					return;
				}

				await source.add(renderedBuffer);
			}

			await source.close();
			this._synchronizer.closeTrack(track.id);
		})());

		return source;
	}

	/** @internal */
	_reportProgress(trackId: number, endTimestamp: number) {
		if (!this._options.computeProgress) {
			return;
		}
		assert(this._totalDuration !== null);

		this._maxTimestamps.set(trackId, Math.max(endTimestamp, this._maxTimestamps.get(trackId) ?? -Infinity));

		let totalTimestamps = 0;
		for (const [, timestamp] of this._maxTimestamps) {
			totalTimestamps += timestamp;
		}

		const averageTimestamp = totalTimestamps / this._totalTrackCount;

		this.progress = 0.99 * clamp(averageTimestamp / this._totalDuration, 0, 1);
		this.onProgress?.();
	}
}

const MAX_TIMESTAMP_GAP = 5;

/**
 * Utility class for synchronizing multiple track packet consumers with one another. We don't want one consumer to get
 * too out-of-sync with the others, as that may lead to a large number of packets that need to be internally buffered
 * before they can be written. Therefore, we use this class to slow down a consumer if it is too far ahead of the
 * slowest consumer.
 */
class TrackSynchronizer {
	maxTimestamps = new Map<number, number>(); // Track ID -> timestamp
	resolvers: {
		timestamp: number;
		resolve: () => void;
	}[] = [];

	computeMinAndMaybeResolve() {
		let newMin = Infinity;
		for (const [, timestamp] of this.maxTimestamps) {
			newMin = Math.min(newMin, timestamp);
		}

		for (let i = 0; i < this.resolvers.length; i++) {
			const entry = this.resolvers[i]!;

			if (entry.timestamp - newMin < MAX_TIMESTAMP_GAP) {
				// The gap has gotten small enough again, the consumer can continue again
				entry.resolve();
				this.resolvers.splice(i, 1);
				i--;
			}
		}

		return newMin;
	}

	shouldWait(trackId: number, timestamp: number) {
		this.maxTimestamps.set(trackId, Math.max(timestamp, this.maxTimestamps.get(trackId) ?? -Infinity));

		const newMin = this.computeMinAndMaybeResolve();
		return timestamp - newMin >= MAX_TIMESTAMP_GAP; // Should wait if it is too far ahead of the slowest consumer
	}

	wait(timestamp: number) {
		const { promise, resolve } = promiseWithResolvers();

		this.resolvers.push({
			timestamp,
			resolve,
		});

		return promise;
	}

	closeTrack(trackId: number) {
		this.maxTimestamps.delete(trackId);
		this.computeMinAndMaybeResolve();
	}
}
