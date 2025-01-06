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

	abstract getName(): string;
	abstract getMimeType(): string;
}

/** @public */
export abstract class IsobmffInputFormat extends InputFormat {
	protected async _getMajorBrand(input: Input) {
		const sourceSize = await input._mainReader.source._getSize();
		if (sourceSize < 12) {
			return null;
		}

		const isobmffReader = new IsobmffReader(input._mainReader);
		isobmffReader.pos = 4;
		const fourCc = isobmffReader.readAscii(4);

		if (fourCc !== 'ftyp') {
			return null;
		}

		return isobmffReader.readAscii(4);
	}

	/** @internal */
	override _createDemuxer(input: Input) {
		return new IsobmffDemuxer(input);
	}
}

/** @public */
export class Mp4InputFormat extends IsobmffInputFormat {
	/** @internal */
	override async _canReadInput(input: Input) {
		const majorBrand = await this._getMajorBrand(input);
		return majorBrand !== 'qt  ';
	}

	getName() {
		return 'MP4';
	}

	getMimeType() {
		return 'video/mp4';
	}
}

/** @public */
export class QuickTimeInputFormat extends IsobmffInputFormat {
	/** @internal */
	override async _canReadInput(input: Input) {
		const majorBrand = await this._getMajorBrand(input);
		return majorBrand === 'qt  ';
	}

	getName() {
		return 'QuickTime File Format';
	}

	getMimeType() {
		return 'video/quicktime';
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

	getName() {
		return 'Matroska';
	}

	getMimeType() {
		return 'video/x-matroska';
	}
}

/** @public */
export const MP4 = new Mp4InputFormat();
/** @public */
export const QTFF = new QuickTimeInputFormat();
/** @public */
export const MATROSKA = new MatroskaInputFormat();
/** @public */
export const WEBM = MATROSKA;

/** @public */
export const ALL_FORMATS: InputFormat[] = [MP4, QTFF, MATROSKA];
