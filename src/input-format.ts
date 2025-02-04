import { Demuxer } from './demuxer';
import { Input } from './input';
import { IsobmffDemuxer } from './isobmff/isobmff-demuxer';
import { IsobmffReader } from './isobmff/isobmff-reader';
import { EBMLId, EBMLReader } from './matroska/ebml';
import { MatroskaDemuxer } from './matroska/matroska-demuxer';
import { Mp3Demuxer } from './mp3/mp3-demuxer';
import { Mp3Reader } from './mp3/mp3-reader';
import { OggDemuxer } from './ogg/ogg-demuxer';
import { OggReader } from './ogg/ogg-reader';
import { RiffReader } from './wave/riff-reader';
import { WaveDemuxer } from './wave/wave-demuxer';

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
	_createDemuxer(input: Input) {
		return new IsobmffDemuxer(input);
	}
}

/** @public */
export class Mp4InputFormat extends IsobmffInputFormat {
	/** @internal */
	async _canReadInput(input: Input) {
		const majorBrand = await this._getMajorBrand(input);
		return !!majorBrand && majorBrand !== 'qt  ';
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
	async _canReadInput(input: Input) {
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
	protected async isSupportedEBMLOfDocType(input: Input, desiredDocType: string) {
		const sourceSize = await input._mainReader.source._getSize();
		if (sourceSize < 8) {
			return false;
		}

		const ebmlReader = new EBMLReader(input._mainReader);
		const varIntSize = ebmlReader.readVarIntSize();
		if (varIntSize < 1 || varIntSize > 8) {
			return false;
		}

		const id = ebmlReader.readUnsignedInt(varIntSize);
		if (id !== EBMLId.EBML) {
			return false;
		}

		const dataSize = ebmlReader.readElementSize();
		if (dataSize === -1) {
			return false; // Miss me with that shit
		}

		const startPos = ebmlReader.pos;
		while (ebmlReader.pos < startPos + dataSize) {
			const { id, size } = ebmlReader.readElementHeader();
			const dataStartPos = ebmlReader.pos;
			if (size === -1) return false;

			switch (id) {
				case EBMLId.EBMLVersion: {
					const ebmlVersion = ebmlReader.readUnsignedInt(size);
					if (ebmlVersion !== 1) {
						return false;
					}
				}; break;
				case EBMLId.EBMLReadVersion: {
					const ebmlReadVersion = ebmlReader.readUnsignedInt(size);
					if (ebmlReadVersion !== 1) {
						return false;
					}
				}; break;
				case EBMLId.DocType: {
					const docType = ebmlReader.readString(size);
					if (docType !== desiredDocType) {
						return false;
					}
				}; break;
				case EBMLId.DocTypeVersion: {
					const docTypeVersion = ebmlReader.readUnsignedInt(size);
					if (docTypeVersion > 4) { // Support up to Matroska v4
						return false;
					}
				}; break;
			}

			ebmlReader.pos = dataStartPos + size;
		}

		return true;
	}

	/** @internal */
	_canReadInput(input: Input) {
		return this.isSupportedEBMLOfDocType(input, 'matroska');
	}

	/** @internal */
	_createDemuxer(input: Input) {
		return new MatroskaDemuxer(input);
	}

	getName() {
		return 'Matroska';
	}

	getMimeType() {
		return 'video/x-matroska';
	}
}

/** @public */
export class WebMInputFormat extends MatroskaInputFormat {
	/** @internal */
	override _canReadInput(input: Input) {
		return this.isSupportedEBMLOfDocType(input, 'webm');
	}

	override getName() {
		return 'WebM';
	}

	override getMimeType() {
		return 'video/webm';
	}
}

/** @public */
export class Mp3InputFormat extends InputFormat {
	async _canReadInput(input: Input) {
		const sourceSize = await input._mainReader.source._getSize();
		if (sourceSize < 4) {
			return false;
		}

		const mp3Reader = new Mp3Reader(input._mainReader);
		mp3Reader.fileSize = sourceSize;

		const id3Tag = mp3Reader.readId3();

		if (id3Tag) {
			mp3Reader.pos += id3Tag.size;
		}

		const framesStartPos = mp3Reader.pos;
		await mp3Reader.reader.loadRange(mp3Reader.pos, mp3Reader.pos + 4096);

		const firstHeader = mp3Reader.readNextFrameHeader(framesStartPos + 4096);
		if (!firstHeader) {
			return false;
		}

		if (id3Tag) {
			// If there was an ID3 tag at the start, we can be pretty sure this is MP3 by now
			return true;
		}

		// Fine, we found one frame header, but we're still not entirely sure this is MP3. Let's check if we can find
		// another header nearby:
		mp3Reader.pos = firstHeader.startPos + firstHeader.totalSize;
		const secondHeader = mp3Reader.readNextFrameHeader(framesStartPos + 4096);
		if (!secondHeader) {
			return false;
		}

		// In a well-formed MP3 file, we'd expect these two frames to share some similarities:
		if (firstHeader.channel !== secondHeader.channel || firstHeader.sampleRate !== secondHeader.sampleRate) {
			return false;
		}

		// We have found two matching MP3 frames, a strong indicator that this is an MP3 file
		return true;
	}

	/** @internal */
	_createDemuxer(input: Input) {
		return new Mp3Demuxer(input);
	}

	getName() {
		return 'MP3';
	}

	getMimeType() {
		return 'audio/mpeg';
	}
}

/** @public */
export class WaveInputFormat extends InputFormat {
	async _canReadInput(input: Input) {
		const sourceSize = await input._mainReader.source._getSize();
		if (sourceSize < 12) {
			return false;
		}

		const riffReader = new RiffReader(input._mainReader);
		const riffType = riffReader.readAscii(4);
		if (riffType !== 'RIFF' && riffType !== 'RIFX') {
			return false;
		}

		riffReader.pos = 8;
		const format = riffReader.readAscii(4);
		return format === 'WAVE';
	}

	/** @internal */
	_createDemuxer(input: Input) {
		return new WaveDemuxer(input);
	}

	getName() {
		return 'WAVE';
	}

	getMimeType() {
		return 'audio/wav';
	}
}

/** @public */
export class OggInputFormat extends InputFormat {
	async _canReadInput(input: Input) {
		const sourceSize = await input._mainReader.source._getSize();
		if (sourceSize < 4) {
			return false;
		}

		const oggReader = new OggReader(input._mainReader);
		return oggReader.readAscii(4) === 'OggS';
	}

	/** @internal */
	_createDemuxer(input: Input) {
		return new OggDemuxer(input);
	}

	getName() {
		return 'Ogg';
	}

	getMimeType() {
		return 'application/ogg';
	}
}

/** @public */
export const MP4 = new Mp4InputFormat();
/** @public */
export const QTFF = new QuickTimeInputFormat();
/** @public */
export const MATROSKA = new MatroskaInputFormat();
/** @public */
export const WEBM = new WebMInputFormat();
/** @public */
export const MP3 = new Mp3InputFormat();
/** @public */
export const WAVE = new WaveInputFormat();
/** @public */
export const OGG = new OggInputFormat();

/** @public */
export const ALL_FORMATS: InputFormat[] = [MP4, QTFF, MATROSKA, WEBM, WAVE, OGG, MP3];
