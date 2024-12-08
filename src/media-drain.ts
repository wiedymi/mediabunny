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

	async* chunks(startTimestamp = 0) {
		let chunk = await this.getChunk(startTimestamp); // Not necessarily correct if there is no chunk at timestamp 0
		while (chunk) {
			yield chunk;
			chunk = await this.getNextChunk(chunk);
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

	async* frames(startTimestamp = 0) {
		const frameQueue: VideoFrame[] = [];
		let firstFrameQueued = false;
		let lastFrame: VideoFrame | null = null;
		let { promise: queueNonEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
		let ended = false;

		const decoder = await this.createDecoder((frame) => {
			if (ended) {
				frame.close();
				return;
			}

			const frameTimestamp = frame.timestamp / 1e6;

			if (lastFrame) {
				if (frameTimestamp > startTimestamp) {
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
				({ promise: queueNonEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
			}
		});

		const keyChunk = await this.videoTrack._backing.getKeyChunk(startTimestamp);
		if (!keyChunk) {
			return;
		}

		let decoderIsFlushed = false;

		// The following is the "pump" process that keeps pumping chunks into the decoder
		void (async () => {
			let currentChunk: EncodedVideoChunk | null = keyChunk;

			while (currentChunk && !ended) {
				decoder.decode(currentChunk);

				if (decoder.decodeQueueSize >= 10) {
					await new Promise(resolve => decoder.addEventListener('dequeue', resolve, { once: true }));
				}

				const nextChunk = await this.videoTrack._backing.getNextChunk(currentChunk);
				currentChunk = nextChunk;
			}

			await decoder.flush();
			decoder.close();

			decoderIsFlushed = true;
			onQueueNotEmpty(); // To unstuck the generator
		})();

		try {
			while (true) {
				if (frameQueue.length > 0) {
					yield frameQueue.shift()!;
				} else if (!decoderIsFlushed) {
					await queueNonEmpty;
				} else {
					break;
				}
			}
		} finally {
			ended = true;
		}
	}
}
