import { Output, OutputAudioTrack, OutputSubtitleTrack, OutputTrack, OutputVideoTrack } from "./output";
import { EncodedSubtitleChunk, EncodedSubtitleChunkMetadata } from "./subtitles";

export abstract class Muxer {
	output: Output;

	constructor(output: Output) {
		this.output = output;
	}

	abstract start(): void;
	abstract addEncodedVideoChunk(track: OutputVideoTrack, chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
	abstract addEncodedAudioChunk(track: OutputAudioTrack, chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
	abstract addEncodedSubtitleChunk(track: OutputSubtitleTrack, chunk: EncodedSubtitleChunk, meta?: EncodedSubtitleChunkMetadata): void;
	abstract finalize(): void;

	beforeTrackAdd(track: OutputTrack) {}
	onTrackClose(track: OutputTrack) {}
}