import { AsyncMutex } from './misc';
import { Output, OutputAudioTrack, OutputSubtitleTrack, OutputTrack, OutputVideoTrack } from './output';
import { SubtitleCue, SubtitleMetadata } from './subtitles';

export abstract class Muxer {
	output: Output;
	mutex = new AsyncMutex();

	constructor(output: Output) {
		this.output = output;
	}

	abstract start(): Promise<void>;
	abstract addEncodedVideoChunk(
		track: OutputVideoTrack,
		chunk: EncodedVideoChunk,
		meta?: EncodedVideoChunkMetadata
	): Promise<void>;
	abstract addEncodedAudioChunk(
		track: OutputAudioTrack,
		chunk: EncodedAudioChunk,
		meta?: EncodedAudioChunkMetadata
	): Promise<void>;
	abstract addSubtitleCue(track: OutputSubtitleTrack, cue: SubtitleCue, meta?: SubtitleMetadata): Promise<void>;
	abstract finalize(): Promise<void>;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	onTrackClose(track: OutputTrack) {}

	private trackTimestampInfo = new WeakMap<OutputTrack, {
		timestampOffset: number;
		maxTimestamp: number;
		lastKeyFrameTimestamp: number;
	}>();

	abstract timestampsMustStartAtZero: boolean;
	protected validateAndNormalizeTimestamp(track: OutputTrack, rawTimestampInUs: number, isKeyFrame: boolean) {
		let timestampInSeconds = rawTimestampInUs / 1e6;

		let timestampInfo = this.trackTimestampInfo.get(track);
		if (!timestampInfo) {
			if (!isKeyFrame) {
				throw new Error('First frame must be a key frame.');
			}

			if (this.timestampsMustStartAtZero && timestampInSeconds > 0) {
				throw new Error(`Timestamps must start at zero (got ${timestampInSeconds}s).`);
			}

			timestampInfo = {
				timestampOffset: timestampInSeconds,
				maxTimestamp: track.source._offsetTimestamps ? 0 : timestampInSeconds,
				lastKeyFrameTimestamp: track.source._offsetTimestamps ? 0 : timestampInSeconds,
			};
			this.trackTimestampInfo.set(track, timestampInfo);
		}

		if (track.source._offsetTimestamps) {
			timestampInSeconds -= timestampInfo.timestampOffset;
		}

		if (timestampInSeconds < 0) {
			throw new Error(`Timestamps must be non-negative (got ${timestampInSeconds}s).`);
		}

		if (timestampInSeconds < timestampInfo.lastKeyFrameTimestamp) {
			throw new Error(
				`Timestamp cannot be smaller than last key frame's timestamp (got ${timestampInSeconds}s,`
				+ ` last key frame at ${timestampInfo.lastKeyFrameTimestamp}s).`,
			);
		}

		if (isKeyFrame) {
			if (timestampInSeconds < timestampInfo.maxTimestamp) {
				throw new Error(
					`Key frame timestamps cannot be smaller than any timestamp that came before`
					+ ` (got ${timestampInSeconds}s, max timestamp was ${timestampInfo.maxTimestamp}s).`,
				);
			}

			timestampInfo.lastKeyFrameTimestamp = timestampInSeconds;
		}

		timestampInfo.maxTimestamp = Math.max(timestampInfo.maxTimestamp, timestampInSeconds);

		return timestampInSeconds;
	}
}
