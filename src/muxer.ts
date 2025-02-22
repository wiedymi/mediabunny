import { AsyncMutex } from './misc';
import { Output, OutputAudioTrack, OutputSubtitleTrack, OutputTrack, OutputVideoTrack } from './output';
import { EncodedPacket } from './packet';
import { SubtitleCue, SubtitleMetadata } from './subtitles';

export abstract class Muxer {
	output: Output;
	mutex = new AsyncMutex();

	constructor(output: Output) {
		this.output = output;
	}

	abstract start(): Promise<void>;
	abstract addEncodedVideoPacket(
		track: OutputVideoTrack,
		packet: EncodedPacket,
		meta?: EncodedVideoChunkMetadata
	): Promise<void>;
	abstract addEncodedAudioPacket(
		track: OutputAudioTrack,
		packet: EncodedPacket,
		meta?: EncodedAudioChunkMetadata
	): Promise<void>;
	abstract addSubtitleCue(track: OutputSubtitleTrack, cue: SubtitleCue, meta?: SubtitleMetadata): Promise<void>;
	abstract finalize(): Promise<void>;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	onTrackClose(track: OutputTrack) {}

	private trackTimestampInfo = new WeakMap<OutputTrack, {
		timestampOffset: number;
		maxTimestamp: number;
		maxTimestampBeforeLastKeyFrame: number;
	}>();

	protected validateAndNormalizeTimestamp(track: OutputTrack, timestampInSeconds: number, isKeyFrame: boolean) {
		let timestampInfo = this.trackTimestampInfo.get(track);
		if (!timestampInfo) {
			if (!isKeyFrame) {
				throw new Error('First frame must be a key frame.');
			}

			timestampInfo = {
				timestampOffset: timestampInSeconds,
				maxTimestamp: track.source._offsetTimestamps ? 0 : timestampInSeconds,
				maxTimestampBeforeLastKeyFrame: track.source._offsetTimestamps ? 0 : timestampInSeconds,
			};
			this.trackTimestampInfo.set(track, timestampInfo);
		}

		if (track.source._offsetTimestamps) {
			timestampInSeconds -= timestampInfo.timestampOffset;
		}

		if (timestampInSeconds < 0) {
			throw new Error(`Timestamps must be non-negative (got ${timestampInSeconds}s).`);
		}

		if (isKeyFrame) {
			timestampInfo.maxTimestampBeforeLastKeyFrame = timestampInfo.maxTimestamp;
		}

		if (timestampInSeconds < timestampInfo.maxTimestampBeforeLastKeyFrame) {
			throw new Error(
				`Timestamps cannot be smaller than the highest timestamp of the previous run (a run begins with a`
				+ ` key frame and ends right before the next key frame). Got ${timestampInSeconds}s, but highest`
				+ ` timestamp is ${timestampInfo.maxTimestampBeforeLastKeyFrame}s.`,
			);
		}

		timestampInfo.maxTimestamp = Math.max(timestampInfo.maxTimestamp, timestampInSeconds);

		return timestampInSeconds;
	}
}
