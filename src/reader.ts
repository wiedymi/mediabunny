import { Source } from './source';

const PAGE_SIZE = 4096;

type ReadSegment = {
	start: number;
	end: number;
	bytes: Uint8Array;
	view: DataView;
};

export class Reader {
	loadedSegments: ReadSegment[] = [];
	sourceSizePromise: Promise<number> | null = null;

	constructor(public source: Source) {}

	getSourceSize() {
		if (this.sourceSizePromise) {
			return this.sourceSizePromise;
		} else {
			return this.sourceSizePromise = this.source._getSize();
		}
	}

	async loadRange(start: number, end: number) {
		// Read rounded to the nearest page
		let alignedStart = Math.floor(start / PAGE_SIZE) * PAGE_SIZE;
		let alignedEnd = Math.ceil(end / PAGE_SIZE) * PAGE_SIZE;
		alignedEnd = Math.min(alignedEnd, await this.getSourceSize());

		const thing = this.loadedSegments.find(x => x.start <= alignedStart);
		if (thing) {
			alignedStart = Math.max(alignedStart, thing.end);
		}

		const thing2 = this.loadedSegments.find(x => x.end >= alignedEnd);
		if (thing2) {
			alignedEnd = Math.min(alignedEnd, thing2.start);
		}

		if (alignedStart >= alignedEnd) {
			// Nothing to load
			return;
		}

		const bytes = await this.source._read(alignedStart, alignedEnd);
		this.insertIntoLoadedSegments(alignedStart, bytes);
	}

	private insertIntoLoadedSegments(start: number, bytes: Uint8Array) {
		/*
        let index = -1;
        let low = 0;
        let high = this.loadedSegments.length - 1;

        while (low <= high) {
            let mid = Math.floor(low + (high - low + 1) / 2);
            let midVal = this.loadedSegments[mid].start;

            if (midVal >= start) {
                index = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        */

		const segment: ReadSegment = {
			start,
			end: start + bytes.byteLength,
			bytes,
			view: new DataView(bytes.buffer),
		};
		let index = this.loadedSegments.findLastIndex(x => x.start <= start);

		this.loadedSegments.splice(index + 1, 0, segment);
		if (index === -1 || this.loadedSegments[index]!.end < segment.start) {
			index++;
		}

		const mergeSectionStartIndex = index;
		const mergeSectionStart = this.loadedSegments[mergeSectionStartIndex]!.start;
		let mergeSectionEndIndex = index;
		let mergeSectionEnd = this.loadedSegments[mergeSectionEndIndex]!.end;

		while (
			this.loadedSegments.length - 1 > mergeSectionEndIndex
			&& this.loadedSegments[mergeSectionEndIndex + 1]!.start <= mergeSectionEnd
		) {
			mergeSectionEndIndex++;
			mergeSectionEnd = Math.max(mergeSectionEnd, this.loadedSegments[mergeSectionEndIndex]!.end);
		}

		if (mergeSectionStartIndex === mergeSectionEndIndex) {
			return;
		}

		for (let i = mergeSectionStartIndex; i <= mergeSectionEndIndex; i++) {
			const segment = this.loadedSegments[i]!;
			const coversEntireMergeSection = segment.start === mergeSectionStart && segment.end === mergeSectionEnd;

			if (coversEntireMergeSection) {
				this.loadedSegments.splice(i + 1, mergeSectionEndIndex - i);
				this.loadedSegments.splice(mergeSectionStartIndex, i - mergeSectionStartIndex);

				return;
			}
		}

		const unifiedBytes = new Uint8Array(mergeSectionEnd - mergeSectionStart);
		for (let i = mergeSectionStartIndex; i <= mergeSectionEndIndex; i++) {
			const segment = this.loadedSegments[i]!;
			unifiedBytes.set(segment.bytes, segment.start - mergeSectionStart);
		}

		this.loadedSegments.splice(mergeSectionStartIndex + 1, mergeSectionEndIndex - mergeSectionStartIndex);
		this.loadedSegments[mergeSectionStartIndex]!.end = mergeSectionEnd;
		this.loadedSegments[mergeSectionStartIndex]!.bytes = unifiedBytes;
		this.loadedSegments[mergeSectionStartIndex]!.view = new DataView(unifiedBytes.buffer);
	}

	getViewAndOffset(start: number, end: number) {
		const segment = this.loadedSegments.find(x => x.start <= start && end <= x.end);
		if (!segment) {
			throw new Error(`No segment loaded for range [${start}, ${end}).`);
		}

		return {
			view: segment.view,
			offset: segment.bytes.byteOffset + start - segment.start,
		};
	}
}
