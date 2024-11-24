export type SubtitleCue = {
	timestamp: number, // in seconds
	duration: number, // in seconds
	text: string,
	identifier?: string,
	settings?: string,
	notes?: string
};

export type SubtitleConfig = {
	description: string
};

export type SubtitleMetadata = {
	config?: SubtitleConfig
};

type SubtitleParserOptions = {
	codec: 'webvtt',
	output: (cue: SubtitleCue, metadata: SubtitleMetadata) => unknown,
	error: (error: Error) => unknown
};

const cueBlockHeaderRegex = /(?:(.+?)\n)?((?:\d{2}:)?\d{2}:\d{2}.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}.\d{3})/g;
const preambleStartRegex = /^WEBVTT(.|\n)*?\n{2}/;
export const inlineTimestampRegex = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g;

export class SubtitleParser {
	#options: SubtitleParserOptions;
	#preambleText: string | null = null;
	#preambleEmitted = false;

	constructor(options: SubtitleParserOptions) {
		this.#options = options;
	}

	parse(text: string) {
		text = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

		cueBlockHeaderRegex.lastIndex = 0;
		let match: RegExpMatchArray | null;

		if (!this.#preambleText) {
			if (!preambleStartRegex.test(text)) {
				let error = new Error('WebVTT preamble incorrect.');
				this.#options.error(error);
				throw error;
			}

			match = cueBlockHeaderRegex.exec(text);
			let preamble = text.slice(0, match?.index ?? text.length).trimEnd();

			if (!preamble) {
				let error = new Error('No WebVTT preamble provided.');
				this.#options.error(error);
				throw error;
			}

			this.#preambleText = preamble;

			if (match) {
				text = text.slice(match.index);
				cueBlockHeaderRegex.lastIndex = 0;
			}
		}

		while (match = cueBlockHeaderRegex.exec(text)) {
			let notes = text.slice(0, match.index);
			let cueIdentifier = match[1];
			let matchEnd = match.index! + match[0].length;
			let bodyStart = text.indexOf('\n', matchEnd) + 1;
			let cueSettings = text.slice(matchEnd, bodyStart).trim();
			let bodyEnd = text.indexOf('\n\n', matchEnd);
			if (bodyEnd === -1) bodyEnd = text.length;

			let startTime = parseSubtitleTimestamp(match[2]!);
			let endTime = parseSubtitleTimestamp(match[3]!);
			let duration = endTime - startTime;

			let body = text.slice(bodyStart, bodyEnd).trim();

			text = text.slice(bodyEnd).trimStart();
			cueBlockHeaderRegex.lastIndex = 0;

			let cue: SubtitleCue = {
				timestamp: startTime / 1000,
				duration: duration / 1000,
				text: body,
				identifier: cueIdentifier,
				settings: cueSettings,
				notes
			};

			let meta: SubtitleMetadata = {};
			if (!this.#preambleEmitted) {
				meta.config = {
					description: this.#preambleText
				};
				this.#preambleEmitted = true;
			}

			this.#options.output(cue, meta);
		}
	}
}

const timestampRegex = /(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})/;
export const parseSubtitleTimestamp = (string: string) => {
	let match = timestampRegex.exec(string);
	if (!match) throw new Error('Expected match.');

	return 60 * 60 * 1000 * Number(match[1] || '0') +
		60 * 1000 * Number(match[2]) +
		1000 * Number(match[3]) +
		Number(match[4]);
};

export const formatSubtitleTimestamp = (timestamp: number) => {
	let hours = Math.floor(timestamp / (60 * 60 * 1000));
	let minutes = Math.floor((timestamp % (60 * 60 * 1000)) / (60 * 1000));
	let seconds = Math.floor((timestamp % (60 * 1000)) / 1000);
	let milliseconds = timestamp % 1000;

	return hours.toString().padStart(2, '0') + ':' +
		minutes.toString().padStart(2, '0') + ':' +
		seconds.toString().padStart(2, '0') + '.' +
		milliseconds.toString().padStart(3, '0');
};