import { IsobmffMuxer } from "./isobmff/isobmff_muxer";
import { Muxer } from "./muxer";
import { Output } from "./output";

export abstract class OutputFormat {
	abstract createMuxer(output: Output): Muxer;
}

export class Mp4OutputFormat extends OutputFormat {
	constructor(public options: {
		fastStart: false | 'in-memory' | 'fragmented' | {
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
