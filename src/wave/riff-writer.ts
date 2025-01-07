import { Writer } from '../writer';

export class RiffWriter {
	private helper = new Uint8Array(8);
	private helperView = new DataView(this.helper.buffer);

	constructor(private writer: Writer) {}

	writeU32(value: number) {
		this.helperView.setUint32(0, value, true);
		this.writer.write(this.helper.subarray(0, 4));
	}

	writeU16(value: number) {
		this.helperView.setUint16(0, value, true);
		this.writer.write(this.helper.subarray(0, 2));
	}

	writeAscii(text: string) {
		this.writer.write(new TextEncoder().encode(text));
	}
}
