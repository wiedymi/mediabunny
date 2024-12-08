import { assert, binarySearchLessOrEqual, removeItem } from './misc';
import { Source } from './source';

const PAGE_SIZE = 4096;

type ReadSegment = {
	start: number;
	end: number;
	bytes: Uint8Array;
	view: DataView;
	age: number;
};

type LoadingSegment = {
	start: number;
	end: number;
	promise: Promise<Uint8Array>;
};

export class Reader {
	loadedSegments: ReadSegment[] = [];
	loadingSegments: LoadingSegment[] = [];
	sourceSizePromise: Promise<number> | null = null;
	nextAge = 0;
	totalStoredBytes = 0;

	constructor(public source: Source, public maxStorableBytes = Infinity) {}

	async loadRange(start: number, end: number) {
		// Read rounded to the nearest page
		const alignedStart = Math.floor(start / PAGE_SIZE) * PAGE_SIZE;
		let alignedEnd = Math.ceil(end / PAGE_SIZE) * PAGE_SIZE;
		alignedEnd = Math.min(alignedEnd, await this.source._getSize());

		const matchingLoadingSegment = this.loadingSegments.find(x => x.start <= alignedStart && x.end >= alignedEnd);
		if (matchingLoadingSegment) {
			// Simply wait for the existing promise to finish to avoid loading the same range twice
			await matchingLoadingSegment.promise;
			return;
		}

		const encasingSegmentExists = this.loadedSegments.some(x => x.start <= alignedStart && x.end >= alignedEnd);
		if (encasingSegmentExists) {
			// Nothing to load
			return;
		}

		const bytesPromise = this.source._read(alignedStart, alignedEnd);
		const loadingSegment: LoadingSegment = { start: alignedStart, end: alignedEnd, promise: bytesPromise };
		this.loadingSegments.push(loadingSegment);

		const bytes = await bytesPromise;
		removeItem(this.loadingSegments, loadingSegment);

		this.insertIntoLoadedSegments(alignedStart, bytes);
	}

	private insertIntoLoadedSegments(start: number, bytes: Uint8Array) {
		const segment: ReadSegment = {
			start,
			end: start + bytes.byteLength,
			bytes,
			view: new DataView(bytes.buffer),
			age: this.nextAge++,
		};

		let index = binarySearchLessOrEqual(this.loadedSegments, start, x => x.start);
		if (index === -1 || this.loadedSegments[index]!.start < segment.start) {
			index++;
		}

		// Insert the segment at the right place so that the array remains sorted by start offset
		this.loadedSegments.splice(index, 0, segment);
		this.totalStoredBytes += bytes.byteLength;

		// Remove all other segments from the array that are completely covered by the newly-inserted segment
		for (let i = index + 1; i < this.loadedSegments.length; i++) {
			const otherSegment = this.loadedSegments[i]!;
			if (otherSegment.start >= segment.end) {
				break;
			}

			if (segment.start <= otherSegment.start && otherSegment.end <= segment.end) {
				this.loadedSegments.splice(i, 1);
				i--;
			}
		}

		// If we overshoot the max amount of permitted bytes, let's start evicting the oldest segments
		while (this.totalStoredBytes > this.maxStorableBytes && this.loadedSegments.length > 1) {
			let oldestSegment: ReadSegment | null = null;
			let oldestSegmentIndex = -1;

			for (let i = 0; i < this.loadedSegments.length; i++) {
				const candidate = this.loadedSegments[i]!;
				if (!oldestSegment || candidate.age < oldestSegment.age) {
					oldestSegment = candidate;
					oldestSegmentIndex = i;
				}
			}

			assert(oldestSegment);

			this.totalStoredBytes -= oldestSegment.bytes.byteLength;
			this.loadedSegments.splice(oldestSegmentIndex, 1);
		}
	}

	getViewAndOffset(start: number, end: number) {
		const startIndex = binarySearchLessOrEqual(this.loadedSegments, start, x => x.start);
		let segment: ReadSegment | null = null;

		if (startIndex !== -1) {
			for (let i = startIndex; i < this.loadedSegments.length; i++) {
				const candidate = this.loadedSegments[i]!;

				if (candidate.start > start) {
					break;
				}

				if (end <= candidate.end) {
					segment = candidate;
					break;
				}
			}
		}

		if (!segment) {
			throw new Error(`No segment loaded for range [${start}, ${end}).`);
		}

		segment.age = this.nextAge++;

		return {
			view: segment.view,
			offset: segment.bytes.byteOffset + start - segment.start,
		};
	}
}
