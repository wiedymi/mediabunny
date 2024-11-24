import { TransformationMatrix } from "./misc";
import { Muxer } from "./muxer";
import { OutputFormat } from "./output_format";
import { AudioSource, MediaSource, SubtitleSource, VideoSource } from "./source";
import { Target } from "./target";
import { Writer } from "./writer";

type OutputOptions = {
	format: OutputFormat,
	target: Target
};

export type OutputTrack = {
	id: number,
	output: Output
} & ({
	type: 'video',
	source: VideoSource,
	metadata: VideoTrackMetadata
} | {
	type: 'audio',
	source: AudioSource,
	metadata: AudioTrackMetadata
} | {
	type: 'subtitle',
	source: SubtitleSource,
	metadata: SubtitleTrackMetadata
});

export type OutputVideoTrack = OutputTrack & { type: 'video' };
export type OutputAudioTrack = OutputTrack & { type: 'audio' };
export type OutputSubtitleTrack = OutputTrack & { type: 'subtitle' };

type VideoTrackMetadata = {
	rotation?: 0 | 90 | 180 | 270 | TransformationMatrix, // TODO respect this field for Matroska
	frameRate?: number
};
type AudioTrackMetadata = {};
type SubtitleTrackMetadata = {};

export class Output {
	muxer: Muxer;
	writer: Writer;
	tracks: OutputTrack[] = [];
	started = false;
	finalizing = false;

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

		if (options.target.output) {
			throw new Error('Target is already used for another output.');
		}
		options.target.output = this;

		this.writer = options.target.createWriter();
		this.muxer = options.format.createMuxer(this);
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
			Array.isArray(metadata.rotation) &&
			(metadata.rotation.length !== 9 || metadata.rotation.some(value => !Number.isFinite(value)))
		) {
			throw new TypeError(`Invalid video transformation matrix: ${metadata.rotation.join()}`);
		}
		if (
			metadata.frameRate !== undefined &&
			(!Number.isInteger(metadata.frameRate) || metadata.frameRate <= 0)
		) {
			throw new TypeError(
				`Invalid video frame rate: ${metadata.frameRate}. Must be a positive integer.`
			);
		}

		this.addTrack('video', source, metadata);
	}

	addAudioTrack(source: AudioSource, metadata: AudioTrackMetadata = {}) {
		if (!(source instanceof AudioSource)) {
			throw new TypeError('source must be an AudioSource.');
		}
		if (!metadata || typeof metadata !== 'object') {
			throw new TypeError('metadata must be an object.');
		}

		this.addTrack('audio', source, metadata);
	}

	addSubtitleTrack(source: SubtitleSource, metadata: SubtitleTrackMetadata = {}) {
		if (!(source instanceof SubtitleSource)) {
			throw new TypeError('source must be a SubtitleSource.');
		}
		if (!metadata || typeof metadata !== 'object') {
			throw new TypeError('metadata must be an object.');
		}

		this.addTrack('subtitle', source, metadata);
	}

	private addTrack(type: OutputTrack['type'], source: MediaSource, metadata: object) {
		if (this.started) {
			throw new Error('Cannot add track after output has started.');
		}
		if (source.connectedTrack) {
			throw new Error('Source is already used for a track.');
		}

		const track = {
			id: this.tracks.length + 1,
			output: this,
			type,
			source: source as any,
			metadata
		} as OutputTrack;

		this.muxer.beforeTrackAdd(track);

		this.tracks.push(track);
		source.connectedTrack = track;
	}

	start() {
		if (this.started) {
			throw new Error('Output already started.');
		}

		this.started = true;
		this.muxer.start();

		for (const track of this.tracks) {
			track.source.start();
		}
	}

	async finalize() {
		if (this.finalizing) {
			throw new Error('Cannot call finalize twice.');
		}
		this.finalizing = true;

		const promises = this.tracks.map(x => x.source.flush());
		await Promise.all(promises);

		this.muxer.finalize();

		this.writer.flush();
		this.writer.finalize();
	}
}