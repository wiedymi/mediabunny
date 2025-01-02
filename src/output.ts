import { AsyncMutex, TransformationMatrix } from './misc';
import { Muxer } from './muxer';
import { OutputFormat } from './output-format';
import { AudioSource, MediaSource, SubtitleSource, VideoSource } from './media-source';
import { Target } from './target';
import { Writer } from './writer';

/** @public */
export type OutputOptions = {
	format: OutputFormat;
	target: Target;
};

export type OutputTrack = {
	id: number;
	output: Output;
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
export type VideoTrackMetadata = {
	rotation?: 0 | 90 | 180 | 270 | TransformationMatrix; // TODO respect this field for Matroska
	frameRate?: number;
};
/** @public */
export type AudioTrackMetadata = {};
/** @public */
export type SubtitleTrackMetadata = {};

/** @public */
export class Output {
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

	constructor(options: OutputOptions) {
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

		this._writer = options.target._createWriter();
		this._muxer = options.format._createMuxer(this);
	}

	addVideoTrack(source: VideoSource, metadata: VideoTrackMetadata = {}) {
		if (!(source instanceof VideoSource)) {
			throw new TypeError('source must be a VideoSource.');
		}
		if (!metadata || typeof metadata !== 'object') {
			throw new TypeError('metadata must be an object.');
		}
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
		if (!metadata || typeof metadata !== 'object') {
			throw new TypeError('metadata must be an object.');
		}

		this._addTrack('audio', source, metadata);
	}

	addSubtitleTrack(source: SubtitleSource, metadata: SubtitleTrackMetadata = {}) {
		if (!(source instanceof SubtitleSource)) {
			throw new TypeError('source must be a SubtitleSource.');
		}
		if (!metadata || typeof metadata !== 'object') {
			throw new TypeError('metadata must be an object.');
		}

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

		const track = {
			id: this._tracks.length + 1,
			output: this,
			type,
			source: source as unknown,
			metadata,
		} as OutputTrack;

		this._muxer.beforeTrackAdd(track);

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

		const promises = this._tracks.map(x => x.source._flush());
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

		const promises = this._tracks.map(x => x.source._flush());
		await Promise.all(promises);

		await this._muxer.finalize();

		await this._writer.flush();
		await this._writer.finalize();

		release();
	}
}
