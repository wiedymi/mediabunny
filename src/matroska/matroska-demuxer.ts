import { AudioCodec, extractAudioCodecString, extractVideoCodecString, MediaCodec, VideoCodec } from '../codec';
import { Demuxer } from '../demuxer';
import { Input } from '../input';
import {
	InputAudioTrack,
	InputAudioTrackBacking,
	InputTrack,
	InputTrackBacking,
	InputVideoTrack,
	InputVideoTrackBacking,
} from '../input-track';
import { SampleRetrievalOptions } from '../media-sink';
import {
	assert,
	AsyncMutex,
	binarySearchExact,
	binarySearchLessOrEqual,
	COLOR_PRIMARIES_MAP_INVERSE,
	findLastIndex,
	last,
	MATRIX_COEFFICIENTS_MAP_INVERSE,
	Rotation,
	TRANSFER_CHARACTERISTICS_MAP_INVERSE,
} from '../misc';
import { Reader } from '../reader';
import { EncodedAudioSample, EncodedVideoSample, PLACEHOLDER_DATA, SampleType } from '../sample';
import { CODEC_STRING_MAP, EBMLId, EBMLReader, MAX_HEADER_SIZE, MIN_HEADER_SIZE } from './ebml';

type Segment = {
	seekHeadSeen: boolean;
	infoSeen: boolean;
	tracksSeen: boolean;
	cuesSeen: boolean;

	timestampScale: number;
	timestampFactor: number;
	duration: number;
	seekEntries: SeekEntry[];
	tracks: InternalTrack[];
	cuePoints: CuePoint[];

	dataStartPos: number;
	elementEndPos: number;
	clusterSeekStartPos: number;

	clusters: Cluster[];
	clusterLookupMutex: AsyncMutex;
};

type SeekEntry = {
	id: number;
	segmentPosition: number;
};

type Cluster = {
	elementStartPos: number;
	elementEndPos: number;
	dataStartPos: number;
	timestamp: number;
	trackData: Map<number, ClusterTrackData>;
	nextCluster: Cluster | null;
};

type ClusterTrackData = {
	startTimestamp: number;
	endTimestamp: number;
	firstKeyFrameTimestamp: number | null;
	blocks: ClusterBlock[];
	presentationTimestamps: {
		timestamp: number;
		blockIndex: number;
	}[];
};

type ClusterBlock = {
	timestamp: number;
	duration: number;
	isKeyFrame: boolean;
	referencedTimestamps: number[];
	data: Uint8Array;
};

type CuePoint = {
	time: number;
	clusterPosition: number;
};

type InternalTrack = {
	id: number;
	demuxer: MatroskaDemuxer;
	segment: Segment;
	clusters: Cluster[];
	clustersWithKeyFrame: Cluster[];

	isDefault: boolean;
	inputTrack: InputTrack | null;
	codecId: string | null;
	codecPrivate: Uint8Array | null;
	info:
		| null
		| {
			type: 'video';
			width: number;
			height: number;
			rotation: Rotation;
			codec: VideoCodec | null;
			colorSpace: VideoColorSpaceInit | null;
		}
		| {
			type: 'audio';
			numberOfChannels: number;
			sampleRate: number;
			bitDepth: number;
			codec: AudioCodec | null;
		};
};
type InternalVideoTrack = InternalTrack & { info: { type: 'video' } };
type InternalAudioTrack = InternalTrack & { info: { type: 'audio' } };

const METADATA_ELEMENTS = [
	{ id: EBMLId.SeekHead, flag: 'seekHeadSeen' },
	{ id: EBMLId.Info, flag: 'infoSeen' },
	{ id: EBMLId.Tracks, flag: 'tracksSeen' },
	{ id: EBMLId.Cues, flag: 'cuesSeen' },
] as const;

export class MatroskaDemuxer extends Demuxer {
	metadataReader: EBMLReader;
	clusterReader: EBMLReader;

	readMetadataPromise: Promise<void> | null = null;

	segments: Segment[] = [];
	currentSegment: Segment | null = null;
	currentTrack: InternalTrack | null = null;
	currentCluster: Cluster | null = null;
	currentBlock: ClusterBlock | null = null;

	isWebM = false;

	constructor(input: Input) {
		super(input);

		this.metadataReader = new EBMLReader(input._mainReader);

		// Max 64 MiB of stored clusters
		this.clusterReader = new EBMLReader(new Reader(input._source, 64 * 2 ** 20));
	}

	override async computeDuration() {
		const tracks = await this.getTracks();
		const trackDurations = await Promise.all(tracks.map(x => x.computeDuration()));
		return Math.max(0, ...trackDurations);
	}

	async getTracks() {
		await this.readMetadata();
		return this.segments.flatMap(segment => segment.tracks.map(track => track.inputTrack!));
	}

	override async getMimeType() {
		await this.readMetadata();

		let string = this.isWebM ? 'video/webm' : 'video/x-matroska';

		const tracks = await this.getTracks();
		if (tracks.length > 0) {
			const codecMimeTypes = await Promise.all(tracks.map(x => x.getCodecMimeType()));
			const uniqueCodecMimeTypes = [...new Set(codecMimeTypes.filter(Boolean))];

			string += `; codecs="${uniqueCodecMimeTypes.join(', ')}"`;
		}

		return string;
	}

	assertDefinedSize(size: number) {
		if (size === -1) {
			throw new Error('Undefined element size is used in a place where it is not supported.');
		}
	}

	readMetadata() {
		return this.readMetadataPromise ??= (async () => {
			this.metadataReader.pos = 0;

			const fileSize = await this.input._source._getSize();

			while (this.metadataReader.pos < fileSize - MIN_HEADER_SIZE) {
				await this.metadataReader.reader.loadRange(
					this.metadataReader.pos,
					this.metadataReader.pos + MAX_HEADER_SIZE,
				);

				const { id, size } = this.metadataReader.readElementHeader();
				const startPos = this.metadataReader.pos;

				if (id === EBMLId.EBML) {
					await this.metadataReader.reader.loadRange(this.metadataReader.pos, this.metadataReader.pos + size);
					this.readContiguousElements(this.metadataReader, size);
				} else if (id === EBMLId.Segment) { // Segment found!
					await this.readSegment(size);

					if (size === -1) {
						// Stop searching for other segments if this is the case
						break;
					}
				}

				this.assertDefinedSize(size);
				this.metadataReader.pos = startPos + size;
			}
		})();
	}

	async readSegment(dataSize: number) {
		const segmentDataStart = this.metadataReader.pos;

		this.currentSegment = {
			seekHeadSeen: false,
			infoSeen: false,
			tracksSeen: false,
			cuesSeen: false,

			timestampScale: -1,
			timestampFactor: -1,
			duration: -1,
			seekEntries: [],
			tracks: [],
			cuePoints: [],

			dataStartPos: segmentDataStart,
			elementEndPos: dataSize === -1
				? (await this.input._source._getSize() - MIN_HEADER_SIZE)
				: segmentDataStart + dataSize,
			clusterSeekStartPos: segmentDataStart,

			clusters: [],
			clusterLookupMutex: new AsyncMutex(),
		};
		this.segments.push(this.currentSegment);

		// Let's load a good amount of data, enough for all segment metadata to likely fit into (minus cues)
		await this.metadataReader.reader.loadRange(
			this.metadataReader.pos,
			this.metadataReader.pos + 2 ** 14,
		);

		let clusterEncountered = false;
		while (this.metadataReader.pos < this.currentSegment.elementEndPos) {
			await this.metadataReader.reader.loadRange(
				this.metadataReader.pos,
				this.metadataReader.pos + MAX_HEADER_SIZE,
			);

			const elementStartPos = this.metadataReader.pos;
			const { id, size } = this.metadataReader.readElementHeader();
			const dataStartPos = this.metadataReader.pos;

			const metadataElementIndex = METADATA_ELEMENTS.findIndex(x => x.id === id);
			if (metadataElementIndex !== -1) {
				const field = METADATA_ELEMENTS[metadataElementIndex]!.flag;
				this.currentSegment[field] = true;

				await this.metadataReader.reader.loadRange(this.metadataReader.pos, this.metadataReader.pos + size);
				this.readContiguousElements(this.metadataReader, size);
			} else if (id === EBMLId.Cluster) {
				if (!clusterEncountered) {
					clusterEncountered = true;
					this.currentSegment.clusterSeekStartPos = elementStartPos;
				}
			}

			if (this.currentSegment.infoSeen && this.currentSegment.tracksSeen && this.currentSegment.cuesSeen) {
				// No need to search anymore, we have everything
				break;
			}

			if (this.currentSegment.seekHeadSeen) {
				let hasInfo = this.currentSegment.infoSeen;
				let hasTracks = this.currentSegment.tracksSeen;
				let hasCues = this.currentSegment.cuesSeen;

				for (const entry of this.currentSegment.seekEntries) {
					if (entry.id === EBMLId.Info) {
						hasInfo = true;
					} else if (entry.id === EBMLId.Tracks) {
						hasTracks = true;
					} else if (entry.id === EBMLId.Cues) {
						hasCues = true;
					}
				}

				if (hasInfo && hasTracks && hasCues) {
					// No need to search sequentially anymore, we can use the seek head
					break;
				}
			}

			this.assertDefinedSize(size);
			this.metadataReader.pos = dataStartPos + size;

			if (!clusterEncountered) {
				this.currentSegment.clusterSeekStartPos = this.metadataReader.pos;
			}
		}

		// Use the seek head to read missing metadata elements
		for (const target of METADATA_ELEMENTS) {
			if (this.currentSegment[target.flag]) continue;

			const seekEntry = this.currentSegment.seekEntries.find(entry => entry.id === target.id);
			if (!seekEntry) continue;

			this.metadataReader.pos = segmentDataStart + seekEntry.segmentPosition;
			await this.metadataReader.reader.loadRange(
				this.metadataReader.pos,
				this.metadataReader.pos + 2 ** 12, // Load a larger range, assuming the correct element will be there
			);
			const { id, size } = this.metadataReader.readElementHeader();
			if (id !== target.id) continue;

			this.currentSegment[target.flag] = true;
			await this.metadataReader.reader.loadRange(this.metadataReader.pos, this.metadataReader.pos + size);
			this.readContiguousElements(this.metadataReader, size);
		}

		// Put default tracks first
		this.currentSegment.tracks.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

		// Sort cue points by time
		this.currentSegment.cuePoints.sort((a, b) => a.time - b.time);

		this.currentSegment = null;
	}

	async readCluster(segment: Segment) {
		await this.metadataReader.reader.loadRange(this.metadataReader.pos, this.metadataReader.pos + MAX_HEADER_SIZE);

		const elementStartPos = this.metadataReader.pos;
		const { id, size } = this.metadataReader.readElementHeader();
		const dataStartPos = this.metadataReader.pos;

		assert(id === EBMLId.Cluster);

		// Load the entire cluster
		this.clusterReader.pos = dataStartPos;
		await this.clusterReader.reader.loadRange(this.clusterReader.pos, this.clusterReader.pos + size);

		const cluster: Cluster = {
			elementStartPos,
			elementEndPos: dataStartPos + size,
			dataStartPos,
			timestamp: -1,
			trackData: new Map(),
			nextCluster: null,
		};
		this.currentCluster = cluster;
		this.readContiguousElements(this.clusterReader, size);

		for (const [trackId, trackData] of cluster.trackData) {
			let blockReferencesExist = false;

			// This must hold, as track datas only get created if a block for that track is encountered
			assert(trackData.blocks.length > 0);

			for (let i = 0; i < trackData.blocks.length; i++) {
				const block = trackData.blocks[i]!;
				block.timestamp += cluster.timestamp;

				blockReferencesExist ||= block.referencedTimestamps.length > 0;
			}

			if (blockReferencesExist) {
				trackData.blocks = sortBlocksTopologically(trackData.blocks);
			}

			trackData.presentationTimestamps = trackData.blocks
				.map((block, i) => ({ timestamp: block.timestamp, blockIndex: i }))
				.sort((a, b) => a.timestamp - b.timestamp);

			let hasKeyFrame = false;
			for (let i = 0; i < trackData.presentationTimestamps.length; i++) {
				const entry = trackData.presentationTimestamps[i]!;
				const block = trackData.blocks[entry.blockIndex]!;

				if (block.isKeyFrame) {
					hasKeyFrame = true;

					if (trackData.firstKeyFrameTimestamp === null && block.isKeyFrame) {
						trackData.firstKeyFrameTimestamp = block.timestamp;
					}
				}

				if (i < trackData.presentationTimestamps.length - 1) {
					// Update block durations based on presentation order
					const nextEntry = trackData.presentationTimestamps[i + 1]!;
					const nextBlock = trackData.blocks[nextEntry.blockIndex]!;
					block.duration = nextBlock.timestamp - block.timestamp;
				}
			}

			const firstBlock = trackData.blocks[trackData.presentationTimestamps[0]!.blockIndex]!;
			const lastBlock = trackData.blocks[last(trackData.presentationTimestamps)!.blockIndex]!;

			trackData.startTimestamp = firstBlock.timestamp;
			trackData.endTimestamp = lastBlock.timestamp + lastBlock.duration;

			const track = segment.tracks.find(x => x.id === trackId);
			if (track) {
				const insertionIndex = binarySearchLessOrEqual(
					track.clusters,
					cluster.timestamp,
					x => x.timestamp,
				);
				track.clusters.splice(insertionIndex + 1, 0, cluster);

				if (hasKeyFrame) {
					const insertionIndex = binarySearchLessOrEqual(
						track.clustersWithKeyFrame,
						cluster.timestamp,
						x => x.timestamp,
					);
					track.clustersWithKeyFrame.splice(insertionIndex + 1, 0, cluster);
				}
			}
		}

		const insertionIndex = binarySearchLessOrEqual(
			segment.clusters,
			elementStartPos,
			x => x.elementStartPos,
		);
		segment.clusters.splice(insertionIndex + 1, 0, cluster);

		this.currentCluster = null;

		return cluster;
	}

	getTrackDataInCluster(cluster: Cluster, trackNumber: number) {
		let trackData = cluster.trackData.get(trackNumber);
		if (!trackData) {
			trackData = {
				startTimestamp: 0,
				endTimestamp: 0,
				firstKeyFrameTimestamp: null,
				blocks: [],
				presentationTimestamps: [],
			};
			cluster.trackData.set(trackNumber, trackData);
		}

		return trackData;
	}

	readContiguousElements(reader: EBMLReader, totalSize: number) {
		const startIndex = reader.pos;

		while (reader.pos - startIndex < totalSize) {
			this.traverseElement(reader);
		}
	}

	traverseElement(reader: EBMLReader) {
		const { id, size } = reader.readElementHeader();
		const dataStartPos = reader.pos;

		switch (id) {
			case EBMLId.DocType: {
				this.isWebM = reader.readString(size) === 'webm';
			}; break;

			case EBMLId.Seek: {
				if (!this.currentSegment) break;
				const seekEntry: SeekEntry = { id: -1, segmentPosition: -1 };
				this.currentSegment.seekEntries.push(seekEntry);
				this.readContiguousElements(reader, size);

				if (seekEntry.id === -1 || seekEntry.segmentPosition === -1) {
					this.currentSegment.seekEntries.pop();
				}
			}; break;

			case EBMLId.SeekID: {
				const lastSeekEntry = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
				if (!lastSeekEntry) break;

				lastSeekEntry.id = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.SeekPosition: {
				const lastSeekEntry = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
				if (!lastSeekEntry) break;

				lastSeekEntry.segmentPosition = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.TimestampScale: {
				if (!this.currentSegment) break;

				this.currentSegment.timestampScale = reader.readUnsignedInt(size);
				this.currentSegment.timestampFactor = 1e9 / this.currentSegment.timestampScale;
			}; break;

			case EBMLId.Duration: {
				if (!this.currentSegment) break;

				this.currentSegment.duration = reader.readFloat(size);
			}; break;

			case EBMLId.TrackEntry: {
				if (!this.currentSegment) break;

				this.currentTrack = {
					id: -1,
					segment: this.currentSegment,
					demuxer: this,
					clusters: [],
					clustersWithKeyFrame: [],
					isDefault: false,
					inputTrack: null,
					codecId: null,
					codecPrivate: null,
					info: null,
				};

				this.readContiguousElements(reader, size);

				if (
					this.currentTrack
					&& this.currentTrack.id !== -1
					&& this.currentTrack.codecId
					&& this.currentTrack.info
				) {
					const slashIndex = this.currentTrack.codecId.indexOf('/');
					const codecIdWithoutSuffix = slashIndex === -1
						? this.currentTrack.codecId
						: this.currentTrack.codecId.slice(0, slashIndex);

					if (
						this.currentTrack.info.type === 'video'
						&& this.currentTrack.info.width !== -1
						&& this.currentTrack.info.height !== -1
					) {
						if (this.currentTrack.codecId === CODEC_STRING_MAP.avc) {
							this.currentTrack.info.codec = 'avc';
						} else if (this.currentTrack.codecId === CODEC_STRING_MAP.hevc) {
							this.currentTrack.info.codec = 'hevc';
						} else if (codecIdWithoutSuffix === CODEC_STRING_MAP.vp8) {
							this.currentTrack.info.codec = 'vp8';
						} else if (codecIdWithoutSuffix === CODEC_STRING_MAP.vp9) {
							this.currentTrack.info.codec = 'vp9';
						} else if (codecIdWithoutSuffix === CODEC_STRING_MAP.av1) {
							this.currentTrack.info.codec = 'av1';
						}

						const videoTrack = this.currentTrack as InternalVideoTrack;
						const inputTrack = new InputVideoTrack(new MatroskaVideoTrackBacking(videoTrack));
						this.currentTrack.inputTrack = inputTrack;
						this.currentSegment.tracks.push(this.currentTrack);
					} else if (
						this.currentTrack.info.type === 'audio'
						&& this.currentTrack.info.numberOfChannels !== -1
						&& this.currentTrack.info.sampleRate !== -1
					) {
						if (codecIdWithoutSuffix === CODEC_STRING_MAP.aac) {
							this.currentTrack.info.codec = 'aac';
						} else if (this.currentTrack.codecId === CODEC_STRING_MAP.mp3) {
							this.currentTrack.info.codec = 'mp3';
						} else if (codecIdWithoutSuffix === CODEC_STRING_MAP.opus) {
							this.currentTrack.info.codec = 'opus';
						} else if (codecIdWithoutSuffix === CODEC_STRING_MAP.vorbis) {
							this.currentTrack.info.codec = 'vorbis';
						} else if (codecIdWithoutSuffix === CODEC_STRING_MAP.flac) {
							this.currentTrack.info.codec = 'flac';
						} else if (this.currentTrack.codecId === 'A_PCM/INT/LIT') {
							if (this.currentTrack.info.bitDepth === 8) {
								this.currentTrack.info.codec = 'pcm-u8';
							} else if (this.currentTrack.info.bitDepth === 16) {
								this.currentTrack.info.codec = 'pcm-s16';
							} else if (this.currentTrack.info.bitDepth === 24) {
								this.currentTrack.info.codec = 'pcm-s24';
							} else if (this.currentTrack.info.bitDepth === 32) {
								this.currentTrack.info.codec = 'pcm-s32';
							}
						} else if (this.currentTrack.codecId === 'A_PCM/INT/BIG') {
							if (this.currentTrack.info.bitDepth === 8) {
								this.currentTrack.info.codec = 'pcm-u8';
							} else if (this.currentTrack.info.bitDepth === 16) {
								this.currentTrack.info.codec = 'pcm-s16be';
							} else if (this.currentTrack.info.bitDepth === 24) {
								this.currentTrack.info.codec = 'pcm-s24be';
							} else if (this.currentTrack.info.bitDepth === 32) {
								this.currentTrack.info.codec = 'pcm-s32be';
							}
						} else if (this.currentTrack.codecId === 'A_PCM/FLOAT/IEEE') {
							if (this.currentTrack.info.bitDepth === 32) {
								this.currentTrack.info.codec = 'pcm-f32';
							}
						}

						const audioTrack = this.currentTrack as InternalAudioTrack;
						const inputTrack = new InputAudioTrack(new MatroskaAudioTrackBacking(audioTrack));
						this.currentTrack.inputTrack = inputTrack;
						this.currentSegment.tracks.push(this.currentTrack);
					}
				}

				this.currentTrack = null;
			}; break;

			case EBMLId.TrackNumber: {
				if (!this.currentTrack) break;

				this.currentTrack.id = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.TrackType: {
				if (!this.currentTrack) break;

				const type = reader.readUnsignedInt(size);
				if (type === 1) {
					this.currentTrack.info = {
						type: 'video',
						width: -1,
						height: -1,
						rotation: 0,
						codec: null,
						colorSpace: null,
					};
				} else if (type === 2) {
					this.currentTrack.info = {
						type: 'audio',
						numberOfChannels: -1,
						sampleRate: -1,
						bitDepth: -1,
						codec: null,
					};
				}
			}; break;

			case EBMLId.FlagEnabled: {
				if (!this.currentTrack) break;

				const enabled = reader.readUnsignedInt(size);
				if (!enabled) {
					this.currentSegment!.tracks.pop();
					this.currentTrack = null;
				}
			}; break;

			case EBMLId.FlagDefault: {
				if (!this.currentTrack) break;

				this.currentTrack.isDefault = !!reader.readUnsignedInt(size);
			}; break;

			case EBMLId.CodecID: {
				if (!this.currentTrack) break;

				this.currentTrack.codecId = reader.readString(size);
			}; break;

			case EBMLId.CodecPrivate: {
				if (!this.currentTrack) break;

				this.currentTrack.codecPrivate = reader.readBytes(size);
			}; break;

			case EBMLId.Video: {
				if (this.currentTrack?.info?.type !== 'video') break;

				this.readContiguousElements(reader, size);
			}; break;

			case EBMLId.PixelWidth: {
				if (this.currentTrack?.info?.type !== 'video') break;

				this.currentTrack.info.width = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.PixelHeight: {
				if (this.currentTrack?.info?.type !== 'video') break;

				this.currentTrack.info.height = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.Colour: {
				if (this.currentTrack?.info?.type !== 'video') break;

				this.currentTrack.info.colorSpace = {};
				this.readContiguousElements(reader, size);
			}; break;

			case EBMLId.MatrixCoefficients: {
				if (this.currentTrack?.info?.type !== 'video' || !this.currentTrack.info.colorSpace) break;

				const matrixCoefficients = reader.readUnsignedInt(size);
				const mapped = MATRIX_COEFFICIENTS_MAP_INVERSE[matrixCoefficients] ?? null;
				this.currentTrack.info.colorSpace.matrix = mapped;
			}; break;

			case EBMLId.Range: {
				if (this.currentTrack?.info?.type !== 'video' || !this.currentTrack.info.colorSpace) break;

				this.currentTrack.info.colorSpace.fullRange = reader.readUnsignedInt(size) === 2;
			}; break;

			case EBMLId.TransferCharacteristics: {
				if (this.currentTrack?.info?.type !== 'video' || !this.currentTrack.info.colorSpace) break;

				const transferCharacteristics = reader.readUnsignedInt(size);
				const mapped = TRANSFER_CHARACTERISTICS_MAP_INVERSE[transferCharacteristics] ?? null;
				this.currentTrack.info.colorSpace.transfer = mapped;
			}; break;

			case EBMLId.Primaries: {
				if (this.currentTrack?.info?.type !== 'video' || !this.currentTrack.info.colorSpace) break;

				const primaries = reader.readUnsignedInt(size);
				const mapped = COLOR_PRIMARIES_MAP_INVERSE[primaries] ?? null;
				this.currentTrack.info.colorSpace.primaries = mapped;
			}; break;

			case EBMLId.Projection: {
				if (this.currentTrack?.info?.type !== 'video') break;

				this.readContiguousElements(reader, size);
			}; break;

			case EBMLId.ProjectionPoseRoll: {
				if (this.currentTrack?.info?.type !== 'video') break;

				const rotation = (reader.readFloat(size) + 360) % 360;
				if ([0, 90, 180, 270].includes(rotation)) {
					this.currentTrack.info.rotation = rotation as Rotation;
				}
			}; break;

			case EBMLId.Audio: {
				if (this.currentTrack?.info?.type !== 'audio') break;

				this.readContiguousElements(reader, size);
			}; break;

			case EBMLId.SamplingFrequency: {
				if (this.currentTrack?.info?.type !== 'audio') break;

				this.currentTrack.info.sampleRate = reader.readFloat(size);
			}; break;

			case EBMLId.Channels: {
				if (this.currentTrack?.info?.type !== 'audio') break;

				this.currentTrack.info.numberOfChannels = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.BitDepth: {
				if (this.currentTrack?.info?.type !== 'audio') break;

				this.currentTrack.info.bitDepth = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.CuePoint: {
				if (!this.currentSegment) break;

				const cuePoint: CuePoint = { time: -1, clusterPosition: -1 };
				this.currentSegment.cuePoints.push(cuePoint);
				this.readContiguousElements(reader, size);

				if (cuePoint.time === -1 || cuePoint.clusterPosition === -1) {
					this.currentSegment.cuePoints.pop();
				}
			}; break;

			case EBMLId.CueTime: {
				const lastCuePoint = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
				if (!lastCuePoint) break;

				lastCuePoint.time = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.CueTrackPositions: {
				const lastCuePoint = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
				if (!lastCuePoint) break;

				this.readContiguousElements(reader, size);
			}; break;

			case EBMLId.CueClusterPosition: {
				const lastCuePoint = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
				if (!lastCuePoint) break;

				assert(this.currentSegment);
				lastCuePoint.clusterPosition = this.currentSegment.dataStartPos + reader.readUnsignedInt(size);
			}; break;

			case EBMLId.Timestamp: {
				if (!this.currentCluster) break;

				this.currentCluster.timestamp = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.SimpleBlock: {
				if (!this.currentCluster) break;

				const trackNumber = reader.readVarInt();
				const relativeTimestamp = reader.readS16();

				const flags = reader.readU8();
				const isKeyFrame = !!(flags & 0x80);

				const trackData = this.getTrackDataInCluster(this.currentCluster, trackNumber);
				trackData.blocks.push({
					timestamp: relativeTimestamp, // We'll add the cluster's timestamp to this later
					duration: 0,
					isKeyFrame,
					referencedTimestamps: [],
					data: reader.readBytes(size - (reader.pos - dataStartPos)),
				});
			}; break;

			case EBMLId.BlockGroup: {
				if (!this.currentCluster) break;

				this.readContiguousElements(reader, size);

				if (this.currentBlock) {
					for (let i = 0; i < this.currentBlock.referencedTimestamps.length; i++) {
						this.currentBlock.referencedTimestamps[i]! += this.currentBlock.timestamp;
					}

					this.currentBlock = null;
				}
			}; break;

			case EBMLId.Block: {
				if (!this.currentCluster) break;

				const trackNumber = reader.readVarInt();
				const relativeTimestamp = reader.readS16();

				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const flags = reader.readU8();

				const trackData = this.getTrackDataInCluster(this.currentCluster, trackNumber);
				this.currentBlock = {
					timestamp: relativeTimestamp, // We'll add the cluster's timestamp to this later
					duration: 0,
					isKeyFrame: true,
					referencedTimestamps: [],
					data: reader.readBytes(size - (reader.pos - dataStartPos)),
				};
				trackData.blocks.push(this.currentBlock);
			}; break;

			case EBMLId.BlockDuration: {
				if (!this.currentBlock) break;

				this.currentBlock.duration = reader.readUnsignedInt(size);
			}; break;

			case EBMLId.ReferenceBlock: {
				if (!this.currentBlock) break;

				this.currentBlock.isKeyFrame = false;

				const relativeTimestamp = reader.readSignedInt(size);

				// We'll offset this by the block's timestamp later
				this.currentBlock.referencedTimestamps.push(relativeTimestamp);
			}; break;
		}

		this.assertDefinedSize(size);
		reader.pos = dataStartPos + size;
	}
}

abstract class MatroskaTrackBacking<
	Sample extends EncodedVideoSample | EncodedAudioSample,
> implements InputTrackBacking {
	sampleToClusterLocation = new WeakMap<Sample, {
		cluster: Cluster;
		blockIndex: number;
	}>();

	constructor(public internalTrack: InternalTrack) {}

	getCodec(): Promise<MediaCodec | null> {
		throw new Error('Not implemented on base class.');
	}

	async computeDuration() {
		const lastSample = await this.getSample(Infinity, { metadataOnly: true });
		return (lastSample?.timestamp ?? 0) + (lastSample?.duration ?? 0);
	}

	async getFirstTimestamp() {
		const firstSample = await this.getFirstSample({ metadataOnly: true });
		return firstSample?.timestamp ?? 0;
	}

	abstract createSample(
		data: Uint8Array,
		byteLength: number,
		type: SampleType,
		timestamp: number,
		duration: number,
	): Sample;

	async getFirstSample(options: SampleRetrievalOptions) {
		return this.performClusterLookup(
			() => {
				const cluster = this.internalTrack.clusters[0];
				return {
					clusterIndex: cluster ? 0 : -1,
					blockIndex: cluster ? 0 : -1,
					correctBlockFound: !!cluster,
				};
			},
			0,
			Infinity,
			options,
		);
	}

	private intoTimescale(timestamp: number) {
		const result = timestamp * this.internalTrack.segment.timestampFactor;
		const rounded = Math.round(result);

		if (Math.abs(1 - (result / rounded)) < 10 * Number.EPSILON) {
			// The result is very close to an integer, meaning the number likely originated by an integer being divided
			// by the timestamp factor. For stability, it's best to return the integer in this case.
			return rounded;
		}

		return result;
	}

	async getSample(timestamp: number, options: SampleRetrievalOptions) {
		const timestampInTimescale = this.intoTimescale(timestamp);

		return this.performClusterLookup(
			() => this.findBlockInClustersForTimestamp(timestampInTimescale),
			timestampInTimescale,
			timestampInTimescale,
			options,
		);
	}

	async getNextSample(sample: Sample, options: SampleRetrievalOptions) {
		const locationInCluster = this.sampleToClusterLocation.get(sample);
		if (locationInCluster === undefined) {
			throw new Error('Sample was not created from this track.');
		}

		const trackData = locationInCluster.cluster.trackData.get(this.internalTrack.id)!;
		const block = trackData.blocks[locationInCluster.blockIndex]!;

		const clusterIndex = binarySearchExact(
			this.internalTrack.clusters,
			locationInCluster.cluster.elementStartPos,
			x => x.elementStartPos,
		);
		assert(clusterIndex !== -1);

		return this.performClusterLookup(
			() => {
				if (locationInCluster.blockIndex + 1 < trackData.blocks.length) {
					// We can simply take the next block in the cluster
					return {
						clusterIndex,
						blockIndex: locationInCluster.blockIndex + 1,
						correctBlockFound: true,
					};
				} else {
					// Walk the list of clusters until we find the next cluster for this track
					let currentCluster = locationInCluster.cluster;
					while (currentCluster.nextCluster) {
						currentCluster = currentCluster.nextCluster;

						const trackData = currentCluster.trackData.get(this.internalTrack.id);
						if (trackData) {
							const clusterIndex = binarySearchExact(
								this.internalTrack.clusters,
								currentCluster.elementStartPos,
								x => x.elementStartPos,
							);
							assert(clusterIndex !== -1);
							return {
								clusterIndex,
								blockIndex: 0,
								correctBlockFound: true,
							};
						}
					}

					return {
						clusterIndex,
						blockIndex: -1,
						correctBlockFound: false,
					};
				}
			},
			block.timestamp,
			Infinity,
			options,
		);
	}

	async getKeySample(timestamp: number, options: SampleRetrievalOptions) {
		const timestampInTimescale = this.intoTimescale(timestamp);

		return this.performClusterLookup(
			() => this.findKeyBlockInClustersForTimestamp(timestampInTimescale),
			timestampInTimescale,
			timestampInTimescale,
			options,
		);
	}

	async getNextKeySample(sample: Sample, options: SampleRetrievalOptions) {
		const locationInCluster = this.sampleToClusterLocation.get(sample);
		if (locationInCluster === undefined) {
			throw new Error('Sample was not created from this track.');
		}

		const trackData = locationInCluster.cluster.trackData.get(this.internalTrack.id)!;
		const block = trackData.blocks[locationInCluster.blockIndex]!;

		const clusterIndex = binarySearchExact(
			this.internalTrack.clusters,
			locationInCluster.cluster.elementStartPos,
			x => x.elementStartPos,
		);
		assert(clusterIndex !== -1);

		return this.performClusterLookup(
			() => {
				const nextKeyFrameIndex = trackData.blocks.findIndex(
					(x, i) => x.isKeyFrame && i > locationInCluster.blockIndex,
				);

				if (nextKeyFrameIndex !== -1) {
					// We can simply take the next key frame in the cluster
					return {
						clusterIndex,
						blockIndex: nextKeyFrameIndex,
						correctBlockFound: true,
					};
				} else {
					// Walk the list of clusters until we find the next cluster for this track
					let currentCluster = locationInCluster.cluster;
					while (currentCluster.nextCluster) {
						currentCluster = currentCluster.nextCluster;

						const trackData = currentCluster.trackData.get(this.internalTrack.id);
						if (trackData && trackData.firstKeyFrameTimestamp !== null) {
							const clusterIndex = binarySearchExact(
								this.internalTrack.clusters,
								currentCluster.elementStartPos,
								x => x.elementStartPos,
							);
							assert(clusterIndex !== -1);

							const keyFrameIndex = trackData.blocks.findIndex(x => x.isKeyFrame);
							assert(keyFrameIndex !== -1); // There must be one

							return {
								clusterIndex,
								blockIndex: keyFrameIndex,
								correctBlockFound: true,
							};
						}
					}

					return {
						clusterIndex,
						blockIndex: -1,
						correctBlockFound: false,
					};
				}
			},
			block.timestamp,
			Infinity,
			options,
		);
	}

	private async fetchSampleInCluster(cluster: Cluster, blockIndex: number, options: SampleRetrievalOptions) {
		if (blockIndex === -1) {
			return null;
		}

		const trackData = cluster.trackData.get(this.internalTrack.id)!;
		const block = trackData.blocks[blockIndex];
		assert(block);

		const data = options.metadataOnly ? PLACEHOLDER_DATA : block.data;
		const timestamp = block.timestamp / this.internalTrack.segment.timestampFactor;
		const duration = block.duration / this.internalTrack.segment.timestampFactor;
		const sample = this.createSample(
			data,
			block.data.byteLength,
			block.isKeyFrame ? 'key' : 'delta',
			timestamp,
			duration,
		);

		this.sampleToClusterLocation.set(sample, { cluster, blockIndex });

		return sample;
	}

	private findBlockInClustersForTimestamp(timestampInTimescale: number) {
		const clusterIndex = binarySearchLessOrEqual(
			this.internalTrack.clusters,
			timestampInTimescale,
			x => x.trackData.get(this.internalTrack.id)!.startTimestamp,
		);
		let blockIndex = -1;
		let correctBlockFound = false;

		if (clusterIndex !== -1) {
			const cluster = this.internalTrack.clusters[clusterIndex]!;
			const trackData = cluster.trackData.get(this.internalTrack.id)!;

			const index = binarySearchLessOrEqual(
				trackData.presentationTimestamps,
				timestampInTimescale,
				x => x.timestamp,
			);
			assert(index !== -1);

			blockIndex = trackData.presentationTimestamps[index]!.blockIndex;
			correctBlockFound = timestampInTimescale < trackData.endTimestamp;
		}

		return { clusterIndex, blockIndex, correctBlockFound };
	}

	private findKeyBlockInClustersForTimestamp(timestampInTimescale: number) {
		const indexInKeyFrameClusters = binarySearchLessOrEqual(
			this.internalTrack.clustersWithKeyFrame,
			timestampInTimescale,
			x => x.trackData.get(this.internalTrack.id)!.firstKeyFrameTimestamp!,
		);

		let clusterIndex = -1;
		let blockIndex = -1;
		let correctBlockFound = false;

		if (indexInKeyFrameClusters !== -1) {
			const cluster = this.internalTrack.clustersWithKeyFrame[indexInKeyFrameClusters]!;

			// Now, let's find the actual index of the cluster in the list of ALL clusters, not just key frame ones
			clusterIndex = binarySearchExact(
				this.internalTrack.clusters,
				cluster.elementStartPos,
				x => x.elementStartPos,
			);
			assert(clusterIndex !== -1);

			const trackData = cluster.trackData.get(this.internalTrack.id)!;
			const index = findLastIndex(trackData.presentationTimestamps, (x) => {
				const block = trackData.blocks[x.blockIndex]!;
				return block.isKeyFrame && x.timestamp <= timestampInTimescale;
			});
			assert(index !== -1); // It's a key frame cluster, so there must be a key frame

			const entry = trackData.presentationTimestamps[index]!;
			blockIndex = entry.blockIndex;
			correctBlockFound = timestampInTimescale < trackData.endTimestamp;
		}

		return { clusterIndex, blockIndex, correctBlockFound };
	}

	/** Looks for a sample in the clusters while trying to load as few clusters as possible to retrieve it. */
	private async performClusterLookup(
		// This function returns the best-matching block that is currently loaded. Based on this information, we know
		// which clusters we need to load to find the actual match.
		getBestMatch: () => { clusterIndex: number; blockIndex: number; correctBlockFound: boolean },
		// The timestamp with which we can search the lookup table
		searchTimestamp: number,
		// The timestamp for which we know the correct block will not come after it
		latestTimestamp: number,
		options: SampleRetrievalOptions,
	) {
		const { demuxer, segment } = this.internalTrack;
		const release = await segment.clusterLookupMutex.acquire(); // The algorithm requires exclusivity

		try {
			const { clusterIndex, blockIndex, correctBlockFound } = getBestMatch();
			if (correctBlockFound) {
				// The correct block already exists, easy path.
				const cluster = this.internalTrack.clusters[clusterIndex]!;
				return this.fetchSampleInCluster(cluster, blockIndex, options);
			}

			// We use the metadata reader to find the cluster, but the cluster reader to load the cluster
			const metadataReader = demuxer.metadataReader;

			let prevCluster: Cluster | null = null;
			let bestClusterIndex = clusterIndex;
			let bestBlockIndex = blockIndex;

			let cuePoint: CuePoint | null = null;
			if (segment.cuePoints.length > 0) {
				// Search for a cue point; this way, we won't need to start searching from the start of the file
				// but can jump right into the correct cluster (or at least nearby).
				const index = binarySearchLessOrEqual(
					segment.cuePoints,
					searchTimestamp,
					x => x.time,
				);

				if (index !== -1) {
					cuePoint = segment.cuePoints[index]!;
				}
			}

			if (clusterIndex === -1) {
				metadataReader.pos = cuePoint?.clusterPosition ?? segment.clusterSeekStartPos;
			} else {
				const cluster = this.internalTrack.clusters[clusterIndex]!;

				if (!cuePoint || cluster.elementStartPos >= cuePoint.clusterPosition) {
					metadataReader.pos = cluster.elementEndPos;
					prevCluster = cluster;
				} else {
					// Use the lookup entry
					metadataReader.pos = cuePoint.clusterPosition;
				}
			}

			while (metadataReader.pos < segment.elementEndPos) {
				if (prevCluster) {
					const trackData = prevCluster.trackData.get(this.internalTrack.id);
					if (trackData && trackData.startTimestamp > latestTimestamp) {
						// We're already past the upper bound, no need to keep searching
						break;
					}

					if (prevCluster.nextCluster) {
						// Skip ahead quickly without needing to read the file again
						metadataReader.pos = prevCluster.nextCluster.elementEndPos;
						prevCluster = prevCluster.nextCluster;
						continue;
					}
				}

				// Load the header
				await metadataReader.reader.loadRange(metadataReader.pos, metadataReader.pos + MAX_HEADER_SIZE);
				const elementStartPos = metadataReader.pos;
				const { id, size } = metadataReader.readElementHeader();
				const dataStartPos = metadataReader.pos;

				if (id === EBMLId.Cluster) {
					const index = binarySearchExact(segment.clusters, elementStartPos, x => x.elementStartPos);

					let cluster: Cluster;
					if (index === -1) {
						// This is the first time we've seen this cluster
						metadataReader.pos = elementStartPos;
						cluster = await demuxer.readCluster(segment);

						if (prevCluster) prevCluster.nextCluster = cluster;
						prevCluster = cluster;
					} else {
						// We already know this cluster
						cluster = segment.clusters[index]!;
						// Even if we already know the cluster, we might not yet know its predecessor
						if (prevCluster) prevCluster.nextCluster = cluster;
						prevCluster = cluster;
					}

					const { clusterIndex, blockIndex, correctBlockFound } = getBestMatch();
					if (correctBlockFound) {
						const cluster = this.internalTrack.clusters[clusterIndex]!;
						return this.fetchSampleInCluster(cluster, blockIndex, options);
					}
					if (clusterIndex !== -1) {
						bestClusterIndex = clusterIndex;
						bestBlockIndex = blockIndex;
					}
				}

				metadataReader.pos = dataStartPos + size;
			}

			if (bestClusterIndex !== -1) {
				// If we finished looping but didn't find a perfect match, still return the best match we found
				const cluster = this.internalTrack.clusters[bestClusterIndex]!;
				return this.fetchSampleInCluster(cluster, bestBlockIndex, options);
			}

			return null;
		} finally {
			release();
		}
	}
}

class MatroskaVideoTrackBacking extends MatroskaTrackBacking<EncodedVideoSample> implements InputVideoTrackBacking {
	override internalTrack: InternalVideoTrack;

	constructor(internalTrack: InternalVideoTrack) {
		super(internalTrack);
		this.internalTrack = internalTrack;
	}

	override async getCodec(): Promise<VideoCodec | null> {
		return this.internalTrack.info.codec;
	}

	async getCodedWidth() {
		return this.internalTrack.info.width;
	}

	async getCodedHeight() {
		return this.internalTrack.info.height;
	}

	async getRotation() {
		return this.internalTrack.info.rotation;
	}

	async getDecoderConfig(): Promise<VideoDecoderConfig | null> {
		if (!this.internalTrack.info.codec) {
			return null;
		}

		return {
			codec: 'vp09.00.31.08' ?? extractVideoCodecString({
				codec: this.internalTrack.info.codec,
				codecDescription: this.internalTrack.codecPrivate,
				colorSpace: this.internalTrack.info.colorSpace,
				vp9CodecInfo: null,
				av1CodecInfo: null,
			}),
			codedWidth: this.internalTrack.info.width,
			codedHeight: this.internalTrack.info.height,
			description: this.internalTrack.codecPrivate ?? undefined,
			colorSpace: this.internalTrack.info.colorSpace ?? undefined,
		};
	}

	createSample(
		data: Uint8Array,
		byteLength: number,
		type: SampleType,
		timestamp: number,
		duration: number,
	) {
		return new EncodedVideoSample(data, type, timestamp, duration, byteLength);
	}
}

class MatroskaAudioTrackBacking extends MatroskaTrackBacking<EncodedAudioSample> implements InputAudioTrackBacking {
	override internalTrack: InternalAudioTrack;

	constructor(internalTrack: InternalAudioTrack) {
		super(internalTrack);
		this.internalTrack = internalTrack;
	}

	override async getCodec(): Promise<AudioCodec | null> {
		return this.internalTrack.info.codec;
	}

	async getNumberOfChannels() {
		return this.internalTrack.info.numberOfChannels;
	}

	async getSampleRate() {
		return this.internalTrack.info.sampleRate;
	}

	async getDecoderConfig(): Promise<AudioDecoderConfig | null> {
		if (!this.internalTrack.info.codec) {
			return null;
		}

		return {
			codec: extractAudioCodecString({
				codec: this.internalTrack.info.codec,
				codecDescription: this.internalTrack.codecPrivate,
				aacCodecInfo: null,
			}),
			numberOfChannels: this.internalTrack.info.numberOfChannels,
			sampleRate: this.internalTrack.info.sampleRate,
			description: this.internalTrack.codecPrivate ?? undefined,
		};
	}

	createSample(
		data: Uint8Array,
		byteLength: number,
		type: SampleType,
		timestamp: number,
		duration: number,
	) {
		return new EncodedAudioSample(data, type, timestamp, duration, byteLength);
	}
}

/**
 * This function sorts blocks to satisfy block references: If block A is referenced by block B, then block A should
 * come before block B. The resulting array is one that is in decode order.
 */
const sortBlocksTopologically = (blocks: ClusterBlock[]) => {
	// Based on "A fast and effective heuristic for the feedback arc set problem" by Peter Eades et al.

	const n = blocks.length;

	// Build timestamp -> index mapping
	const timestampToIndex = new Map<number, number>();
	for (let i = 0; i < n; i++) {
		timestampToIndex.set(blocks[i]!.timestamp, i);
	}

	const outgoing = new Array<Set<number>>(n);
	const incoming = new Array<Set<number>>(n);
	const remaining = new Set<number>();

	for (let i = 0; i < n; i++) {
		outgoing[i] = new Set();
		incoming[i] = new Set();
		remaining.add(i);
	}

	// Build the graph
	for (let i = 0; i < n; i++) {
		const refs = blocks[i]!.referencedTimestamps;
		for (let j = 0; j < refs.length; j++) {
			const referencedIndex = timestampToIndex.get(refs[j]!);
			if (referencedIndex !== undefined) {
				outgoing[referencedIndex]!.add(i);
				incoming[i]!.add(referencedIndex);
			}
		}
	}

	// Pre-allocate arrays with known size
	const prefix = new Array<number>(n).fill(-1);
	const suffix = new Array<number>(n).fill(-1);
	let prefixSize = 0;
	let suffixSize = 0;

	while (remaining.size > 0) {
		let progress = false;

		const currentVertices = Array.from(remaining);

		// Remove sinks
		for (let i = 0; i < currentVertices.length; i++) {
			const index = currentVertices[i]!;
			if (outgoing[index]!.size === 0) {
				suffix[suffixSize++] = index;
				// Remove this vertex
				for (const fromIndex of incoming[index]!) {
					outgoing[fromIndex]!.delete(index);
				}
				remaining.delete(index);
				progress = true;
			}
		}

		// Remove sources
		for (let i = 0; i < currentVertices.length; i++) {
			const index = currentVertices[i]!;
			if (remaining.has(index) && incoming[index]!.size === 0) {
				prefix[prefixSize++] = index;
				// Remove this vertex
				for (const toIndex of outgoing[index]!) {
					incoming[toIndex]!.delete(index);
				}
				remaining.delete(index);
				progress = true;
			}
		}

		// If no sinks or sources, remove vertex with maximum Δ
		if (!progress && remaining.size > 0) {
			let maxDelta = -Infinity;
			let maxDeltaIndex = -1;

			for (const index of remaining) {
				const delta = outgoing[index]!.size - incoming[index]!.size;
				if (delta > maxDelta) {
					maxDelta = delta;
					maxDeltaIndex = index;
				}
			}

			prefix[prefixSize++] = maxDeltaIndex;
			// Remove this vertex
			for (const toIndex of outgoing[maxDeltaIndex]!) {
				incoming[toIndex]!.delete(maxDeltaIndex);
			}
			for (const fromIndex of incoming[maxDeltaIndex]!) {
				outgoing[fromIndex]!.delete(maxDeltaIndex);
			}
			remaining.delete(maxDeltaIndex);
		}
	}

	const result = new Array<ClusterBlock | null>(n).fill(null);

	// Copy prefix
	for (let i = 0; i < prefixSize; i++) {
		result[i] = blocks[prefix[i]!]!;
	}

	// Copy suffix in reverse
	for (let i = 0; i < suffixSize; i++) {
		result[prefixSize + i] = blocks[suffix[suffixSize - 1 - i]!]!;
	}

	return result as ClusterBlock[];
};
