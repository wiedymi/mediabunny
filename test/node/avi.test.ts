/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from 'vitest';
import { Input, Output } from '../../src/index.js';
import { BufferSource, BufferTarget } from '../../src/index.js';
import { ALL_FORMATS, AVI, AviOutputFormat } from '../../src/index.js';
import { EncodedVideoPacketSource, EncodedAudioPacketSource } from '../../src/index.js';
import { EncodedPacket } from '../../src/index.js';

test('Should be able to detect AVI format', async () => {
	const buffer = new ArrayBuffer(12);
	const view = new DataView(buffer);

	// Write RIFF header - RIFF is little-endian
	// 'RIFF' = 0x52, 0x49, 0x46, 0x46
	view.setUint8(0, 0x52); // 'R'
	view.setUint8(1, 0x49); // 'I'
	view.setUint8(2, 0x46); // 'F'
	view.setUint8(3, 0x46); // 'F'
	view.setUint32(4, 4, true); // File size minus 8
	// 'AVI ' = 0x41, 0x56, 0x49, 0x20
	view.setUint8(8, 0x41);  // 'A'
	view.setUint8(9, 0x56);  // 'V'
	view.setUint8(10, 0x49); // 'I'
	view.setUint8(11, 0x20); // ' '

	using input = new Input({
		source: new BufferSource(new Uint8Array(buffer)),
		formats: ALL_FORMATS,
	});

	expect(await input.getFormat()).toBe(AVI);
});

test('Should be able to create AVI output with video track', async () => {
	const target = new BufferTarget();
	const output = new Output({
		target,
		format: new AviOutputFormat(),
	});

	// Create a simple H.264 packet
	const videoPacket = new EncodedPacket(
		new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x67]), // Simplified SPS NAL unit
		'key',
		0,
		0.033, // 30fps
		0
	);

	// Create video source
	const videoSource = new EncodedVideoPacketSource('avc');
	await output.addVideoTrack(videoSource);
	await output.start();

	// Add packet
	await videoSource.add(videoPacket, {
		decoderConfig: {
			codec: 'avc1.640028',
			codedWidth: 640,
			codedHeight: 480,
		},
	});

	// Finalize
	await output.finalize();

	// Check that output was created
	const result = target.buffer ? new Uint8Array(target.buffer) : new Uint8Array();
	expect(result).toBeInstanceOf(Uint8Array);
	expect(result.length).toBeGreaterThan(0);

	// Verify RIFF header
	const resultView = new DataView(result.buffer, result.byteOffset, result.byteLength);
	// Check for 'RIFF' signature - as individual bytes
	expect(resultView.getUint8(0)).toBe(0x52); // 'R'
	expect(resultView.getUint8(1)).toBe(0x49); // 'I'
	expect(resultView.getUint8(2)).toBe(0x46); // 'F'
	expect(resultView.getUint8(3)).toBe(0x46); // 'F'

	// Check for 'AVI ' type
	expect(resultView.getUint8(8)).toBe(0x41); // 'A'
	expect(resultView.getUint8(9)).toBe(0x56); // 'V'
	expect(resultView.getUint8(10)).toBe(0x49); // 'I'
	expect(resultView.getUint8(11)).toBe(0x20); // ' '
});

test('Should be able to create AVI output with audio track', async () => {
	const target = new BufferTarget();
	const output = new Output({
		target,
		format: new AviOutputFormat(),
	});

	// Create a simple MP3 packet
	const audioPacket = new EncodedPacket(
		new Uint8Array([0xFF, 0xFB, 0x90, 0x00]), // Simplified MP3 frame header
		'key',
		0,
		0.026, // ~26ms per frame
		0
	);

	// Create audio source
	const audioSource = new EncodedAudioPacketSource('mp3');
	await output.addAudioTrack(audioSource);
	await output.start();

	// Add packet
	await audioSource.add(audioPacket, {
		decoderConfig: {
			codec: 'mp3',
			sampleRate: 44100,
			numberOfChannels: 2,
		},
	});

	// Finalize
	await output.finalize();

	// Check that output was created
	const result = target.buffer ? new Uint8Array(target.buffer) : new Uint8Array();
	expect(result).toBeInstanceOf(Uint8Array);
	expect(result.length).toBeGreaterThan(0);

	// Verify AVI structure
	const resultView = new DataView(result.buffer, result.byteOffset, result.byteLength);
	// Check for 'RIFF' signature
	const riff = String.fromCharCode(
		resultView.getUint8(0),
		resultView.getUint8(1),
		resultView.getUint8(2),
		resultView.getUint8(3)
	);
	expect(riff).toBe('RIFF');
	// Check for 'AVI ' type
	const aviType = String.fromCharCode(
		resultView.getUint8(8),
		resultView.getUint8(9),
		resultView.getUint8(10),
		resultView.getUint8(11)
	);
	expect(aviType).toBe('AVI ')
});

test('Should properly handle AVI codec mappings', async () => {
	const format = new AviOutputFormat();

	// Check supported codecs
	const supportedVideoCodecs = format.getSupportedVideoCodecs();
	expect(supportedVideoCodecs).toContain('avc');
	expect(supportedVideoCodecs).toContain('hevc');
	expect(supportedVideoCodecs).toContain('vp8');
	expect(supportedVideoCodecs).toContain('vp9');

	const supportedAudioCodecs = format.getSupportedAudioCodecs();
	expect(supportedAudioCodecs).toContain('mp3');
	expect(supportedAudioCodecs).toContain('aac');
	expect(supportedAudioCodecs).toContain('pcm-s16');

	// Check file extension and mime type
	expect(format.fileExtension).toBe('.avi');
	expect(format.mimeType).toBe('video/x-msvideo');
});

test('Should be able to create AVI with both video and audio', async () => {
	const target = new BufferTarget();
	const output = new Output({
		target,
		format: new AviOutputFormat(),
	});

	// Create video packets
	const videoPackets = [];
	for (let i = 0; i < 3; i++) {
		videoPackets.push(new EncodedPacket(
			new Uint8Array([0x00, 0x00, 0x00, 0x01, i === 0 ? 0x67 : 0x41]),
			i === 0 ? 'key' : 'delta',
			i * 0.033,
			0.033,
			i
		));
	}

	// Create audio packets
	const audioPackets = [];
	for (let i = 0; i < 4; i++) {
		audioPackets.push(new EncodedPacket(
			new Uint8Array([0xFF, 0xFB, 0x90, 0x00]),
			'key',
			i * 0.026,
			0.026,
			i
		));
	}

	const videoSource = new EncodedVideoPacketSource('avc');
	const audioSource = new EncodedAudioPacketSource('mp3');

	await output.addVideoTrack(videoSource);
	await output.addAudioTrack(audioSource);
	await output.start();

	// Add video packets
	for (let i = 0; i < videoPackets.length; i++) {
		await videoSource.add(videoPackets[i]!, i === 0 ? {
			decoderConfig: {
				codec: 'avc1.640028',
				codedWidth: 640,
				codedHeight: 480,
			},
		} : undefined);
	}

	// Add audio packets
	for (let i = 0; i < audioPackets.length; i++) {
		await audioSource.add(audioPackets[i]!, i === 0 ? {
			decoderConfig: {
				codec: 'mp3',
				sampleRate: 44100,
				numberOfChannels: 2,
			},
		} : undefined);
	}

	await output.finalize();

	const result = target.buffer ? new Uint8Array(target.buffer) : new Uint8Array();
	expect(result).toBeInstanceOf(Uint8Array);
	expect(result.length).toBeGreaterThan(100); // Should have some content

	// Verify it's a valid AVI file
	const resultView = new DataView(result.buffer, result.byteOffset, result.byteLength);
	// Check for 'RIFF' signature
	expect(resultView.getUint8(0)).toBe(0x52); // 'R'
	expect(resultView.getUint8(1)).toBe(0x49); // 'I'
	expect(resultView.getUint8(2)).toBe(0x46); // 'F'
	expect(resultView.getUint8(3)).toBe(0x46); // 'F'
	// Check for 'AVI ' type
	expect(resultView.getUint8(8)).toBe(0x41); // 'A'
	expect(resultView.getUint8(9)).toBe(0x56); // 'V'
	expect(resultView.getUint8(10)).toBe(0x49); // 'I'
	expect(resultView.getUint8(11)).toBe(0x20); // ' '
});