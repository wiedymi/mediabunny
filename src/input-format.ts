import { Demuxer } from './demuxer';
import { Input } from './input';
import { IsobmffDemuxer } from './isobmff/isobmff-demuxer';
import { IsobmffReader } from './isobmff/isobmff-reader';

/** @public */
export abstract class InputFormat {
	/** @internal */
	abstract _canReadInput(input: Input): Promise<boolean>;

	/** @internal */
	abstract _createDemuxer(input: Input): Demuxer;
}

/** @public */
export class IsobmffInputFormat extends InputFormat {
	/** @internal */
	override async _canReadInput(input: Input) {
		const sourceSize = await input._mainReader.source._getSize();
		if (sourceSize < 8) {
			return false;
		}

		const isobmffReader = new IsobmffReader(input._mainReader);
		isobmffReader.pos = 4;
		const fourCc = isobmffReader.readAscii(4);

		return fourCc === 'ftyp';
	}

	/** @internal */
	override _createDemuxer(input: Input) {
		return new IsobmffDemuxer(input);
	}
}

/** @public */
export class MatroskaInputFormat extends InputFormat {
	/** @internal */
	override async _canReadInput() {
		return false; // TODO
	}

	/** @internal */
	override _createDemuxer(): never {
		throw new Error('Not implemented');
	}
}

/** @public */
export const ISOBMFF = new IsobmffInputFormat();
/** @public */
export const MP4 = ISOBMFF;
/** @public */
export const MOV = ISOBMFF;
/** @public */
export const MATROSKA = new MatroskaInputFormat();
/** @public */
export const MKV = MATROSKA;
/** @public */
export const WEBM = MATROSKA;

/** @public */
export const ALL_FORMATS: InputFormat[] = [ISOBMFF, MKV];
