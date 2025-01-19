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
	AudioDataSink,
	CanvasSink,
	EncodedAudioSampleSink,
	EncodedVideoSampleSink,
	VideoFrameSink,
} from './media-sink';
import {
	AudioBufferSource,
	AudioDataSource,
	AudioEncodingConfig,
	AudioSource,
	CanvasSource,
	EncodedAudioSampleSource,
	EncodedVideoSampleSource,
	VideoEncodingConfig,
	VideoFrameSource,
	VideoSource,
} from './media-source';
import { assert, clamp, promiseWithResolvers, Rotation, setVideoFrameTiming } from './misc';
import { Output, TrackType } from './output';

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

	onProgress?: (event: { completion: number }) => unknown;
};

/** @public */
export type ConversionInfo = {
	utilizedTracks: InputTrack[];
	discardedTracks: {
		track: InputTrack;
		reason:
			| 'discardedByUser'
			| 'maxTrackCountReached'
			| 'maxTrackCountOfTypeReached'
			| 'unknownSourceCodec'
			| 'undecodableSourceCodec'
			| 'noEncodableTargetCodec';
	}[];
};

const FALLBACK_NUMBER_OF_CHANNELS = 2;
const FALLBACK_SAMPLE_RATE = 48000;

/** @public */
export const convert = (options: ConversionOptions) => {
	const conversion = new Conversion(options);
	return conversion.execute();
};

class Conversion {
	input: Input;
	output: Output;
	startTimestamp: number;
	endTimestamp: number;

	addedCounts: Record<TrackType, number> = {
		video: 0,
		audio: 0,
		subtitle: 0,
	};

	totalTrackCount = 0;

	trackPromises: Promise<void>[] = [];

	started: Promise<void>;
	start: () => void;

	synchronizer = new TrackSynchronizer();

	totalDuration: number | null = null;
	maxTimestamps = new Map<number, number>(); // Track ID -> timestamp

	result: ConversionInfo;

	constructor(public options: ConversionOptions) {
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
		if (options.onProgress !== undefined && typeof options.onProgress !== 'function') {
			throw new TypeError('options.onProgress, when provided, must be a function.');
		}

		this.input = options.input;
		this.output = options.output;

		this.startTimestamp = options.trim?.start ?? 0;
		this.endTimestamp = options.trim?.end ?? Infinity;

		const { promise: started, resolve: start } = promiseWithResolvers();
		this.started = started;
		this.start = start;

		this.result = {
			utilizedTracks: [],
			discardedTracks: [],
		};
	}

	async execute() {
		const inputTracks = await this.input.getTracks();
		const outputTrackCounts = this.output.format.getSupportedTrackCounts();

		for (const track of inputTracks) {
			if (this.totalTrackCount === outputTrackCounts.total.max) {
				this.result.discardedTracks.push({
					track,
					reason: 'maxTrackCountReached',
				});
				continue;
			}

			const type = track.getType();
			if (this.addedCounts[type] === outputTrackCounts[type].max) {
				this.result.discardedTracks.push({
					track,
					reason: 'maxTrackCountOfTypeReached',
				});
				continue;
			}

			if (track.isVideoTrack()) {
				if (this.options.video?.discard) {
					this.result.discardedTracks.push({
						track,
						reason: 'discardedByUser',
					});
					continue;
				}

				await this.processVideoTrack(track);
			} else if (track.isAudioTrack()) {
				if (this.options.audio?.discard) {
					this.result.discardedTracks.push({
						track,
						reason: 'discardedByUser',
					});
					continue;
				}

				await this.processAudioTrack(track);
			}
		}

		if (this.options.onProgress) {
			this.totalDuration = Math.min(
				await this.input.computeDuration() - this.startTimestamp,
				this.endTimestamp - this.startTimestamp,
			);
			this.options.onProgress({ completion: 0 });
		}

		await this.output.start();
		this.start();

		await Promise.all(this.trackPromises);

		await this.output.finalize();

		this.options.onProgress?.({ completion: 1 });

		return this.result;
	}

	async processVideoTrack(track: InputVideoTrack) {
		const trackId = track.getId();

		const sourceCodec = await track.getCodec();
		if (!sourceCodec) {
			this.result.discardedTracks.push({
				track,
				reason: 'unknownSourceCodec',
			});
			return;
		}

		let videoSource: VideoSource;

		const originalWidth = await track.getCodedWidth();
		const originalHeight = await track.getCodedHeight();
		const originalAspectRatio = originalWidth / originalHeight;

		let width = originalWidth;
		let height = originalHeight;

		// A lot of video encoders require that the dimensions be multiples of 2
		const ceilToMultipleOfTwo = (value: number) => Math.ceil(value / 2) * 2;

		if (this.options.video?.width !== undefined && this.options.video.height === undefined) {
			width = ceilToMultipleOfTwo(this.options.video.width);
			height = ceilToMultipleOfTwo(Math.round(width / originalAspectRatio));
		} else if (this.options.video?.width === undefined && this.options.video?.height !== undefined) {
			height = ceilToMultipleOfTwo(this.options.video.height);
			width = ceilToMultipleOfTwo(Math.round(height * originalAspectRatio));
		} else if (this.options.video?.width !== undefined && this.options.video.height !== undefined) {
			width = ceilToMultipleOfTwo(this.options.video.width);
			height = ceilToMultipleOfTwo(this.options.video.height);
		}

		const needsReencode = !!this.options.video?.forceReencode || this.startTimestamp > 0;
		const needsResize = width !== originalWidth || height !== originalHeight;

		let videoCodecs = this.output.format.getSupportedVideoCodecs();
		if (
			!needsReencode
			&& !this.options.video?.bitrate
			&& !needsResize
			&& videoCodecs.includes(sourceCodec)
			&& (!this.options.video?.codec || this.options.video?.codec === sourceCodec)
		) {
			// Fast path, we can simply copy over the encoded samples

			const source = new EncodedVideoSampleSource(sourceCodec);
			videoSource = source;

			this.trackPromises.push((async () => {
				await this.started;

				const sink = new EncodedVideoSampleSink(track);
				const decoderConfig = await track.getDecoderConfig();
				const meta: EncodedVideoChunkMetadata = { decoderConfig: decoderConfig ?? undefined };

				for await (const sample of sink.samples(undefined, this.endTimestamp)) {
					if (this.synchronizer.shouldWait(trackId, sample.timestamp)) {
						await this.synchronizer.wait(sample.timestamp);
					}

					await source.digest(sample, meta);
					this.reportProgress(trackId, sample.timestamp + sample.duration);
				}

				await source.close();
				this.synchronizer.closeTrack(trackId);
			})());
		} else {
			// We need to decode & reencode the video

			const canDecode = await track.canDecode();
			if (!canDecode) {
				this.result.discardedTracks.push({
					track,
					reason: 'undecodableSourceCodec',
				});
				return;
			}

			if (this.options.video?.codec) {
				videoCodecs = videoCodecs.filter(codec => codec === this.options.video?.codec);
			}

			const encodableCodecs = await getEncodableVideoCodecs(videoCodecs, {
				width: needsResize ? width : await track.getCodedWidth(),
				height: needsResize ? height : await track.getCodedHeight(),
			});
			if (encodableCodecs.length === 0) {
				this.result.discardedTracks.push({
					track,
					reason: 'noEncodableTargetCodec',
				});
				return;
			}

			const encodingConfig: VideoEncodingConfig = {
				codec: encodableCodecs[0]!,
				bitrate: this.options.video?.bitrate ?? QUALITY_HIGH,
				onEncodedSample: sample => this.reportProgress(trackId, sample.timestamp + sample.duration),
			};

			if (needsResize) {
				// For resizing, we draw the frame onto a canvas and then encode the canvas
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const context = canvas.getContext('2d', {
					alpha: false,
				})!;

				const source = new CanvasSource(canvas, encodingConfig);
				videoSource = source;

				this.trackPromises.push((async () => {
					await this.started;

					const sink = new CanvasSink(track);
					const iterator = sink.canvases(this.startTimestamp, this.endTimestamp);

					for await (const { canvas, timestamp, duration } of iterator) {
						if (this.synchronizer.shouldWait(trackId, timestamp)) {
							await this.synchronizer.wait(timestamp);
						}

						if (!this.options.video?.fit || this.options.video.fit === 'fill') {
							context.drawImage(canvas, 0, 0, width, height);
						} else if (this.options.video.fit === 'contain') {
							const scale = Math.min(width / canvas.width, height / canvas.height);
							const newWidth = canvas.width * scale;
							const newHeight = canvas.height * scale;
							const dx = (width - newWidth) / 2;
							const dy = (height - newHeight) / 2;
							context.drawImage(canvas, 0, 0, canvas.width, canvas.height, dx, dy, newWidth, newHeight);
						} else if (this.options.video.fit === 'cover') {
							const scale = Math.max(width / canvas.width, height / canvas.height);
							const newWidth = canvas.width * scale;
							const newHeight = canvas.height * scale;
							const dx = (width - newWidth) / 2;
							const dy = (height - newHeight) / 2;
							context.drawImage(canvas, 0, 0, canvas.width, canvas.height, dx, dy, newWidth, newHeight);
						}

						await source.digest(Math.max(timestamp - this.startTimestamp, 0), duration);
					}

					await source.close();
					this.synchronizer.closeTrack(trackId);
				})());
			} else {
				const source = new VideoFrameSource(encodingConfig);
				videoSource = source;

				this.trackPromises.push((async () => {
					await this.started;

					const sink = new VideoFrameSink(track);

					for await (const { frame, timestamp } of sink.frames(this.startTimestamp, this.endTimestamp)) {
						if (this.synchronizer.shouldWait(trackId, timestamp)) {
							await this.synchronizer.wait(timestamp);
						}

						const clone = setVideoFrameTiming(frame, {
							timestamp: Math.max(timestamp - this.startTimestamp, 0),
						});

						await source.digest(clone);
						clone.close();
					}

					await source.close();
					this.synchronizer.closeTrack(trackId);
				})());
			}
		}

		// Rotation metadata is reset if we do resizing
		const baseRotation = needsResize ? 0 : await track.getRotation();

		this.output.addVideoTrack(videoSource, {
			languageCode: await track.getLanguageCode(),
			rotation: (baseRotation + (this.options.video?.rotate ?? 0)) % 360 as Rotation,
		});
		this.addedCounts.video++;
		this.totalTrackCount++;

		this.result.utilizedTracks.push(track);
	}

	async processAudioTrack(track: InputAudioTrack) {
		const trackId = track.getId();

		const sourceCodec = await track.getCodec();
		if (!sourceCodec) {
			this.result.discardedTracks.push({
				track,
				reason: 'unknownSourceCodec',
			});
			return;
		}

		let audioSource: AudioSource;

		const originalNumberOfChannels = await track.getNumberOfChannels();
		const originalSampleRate = await track.getSampleRate();

		let numberOfChannels = this.options.audio?.numberOfChannels ?? originalNumberOfChannels;
		let sampleRate = this.options.audio?.sampleRate ?? originalSampleRate;
		let needsResample = numberOfChannels !== originalNumberOfChannels
			|| sampleRate !== originalSampleRate
			|| this.startTimestamp > 0;

		let audioCodecs = this.output.format.getSupportedAudioCodecs();
		if (
			!this.options.audio?.forceReencode
			&& !this.options.audio?.bitrate
			&& !needsResample
			&& audioCodecs.includes(sourceCodec)
			&& (!this.options.audio?.codec || this.options.audio.codec === sourceCodec)
		) {
			// Fast path, we can simply copy over the encoded samples

			const source = new EncodedAudioSampleSource(sourceCodec);
			audioSource = source;

			this.trackPromises.push((async () => {
				await this.started;

				const sink = new EncodedAudioSampleSink(track);
				const decoderConfig = await track.getDecoderConfig();
				const meta: EncodedAudioChunkMetadata = { decoderConfig: decoderConfig ?? undefined };

				for await (const sample of sink.samples(undefined, this.endTimestamp)) {
					if (this.synchronizer.shouldWait(trackId, sample.timestamp)) {
						await this.synchronizer.wait(sample.timestamp);
					}

					await source.digest(sample, meta);
					this.reportProgress(trackId, sample.timestamp + sample.duration);
				}

				await source.close();
				this.synchronizer.closeTrack(trackId);
			})());
		} else {
			// We need to decode & reencode the audio

			const canDecode = await track.canDecode();
			if (!canDecode) {
				this.result.discardedTracks.push({
					track,
					reason: 'undecodableSourceCodec',
				});
				return;
			}

			let codecOfChoice: AudioCodec | null = null;

			if (this.options.audio?.codec) {
				audioCodecs = audioCodecs.filter(codec => codec === this.options.audio!.codec);
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
				this.result.discardedTracks.push({
					track,
					reason: 'noEncodableTargetCodec',
				});
				return;
			}

			if (needsResample) {
				audioSource = await this.resampleAudio(track, codecOfChoice, numberOfChannels, sampleRate);
			} else {
				const source = new AudioDataSource({
					codec: codecOfChoice,
					bitrate: this.options.audio?.bitrate ?? QUALITY_HIGH,
					onEncodedSample: sample => this.reportProgress(trackId, sample.timestamp + sample.duration),
				});
				audioSource = source;

				this.trackPromises.push((async () => {
					await this.started;

					const sink = new AudioDataSink(track);
					for await (const { data, timestamp } of sink.data(undefined, this.startTimestamp)) {
						if (this.synchronizer.shouldWait(trackId, timestamp)) {
							await this.synchronizer.wait(timestamp);
						}

						await source.digest(data);
						data.close();
					}

					await source.close();
					this.synchronizer.closeTrack(trackId);
				})());
			}
		}

		this.output.addAudioTrack(audioSource, {
			languageCode: await track.getLanguageCode(),
		});
		this.addedCounts.audio++;
		this.totalTrackCount++;

		this.result.utilizedTracks.push(track);
	}

	/**
	 * Resamples the audio by decoding it, playing it onto an OfflineAudioContext and encoding the
	 * resulting AudioBuffer.
	 */
	async resampleAudio(
		track: InputAudioTrack,
		codec: AudioCodec,
		targetNumberOfChannels: number,
		targetSampleRate: number,
	) {
		const trackId = track.getId();
		const source = new AudioBufferSource({
			codec,
			bitrate: this.options.audio?.bitrate ?? QUALITY_HIGH,
			onEncodedSample: sample => this.reportProgress(trackId, sample.timestamp + sample.duration),
		});

		this.trackPromises.push((async () => {
			await this.started;

			const trackDuration = Math.min(
				await track.computeDuration() - this.startTimestamp,
				this.endTimestamp - this.startTimestamp,
			);
			const totalFrameCount = Math.round(trackDuration * FALLBACK_SAMPLE_RATE);

			const MAX_CHUNK_LENGTH = 5 * FALLBACK_SAMPLE_RATE;

			let currentContextStartFrame = 0;
			let currentContext: OfflineAudioContext | null = new OfflineAudioContext({
				length: Math.min(totalFrameCount - currentContextStartFrame, MAX_CHUNK_LENGTH),
				numberOfChannels: targetNumberOfChannels,
				sampleRate: targetSampleRate,
			});

			const sink = new AudioBufferSink(track);
			for await (const { buffer, timestamp, duration } of sink.buffers(this.startTimestamp, this.endTimestamp)) {
				if (this.synchronizer.shouldWait(trackId, timestamp)) {
					await this.synchronizer.wait(timestamp);
				}

				const offsetTimestamp = timestamp - this.startTimestamp;
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
						await source.digest(renderedBuffer);

						currentContextStartFrame += currentContext.length;

						const newLength = Math.min(
							totalFrameCount - currentContextStartFrame,
							MAX_CHUNK_LENGTH,
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
				await source.digest(renderedBuffer);
			}

			await source.close();
			this.synchronizer.closeTrack(trackId);
		})());

		return source;
	}

	reportProgress(trackId: number, endTimestamp: number) {
		if (!this.options.onProgress) {
			return;
		}
		assert(this.totalDuration !== null);

		this.maxTimestamps.set(trackId, Math.max(endTimestamp, this.maxTimestamps.get(trackId) ?? -Infinity));

		let totalTimestamps = 0;
		for (const [, timestamp] of this.maxTimestamps) {
			totalTimestamps += timestamp;
		}

		const averageTimestamp = totalTimestamps / this.totalTrackCount;

		this.options.onProgress({
			completion: 0.99 * clamp(averageTimestamp / this.totalDuration, 0, 1),
		});
	}
}

const MAX_TIMESTAMP_GAP = 5;

/**
 * Utility class for synchronizing multiple track sample consumers with one another. We don't want one consumer to get
 * too out-of-sync with the others, as that may lead to a large number of samples that need to be internally buffered
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
