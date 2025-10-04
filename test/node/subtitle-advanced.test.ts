/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect } from 'vitest';
import { Input, FilePathSource, ALL_FORMATS } from '../../src/index.js';

describe('Advanced ASS Features', () => {
	it('should preserve Comment lines from CodecPrivate', async () => {
		using input = new Input({
			source: new FilePathSource('test/public/subtitles/test-mkv-ass-fonts.mkv'),
			formats: ALL_FORMATS,
		});

		const track = (await input.subtitleTracks)[0]!;
		expect(track.codec).toBe('ass');

		const cues = [];
		for await (const cue of track.getCues()) {
			cues.push(cue);
		}

		const assText = await track.exportToText('ass');

		// Should preserve Comment line from CodecPrivate
		expect(assText).toContain('Comment:');
		expect(assText).toContain('This is a comment');
	});

	it('should preserve [Fonts] section from CodecPrivate', async () => {
		using input = new Input({
			source: new FilePathSource('test/public/subtitles/test-mkv-ass-fonts.mkv'),
			formats: ALL_FORMATS,
		});

		const track = (await input.subtitleTracks)[0]!;
		const assText = await track.exportToText('ass');

		// Should have [Fonts] section
		expect(assText).toContain('[Fonts]');
		expect(assText).toContain('fontname: CustomFont');
	});

	it('should preserve [Graphics] section from CodecPrivate', async () => {
		using input = new Input({
			source: new FilePathSource('test/public/subtitles/test-mkv-ass-fonts.mkv'),
			formats: ALL_FORMATS,
		});

		const track = (await input.subtitleTracks)[0]!;
		const assText = await track.exportToText('ass');

		// Should have [Graphics] section
		expect(assText).toContain('[Graphics]');
		expect(assText).toContain('filename: logo.png');
	});

	it('should place Dialogue lines in correct position after Comment', async () => {
		using input = new Input({
			source: new FilePathSource('test/public/subtitles/test-mkv-ass-fonts.mkv'),
			formats: ALL_FORMATS,
		});

		const track = (await input.subtitleTracks)[0]!;
		const assText = await track.exportToText('ass');

		// Verify Event ordering: Format, then Dialogue, then Comment (at end of Events)
		const formatIdx = assText.indexOf('Format:');
		const firstDialogueIdx = assText.indexOf('Dialogue:');
		const commentIdx = assText.indexOf('Comment:');
		const fontsIdx = assText.indexOf('[Fonts]');

		// Proper order: Format < Dialogue < Comment < [Fonts]
		expect(formatIdx).toBeGreaterThan(-1);
		expect(firstDialogueIdx).toBeGreaterThan(formatIdx);
		expect(commentIdx).toBeGreaterThan(firstDialogueIdx); // Comment AFTER Dialogue
		if (fontsIdx > -1) {
			expect(commentIdx).toBeLessThan(fontsIdx); // Comment before [Fonts]
		}
	});

	it('should have proper section ordering', async () => {
		using input = new Input({
			source: new FilePathSource('test/public/subtitles/test-mkv-ass-fonts.mkv'),
			formats: ALL_FORMATS,
		});

		const track = (await input.subtitleTracks)[0]!;
		const assText = await track.exportToText('ass');

		const sections = [];
		const lines = assText.split('\n');

		for (const line of lines) {
			if (line.startsWith('[') && line.endsWith(']')) {
				sections.push(line);
			}
		}

		// Expected order: [Script Info], [V4+ Styles], [Events], [Fonts], [Graphics]
		expect(sections[0]).toBe('[Script Info]');
		expect(sections).toContain('[V4+ Styles]');
		expect(sections).toContain('[Events]');
		expect(sections).toContain('[Fonts]');
		expect(sections).toContain('[Graphics]');

		// [Events] should come before [Fonts] and [Graphics]
		const eventsIdx = sections.indexOf('[Events]');
		const fontsIdx = sections.indexOf('[Fonts]');
		const graphicsIdx = sections.indexOf('[Graphics]');

		expect(eventsIdx).toBeLessThan(fontsIdx);
		expect(eventsIdx).toBeLessThan(graphicsIdx);
	});
});
