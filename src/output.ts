import { Muxer } from "./muxer";
import { OutputFormat } from "./output_format";
import { AudioSource, VideoSource } from "./source";
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
	source: VideoSource
} | {
	type: 'audio',
	source: AudioSource
});

export type OutputVideoTrack = OutputTrack & { type: 'video' };
export type OutputAudioTrack = OutputTrack & { type: 'audio' };

export class Output {
	muxer: Muxer;
	writer: Writer;
	tracks: OutputTrack[] = [];
	started = false;
	finalizing = false;

	constructor(options: OutputOptions) {
		this.writer = options.target.createWriter();
		this.muxer = options.format.createMuxer(this);
	}

	addTrack(source: VideoSource | AudioSource) {
		if (this.started) {
			throw new Error('Cannot add track after output has started.');
		}
		if (source.connectedTrack) {
			throw new Error('Source is already used for a track.');
		}

		const track = {
			id: this.tracks.length + 1,
			output: this,
			type: source instanceof VideoSource ? 'video' : 'audio',
			source
		} as OutputTrack;

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