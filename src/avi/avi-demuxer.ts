/*!
 * Copyright (c) 2025-present, Vanilagy and contributors (Wiedy Mi)
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { Demuxer } from '../demuxer';
import { EncodedPacket } from '../packet';
import { Input } from '../input';
import {
	InputAudioTrack,
	InputVideoTrack,
	InputTrack,
	InputVideoTrackBacking,
	InputAudioTrackBacking,
	InputTrackBacking
} from '../input-track';
import { MetadataTags } from '../tags';
import { PacketRetrievalOptions } from '../media-sink';
import { VideoCodec, AudioCodec, MediaCodec } from '../codec';
import { FileSlice, Reader, readBytes, readU32Le, readU16, readU8 } from '../reader';
import { textDecoder, Rotation } from '../misc';
import {
	AVIMainHeader, AVIStreamHeader, AVIBitmapInfoHeader, AVIWaveFormatEx, AVIIndexEntry,
	parseMainHeader, parseStreamHeader, parseBitmapInfoHeader, parseWaveFormatEx, parseIndexEntry,
	aviVideoFourccToCodec, aviAudioFormatTagToCodec, parseStreamChunkId, AVIIF_KEYFRAME
} from './avi-misc';

interface StreamInfo {
	header: AVIStreamHeader;
	format: AVIBitmapInfoHeader | AVIWaveFormatEx;
	track?: AviVideoTrackBacking | AviAudioTrackBacking;
	packets: PacketInfo[];
	index: number;
}

interface PacketInfo {
	entry: AVIIndexEntry;
	timestamp: number;
}

interface ChunkInfo {
	fourcc: string;
	size: number;
	position: number;
}

// Base class following Matroska pattern
abstract class AviTrackBacking implements InputTrackBacking {
	packetToIndex = new WeakMap<EncodedPacket, number>();

	constructor(
		protected demuxer: AVIDemuxer,
		protected streamInfo: StreamInfo
	) {}

	getId(): number {
		return this.streamInfo.index;
	}

	getCodec(): MediaCodec | null {
		throw new Error('Not implemented on base class.');
	}

	getInternalCodecId(): string | null {
		if (this.streamInfo.header.fccType === 'vids') {
			const format = this.streamInfo.format as AVIBitmapInfoHeader;
			return format.compression;
		} else if (this.streamInfo.header.fccType === 'auds') {
			const format = this.streamInfo.format as AVIWaveFormatEx;
			return format.formatTag.toString();
		}
		return null;
	}

	getName(): string | null {
		return null;
	}

	getLanguageCode(): string {
		return 'eng';
	}

	getTimeResolution(): number {
		if (this.streamInfo.header.rate > 0) {
			return this.streamInfo.header.rate / this.streamInfo.header.scale;
		}
		return 1000000;
	}

	async getFirstTimestamp(): Promise<number> {
		const firstPacket = await this.getFirstPacket({ metadataOnly: true });
		return firstPacket?.timestamp ?? 0;
	}

	async computeDuration(): Promise<number> {
		const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
		return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
	}

	async getFirstPacket(options: PacketRetrievalOptions): Promise<EncodedPacket | null> {
		if (this.streamInfo.packets.length === 0) return null;

		const packetInfo = this.streamInfo.packets[0]!;
		if (options.metadataOnly) {
			const packet = new EncodedPacket(
				new Uint8Array(),
				(packetInfo.entry.flags & AVIIF_KEYFRAME) ? 'key' : 'delta',
				packetInfo.timestamp,
				0,
				0,
				packetInfo.entry.size
			);
			this.packetToIndex.set(packet, 0);
			return packet;
		}

		const packet = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp);
		if (packet) {
			this.packetToIndex.set(packet, 0);
		}
		return packet;
	}

	async getPacket(timestamp: number, options: PacketRetrievalOptions): Promise<EncodedPacket | null> {
		let bestIndex = -1;
		let bestDiff = Infinity;

		for (let i = 0; i < this.streamInfo.packets.length; i++) {
			const packetInfo = this.streamInfo.packets[i]!;
			const diff = Math.abs(packetInfo.timestamp - timestamp);
			if (diff < bestDiff) {
				bestDiff = diff;
				bestIndex = i;
			}
		}

		if (bestIndex === -1) return null;

		const packetInfo = this.streamInfo.packets[bestIndex]!;
		if (options.metadataOnly) {
			const packet = new EncodedPacket(
				new Uint8Array(),
				(packetInfo.entry.flags & AVIIF_KEYFRAME) ? 'key' : 'delta',
				packetInfo.timestamp,
				0,
				bestIndex,
				packetInfo.entry.size
			);
			this.packetToIndex.set(packet, bestIndex);
			return packet;
		}

		const packet = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp);
		if (packet) {
			this.packetToIndex.set(packet, bestIndex);
		}
		return packet;
	}

	async getNextPacket(packet: EncodedPacket, options: PacketRetrievalOptions): Promise<EncodedPacket | null> {
		const index = this.packetToIndex.get(packet);
		if (index === undefined) {
			throw new Error('Packet was not created from this track.');
		}

		const nextIndex = index + 1;
		if (nextIndex >= this.streamInfo.packets.length) return null;

		const packetInfo = this.streamInfo.packets[nextIndex]!;
		if (options.metadataOnly) {
			const newPacket = new EncodedPacket(
				new Uint8Array(),
				(packetInfo.entry.flags & AVIIF_KEYFRAME) ? 'key' : 'delta',
				packetInfo.timestamp,
				0,
				nextIndex,
				packetInfo.entry.size
			);
			this.packetToIndex.set(newPacket, nextIndex);
			return newPacket;
		}

		const newPacket = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp);
		if (newPacket) {
			this.packetToIndex.set(newPacket, nextIndex);
		}
		return newPacket;
	}

	async getKeyPacket(timestamp: number, options: PacketRetrievalOptions): Promise<EncodedPacket | null> {
		let bestIndex = -1;
		let bestDiff = Infinity;

		// Find closest keyframe to timestamp
		for (let i = 0; i < this.streamInfo.packets.length; i++) {
			const packetInfo = this.streamInfo.packets[i]!;
			if (!(packetInfo.entry.flags & AVIIF_KEYFRAME)) continue;

			const diff = Math.abs(packetInfo.timestamp - timestamp);
			if (diff < bestDiff) {
				bestDiff = diff;
				bestIndex = i;
			}
		}

		if (bestIndex === -1) return null;

		const packetInfo = this.streamInfo.packets[bestIndex]!;
		if (options.metadataOnly) {
			const packet = new EncodedPacket(
				new Uint8Array(),
				'key',
				packetInfo.timestamp,
				0,
				bestIndex,
				packetInfo.entry.size
			);
			this.packetToIndex.set(packet, bestIndex);
			return packet;
		}

		const packet = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp);
		if (packet) {
			this.packetToIndex.set(packet, bestIndex);
		}
		return packet;
	}

	async getNextKeyPacket(packet: EncodedPacket, options: PacketRetrievalOptions): Promise<EncodedPacket | null> {
		const index = this.packetToIndex.get(packet);
		if (index === undefined) {
			throw new Error('Packet was not created from this track.');
		}

		// Find next keyframe
		for (let i = index + 1; i < this.streamInfo.packets.length; i++) {
			const packetInfo = this.streamInfo.packets[i]!;
			if (!(packetInfo.entry.flags & AVIIF_KEYFRAME)) continue;

			if (options.metadataOnly) {
				const newPacket = new EncodedPacket(
					new Uint8Array(),
					'key',
					packetInfo.timestamp,
					0,
					i,
					packetInfo.entry.size
				);
				this.packetToIndex.set(newPacket, i);
				return newPacket;
			}

			const newPacket = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp);
			if (newPacket) {
				this.packetToIndex.set(newPacket, i);
			}
			return newPacket;
		}

		return null;
	}
}

class AviVideoTrackBacking extends AviTrackBacking implements InputVideoTrackBacking {
	decoderConfigPromise: Promise<VideoDecoderConfig> | null = null;

	override getCodec(): VideoCodec | null {
		const format = this.streamInfo.format as AVIBitmapInfoHeader;
		return aviVideoFourccToCodec(format.compression);
	}

	getCodedWidth(): number {
		const format = this.streamInfo.format as AVIBitmapInfoHeader;
		return Math.abs(format.width);
	}

	getCodedHeight(): number {
		const format = this.streamInfo.format as AVIBitmapInfoHeader;
		return Math.abs(format.height);
	}

	getRotation(): Rotation {
		return 0;
	}

	async getColorSpace(): Promise<VideoColorSpaceInit> {
		return {};
	}

	async canBeTransparent(): Promise<boolean> {
		return false;
	}

	async getDecoderConfig(): Promise<VideoDecoderConfig | null> {
		const codec = this.getCodec();
		if (!codec) return null;

		return this.decoderConfigPromise ??= (async (): Promise<VideoDecoderConfig> => {
			return {
				codec: codec,
				codedWidth: this.getCodedWidth(),
				codedHeight: this.getCodedHeight(),
			};
		})();
	}
}

class AviAudioTrackBacking extends AviTrackBacking implements InputAudioTrackBacking {
	decoderConfig: AudioDecoderConfig | null = null;

	override getCodec(): AudioCodec | null {
		const format = this.streamInfo.format as AVIWaveFormatEx;
		return aviAudioFormatTagToCodec(format.formatTag);
	}

	getNumberOfChannels(): number {
		const format = this.streamInfo.format as AVIWaveFormatEx;
		return format.channels;
	}

	getSampleRate(): number {
		const format = this.streamInfo.format as AVIWaveFormatEx;
		return format.samplesPerSec;
	}

	async getDecoderConfig(): Promise<AudioDecoderConfig | null> {
		const codec = this.getCodec();
		if (!codec) return null;

		return this.decoderConfig ??= {
			codec: codec,
			numberOfChannels: this.getNumberOfChannels(),
			sampleRate: this.getSampleRate(),
		};
	}
}

export class AVIDemuxer extends Demuxer {
	private reader: Reader;
	private mainHeader: AVIMainHeader | null = null;
	private streams: StreamInfo[] = [];
	private index: AVIIndexEntry[] = [];
	private moviStart = 0;
	private moviSize = 0;
	private isRIFX = false;
	private inputTracks: InputTrack[] = [];
	private metadataPromise: Promise<void> | null = null;

	constructor(input: Input) {
		super(input);
		this.reader = input._reader;
	}

	static async _canReadInput(input: Input): Promise<boolean> {
		const reader = input._reader;
		const slice = await reader.requestSlice(0, 12);
		if (!slice || slice.remainingLength < 12) return false;

		const riffBytes = readBytes(slice, 4);
		if (!riffBytes) return false;
		const riffType = AVIDemuxer.fourcc(riffBytes);

		if (riffType !== 'RIFF' && riffType !== 'RIFX' && riffType !== 'RF64') {
			return false;
		}

		slice.skip(4); // Skip file size
		const typeBytes = readBytes(slice, 4);
		if (!typeBytes) return false;
		const fileType = AVIDemuxer.fourcc(typeBytes);

		return fileType === 'AVI ';
	}

	private static fourcc(bytes: Uint8Array | null): string {
		if (!bytes || bytes.length !== 4) return '    ';
		return textDecoder.decode(bytes);
	}

	async computeDuration(): Promise<number> {
		await this.ensureMetadata();
		if (this.mainHeader && this.mainHeader.microSecPerFrame > 0 && this.mainHeader.totalFrames > 0) {
			return (this.mainHeader.totalFrames * this.mainHeader.microSecPerFrame) / 1_000_000;
		}
		let maxDuration = 0;
		for (const track of this.inputTracks) {
			const duration = await track.computeDuration();
			if (duration > maxDuration) {
				maxDuration = duration;
			}
		}
		return maxDuration;
	}

	async getTracks(): Promise<InputTrack[]> {
		await this.ensureMetadata();
		return this.inputTracks;
	}

	async getMimeType(): Promise<string> {
		return 'video/x-msvideo';
	}

	async getMetadataTags(): Promise<MetadataTags> {
		return {};
	}

	private async ensureMetadata(): Promise<void> {
		if (!this.metadataPromise) {
			this.metadataPromise = this.readMetadata();
		}
		await this.metadataPromise;
	}

	private async readMetadata(): Promise<void> {
		const slice = await this.reader.requestSlice(0, 12);
		if (!slice || slice.remainingLength < 12) {
			throw new Error('Invalid AVI file: insufficient header');
		}

		const magic = AVIDemuxer.fourcc(readBytes(slice, 4));
		const fileSize = readU32Le(slice);
		const fileType = AVIDemuxer.fourcc(readBytes(slice, 4));

		if (fileType !== 'AVI ') {
			throw new Error('Invalid AVI file type');
		}

		this.isRIFX = magic === 'RIFX';

		// Parse chunks
		await this.parseChunks();

		// Process index and create packet info
		this.processIndex();

		// Create tracks
		this.createTracks();
	}

	private async parseChunks(): Promise<void> {
		let position = 12;

		while (true) {
			const chunk = await this.readChunkHeader(position);
			if (!chunk) break;

			if (chunk.fourcc === 'LIST') {
				const listTypeSlice = await this.reader.requestSlice(position + 8, 4);
				if (!listTypeSlice) break;
				const listType = AVIDemuxer.fourcc(readBytes(listTypeSlice, 4));

				if (listType === 'hdrl') {
					await this.parseHeaderList(position + 12, chunk.size - 4);
				} else if (listType === 'movi') {
					this.moviStart = position + 8;
					this.moviSize = chunk.size - 4;
				}
				position += 8 + chunk.size;
			} else if (chunk.fourcc === 'idx1') {
				await this.parseIndex(position + 8, chunk.size);
				position += 8 + chunk.size;
			} else {
				position += 8 + chunk.size;
			}

			// Align to word boundary
			if (chunk.size % 2 !== 0) {
				position++;
			}
		}
	}

	private async readChunkHeader(position: number): Promise<ChunkInfo | null> {
		const slice = await this.reader.requestSlice(position, 8);
		if (!slice || slice.remainingLength < 8) return null;

		const chunkFourcc = AVIDemuxer.fourcc(readBytes(slice, 4));
		const chunkSize = this.isRIFX ? readU32Le(slice) : readU32Le(slice);

		return {
			fourcc: chunkFourcc,
			size: chunkSize,
			position: position + 8,
		};
	}

	private async parseHeaderList(position: number, size: number): Promise<void> {
		const endPos = position + size;
		let currentPos = position;

		while (currentPos < endPos) {
			const chunk = await this.readChunkHeader(currentPos);
			if (!chunk) break;

			if (chunk.fourcc === 'avih') {
				const slice = await this.reader.requestSlice(chunk.position, chunk.size);
				if (slice) {
					this.mainHeader = parseMainHeader(new DataView(slice.bytes.buffer, slice.bytes.byteOffset + slice.bufferPos, chunk.size));
				}
				currentPos = chunk.position + chunk.size;
			} else if (chunk.fourcc === 'LIST') {
				const listTypeSlice = await this.reader.requestSlice(chunk.position, 4);
				if (listTypeSlice) {
					const listType = AVIDemuxer.fourcc(readBytes(listTypeSlice, 4));
					if (listType === 'strl') {
						await this.parseStreamList(chunk.position + 4, chunk.size - 4);
					}
				}
				currentPos = chunk.position + chunk.size;
			} else {
				currentPos = chunk.position + chunk.size;
			}

			// Align to word boundary
			if (chunk.size % 2 !== 0) {
				currentPos++;
			}
		}
	}

	private async parseStreamList(position: number, size: number): Promise<void> {
		const endPos = position + size;
		let currentPos = position;
		const streamInfo: StreamInfo = {
			header: {} as AVIStreamHeader,
			format: {} as AVIBitmapInfoHeader | AVIWaveFormatEx,
			packets: [],
			index: this.streams.length
		};

		while (currentPos < endPos) {
			const chunk = await this.readChunkHeader(currentPos);
			if (!chunk) break;

			if (chunk.fourcc === 'strh') {
				const slice = await this.reader.requestSlice(chunk.position, chunk.size);
				if (slice) {
					streamInfo.header = parseStreamHeader(new DataView(slice.bytes.buffer, slice.bytes.byteOffset + slice.bufferPos, chunk.size));
				}
				currentPos = chunk.position + chunk.size;
			} else if (chunk.fourcc === 'strf') {
				const slice = await this.reader.requestSlice(chunk.position, chunk.size);
				if (slice && streamInfo.header) {
					const dataView = new DataView(slice.bytes.buffer, slice.bytes.byteOffset + slice.bufferPos, chunk.size);
					if (streamInfo.header.fccType === 'vids') {
						streamInfo.format = parseBitmapInfoHeader(dataView);
					} else if (streamInfo.header.fccType === 'auds') {
						streamInfo.format = parseWaveFormatEx(dataView);
					}
				}
				currentPos = chunk.position + chunk.size;
			} else {
				currentPos = chunk.position + chunk.size;
			}

			// Align to word boundary
			if (chunk.size % 2 !== 0) {
				currentPos++;
			}
		}

		if (streamInfo.header && streamInfo.format) {
			this.streams.push(streamInfo);
		}
	}

	private async parseIndex(position: number, size: number): Promise<void> {
		const slice = await this.reader.requestSlice(position, size);
		if (!slice) return;

		const dataView = new DataView(slice.bytes.buffer, slice.bytes.byteOffset + slice.bufferPos, size);
		const numEntries = Math.floor(size / 16);
		for (let i = 0; i < numEntries; i++) {
			const entry = parseIndexEntry(dataView, i * 16);
			this.index.push(entry);
		}
	}

	private processIndex(): void {
		// Group index entries by stream and calculate timestamps
		for (const entry of this.index) {
			const parsed = parseStreamChunkId(entry.ckid);
			if (!parsed) continue;

			const streamIndex = parsed.streamNumber;
			if (streamIndex >= this.streams.length) continue;

			const stream = this.streams[streamIndex]!;
			const timestamp = this.calculateTimestamp(stream, stream.packets.length);

			stream.packets.push({
				entry,
				timestamp
			});
		}
	}

	private createTracks(): void {
		for (const stream of this.streams) {
			const { header, format } = stream;

			if (header.fccType === 'vids' && 'compression' in format) {
				const bmpInfo = format as AVIBitmapInfoHeader;
				const codec = aviVideoFourccToCodec(bmpInfo.compression);

				if (codec) {
					const backing = new AviVideoTrackBacking(this, stream);
					stream.track = backing;
					const track = new InputVideoTrack(this.input, backing);
					this.inputTracks.push(track);
				}
			} else if (header.fccType === 'auds' && 'formatTag' in format) {
				const waveFormat = format as AVIWaveFormatEx;
				const codec = aviAudioFormatTagToCodec(waveFormat.formatTag);

				if (codec) {
					const backing = new AviAudioTrackBacking(this, stream);
					stream.track = backing;
					const track = new InputAudioTrack(this.input, backing);
					this.inputTracks.push(track);
				}
			}
		}
	}

	async readPacket(entry: AVIIndexEntry, timestamp: number): Promise<EncodedPacket | null> {
		const packetPos = this.moviStart + entry.offset + 8;
		const slice = await this.reader.requestSlice(packetPos, entry.size);
		if (!slice) return null;

		const data = readBytes(slice, entry.size);
		if (!data) return null;

		return new EncodedPacket(
			data,
			(entry.flags & AVIIF_KEYFRAME) ? 'key' : 'delta',
			timestamp,
			0,
			-1,
			data.byteLength
		);
	}

	private calculateTimestamp(stream: StreamInfo, packetIndex: number): number {
		if (stream.header.fccType === 'vids' && stream.header.rate > 0 && stream.header.scale > 0) {
			return (packetIndex * stream.header.scale) / stream.header.rate;
		} else if (stream.header.fccType === 'auds') {
			const format = stream.format as AVIWaveFormatEx;
			if (stream.header.sampleSize === 0 || stream.header.sampleSize === 1) {
				const samplesPerFrame = 1152;
				return (packetIndex * samplesPerFrame) / format.samplesPerSec;
			}
			if (stream.header.rate > 0 && stream.header.scale > 0) {
				return (packetIndex * stream.header.scale) / stream.header.rate;
			}
		}
		return 0;
	}
}