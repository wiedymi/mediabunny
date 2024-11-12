import { Output, OutputAudioTrack, OutputTrack, OutputVideoTrack } from "./output";

export abstract class Muxer {
	output: Output;

	constructor(output: Output) {
		this.output = output;
	}

	abstract start(): void;
	abstract addEncodedVideoChunk(track: OutputVideoTrack, chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
	abstract addEncodedAudioChunk(track: OutputAudioTrack, chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
	abstract finalize(): void;

	beforeTrackAdd(track: OutputTrack) {}
}