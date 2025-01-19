import { AsyncMutex, TransformationMatrix } from './misc';
import { Muxer } from './muxer';
import { OutputFormat } from './output-format';
import { AudioSource, MediaSource, SubtitleSource, VideoSource } from './media-source';
import { Target } from './target';
import { Writer } from './writer';

/** @public */
export type OutputOptions<
	F extends OutputFormat = OutputFormat,
	T extends Target = Target,
> = {
	format: F;
	target: T;
};

/** @public */
export const ALL_TRACK_TYPES = ['video', 'audio', 'subtitle'] as const;
/** @public */
export type TrackType = typeof ALL_TRACK_TYPES[number];

export type OutputTrack = {
	id: number;
	output: Output;
	type: TrackType;
} & ({
	type: 'video';
	source: VideoSource;
	metadata: VideoTrackMetadata;
} | {
	type: 'audio';
	source: AudioSource;
	metadata: AudioTrackMetadata;
} | {
	type: 'subtitle';
	source: SubtitleSource;
	metadata: SubtitleTrackMetadata;
});

export type OutputVideoTrack = OutputTrack & { type: 'video' };
export type OutputAudioTrack = OutputTrack & { type: 'audio' };
export type OutputSubtitleTrack = OutputTrack & { type: 'subtitle' };

/** @public */
export type BaseTrackMetadata = {
	languageCode?: string;
};

/** @public */
export type VideoTrackMetadata = BaseTrackMetadata & {
	rotation?: 0 | 90 | 180 | 270 | TransformationMatrix;
	frameRate?: number;
};
/** @public */
export type AudioTrackMetadata = BaseTrackMetadata & {};
/** @public */
export type SubtitleTrackMetadata = BaseTrackMetadata & {};

const validateBaseTrackMetadata = (metadata: BaseTrackMetadata) => {
	if (!metadata || typeof metadata !== 'object') {
		throw new TypeError('metadata must be an object.');
	}
	if (metadata.languageCode !== undefined && !/^[a-z]{3}$/.test(metadata.languageCode)) {
		throw new TypeError('metadata.languageCode must be a three-letter, ISO 639-2 language code.');
	}
};

/** @public */
export class Output<
	F extends OutputFormat = OutputFormat,
	T extends Target = Target,
> {
	format: F;
	target: T;

	/** @internal */
	_muxer: Muxer;
	/** @internal */
	_writer: Writer;
	/** @internal */
	_tracks: OutputTrack[] = [];
	/** @internal */
	_started = false;
	/** @internal */
	_canceled = false;
	/** @internal */
	_finalizing = false;
	/** @internal */
	_mutex = new AsyncMutex();

	constructor(options: OutputOptions<F, T>) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (!(options.format instanceof OutputFormat)) {
			throw new TypeError('options.format must be an OutputFormat.');
		}
		if (!(options.target instanceof Target)) {
			throw new TypeError('options.target must be a Target.');
		}

		if (options.target._output) {
			throw new Error('Target is already used for another output.');
		}
		options.target._output = this;

		this.format = options.format;
		this.target = options.target;

		this._writer = options.target._createWriter();
		this._muxer = options.format._createMuxer(this);
	}

	addVideoTrack(source: VideoSource, metadata: VideoTrackMetadata = {}) {
		if (!(source instanceof VideoSource)) {
			throw new TypeError('source must be a VideoSource.');
		}
		validateBaseTrackMetadata(metadata);
		if (typeof metadata.rotation === 'number' && ![0, 90, 180, 270].includes(metadata.rotation)) {
			throw new TypeError(`Invalid video rotation: ${metadata.rotation}. Has to be 0, 90, 180 or 270.`);
		} else if (
			Array.isArray(metadata.rotation)
			&& (metadata.rotation.length !== 9 || metadata.rotation.some(value => !Number.isFinite(value)))
		) {
			throw new TypeError(`Invalid video transformation matrix: ${metadata.rotation.join()}`);
		}
		if (
			metadata.frameRate !== undefined
			&& (!Number.isInteger(metadata.frameRate) || metadata.frameRate <= 0)
		) {
			throw new TypeError(
				`Invalid video frame rate: ${metadata.frameRate}. Must be a positive integer.`,
			);
		}

		this._addTrack('video', source, metadata);
	}

	addAudioTrack(source: AudioSource, metadata: AudioTrackMetadata = {}) {
		if (!(source instanceof AudioSource)) {
			throw new TypeError('source must be an AudioSource.');
		}
		validateBaseTrackMetadata(metadata);

		this._addTrack('audio', source, metadata);
	}

	addSubtitleTrack(source: SubtitleSource, metadata: SubtitleTrackMetadata = {}) {
		if (!(source instanceof SubtitleSource)) {
			throw new TypeError('source must be a SubtitleSource.');
		}
		validateBaseTrackMetadata(metadata);

		this._addTrack('subtitle', source, metadata);
	}

	/** @internal */
	private _addTrack(type: OutputTrack['type'], source: MediaSource, metadata: object) {
		if (this._started) {
			throw new Error('Cannot add track after output has started.');
		}
		if (source._connectedTrack) {
			throw new Error('Source is already used for a track.');
		}

		// Verify maximum track count constraints
		const supportedTrackCounts = this.format.getSupportedTrackCounts();
		const presentTracksOfThisType = this._tracks.reduce(
			(count, track) => count + (track.type === type ? 1 : 0),
			0,
		);
		const maxCount = supportedTrackCounts[type].max;
		if (presentTracksOfThisType === maxCount) {
			throw new Error(
				maxCount === 0
					? `${this.format._getName()} does not support ${type} tracks.`
					: (`${this.format._getName()} does not support more than ${maxCount} ${type} track`
						+ `${maxCount === 1 ? '' : 's'}.`),
			);
		}
		const maxTotalCount = supportedTrackCounts.total.max;
		if (this._tracks.length === maxTotalCount) {
			throw new Error(
				`${this.format._getName()} does not support more than ${maxTotalCount} tracks`
				+ `${maxTotalCount === 1 ? '' : 's'} in total.`,
			);
		}

		const track = {
			id: this._tracks.length + 1,
			output: this,
			type,
			source: source as unknown,
			metadata,
		} as OutputTrack;

		if (track.type === 'video') {
			const supportedVideoCodecs = this.format.getSupportedVideoCodecs();

			if (supportedVideoCodecs.length === 0) {
				throw new Error(
					`${this.format._getName()} does not support video tracks.`
					+ this.format._codecUnsupportedHint(track.source._codec),
				);
			} else if (!supportedVideoCodecs.includes(track.source._codec)) {
				throw new Error(
					`Codec '${track.source._codec}' cannot be contained within ${this.format._getName()}. Supported`
					+ ` video codecs are: ${supportedVideoCodecs.map(codec => `'${codec}'`).join(', ')}.`
					+ this.format._codecUnsupportedHint(track.source._codec),
				);
			}
		} else if (track.type === 'audio') {
			const supportedAudioCodecs = this.format.getSupportedAudioCodecs();

			if (supportedAudioCodecs.length === 0) {
				throw new Error(
					`${this.format._getName()} does not support audio tracks.`
					+ this.format._codecUnsupportedHint(track.source._codec),
				);
			} else if (!supportedAudioCodecs.includes(track.source._codec)) {
				throw new Error(
					`Codec '${track.source._codec}' cannot be contained within ${this.format._getName()}. Supported`
					+ ` audio codecs are: ${supportedAudioCodecs.map(codec => `'${codec}'`).join(', ')}.`
					+ this.format._codecUnsupportedHint(track.source._codec),
				);
			}
		} else if (track.type === 'subtitle') {
			const supportedSubtitleCodecs = this.format.getSupportedSubtitleCodecs();

			if (supportedSubtitleCodecs.length === 0) {
				throw new Error(
					`${this.format._getName()} does not support subtitle tracks.`
					+ this.format._codecUnsupportedHint(track.source._codec),
				);
			} else if (!supportedSubtitleCodecs.includes(track.source._codec)) {
				throw new Error(
					`Codec '${track.source._codec}' cannot be contained within ${this.format._getName()}. Supported`
					+ ` subtitle codecs are: ${supportedSubtitleCodecs.map(codec => `'${codec}'`).join(', ')}.`
					+ this.format._codecUnsupportedHint(track.source._codec),
				);
			}
		}

		this._tracks.push(track);
		source._connectedTrack = track;
	}

	async start() {
		if (this._canceled) {
			throw new Error('Output has been canceled.');
		}
		if (this._started) {
			throw new Error('Output already started.');
		}

		// Verify minimum track count constraints
		const supportedTrackCounts = this.format.getSupportedTrackCounts();
		for (const trackType of ALL_TRACK_TYPES) {
			const presentTracksOfThisType = this._tracks.reduce(
				(count, track) => count + (track.type === trackType ? 1 : 0),
				0,
			);
			const minCount = supportedTrackCounts[trackType].min;
			if (presentTracksOfThisType < minCount) {
				throw new Error(
					minCount === supportedTrackCounts[trackType].max
						? (`${this.format._getName()} requires exactly ${minCount} ${trackType}`
							+ ` track${minCount === 1 ? '' : 's'}.`)
						: (`${this.format._getName()} requires at least ${minCount} ${trackType}`
							+ ` track${minCount === 1 ? '' : 's'}.`),
				);
			}
		}
		const totalMinCount = supportedTrackCounts.total.min;
		if (this._tracks.length < totalMinCount) {
			throw new Error(
				totalMinCount === supportedTrackCounts.total.max
					? (`${this.format._getName()} requires exactly ${totalMinCount} track`
						+ `${totalMinCount === 1 ? '' : 's'}.`)
					: (`${this.format._getName()} requires at least ${totalMinCount} track`
						+ `${totalMinCount === 1 ? '' : 's'}.`),
			);
		}

		this._started = true;
		this._writer.start();

		const release = await this._mutex.acquire();

		await this._muxer.start();

		for (const track of this._tracks) {
			track.source._start();
		}

		release();
	}

	async cancel() {
		if (this._finalizing) {
			throw new Error('Cannot cancel after calling finalize.');
		}
		if (this._canceled) {
			throw new Error('Output already canceled.');
		}
		this._canceled = true;

		const release = await this._mutex.acquire();

		const promises = this._tracks.map(x => x.source._flushOrWaitForClose());
		await Promise.all(promises);

		await this._writer.close();

		release();
	}

	async finalize() {
		if (!this._started) {
			throw new Error('Cannot finalize before starting.');
		}
		if (this._finalizing) {
			throw new Error('Cannot call finalize twice.');
		}
		this._finalizing = true;

		const release = await this._mutex.acquire();

		const promises = this._tracks.map(x => x.source._flushOrWaitForClose());
		await Promise.all(promises);

		await this._muxer.finalize();

		await this._writer.flush();
		await this._writer.finalize();

		release();
	}
}
