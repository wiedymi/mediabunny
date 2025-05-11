import { assert, Bitstream, readExpGolomb } from './misc';

// References:
// ISO 14496-15
// ITU-T-REC-H.264
// https://stackoverflow.com/questions/24884827

/** Finds all NAL units in an AVC packet in Annex B format. */
const findNalUnitsInAnnexB = (packetData: Uint8Array) => {
	const nalUnits: { type: number; data: Uint8Array }[] = [];
	let i = 0;

	while (i < packetData.length) {
		let startCodePos = -1;
		let startCodeLength = 0;

		for (let j = i; j < packetData.length - 3; j++) {
			// Check for 3-byte start code (0x000001)
			if (packetData[j] === 0 && packetData[j + 1] === 0 && packetData[j + 2] === 1) {
				startCodePos = j;
				startCodeLength = 3;
				break;
			}

			// Check for 4-byte start code (0x00000001)
			if (
				j < packetData.length - 4
				&& packetData[j] === 0
				&& packetData[j + 1] === 0
				&& packetData[j + 2] === 0
				&& packetData[j + 3] === 1
			) {
				startCodePos = j;
				startCodeLength = 4;
				break;
			}
		}

		if (startCodePos === -1) {
			break; // No more start codes found
		}

		// If this isn't the first start code, extract the previous NAL unit
		if (i > 0 && startCodePos > i) {
			const nalData = packetData.subarray(i, startCodePos);
			if (nalData.length > 0) {
				const nalType = nalData[0]! & 0x1f;
				nalUnits.push({ type: nalType, data: nalData });
			}
		}

		i = startCodePos + startCodeLength;
	}

	// Extract the last NAL unit if there is one
	if (i < packetData.length) {
		const nalData = packetData.subarray(i);
		if (nalData.length > 0) {
			const nalType = nalData[0]! & 0x1f;
			nalUnits.push({ type: nalType, data: nalData });
		}
	}

	return nalUnits;
};

// Data specified in ISO 14496-15
export type AvcDecoderConfigurationRecord = {
	configurationVersion: number;
	avcProfileIndication: number;
	profileCompatibility: number;
	avcLevelIndication: number;
	lengthSizeMinusOne: number;
	sequenceParameterSets: {
		sequenceParameterSetLength: number;
		sequenceParameterSetNalUnit: Uint8Array;
	}[];
	pictureParameterSets: {
		pictureParameterSetLength: number;
		pictureParameterSetNalUnit: Uint8Array;
	}[];

	// Fields only for specific profiles:
	chromaFormat: number | null;
	bitDepthLumaMinus8: number | null;
	bitDepthChromaMinus8: number | null;
	sequenceParameterSetExt: {
		sequenceParameterSetExtLength: number;
		sequenceParameterSetExtNalUnit: Uint8Array;
	}[] | null;
};

/** Builds an AvcDecoderConfigurationRecord from an AVC packet in Annex B format. */
export const extractAvcDecoderConfigurationRecord = (packetData: Uint8Array) => {
	try {
		const nalUnits = findNalUnitsInAnnexB(packetData);

		const spsUnits = nalUnits.filter(unit => unit.type === 7);
		const ppsUnits = nalUnits.filter(unit => unit.type === 8);
		const spsExtUnits = nalUnits.filter(unit => unit.type === 13);

		if (spsUnits.length === 0) {
			return null;
		}

		if (ppsUnits.length === 0) {
			return null;
		}

		// Let's get the first SPS for profile and level information
		const spsData = spsUnits[0]!.data;
		const bitstream = new Bitstream(spsData);

		bitstream.skipBits(1); // forbidden_zero_bit
		bitstream.skipBits(2); // nal_ref_idc
		const nal_unit_type = bitstream.readBits(5);

		if (nal_unit_type !== 7) { // SPS NAL unit type is 7
			console.error('Invalid SPS NAL unit type');
			return null;
		}

		const profile_idc = bitstream.readAlignedByte();
		const constraint_flags = bitstream.readAlignedByte();
		const level_idc = bitstream.readAlignedByte();

		const record: AvcDecoderConfigurationRecord = {
			configurationVersion: 1,
			avcProfileIndication: profile_idc,
			profileCompatibility: constraint_flags,
			avcLevelIndication: level_idc,
			lengthSizeMinusOne: 3, // Typically 4 bytes for length field
			sequenceParameterSets: spsUnits.map(unit => ({
				sequenceParameterSetLength: unit.data.length,
				sequenceParameterSetNalUnit: unit.data,
			})),
			pictureParameterSets: ppsUnits.map(unit => ({
				pictureParameterSetLength: unit.data.length,
				pictureParameterSetNalUnit: unit.data,
			})),
			chromaFormat: null,
			bitDepthLumaMinus8: null,
			bitDepthChromaMinus8: null,
			sequenceParameterSetExt: null,
		};

		if (
			profile_idc === 100
			|| profile_idc === 110
			|| profile_idc === 122
			|| profile_idc === 144
		) {
			readExpGolomb(bitstream); // seq_parameter_set_id

			const chroma_format_idc = readExpGolomb(bitstream);

			if (chroma_format_idc === 3) {
				bitstream.skipBits(1); // separate_colour_plane_flag
			}

			const bit_depth_luma_minus8 = readExpGolomb(bitstream);

			const bit_depth_chroma_minus8 = readExpGolomb(bitstream);

			record.chromaFormat = chroma_format_idc;
			record.bitDepthLumaMinus8 = bit_depth_luma_minus8;
			record.bitDepthChromaMinus8 = bit_depth_chroma_minus8;

			record.sequenceParameterSetExt = spsExtUnits.map(unit => ({
				sequenceParameterSetExtLength: unit.data.length,
				sequenceParameterSetExtNalUnit: unit.data,
			}));
		}

		return record;
	} catch (error) {
		console.error('Error building AVC Decoder Configuration Record:', error);
		return null;
	}
};

/** Serializes an AvcDecoderConfigurationRecord into the format specified in Section 5.3.3.1 of ISO 14496-15. */
export const serializeAvcDecoderConfigurationRecord = (record: AvcDecoderConfigurationRecord) => {
	const bytes: number[] = [];

	// Write header
	bytes.push(record.configurationVersion);
	bytes.push(record.avcProfileIndication);
	bytes.push(record.profileCompatibility);
	bytes.push(record.avcLevelIndication);
	bytes.push(0xFC | (record.lengthSizeMinusOne & 0x03)); // Reserved bits (6) + lengthSizeMinusOne (2)

	// Reserved bits (3) + numOfSequenceParameterSets (5)
	bytes.push(0xE0 | (record.sequenceParameterSets.length & 0x1F));

	// Write SPS
	for (const sps of record.sequenceParameterSets) {
		bytes.push(sps.sequenceParameterSetLength >> 8); // High byte
		bytes.push(sps.sequenceParameterSetLength & 0xFF); // Low byte

		for (let i = 0; i < sps.sequenceParameterSetLength; i++) {
			bytes.push(sps.sequenceParameterSetNalUnit[i]!);
		}
	}

	bytes.push(record.pictureParameterSets.length);

	// Write PPS
	for (const pps of record.pictureParameterSets) {
		bytes.push(pps.pictureParameterSetLength >> 8); // High byte
		bytes.push(pps.pictureParameterSetLength & 0xFF); // Low byte

		for (let i = 0; i < pps.pictureParameterSetLength; i++) {
			bytes.push(pps.pictureParameterSetNalUnit[i]!);
		}
	}

	if (
		record.avcProfileIndication === 100
		|| record.avcProfileIndication === 110
		|| record.avcProfileIndication === 122
		|| record.avcProfileIndication === 144
	) {
		assert(record.chromaFormat !== null);
		assert(record.bitDepthLumaMinus8 !== null);
		assert(record.bitDepthChromaMinus8 !== null);
		assert(record.sequenceParameterSetExt !== null);

		bytes.push(0xFC | (record.chromaFormat & 0x03)); // Reserved bits + chroma_format
		bytes.push(0xF8 | (record.bitDepthLumaMinus8 & 0x07)); // Reserved bits + bit_depth_luma_minus8
		bytes.push(0xF8 | (record.bitDepthChromaMinus8 & 0x07)); // Reserved bits + bit_depth_chroma_minus8

		bytes.push(record.sequenceParameterSetExt.length);

		// Write SPS Ext
		for (const spsExt of record.sequenceParameterSetExt) {
			bytes.push(spsExt.sequenceParameterSetExtLength >> 8); // High byte
			bytes.push(spsExt.sequenceParameterSetExtLength & 0xFF); // Low byte

			for (let i = 0; i < spsExt.sequenceParameterSetExtLength; i++) {
				bytes.push(spsExt.sequenceParameterSetExtNalUnit[i]!);
			}
		}
	}

	return new Uint8Array(bytes);
};

/** Converts an AVC packet in Annex B format to AVCC format. */
export const transformAnnexBToAvcc = (packetData: Uint8Array) => {
	const NAL_UNIT_LENGTH_SIZE = 4;

	const nalUnits = findNalUnitsInAnnexB(packetData);

	if (nalUnits.length === 0) {
		// If no NAL units were found, it's not valid Annex B data
		return null;
	}

	let totalSize = 0;
	for (const nalUnit of nalUnits) {
		totalSize += NAL_UNIT_LENGTH_SIZE + nalUnit.data.length;
	}

	const avccData = new Uint8Array(totalSize);
	const dataView = new DataView(avccData.buffer);
	let offset = 0;

	// Write each NAL unit with its length prefix
	for (const nalUnit of nalUnits) {
		const length = nalUnit.data.length;

		dataView.setUint32(offset, length, false);
		offset += 4;

		avccData.set(nalUnit.data, offset);
		offset += nalUnit.data.length;
	}

	return avccData;
};
