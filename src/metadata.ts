// TODO: Give this a different name. This clashes with a web concept. Question is, what?

export type MediaMetadata = {
	title?: string;
	description?: string;
	artist?: string;
	album?: string;
	albumArtist?: string;
	trackNumber?: number;
	trackNumberMax?: number;
	discNumber?: number;
	discNumberMax?: number;
	genre?: string;
	date?: Date;
	lyrics?: string;
	images?: {
		data: Uint8Array;
		mimeType: string;
		kind: 'coverFront' | 'coverBack' | 'unknown';
		name?: string;
		description?: string;
	}[];
	comment?: string;
	raw?: Record<string, string | Uint8Array | RichImageData | null>;
};

export class RichImageData {
	constructor(public data: Uint8Array, public mimeType: string) {}
}

export const validateMediaMetadata = (metadata: MediaMetadata) => {
	if (!metadata || typeof metadata !== 'object') {
		throw new TypeError('metadata must be an object.');
	}
	if (metadata.title !== undefined && typeof metadata.title !== 'string') {
		throw new TypeError('metadata.title, when provided, must be a string.');
	}
	if (metadata.description !== undefined && typeof metadata.description !== 'string') {
		throw new TypeError('metadata.description, when provided, must be a string.');
	}
	if (metadata.artist !== undefined && typeof metadata.artist !== 'string') {
		throw new TypeError('metadata.artist, when provided, must be a string.');
	}
	if (metadata.album !== undefined && typeof metadata.album !== 'string') {
		throw new TypeError('metadata.album, when provided, must be a string.');
	}
	if (metadata.albumArtist !== undefined && typeof metadata.albumArtist !== 'string') {
		throw new TypeError('metadata.albumArtist, when provided, must be a string.');
	}
	if (metadata.trackNumber !== undefined && (!Number.isInteger(metadata.trackNumber) || metadata.trackNumber <= 0)) {
		throw new TypeError('metadata.trackNumber, when provided, must be a positive integer.');
	}
	if (
		metadata.trackNumberMax !== undefined
		&& (!Number.isInteger(metadata.trackNumberMax) || metadata.trackNumberMax <= 0)
	) {
		throw new TypeError('metadata.trackNumberMax, when provided, must be a positive integer.');
	}
	if (metadata.discNumber !== undefined && (!Number.isInteger(metadata.discNumber) || metadata.discNumber <= 0)) {
		throw new TypeError('metadata.discNumber, when provided, must be a positive integer.');
	}
	if (
		metadata.discNumberMax !== undefined
		&& (!Number.isInteger(metadata.discNumberMax) || metadata.discNumberMax <= 0)
	) {
		throw new TypeError('metadata.discNumberMax, when provided, must be a positive integer.');
	}
	if (metadata.genre !== undefined && typeof metadata.genre !== 'string') {
		throw new TypeError('metadata.genre, when provided, must be a string.');
	}
	if (metadata.date !== undefined && (!(metadata.date instanceof Date) || Number.isNaN(metadata.date.getTime()))) {
		throw new TypeError('metadata.date, when provided, must be a valid Date.');
	}
	if (metadata.lyrics !== undefined && typeof metadata.lyrics !== 'string') {
		throw new TypeError('metadata.lyrics, when provided, must be a string.');
	}
	if (metadata.images !== undefined) {
		if (!Array.isArray(metadata.images)) {
			throw new TypeError('metadata.images, when provided, must be an array.');
		}
		for (const image of metadata.images) {
			if (!image || typeof image !== 'object') {
				throw new TypeError('Each image in metadata.images must be an object.');
			}
			if (!(image.data instanceof Uint8Array)) {
				throw new TypeError('Each image.data must be a Uint8Array.');
			}
			if (typeof image.mimeType !== 'string') {
				throw new TypeError('Each image.mimeType must be a string.');
			}
			if (!['coverFront', 'coverBack', 'other'].includes(image.kind)) {
				throw new TypeError('Each image.kind must be \'coverFront\', \'coverBack\', or \'other\'.');
			}
		}
	}
	if (metadata.comment !== undefined && typeof metadata.comment !== 'string') {
		throw new TypeError('metadata.comment, when provided, must be a string.');
	}
	if (metadata.raw !== undefined) {
		if (!metadata.raw || typeof metadata.raw !== 'object') {
			throw new TypeError('metadata.raw, when provided, must be an object.');
		}

		for (const value of Object.values(metadata.raw)) {
			if (
				value !== null
				&& typeof value !== 'string'
				&& !(value instanceof Uint8Array)
				&& !(value instanceof RichImageData)
			) {
				throw new TypeError(
					'Each value in metadata.raw must be a string, Uint8Array, RichImageData, or null.',
				);
			}
		}
	}
};

export const mediaMetadataIsEmpty = (metadata: MediaMetadata) => {
	return metadata.title === undefined
		&& metadata.description === undefined
		&& metadata.artist === undefined
		&& metadata.album === undefined
		&& metadata.albumArtist === undefined
		&& metadata.trackNumber === undefined
		&& metadata.trackNumberMax === undefined
		&& metadata.discNumber === undefined
		&& metadata.discNumberMax === undefined
		&& metadata.genre === undefined
		&& metadata.date === undefined
		&& metadata.lyrics === undefined
		&& (!metadata.images || metadata.images.length === 0)
		&& metadata.comment === undefined
		&& (metadata.raw === undefined || Object.keys(metadata.raw).length === 0);
};
