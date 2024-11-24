"use strict";
var Metamuxer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    ArrayBufferTarget: () => ArrayBufferTarget,
    AudioBufferSource: () => AudioBufferSource,
    AudioDataSource: () => AudioDataSource,
    CanvasSource: () => CanvasSource,
    EncodedAudioChunkSource: () => EncodedAudioChunkSource,
    EncodedVideoChunkSource: () => EncodedVideoChunkSource,
    FileSystemWritableFileStreamTarget: () => FileSystemWritableFileStreamTarget,
    MediaStreamAudioTrackSource: () => MediaStreamAudioTrackSource,
    MediaStreamVideoTrackSource: () => MediaStreamVideoTrackSource,
    MkvOutputFormat: () => MkvOutputFormat2,
    Mp4OutputFormat: () => Mp4OutputFormat,
    Output: () => Output,
    StreamTarget: () => StreamTarget,
    Target: () => Target,
    TextSubtitleSource: () => TextSubtitleSource,
    VideoFrameSource: () => VideoFrameSource,
    WebMOutputFormat: () => WebMOutputFormat
  });

  // src/misc.ts
  function assert(x) {
    if (!x) {
      throw new Error("Assertion failed.");
    }
  }
  var last = (arr) => {
    return arr && arr[arr.length - 1];
  };
  var isU32 = (value) => {
    return value >= 0 && value < 2 ** 32;
  };
  var readBits = (bytes2, start, end) => {
    let result = 0;
    for (let i = start; i < end; i++) {
      let byteIndex = Math.floor(i / 8);
      let byte = bytes2[byteIndex];
      let bitIndex = 7 - (i & 7);
      let bit = (byte & 1 << bitIndex) >> bitIndex;
      result <<= 1;
      result |= bit;
    }
    return result;
  };
  var writeBits = (bytes2, start, end, value) => {
    for (let i = start; i < end; i++) {
      let byteIndex = Math.floor(i / 8);
      let byte = bytes2[byteIndex];
      let bitIndex = 7 - (i & 7);
      byte &= ~(1 << bitIndex);
      byte |= (value & 1 << end - i - 1) >> end - i - 1 << bitIndex;
      bytes2[byteIndex] = byte;
    }
  };
  var toUint8Array = (source) => {
    if (source instanceof ArrayBuffer) {
      return new Uint8Array(source);
    } else {
      return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    }
  };
  var textEncoder = new TextEncoder();
  var COLOR_PRIMARIES_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // ITU-R BT.601 525 - SMPTE 170M
  };
  var TRANSFER_CHARACTERISTICS_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "smpte170m": 6,
    // SMPTE 170M
    "iec61966-2-1": 13
    // IEC 61966-2-1
  };
  var MATRIX_COEFFICIENTS_MAP = {
    "rgb": 0,
    // Identity
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // SMPTE 170M
  };
  var colorSpaceIsComplete = (colorSpace) => {
    return !!colorSpace && !!colorSpace.primaries && !!colorSpace.transfer && !!colorSpace.matrix && colorSpace.fullRange !== void 0;
  };
  var isAllowSharedBufferSource = (x) => {
    return x instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && x instanceof SharedArrayBuffer || ArrayBuffer.isView(x) && !(x instanceof DataView);
  };

  // src/subtitles.ts
  var cueBlockHeaderRegex = /(?:(.+?)\n)?((?:\d{2}:)?\d{2}:\d{2}.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}.\d{3})/g;
  var preambleStartRegex = /^WEBVTT(.|\n)*?\n{2}/;
  var inlineTimestampRegex = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g;
  var SubtitleParser = class {
    #options;
    #preambleText = null;
    #preambleEmitted = false;
    constructor(options) {
      this.#options = options;
    }
    parse(text) {
      text = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
      cueBlockHeaderRegex.lastIndex = 0;
      let match;
      if (!this.#preambleText) {
        if (!preambleStartRegex.test(text)) {
          let error = new Error("WebVTT preamble incorrect.");
          this.#options.error(error);
          throw error;
        }
        match = cueBlockHeaderRegex.exec(text);
        let preamble = text.slice(0, match?.index ?? text.length).trimEnd();
        if (!preamble) {
          let error = new Error("No WebVTT preamble provided.");
          this.#options.error(error);
          throw error;
        }
        this.#preambleText = preamble;
        if (match) {
          text = text.slice(match.index);
          cueBlockHeaderRegex.lastIndex = 0;
        }
      }
      while (match = cueBlockHeaderRegex.exec(text)) {
        let notes = text.slice(0, match.index);
        let cueIdentifier = match[1];
        let matchEnd = match.index + match[0].length;
        let bodyStart = text.indexOf("\n", matchEnd) + 1;
        let cueSettings = text.slice(matchEnd, bodyStart).trim();
        let bodyEnd = text.indexOf("\n\n", matchEnd);
        if (bodyEnd === -1) bodyEnd = text.length;
        let startTime = parseSubtitleTimestamp(match[2]);
        let endTime = parseSubtitleTimestamp(match[3]);
        let duration = endTime - startTime;
        let body = text.slice(bodyStart, bodyEnd).trim();
        text = text.slice(bodyEnd).trimStart();
        cueBlockHeaderRegex.lastIndex = 0;
        let cue = {
          timestamp: startTime / 1e3,
          duration: duration / 1e3,
          text: body,
          identifier: cueIdentifier,
          settings: cueSettings,
          notes
        };
        let meta = {};
        if (!this.#preambleEmitted) {
          meta.config = {
            description: this.#preambleText
          };
          this.#preambleEmitted = true;
        }
        this.#options.output(cue, meta);
      }
    }
  };
  var timestampRegex = /(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})/;
  var parseSubtitleTimestamp = (string) => {
    let match = timestampRegex.exec(string);
    if (!match) throw new Error("Expected match.");
    return 60 * 60 * 1e3 * Number(match[1] || "0") + 60 * 1e3 * Number(match[2]) + 1e3 * Number(match[3]) + Number(match[4]);
  };
  var formatSubtitleTimestamp = (timestamp) => {
    let hours = Math.floor(timestamp / (60 * 60 * 1e3));
    let minutes = Math.floor(timestamp % (60 * 60 * 1e3) / (60 * 1e3));
    let seconds = Math.floor(timestamp % (60 * 1e3) / 1e3);
    let milliseconds = timestamp % 1e3;
    return hours.toString().padStart(2, "0") + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0") + "." + milliseconds.toString().padStart(3, "0");
  };

  // src/isobmff/isobmff_boxes.ts
  var IsobmffBoxWriter = class {
    constructor(writer) {
      this.writer = writer;
      this.helper = new Uint8Array(8);
      this.helperView = new DataView(this.helper.buffer);
      /**
       * Stores the position from the start of the file to where boxes elements have been written. This is used to
       * rewrite/edit elements that were already added before, and to measure sizes of things.
       */
      this.offsets = /* @__PURE__ */ new WeakMap();
    }
    writeU32(value) {
      this.helperView.setUint32(0, value, false);
      this.writer.write(this.helper.subarray(0, 4));
    }
    writeU64(value) {
      this.helperView.setUint32(0, Math.floor(value / 2 ** 32), false);
      this.helperView.setUint32(4, value, false);
      this.writer.write(this.helper.subarray(0, 8));
    }
    writeAscii(text) {
      for (let i = 0; i < text.length; i++) {
        this.helperView.setUint8(i % 8, text.charCodeAt(i));
        if (i % 8 === 7) this.writer.write(this.helper);
      }
      if (text.length % 8 !== 0) {
        this.writer.write(this.helper.subarray(0, text.length % 8));
      }
    }
    writeBox(box2) {
      this.offsets.set(box2, this.writer.getPos());
      if (box2.contents && !box2.children) {
        this.writeBoxHeader(box2, box2.size ?? box2.contents.byteLength + 8);
        this.writer.write(box2.contents);
      } else {
        let startPos = this.writer.getPos();
        this.writeBoxHeader(box2, 0);
        if (box2.contents) this.writer.write(box2.contents);
        if (box2.children) {
          for (let child of box2.children) if (child) this.writeBox(child);
        }
        let endPos = this.writer.getPos();
        let size = box2.size ?? endPos - startPos;
        this.writer.seek(startPos);
        this.writeBoxHeader(box2, size);
        this.writer.seek(endPos);
      }
    }
    writeBoxHeader(box2, size) {
      this.writeU32(box2.largeSize ? 1 : size);
      this.writeAscii(box2.type);
      if (box2.largeSize) this.writeU64(size);
    }
    measureBoxHeader(box2) {
      return 8 + (box2.largeSize ? 8 : 0);
    }
    patchBox(box2) {
      const boxOffset = this.offsets.get(box2);
      assert(boxOffset !== void 0);
      let endPos = this.writer.getPos();
      this.writer.seek(boxOffset);
      this.writeBox(box2);
      this.writer.seek(endPos);
    }
    measureBox(box2) {
      if (box2.contents && !box2.children) {
        let headerSize = this.measureBoxHeader(box2);
        return headerSize + box2.contents.byteLength;
      } else {
        let result = this.measureBoxHeader(box2);
        if (box2.contents) result += box2.contents.byteLength;
        if (box2.children) {
          for (let child of box2.children) if (child) result += this.measureBox(child);
        }
        return result;
      }
    }
  };
  var bytes = new Uint8Array(8);
  var view = new DataView(bytes.buffer);
  var u8 = (value) => {
    return [(value % 256 + 256) % 256];
  };
  var u16 = (value) => {
    view.setUint16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var i16 = (value) => {
    view.setInt16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var u24 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[1], bytes[2], bytes[3]];
  };
  var u32 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var i32 = (value) => {
    view.setInt32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var u64 = (value) => {
    view.setUint32(0, Math.floor(value / 2 ** 32), false);
    view.setUint32(4, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
  };
  var fixed_8_8 = (value) => {
    view.setInt16(0, 2 ** 8 * value, false);
    return [bytes[0], bytes[1]];
  };
  var fixed_16_16 = (value) => {
    view.setInt32(0, 2 ** 16 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var fixed_2_30 = (value) => {
    view.setInt32(0, 2 ** 30 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var variableUnsignedInt = (value, byteLength) => {
    let bytes2 = [];
    let remaining = value;
    do {
      let byte = remaining & 127;
      remaining >>= 7;
      if (bytes2.length > 0) {
        byte |= 128;
      }
      bytes2.push(byte);
      if (byteLength !== void 0) {
        byteLength--;
      }
    } while (remaining > 0 || byteLength);
    return bytes2.reverse();
  };
  var ascii = (text, nullTerminated = false) => {
    let bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
    if (nullTerminated) bytes2.push(0);
    return bytes2;
  };
  var lastPresentedSample = (samples) => {
    let result = null;
    for (let sample of samples) {
      if (!result || sample.timestamp > result.timestamp) {
        result = sample;
      }
    }
    return result;
  };
  var rotationMatrix = (rotationInDegrees) => {
    let theta = rotationInDegrees * (Math.PI / 180);
    let cosTheta = Math.cos(theta);
    let sinTheta = Math.sin(theta);
    return [
      cosTheta,
      sinTheta,
      0,
      -sinTheta,
      cosTheta,
      0,
      0,
      0,
      1
    ];
  };
  var IDENTITY_MATRIX = rotationMatrix(0);
  var matrixToBytes = (matrix) => {
    return [
      fixed_16_16(matrix[0]),
      fixed_16_16(matrix[1]),
      fixed_2_30(matrix[2]),
      fixed_16_16(matrix[3]),
      fixed_16_16(matrix[4]),
      fixed_2_30(matrix[5]),
      fixed_16_16(matrix[6]),
      fixed_16_16(matrix[7]),
      fixed_2_30(matrix[8])
    ];
  };
  var box = (type, contents, children) => ({
    type,
    contents: contents && new Uint8Array(contents.flat(10)),
    children
  });
  var fullBox = (type, version, flags, contents, children) => box(
    type,
    [u8(version), u24(flags), contents ?? []],
    children
  );
  var ftyp = (details) => {
    let minorVersion = 512;
    if (details.fragmented) return box("ftyp", [
      ascii("iso5"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("iso5"),
      ascii("iso6"),
      ascii("mp41")
    ]);
    return box("ftyp", [
      ascii("isom"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("isom"),
      details.holdsAvc ? ascii("avc1") : [],
      ascii("mp41")
    ]);
  };
  var mdat = (reserveLargeSize) => ({ type: "mdat", largeSize: reserveLargeSize });
  var free = (size) => ({ type: "free", size });
  var moov = (trackDatas, creationTime, fragmented = false) => box("moov", void 0, [
    mvhd(creationTime, trackDatas),
    ...trackDatas.map((x) => trak(x, creationTime)),
    fragmented ? mvex(trackDatas) : null
  ]);
  var mvhd = (creationTime, trackDatas) => {
    let duration = intoTimescale(Math.max(
      0,
      ...trackDatas.filter((x) => x.samples.length > 0).map((x) => {
        const lastSample = lastPresentedSample(x.samples);
        return lastSample.timestamp + lastSample.duration;
      })
    ), GLOBAL_TIMESCALE);
    let nextTrackId = Math.max(0, ...trackDatas.map((x) => x.track.id)) + 1;
    let needsU64 = !isU32(creationTime) || !isU32(duration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mvhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(GLOBAL_TIMESCALE),
      // Timescale
      u32OrU64(duration),
      // Duration
      fixed_16_16(1),
      // Preferred rate
      fixed_8_8(1),
      // Preferred volume
      Array(10).fill(0),
      // Reserved
      matrixToBytes(IDENTITY_MATRIX),
      // Matrix
      Array(24).fill(0),
      // Pre-defined
      u32(nextTrackId)
      // Next track ID
    ]);
  };
  var trak = (trackData, creationTime) => box("trak", void 0, [
    tkhd(trackData, creationTime),
    mdia(trackData, creationTime)
  ]);
  var tkhd = (trackData, creationTime) => {
    let lastSample = lastPresentedSample(trackData.samples);
    let durationInGlobalTimescale = intoTimescale(
      lastSample ? lastSample.timestamp + lastSample.duration : 0,
      GLOBAL_TIMESCALE
    );
    let needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
    let u32OrU64 = needsU64 ? u64 : u32;
    let matrix;
    if (trackData.type === "video") {
      const rotation = trackData.track.metadata.rotation;
      matrix = rotation === void 0 || typeof rotation === "number" ? rotationMatrix(rotation ?? 0) : rotation;
    } else {
      matrix = IDENTITY_MATRIX;
    }
    return fullBox("tkhd", +needsU64, 3, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(trackData.track.id),
      // Track ID
      u32(0),
      // Reserved
      u32OrU64(durationInGlobalTimescale),
      // Duration
      Array(8).fill(0),
      // Reserved
      u16(0),
      // Layer
      u16(trackData.track.id),
      // Alternate group
      fixed_8_8(trackData.type === "audio" ? 1 : 0),
      // Volume
      u16(0),
      // Reserved
      matrixToBytes(matrix),
      // Matrix
      fixed_16_16(trackData.type === "video" ? trackData.info.width : 0),
      // Track width
      fixed_16_16(trackData.type === "video" ? trackData.info.height : 0)
      // Track height
    ]);
  };
  var mdia = (trackData, creationTime) => box("mdia", void 0, [
    mdhd(trackData, creationTime),
    hdlr(trackData),
    minf(trackData)
  ]);
  var mdhd = (trackData, creationTime) => {
    let lastSample = lastPresentedSample(trackData.samples);
    let localDuration = intoTimescale(
      lastSample ? lastSample.timestamp + lastSample.duration : 0,
      trackData.timescale
    );
    let needsU64 = !isU32(creationTime) || !isU32(localDuration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mdhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(trackData.timescale),
      // Timescale
      u32OrU64(localDuration),
      // Duration
      u16(21956),
      // Language ("und", undetermined)
      u16(0)
      // Quality
    ]);
  };
  var TRACK_TYPE_TO_COMPONENT_SUBTYPE = {
    video: "vide",
    audio: "soun",
    subtitle: "text"
  };
  var TRACK_TYPE_TO_HANDLER_NAME = {
    video: "VideoHandler",
    audio: "SoundHandler",
    subtitle: "TextHandler"
  };
  var hdlr = (trackData) => fullBox("hdlr", 0, 0, [
    ascii("mhlr"),
    // Component type
    ascii(TRACK_TYPE_TO_COMPONENT_SUBTYPE[trackData.type]),
    // Component subtype
    u32(0),
    // Component manufacturer
    u32(0),
    // Component flags
    u32(0),
    // Component flags mask
    ascii(TRACK_TYPE_TO_HANDLER_NAME[trackData.type], true)
    // Component name
  ]);
  var minf = (trackData) => box("minf", void 0, [
    TRACK_TYPE_TO_HEADER_BOX[trackData.type](),
    dinf(),
    stbl(trackData)
  ]);
  var vmhd = () => fullBox("vmhd", 0, 1, [
    u16(0),
    // Graphics mode
    u16(0),
    // Opcolor R
    u16(0),
    // Opcolor G
    u16(0)
    // Opcolor B
  ]);
  var smhd = () => fullBox("smhd", 0, 0, [
    u16(0),
    // Balance
    u16(0)
    // Reserved
  ]);
  var nmhd = () => fullBox("nmhd", 0, 0);
  var TRACK_TYPE_TO_HEADER_BOX = {
    video: vmhd,
    audio: smhd,
    subtitle: nmhd
  };
  var dinf = () => box("dinf", void 0, [
    dref()
  ]);
  var dref = () => fullBox("dref", 0, 0, [
    u32(1)
    // Entry count
  ], [
    url()
  ]);
  var url = () => fullBox("url ", 0, 1);
  var stbl = (trackData) => {
    const needsCtts = trackData.compositionTimeOffsetTable.length > 1 || trackData.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);
    return box("stbl", void 0, [
      stsd(trackData),
      stts(trackData),
      stss(trackData),
      stsc(trackData),
      stsz(trackData),
      stco(trackData),
      needsCtts ? ctts(trackData) : null
    ]);
  };
  var stsd = (trackData) => {
    let sampleDescription;
    if (trackData.type === "video") {
      sampleDescription = videoSampleDescription(
        VIDEO_CODEC_TO_BOX_NAME[trackData.track.source.codec],
        trackData
      );
    } else if (trackData.type === "audio") {
      sampleDescription = soundSampleDescription(
        AUDIO_CODEC_TO_BOX_NAME[trackData.track.source.codec],
        trackData
      );
    } else if (trackData.type === "subtitle") {
      sampleDescription = subtitleSampleDescription(
        SUBTITLE_CODEC_TO_BOX_NAME[trackData.track.source.codec],
        trackData
      );
    }
    assert(sampleDescription);
    return fullBox("stsd", 0, 0, [
      u32(1)
      // Entry count
    ], [
      sampleDescription
    ]);
  };
  var videoSampleDescription = (compressionType, trackData) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Pre-defined
    u16(0),
    // Reserved
    Array(12).fill(0),
    // Pre-defined
    u16(trackData.info.width),
    // Width
    u16(trackData.info.height),
    // Height
    u32(4718592),
    // Horizontal resolution
    u32(4718592),
    // Vertical resolution
    u32(0),
    // Reserved
    u16(1),
    // Frame count
    Array(32).fill(0),
    // Compressor name
    u16(24),
    // Depth
    i16(65535)
    // Pre-defined
  ], [
    VIDEO_CODEC_TO_CONFIGURATION_BOX[trackData.track.source.codec](trackData),
    colorSpaceIsComplete(trackData.info.decoderConfig.colorSpace) ? colr(trackData) : null
  ]);
  var colr = (trackData) => box("colr", [
    ascii("nclx"),
    // Colour type
    u16(COLOR_PRIMARIES_MAP[trackData.info.decoderConfig.colorSpace.primaries]),
    // Colour primaries
    u16(TRANSFER_CHARACTERISTICS_MAP[trackData.info.decoderConfig.colorSpace.transfer]),
    // Transfer characteristics
    u16(MATRIX_COEFFICIENTS_MAP[trackData.info.decoderConfig.colorSpace.matrix]),
    // Matrix coefficients
    u8((trackData.info.decoderConfig.colorSpace.fullRange ? 1 : 0) << 7)
    // Full range flag
  ]);
  var avcC = (trackData) => trackData.info.decoderConfig && box("avcC", [
    // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
    ...toUint8Array(trackData.info.decoderConfig.description)
  ]);
  var hvcC = (trackData) => trackData.info.decoderConfig && box("hvcC", [
    // For HEVC, description is an HEVCDecoderConfigurationRecord, so nothing else to do here
    ...toUint8Array(trackData.info.decoderConfig.description)
  ]);
  var vpcC = (trackData) => {
    if (!trackData.info.decoderConfig) {
      return null;
    }
    let decoderConfig = trackData.info.decoderConfig;
    assert(decoderConfig.colorSpace);
    let parts = decoderConfig.codec.split(".");
    let profile = Number(parts[1]);
    let level = Number(parts[2]);
    let bitDepth = Number(parts[3]);
    let chromaSubsampling = 0;
    let thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + Number(decoderConfig.colorSpace.fullRange);
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    return fullBox("vpcC", 1, 0, [
      u8(profile),
      // Profile
      u8(level),
      // Level
      u8(thirdByte),
      // Bit depth, chroma subsampling, full range
      u8(colourPrimaries),
      // Colour primaries
      u8(transferCharacteristics),
      // Transfer characteristics
      u8(matrixCoefficients),
      // Matrix coefficients
      u16(0)
      // Codec initialization data size
    ]);
  };
  var av1C = () => {
    let marker = 1;
    let version = 1;
    let firstByte = (marker << 7) + version;
    return box("av1C", [
      firstByte,
      0,
      0,
      0
    ]);
  };
  var soundSampleDescription = (compressionType, trackData) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Version
    u16(0),
    // Revision level
    u32(0),
    // Vendor
    u16(trackData.info.numberOfChannels),
    // Number of channels
    u16(16),
    // Sample size (bits)
    u16(0),
    // Compression ID
    u16(0),
    // Packet size
    fixed_16_16(trackData.info.sampleRate)
    // Sample rate
  ], [
    AUDIO_CODEC_TO_CONFIGURATION_BOX[trackData.track.source.codec](trackData)
  ]);
  var esds = (trackData) => {
    let description = toUint8Array(trackData.info.decoderConfig.description ?? new ArrayBuffer(0));
    let bytes2 = [
      ...description
    ];
    bytes2 = [
      ...u8(64),
      // MPEG-4 Audio
      ...u8(21),
      // stream type(6bits)=5 audio, flags(2bits)=1
      ...u24(0),
      // 24bit buffer size
      ...u32(0),
      // max bitrate
      ...u32(0),
      // avg bitrate
      ...u8(5),
      // TAG(5) = ASC ([2],[3]) embedded in above OD
      ...variableUnsignedInt(bytes2.length),
      ...bytes2
    ];
    bytes2 = [
      ...u16(1),
      // ES_ID = 1
      ...u8(0),
      // flags etc = 0
      ...u8(4),
      // TAG(4) = ES Descriptor ([2]) embedded in above OD
      ...variableUnsignedInt(bytes2.length),
      ...bytes2,
      ...u8(6),
      // TAG(6)
      ...u8(1),
      // length
      ...u8(2)
      // data
    ];
    bytes2 = [
      ...u8(3),
      // TAG(3) = Object Descriptor ([2])
      ...variableUnsignedInt(bytes2.length),
      ...bytes2
    ];
    return fullBox("esds", 0, 0, bytes2);
  };
  var dOps = (trackData) => {
    let preskip = 3840;
    let gain = 0;
    const description = trackData.info.decoderConfig?.description;
    if (description) {
      assert(description.byteLength < 18);
      const view2 = ArrayBuffer.isView(description) ? new DataView(description.buffer, description.byteOffset, description.byteLength) : new DataView(description);
      preskip = view2.getUint16(10, true);
      gain = view2.getInt16(14, true);
    }
    return box("dOps", [
      u8(0),
      // Version
      u8(trackData.info.numberOfChannels),
      // OutputChannelCount
      u16(preskip),
      u32(trackData.info.sampleRate),
      // InputSampleRate
      fixed_8_8(gain),
      // OutputGain
      u8(0)
      // ChannelMappingFamily
    ]);
  };
  var subtitleSampleDescription = (compressionType, trackData) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1)
    // Data reference index
  ], [
    SUBTITLE_CODEC_TO_CONFIGURATION_BOX[trackData.track.source.codec](trackData)
  ]);
  var vttC = (trackData) => box("vttC", [
    ...textEncoder.encode(trackData.info.config.description)
  ]);
  var stts = (trackData) => {
    return fullBox("stts", 0, 0, [
      u32(trackData.timeToSampleTable.length),
      // Number of entries
      trackData.timeToSampleTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleDelta)
        // Sample duration
      ])
    ]);
  };
  var stss = (trackData) => {
    if (trackData.samples.every((x) => x.type === "key")) return null;
    let keySamples = [...trackData.samples.entries()].filter(([, sample]) => sample.type === "key");
    return fullBox("stss", 0, 0, [
      u32(keySamples.length),
      // Number of entries
      keySamples.map(([index]) => u32(index + 1))
      // Sync sample table
    ]);
  };
  var stsc = (trackData) => {
    return fullBox("stsc", 0, 0, [
      u32(trackData.compactlyCodedChunkTable.length),
      // Number of entries
      trackData.compactlyCodedChunkTable.map((x) => [
        // Sample-to-chunk table
        u32(x.firstChunk),
        // First chunk
        u32(x.samplesPerChunk),
        // Samples per chunk
        u32(1)
        // Sample description index
      ])
    ]);
  };
  var stsz = (trackData) => fullBox("stsz", 0, 0, [
    u32(0),
    // Sample size (0 means non-constant size)
    u32(trackData.samples.length),
    // Number of entries
    trackData.samples.map((x) => u32(x.size))
    // Sample size table
  ]);
  var stco = (trackData) => {
    if (trackData.finalizedChunks.length > 0 && last(trackData.finalizedChunks).offset >= 2 ** 32) {
      return fullBox("co64", 0, 0, [
        u32(trackData.finalizedChunks.length),
        // Number of entries
        trackData.finalizedChunks.map((x) => u64(x.offset))
        // Chunk offset table
      ]);
    }
    return fullBox("stco", 0, 0, [
      u32(trackData.finalizedChunks.length),
      // Number of entries
      trackData.finalizedChunks.map((x) => u32(x.offset))
      // Chunk offset table
    ]);
  };
  var ctts = (trackData) => {
    return fullBox("ctts", 0, 0, [
      u32(trackData.compositionTimeOffsetTable.length),
      // Number of entries
      trackData.compositionTimeOffsetTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleCompositionTimeOffset)
        // Sample offset
      ])
    ]);
  };
  var mvex = (trackDatas) => {
    return box("mvex", void 0, trackDatas.map(trex));
  };
  var trex = (trackData) => {
    return fullBox("trex", 0, 0, [
      u32(trackData.track.id),
      // Track ID
      u32(1),
      // Default sample description index
      u32(0),
      // Default sample duration
      u32(0),
      // Default sample size
      u32(0)
      // Default sample flags
    ]);
  };
  var moof = (sequenceNumber, trackDatas) => {
    return box("moof", void 0, [
      mfhd(sequenceNumber),
      ...trackDatas.map(traf)
    ]);
  };
  var mfhd = (sequenceNumber) => {
    return fullBox("mfhd", 0, 0, [
      u32(sequenceNumber)
      // Sequence number
    ]);
  };
  var fragmentSampleFlags = (sample) => {
    let byte1 = 0;
    let byte2 = 0;
    let byte3 = 0;
    let byte4 = 0;
    let sampleIsDifferenceSample = sample.type === "delta";
    byte2 |= +sampleIsDifferenceSample;
    if (sampleIsDifferenceSample) {
      byte1 |= 1;
    } else {
      byte1 |= 2;
    }
    return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
  };
  var traf = (trackData) => {
    return box("traf", void 0, [
      tfhd(trackData),
      tfdt(trackData),
      trun(trackData)
    ]);
  };
  var tfhd = (trackData) => {
    assert(trackData.currentChunk);
    let tfFlags = 0;
    tfFlags |= 8;
    tfFlags |= 16;
    tfFlags |= 32;
    tfFlags |= 131072;
    let referenceSample = trackData.currentChunk.samples[1] ?? trackData.currentChunk.samples[0];
    let referenceSampleInfo = {
      duration: referenceSample.timescaleUnitsToNextSample,
      size: referenceSample.size,
      flags: fragmentSampleFlags(referenceSample)
    };
    return fullBox("tfhd", 0, tfFlags, [
      u32(trackData.track.id),
      // Track ID
      u32(referenceSampleInfo.duration),
      // Default sample duration
      u32(referenceSampleInfo.size),
      // Default sample size
      u32(referenceSampleInfo.flags)
      // Default sample flags
    ]);
  };
  var tfdt = (trackData) => {
    assert(trackData.currentChunk);
    return fullBox("tfdt", 1, 0, [
      u64(intoTimescale(trackData.currentChunk.startTimestamp, trackData.timescale))
      // Base Media Decode Time
    ]);
  };
  var trun = (trackData) => {
    assert(trackData.currentChunk);
    let allSampleDurations = trackData.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
    let allSampleSizes = trackData.currentChunk.samples.map((x) => x.size);
    let allSampleFlags = trackData.currentChunk.samples.map(fragmentSampleFlags);
    let allSampleCompositionTimeOffsets = trackData.currentChunk.samples.map((x) => intoTimescale(x.timestamp - x.decodeTimestamp, trackData.timescale));
    let uniqueSampleDurations = new Set(allSampleDurations);
    let uniqueSampleSizes = new Set(allSampleSizes);
    let uniqueSampleFlags = new Set(allSampleFlags);
    let uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
    let firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
    let sampleDurationPresent = uniqueSampleDurations.size > 1;
    let sampleSizePresent = uniqueSampleSizes.size > 1;
    let sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
    let sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
    let flags = 0;
    flags |= 1;
    flags |= 4 * +firstSampleFlagsPresent;
    flags |= 256 * +sampleDurationPresent;
    flags |= 512 * +sampleSizePresent;
    flags |= 1024 * +sampleFlagsPresent;
    flags |= 2048 * +sampleCompositionTimeOffsetsPresent;
    return fullBox("trun", 1, flags, [
      u32(trackData.currentChunk.samples.length),
      // Sample count
      u32(trackData.currentChunk.offset - trackData.currentChunk.moofOffset || 0),
      // Data offset
      firstSampleFlagsPresent ? u32(allSampleFlags[0]) : [],
      trackData.currentChunk.samples.map((_, i) => [
        sampleDurationPresent ? u32(allSampleDurations[i]) : [],
        // Sample duration
        sampleSizePresent ? u32(allSampleSizes[i]) : [],
        // Sample size
        sampleFlagsPresent ? u32(allSampleFlags[i]) : [],
        // Sample flags
        // Sample composition time offsets
        sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]) : []
      ])
    ]);
  };
  var mfra = (trackDatas) => {
    return box("mfra", void 0, [
      ...trackDatas.map(tfra),
      mfro()
    ]);
  };
  var tfra = (trackData, trackIndex) => {
    let version = 1;
    return fullBox("tfra", version, 0, [
      u32(trackData.track.id),
      // Track ID
      u32(63),
      // This specifies that traf number, trun number and sample number are 32-bit ints
      u32(trackData.finalizedChunks.length),
      // Number of entries
      trackData.finalizedChunks.map((chunk) => [
        u64(intoTimescale(chunk.startTimestamp, trackData.timescale)),
        // Time
        u64(chunk.moofOffset),
        // moof offset
        u32(trackIndex + 1),
        // traf number
        u32(1),
        // trun number
        u32(1)
        // Sample number
      ])
    ]);
  };
  var mfro = () => {
    return fullBox("mfro", 0, 0, [
      // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
      // is known
      u32(0)
      // Size
    ]);
  };
  var vtte = () => box("vtte");
  var vttc = (payload, timestamp, identifier, settings, sourceId) => box("vttc", void 0, [
    sourceId !== null ? box("vsid", [i32(sourceId)]) : null,
    identifier !== null ? box("iden", [...textEncoder.encode(identifier)]) : null,
    timestamp !== null ? box("ctim", [...textEncoder.encode(formatSubtitleTimestamp(timestamp))]) : null,
    settings !== null ? box("sttg", [...textEncoder.encode(settings)]) : null,
    box("payl", [...textEncoder.encode(payload)])
  ]);
  var vtta = (notes) => box("vtta", [...textEncoder.encode(notes)]);
  var VIDEO_CODEC_TO_BOX_NAME = {
    "avc": "avc1",
    "hevc": "hvc1",
    "vp8": "vp08",
    "vp9": "vp09",
    "av1": "av01"
  };
  var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
    "avc": avcC,
    "hevc": hvcC,
    "vp8": vpcC,
    "vp9": vpcC,
    "av1": av1C
  };
  var AUDIO_CODEC_TO_BOX_NAME = {
    "aac": "mp4a",
    "opus": "Opus"
  };
  var AUDIO_CODEC_TO_CONFIGURATION_BOX = {
    "aac": esds,
    "opus": dOps
  };
  var SUBTITLE_CODEC_TO_BOX_NAME = {
    "webvtt": "wvtt"
  };
  var SUBTITLE_CODEC_TO_CONFIGURATION_BOX = {
    "webvtt": vttC
  };

  // src/muxer.ts
  var Muxer = class {
    constructor(output) {
      this.trackTimestampInfo = /* @__PURE__ */ new WeakMap();
      this.output = output;
    }
    beforeTrackAdd(track) {
    }
    onTrackClose(track) {
    }
    validateAndNormalizeTimestamp(track, rawTimestampInUs, isKeyFrame) {
      let timestampInSeconds = rawTimestampInUs / 1e6;
      let timestampInfo = this.trackTimestampInfo.get(track);
      if (!timestampInfo) {
        if (!isKeyFrame) {
          throw new Error("First frame must be a key frame.");
        }
        if (this.timestampsMustStartAtZero && timestampInSeconds > 0) {
          throw new Error(`Timestamps must start at zero (got ${timestampInSeconds}s).`);
        }
        timestampInfo = {
          timestampOffset: timestampInSeconds,
          maxTimestamp: track.source.offsetTimestamps ? 0 : timestampInSeconds,
          lastKeyFrameTimestamp: track.source.offsetTimestamps ? 0 : timestampInSeconds
        };
        this.trackTimestampInfo.set(track, timestampInfo);
      }
      if (track.source.offsetTimestamps) {
        timestampInSeconds -= timestampInfo.timestampOffset;
      }
      if (timestampInSeconds < 0) {
        throw new Error(`Timestamps must be non-negative (got ${timestampInSeconds}s).`);
      }
      if (timestampInSeconds < timestampInfo.lastKeyFrameTimestamp) {
        throw new Error(`Timestamp cannot be smaller than last key frame's timestamp (got ${timestampInSeconds}s, last key frame at ${timestampInfo.lastKeyFrameTimestamp}s).`);
      }
      if (isKeyFrame) {
        if (timestampInSeconds < timestampInfo.maxTimestamp) {
          throw new Error(`Key frame timestamps cannot be smaller than any timestamp that came before (got ${timestampInSeconds}s, max timestamp was ${timestampInfo.maxTimestamp}s).`);
        }
        timestampInfo.lastKeyFrameTimestamp = timestampInSeconds;
      }
      timestampInfo.maxTimestamp = Math.max(timestampInfo.maxTimestamp, timestampInSeconds);
      return timestampInSeconds;
    }
  };

  // src/target.ts
  var Target = class {
    constructor() {
      this.output = null;
    }
  };
  var ArrayBufferTarget = class extends Target {
    constructor() {
      super(...arguments);
      this.buffer = null;
    }
    createWriter() {
      return new ArrayBufferTargetWriter(this);
    }
  };
  var StreamTarget = class extends Target {
    constructor(options) {
      super();
      this.options = options;
      if (typeof options !== "object") {
        throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");
      }
      if (options.onData) {
        if (typeof options.onData !== "function") {
          throw new TypeError("options.onData, when provided, must be a function.");
        }
        if (options.onData.length < 2) {
          throw new TypeError(
            "options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs."
          );
        }
      }
      if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
        throw new TypeError("options.chunked, when provided, must be a boolean.");
      }
      if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
        throw new TypeError("options.chunkSize, when provided, must be a positive integer.");
      }
    }
    createWriter() {
      return this.options.chunked ? new ChunkedStreamTargetWriter(this) : new StreamTargetWriter(this);
    }
  };
  var FileSystemWritableFileStreamTarget = class extends Target {
    constructor(stream, options) {
      super();
      this.stream = stream;
      this.options = options;
      if (!(stream instanceof FileSystemWritableFileStream)) {
        throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");
      }
      if (options !== void 0 && typeof options !== "object") {
        throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");
      }
      if (options) {
        if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
          throw new TypeError("options.chunkSize, when provided, must be a positive integer");
        }
      }
    }
    createWriter() {
      return new FileSystemWritableFileStreamTargetWriter(this);
    }
  };

  // src/writer.ts
  var Writer2 = class {
    constructor() {
      /** Setting this to true will cause the writer to ensure data is written in a strictly monotonic, streamable way. */
      this.ensureMonotonicity = false;
    }
  };
  var ArrayBufferTargetWriter = class extends Writer2 {
    #pos = 0;
    #target;
    #buffer = new ArrayBuffer(2 ** 16);
    #bytes = new Uint8Array(this.#buffer);
    #maxPos = 0;
    constructor(target) {
      super();
      this.#target = target;
    }
    #ensureSize(size) {
      let newLength = this.#buffer.byteLength;
      while (newLength < size) newLength *= 2;
      if (newLength === this.#buffer.byteLength) return;
      let newBuffer = new ArrayBuffer(newLength);
      let newBytes = new Uint8Array(newBuffer);
      newBytes.set(this.#bytes, 0);
      this.#buffer = newBuffer;
      this.#bytes = newBytes;
    }
    write(data) {
      this.#ensureSize(this.#pos + data.byteLength);
      this.#bytes.set(data, this.#pos);
      this.#pos += data.byteLength;
      this.#maxPos = Math.max(this.#maxPos, this.#pos);
    }
    seek(newPos) {
      this.#pos = newPos;
    }
    getPos() {
      return this.#pos;
    }
    flush() {
    }
    finalize() {
      this.#ensureSize(this.#pos);
      this.#target.buffer = this.#buffer.slice(0, Math.max(this.#maxPos, this.#pos));
    }
    getSlice(start, end) {
      return this.#bytes.slice(start, end);
    }
  };
  var StreamTargetWriter = class extends Writer2 {
    #pos = 0;
    #target;
    #sections = [];
    #lastFlushEnd = 0;
    constructor(target) {
      super();
      this.#target = target;
    }
    write(data) {
      this.#sections.push({
        data: data.slice(),
        start: this.#pos
      });
      this.#pos += data.byteLength;
    }
    seek(newPos) {
      this.#pos = newPos;
    }
    getPos() {
      return this.#pos;
    }
    flush() {
      if (this.#sections.length === 0) return;
      let chunks = [];
      let sorted = [...this.#sections].sort((a, b) => a.start - b.start);
      chunks.push({
        start: sorted[0].start,
        size: sorted[0].data.byteLength
      });
      for (let i = 1; i < sorted.length; i++) {
        let lastChunk = chunks[chunks.length - 1];
        let section = sorted[i];
        if (section.start <= lastChunk.start + lastChunk.size) {
          lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
        } else {
          chunks.push({
            start: section.start,
            size: section.data.byteLength
          });
        }
      }
      for (let chunk of chunks) {
        chunk.data = new Uint8Array(chunk.size);
        for (let section of this.#sections) {
          if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
            chunk.data.set(section.data, section.start - chunk.start);
          }
        }
        if (this.ensureMonotonicity && chunk.start !== this.#lastFlushEnd) {
          throw new Error("Internal error: Monotonicity violation.");
        }
        this.#target.options.onData?.(chunk.data, chunk.start);
        this.#lastFlushEnd = chunk.start + chunk.data.byteLength;
      }
      this.#sections.length = 0;
    }
    finalize() {
    }
  };
  var DEFAULT_CHUNK_SIZE = 2 ** 24;
  var MAX_CHUNKS_AT_ONCE = 2;
  var ChunkedStreamTargetWriter = class extends Writer2 {
    #pos = 0;
    #target;
    #chunkSize;
    /**
     * The data is divided up into fixed-size chunks, whose contents are first filled in RAM and then flushed out.
     * A chunk is flushed if all of its contents have been written.
     */
    #chunks = [];
    #lastFlushEnd = 0;
    constructor(target) {
      super();
      this.#target = target;
      this.#chunkSize = target.options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
      if (!Number.isInteger(this.#chunkSize) || this.#chunkSize < 2 ** 10) {
        throw new Error("Invalid StreamTarget options: chunkSize must be an integer not smaller than 1024.");
      }
    }
    write(data) {
      this.#writeDataIntoChunks(data, this.#pos);
      this.#flushChunks();
      this.#pos += data.byteLength;
    }
    seek(newPos) {
      this.#pos = newPos;
    }
    getPos() {
      return this.#pos;
    }
    #writeDataIntoChunks(data, position) {
      let chunkIndex = this.#chunks.findIndex((x) => x.start <= position && position < x.start + this.#chunkSize);
      if (chunkIndex === -1) chunkIndex = this.#createChunk(position);
      let chunk = this.#chunks[chunkIndex];
      let relativePosition = position - chunk.start;
      let toWrite = data.subarray(0, Math.min(this.#chunkSize - relativePosition, data.byteLength));
      chunk.data.set(toWrite, relativePosition);
      let section = {
        start: relativePosition,
        end: relativePosition + toWrite.byteLength
      };
      this.#insertSectionIntoChunk(chunk, section);
      if (chunk.written[0].start === 0 && chunk.written[0].end === this.#chunkSize) {
        chunk.shouldFlush = true;
      }
      if (this.#chunks.length > MAX_CHUNKS_AT_ONCE) {
        for (let i = 0; i < this.#chunks.length - 1; i++) {
          this.#chunks[i].shouldFlush = true;
        }
        this.#flushChunks();
      }
      if (toWrite.byteLength < data.byteLength) {
        this.#writeDataIntoChunks(data.subarray(toWrite.byteLength), position + toWrite.byteLength);
      }
    }
    #insertSectionIntoChunk(chunk, section) {
      let low = 0;
      let high = chunk.written.length - 1;
      let index = -1;
      while (low <= high) {
        let mid = Math.floor(low + (high - low + 1) / 2);
        if (chunk.written[mid].start <= section.start) {
          low = mid + 1;
          index = mid;
        } else {
          high = mid - 1;
        }
      }
      chunk.written.splice(index + 1, 0, section);
      if (index === -1 || chunk.written[index].end < section.start) index++;
      while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
        chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
        chunk.written.splice(index + 1, 1);
      }
    }
    #createChunk(includesPosition) {
      let start = Math.floor(includesPosition / this.#chunkSize) * this.#chunkSize;
      let chunk = {
        start,
        data: new Uint8Array(this.#chunkSize),
        written: [],
        shouldFlush: false
      };
      this.#chunks.push(chunk);
      this.#chunks.sort((a, b) => a.start - b.start);
      return this.#chunks.indexOf(chunk);
    }
    #flushChunks(force = false) {
      for (let i = 0; i < this.#chunks.length; i++) {
        let chunk = this.#chunks[i];
        if (!chunk.shouldFlush && !force) continue;
        for (let section of chunk.written) {
          if (this.ensureMonotonicity && chunk.start + section.start !== this.#lastFlushEnd) {
            throw new Error("Internal error: Monotonicity violation.");
          }
          this.#target.options.onData?.(
            chunk.data.subarray(section.start, section.end),
            chunk.start + section.start
          );
          this.#lastFlushEnd = chunk.start + section.end;
        }
        this.#chunks.splice(i--, 1);
      }
    }
    flush() {
    }
    finalize() {
      this.#flushChunks(true);
    }
  };
  var FileSystemWritableFileStreamTargetWriter = class extends ChunkedStreamTargetWriter {
    constructor(target) {
      super(new StreamTarget({
        onData: (data, position) => target.stream.write({
          type: "write",
          data,
          position
        }),
        chunkSize: target.options?.chunkSize
      }));
    }
  };

  // src/codec.ts
  var buildVideoCodecString = (codec, width, height) => {
    if (codec === "avc") {
      let profileIndication = 100;
      if (width <= 768 && height <= 432) {
        profileIndication = 66;
      } else if (width <= 1920 && height <= 1080) {
        profileIndication = 77;
      }
      const profileCompatibility = 0;
      const levelIndication = width > 1920 || height > 1080 ? 50 : 41;
      const hexProfileIndication = profileIndication.toString(16).padStart(2, "0");
      const hexProfileCompatibility = profileCompatibility.toString(16).padStart(2, "0");
      const hexLevelIndication = levelIndication.toString(16).padStart(2, "0");
      return `avc1.${hexProfileIndication}${hexProfileCompatibility}${hexLevelIndication}`;
    } else if (codec === "hevc") {
      let profileSpace = 0;
      let profileIdc = 1;
      const compatibilityFlags = Array(32).fill(0);
      compatibilityFlags[profileIdc] = 1;
      const compatibilityHex = parseInt(compatibilityFlags.reverse().join(""), 2).toString(16).replace(/^0+/, "");
      let tier = "L";
      let level = 120;
      if (width <= 1280 && height <= 720) {
        level = 93;
      } else if (width <= 1920 && height <= 1080) {
        level = 120;
      } else if (width <= 3840 && height <= 2160) {
        level = 150;
      } else {
        tier = "H";
        level = 180;
      }
      const constraintFlags = "B0";
      const profilePrefix = profileSpace === 0 ? "" : String.fromCharCode(65 + profileSpace - 1);
      return `hev1.${profilePrefix}${profileIdc}.${compatibilityHex}.${tier}${level}.${constraintFlags}`;
    } else if (codec === "vp8") {
      return "vp8";
    } else if (codec === "vp9") {
      const profile = "00";
      let level;
      if (width <= 854 && height <= 480) {
        level = "21";
      } else if (width <= 1280 && height <= 720) {
        level = "31";
      } else if (width <= 1920 && height <= 1080) {
        level = "41";
      } else if (width <= 3840 && height <= 2160) {
        level = "51";
      } else {
        level = "61";
      }
      const bitDepth = "08";
      return `vp09.${profile}.${level}.${bitDepth}`;
    } else if (codec === "av1") {
      const profile = 0;
      let level;
      if (width <= 854 && height <= 480) {
        level = "01";
      } else if (width <= 1280 && height <= 720) {
        level = "03";
      } else if (width <= 1920 && height <= 1080) {
        level = "04";
      } else if (width <= 3840 && height <= 2160) {
        level = "07";
      } else {
        level = "09";
      }
      const tier = "M";
      const bitDepth = "08";
      return `av01.${profile}.${level}${tier}.${bitDepth}`;
    }
    throw new TypeError(`Unhandled codec '${codec}'.`);
  };
  var buildAudioCodecString = (codec, numberOfChannels, sampleRate) => {
    if (codec === "aac") {
      if (numberOfChannels >= 2 && sampleRate <= 24e3) {
        return "mp4a.40.29";
      }
      if (sampleRate <= 24e3) {
        return "mp4a.40.5";
      }
      return "mp4a.40.2";
    } else if (codec === "opus") {
      return "opus";
    } else if (codec === "vorbis") {
      return "vorbis";
    }
    throw new TypeError(`Unhandled codec '${codec}'.`);
  };
  var validateVideoChunkMetadata = (metadata) => {
    if (!metadata) {
      throw new TypeError("Video chunk metadata must be provided.");
    }
    if (typeof metadata !== "object") {
      throw new TypeError("Video chunk metadata must be an object.");
    }
    if (!metadata.decoderConfig) {
      throw new TypeError("Video chunk metadata must include a decoder configuration.");
    }
    if (typeof metadata.decoderConfig !== "object") {
      throw new TypeError("Video chunk metadata decoder configuration must be an object.");
    }
    if (typeof metadata.decoderConfig.codec !== "string") {
      throw new TypeError("Video chunk metadata decoder configuration must specify a codec string.");
    }
    if (!Number.isInteger(metadata.decoderConfig.codedWidth) || metadata.decoderConfig.codedWidth <= 0) {
      throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer).");
    }
    if (!Number.isInteger(metadata.decoderConfig.codedHeight) || metadata.decoderConfig.codedHeight <= 0) {
      throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer).");
    }
    if (metadata.decoderConfig.description !== void 0) {
      if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
        throw new TypeError("Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
      }
    }
    if (metadata.decoderConfig.colorSpace !== void 0) {
      let { colorSpace } = metadata.decoderConfig;
      if (typeof colorSpace !== "object") {
        throw new TypeError("Video chunk metadata decoder configuration colorSpace, when provided, must be an object.");
      }
      let primariesValues = Object.keys(COLOR_PRIMARIES_MAP);
      if (colorSpace.primaries != null && !primariesValues.includes(colorSpace.primaries)) {
        throw new TypeError(`Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of ${primariesValues.join(", ")}.`);
      }
      let transferValues = Object.keys(TRANSFER_CHARACTERISTICS_MAP);
      if (colorSpace.transfer != null && !transferValues.includes(colorSpace.transfer)) {
        throw new TypeError(`Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of ${transferValues.join(", ")}.`);
      }
      let matrixValues = Object.keys(MATRIX_COEFFICIENTS_MAP);
      if (colorSpace.matrix != null && !matrixValues.includes(colorSpace.matrix)) {
        throw new TypeError(`Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of ${matrixValues.join(", ")}.`);
      }
      if (colorSpace.fullRange != null && typeof colorSpace.fullRange !== "boolean") {
        throw new TypeError("Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean.");
      }
    }
    if ((metadata.decoderConfig.codec.startsWith("avc1") || metadata.decoderConfig.codec.startsWith("avc3")) && !metadata.decoderConfig.description) {
      throw new TypeError("Video chunk metadata decoder configuration for AVC must include a description, which is expected to be an AVCDecoderConfigurationRecord as specified in ISO 14496-15.");
    }
    if ((metadata.decoderConfig.codec.startsWith("hev1") || metadata.decoderConfig.codec.startsWith("hvc1")) && !metadata.decoderConfig.description) {
      throw new TypeError("Video chunk metadata decoder configuration for HEVC must include a description, which is expected to be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15.");
    }
    if ((metadata.decoderConfig.codec === "vp8" || metadata.decoderConfig.codec.startsWith("vp09")) && metadata.decoderConfig.colorSpace === void 0) {
      throw new TypeError("Video chunk metadata decoder configuration for VP8/VP9 must include a colorSpace.");
    }
  };
  var validateAudioChunkMetadata = (metadata) => {
    if (!metadata) {
      throw new TypeError("Audio chunk metadata must be provided.");
    }
    if (typeof metadata !== "object") {
      throw new TypeError("Audio chunk metadata must be an object.");
    }
    if (!metadata.decoderConfig) {
      throw new TypeError("Audio chunk metadata must include a decoder configuration.");
    }
    if (typeof metadata.decoderConfig !== "object") {
      throw new TypeError("Audio chunk metadata decoder configuration must be an object.");
    }
    if (typeof metadata.decoderConfig.codec !== "string") {
      throw new TypeError("Audio chunk metadata decoder configuration must specify a codec string.");
    }
    if (!Number.isInteger(metadata.decoderConfig.sampleRate) || metadata.decoderConfig.sampleRate <= 0) {
      throw new TypeError("Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer).");
    }
    if (!Number.isInteger(metadata.decoderConfig.numberOfChannels) || metadata.decoderConfig.numberOfChannels <= 0) {
      throw new TypeError("Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer).");
    }
    if (metadata.decoderConfig.description !== void 0) {
      if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
        throw new TypeError("Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
      }
    }
    if (metadata.decoderConfig.codec === "opus" && metadata.decoderConfig.description && metadata.decoderConfig.description.byteLength < 18) {
      throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");
    }
  };
  var validateSubtitleMetadata = (metadata) => {
    if (!metadata) {
      throw new TypeError("Subtitle metadata must be provided.");
    }
    if (typeof metadata !== "object") {
      throw new TypeError("Subtitle metadata must be an object.");
    }
    if (!metadata.config) {
      throw new TypeError("Subtitle metadata must include a config object.");
    }
    if (typeof metadata.config !== "object") {
      throw new TypeError("Subtitle metadata config must be an object.");
    }
    if (typeof metadata.config.description !== "string") {
      throw new TypeError("Subtitle metadata config description must be a string.");
    }
  };

  // src/isobmff/isobmff_muxer.ts
  var GLOBAL_TIMESCALE = 1e3;
  var TIMESTAMP_OFFSET = 2082844800;
  var intoTimescale = (timeInSeconds, timescale, round = true) => {
    let value = timeInSeconds * timescale;
    return round ? Math.round(value) : value;
  };
  var IsobmffMuxer = class extends Muxer {
    constructor(output, format) {
      super(output);
      this.timestampsMustStartAtZero = true;
      this.#auxTarget = new ArrayBufferTarget();
      this.#auxWriter = this.#auxTarget.createWriter();
      this.#auxBoxWriter = new IsobmffBoxWriter(this.#auxWriter);
      this.#ftypSize = null;
      this.#mdat = null;
      this.#trackDatas = [];
      this.#creationTime = Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET;
      this.#finalizedChunks = [];
      this.#nextFragmentNumber = 1;
      this.#writer = output.writer;
      this.#boxWriter = new IsobmffBoxWriter(this.#writer);
      this.#format = format;
      this.#fastStart = format.options.fastStart ?? (this.#writer instanceof ArrayBufferTargetWriter ? "in-memory" : false);
      if (this.#fastStart === "in-memory" || this.#fastStart === "fragmented") {
        this.#writer.ensureMonotonicity = true;
      }
    }
    #writer;
    #boxWriter;
    #format;
    #fastStart;
    #auxTarget;
    #auxWriter;
    #auxBoxWriter;
    #ftypSize;
    #mdat;
    #trackDatas;
    #creationTime;
    #finalizedChunks;
    #nextFragmentNumber;
    start() {
      const holdsAvc = this.output.tracks.some((x) => x.type === "video" && x.source.codec === "avc");
      this.#boxWriter.writeBox(ftyp({
        holdsAvc,
        fragmented: this.#fastStart === "fragmented"
      }));
      this.#ftypSize = this.#writer.getPos();
      if (this.#fastStart === "in-memory") {
        this.#mdat = mdat(false);
      } else if (this.#fastStart === "fragmented") {
      } else {
        this.#mdat = mdat(true);
        this.#boxWriter.writeBox(this.#mdat);
      }
      this.#writer.flush();
    }
    #getVideoTrackData(track, meta) {
      const existingTrackData = this.#trackDatas.find((x) => x.track === track);
      if (existingTrackData) {
        return existingTrackData;
      }
      validateVideoChunkMetadata(meta);
      assert(meta);
      assert(meta.decoderConfig);
      assert(meta.decoderConfig.codedWidth !== void 0);
      assert(meta.decoderConfig.codedHeight !== void 0);
      const newTrackData = {
        track,
        type: "video",
        info: {
          width: meta.decoderConfig.codedWidth,
          height: meta.decoderConfig.codedHeight,
          decoderConfig: meta.decoderConfig
        },
        timescale: track.metadata.frameRate ?? 57600,
        samples: [],
        sampleQueue: [],
        timestampProcessingQueue: [],
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        finalizedChunks: [],
        currentChunk: null,
        compactlyCodedChunkTable: []
      };
      this.#trackDatas.push(newTrackData);
      this.#trackDatas.sort((a, b) => a.track.id - b.track.id);
      return newTrackData;
    }
    #getAudioTrackData(track, meta) {
      const existingTrackData = this.#trackDatas.find((x) => x.track === track);
      if (existingTrackData) {
        return existingTrackData;
      }
      validateAudioChunkMetadata(meta);
      assert(meta);
      assert(meta.decoderConfig);
      const newTrackData = {
        track,
        type: "audio",
        info: {
          numberOfChannels: meta.decoderConfig.numberOfChannels,
          sampleRate: meta.decoderConfig.sampleRate,
          decoderConfig: meta.decoderConfig
        },
        timescale: meta.decoderConfig.sampleRate,
        samples: [],
        sampleQueue: [],
        timestampProcessingQueue: [],
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        finalizedChunks: [],
        currentChunk: null,
        compactlyCodedChunkTable: []
      };
      this.#trackDatas.push(newTrackData);
      this.#trackDatas.sort((a, b) => a.track.id - b.track.id);
      return newTrackData;
    }
    #getSubtitleTrackData(track, meta) {
      const existingTrackData = this.#trackDatas.find((x) => x.track === track);
      if (existingTrackData) {
        return existingTrackData;
      }
      validateSubtitleMetadata(meta);
      assert(meta);
      assert(meta.config);
      const newTrackData = {
        track,
        type: "subtitle",
        info: {
          config: meta.config
        },
        timescale: 1e3,
        // Reasonable
        samples: [],
        sampleQueue: [],
        timestampProcessingQueue: [],
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        finalizedChunks: [],
        currentChunk: null,
        compactlyCodedChunkTable: [],
        lastCueEndTimestamp: 0,
        cueQueue: [],
        nextSourceId: 0,
        cueToSourceId: /* @__PURE__ */ new WeakMap()
      };
      this.#trackDatas.push(newTrackData);
      this.#trackDatas.sort((a, b) => a.track.id - b.track.id);
      this.validateAndNormalizeTimestamp(track, 0, true);
      return newTrackData;
    }
    addEncodedVideoChunk(track, chunk, meta) {
      const trackData = this.#getVideoTrackData(track, meta);
      let data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      let timestamp = this.validateAndNormalizeTimestamp(trackData.track, chunk.timestamp, chunk.type === "key");
      let sample = this.#createSampleForTrack(trackData, data, timestamp, (chunk.duration ?? 0) / 1e6, chunk.type);
      this.#registerSample(trackData, sample);
    }
    addEncodedAudioChunk(track, chunk, meta) {
      const trackData = this.#getAudioTrackData(track, meta);
      let data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      let timestamp = this.validateAndNormalizeTimestamp(trackData.track, chunk.timestamp, chunk.type === "key");
      let sample = this.#createSampleForTrack(trackData, data, timestamp, (chunk.duration ?? 0) / 1e6, chunk.type);
      this.#registerSample(trackData, sample);
    }
    addSubtitleCue(track, cue, meta) {
      const trackData = this.#getSubtitleTrackData(track, meta);
      this.validateAndNormalizeTimestamp(trackData.track, 1e6 * cue.timestamp, true);
      if (track.source.codec === "webvtt") {
        trackData.cueQueue.push(cue);
        this.#processWebVTTCues(trackData, cue.timestamp);
      } else {
      }
    }
    #processWebVTTCues(trackData, until) {
      while (trackData.cueQueue.length > 0) {
        let timestamps = /* @__PURE__ */ new Set([]);
        for (let cue of trackData.cueQueue) {
          assert(cue.timestamp <= until);
          assert(trackData.lastCueEndTimestamp <= cue.timestamp + cue.duration);
          timestamps.add(Math.max(cue.timestamp, trackData.lastCueEndTimestamp));
          timestamps.add(cue.timestamp + cue.duration);
        }
        let sortedTimestamps = [...timestamps].sort((a, b) => a - b);
        let sampleStart = sortedTimestamps[0];
        let sampleEnd = sortedTimestamps[1] ?? sampleStart;
        if (until < sampleEnd) {
          break;
        }
        if (trackData.lastCueEndTimestamp < sampleStart) {
          this.#auxWriter.seek(0);
          let box2 = vtte();
          this.#auxBoxWriter.writeBox(box2);
          let body2 = this.#auxWriter.getSlice(0, this.#auxWriter.getPos());
          let sample2 = this.#createSampleForTrack(trackData, body2, trackData.lastCueEndTimestamp, sampleStart - trackData.lastCueEndTimestamp, "key");
          this.#registerSample(trackData, sample2);
          trackData.lastCueEndTimestamp = sampleStart;
        }
        this.#auxWriter.seek(0);
        for (let i = 0; i < trackData.cueQueue.length; i++) {
          let cue = trackData.cueQueue[i];
          if (cue.timestamp >= sampleEnd) {
            break;
          }
          inlineTimestampRegex.lastIndex = 0;
          let containsTimestamp = inlineTimestampRegex.test(cue.text);
          let endTimestamp = cue.timestamp + cue.duration;
          let sourceId = trackData.cueToSourceId.get(cue);
          if (sourceId === void 0 && sampleEnd < endTimestamp) {
            sourceId = trackData.nextSourceId++;
            trackData.cueToSourceId.set(cue, sourceId);
          }
          if (cue.notes) {
            let box3 = vtta(cue.notes);
            this.#auxBoxWriter.writeBox(box3);
          }
          let box2 = vttc(cue.text, containsTimestamp ? sampleStart : null, cue.identifier ?? null, cue.settings ?? null, sourceId ?? null);
          this.#auxBoxWriter.writeBox(box2);
          if (endTimestamp === sampleEnd) {
            trackData.cueQueue.splice(i--, 1);
          }
        }
        let body = this.#auxWriter.getSlice(0, this.#auxWriter.getPos());
        let sample = this.#createSampleForTrack(trackData, body, sampleStart, sampleEnd - sampleStart, "key");
        this.#registerSample(trackData, sample);
        trackData.lastCueEndTimestamp = sampleEnd;
      }
    }
    #createSampleForTrack(trackData, data, timestamp, duration, type) {
      let sample = {
        timestamp,
        decodeTimestamp: timestamp,
        // This may be refined later
        duration,
        data,
        size: data.byteLength,
        type,
        // Will be refined once the next sample comes in
        timescaleUnitsToNextSample: intoTimescale(duration, trackData.timescale)
      };
      return sample;
    }
    #processTimestamps(trackData) {
      if (trackData.timestampProcessingQueue.length === 0) {
        return;
      }
      const sortedTimestamps = trackData.timestampProcessingQueue.map((x) => x.timestamp).sort((a, b) => a - b);
      for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
        const sample = trackData.timestampProcessingQueue[i];
        sample.decodeTimestamp = sortedTimestamps[i];
        const sampleCompositionTimeOffset = intoTimescale(sample.timestamp - sample.decodeTimestamp, trackData.timescale);
        const durationInTimescale = intoTimescale(sample.duration, trackData.timescale);
        if (trackData.lastTimescaleUnits !== null) {
          assert(trackData.lastSample);
          let timescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
          let delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
          trackData.lastTimescaleUnits += delta;
          trackData.lastSample.timescaleUnitsToNextSample = delta;
          if (this.#fastStart !== "fragmented") {
            let lastTableEntry = last(trackData.timeToSampleTable);
            assert(lastTableEntry);
            if (lastTableEntry.sampleCount === 1) {
              lastTableEntry.sampleDelta = delta;
              let entryBefore = trackData.timeToSampleTable[trackData.timeToSampleTable.length - 2];
              if (entryBefore && entryBefore.sampleDelta === delta) {
                entryBefore.sampleCount++;
                trackData.timeToSampleTable.pop();
                lastTableEntry = entryBefore;
              }
            } else if (lastTableEntry.sampleDelta !== delta) {
              lastTableEntry.sampleCount--;
              trackData.timeToSampleTable.push(lastTableEntry = {
                sampleCount: 1,
                sampleDelta: delta
              });
            }
            if (lastTableEntry.sampleDelta === durationInTimescale) {
              lastTableEntry.sampleCount++;
            } else {
              trackData.timeToSampleTable.push({
                sampleCount: 1,
                sampleDelta: durationInTimescale
              });
            }
            const lastCompositionTimeOffsetTableEntry = last(trackData.compositionTimeOffsetTable);
            assert(lastCompositionTimeOffsetTableEntry);
            if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
              lastCompositionTimeOffsetTableEntry.sampleCount++;
            } else {
              trackData.compositionTimeOffsetTable.push({
                sampleCount: 1,
                sampleCompositionTimeOffset
              });
            }
          }
        } else {
          trackData.lastTimescaleUnits = 0;
          if (this.#fastStart !== "fragmented") {
            trackData.timeToSampleTable.push({
              sampleCount: 1,
              sampleDelta: durationInTimescale
            });
            trackData.compositionTimeOffsetTable.push({
              sampleCount: 1,
              sampleCompositionTimeOffset
            });
          }
        }
        trackData.lastSample = sample;
      }
      trackData.timestampProcessingQueue.length = 0;
    }
    #registerSample(trackData, sample) {
      if (this.#fastStart === "fragmented") {
        trackData.sampleQueue.push(sample);
        this.#interleaveSamples();
      } else {
        this.#addSampleToTrack(trackData, sample);
      }
    }
    #addSampleToTrack(trackData, sample) {
      if (sample.type === "key") {
        this.#processTimestamps(trackData);
      }
      if (this.#fastStart !== "fragmented") {
        trackData.samples.push(sample);
      }
      let beginNewChunk = false;
      if (!trackData.currentChunk) {
        beginNewChunk = true;
      } else {
        let currentChunkDuration = sample.timestamp - trackData.currentChunk.startTimestamp;
        if (this.#fastStart === "fragmented") {
          const keyFrameQueuedEverywhere = this.#trackDatas.every((otherTrackData) => {
            if (trackData === otherTrackData) {
              return sample.type === "key";
            }
            const firstQueuedSample = otherTrackData.sampleQueue[0];
            return firstQueuedSample && firstQueuedSample.type === "key";
          });
          if (currentChunkDuration >= 1 && keyFrameQueuedEverywhere) {
            beginNewChunk = true;
            this.#finalizeFragment();
          }
        } else {
          beginNewChunk = currentChunkDuration >= 0.5;
        }
      }
      if (beginNewChunk) {
        if (trackData.currentChunk) {
          this.#finalizeCurrentChunk(trackData);
        }
        trackData.currentChunk = {
          startTimestamp: sample.timestamp,
          samples: [],
          offset: null,
          moofOffset: null
        };
      }
      assert(trackData.currentChunk);
      trackData.currentChunk.samples.push(sample);
      trackData.timestampProcessingQueue.push(sample);
    }
    #finalizeCurrentChunk(trackData) {
      assert(this.#fastStart !== "fragmented");
      if (!trackData.currentChunk) return;
      trackData.finalizedChunks.push(trackData.currentChunk);
      this.#finalizedChunks.push(trackData.currentChunk);
      if (trackData.compactlyCodedChunkTable.length === 0 || last(trackData.compactlyCodedChunkTable).samplesPerChunk !== trackData.currentChunk.samples.length) {
        trackData.compactlyCodedChunkTable.push({
          firstChunk: trackData.finalizedChunks.length,
          // 1-indexed
          samplesPerChunk: trackData.currentChunk.samples.length
        });
      }
      if (this.#fastStart === "in-memory") {
        trackData.currentChunk.offset = 0;
        return;
      }
      trackData.currentChunk.offset = this.#writer.getPos();
      for (let sample of trackData.currentChunk.samples) {
        assert(sample.data);
        this.#writer.write(sample.data);
        sample.data = null;
      }
      this.#writer.flush();
    }
    #interleaveSamples() {
      assert(this.#fastStart === "fragmented");
      for (const track of this.output.tracks) {
        if (!track.source.closed && !this.#trackDatas.some((x) => x.track === track)) {
          return;
        }
      }
      outer:
        while (true) {
          let trackWithMinTimestamp = null;
          let minTimestamp = Infinity;
          for (let trackData of this.#trackDatas) {
            if (trackData.sampleQueue.length === 0 && !trackData.track.source.closed) {
              break outer;
            }
            if (trackData.sampleQueue.length > 0 && trackData.sampleQueue[0].timestamp < minTimestamp) {
              trackWithMinTimestamp = trackData;
              minTimestamp = trackData.sampleQueue[0].timestamp;
            }
          }
          if (!trackWithMinTimestamp) {
            break;
          }
          let sample = trackWithMinTimestamp.sampleQueue.shift();
          this.#addSampleToTrack(trackWithMinTimestamp, sample);
        }
    }
    #finalizeFragment(flushWriter = true) {
      assert(this.#fastStart === "fragmented");
      let fragmentNumber = this.#nextFragmentNumber++;
      if (fragmentNumber === 1) {
        let movieBox = moov(this.#trackDatas, this.#creationTime, true);
        this.#boxWriter.writeBox(movieBox);
      }
      let moofOffset = this.#writer.getPos();
      let moofBox = moof(fragmentNumber, this.#trackDatas);
      this.#boxWriter.writeBox(moofBox);
      {
        let mdatBox = mdat(false);
        let totalTrackSampleSize = 0;
        for (let trackData of this.#trackDatas) {
          assert(trackData.currentChunk);
          for (let sample of trackData.currentChunk.samples) {
            totalTrackSampleSize += sample.size;
          }
        }
        let mdatSize = this.#boxWriter.measureBox(mdatBox) + totalTrackSampleSize;
        if (mdatSize >= 2 ** 32) {
          mdatBox.largeSize = true;
          mdatSize = this.#boxWriter.measureBox(mdatBox) + totalTrackSampleSize;
        }
        mdatBox.size = mdatSize;
        this.#boxWriter.writeBox(mdatBox);
      }
      for (let trackData of this.#trackDatas) {
        trackData.currentChunk.offset = this.#writer.getPos();
        trackData.currentChunk.moofOffset = moofOffset;
        for (let sample of trackData.currentChunk.samples) {
          this.#writer.write(sample.data);
          sample.data = null;
        }
      }
      let endPos = this.#writer.getPos();
      this.#writer.seek(this.#boxWriter.offsets.get(moofBox));
      let newMoofBox = moof(fragmentNumber, this.#trackDatas);
      this.#boxWriter.writeBox(newMoofBox);
      this.#writer.seek(endPos);
      for (let trackData of this.#trackDatas) {
        trackData.finalizedChunks.push(trackData.currentChunk);
        this.#finalizedChunks.push(trackData.currentChunk);
        trackData.currentChunk = null;
      }
      if (flushWriter) {
        this.#writer.flush();
      }
    }
    onTrackClose(track) {
      if (track.type === "subtitle" && track.source.codec === "webvtt") {
        let trackData = this.#trackDatas.find((x) => x.track === track);
        if (trackData) {
          this.#processWebVTTCues(trackData, Infinity);
        }
      }
      if (this.#fastStart === "fragmented") {
        this.#interleaveSamples();
      }
    }
    /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
    finalize() {
      for (let trackData of this.#trackDatas) {
        if (trackData.type === "subtitle" && trackData.track.source.codec === "webvtt") {
          this.#processWebVTTCues(trackData, Infinity);
        }
      }
      if (this.#fastStart === "fragmented") {
        for (let trackData of this.#trackDatas) {
          for (let sample of trackData.sampleQueue) {
            this.#addSampleToTrack(trackData, sample);
          }
          this.#processTimestamps(trackData);
        }
        this.#finalizeFragment(false);
      } else {
        for (let trackData of this.#trackDatas) {
          this.#processTimestamps(trackData);
          this.#finalizeCurrentChunk(trackData);
        }
      }
      if (this.#fastStart === "in-memory") {
        assert(this.#mdat);
        let mdatSize;
        for (let i = 0; i < 2; i++) {
          let movieBox2 = moov(this.#trackDatas, this.#creationTime);
          let movieBoxSize = this.#boxWriter.measureBox(movieBox2);
          mdatSize = this.#boxWriter.measureBox(this.#mdat);
          let currentChunkPos = this.#writer.getPos() + movieBoxSize + mdatSize;
          for (let chunk of this.#finalizedChunks) {
            chunk.offset = currentChunkPos;
            for (let { data } of chunk.samples) {
              assert(data);
              currentChunkPos += data.byteLength;
              mdatSize += data.byteLength;
            }
          }
          if (currentChunkPos < 2 ** 32) break;
          if (mdatSize >= 2 ** 32) this.#mdat.largeSize = true;
        }
        let movieBox = moov(this.#trackDatas, this.#creationTime);
        this.#boxWriter.writeBox(movieBox);
        this.#mdat.size = mdatSize;
        this.#boxWriter.writeBox(this.#mdat);
        for (let chunk of this.#finalizedChunks) {
          for (let sample of chunk.samples) {
            assert(sample.data);
            this.#writer.write(sample.data);
            sample.data = null;
          }
        }
      } else if (this.#fastStart === "fragmented") {
        let startPos = this.#writer.getPos();
        let mfraBox = mfra(this.#trackDatas);
        this.#boxWriter.writeBox(mfraBox);
        let mfraBoxSize = this.#writer.getPos() - startPos;
        this.#writer.seek(this.#writer.getPos() - 4);
        this.#boxWriter.writeU32(mfraBoxSize);
      } else {
        assert(this.#mdat);
        assert(this.#ftypSize !== null);
        let mdatPos = this.#boxWriter.offsets.get(this.#mdat);
        assert(mdatPos !== void 0);
        let mdatSize = this.#writer.getPos() - mdatPos;
        this.#mdat.size = mdatSize;
        this.#mdat.largeSize = mdatSize >= 2 ** 32;
        this.#boxWriter.patchBox(this.#mdat);
        let movieBox = moov(this.#trackDatas, this.#creationTime);
        if (typeof this.#fastStart === "object") {
          this.#writer.seek(this.#ftypSize);
          this.#boxWriter.writeBox(movieBox);
          let remainingBytes = mdatPos - this.#writer.getPos();
          this.#boxWriter.writeBox(free(remainingBytes));
        } else {
          this.#boxWriter.writeBox(movieBox);
        }
      }
    }
  };

  // src/matroska/ebml.ts
  var EBMLFloat32 = class {
    constructor(value) {
      this.value = value;
    }
  };
  var EBMLFloat64 = class {
    constructor(value) {
      this.value = value;
    }
  };
  var EBMLSignedInt = class {
    constructor(value) {
      this.value = value;
    }
  };
  var measureUnsignedInt = (value) => {
    if (value < 1 << 8) {
      return 1;
    } else if (value < 1 << 16) {
      return 2;
    } else if (value < 1 << 24) {
      return 3;
    } else if (value < 2 ** 32) {
      return 4;
    } else if (value < 2 ** 40) {
      return 5;
    } else {
      return 6;
    }
  };
  var measureSignedInt = (value) => {
    if (value >= -(1 << 6) && value < 1 << 6) {
      return 1;
    } else if (value >= -(1 << 13) && value < 1 << 13) {
      return 2;
    } else if (value >= -(1 << 20) && value < 1 << 20) {
      return 3;
    } else if (value >= -(1 << 27) && value < 1 << 27) {
      return 4;
    } else if (value >= -(2 ** 34) && value < 2 ** 34) {
      return 5;
    } else {
      return 6;
    }
  };
  var measureEBMLVarInt = (value) => {
    if (value < (1 << 7) - 1) {
      return 1;
    } else if (value < (1 << 14) - 1) {
      return 2;
    } else if (value < (1 << 21) - 1) {
      return 3;
    } else if (value < (1 << 28) - 1) {
      return 4;
    } else if (value < 2 ** 35 - 1) {
      return 5;
    } else if (value < 2 ** 42 - 1) {
      return 6;
    } else {
      throw new Error("EBML VINT size not supported " + value);
    }
  };

  // src/matroska/matroska_muxer.ts
  var MAX_CHUNK_LENGTH_MS = 2 ** 15;
  var APP_NAME = "https://github.com/Vanilagy/webm-muxer";
  var SEGMENT_SIZE_BYTES = 6;
  var CLUSTER_SIZE_BYTES = 5;
  var CODEC_STRING_MAP = {
    avc: "V_MPEG4/ISO/AVC",
    hevc: "V_MPEGH/ISO/HEVC",
    vp8: "V_VP8",
    vp9: "V_VP9",
    av1: "V_AV1",
    aac: "A_AAC",
    opus: "A_OPUS",
    webvtt: "S_TEXT/WEBVTT"
  };
  var TRACK_TYPE_MAP = {
    video: 1,
    audio: 2,
    subtitle: 17
  };
  var MatroskaMuxer = class extends Muxer {
    constructor(output, format) {
      super(output);
      this.timestampsMustStartAtZero = false;
      this.#helper = new Uint8Array(8);
      this.#helperView = new DataView(this.#helper.buffer);
      /**
       * Stores the position from the start of the file to where EBML elements have been written. This is used to
       * rewrite/edit elements that were already added before, and to measure sizes of things.
       */
      this.offsets = /* @__PURE__ */ new WeakMap();
      /** Same as offsets, but stores position where the element's data starts (after ID and size fields). */
      this.dataOffsets = /* @__PURE__ */ new WeakMap();
      this.#trackDatas = [];
      this.#segment = null;
      this.#segmentInfo = null;
      this.#seekHead = null;
      this.#tracksElement = null;
      this.#segmentDuration = null;
      this.#cues = null;
      this.#currentCluster = null;
      this.#currentClusterMsTimestamp = null;
      this.#trackDatasInCurrentCluster = /* @__PURE__ */ new Set();
      this.#duration = 0;
      this.#writer = output.writer;
      this.#format = format;
      if (this.#format.options.streamable) {
        this.#writer.ensureMonotonicity = true;
      }
    }
    #writer;
    #format;
    #helper;
    #helperView;
    #trackDatas;
    #segment;
    #segmentInfo;
    #seekHead;
    #tracksElement;
    #segmentDuration;
    #cues;
    #currentCluster;
    #currentClusterMsTimestamp;
    #trackDatasInCurrentCluster;
    #duration;
    #writeByte(value) {
      this.#helperView.setUint8(0, value);
      this.#writer.write(this.#helper.subarray(0, 1));
    }
    #writeFloat32(value) {
      this.#helperView.setFloat32(0, value, false);
      this.#writer.write(this.#helper.subarray(0, 4));
    }
    #writeFloat64(value) {
      this.#helperView.setFloat64(0, value, false);
      this.#writer.write(this.#helper);
    }
    #writeUnsignedInt(value, width = measureUnsignedInt(value)) {
      let pos = 0;
      switch (width) {
        case 6:
          this.#helperView.setUint8(pos++, value / 2 ** 40 | 0);
        case 5:
          this.#helperView.setUint8(pos++, value / 2 ** 32 | 0);
        case 4:
          this.#helperView.setUint8(pos++, value >> 24);
        case 3:
          this.#helperView.setUint8(pos++, value >> 16);
        case 2:
          this.#helperView.setUint8(pos++, value >> 8);
        case 1:
          this.#helperView.setUint8(pos++, value);
          break;
        default:
          throw new Error("Bad UINT size " + width);
      }
      this.#writer.write(this.#helper.subarray(0, pos));
    }
    #writeSignedInt(value, width = measureSignedInt(value)) {
      if (value < 0) {
        value += 2 ** (width * 8);
      }
      this.#writeUnsignedInt(value, width);
    }
    writeEBMLVarInt(value, width = measureEBMLVarInt(value)) {
      let pos = 0;
      switch (width) {
        case 1:
          this.#helperView.setUint8(pos++, 1 << 7 | value);
          break;
        case 2:
          this.#helperView.setUint8(pos++, 1 << 6 | value >> 8);
          this.#helperView.setUint8(pos++, value);
          break;
        case 3:
          this.#helperView.setUint8(pos++, 1 << 5 | value >> 16);
          this.#helperView.setUint8(pos++, value >> 8);
          this.#helperView.setUint8(pos++, value);
          break;
        case 4:
          this.#helperView.setUint8(pos++, 1 << 4 | value >> 24);
          this.#helperView.setUint8(pos++, value >> 16);
          this.#helperView.setUint8(pos++, value >> 8);
          this.#helperView.setUint8(pos++, value);
          break;
        case 5:
          this.#helperView.setUint8(pos++, 1 << 3 | value / 2 ** 32 & 7);
          this.#helperView.setUint8(pos++, value >> 24);
          this.#helperView.setUint8(pos++, value >> 16);
          this.#helperView.setUint8(pos++, value >> 8);
          this.#helperView.setUint8(pos++, value);
          break;
        case 6:
          this.#helperView.setUint8(pos++, 1 << 2 | value / 2 ** 40 & 3);
          this.#helperView.setUint8(pos++, value / 2 ** 32 | 0);
          this.#helperView.setUint8(pos++, value >> 24);
          this.#helperView.setUint8(pos++, value >> 16);
          this.#helperView.setUint8(pos++, value >> 8);
          this.#helperView.setUint8(pos++, value);
          break;
        default:
          throw new Error("Bad EBML VINT size " + width);
      }
      this.#writer.write(this.#helper.subarray(0, pos));
    }
    // Assumes the string is ASCII
    #writeString(str) {
      this.#writer.write(new Uint8Array(str.split("").map((x) => x.charCodeAt(0))));
    }
    writeEBML(data) {
      if (data === null) return;
      if (data instanceof Uint8Array) {
        this.#writer.write(data);
      } else if (Array.isArray(data)) {
        for (let elem of data) {
          this.writeEBML(elem);
        }
      } else {
        this.offsets.set(data, this.#writer.getPos());
        this.#writeUnsignedInt(data.id);
        if (Array.isArray(data.data)) {
          let sizePos = this.#writer.getPos();
          let sizeSize = data.size === -1 ? 1 : data.size ?? 4;
          if (data.size === -1) {
            this.#writeByte(255);
          } else {
            this.#writer.seek(this.#writer.getPos() + sizeSize);
          }
          let startPos = this.#writer.getPos();
          this.dataOffsets.set(data, startPos);
          this.writeEBML(data.data);
          if (data.size !== -1) {
            let size = this.#writer.getPos() - startPos;
            let endPos = this.#writer.getPos();
            this.#writer.seek(sizePos);
            this.writeEBMLVarInt(size, sizeSize);
            this.#writer.seek(endPos);
          }
        } else if (typeof data.data === "number") {
          let size = data.size ?? measureUnsignedInt(data.data);
          this.writeEBMLVarInt(size);
          this.#writeUnsignedInt(data.data, size);
        } else if (typeof data.data === "string") {
          this.writeEBMLVarInt(data.data.length);
          this.#writeString(data.data);
        } else if (data.data instanceof Uint8Array) {
          this.writeEBMLVarInt(data.data.byteLength, data.size);
          this.#writer.write(data.data);
        } else if (data.data instanceof EBMLFloat32) {
          this.writeEBMLVarInt(4);
          this.#writeFloat32(data.data.value);
        } else if (data.data instanceof EBMLFloat64) {
          this.writeEBMLVarInt(8);
          this.#writeFloat64(data.data.value);
        } else if (data.data instanceof EBMLSignedInt) {
          let size = data.size ?? measureSignedInt(data.data.value);
          this.writeEBMLVarInt(size);
          this.#writeSignedInt(data.data.value, size);
        }
      }
    }
    beforeTrackAdd(track) {
      if (!(this.#format instanceof WebMOutputFormat)) {
        return;
      }
      if (track.type === "video") {
        if (!["vp8", "vp9", "av1"].includes(track.source.codec)) {
          throw new Error(`WebM only supports VP8, VP9 and AV1 as video codecs. Switching to MKV removes this restriction.`);
        }
      } else if (track.type === "audio") {
        if (!["opus", "vorbis"].includes(track.source.codec)) {
          throw new Error(`WebM only supports Opus and Vorbis as audio codecs. Switching to MKV removes this restriction.`);
        }
      } else if (track.type === "subtitle") {
        if (track.source.codec !== "webvtt") {
          throw new Error(`WebM only supports WebVTT as subtitle codec. Switching to MKV removes this restriction.`);
        }
      } else {
        throw new Error("WebM only supports video, audio and subtitle tracks. Switching to MKV removes this restriction.");
      }
    }
    start() {
      this.#writeEBMLHeader();
      if (!this.#format.options.streamable) {
        this.#createSeekHead();
      }
      this.#createSegmentInfo();
      this.#createCues();
      this.#writer.flush();
    }
    #writeEBMLHeader() {
      let ebmlHeader = { id: 440786851 /* EBML */, data: [
        { id: 17030 /* EBMLVersion */, data: 1 },
        { id: 17143 /* EBMLReadVersion */, data: 1 },
        { id: 17138 /* EBMLMaxIDLength */, data: 4 },
        { id: 17139 /* EBMLMaxSizeLength */, data: 8 },
        { id: 17026 /* DocType */, data: this.#format instanceof WebMOutputFormat ? "webm" : "matroska" },
        { id: 17031 /* DocTypeVersion */, data: 2 },
        { id: 17029 /* DocTypeReadVersion */, data: 2 }
      ] };
      this.writeEBML(ebmlHeader);
    }
    /**
     * Creates a SeekHead element which is positioned near the start of the file and allows the media player to seek to
     * relevant sections more easily. Since we don't know the positions of those sections yet, we'll set them later.
     */
    #createSeekHead() {
      const kaxCues = new Uint8Array([28, 83, 187, 107]);
      const kaxInfo = new Uint8Array([21, 73, 169, 102]);
      const kaxTracks = new Uint8Array([22, 84, 174, 107]);
      let seekHead = { id: 290298740 /* SeekHead */, data: [
        { id: 19899 /* Seek */, data: [
          { id: 21419 /* SeekID */, data: kaxCues },
          { id: 21420 /* SeekPosition */, size: 5, data: 0 }
        ] },
        { id: 19899 /* Seek */, data: [
          { id: 21419 /* SeekID */, data: kaxInfo },
          { id: 21420 /* SeekPosition */, size: 5, data: 0 }
        ] },
        { id: 19899 /* Seek */, data: [
          { id: 21419 /* SeekID */, data: kaxTracks },
          { id: 21420 /* SeekPosition */, size: 5, data: 0 }
        ] }
      ] };
      this.#seekHead = seekHead;
    }
    #createSegmentInfo() {
      let segmentDuration = { id: 17545 /* Duration */, data: new EBMLFloat64(0) };
      this.#segmentDuration = segmentDuration;
      let segmentInfo = { id: 357149030 /* Info */, data: [
        { id: 2807729 /* TimestampScale */, data: 1e6 },
        { id: 19840 /* MuxingApp */, data: APP_NAME },
        { id: 22337 /* WritingApp */, data: APP_NAME },
        !this.#format.options.streamable ? segmentDuration : null
      ] };
      this.#segmentInfo = segmentInfo;
    }
    #createTracks() {
      let tracksElement = { id: 374648427 /* Tracks */, data: [] };
      this.#tracksElement = tracksElement;
      for (let trackData of this.#trackDatas) {
        tracksElement.data.push({ id: 174 /* TrackEntry */, data: [
          { id: 215 /* TrackNumber */, data: trackData.track.id },
          { id: 29637 /* TrackUID */, data: trackData.track.id },
          { id: 131 /* TrackType */, data: TRACK_TYPE_MAP[trackData.type] },
          { id: 134 /* CodecID */, data: CODEC_STRING_MAP[trackData.track.source.codec] },
          ...trackData.type === "video" ? [
            trackData.info.decoderConfig.description ? { id: 25506 /* CodecPrivate */, data: toUint8Array(trackData.info.decoderConfig.description) } : null,
            trackData.track.metadata.frameRate ? { id: 2352003 /* DefaultDuration */, data: 1e9 / trackData.track.metadata.frameRate } : null,
            { id: 224 /* Video */, data: [
              { id: 176 /* PixelWidth */, data: trackData.info.width },
              { id: 186 /* PixelHeight */, data: trackData.info.height },
              (() => {
                if (trackData.info.decoderConfig.colorSpace) {
                  let colorSpace = trackData.info.decoderConfig.colorSpace;
                  if (!colorSpaceIsComplete(colorSpace)) {
                    return null;
                  }
                  return { id: 21936 /* Colour */, data: [
                    { id: 21937 /* MatrixCoefficients */, data: MATRIX_COEFFICIENTS_MAP[colorSpace.matrix] },
                    { id: 21946 /* TransferCharacteristics */, data: TRANSFER_CHARACTERISTICS_MAP[colorSpace.transfer] },
                    { id: 21947 /* Primaries */, data: COLOR_PRIMARIES_MAP[colorSpace.primaries] },
                    { id: 21945 /* Range */, data: [1, 2][Number(colorSpace.fullRange)] }
                  ] };
                }
                return null;
              })()
            ] }
          ] : [],
          ...trackData.type === "audio" ? [
            trackData.info.decoderConfig.description ? { id: 25506 /* CodecPrivate */, data: toUint8Array(trackData.info.decoderConfig.description) } : null,
            { id: 225 /* Audio */, data: [
              { id: 181 /* SamplingFrequency */, data: new EBMLFloat32(trackData.info.sampleRate) },
              { id: 159 /* Channels */, data: trackData.info.numberOfChannels }
              // Bit depth for when PCM is a thing
            ] }
          ] : [],
          ...trackData.type === "subtitle" ? [
            { id: 25506 /* CodecPrivate */, data: textEncoder.encode(trackData.info.config.description) }
          ] : []
        ] });
      }
    }
    #createSegment() {
      let segment = {
        id: 408125543 /* Segment */,
        size: this.#format.options.streamable ? -1 : SEGMENT_SIZE_BYTES,
        data: [
          !this.#format.options.streamable ? this.#seekHead : null,
          this.#segmentInfo,
          this.#tracksElement
        ]
      };
      this.#segment = segment;
      this.writeEBML(segment);
    }
    #createCues() {
      this.#cues = { id: 475249515 /* Cues */, data: [] };
    }
    get #segmentDataOffset() {
      assert(this.#segment);
      return this.dataOffsets.get(this.#segment);
    }
    #getVideoTrackData(track, meta) {
      const existingTrackData = this.#trackDatas.find((x) => x.track === track);
      if (existingTrackData) {
        return existingTrackData;
      }
      validateVideoChunkMetadata(meta);
      assert(meta);
      assert(meta.decoderConfig);
      assert(meta.decoderConfig.codedWidth !== void 0);
      assert(meta.decoderConfig.codedHeight !== void 0);
      const newTrackData = {
        track,
        type: "video",
        info: {
          width: meta.decoderConfig.codedWidth,
          height: meta.decoderConfig.codedHeight,
          decoderConfig: meta.decoderConfig
        },
        chunkQueue: [],
        lastWrittenMsTimestamp: null
      };
      this.#trackDatas.push(newTrackData);
      this.#trackDatas.sort((a, b) => a.track.id - b.track.id);
      return newTrackData;
    }
    #getAudioTrackData(track, meta) {
      const existingTrackData = this.#trackDatas.find((x) => x.track === track);
      if (existingTrackData) {
        return existingTrackData;
      }
      validateAudioChunkMetadata(meta);
      assert(meta);
      assert(meta.decoderConfig);
      const newTrackData = {
        track,
        type: "audio",
        info: {
          numberOfChannels: meta.decoderConfig.numberOfChannels,
          sampleRate: meta.decoderConfig.sampleRate,
          decoderConfig: meta.decoderConfig
        },
        chunkQueue: [],
        lastWrittenMsTimestamp: null
      };
      this.#trackDatas.push(newTrackData);
      this.#trackDatas.sort((a, b) => a.track.id - b.track.id);
      return newTrackData;
    }
    #getSubtitleTrackData(track, meta) {
      const existingTrackData = this.#trackDatas.find((x) => x.track === track);
      if (existingTrackData) {
        return existingTrackData;
      }
      validateSubtitleMetadata(meta);
      assert(meta);
      assert(meta.config);
      const newTrackData = {
        track,
        type: "subtitle",
        info: {
          config: meta.config
        },
        chunkQueue: [],
        lastWrittenMsTimestamp: null
      };
      this.#trackDatas.push(newTrackData);
      this.#trackDatas.sort((a, b) => a.track.id - b.track.id);
      return newTrackData;
    }
    addEncodedVideoChunk(track, chunk, meta) {
      const trackData = this.#getVideoTrackData(track, meta);
      let data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      let timestamp = this.validateAndNormalizeTimestamp(trackData.track, chunk.timestamp, chunk.type === "key");
      let videoChunk = this.#createInternalChunk(data, timestamp, (chunk.duration ?? 0) / 1e6, chunk.type);
      if (track.source.codec === "vp9") this.#fixVP9ColorSpace(trackData, videoChunk);
      trackData.chunkQueue.push(videoChunk);
      this.#interleaveChunks();
    }
    addEncodedAudioChunk(track, chunk, meta) {
      const trackData = this.#getAudioTrackData(track, meta);
      let data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      let timestamp = this.validateAndNormalizeTimestamp(trackData.track, chunk.timestamp, chunk.type === "key");
      let audioChunk = this.#createInternalChunk(data, timestamp, (chunk.duration ?? 0) / 1e6, chunk.type);
      trackData.chunkQueue.push(audioChunk);
      this.#interleaveChunks();
    }
    addSubtitleCue(track, cue, meta) {
      const trackData = this.#getSubtitleTrackData(track, meta);
      const timestamp = this.validateAndNormalizeTimestamp(trackData.track, 1e6 * cue.timestamp, true);
      let bodyText = cue.text;
      const timestampMs = Math.floor(timestamp * 1e3);
      inlineTimestampRegex.lastIndex = 0;
      bodyText = bodyText.replace(inlineTimestampRegex, (match) => {
        let time = parseSubtitleTimestamp(match.slice(1, -1));
        let offsetTime = time - timestampMs;
        return `<${formatSubtitleTimestamp(offsetTime)}>`;
      });
      const body = textEncoder.encode(bodyText);
      const additions = `${cue.settings ?? ""}
${cue.identifier ?? ""}
${cue.notes ?? ""}`;
      let subtitleChunk = this.#createInternalChunk(body, timestamp, cue.duration, "key", additions.trim() ? textEncoder.encode(additions) : null);
      trackData.chunkQueue.push(subtitleChunk);
      this.#interleaveChunks();
    }
    #interleaveChunks() {
      for (const track of this.output.tracks) {
        if (!track.source.closed && !this.#trackDatas.some((x) => x.track === track)) {
          return;
        }
      }
      outer:
        while (true) {
          let trackWithMinTimestamp = null;
          let minTimestamp = Infinity;
          for (let trackData of this.#trackDatas) {
            if (trackData.chunkQueue.length === 0 && !trackData.track.source.closed) {
              break outer;
            }
            if (trackData.chunkQueue.length > 0 && trackData.chunkQueue[0].timestamp < minTimestamp) {
              trackWithMinTimestamp = trackData;
              minTimestamp = trackData.chunkQueue[0].timestamp;
            }
          }
          if (!trackWithMinTimestamp) {
            break;
          }
          let chunk = trackWithMinTimestamp.chunkQueue.shift();
          this.#writeBlock(trackWithMinTimestamp, chunk);
        }
      this.#writer.flush();
    }
    /** Due to [a bug in Chromium](https://bugs.chromium.org/p/chromium/issues/detail?id=1377842), VP9 streams often
     * lack color space information. This method patches in that information. */
    // http://downloads.webmproject.org/docs/vp9/vp9-bitstream_superframe-and-uncompressed-header_v1.0.pdf
    #fixVP9ColorSpace(trackData, chunk) {
      if (chunk.type !== "key") return;
      if (!trackData.info.decoderConfig.colorSpace || !trackData.info.decoderConfig.colorSpace.matrix) return;
      let i = 0;
      if (readBits(chunk.data, 0, 2) !== 2) return;
      i += 2;
      let profile = (readBits(chunk.data, i + 1, i + 2) << 1) + readBits(chunk.data, i + 0, i + 1);
      i += 2;
      if (profile === 3) i++;
      let showExistingFrame = readBits(chunk.data, i + 0, i + 1);
      i++;
      if (showExistingFrame) return;
      let frameType = readBits(chunk.data, i + 0, i + 1);
      i++;
      if (frameType !== 0) return;
      i += 2;
      let syncCode = readBits(chunk.data, i + 0, i + 24);
      i += 24;
      if (syncCode !== 4817730) return;
      if (profile >= 2) i++;
      let colorSpaceID = {
        "rgb": 7,
        "bt709": 2,
        "bt470bg": 1,
        "smpte170m": 3
      }[trackData.info.decoderConfig.colorSpace.matrix];
      writeBits(chunk.data, i + 0, i + 3, colorSpaceID);
    }
    /** Converts a read-only external chunk into an internal one for easier use. */
    #createInternalChunk(data, timestamp, duration, type, additions = null) {
      let internalChunk = {
        data,
        type,
        timestamp,
        duration,
        additions
      };
      return internalChunk;
    }
    /** Writes a block containing media data to the file. */
    #writeBlock(trackData, chunk) {
      if (!this.#segment) {
        this.#createTracks();
        this.#createSegment();
      }
      let msTimestamp = Math.floor(1e3 * chunk.timestamp);
      const keyFrameQueuedEverywhere = this.#trackDatas.every((otherTrackData) => {
        if (otherTrackData.track.source.closed) {
          return true;
        }
        if (trackData === otherTrackData) {
          return chunk.type === "key";
        }
        const firstQueuedSample = otherTrackData.chunkQueue[0];
        return firstQueuedSample && firstQueuedSample.type === "key";
      });
      if (!this.#currentCluster || keyFrameQueuedEverywhere && msTimestamp - this.#currentClusterMsTimestamp >= 1e3) {
        this.#createNewCluster(msTimestamp);
      }
      let relativeTimestamp = msTimestamp - this.#currentClusterMsTimestamp;
      if (relativeTimestamp < 0) {
        return;
      }
      let clusterIsTooLong = relativeTimestamp >= MAX_CHUNK_LENGTH_MS;
      if (clusterIsTooLong) {
        throw new Error(
          `Current Matroska cluster exceeded its maximum allowed length of ${MAX_CHUNK_LENGTH_MS} milliseconds. In order to produce a correct WebM file, you must pass in a key frame at least every ${MAX_CHUNK_LENGTH_MS} milliseconds.`
        );
      }
      let prelude = new Uint8Array(4);
      let view2 = new DataView(prelude.buffer);
      view2.setUint8(0, 128 | trackData.track.id);
      view2.setInt16(1, relativeTimestamp, false);
      let msDuration = Math.floor(1e3 * chunk.duration);
      if (msDuration === 0 && !chunk.additions) {
        view2.setUint8(3, Number(chunk.type === "key") << 7);
        let simpleBlock = { id: 163 /* SimpleBlock */, data: [
          prelude,
          chunk.data
        ] };
        this.writeEBML(simpleBlock);
      } else {
        let blockGroup = { id: 160 /* BlockGroup */, data: [
          { id: 161 /* Block */, data: [
            prelude,
            chunk.data
          ] },
          chunk.type === "delta" ? { id: 251 /* ReferenceBlock */, data: new EBMLSignedInt(trackData.lastWrittenMsTimestamp - msTimestamp) } : null,
          chunk.additions ? { id: 30113 /* BlockAdditions */, data: [
            { id: 166 /* BlockMore */, data: [
              { id: 165 /* BlockAdditional */, data: chunk.additions },
              { id: 238 /* BlockAddID */, data: 1 }
            ] }
          ] } : null,
          msDuration > 0 ? { id: 155 /* BlockDuration */, data: msDuration } : null
        ] };
        this.writeEBML(blockGroup);
      }
      this.#duration = Math.max(this.#duration, msTimestamp + msDuration);
      trackData.lastWrittenMsTimestamp = msTimestamp;
      this.#trackDatasInCurrentCluster.add(trackData);
    }
    /** Creates a new Cluster element to contain media chunks. */
    #createNewCluster(msTimestamp) {
      if (this.#currentCluster && !this.#format.options.streamable) {
        this.#finalizeCurrentCluster();
      }
      this.#currentCluster = {
        id: 524531317 /* Cluster */,
        size: this.#format.options.streamable ? -1 : CLUSTER_SIZE_BYTES,
        data: [
          { id: 231 /* Timestamp */, data: msTimestamp }
        ]
      };
      this.writeEBML(this.#currentCluster);
      this.#currentClusterMsTimestamp = msTimestamp;
      this.#trackDatasInCurrentCluster.clear();
    }
    #finalizeCurrentCluster() {
      assert(this.#currentCluster);
      let clusterSize = this.#writer.getPos() - this.dataOffsets.get(this.#currentCluster);
      let endPos = this.#writer.getPos();
      this.#writer.seek(this.offsets.get(this.#currentCluster) + 4);
      this.writeEBMLVarInt(clusterSize, CLUSTER_SIZE_BYTES);
      this.#writer.seek(endPos);
      let clusterOffsetFromSegment = this.offsets.get(this.#currentCluster) - this.#segmentDataOffset;
      assert(this.#cues);
      this.#cues.data.push({ id: 187 /* CuePoint */, data: [
        { id: 179 /* CueTime */, data: this.#currentClusterMsTimestamp },
        // We only write out cues for tracks that have at least one chunk in this cluster
        ...[...this.#trackDatasInCurrentCluster].map((trackData) => {
          return { id: 183 /* CueTrackPositions */, data: [
            { id: 247 /* CueTrack */, data: trackData.track.id },
            { id: 241 /* CueClusterPosition */, data: clusterOffsetFromSegment }
          ] };
        })
      ] });
    }
    onTrackClose() {
      this.#interleaveChunks();
    }
    /** Finalizes the file, making it ready for use. Must be called after all media chunks have been added. */
    finalize() {
      if (!this.#segment) {
        this.#createTracks();
        this.#createSegment();
      }
      for (let trackData of this.#trackDatas) {
        while (trackData.chunkQueue.length > 0) {
          this.#writeBlock(trackData, trackData.chunkQueue.shift());
        }
      }
      if (!this.#format.options.streamable && this.#currentCluster) {
        this.#finalizeCurrentCluster();
      }
      assert(this.#cues);
      this.writeEBML(this.#cues);
      if (!this.#format.options.streamable) {
        let endPos = this.#writer.getPos();
        let segmentSize = this.#writer.getPos() - this.#segmentDataOffset;
        this.#writer.seek(this.offsets.get(this.#segment) + 4);
        this.writeEBMLVarInt(segmentSize, SEGMENT_SIZE_BYTES);
        this.#segmentDuration.data = new EBMLFloat64(this.#duration);
        this.#writer.seek(this.offsets.get(this.#segmentDuration));
        this.writeEBML(this.#segmentDuration);
        this.#seekHead.data[0].data[1].data = this.offsets.get(this.#cues) - this.#segmentDataOffset;
        this.#seekHead.data[1].data[1].data = this.offsets.get(this.#segmentInfo) - this.#segmentDataOffset;
        this.#seekHead.data[2].data[1].data = this.offsets.get(this.#tracksElement) - this.#segmentDataOffset;
        this.#writer.seek(this.offsets.get(this.#seekHead));
        this.writeEBML(this.#seekHead);
        this.#writer.seek(endPos);
      }
    }
  };

  // src/output_format.ts
  var OutputFormat = class {
  };
  var Mp4OutputFormat = class extends OutputFormat {
    constructor(options = {}) {
      if (!options || typeof options !== "object") {
        throw new TypeError("options must be an object.");
      }
      if (options.fastStart !== void 0 && ![false, "in-memory", "fragmented"].includes(options.fastStart)) {
        throw new TypeError('options.fastStart, when provided, must be false, "in-memory", or "fragmented".');
      }
      super();
      this.options = options;
    }
    createMuxer(output) {
      return new IsobmffMuxer(output, this);
    }
  };
  var MkvOutputFormat2 = class extends OutputFormat {
    constructor(options = {}) {
      if (!options || typeof options !== "object") {
        throw new TypeError("options must be an object.");
      }
      if (options.streamable !== void 0 && typeof options.streamable !== "boolean") {
        throw new TypeError("options.streamable, when provided, must be a boolean.");
      }
      super();
      this.options = options;
    }
    createMuxer(output) {
      return new MatroskaMuxer(output, this);
    }
  };
  var WebMOutputFormat = class extends MkvOutputFormat2 {
  };

  // src/source.ts
  var VIDEO_CODECS = ["avc", "hevc", "vp8", "vp9", "av1"];
  var AUDIO_CODECS = ["aac", "opus"];
  var SUBTITLE_CODECS = ["webvtt"];
  var MediaSource = class {
    constructor() {
      this.connectedTrack = null;
      this.closed = false;
      this.offsetTimestamps = false;
    }
    // TODO this is also just internal:
    ensureValidDigest() {
      if (!this.connectedTrack) {
        throw new Error("Cannot call digest without connecting the source to an output track.");
      }
      if (!this.connectedTrack.output.started) {
        throw new Error("Cannot call digest before output has been started.");
      }
      if (this.connectedTrack.output.finalizing) {
        throw new Error("Cannot call digest after output has started finalizing.");
      }
      if (this.closed) {
        throw new Error("Cannot call digest after source has been closed.");
      }
    }
    // TODO: These are should not be called from the outside lib
    start() {
    }
    async flush() {
    }
    close() {
      if (this.closed) {
        throw new Error("Source already closed.");
      }
      if (!this.connectedTrack) {
        throw new Error("Cannot call close without connecting the source to an output track.");
      }
      if (!this.connectedTrack.output.started) {
        throw new Error("Cannot call close before output has been started.");
      }
      this.closed = true;
      if (this.connectedTrack.output.finalizing) {
        return;
      }
      this.connectedTrack.output.muxer.onTrackClose(this.connectedTrack);
    }
  };
  var VideoSource = class extends MediaSource {
    constructor(codec) {
      super();
      this.connectedTrack = null;
      if (!VIDEO_CODECS.includes(codec)) {
        throw new TypeError(`Invalid video codec '${codec}'. Must be one of: ${VIDEO_CODECS.join(", ")}.`);
      }
      this.codec = codec;
    }
  };
  var EncodedVideoChunkSource = class extends VideoSource {
    constructor(codec) {
      super(codec);
    }
    digest(chunk, meta) {
      if (!(chunk instanceof EncodedVideoChunk)) {
        throw new TypeError("chunk must be an EncodedVideoChunk.");
      }
      this.ensureValidDigest();
      this.connectedTrack?.output.muxer.addEncodedVideoChunk(this.connectedTrack, chunk, meta);
    }
  };
  var KEY_FRAME_INTERVAL = 5;
  var validateVideoCodecConfig = (config) => {
    if (!config || typeof config !== "object") {
      throw new TypeError("Codec config must be an object.");
    }
    if (!VIDEO_CODECS.includes(config.codec)) {
      throw new TypeError(`Invalid video codec '${config.codec}'. Must be one of: ${VIDEO_CODECS.join(", ")}.`);
    }
    if (!Number.isInteger(config.bitrate) || config.bitrate <= 0) {
      throw new TypeError("config.bitrate must be a positive integer.");
    }
    if (config.latencyMode !== void 0 && ["quality", "realtime"].includes(config.latencyMode)) {
      throw new TypeError("config.latencyMode, when provided, must be 'quality' or 'realtime'.");
    }
  };
  var VideoEncoderWrapper = class {
    constructor(source, codecConfig) {
      this.source = source;
      this.codecConfig = codecConfig;
      this.encoder = null;
      this.lastMultipleOfKeyFrameInterval = -1;
      this.lastWidth = null;
      this.lastHeight = null;
      validateVideoCodecConfig(codecConfig);
    }
    digest(videoFrame) {
      this.source.ensureValidDigest();
      if (this.lastWidth !== null && this.lastHeight !== null) {
        if (videoFrame.codedWidth !== this.lastWidth || videoFrame.codedHeight !== this.lastHeight) {
          throw new Error(`Video frame size must remain constant. Expected ${this.lastWidth}x${this.lastHeight}, got ${videoFrame.codedWidth}x${videoFrame.codedHeight}.`);
        }
      } else {
        this.lastWidth = videoFrame.codedWidth;
        this.lastHeight = videoFrame.codedHeight;
      }
      this.ensureEncoder(videoFrame);
      assert(this.encoder);
      const multipleOfKeyFrameInterval = Math.floor(videoFrame.timestamp / 1e6 / KEY_FRAME_INTERVAL);
      this.encoder.encode(videoFrame, { keyFrame: multipleOfKeyFrameInterval !== this.lastMultipleOfKeyFrameInterval });
      this.lastMultipleOfKeyFrameInterval = multipleOfKeyFrameInterval;
    }
    ensureEncoder(videoFrame) {
      if (this.encoder) {
        return;
      }
      this.encoder = new VideoEncoder({
        output: (chunk, meta) => this.source.connectedTrack?.output.muxer.addEncodedVideoChunk(this.source.connectedTrack, chunk, meta),
        error: (error) => console.error("Video encode error:", error)
      });
      this.encoder.configure({
        codec: buildVideoCodecString(this.codecConfig.codec, videoFrame.codedWidth, videoFrame.codedHeight),
        width: videoFrame.codedWidth,
        height: videoFrame.codedHeight,
        bitrate: this.codecConfig.bitrate,
        framerate: this.source.connectedTrack?.metadata.frameRate,
        latencyMode: this.codecConfig.latencyMode
      });
    }
    async flush() {
      return this.encoder?.flush();
    }
  };
  var VideoFrameSource = class extends VideoSource {
    constructor(codecConfig) {
      super(codecConfig.codec);
      this.encoder = new VideoEncoderWrapper(this, codecConfig);
    }
    digest(videoFrame) {
      if (!(videoFrame instanceof VideoFrame)) {
        throw new TypeError("videoFrame must be a VideoFrame.");
      }
      this.encoder.digest(videoFrame);
    }
    flush() {
      return this.encoder.flush();
    }
  };
  var CanvasSource = class extends VideoSource {
    constructor(canvas, codecConfig) {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new TypeError("canvas must be an HTMLCanvasElement.");
      }
      super(codecConfig.codec);
      this.canvas = canvas;
      this.encoder = new VideoEncoderWrapper(this, codecConfig);
    }
    digest(timestamp, duration = 0) {
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("timestamp must be a non-negative number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("duration must be a non-negative number.");
      }
      const frame = new VideoFrame(this.canvas, {
        timestamp: Math.round(1e6 * timestamp),
        duration: Math.round(1e6 * duration),
        alpha: "discard"
      });
      this.encoder.digest(frame);
      frame.close();
    }
    flush() {
      return this.encoder.flush();
    }
  };
  var MediaStreamVideoTrackSource = class extends VideoSource {
    constructor(track, codecConfig) {
      if (!(track instanceof MediaStreamTrack) || track.kind !== "video") {
        throw new TypeError("track must be a video MediaStreamTrack.");
      }
      super(codecConfig.codec);
      this.track = track;
      this.abortController = null;
      this.offsetTimestamps = true;
      this.encoder = new VideoEncoderWrapper(this, codecConfig);
    }
    start() {
      this.abortController = new AbortController();
      const processor = new MediaStreamTrackProcessor({ track: this.track });
      const consumer = new WritableStream({
        write: (videoFrame) => {
          this.encoder.digest(videoFrame);
          videoFrame.close();
        }
      });
      processor.readable.pipeTo(consumer, {
        signal: this.abortController.signal
      }).catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Pipe error:", err);
      });
    }
    async flush() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      await this.encoder.flush();
    }
  };
  var AudioSource = class extends MediaSource {
    constructor(codec) {
      super();
      this.connectedTrack = null;
      if (!AUDIO_CODECS.includes(codec)) {
        throw new TypeError(`Invalid audio codec '${codec}'. Must be one of: ${AUDIO_CODECS.join(", ")}.`);
      }
      this.codec = codec;
    }
  };
  var EncodedAudioChunkSource = class extends AudioSource {
    constructor(codec) {
      super(codec);
    }
    digest(chunk, meta) {
      if (!(chunk instanceof EncodedAudioChunk)) {
        throw new TypeError("chunk must be an EncodedAudioChunk.");
      }
      this.ensureValidDigest();
      this.connectedTrack?.output.muxer.addEncodedAudioChunk(this.connectedTrack, chunk, meta);
    }
  };
  var validateAudioCodecConfig = (config) => {
    if (!config || typeof config !== "object") {
      throw new TypeError("Codec config must be an object.");
    }
    if (!AUDIO_CODECS.includes(config.codec)) {
      throw new TypeError(`Invalid audio codec '${config.codec}'. Must be one of: ${AUDIO_CODECS.join(", ")}.`);
    }
    if (!Number.isInteger(config.bitrate) || config.bitrate <= 0) {
      throw new TypeError("config.bitrate must be a positive integer.");
    }
  };
  var AudioEncoderWrapper = class {
    constructor(source, codecConfig) {
      this.source = source;
      this.codecConfig = codecConfig;
      this.encoder = null;
      this.lastNumberOfChannels = null;
      this.lastSampleRate = null;
      validateAudioCodecConfig(codecConfig);
    }
    digest(audioData) {
      this.source.ensureValidDigest();
      if (this.lastNumberOfChannels !== null && this.lastSampleRate !== null) {
        if (audioData.numberOfChannels !== this.lastNumberOfChannels || audioData.sampleRate !== this.lastSampleRate) {
          throw new Error(`Audio parameters must remain constant. Expected ${this.lastNumberOfChannels} channels at ${this.lastSampleRate} Hz, got ${audioData.numberOfChannels} channels at ${audioData.sampleRate} Hz.`);
        }
      } else {
        this.lastNumberOfChannels = audioData.numberOfChannels;
        this.lastSampleRate = audioData.sampleRate;
      }
      this.ensureEncoder(audioData);
      assert(this.encoder);
      this.encoder.encode(audioData);
    }
    ensureEncoder(audioData) {
      if (this.encoder) {
        return;
      }
      this.encoder = new AudioEncoder({
        output: (chunk, meta) => this.source.connectedTrack?.output.muxer.addEncodedAudioChunk(this.source.connectedTrack, chunk, meta),
        error: (error) => console.error("Audio encode error:", error)
      });
      this.encoder.configure({
        codec: buildAudioCodecString(this.codecConfig.codec, audioData.numberOfChannels, audioData.sampleRate),
        numberOfChannels: audioData.numberOfChannels,
        sampleRate: audioData.sampleRate,
        bitrate: this.codecConfig.bitrate
      });
    }
    async flush() {
      return this.encoder?.flush();
    }
  };
  var AudioDataSource = class extends AudioSource {
    constructor(codecConfig) {
      super(codecConfig.codec);
      this.encoder = new AudioEncoderWrapper(this, codecConfig);
    }
    digest(audioData) {
      if (!(audioData instanceof AudioData)) {
        throw new TypeError("audioData must be an AudioData.");
      }
      this.encoder.digest(audioData);
    }
    flush() {
      return this.encoder.flush();
    }
  };
  var AudioBufferSource = class extends AudioSource {
    constructor(codecConfig) {
      super(codecConfig.codec);
      this.accumulatedFrameCount = 0;
      this.encoder = new AudioEncoderWrapper(this, codecConfig);
    }
    digest(audioBuffer) {
      if (!(audioBuffer instanceof AudioBuffer)) {
        throw new TypeError("audioBuffer must be an AudioBuffer.");
      }
      const numberOfChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const numberOfFrames = audioBuffer.length;
      const data = new Float32Array(numberOfChannels * numberOfFrames);
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        data.set(channelData, channel * numberOfFrames);
      }
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames,
        numberOfChannels,
        timestamp: Math.round(1e6 * this.accumulatedFrameCount / sampleRate),
        data
      });
      this.encoder.digest(audioData);
      audioData.close();
      this.accumulatedFrameCount += numberOfFrames;
    }
    flush() {
      return this.encoder.flush();
    }
  };
  var MediaStreamAudioTrackSource = class extends AudioSource {
    constructor(track, codecConfig) {
      if (!(track instanceof MediaStreamTrack) || track.kind !== "audio") {
        throw new TypeError("track must be an audio MediaStreamTrack.");
      }
      super(codecConfig.codec);
      this.track = track;
      this.abortController = null;
      this.offsetTimestamps = true;
      this.encoder = new AudioEncoderWrapper(this, codecConfig);
    }
    start() {
      this.abortController = new AbortController();
      const processor = new MediaStreamTrackProcessor({ track: this.track });
      const consumer = new WritableStream({
        write: (audioData) => {
          this.encoder.digest(audioData);
          audioData.close();
        }
      });
      processor.readable.pipeTo(consumer, {
        signal: this.abortController.signal
      }).catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Pipe error:", err);
      });
    }
    async flush() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      await this.encoder.flush();
    }
  };
  var SubtitleSource = class extends MediaSource {
    constructor(codec) {
      super();
      this.connectedTrack = null;
      if (!SUBTITLE_CODECS.includes(codec)) {
        throw new TypeError(`Invalid subtitle codec '${codec}'. Must be one of: ${SUBTITLE_CODECS.join(", ")}.`);
      }
      this.codec = codec;
    }
  };
  var TextSubtitleSource = class extends SubtitleSource {
    constructor(codec) {
      super(codec);
      this.parser = new SubtitleParser({
        codec,
        output: (cue, metadata) => this.connectedTrack?.output.muxer.addSubtitleCue(this.connectedTrack, cue, metadata),
        error: (error) => console.error("Subtitle parse error:", error)
      });
    }
    digest(text) {
      if (typeof text !== "string") {
        throw new TypeError("text must be a string.");
      }
      this.ensureValidDigest();
      this.parser.parse(text);
    }
  };

  // src/output.ts
  var Output = class {
    constructor(options) {
      this.tracks = [];
      this.started = false;
      this.finalizing = false;
      if (!options || typeof options !== "object") {
        throw new TypeError("options must be an object.");
      }
      if (!(options.format instanceof OutputFormat)) {
        throw new TypeError("options.format must be an OutputFormat.");
      }
      if (!(options.target instanceof Target)) {
        throw new TypeError("options.target must be a Target.");
      }
      if (options.target.output) {
        throw new Error("Target is already used for another output.");
      }
      options.target.output = this;
      this.writer = options.target.createWriter();
      this.muxer = options.format.createMuxer(this);
    }
    addVideoTrack(source, metadata = {}) {
      if (!(source instanceof VideoSource)) {
        throw new TypeError("source must be a VideoSource.");
      }
      if (!metadata || typeof metadata !== "object") {
        throw new TypeError("metadata must be an object.");
      }
      if (typeof metadata.rotation === "number" && ![0, 90, 180, 270].includes(metadata.rotation)) {
        throw new TypeError(`Invalid video rotation: ${metadata.rotation}. Has to be 0, 90, 180 or 270.`);
      } else if (Array.isArray(metadata.rotation) && (metadata.rotation.length !== 9 || metadata.rotation.some((value) => !Number.isFinite(value)))) {
        throw new TypeError(`Invalid video transformation matrix: ${metadata.rotation.join()}`);
      }
      if (metadata.frameRate !== void 0 && (!Number.isInteger(metadata.frameRate) || metadata.frameRate <= 0)) {
        throw new TypeError(
          `Invalid video frame rate: ${metadata.frameRate}. Must be a positive integer.`
        );
      }
      this.addTrack("video", source, metadata);
    }
    addAudioTrack(source, metadata = {}) {
      if (!(source instanceof AudioSource)) {
        throw new TypeError("source must be an AudioSource.");
      }
      if (!metadata || typeof metadata !== "object") {
        throw new TypeError("metadata must be an object.");
      }
      this.addTrack("audio", source, metadata);
    }
    addSubtitleTrack(source, metadata = {}) {
      if (!(source instanceof SubtitleSource)) {
        throw new TypeError("source must be a SubtitleSource.");
      }
      if (!metadata || typeof metadata !== "object") {
        throw new TypeError("metadata must be an object.");
      }
      this.addTrack("subtitle", source, metadata);
    }
    addTrack(type, source, metadata) {
      if (this.started) {
        throw new Error("Cannot add track after output has started.");
      }
      if (source.connectedTrack) {
        throw new Error("Source is already used for a track.");
      }
      const track = {
        id: this.tracks.length + 1,
        output: this,
        type,
        source,
        metadata
      };
      this.muxer.beforeTrackAdd(track);
      this.tracks.push(track);
      source.connectedTrack = track;
    }
    start() {
      if (this.started) {
        throw new Error("Output already started.");
      }
      this.started = true;
      this.muxer.start();
      for (const track of this.tracks) {
        track.source.start();
      }
    }
    async finalize() {
      if (this.finalizing) {
        throw new Error("Cannot call finalize twice.");
      }
      this.finalizing = true;
      const promises = this.tracks.map((x) => x.source.flush());
      await Promise.all(promises);
      this.muxer.finalize();
      this.writer.flush();
      this.writer.finalize();
    }
  };
  return __toCommonJS(src_exports);
})();
if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Metamuxer)
