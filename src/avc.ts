import { assert, Bitstream, readExpGolomb, readSignedExpGolomb } from './misc';

// References:
// ISO 14496-15
// Rec. ITU-T H.264
// Rec. ITU-T H.265
// https://stackoverflow.com/questions/24884827

/** Finds all NAL units in an AVC packet in Annex B format. */
const findNalUnitsInAnnexB = (packetData: Uint8Array) => {
	const nalUnits: Uint8Array[] = [];
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
				nalUnits.push(nalData);
			}
		}

		i = startCodePos + startCodeLength;
	}

	// Extract the last NAL unit if there is one
	if (i < packetData.length) {
		const nalData = packetData.subarray(i);
		if (nalData.length > 0) {
			nalUnits.push(nalData);
		}
	}

	return nalUnits;
};

const removeEmulationPreventionBytes = (data: Uint8Array) => {
	const result: number[] = [];
	const len = data.length;

	for (let i = 0; i < len; i++) {
		// Look for the 0x000003 pattern
		if (i + 2 < len && data[i] === 0x00 && data[i + 1] === 0x00 && data[i + 2] === 0x03) {
			result.push(0x00, 0x00); // Push the first two bytes
			i += 2; // Skip the 0x03 byte
		} else {
			result.push(data[i]!);
		}
	}

	return new Uint8Array(result);
};

// Data specified in ISO 14496-15
export type AvcDecoderConfigurationRecord = {
	configurationVersion: number;
	avcProfileIndication: number;
	profileCompatibility: number;
	avcLevelIndication: number;
	lengthSizeMinusOne: number;
	sequenceParameterSets: Uint8Array[];
	pictureParameterSets: Uint8Array[];

	// Fields only for specific profiles:
	chromaFormat: number | null;
	bitDepthLumaMinus8: number | null;
	bitDepthChromaMinus8: number | null;
	sequenceParameterSetExt: Uint8Array[] | null;
};

const extractNalUnitTypeForAvc = (data: Uint8Array) => {
	return data[0]! & 0x1F;
};

/** Builds an AvcDecoderConfigurationRecord from an AVC packet in Annex B format. */
export const extractAvcDecoderConfigurationRecord = (packetData: Uint8Array) => {
	try {
		const nalUnits = findNalUnitsInAnnexB(packetData);

		const spsUnits = nalUnits.filter(unit => extractNalUnitTypeForAvc(unit) === 7);
		const ppsUnits = nalUnits.filter(unit => extractNalUnitTypeForAvc(unit) === 8);
		const spsExtUnits = nalUnits.filter(unit => extractNalUnitTypeForAvc(unit) === 13);

		if (spsUnits.length === 0) {
			return null;
		}

		if (ppsUnits.length === 0) {
			return null;
		}

		// Let's get the first SPS for profile and level information
		const spsData = spsUnits[0]!;
		const bitstream = new Bitstream(removeEmulationPreventionBytes(spsData));

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
			sequenceParameterSets: spsUnits,
			pictureParameterSets: ppsUnits,
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
			record.sequenceParameterSetExt = spsExtUnits;
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
		const length = sps.byteLength;
		bytes.push(length >> 8); // High byte
		bytes.push(length & 0xFF); // Low byte

		for (let i = 0; i < length; i++) {
			bytes.push(sps[i]!);
		}
	}

	bytes.push(record.pictureParameterSets.length);

	// Write PPS
	for (const pps of record.pictureParameterSets) {
		const length = pps.byteLength;
		bytes.push(length >> 8); // High byte
		bytes.push(length & 0xFF); // Low byte

		for (let i = 0; i < length; i++) {
			bytes.push(pps[i]!);
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
			const length = spsExt.byteLength;
			bytes.push(length >> 8); // High byte
			bytes.push(length & 0xFF); // Low byte

			for (let i = 0; i < length; i++) {
				bytes.push(spsExt[i]!);
			}
		}
	}

	return new Uint8Array(bytes);
};

/** Converts an AVC packet in Annex B format to length-prefixed format. */
export const transformAnnexBToLengthPrefixed = (packetData: Uint8Array) => {
	const NAL_UNIT_LENGTH_SIZE = 4;

	const nalUnits = findNalUnitsInAnnexB(packetData);

	if (nalUnits.length === 0) {
		// If no NAL units were found, it's not valid Annex B data
		return null;
	}

	let totalSize = 0;
	for (const nalUnit of nalUnits) {
		totalSize += NAL_UNIT_LENGTH_SIZE + nalUnit.byteLength;
	}

	const avccData = new Uint8Array(totalSize);
	const dataView = new DataView(avccData.buffer);
	let offset = 0;

	// Write each NAL unit with its length prefix
	for (const nalUnit of nalUnits) {
		const length = nalUnit.byteLength;

		dataView.setUint32(offset, length, false);
		offset += 4;

		avccData.set(nalUnit, offset);
		offset += nalUnit.byteLength;
	}

	return avccData;
};

const NALU_TYPE_VPS = 32;
const NALU_TYPE_SPS = 33;
const NALU_TYPE_PPS = 34;
const NALU_TYPE_SEI_PREFIX = 39;
const NALU_TYPE_SEI_SUFFIX = 40;

export type HevcDecoderConfigurationRecord = {
	configurationVersion: number;
	generalProfileSpace: number;
	generalTierFlag: number;
	generalProfileIdc: number;
	generalProfileCompatibilityFlags: number;
	generalConstraintIndicatorFlags: Uint8Array; // 6 bytes long
	generalLevelIdc: number;
	minSpatialSegmentationIdc: number;
	parallelismType: number;
	chromaFormatIdc: number;
	bitDepthLumaMinus8: number;
	bitDepthChromaMinus8: number;
	avgFrameRate: number;
	constantFrameRate: number;
	numTemporalLayers: number;
	temporalIdNested: number;
	lengthSizeMinusOne: number;
	arrays: {
		arrayCompleteness: number;
		nalUnitType: number;
		nalUnits: Uint8Array[];
	}[];
};

const extractNalUnitTypeForHevc = (data: Uint8Array) => {
	return (data[0]! >> 1) & 0x3F;
};

export const extractHevcDecoderConfigurationRecord = (
	packetData: Uint8Array,
) => {
	try {
		const nalUnits = findNalUnitsInAnnexB(packetData);

		const vpsUnits = nalUnits.filter(unit => extractNalUnitTypeForHevc(unit) === NALU_TYPE_VPS);
		const spsUnits = nalUnits.filter(unit => extractNalUnitTypeForHevc(unit) === NALU_TYPE_SPS);
		const ppsUnits = nalUnits.filter(unit => extractNalUnitTypeForHevc(unit) === NALU_TYPE_PPS);
		const seiUnits = nalUnits.filter(
			unit => extractNalUnitTypeForHevc(unit) === NALU_TYPE_SEI_PREFIX
				|| extractNalUnitTypeForHevc(unit) === NALU_TYPE_SEI_SUFFIX,
		);

		if (spsUnits.length === 0 || ppsUnits.length === 0) return null;

		const sps = spsUnits[0]!;
		const bitstream = new Bitstream(removeEmulationPreventionBytes(sps));

		bitstream.skipBits(16); // NAL header

		bitstream.readBits(4); // sps_video_parameter_set_id
		const sps_max_sub_layers_minus1 = bitstream.readBits(3);
		const sps_temporal_id_nesting_flag = bitstream.readBits(1);

		const {
			general_profile_space,
			general_tier_flag,
			general_profile_idc,
			general_profile_compatibility_flags,
			general_constraint_indicator_flags,
			general_level_idc,
		} = parseProfileTierLevel(bitstream, sps_max_sub_layers_minus1);

		readExpGolomb(bitstream); // sps_seq_parameter_set_id

		const chroma_format_idc = readExpGolomb(bitstream);
		if (chroma_format_idc === 3) bitstream.skipBits(1); // separate_colour_plane_flag

		readExpGolomb(bitstream); // pic_width_in_luma_samples
		readExpGolomb(bitstream); // pic_height_in_luma_samples

		if (bitstream.readBits(1)) { // conformance_window_flag
			readExpGolomb(bitstream); // conf_win_left_offset
			readExpGolomb(bitstream); // conf_win_right_offset
			readExpGolomb(bitstream); // conf_win_top_offset
			readExpGolomb(bitstream); // conf_win_bottom_offset
		}

		const bit_depth_luma_minus8 = readExpGolomb(bitstream);
		const bit_depth_chroma_minus8 = readExpGolomb(bitstream);

		readExpGolomb(bitstream); // log2_max_pic_order_cnt_lsb_minus4

		const sps_sub_layer_ordering_info_present_flag = bitstream.readBits(1);
		const maxNum = sps_sub_layer_ordering_info_present_flag ? 0 : sps_max_sub_layers_minus1;
		for (let i = maxNum; i <= sps_max_sub_layers_minus1; i++) {
			readExpGolomb(bitstream); // sps_max_dec_pic_buffering_minus1[i]
			readExpGolomb(bitstream); // sps_max_num_reorder_pics[i]
			readExpGolomb(bitstream); // sps_max_latency_increase_plus1[i]
		}

		readExpGolomb(bitstream); // log2_min_luma_coding_block_size_minus3
		readExpGolomb(bitstream); // log2_diff_max_min_luma_coding_block_size
		readExpGolomb(bitstream); // log2_min_luma_transform_block_size_minus2
		readExpGolomb(bitstream); // log2_diff_max_min_luma_transform_block_size
		readExpGolomb(bitstream); // max_transform_hierarchy_depth_inter
		readExpGolomb(bitstream); // max_transform_hierarchy_depth_intra

		if (bitstream.readBits(1)) { // scaling_list_enabled_flag
			if (bitstream.readBits(1)) {
				skipScalingListData(bitstream);
			}
		}

		bitstream.skipBits(1); // amp_enabled_flag
		bitstream.skipBits(1); // sample_adaptive_offset_enabled_flag

		if (bitstream.readBits(1)) { // pcm_enabled_flag
			bitstream.skipBits(4); // pcm_sample_bit_depth_luma_minus1
			bitstream.skipBits(4); // pcm_sample_bit_depth_chroma_minus1
			readExpGolomb(bitstream); // log2_min_pcm_luma_coding_block_size_minus3
			readExpGolomb(bitstream); // log2_diff_max_min_pcm_luma_coding_block_size
			bitstream.skipBits(1); // pcm_loop_filter_disabled_flag
		}

		const num_short_term_ref_pic_sets = readExpGolomb(bitstream);
		skipAllStRefPicSets(bitstream, num_short_term_ref_pic_sets);

		if (bitstream.readBits(1)) { // long_term_ref_pics_present_flag
			const num_long_term_ref_pics_sps = readExpGolomb(bitstream);
			for (let i = 0; i < num_long_term_ref_pics_sps; i++) {
				readExpGolomb(bitstream); // lt_ref_pic_poc_lsb_sps[i]
				bitstream.skipBits(1); // used_by_curr_pic_lt_sps_flag[i]
			}
		}

		bitstream.skipBits(1); // sps_temporal_mvp_enabled_flag
		bitstream.skipBits(1); // strong_intra_smoothing_enabled_flag

		let min_spatial_segmentation_idc = 0;
		if (bitstream.readBits(1)) { // vui_parameters_present_flag
			min_spatial_segmentation_idc = parseVuiForMinSpatialSegmentationIdc(bitstream, sps_max_sub_layers_minus1);
		}

		// Parse PPS for parallelismType
		let parallelismType = 0;
		if (ppsUnits.length > 0) {
			const pps = ppsUnits[0]!;
			const ppsBitstream = new Bitstream(removeEmulationPreventionBytes(pps));

			ppsBitstream.skipBits(16); // NAL header
			readExpGolomb(ppsBitstream); // pps_pic_parameter_set_id
			readExpGolomb(ppsBitstream); // pps_seq_parameter_set_id
			ppsBitstream.skipBits(1); // dependent_slice_segments_enabled_flag
			ppsBitstream.skipBits(1); // output_flag_present_flag
			ppsBitstream.skipBits(3); // num_extra_slice_header_bits
			ppsBitstream.skipBits(1); // sign_data_hiding_enabled_flag
			ppsBitstream.skipBits(1); // cabac_init_present_flag
			readExpGolomb(ppsBitstream); // num_ref_idx_l0_default_active_minus1
			readExpGolomb(ppsBitstream); // num_ref_idx_l1_default_active_minus1
			readSignedExpGolomb(ppsBitstream); // init_qp_minus26
			ppsBitstream.skipBits(1); // constrained_intra_pred_flag
			ppsBitstream.skipBits(1); // transform_skip_enabled_flag
			if (ppsBitstream.readBits(1)) { // cu_qp_delta_enabled_flag
				readExpGolomb(ppsBitstream); // diff_cu_qp_delta_depth
			}
			readSignedExpGolomb(ppsBitstream); // pps_cb_qp_offset
			readSignedExpGolomb(ppsBitstream); // pps_cr_qp_offset
			ppsBitstream.skipBits(1); // pps_slice_chroma_qp_offsets_present_flag
			ppsBitstream.skipBits(1); // weighted_pred_flag
			ppsBitstream.skipBits(1); // weighted_bipred_flag
			ppsBitstream.skipBits(1); // transquant_bypass_enabled_flag
			const tiles_enabled_flag = ppsBitstream.readBits(1);
			const entropy_coding_sync_enabled_flag = ppsBitstream.readBits(1);

			if (!tiles_enabled_flag && !entropy_coding_sync_enabled_flag) parallelismType = 0;
			else if (tiles_enabled_flag && !entropy_coding_sync_enabled_flag) parallelismType = 2;
			else if (!tiles_enabled_flag && entropy_coding_sync_enabled_flag) parallelismType = 3;
			else parallelismType = 0;
		}

		const arrays = [
			...(vpsUnits.length
				? [
						{
							arrayCompleteness: 1,
							nalUnitType: NALU_TYPE_VPS,
							nalUnits: vpsUnits,
						},
					]
				: []),
			...(spsUnits.length
				? [
						{
							arrayCompleteness: 1,
							nalUnitType: NALU_TYPE_SPS,
							nalUnits: spsUnits,
						},
					]
				: []),
			...(ppsUnits.length
				? [
						{
							arrayCompleteness: 1,
							nalUnitType: NALU_TYPE_PPS,
							nalUnits: ppsUnits,
						},
					]
				: []),
			...(seiUnits.length
				? [
						{
							arrayCompleteness: 1,
							nalUnitType: extractNalUnitTypeForHevc(seiUnits[0]!),
							nalUnits: seiUnits,
						},
					]
				: []),
		];

		const record: HevcDecoderConfigurationRecord = {
			configurationVersion: 1,
			generalProfileSpace: general_profile_space,
			generalTierFlag: general_tier_flag,
			generalProfileIdc: general_profile_idc,
			generalProfileCompatibilityFlags: general_profile_compatibility_flags,
			generalConstraintIndicatorFlags: general_constraint_indicator_flags,
			generalLevelIdc: general_level_idc,
			minSpatialSegmentationIdc: min_spatial_segmentation_idc,
			parallelismType,
			chromaFormatIdc: chroma_format_idc,
			bitDepthLumaMinus8: bit_depth_luma_minus8,
			bitDepthChromaMinus8: bit_depth_chroma_minus8,
			avgFrameRate: 0,
			constantFrameRate: 0,
			numTemporalLayers: sps_max_sub_layers_minus1 + 1,
			temporalIdNested: sps_temporal_id_nesting_flag,
			lengthSizeMinusOne: 3,
			arrays,
		};

		return record;
	} catch (error) {
		console.error('Error building HEVC Decoder Configuration Record:', error);
		return null;
	}
};

const parseProfileTierLevel = (
	bitstream: Bitstream,
	maxNumSubLayersMinus1: number,
) => {
	const general_profile_space = bitstream.readBits(2);
	const general_tier_flag = bitstream.readBits(1);
	const general_profile_idc = bitstream.readBits(5);

	let general_profile_compatibility_flags = 0;
	for (let i = 0; i < 32; i++) {
		general_profile_compatibility_flags = (general_profile_compatibility_flags << 1) | bitstream.readBits(1);
	}

	const general_constraint_indicator_flags = new Uint8Array(6);
	for (let i = 0; i < 6; i++) {
		general_constraint_indicator_flags[i] = bitstream.readBits(8);
	}

	const general_level_idc = bitstream.readBits(8);

	const sub_layer_profile_present_flag: number[] = [];
	const sub_layer_level_present_flag: number[] = [];
	for (let i = 0; i < maxNumSubLayersMinus1; i++) {
		sub_layer_profile_present_flag.push(bitstream.readBits(1));
		sub_layer_level_present_flag.push(bitstream.readBits(1));
	}
	if (maxNumSubLayersMinus1 > 0) {
		for (let i = maxNumSubLayersMinus1; i < 8; i++) {
			bitstream.skipBits(2); // reserved_zero_2bits
		}
	}
	for (let i = 0; i < maxNumSubLayersMinus1; i++) {
		if (sub_layer_profile_present_flag[i]) bitstream.skipBits(88);
		if (sub_layer_level_present_flag[i]) bitstream.skipBits(8);
	}

	return {
		general_profile_space,
		general_tier_flag,
		general_profile_idc,
		general_profile_compatibility_flags,
		general_constraint_indicator_flags,
		general_level_idc,
	};
};

const skipScalingListData = (bitstream: Bitstream) => {
	for (let sizeId = 0; sizeId < 4; sizeId++) {
		for (let matrixId = 0; matrixId < (sizeId === 3 ? 2 : 6); matrixId++) {
			const scaling_list_pred_mode_flag = bitstream.readBits(1);
			if (!scaling_list_pred_mode_flag) {
				readExpGolomb(bitstream); // scaling_list_pred_matrix_id_delta
			} else {
				const coefNum = Math.min(64, 1 << (4 + (sizeId << 1)));
				if (sizeId > 1) {
					readSignedExpGolomb(bitstream); // scaling_list_dc_coef_minus8
				}
				for (let i = 0; i < coefNum; i++) {
					readSignedExpGolomb(bitstream); // scaling_list_delta_coef
				}
			}
		}
	}
};

const skipAllStRefPicSets = (bitstream: Bitstream, num_short_term_ref_pic_sets: number) => {
	const NumDeltaPocs: number[] = [];
	for (let stRpsIdx = 0; stRpsIdx < num_short_term_ref_pic_sets; stRpsIdx++) {
		NumDeltaPocs[stRpsIdx] = skipStRefPicSet(bitstream, stRpsIdx, num_short_term_ref_pic_sets, NumDeltaPocs);
	}
};

const skipStRefPicSet = (
	bitstream: Bitstream,
	stRpsIdx: number,
	num_short_term_ref_pic_sets: number,
	NumDeltaPocs: number[],
) => {
	let NumDeltaPocsThis = 0;
	let inter_ref_pic_set_prediction_flag = 0;
	let RefRpsIdx = 0;

	if (stRpsIdx !== 0) {
		inter_ref_pic_set_prediction_flag = bitstream.readBits(1);
	}
	if (inter_ref_pic_set_prediction_flag) {
		if (stRpsIdx === num_short_term_ref_pic_sets) {
			const delta_idx_minus1 = readExpGolomb(bitstream);
			RefRpsIdx = stRpsIdx - (delta_idx_minus1 + 1);
		} else {
			RefRpsIdx = stRpsIdx - 1;
		}
		bitstream.readBits(1); // delta_rps_sign
		readExpGolomb(bitstream); // abs_delta_rps_minus1

		// The number of iterations is NumDeltaPocs[RefRpsIdx] + 1
		const numDelta = NumDeltaPocs[RefRpsIdx] ?? 0;
		for (let j = 0; j <= numDelta; j++) {
			const used_by_curr_pic_flag = bitstream.readBits(1);
			if (!used_by_curr_pic_flag) {
				bitstream.readBits(1); // use_delta_flag
			}
		}
		NumDeltaPocsThis = NumDeltaPocs[RefRpsIdx]!;
	} else {
		const num_negative_pics = readExpGolomb(bitstream);
		const num_positive_pics = readExpGolomb(bitstream);

		for (let i = 0; i < num_negative_pics; i++) {
			readExpGolomb(bitstream); // delta_poc_s0_minus1[i]
			bitstream.readBits(1); // used_by_curr_pic_s0_flag[i]
		}
		for (let i = 0; i < num_positive_pics; i++) {
			readExpGolomb(bitstream); // delta_poc_s1_minus1[i]
			bitstream.readBits(1); // used_by_curr_pic_s1_flag[i]
		}
		NumDeltaPocsThis = num_negative_pics + num_positive_pics;
	}
	return NumDeltaPocsThis;
};

const parseVuiForMinSpatialSegmentationIdc = (bitstream: Bitstream, sps_max_sub_layers_minus1: number) => {
	if (bitstream.readBits(1)) { // aspect_ratio_info_present_flag
		const aspect_ratio_idc = bitstream.readBits(8);
		if (aspect_ratio_idc === 255) {
			bitstream.readBits(16); // sar_width
			bitstream.readBits(16); // sar_height
		}
	}
	if (bitstream.readBits(1)) { // overscan_info_present_flag
		bitstream.readBits(1); // overscan_appropriate_flag
	}
	if (bitstream.readBits(1)) { // video_signal_type_present_flag
		bitstream.readBits(3); // video_format
		bitstream.readBits(1); // video_full_range_flag
		if (bitstream.readBits(1)) {
			bitstream.readBits(8); // colour_primaries
			bitstream.readBits(8); // transfer_characteristics
			bitstream.readBits(8); // matrix_coeffs
		}
	}
	if (bitstream.readBits(1)) { // chroma_loc_info_present_flag
		readExpGolomb(bitstream); // chroma_sample_loc_type_top_field
		readExpGolomb(bitstream); // chroma_sample_loc_type_bottom_field
	}
	bitstream.readBits(1); // neutral_chroma_indication_flag
	bitstream.readBits(1); // field_seq_flag
	bitstream.readBits(1); // frame_field_info_present_flag
	if (bitstream.readBits(1)) { // default_display_window_flag
		readExpGolomb(bitstream); // def_disp_win_left_offset
		readExpGolomb(bitstream); // def_disp_win_right_offset
		readExpGolomb(bitstream); // def_disp_win_top_offset
		readExpGolomb(bitstream); // def_disp_win_bottom_offset
	}
	if (bitstream.readBits(1)) { // vui_timing_info_present_flag
		bitstream.readBits(32); // vui_num_units_in_tick
		bitstream.readBits(32); // vui_time_scale
		if (bitstream.readBits(1)) { // vui_poc_proportional_to_timing_flag
			readExpGolomb(bitstream); // vui_num_ticks_poc_diff_one_minus1
		}
		if (bitstream.readBits(1)) {
			skipHrdParameters(bitstream, true, sps_max_sub_layers_minus1);
		}
	}
	if (bitstream.readBits(1)) { // bitstream_restriction_flag
		bitstream.readBits(1); // tiles_fixed_structure_flag
		bitstream.readBits(1); // motion_vectors_over_pic_boundaries_flag
		bitstream.readBits(1); // restricted_ref_pic_lists_flag
		const min_spatial_segmentation_idc = readExpGolomb(bitstream);
		// skip the rest
		readExpGolomb(bitstream); // max_bytes_per_pic_denom
		readExpGolomb(bitstream); // max_bits_per_min_cu_denom
		readExpGolomb(bitstream); // log2_max_mv_length_horizontal
		readExpGolomb(bitstream); // log2_max_mv_length_vertical
		return min_spatial_segmentation_idc;
	}
	return 0;
};

const skipHrdParameters = (
	bitstream: Bitstream,
	commonInfPresentFlag: boolean,
	maxNumSubLayersMinus1: number,
) => {
	let nal_hrd_parameters_present_flag = false;
	let vcl_hrd_parameters_present_flag = false;
	let sub_pic_hrd_params_present_flag = false;

	if (commonInfPresentFlag) {
		nal_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
		vcl_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
		if (nal_hrd_parameters_present_flag || vcl_hrd_parameters_present_flag) {
			sub_pic_hrd_params_present_flag = bitstream.readBits(1) === 1;
			if (sub_pic_hrd_params_present_flag) {
				bitstream.readBits(8); // tick_divisor_minus2
				bitstream.readBits(5); // du_cpb_removal_delay_increment_length_minus1
				bitstream.readBits(1); // sub_pic_cpb_params_in_pic_timing_sei_flag
				bitstream.readBits(5); // dpb_output_delay_du_length_minus1
			}
			bitstream.readBits(4); // bit_rate_scale
			bitstream.readBits(4); // cpb_size_scale
			if (sub_pic_hrd_params_present_flag) {
				bitstream.readBits(4); // cpb_size_du_scale
			}
			bitstream.readBits(5); // initial_cpb_removal_delay_length_minus1
			bitstream.readBits(5); // au_cpb_removal_delay_length_minus1
			bitstream.readBits(5); // dpb_output_delay_length_minus1
		}
	}

	for (let i = 0; i <= maxNumSubLayersMinus1; i++) {
		const fixed_pic_rate_general_flag = bitstream.readBits(1) === 1;
		let fixed_pic_rate_within_cvs_flag = true; // Default assumption if general is true
		if (!fixed_pic_rate_general_flag) {
			fixed_pic_rate_within_cvs_flag = bitstream.readBits(1) === 1;
		}

		let low_delay_hrd_flag = false; // Default assumption
		if (fixed_pic_rate_within_cvs_flag) {
			readExpGolomb(bitstream); // elemental_duration_in_tc_minus1[i]
		} else {
			low_delay_hrd_flag = bitstream.readBits(1) === 1;
		}

		let CpbCnt = 1; // Default if low_delay is true
		if (!low_delay_hrd_flag) {
			const cpb_cnt_minus1 = readExpGolomb(bitstream); // cpb_cnt_minus1[i]
			CpbCnt = cpb_cnt_minus1 + 1;
		}

		if (nal_hrd_parameters_present_flag) {
			skipSubLayerHrdParameters(bitstream, CpbCnt, sub_pic_hrd_params_present_flag);
		}
		if (vcl_hrd_parameters_present_flag) {
			skipSubLayerHrdParameters(bitstream, CpbCnt, sub_pic_hrd_params_present_flag);
		}
	}
};

const skipSubLayerHrdParameters = (
	bitstream: Bitstream,
	CpbCnt: number,
	sub_pic_hrd_params_present_flag: boolean,
) => {
	for (let i = 0; i < CpbCnt; i++) {
		readExpGolomb(bitstream); // bit_rate_value_minus1[i]
		readExpGolomb(bitstream); // cpb_size_value_minus1[i]
		if (sub_pic_hrd_params_present_flag) {
			readExpGolomb(bitstream); // cpb_size_du_value_minus1[i]
			readExpGolomb(bitstream); // bit_rate_du_value_minus1[i]
		}
		bitstream.readBits(1); // cbr_flag[i]
	}
};

export const serializeHevcDecoderConfigurationRecord = (record: HevcDecoderConfigurationRecord) => {
	const bytes: number[] = [];

	bytes.push(record.configurationVersion);

	bytes.push(
		((record.generalProfileSpace & 0x3) << 6)
		| ((record.generalTierFlag & 0x1) << 5)
		| (record.generalProfileIdc & 0x1F),
	);

	bytes.push((record.generalProfileCompatibilityFlags >>> 24) & 0xFF);
	bytes.push((record.generalProfileCompatibilityFlags >>> 16) & 0xFF);
	bytes.push((record.generalProfileCompatibilityFlags >>> 8) & 0xFF);
	bytes.push(record.generalProfileCompatibilityFlags & 0xFF);

	bytes.push(...record.generalConstraintIndicatorFlags);

	bytes.push(record.generalLevelIdc & 0xFF);

	bytes.push(0xF0 | ((record.minSpatialSegmentationIdc >> 8) & 0x0F)); // Reserved + high nibble
	bytes.push(record.minSpatialSegmentationIdc & 0xFF); // Low byte

	bytes.push(0xFC | (record.parallelismType & 0x03));

	bytes.push(0xFC | (record.chromaFormatIdc & 0x03));

	bytes.push(0xF8 | (record.bitDepthLumaMinus8 & 0x07));

	bytes.push(0xF8 | (record.bitDepthChromaMinus8 & 0x07));

	bytes.push((record.avgFrameRate >> 8) & 0xFF); // High byte
	bytes.push(record.avgFrameRate & 0xFF); // Low byte

	bytes.push(
		((record.constantFrameRate & 0x03) << 6)
		| ((record.numTemporalLayers & 0x07) << 3)
		| ((record.temporalIdNested & 0x01) << 2)
		| (record.lengthSizeMinusOne & 0x03),
	);

	bytes.push(record.arrays.length & 0xFF);

	for (const arr of record.arrays) {
		bytes.push(
			((arr.arrayCompleteness & 0x01) << 7)
			| (0 << 6)
			| (arr.nalUnitType & 0x3F),
		);

		bytes.push((arr.nalUnits.length >> 8) & 0xFF); // High byte
		bytes.push(arr.nalUnits.length & 0xFF); // Low byte

		for (const nal of arr.nalUnits) {
			bytes.push((nal.length >> 8) & 0xFF); // High byte
			bytes.push(nal.length & 0xFF); // Low byte

			for (let i = 0; i < nal.length; i++) {
				bytes.push(nal[i]!);
			}
		}
	}

	return new Uint8Array(bytes);
};
