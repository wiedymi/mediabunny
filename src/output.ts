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
	rotation?: 0 | 90 | 180 | 270 | TransformationMatrix,
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
		if (options.target.output) {
			throw new Error('Target is already used for another output.');
		}
		options.target.output = this;

		this.writer = options.target.createWriter();
		this.muxer = options.format.createMuxer(this);
	}

	addVideoTrack(source: VideoSource, metadata: VideoTrackMetadata = {}) {
		this.addTrack('video', source, metadata);
	}

	addAudioTrack(source: AudioSource, metadata: AudioTrackMetadata = {}) {
		this.addTrack('audio', source, metadata);
	}

	addSubtitleTrack(source: SubtitleSource, metadata: SubtitleTrackMetadata = {}) {
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
		// TODO: Warn / throw if there are no sources

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
		// TODO: Test what happens when finalizing without a single chunk of media

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