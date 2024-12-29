import { Demuxer } from './demuxer';
import { InputFormat } from './input-format';
import { assert } from './misc';
import { Reader } from './reader';
import { Source } from './source';

/** @public */
export type InputOptions = {
	formats: InputFormat[];
	source: Source;
};

/** @public */
export class Input {
	/** @internal */
	_source: Source;
	/** @internal */
	_formats: InputFormat[];
	/** @internal */
	_mainReader: Reader;
	/** @internal */
	_demuxerPromise: Promise<Demuxer> | null = null;
	/** @internal */
	_format: InputFormat | null = null;

	constructor(options: InputOptions) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('options must be an object.');
		}
		if (!Array.isArray(options.formats) || options.formats.some(x => !(x instanceof InputFormat))) {
			throw new TypeError('options.formats must be an array of InputFormat.');
		}
		if (!(options.source instanceof Source)) {
			throw new TypeError('options.source must be a Source.');
		}

		this._formats = options.formats;
		this._source = options.source;
		this._mainReader = new Reader(options.source);
	}

	/** @internal */
	_getDemuxer() {
		return this._demuxerPromise ??= (async () => {
			await this._mainReader.loadRange(0, 4096); // Load the first 4 kiB so we can determine the format

			for (const format of this._formats) {
				const canRead = await format._canReadInput(this);
				if (canRead) {
					this._format = format;
					return format._createDemuxer(this);
				}
			}

			throw new Error('Input has an unrecognizable format.');
		})();
	}

	async getFormat() {
		await this._getDemuxer();
		assert(this._format!);
		return this._format;
	}

	async computeDuration() {
		const demuxer = await this._getDemuxer();
		return demuxer.computeDuration();
	}

	async getTracks() {
		const demuxer = await this._getDemuxer();
		return demuxer.getTracks();
	}

	async getVideoTracks() {
		const tracks = await this.getTracks();
		return tracks.filter(x => x.isVideoTrack());
	}

	async getPrimaryVideoTrack() {
		const tracks = await this.getTracks();
		return tracks.find(x => x.isVideoTrack()) ?? null;
	}

	async getAudioTracks() {
		const tracks = await this.getTracks();
		return tracks.filter(x => x.isAudioTrack());
	}

	async getPrimaryAudioTrack() {
		const tracks = await this.getTracks();
		return tracks.find(x => x.isAudioTrack()) ?? null;
	}

	async getMimeType() {
		const demuxer = await this._getDemuxer();
		return demuxer.getMimeType();
	}
}
