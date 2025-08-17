/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AacAudioSpecificConfig, parseAacAudioSpecificConfig, validateAudioChunkMetadata } from '../codec';
import { assert, toUint8Array } from '../misc';
import { Muxer } from '../muxer';
import { Output, OutputAudioTrack } from '../output';
import { AdtsOutputFormat } from '../output-format';
import { EncodedPacket } from '../packet';
import { Writer } from '../writer';

export class AdtsMuxer extends Muxer {
	private format: AdtsOutputFormat;
	private writer: Writer;
	private header = new Uint8Array(7);
	private audioSpecificConfig: AacAudioSpecificConfig | null = null;

	constructor(output: Output, format: AdtsOutputFormat) {
		super(output);

		this.format = format;
		this.writer = output._writer;
	}

	async start() {
		// Nothing needed here
	}

	async getMimeType() {
		return 'audio/aac';
	}

	async addEncodedVideoPacket() {
		throw new Error('ADTS does not support video.');
	}

	async addEncodedAudioPacket(
		track: OutputAudioTrack,
		packet: EncodedPacket,
		meta?: EncodedAudioChunkMetadata,
	) {
		// https://wiki.multimedia.cx/index.php/ADTS (last visited: 2025/08/17)

		const release = await this.mutex.acquire();

		try {
			if (!this.audioSpecificConfig) {
				validateAudioChunkMetadata(meta);

				const description = meta?.decoderConfig?.description;
				assert(description);

				this.audioSpecificConfig = parseAacAudioSpecificConfig(toUint8Array(description));
			}

			const syncword = 0b1111_11111111;
			this.header[0] = (syncword >> 4);

			const mpegVersion = 0;
			const layer = 0;
			const protectionAbsence = 1;
			this.header[1] = (syncword << 4)
				| (mpegVersion << 3)
				| (layer << 1)
				| protectionAbsence;

			const privateBit = 0;
			this.header[2] = (((this.audioSpecificConfig.objectType - 1) & 0b11) << 6)
				| ((this.audioSpecificConfig.frequencyIndex & 0b1111) << 2)
				| (privateBit << 1)
				| ((this.audioSpecificConfig.channelConfiguration & 0b111) >> 2);

			const originality = 0;
			const homeUsage = 0;
			const copyrightIdBit = 0;
			const copyrightIdStart = 0;
			const frameLength = (packet.data.byteLength + this.header.byteLength) & 0b11111_11111111;
			this.header[3] = ((this.audioSpecificConfig.channelConfiguration & 0b111) << 6)
				| (originality << 5)
				| (homeUsage << 4)
				| (copyrightIdBit << 3)
				| (copyrightIdStart << 2)
				| (frameLength >> 11);

			this.header[4] = (frameLength >> 3);

			const bufferFullness = 0x7ff; // Variable bitrate
			this.header[5] = (frameLength << 5)
				| (bufferFullness >> 6);

			const numberOfAacFrames = 1;
			this.header[6] = (bufferFullness << 2)
				| (numberOfAacFrames - 1);

			// Omit CRC check

			const startPos = this.writer.getPos();
			this.writer.write(this.header);
			this.writer.write(packet.data);

			if (this.format._options.onFrame) {
				const frameBytes = new Uint8Array(frameLength);
				frameBytes.set(this.header, 0);
				frameBytes.set(packet.data, this.header.byteLength);

				this.format._options.onFrame(frameBytes, startPos);
			}

			await this.writer.flush();
		} finally {
			release();
		}
	}

	async addSubtitleCue() {
		throw new Error('ADTS does not support subtitles.');
	}

	async finalize() {}
}
