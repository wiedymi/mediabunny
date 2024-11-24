import { IsobmffMuxer } from "./isobmff/isobmff_muxer";
import { MatroskaMuxer } from "./matroska/matroska_muxer";
import { Muxer } from "./muxer";
import { Output } from "./output";

export abstract class OutputFormat {
	abstract createMuxer(output: Output): Muxer;
}

export class Mp4OutputFormat extends OutputFormat {
	constructor(public options: {
		// TODO: Make this optional with a smart default
		fastStart: false | 'in-memory' | 'fragmented' | {
			// TODO: This is too simple now that multiple tracks can exist.
			expectedVideoChunks?: number,
			expectedAudioChunks?: number
		},
	}) {
		super();
	}

	override createMuxer(output: Output) {
		return new IsobmffMuxer(output, this);
	}
}

export class MkvOutputFormat extends OutputFormat {
	constructor(public options: {
		streaming?: boolean // TODO: Is there a better name?
	} = {}) {
		super();
	}

	override createMuxer(output: Output) {
		return new MatroskaMuxer(output, this);
	}
}

export class WebMOutputFormat extends MkvOutputFormat {}