import { InputVideoTrack } from './input-track';
import { assert, promiseWithResolvers } from './misc';

export class EncodedVideoChunkDrain {
	constructor(public videoTrack: InputVideoTrack) {}

	getFirstChunk() {
		return this.videoTrack._backing.getFirstChunk();
	}

	getChunk(timestamp: number) {
		return this.videoTrack._backing.getChunk(timestamp);
	}

	getNextChunk(chunk: EncodedVideoChunk) {
		return this.videoTrack._backing.getNextChunk(chunk);
	}

	getKeyChunk(timestamp: number) {
		return this.videoTrack._backing.getKeyChunk(timestamp);
	}

	getNextKeyChunk(chunk: EncodedVideoChunk) {
		return this.videoTrack._backing.getNextKeyChunk(chunk);
	}

	async* chunks(startChunk?: EncodedVideoChunk, endTimestamp = Infinity) {
		const chunkQueue: EncodedVideoChunk[] = [];

		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
		let ended = false;

		const timestamps: number[] = [];
		// The queue should always be big enough to hold 1 second worth of chunks
		const maxQueueSize = () => Math.max(2, timestamps.length);

		// The following is the "pump" process that keeps pumping chunks into the queue
		void (async () => {
			let chunk = startChunk ?? await this.getFirstChunk();

			while (chunk && !ended) {
				if (chunk.timestamp / 1e6 >= endTimestamp) {
					break;
				}

				if (chunkQueue.length > maxQueueSize()) {
					({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
					await queueDequeue;
					continue;
				}

				chunkQueue.push(chunk);

				onQueueNotEmpty();
				({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());

				chunk = await this.getNextChunk(chunk);
			}

			ended = true;
			onQueueNotEmpty();
		})();

		try {
			while (true) {
				if (chunkQueue.length > 0) {
					yield chunkQueue.shift()!;
					const now = performance.now();
					timestamps.push(now);

					while (timestamps.length > 0 && now - timestamps[0]! >= 1000) {
						timestamps.shift();
					}

					onQueueDequeue();
				} else if (!ended) {
					await queueNotEmpty;
				} else {
					break;
				}
			}
		} finally {
			ended = true;
			onQueueDequeue();
		}
	}
}

export class VideoFrameDrain {
	decoderConfig: VideoDecoderConfig | null = null;

	constructor(public videoTrack: InputVideoTrack) {}

	async createDecoder(onFrame: (frame: VideoFrame) => unknown) {
		if (!this.decoderConfig) {
			this.decoderConfig = await this.videoTrack.getDecoderConfig();
		}

		const decoder = new VideoDecoder({
			output: onFrame,
			error: error => console.error(error),
		});
		decoder.configure(this.decoderConfig);

		return decoder;
	}

	async getKeyFrame(timestamp: number) {
		let result: VideoFrame | null = null;

		const decoder = await this.createDecoder(frame => result = frame);
		const chunk = await this.videoTrack._backing.getKeyChunk(timestamp);
		if (!chunk) {
			return null;
		}

		decoder.decode(chunk);

		await decoder.flush();
		decoder.close();

		return result;
	}

	async getFrame(timestamp: number) {
		let result: VideoFrame | null = null;

		const decoder = await this.createDecoder((frame) => {
			if (frame.timestamp / 1e6 <= timestamp) {
				result?.close();
				result = frame;
			} else {
				frame.close();
			}
		});
		const keyChunk = await this.videoTrack._backing.getKeyChunk(timestamp);
		if (!keyChunk) {
			return null;
		}

		const targetChunk = await this.videoTrack._backing.getChunk(timestamp);
		assert(targetChunk);

		decoder.decode(keyChunk);

		let currentChunk = keyChunk;
		while (currentChunk !== targetChunk) {
			const nextChunk = await this.videoTrack._backing.getNextChunk(currentChunk);
			assert(nextChunk);

			currentChunk = nextChunk;
			decoder.decode(nextChunk);

			if (decoder.decodeQueueSize >= 10) {
				await new Promise(resolve => decoder.addEventListener('dequeue', resolve, { once: true }));
			}
		}

		await decoder.flush();
		decoder.close();

		return result;
	}

	async* frames(startTimestamp = 0, endTimestamp = Infinity) {
		const frameQueue: VideoFrame[] = [];
		let firstFrameQueued = false;
		let lastFrame: VideoFrame | null = null;
		let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let ended = false;

		const decoder = await this.createDecoder((frame) => {
			const frameTimestamp = frame.timestamp / 1e6;

			if (frameTimestamp >= endTimestamp) {
				ended = true;
			}

			if (ended) {
				frame.close();
				return;
			}

			if (lastFrame) {
				if (frameTimestamp > startTimestamp) {
					// We don't know ahead of time what the first frame is. This is because the first frame is the last
					// frame whose timestamp is less than or equal to the start timestamp. Therefore we need to wait
					// for the first frame after the start timestamp, and then we'll know that the previous frame was
					// the first frame.
					frameQueue.push(lastFrame);
					firstFrameQueued = true;
				} else {
					lastFrame.close();
				}
			}

			if (frameTimestamp >= startTimestamp) {
				frameQueue.push(frame);
				firstFrameQueued = true;
			}

			lastFrame = firstFrameQueued ? null : frame;

			if (frameQueue.length > 0) {
				onQueueNotEmpty();
				({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
			}
		});

		const keyChunk = await this.videoTrack._backing.getKeyChunk(startTimestamp)
			?? await this.videoTrack._backing.getFirstChunk();
		if (!keyChunk) {
			return;
		}

		let decoderIsFlushed = false;

		// The following is the "pump" process that keeps pumping chunks into the decoder
		void (async () => {
			let currentChunk: EncodedVideoChunk | null = keyChunk;

			let chunksEndTimestamp = Infinity;
			if (endTimestamp < Infinity) {
				// When an end timestamp is set, we cannot simply use that for the chunk iterator due to out-of-order
				// frames (B-frames). Instead, we'll need to keep decoding chunks until we get a frame that exceeds
				// this end time. However, we can still put a bound on it: Since key frames are by definition never
				// out of order, we can stop at the first key frame after the end timestamp.
				const endFrame = await this.videoTrack._backing.getChunk(endTimestamp);
				const endKeyFrame = !endFrame
					? null
					: endFrame.type === 'key' && endFrame.timestamp / 1e6 === endTimestamp
						? endFrame
						: await this.videoTrack._backing.getNextKeyChunk(endFrame);

				if (endKeyFrame) {
					chunksEndTimestamp = endKeyFrame.timestamp / 1e6;
				}
			}

			const chunkDrain = new EncodedVideoChunkDrain(this.videoTrack);
			const chunks = chunkDrain.chunks(keyChunk, chunksEndTimestamp);
			await chunks.next();

			while (currentChunk && !ended) {
				decoder.decode(currentChunk);

				if (decoder.decodeQueueSize >= 10) {
					await new Promise(resolve => decoder.addEventListener('dequeue', resolve, { once: true }));
				}

				const chunkResult = await chunks.next();
				if (chunkResult.done) {
					break;
				}

				currentChunk = chunkResult.value;
			}

			await chunks.return();

			await decoder.flush();
			decoder.close();

			if (!firstFrameQueued && lastFrame) {
				frameQueue.push(lastFrame);
			}

			decoderIsFlushed = true;
			onQueueNotEmpty(); // To unstuck the generator
		})();

		try {
			while (true) {
				if (frameQueue.length > 0) {
					yield frameQueue.shift()!;
				} else if (!decoderIsFlushed) {
					await queueNotEmpty;
				} else {
					break;
				}
			}
		} finally {
			ended = true;
		}
	}
}
