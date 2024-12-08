import { Demuxer } from './demuxer';
import { Input } from './input';
import { IsobmffDemuxer } from './isobmff/isobmff-demuxer';
import { IsobmffReader } from './isobmff/isobmff-reader';
import { MatroskaDemuxer } from './matroska/matroska-demuxer';

export abstract class InputFormat {
	/** @internal */
	abstract _canReadInput(input: Input): Promise<boolean>;

	/** @internal */
	abstract _createDemuxer(input: Input): Demuxer;
}

class IsobmffInputFormat extends InputFormat {
	/** @internal */
	override async _canReadInput(input: Input) {
		const sourceSize = await input._reader.getSourceSize();
		if (sourceSize < 8) {
			return false;
		}

		await input._reader.loadRange(4, 8);

		const isobmffReader = new IsobmffReader(input._reader);
		isobmffReader.pos = 4;
		const fourCc = isobmffReader.readAscii(4);

		return fourCc === 'ftyp';
	}

	override _createDemuxer(input: Input) {
		return new IsobmffDemuxer(input);
	}
}

class MatroskaInputFormat extends InputFormat {
	/** @internal */
	override async _canReadInput() {
		return false; // TODO
	}

	override _createDemuxer(input: Input) {
		return new MatroskaDemuxer(input);
	}
}

export const ISOBMFF = new IsobmffInputFormat();
export const MP4 = ISOBMFF;
export const MOV = ISOBMFF;
export const MATROSKA = new MatroskaInputFormat();
export const MKV = MATROSKA;
export const WEBM = MATROSKA;

export const ALL_FORMATS: InputFormat[] = [ISOBMFF, MKV];
