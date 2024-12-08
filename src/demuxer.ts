import { Input } from './input';
import { InputTrack } from './input-track';

export abstract class Demuxer {
	input: Input;

	constructor(input: Input) {
		this.input = input;
	}

	abstract getDuration(): Promise<number>;
	abstract getTracks(): Promise<InputTrack[]>;
	abstract getMimeType(): Promise<string>;
}
