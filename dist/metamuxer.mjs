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
    const byteIndex = Math.floor(i / 8);
    const byte = bytes2[byteIndex];
    const bitIndex = 7 - (i & 7);
    const bit = (byte & 1 << bitIndex) >> bitIndex;
    result <<= 1;
    result |= bit;
  }
  return result;
};
var writeBits = (bytes2, start, end, value) => {
  for (let i = start; i < end; i++) {
    const byteIndex = Math.floor(i / 8);
    let byte = bytes2[byteIndex];
    const bitIndex = 7 - (i & 7);
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
var invertObject = (object) => {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [value, key]));
};
var COLOR_PRIMARIES_MAP = {
  bt709: 1,
  // ITU-R BT.709
  bt470bg: 5,
  // ITU-R BT.470BG
  smpte170m: 6
  // ITU-R BT.601 525 - SMPTE 170M
};
var COLOR_PRIMARIES_MAP_INVERSE = invertObject(COLOR_PRIMARIES_MAP);
var TRANSFER_CHARACTERISTICS_MAP = {
  "bt709": 1,
  // ITU-R BT.709
  "smpte170m": 6,
  // SMPTE 170M
  "iec61966-2-1": 13
  // IEC 61966-2-1
};
var TRANSFER_CHARACTERISTICS_MAP_INVERSE = invertObject(TRANSFER_CHARACTERISTICS_MAP);
var MATRIX_COEFFICIENTS_MAP = {
  rgb: 0,
  // Identity
  bt709: 1,
  // ITU-R BT.709
  bt470bg: 5,
  // ITU-R BT.470BG
  smpte170m: 6
  // SMPTE 170M
};
var MATRIX_COEFFICIENTS_MAP_INVERSE = invertObject(MATRIX_COEFFICIENTS_MAP);
var colorSpaceIsComplete = (colorSpace) => {
  return !!colorSpace && !!colorSpace.primaries && !!colorSpace.transfer && !!colorSpace.matrix && colorSpace.fullRange !== void 0;
};
var isAllowSharedBufferSource = (x) => {
  return x instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && x instanceof SharedArrayBuffer || ArrayBuffer.isView(x) && !(x instanceof DataView);
};
var AsyncMutex = class {
  constructor() {
    this.currentPromise = Promise.resolve();
  }
  async acquire() {
    let resolver;
    const nextPromise = new Promise((resolve) => {
      resolver = resolve;
    });
    const currentPromiseAlias = this.currentPromise;
    this.currentPromise = nextPromise;
    await currentPromiseAlias;
    return resolver;
  }
};
var rotationMatrix = (rotationInDegrees) => {
  const theta = rotationInDegrees * (Math.PI / 180);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
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
var bytesToHexString = (bytes2) => {
  return [...bytes2].map((x) => x.toString(16).padStart(2, "0")).join("");
};
var reverseBitsU32 = (x) => {
  x = x >> 1 & 1431655765 | (x & 1431655765) << 1;
  x = x >> 2 & 858993459 | (x & 858993459) << 2;
  x = x >> 4 & 252645135 | (x & 252645135) << 4;
  x = x >> 8 & 16711935 | (x & 16711935) << 8;
  x = x >> 16 & 65535 | (x & 65535) << 16;
  return x >>> 0;
};
var binarySearchExact = (arr, key, valueGetter) => {
  let low = 0;
  let high = arr.length - 1;
  let res = -1;
  while (low <= high) {
    const mid = low + high >> 1;
    const midVal = valueGetter(arr[mid]);
    if (midVal === key) {
      res = mid;
      high = mid - 1;
    } else if (midVal < key) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return res;
};
var binarySearchLessOrEqual = (arr, key, valueGetter) => {
  let ans = -1;
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = low + (high - low + 1) / 2 | 0;
    const midVal = valueGetter(arr[mid]);
    if (midVal <= key) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ans;
};
var promiseWithResolvers = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
var removeItem = (arr, item) => {
  const index = arr.indexOf(item);
  if (index !== -1) {
    arr.splice(index, 1);
  }
};
var findLastIndex = (arr, predicate) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      return i;
    }
  }
  return -1;
};
var toAsyncIterator = async function* (source) {
  if (Symbol.iterator in source) {
    yield* source[Symbol.iterator]();
  } else {
    yield* source[Symbol.asyncIterator]();
  }
};

// src/subtitles.ts
var cueBlockHeaderRegex = /(?:(.+?)\n)?((?:\d{2}:)?\d{2}:\d{2}.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}.\d{3})/g;
var preambleStartRegex = /^WEBVTT(.|\n)*?\n{2}/;
var inlineTimestampRegex = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g;
var SubtitleParser = class {
  constructor(options) {
    this.preambleText = null;
    this.preambleEmitted = false;
    this.options = options;
  }
  parse(text) {
    text = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    cueBlockHeaderRegex.lastIndex = 0;
    let match;
    if (!this.preambleText) {
      if (!preambleStartRegex.test(text)) {
        const error = new Error("WebVTT preamble incorrect.");
        this.options.error(error);
        throw error;
      }
      match = cueBlockHeaderRegex.exec(text);
      const preamble = text.slice(0, match?.index ?? text.length).trimEnd();
      if (!preamble) {
        const error = new Error("No WebVTT preamble provided.");
        this.options.error(error);
        throw error;
      }
      this.preambleText = preamble;
      if (match) {
        text = text.slice(match.index);
        cueBlockHeaderRegex.lastIndex = 0;
      }
    }
    while (match = cueBlockHeaderRegex.exec(text)) {
      const notes = text.slice(0, match.index);
      const cueIdentifier = match[1];
      const matchEnd = match.index + match[0].length;
      const bodyStart = text.indexOf("\n", matchEnd) + 1;
      const cueSettings = text.slice(matchEnd, bodyStart).trim();
      let bodyEnd = text.indexOf("\n\n", matchEnd);
      if (bodyEnd === -1) bodyEnd = text.length;
      const startTime = parseSubtitleTimestamp(match[2]);
      const endTime = parseSubtitleTimestamp(match[3]);
      const duration = endTime - startTime;
      const body = text.slice(bodyStart, bodyEnd).trim();
      text = text.slice(bodyEnd).trimStart();
      cueBlockHeaderRegex.lastIndex = 0;
      const cue = {
        timestamp: startTime / 1e3,
        duration: duration / 1e3,
        text: body,
        identifier: cueIdentifier,
        settings: cueSettings,
        notes
      };
      const meta = {};
      if (!this.preambleEmitted) {
        meta.config = {
          description: this.preambleText
        };
        this.preambleEmitted = true;
      }
      this.options.output(cue, meta);
    }
  }
};
var timestampRegex = /(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})/;
var parseSubtitleTimestamp = (string) => {
  const match = timestampRegex.exec(string);
  if (!match) throw new Error("Expected match.");
  return 60 * 60 * 1e3 * Number(match[1] || "0") + 60 * 1e3 * Number(match[2]) + 1e3 * Number(match[3]) + Number(match[4]);
};
var formatSubtitleTimestamp = (timestamp) => {
  const hours = Math.floor(timestamp / (60 * 60 * 1e3));
  const minutes = Math.floor(timestamp % (60 * 60 * 1e3) / (60 * 1e3));
  const seconds = Math.floor(timestamp % (60 * 1e3) / 1e3);
  const milliseconds = timestamp % 1e3;
  return hours.toString().padStart(2, "0") + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0") + "." + milliseconds.toString().padStart(3, "0");
};

// src/isobmff/isobmff-boxes.ts
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
      const startPos = this.writer.getPos();
      this.writeBoxHeader(box2, 0);
      if (box2.contents) this.writer.write(box2.contents);
      if (box2.children) {
        for (const child of box2.children) if (child) this.writeBox(child);
      }
      const endPos = this.writer.getPos();
      const size = box2.size ?? endPos - startPos;
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
    const endPos = this.writer.getPos();
    this.writer.seek(boxOffset);
    this.writeBox(box2);
    this.writer.seek(endPos);
  }
  measureBox(box2) {
    if (box2.contents && !box2.children) {
      const headerSize = this.measureBoxHeader(box2);
      return headerSize + box2.contents.byteLength;
    } else {
      let result = this.measureBoxHeader(box2);
      if (box2.contents) result += box2.contents.byteLength;
      if (box2.children) {
        for (const child of box2.children) if (child) result += this.measureBox(child);
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
  const bytes2 = [];
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
  const bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
  if (nullTerminated) bytes2.push(0);
  return bytes2;
};
var lastPresentedSample = (samples) => {
  let result = null;
  for (const sample of samples) {
    if (!result || sample.timestamp > result.timestamp) {
      result = sample;
    }
  }
  return result;
};
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
  const minorVersion = 512;
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
  const duration = intoTimescale(Math.max(
    0,
    ...trackDatas.filter((x) => x.samples.length > 0).map((x) => {
      const lastSample = lastPresentedSample(x.samples);
      return lastSample.timestamp + lastSample.duration;
    })
  ), GLOBAL_TIMESCALE);
  const nextTrackId = Math.max(0, ...trackDatas.map((x) => x.track.id)) + 1;
  const needsU64 = !isU32(creationTime) || !isU32(duration);
  const u32OrU64 = needsU64 ? u64 : u32;
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
  const lastSample = lastPresentedSample(trackData.samples);
  const durationInGlobalTimescale = intoTimescale(
    lastSample ? lastSample.timestamp + lastSample.duration : 0,
    GLOBAL_TIMESCALE
  );
  const needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
  const u32OrU64 = needsU64 ? u64 : u32;
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
  const lastSample = lastPresentedSample(trackData.samples);
  const localDuration = intoTimescale(
    lastSample ? lastSample.timestamp + lastSample.duration : 0,
    trackData.timescale
  );
  const needsU64 = !isU32(creationTime) || !isU32(localDuration);
  const u32OrU64 = needsU64 ? u64 : u32;
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
      VIDEO_CODEC_TO_BOX_NAME[trackData.track.source._codec],
      trackData
    );
  } else if (trackData.type === "audio") {
    sampleDescription = soundSampleDescription(
      AUDIO_CODEC_TO_BOX_NAME[trackData.track.source._codec],
      trackData
    );
  } else if (trackData.type === "subtitle") {
    sampleDescription = subtitleSampleDescription(
      SUBTITLE_CODEC_TO_BOX_NAME[trackData.track.source._codec],
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
  VIDEO_CODEC_TO_CONFIGURATION_BOX[trackData.track.source._codec](trackData),
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
  const decoderConfig = trackData.info.decoderConfig;
  assert(decoderConfig.colorSpace);
  const parts = decoderConfig.codec.split(".");
  const profile = Number(parts[1]);
  const level = Number(parts[2]);
  const bitDepth = Number(parts[3]);
  const chromaSubsampling = 0;
  const thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + Number(decoderConfig.colorSpace.fullRange);
  const colourPrimaries = 2;
  const transferCharacteristics = 2;
  const matrixCoefficients = 2;
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
  const marker = 1;
  const version = 1;
  const firstByte = (marker << 7) + version;
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
  AUDIO_CODEC_TO_CONFIGURATION_BOX[trackData.track.source._codec](trackData)
]);
var esds = (trackData) => {
  const description = toUint8Array(trackData.info.decoderConfig.description ?? new ArrayBuffer(0));
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
    assert(description.byteLength >= 18);
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
  SUBTITLE_CODEC_TO_CONFIGURATION_BOX[trackData.track.source._codec](trackData)
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
  const keySamples = [...trackData.samples.entries()].filter(([, sample]) => sample.type === "key");
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
  const byte3 = 0;
  const byte4 = 0;
  const sampleIsDifferenceSample = sample.type === "delta";
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
  const referenceSample = trackData.currentChunk.samples[1] ?? trackData.currentChunk.samples[0];
  const referenceSampleInfo = {
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
  const allSampleDurations = trackData.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
  const allSampleSizes = trackData.currentChunk.samples.map((x) => x.size);
  const allSampleFlags = trackData.currentChunk.samples.map(fragmentSampleFlags);
  const allSampleCompositionTimeOffsets = trackData.currentChunk.samples.map((x) => intoTimescale(x.timestamp - x.decodeTimestamp, trackData.timescale));
  const uniqueSampleDurations = new Set(allSampleDurations);
  const uniqueSampleSizes = new Set(allSampleSizes);
  const uniqueSampleFlags = new Set(allSampleFlags);
  const uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
  const firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
  const sampleDurationPresent = uniqueSampleDurations.size > 1;
  const sampleSizePresent = uniqueSampleSizes.size > 1;
  const sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
  const sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
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
  const version = 1;
  return fullBox("tfra", version, 0, [
    u32(trackData.track.id),
    // Track ID
    u32(63),
    // This specifies that traf number, trun number and sample number are 32-bit ints
    u32(trackData.finalizedChunks.length),
    // Number of entries
    trackData.finalizedChunks.map((chunk) => [
      u64(intoTimescale(chunk.samples[0].timestamp, trackData.timescale)),
      // Time (in presentation time)
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
  avc: "avc1",
  hevc: "hvc1",
  vp8: "vp08",
  vp9: "vp09",
  av1: "av01"
};
var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
  avc: avcC,
  hevc: hvcC,
  vp8: vpcC,
  vp9: vpcC,
  av1: av1C
};
var AUDIO_CODEC_TO_BOX_NAME = {
  aac: "mp4a",
  opus: "Opus"
};
var AUDIO_CODEC_TO_CONFIGURATION_BOX = {
  aac: esds,
  opus: dOps
};
var SUBTITLE_CODEC_TO_BOX_NAME = {
  webvtt: "wvtt"
};
var SUBTITLE_CODEC_TO_CONFIGURATION_BOX = {
  webvtt: vttC
};

// src/muxer.ts
var Muxer = class {
  constructor(output) {
    this.mutex = new AsyncMutex();
    this.trackTimestampInfo = /* @__PURE__ */ new WeakMap();
    this.output = output;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  beforeTrackAdd(track) {
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        maxTimestamp: track.source._offsetTimestamps ? 0 : timestampInSeconds,
        lastKeyFrameTimestamp: track.source._offsetTimestamps ? 0 : timestampInSeconds
      };
      this.trackTimestampInfo.set(track, timestampInfo);
    }
    if (track.source._offsetTimestamps) {
      timestampInSeconds -= timestampInfo.timestampOffset;
    }
    if (timestampInSeconds < 0) {
      throw new Error(`Timestamps must be non-negative (got ${timestampInSeconds}s).`);
    }
    if (timestampInSeconds < timestampInfo.lastKeyFrameTimestamp) {
      throw new Error(
        `Timestamp cannot be smaller than last key frame's timestamp (got ${timestampInSeconds}s, last key frame at ${timestampInfo.lastKeyFrameTimestamp}s).`
      );
    }
    if (isKeyFrame) {
      if (timestampInSeconds < timestampInfo.maxTimestamp) {
        throw new Error(
          `Key frame timestamps cannot be smaller than any timestamp that came before (got ${timestampInSeconds}s, max timestamp was ${timestampInfo.maxTimestamp}s).`
        );
      }
      timestampInfo.lastKeyFrameTimestamp = timestampInSeconds;
    }
    timestampInfo.maxTimestamp = Math.max(timestampInfo.maxTimestamp, timestampInSeconds);
    return timestampInSeconds;
  }
};

// src/writer.ts
var Writer = class {
  constructor() {
    /** Setting this to true will cause the writer to ensure data is written in a strictly monotonic, streamable way. */
    this.ensureMonotonicity = false;
  }
  start() {
  }
};
var ArrayBufferTargetWriter = class extends Writer {
  constructor(target) {
    super();
    this.pos = 0;
    this.buffer = new ArrayBuffer(2 ** 16);
    this.bytes = new Uint8Array(this.buffer);
    this.maxPos = 0;
    this.target = target;
  }
  ensureSize(size) {
    let newLength = this.buffer.byteLength;
    while (newLength < size) newLength *= 2;
    if (newLength === this.buffer.byteLength) return;
    const newBuffer = new ArrayBuffer(newLength);
    const newBytes = new Uint8Array(newBuffer);
    newBytes.set(this.bytes, 0);
    this.buffer = newBuffer;
    this.bytes = newBytes;
  }
  write(data) {
    this.ensureSize(this.pos + data.byteLength);
    this.bytes.set(data, this.pos);
    this.pos += data.byteLength;
    this.maxPos = Math.max(this.maxPos, this.pos);
  }
  seek(newPos) {
    this.pos = newPos;
  }
  getPos() {
    return this.pos;
  }
  async flush() {
  }
  async finalize() {
    this.ensureSize(this.pos);
    this.target.buffer = this.buffer.slice(0, Math.max(this.maxPos, this.pos));
  }
  getSlice(start, end) {
    return this.bytes.slice(start, end);
  }
};
var StreamTargetWriter = class extends Writer {
  constructor(target) {
    super();
    this.pos = 0;
    this.sections = [];
    this.lastFlushEnd = 0;
    this.writer = null;
    this.target = target;
  }
  start() {
    this.writer = this.target._writable.getWriter();
  }
  write(data) {
    this.sections.push({
      data: data.slice(),
      start: this.pos
    });
    this.pos += data.byteLength;
  }
  seek(newPos) {
    this.pos = newPos;
  }
  getPos() {
    return this.pos;
  }
  async flush() {
    assert(this.writer);
    if (this.sections.length === 0) return;
    const chunks = [];
    const sorted = [...this.sections].sort((a, b) => a.start - b.start);
    chunks.push({
      start: sorted[0].start,
      size: sorted[0].data.byteLength
    });
    for (let i = 1; i < sorted.length; i++) {
      const lastChunk = chunks[chunks.length - 1];
      const section = sorted[i];
      if (section.start <= lastChunk.start + lastChunk.size) {
        lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
      } else {
        chunks.push({
          start: section.start,
          size: section.data.byteLength
        });
      }
    }
    for (const chunk of chunks) {
      chunk.data = new Uint8Array(chunk.size);
      for (const section of this.sections) {
        if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
          chunk.data.set(section.data, section.start - chunk.start);
        }
      }
      if (this.ensureMonotonicity && chunk.start !== this.lastFlushEnd) {
        throw new Error("Internal error: Monotonicity violation.");
      }
      if (this.writer.desiredSize !== null && this.writer.desiredSize <= 0) {
        await this.writer.ready;
      }
      void this.writer.write({
        type: "write",
        data: chunk.data,
        position: chunk.start
      });
      this.lastFlushEnd = chunk.start + chunk.data.byteLength;
    }
    this.sections.length = 0;
  }
  finalize() {
    assert(this.writer);
    return this.writer.close();
  }
};
var DEFAULT_CHUNK_SIZE = 2 ** 24;
var MAX_CHUNKS_AT_ONCE = 2;
var ChunkedStreamTargetWriter = class extends Writer {
  constructor(target) {
    super();
    this.pos = 0;
    /**
     * The data is divided up into fixed-size chunks, whose contents are first filled in RAM and then flushed out.
     * A chunk is flushed if all of its contents have been written.
     */
    this.chunks = [];
    this.lastFlushEnd = 0;
    this.writer = null;
    this.flushedChunkQueue = [];
    this.target = target;
    this.chunkSize = target._options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    if (!Number.isInteger(this.chunkSize) || this.chunkSize < 2 ** 10) {
      throw new Error("Invalid StreamTarget options: chunkSize must be an integer not smaller than 1024.");
    }
  }
  start() {
    this.writer = this.target._writable.getWriter();
  }
  write(data) {
    this.writeDataIntoChunks(data, this.pos);
    this.queueChunksForFlush();
    this.pos += data.byteLength;
  }
  seek(newPos) {
    this.pos = newPos;
  }
  getPos() {
    return this.pos;
  }
  writeDataIntoChunks(data, position) {
    let chunkIndex = this.chunks.findIndex((x) => x.start <= position && position < x.start + this.chunkSize);
    if (chunkIndex === -1) chunkIndex = this.createChunk(position);
    const chunk = this.chunks[chunkIndex];
    const relativePosition = position - chunk.start;
    const toWrite = data.subarray(0, Math.min(this.chunkSize - relativePosition, data.byteLength));
    chunk.data.set(toWrite, relativePosition);
    const section = {
      start: relativePosition,
      end: relativePosition + toWrite.byteLength
    };
    this.insertSectionIntoChunk(chunk, section);
    if (chunk.written[0].start === 0 && chunk.written[0].end === this.chunkSize) {
      chunk.shouldFlush = true;
    }
    if (this.chunks.length > MAX_CHUNKS_AT_ONCE) {
      for (let i = 0; i < this.chunks.length - 1; i++) {
        this.chunks[i].shouldFlush = true;
      }
      this.queueChunksForFlush();
    }
    if (toWrite.byteLength < data.byteLength) {
      this.writeDataIntoChunks(data.subarray(toWrite.byteLength), position + toWrite.byteLength);
    }
  }
  insertSectionIntoChunk(chunk, section) {
    let low = 0;
    let high = chunk.written.length - 1;
    let index = -1;
    while (low <= high) {
      const mid = Math.floor(low + (high - low + 1) / 2);
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
  createChunk(includesPosition) {
    const start = Math.floor(includesPosition / this.chunkSize) * this.chunkSize;
    const chunk = {
      start,
      data: new Uint8Array(this.chunkSize),
      written: [],
      shouldFlush: false
    };
    this.chunks.push(chunk);
    this.chunks.sort((a, b) => a.start - b.start);
    return this.chunks.indexOf(chunk);
  }
  queueChunksForFlush(force = false) {
    assert(this.writer);
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      if (!chunk.shouldFlush && !force) continue;
      for (const section of chunk.written) {
        if (this.ensureMonotonicity && chunk.start + section.start !== this.lastFlushEnd) {
          throw new Error("Internal error: Monotonicity violation.");
        }
        this.flushedChunkQueue.push({
          type: "write",
          data: chunk.data.subarray(section.start, section.end),
          position: chunk.start + section.start
        });
        this.lastFlushEnd = chunk.start + section.end;
      }
      this.chunks.splice(i--, 1);
    }
  }
  async flush() {
    assert(this.writer);
    if (this.flushedChunkQueue.length === 0) return;
    for (const chunk of this.flushedChunkQueue) {
      if (this.writer.desiredSize !== null && this.writer.desiredSize <= 0) {
        await this.writer.ready;
      }
      void this.writer.write(chunk);
    }
    this.flushedChunkQueue.length = 0;
  }
  async finalize() {
    assert(this.writer);
    this.queueChunksForFlush(true);
    await this.flush();
    return this.writer.close();
  }
};

// src/target.ts
var Target = class {
  constructor() {
    /** @internal */
    this._output = null;
  }
};
var ArrayBufferTarget = class extends Target {
  constructor() {
    super(...arguments);
    this.buffer = null;
  }
  /** @internal */
  _createWriter() {
    return new ArrayBufferTargetWriter(this);
  }
};
var StreamTarget = class extends Target {
  constructor(writable, options = {}) {
    super();
    if (!(writable instanceof WritableStream)) {
      throw new TypeError("StreamTarget requires a WritableStream instance.");
    }
    if (options != null && typeof options !== "object") {
      throw new TypeError("StreamTarget options, when provided, must be an object.");
    }
    if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
      throw new TypeError("options.chunked, when provided, must be a boolean.");
    }
    if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
      throw new TypeError("options.chunkSize, when provided, must be a positive integer.");
    }
    this._writable = writable;
    this._options = options;
  }
  /** @internal */
  _createWriter() {
    return this._options.chunked ? new ChunkedStreamTargetWriter(this) : new StreamTargetWriter(this);
  }
};

// src/codec.ts
var VIDEO_CODECS = ["avc", "hevc", "vp8", "vp9", "av1"];
var AUDIO_CODECS = ["aac", "opus"];
var SUBTITLE_CODECS = ["webvtt"];
var AVC_LEVEL_TABLE = [
  { maxMacroblocks: 99, maxBitrate: 64e3, level: 10 },
  // Level 1
  { maxMacroblocks: 396, maxBitrate: 192e3, level: 11 },
  // Level 1.1
  { maxMacroblocks: 396, maxBitrate: 384e3, level: 12 },
  // Level 1.2
  { maxMacroblocks: 396, maxBitrate: 768e3, level: 13 },
  // Level 1.3
  { maxMacroblocks: 396, maxBitrate: 2e6, level: 20 },
  // Level 2
  { maxMacroblocks: 792, maxBitrate: 4e6, level: 21 },
  // Level 2.1
  { maxMacroblocks: 1620, maxBitrate: 4e6, level: 22 },
  // Level 2.2
  { maxMacroblocks: 1620, maxBitrate: 1e7, level: 30 },
  // Level 3
  { maxMacroblocks: 3600, maxBitrate: 14e6, level: 31 },
  // Level 3.1
  { maxMacroblocks: 5120, maxBitrate: 2e7, level: 32 },
  // Level 3.2
  { maxMacroblocks: 8192, maxBitrate: 2e7, level: 40 },
  // Level 4
  { maxMacroblocks: 8192, maxBitrate: 5e7, level: 41 },
  // Level 4.1
  { maxMacroblocks: 8704, maxBitrate: 5e7, level: 42 },
  // Level 4.2
  { maxMacroblocks: 22080, maxBitrate: 135e6, level: 50 },
  // Level 5
  { maxMacroblocks: 36864, maxBitrate: 24e7, level: 51 },
  // Level 5.1
  { maxMacroblocks: 36864, maxBitrate: 24e7, level: 52 },
  // Level 5.2
  { maxMacroblocks: 139264, maxBitrate: 24e7, level: 60 },
  // Level 6
  { maxMacroblocks: 139264, maxBitrate: 48e7, level: 61 },
  // Level 6.1
  { maxMacroblocks: 139264, maxBitrate: 8e8, level: 62 }
  // Level 6.2
];
var HEVC_LEVEL_TABLE = [
  { maxPictureSize: 36864, maxBitrate: 128e3, tier: "L", level: 30 },
  // Level 1 (Low Tier)
  { maxPictureSize: 122880, maxBitrate: 15e5, tier: "L", level: 60 },
  // Level 2 (Low Tier)
  { maxPictureSize: 245760, maxBitrate: 3e6, tier: "L", level: 63 },
  // Level 2.1 (Low Tier)
  { maxPictureSize: 552960, maxBitrate: 6e6, tier: "L", level: 90 },
  // Level 3 (Low Tier)
  { maxPictureSize: 983040, maxBitrate: 1e7, tier: "L", level: 93 },
  // Level 3.1 (Low Tier)
  { maxPictureSize: 2228224, maxBitrate: 12e6, tier: "L", level: 120 },
  // Level 4 (Low Tier)
  { maxPictureSize: 2228224, maxBitrate: 3e7, tier: "H", level: 120 },
  // Level 4 (High Tier)
  { maxPictureSize: 2228224, maxBitrate: 2e7, tier: "L", level: 123 },
  // Level 4.1 (Low Tier)
  { maxPictureSize: 2228224, maxBitrate: 5e7, tier: "H", level: 123 },
  // Level 4.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 25e6, tier: "L", level: 150 },
  // Level 5 (Low Tier)
  { maxPictureSize: 8912896, maxBitrate: 1e8, tier: "H", level: 150 },
  // Level 5 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 4e7, tier: "L", level: 153 },
  // Level 5.1 (Low Tier)
  { maxPictureSize: 8912896, maxBitrate: 16e7, tier: "H", level: 153 },
  // Level 5.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 6e7, tier: "L", level: 156 },
  // Level 5.2 (Low Tier)
  { maxPictureSize: 8912896, maxBitrate: 24e7, tier: "H", level: 156 },
  // Level 5.2 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 6e7, tier: "L", level: 180 },
  // Level 6 (Low Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "H", level: 180 },
  // Level 6 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 12e7, tier: "L", level: 183 },
  // Level 6.1 (Low Tier)
  { maxPictureSize: 35651584, maxBitrate: 48e7, tier: "H", level: 183 },
  // Level 6.1 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "L", level: 186 },
  // Level 6.2 (Low Tier)
  { maxPictureSize: 35651584, maxBitrate: 8e8, tier: "H", level: 186 }
  // Level 6.2 (High Tier)
];
var VP9_LEVEL_TABLE = [
  { maxPictureSize: 36864, maxBitrate: 2e5, level: 10 },
  // Level 1
  { maxPictureSize: 73728, maxBitrate: 8e5, level: 11 },
  // Level 1.1
  { maxPictureSize: 122880, maxBitrate: 18e5, level: 20 },
  // Level 2
  { maxPictureSize: 245760, maxBitrate: 36e5, level: 21 },
  // Level 2.1
  { maxPictureSize: 552960, maxBitrate: 72e5, level: 30 },
  // Level 3
  { maxPictureSize: 983040, maxBitrate: 12e6, level: 31 },
  // Level 3.1
  { maxPictureSize: 2228224, maxBitrate: 18e6, level: 40 },
  // Level 4
  { maxPictureSize: 2228224, maxBitrate: 3e7, level: 41 },
  // Level 4.1
  { maxPictureSize: 8912896, maxBitrate: 6e7, level: 50 },
  // Level 5
  { maxPictureSize: 8912896, maxBitrate: 12e7, level: 51 },
  // Level 5.1
  { maxPictureSize: 8912896, maxBitrate: 18e7, level: 52 },
  // Level 5.2
  { maxPictureSize: 35651584, maxBitrate: 18e7, level: 60 },
  // Level 6
  { maxPictureSize: 35651584, maxBitrate: 24e7, level: 61 },
  // Level 6.1
  { maxPictureSize: 35651584, maxBitrate: 48e7, level: 62 }
  // Level 6.2
];
var AV1_LEVEL_TABLE = [
  { maxPictureSize: 147456, maxBitrate: 15e5, tier: "M", level: 0 },
  // Level 2.0 (Main Tier)
  { maxPictureSize: 278784, maxBitrate: 3e6, tier: "M", level: 1 },
  // Level 2.1 (Main Tier)
  { maxPictureSize: 665856, maxBitrate: 6e6, tier: "M", level: 4 },
  // Level 3.0 (Main Tier)
  { maxPictureSize: 1065024, maxBitrate: 1e7, tier: "M", level: 5 },
  // Level 3.1 (Main Tier)
  { maxPictureSize: 2359296, maxBitrate: 12e6, tier: "M", level: 8 },
  // Level 4.0 (Main Tier)
  { maxPictureSize: 2359296, maxBitrate: 3e7, tier: "H", level: 8 },
  // Level 4.0 (High Tier)
  { maxPictureSize: 2359296, maxBitrate: 2e7, tier: "M", level: 9 },
  // Level 4.1 (Main Tier)
  { maxPictureSize: 2359296, maxBitrate: 5e7, tier: "H", level: 9 },
  // Level 4.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 3e7, tier: "M", level: 12 },
  // Level 5.0 (Main Tier)
  { maxPictureSize: 8912896, maxBitrate: 1e8, tier: "H", level: 12 },
  // Level 5.0 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 4e7, tier: "M", level: 13 },
  // Level 5.1 (Main Tier)
  { maxPictureSize: 8912896, maxBitrate: 16e7, tier: "H", level: 13 },
  // Level 5.1 (High Tier)
  { maxPictureSize: 8912896, maxBitrate: 6e7, tier: "M", level: 14 },
  // Level 5.2 (Main Tier)
  { maxPictureSize: 8912896, maxBitrate: 24e7, tier: "H", level: 14 },
  // Level 5.2 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 6e7, tier: "M", level: 15 },
  // Level 5.3 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "H", level: 15 },
  // Level 5.3 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 6e7, tier: "M", level: 16 },
  // Level 6.0 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 24e7, tier: "H", level: 16 },
  // Level 6.0 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 1e8, tier: "M", level: 17 },
  // Level 6.1 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 48e7, tier: "H", level: 17 },
  // Level 6.1 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 16e7, tier: "M", level: 18 },
  // Level 6.2 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 8e8, tier: "H", level: 18 },
  // Level 6.2 (High Tier)
  { maxPictureSize: 35651584, maxBitrate: 16e7, tier: "M", level: 19 },
  // Level 6.3 (Main Tier)
  { maxPictureSize: 35651584, maxBitrate: 8e8, tier: "H", level: 19 }
  // Level 6.3 (High Tier)
];
var buildVideoCodecString = (codec, width, height, bitrate) => {
  if (codec === "avc") {
    const profileIndication = 100;
    const totalMacroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
    const levelInfo = AVC_LEVEL_TABLE.find(
      (level) => totalMacroblocks <= level.maxMacroblocks && bitrate <= level.maxBitrate
    ) ?? last(AVC_LEVEL_TABLE);
    const levelIndication = levelInfo ? levelInfo.level : 0;
    const hexProfileIndication = profileIndication.toString(16).padStart(2, "0");
    const hexProfileCompatibility = "00";
    const hexLevelIndication = levelIndication.toString(16).padStart(2, "0");
    return `avc1.${hexProfileIndication}${hexProfileCompatibility}${hexLevelIndication}`;
  } else if (codec === "hevc") {
    const profilePrefix = "";
    const profileIdc = 1;
    const compatibilityFlags = "6";
    const pictureSize = width * height;
    const levelInfo = HEVC_LEVEL_TABLE.find(
      (level) => pictureSize <= level.maxPictureSize && bitrate <= level.maxBitrate
    ) ?? last(HEVC_LEVEL_TABLE);
    const constraintFlags = "B0";
    return `hev1.${profilePrefix}${profileIdc}.${compatibilityFlags}.${levelInfo.tier}${levelInfo.level}.${constraintFlags}`;
  } else if (codec === "vp8") {
    return "vp8";
  } else if (codec === "vp9") {
    const profile = "00";
    const pictureSize = width * height;
    const levelInfo = VP9_LEVEL_TABLE.find(
      (level) => pictureSize <= level.maxPictureSize && bitrate <= level.maxBitrate
    ) ?? last(VP9_LEVEL_TABLE);
    const bitDepth = "08";
    return `vp09.${profile}.${levelInfo.level}.${bitDepth}`;
  } else if (codec === "av1") {
    const profile = 0;
    const pictureSize = width * height;
    const levelInfo = AV1_LEVEL_TABLE.find(
      (level) => pictureSize <= level.maxPictureSize && bitrate <= level.maxBitrate
    ) ?? last(AV1_LEVEL_TABLE);
    const bitDepth = "08";
    return `av01.${profile}.${levelInfo.level.toString().padStart(2, "0")}${levelInfo.tier}.${bitDepth}`;
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var extractVideoCodecString = (codec, description) => {
  if (codec === "avc") {
    if (!description || description.byteLength < 4) {
      throw new TypeError("AVC description must be at least 4 bytes long.");
    }
    return `avc1.${bytesToHexString(description.subarray(1, 4))}`;
  } else if (codec === "hevc") {
    if (!description) {
      throw new TypeError("HEVC description must be provided.");
    }
    const view2 = new DataView(description.buffer, description.byteOffset, description.byteLength);
    let codecString = "hev1.";
    const generalProfileSpace = description[1] >> 6 & 3;
    const generalProfileIdc = description[1] & 31;
    codecString += ["", "A", "B", "C"][generalProfileSpace] + generalProfileIdc;
    codecString += ".";
    const compatibilityFlags = reverseBitsU32(view2.getUint32(2));
    codecString += compatibilityFlags.toString(16);
    codecString += ".";
    const generalTierFlag = description[1] >> 5 & 1;
    const generalLevelIdc = description[12];
    codecString += generalTierFlag === 0 ? "L" : "H";
    codecString += generalLevelIdc;
    codecString += ".";
    const constraintFlags = [];
    for (let i = 0; i < 6; i++) {
      const byte = description[i + 13];
      constraintFlags.push(byte);
    }
    while (constraintFlags[constraintFlags.length - 1] === 0) {
      constraintFlags.pop();
    }
    codecString += constraintFlags.map((x) => x.toString(16)).join(".");
    return codecString;
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
var extractAudioCodecString = (codec, description) => {
  if (codec === "aac") {
    const audioSpecificConfig = parseAacAudioSpecificConfig(description);
    return `mp4a.40.${audioSpecificConfig.objectType}`;
  } else if (codec === "opus") {
    return "opus";
  } else if (codec === "vorbis") {
    return "vorbis";
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var parseAacAudioSpecificConfig = (bytes2) => {
  if (!bytes2 || bytes2.byteLength < 2) {
    throw new TypeError("AAC description must be at least 2 bytes long.");
  }
  let bitOffset = 0;
  let objectType = readBits(bytes2, bitOffset, bitOffset + 5);
  bitOffset += 5;
  if (objectType === 31) {
    objectType = 32 + readBits(bytes2, bitOffset, bitOffset + 6);
    bitOffset += 6;
  }
  const frequencyIndex = readBits(bytes2, bitOffset, bitOffset + 4);
  bitOffset += 4;
  let sampleRate = null;
  if (frequencyIndex === 15) {
    sampleRate = readBits(bytes2, bitOffset, bitOffset + 24);
    bitOffset += 24;
  } else {
    const freqTable = [
      96e3,
      88200,
      64e3,
      48e3,
      44100,
      32e3,
      24e3,
      22050,
      16e3,
      12e3,
      11025,
      8e3,
      7350
    ];
    if (frequencyIndex < freqTable.length) {
      sampleRate = freqTable[frequencyIndex];
    }
  }
  const channelConfiguration = readBits(bytes2, bitOffset, bitOffset + 4);
  bitOffset += 4;
  let numberOfChannels = null;
  if (channelConfiguration >= 1 && channelConfiguration <= 7) {
    const channelMap = {
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      7: 8
    };
    numberOfChannels = channelMap[channelConfiguration];
  }
  return {
    objectType,
    frequencyIndex,
    sampleRate,
    channelConfiguration,
    numberOfChannels
  };
};
var getVideoEncoderConfigExtension = (codec) => {
  if (codec === "avc") {
    return {
      avc: {
        format: "avc"
        // Ensure the format is not Annex B
      }
    };
  } else if (codec === "hevc") {
    return {
      hevc: {
        format: "hevc"
        // Ensure the format is not Annex B
      }
    };
  }
  return {};
};
var getAudioEncoderConfigExtension = (codec) => {
  if (codec === "aac") {
    return {
      aac: {
        format: "aac"
        // Ensure the format is not ADTS
      }
    };
  } else if (codec === "opus") {
    return {
      opus: {
        format: "opus"
      }
    };
  }
  return {};
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
    throw new TypeError(
      "Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer)."
    );
  }
  if (!Number.isInteger(metadata.decoderConfig.codedHeight) || metadata.decoderConfig.codedHeight <= 0) {
    throw new TypeError(
      "Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer)."
    );
  }
  if (metadata.decoderConfig.description !== void 0) {
    if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
      throw new TypeError(
        "Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view."
      );
    }
  }
  if (metadata.decoderConfig.colorSpace !== void 0) {
    const { colorSpace } = metadata.decoderConfig;
    if (typeof colorSpace !== "object") {
      throw new TypeError(
        "Video chunk metadata decoder configuration colorSpace, when provided, must be an object."
      );
    }
    const primariesValues = Object.keys(COLOR_PRIMARIES_MAP);
    if (colorSpace.primaries != null && !primariesValues.includes(colorSpace.primaries)) {
      throw new TypeError(
        `Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of ${primariesValues.join(", ")}.`
      );
    }
    const transferValues = Object.keys(TRANSFER_CHARACTERISTICS_MAP);
    if (colorSpace.transfer != null && !transferValues.includes(colorSpace.transfer)) {
      throw new TypeError(
        `Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of ${transferValues.join(", ")}.`
      );
    }
    const matrixValues = Object.keys(MATRIX_COEFFICIENTS_MAP);
    if (colorSpace.matrix != null && !matrixValues.includes(colorSpace.matrix)) {
      throw new TypeError(
        `Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of ${matrixValues.join(", ")}.`
      );
    }
    if (colorSpace.fullRange != null && typeof colorSpace.fullRange !== "boolean") {
      throw new TypeError(
        "Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean."
      );
    }
  }
  if ((metadata.decoderConfig.codec.startsWith("avc1") || metadata.decoderConfig.codec.startsWith("avc3")) && !metadata.decoderConfig.description) {
    throw new TypeError(
      "Video chunk metadata decoder configuration for AVC must include a description, which is expected to be an AVCDecoderConfigurationRecord as specified in ISO 14496-15."
    );
  }
  if ((metadata.decoderConfig.codec.startsWith("hev1") || metadata.decoderConfig.codec.startsWith("hvc1")) && !metadata.decoderConfig.description) {
    throw new TypeError(
      "Video chunk metadata decoder configuration for HEVC must include a description, which is expected to be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15."
    );
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
    throw new TypeError(
      "Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer)."
    );
  }
  if (!Number.isInteger(metadata.decoderConfig.numberOfChannels) || metadata.decoderConfig.numberOfChannels <= 0) {
    throw new TypeError(
      "Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer)."
    );
  }
  if (metadata.decoderConfig.description !== void 0) {
    if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
      throw new TypeError(
        "Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view."
      );
    }
  }
  if (metadata.decoderConfig.codec.startsWith("mp4a") && !metadata.decoderConfig.description) {
    throw new TypeError(
      "Audio chunk metadata decoder configuration for AAC must include a description, which is expected to be an AudioSpecificConfig as specified in ISO 14496-3."
    );
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

// src/isobmff/isobmff-muxer.ts
var GLOBAL_TIMESCALE = 1e3;
var TIMESTAMP_OFFSET = 2082844800;
var intoTimescale = (timeInSeconds, timescale, round = true) => {
  const value = timeInSeconds * timescale;
  return round ? Math.round(value) : value;
};
var IsobmffMuxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.timestampsMustStartAtZero = true;
    this.auxTarget = new ArrayBufferTarget();
    this.auxWriter = this.auxTarget._createWriter();
    this.auxBoxWriter = new IsobmffBoxWriter(this.auxWriter);
    this.ftypSize = null;
    this.mdat = null;
    this.trackDatas = [];
    this.creationTime = Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET;
    this.finalizedChunks = [];
    this.nextFragmentNumber = 1;
    this.writer = output._writer;
    this.boxWriter = new IsobmffBoxWriter(this.writer);
    const fastStartDefault = this.writer instanceof ArrayBufferTargetWriter ? "in-memory" : false;
    this.fastStart = format._options.fastStart ?? fastStartDefault;
    if (this.fastStart === "in-memory" || this.fastStart === "fragmented") {
      this.writer.ensureMonotonicity = true;
    }
  }
  async start() {
    const release = await this.mutex.acquire();
    const holdsAvc = this.output._tracks.some((x) => x.type === "video" && x.source._codec === "avc");
    this.boxWriter.writeBox(ftyp({
      holdsAvc,
      fragmented: this.fastStart === "fragmented"
    }));
    this.ftypSize = this.writer.getPos();
    if (this.fastStart === "in-memory") {
      this.mdat = mdat(false);
    } else if (this.fastStart === "fragmented") {
    } else {
      this.mdat = mdat(true);
      this.boxWriter.writeBox(this.mdat);
    }
    await this.writer.flush();
    release();
  }
  getVideoTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
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
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    return newTrackData;
  }
  getAudioTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
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
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    return newTrackData;
  }
  getSubtitleTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
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
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    this.validateAndNormalizeTimestamp(track, 0, true);
    return newTrackData;
  }
  async addEncodedVideoChunk(track, chunk, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getVideoTrackData(track, meta);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const timestamp = this.validateAndNormalizeTimestamp(
        trackData.track,
        chunk.timestamp,
        chunk.type === "key"
      );
      const sample = this.createSampleForTrack(
        trackData,
        data,
        timestamp,
        (chunk.duration ?? 0) / 1e6,
        chunk.type
      );
      await this.registerSample(trackData, sample);
    } finally {
      release();
    }
  }
  async addEncodedAudioChunk(track, chunk, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getAudioTrackData(track, meta);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const chunkType = chunk.type;
      const timestamp = this.validateAndNormalizeTimestamp(
        trackData.track,
        chunk.timestamp,
        chunkType === "key"
      );
      const sample = this.createSampleForTrack(
        trackData,
        data,
        timestamp,
        (chunk.duration ?? 0) / 1e6,
        chunkType
      );
      await this.registerSample(trackData, sample);
    } finally {
      release();
    }
  }
  async addSubtitleCue(track, cue, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getSubtitleTrackData(track, meta);
      this.validateAndNormalizeTimestamp(trackData.track, 1e6 * cue.timestamp, true);
      if (track.source._codec === "webvtt") {
        trackData.cueQueue.push(cue);
        await this.processWebVTTCues(trackData, cue.timestamp);
      } else {
      }
    } finally {
      release();
    }
  }
  async processWebVTTCues(trackData, until) {
    while (trackData.cueQueue.length > 0) {
      const timestamps = /* @__PURE__ */ new Set([]);
      for (const cue of trackData.cueQueue) {
        assert(cue.timestamp <= until);
        assert(trackData.lastCueEndTimestamp <= cue.timestamp + cue.duration);
        timestamps.add(Math.max(cue.timestamp, trackData.lastCueEndTimestamp));
        timestamps.add(cue.timestamp + cue.duration);
      }
      const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
      const sampleStart = sortedTimestamps[0];
      const sampleEnd = sortedTimestamps[1] ?? sampleStart;
      if (until < sampleEnd) {
        break;
      }
      if (trackData.lastCueEndTimestamp < sampleStart) {
        this.auxWriter.seek(0);
        const box2 = vtte();
        this.auxBoxWriter.writeBox(box2);
        const body2 = this.auxWriter.getSlice(0, this.auxWriter.getPos());
        const sample2 = this.createSampleForTrack(
          trackData,
          body2,
          trackData.lastCueEndTimestamp,
          sampleStart - trackData.lastCueEndTimestamp,
          "key"
        );
        await this.registerSample(trackData, sample2);
        trackData.lastCueEndTimestamp = sampleStart;
      }
      this.auxWriter.seek(0);
      for (let i = 0; i < trackData.cueQueue.length; i++) {
        const cue = trackData.cueQueue[i];
        if (cue.timestamp >= sampleEnd) {
          break;
        }
        inlineTimestampRegex.lastIndex = 0;
        const containsTimestamp = inlineTimestampRegex.test(cue.text);
        const endTimestamp = cue.timestamp + cue.duration;
        let sourceId = trackData.cueToSourceId.get(cue);
        if (sourceId === void 0 && sampleEnd < endTimestamp) {
          sourceId = trackData.nextSourceId++;
          trackData.cueToSourceId.set(cue, sourceId);
        }
        if (cue.notes) {
          const box3 = vtta(cue.notes);
          this.auxBoxWriter.writeBox(box3);
        }
        const box2 = vttc(
          cue.text,
          containsTimestamp ? sampleStart : null,
          cue.identifier ?? null,
          cue.settings ?? null,
          sourceId ?? null
        );
        this.auxBoxWriter.writeBox(box2);
        if (endTimestamp === sampleEnd) {
          trackData.cueQueue.splice(i--, 1);
        }
      }
      const body = this.auxWriter.getSlice(0, this.auxWriter.getPos());
      const sample = this.createSampleForTrack(trackData, body, sampleStart, sampleEnd - sampleStart, "key");
      await this.registerSample(trackData, sample);
      trackData.lastCueEndTimestamp = sampleEnd;
    }
  }
  createSampleForTrack(trackData, data, timestamp, duration, type) {
    const sample = {
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
  processTimestamps(trackData) {
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
        const timescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
        const delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
        trackData.lastTimescaleUnits += delta;
        trackData.lastSample.timescaleUnitsToNextSample = delta;
        if (this.fastStart !== "fragmented") {
          let lastTableEntry = last(trackData.timeToSampleTable);
          assert(lastTableEntry);
          if (lastTableEntry.sampleCount === 1) {
            lastTableEntry.sampleDelta = delta;
            const entryBefore = trackData.timeToSampleTable[trackData.timeToSampleTable.length - 2];
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
        if (this.fastStart !== "fragmented") {
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
  async registerSample(trackData, sample) {
    if (this.fastStart === "fragmented") {
      trackData.sampleQueue.push(sample);
      await this.interleaveSamples();
    } else {
      await this.addSampleToTrack(trackData, sample);
    }
  }
  async addSampleToTrack(trackData, sample) {
    if (sample.type === "key") {
      this.processTimestamps(trackData);
    }
    if (this.fastStart !== "fragmented") {
      trackData.samples.push(sample);
    }
    let beginNewChunk = false;
    if (!trackData.currentChunk) {
      beginNewChunk = true;
    } else {
      const currentChunkDuration = sample.timestamp - trackData.currentChunk.startTimestamp;
      if (this.fastStart === "fragmented") {
        const keyFrameQueuedEverywhere = this.trackDatas.every((otherTrackData) => {
          if (trackData === otherTrackData) {
            return sample.type === "key";
          }
          const firstQueuedSample = otherTrackData.sampleQueue[0];
          return firstQueuedSample && firstQueuedSample.type === "key";
        });
        if (currentChunkDuration >= 1 && keyFrameQueuedEverywhere) {
          beginNewChunk = true;
          await this.finalizeFragment();
        }
      } else {
        beginNewChunk = currentChunkDuration >= 0.5;
      }
    }
    if (beginNewChunk) {
      if (trackData.currentChunk) {
        await this.finalizeCurrentChunk(trackData);
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
  async finalizeCurrentChunk(trackData) {
    assert(this.fastStart !== "fragmented");
    if (!trackData.currentChunk) return;
    trackData.finalizedChunks.push(trackData.currentChunk);
    this.finalizedChunks.push(trackData.currentChunk);
    if (trackData.compactlyCodedChunkTable.length === 0 || last(trackData.compactlyCodedChunkTable).samplesPerChunk !== trackData.currentChunk.samples.length) {
      trackData.compactlyCodedChunkTable.push({
        firstChunk: trackData.finalizedChunks.length,
        // 1-indexed
        samplesPerChunk: trackData.currentChunk.samples.length
      });
    }
    if (this.fastStart === "in-memory") {
      trackData.currentChunk.offset = 0;
      return;
    }
    trackData.currentChunk.offset = this.writer.getPos();
    for (const sample of trackData.currentChunk.samples) {
      assert(sample.data);
      this.writer.write(sample.data);
      sample.data = null;
    }
    await this.writer.flush();
  }
  async interleaveSamples() {
    assert(this.fastStart === "fragmented");
    for (const track of this.output._tracks) {
      if (!track.source._closed && !this.trackDatas.some((x) => x.track === track)) {
        return;
      }
    }
    outer:
      while (true) {
        let trackWithMinTimestamp = null;
        let minTimestamp = Infinity;
        for (const trackData of this.trackDatas) {
          if (trackData.sampleQueue.length === 0 && !trackData.track.source._closed) {
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
        const sample = trackWithMinTimestamp.sampleQueue.shift();
        await this.addSampleToTrack(trackWithMinTimestamp, sample);
      }
  }
  async finalizeFragment(flushWriter = true) {
    assert(this.fastStart === "fragmented");
    const fragmentNumber = this.nextFragmentNumber++;
    if (fragmentNumber === 1) {
      const movieBox = moov(this.trackDatas, this.creationTime, true);
      this.boxWriter.writeBox(movieBox);
    }
    const tracksInFragment = this.trackDatas.filter((x) => x.currentChunk);
    const moofOffset = this.writer.getPos();
    const moofBox = moof(fragmentNumber, tracksInFragment);
    this.boxWriter.writeBox(moofBox);
    {
      const mdatBox = mdat(false);
      let totalTrackSampleSize = 0;
      for (const trackData of tracksInFragment) {
        for (const sample of trackData.currentChunk.samples) {
          totalTrackSampleSize += sample.size;
        }
      }
      let mdatSize = this.boxWriter.measureBox(mdatBox) + totalTrackSampleSize;
      if (mdatSize >= 2 ** 32) {
        mdatBox.largeSize = true;
        mdatSize = this.boxWriter.measureBox(mdatBox) + totalTrackSampleSize;
      }
      mdatBox.size = mdatSize;
      this.boxWriter.writeBox(mdatBox);
    }
    for (const trackData of tracksInFragment) {
      trackData.currentChunk.offset = this.writer.getPos();
      trackData.currentChunk.moofOffset = moofOffset;
      for (const sample of trackData.currentChunk.samples) {
        this.writer.write(sample.data);
        sample.data = null;
      }
    }
    const endPos = this.writer.getPos();
    this.writer.seek(this.boxWriter.offsets.get(moofBox));
    const newMoofBox = moof(fragmentNumber, tracksInFragment);
    this.boxWriter.writeBox(newMoofBox);
    this.writer.seek(endPos);
    for (const trackData of tracksInFragment) {
      trackData.finalizedChunks.push(trackData.currentChunk);
      this.finalizedChunks.push(trackData.currentChunk);
      trackData.currentChunk = null;
    }
    if (flushWriter) {
      await this.writer.flush();
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async onTrackClose(track) {
    const release = await this.mutex.acquire();
    if (track.type === "subtitle" && track.source._codec === "webvtt") {
      const trackData = this.trackDatas.find((x) => x.track === track);
      if (trackData) {
        await this.processWebVTTCues(trackData, Infinity);
      }
    }
    if (this.fastStart === "fragmented") {
      await this.interleaveSamples();
    }
    release();
  }
  /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
  async finalize() {
    const release = await this.mutex.acquire();
    for (const trackData of this.trackDatas) {
      if (trackData.type === "subtitle" && trackData.track.source._codec === "webvtt") {
        await this.processWebVTTCues(trackData, Infinity);
      }
    }
    if (this.fastStart === "fragmented") {
      for (const trackData of this.trackDatas) {
        for (const sample of trackData.sampleQueue) {
          await this.addSampleToTrack(trackData, sample);
        }
        this.processTimestamps(trackData);
      }
      await this.finalizeFragment(false);
    } else {
      for (const trackData of this.trackDatas) {
        this.processTimestamps(trackData);
        await this.finalizeCurrentChunk(trackData);
      }
    }
    if (this.fastStart === "in-memory") {
      assert(this.mdat);
      let mdatSize;
      for (let i = 0; i < 2; i++) {
        const movieBox2 = moov(this.trackDatas, this.creationTime);
        const movieBoxSize = this.boxWriter.measureBox(movieBox2);
        mdatSize = this.boxWriter.measureBox(this.mdat);
        let currentChunkPos = this.writer.getPos() + movieBoxSize + mdatSize;
        for (const chunk of this.finalizedChunks) {
          chunk.offset = currentChunkPos;
          for (const { data } of chunk.samples) {
            assert(data);
            currentChunkPos += data.byteLength;
            mdatSize += data.byteLength;
          }
        }
        if (currentChunkPos < 2 ** 32) break;
        if (mdatSize >= 2 ** 32) this.mdat.largeSize = true;
      }
      const movieBox = moov(this.trackDatas, this.creationTime);
      this.boxWriter.writeBox(movieBox);
      this.mdat.size = mdatSize;
      this.boxWriter.writeBox(this.mdat);
      for (const chunk of this.finalizedChunks) {
        for (const sample of chunk.samples) {
          assert(sample.data);
          this.writer.write(sample.data);
          sample.data = null;
        }
      }
    } else if (this.fastStart === "fragmented") {
      const startPos = this.writer.getPos();
      const mfraBox = mfra(this.trackDatas);
      this.boxWriter.writeBox(mfraBox);
      const mfraBoxSize = this.writer.getPos() - startPos;
      this.writer.seek(this.writer.getPos() - 4);
      this.boxWriter.writeU32(mfraBoxSize);
    } else {
      assert(this.mdat);
      assert(this.ftypSize !== null);
      const mdatPos = this.boxWriter.offsets.get(this.mdat);
      assert(mdatPos !== void 0);
      const mdatSize = this.writer.getPos() - mdatPos;
      this.mdat.size = mdatSize;
      this.mdat.largeSize = mdatSize >= 2 ** 32;
      this.boxWriter.patchBox(this.mdat);
      const movieBox = moov(this.trackDatas, this.creationTime);
      if (typeof this.fastStart === "object") {
        this.writer.seek(this.ftypSize);
        this.boxWriter.writeBox(movieBox);
        const remainingBytes = mdatPos - this.writer.getPos();
        this.boxWriter.writeBox(free(remainingBytes));
      } else {
        this.boxWriter.writeBox(movieBox);
      }
    }
    release();
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

// src/matroska/matroska-muxer.ts
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
    this.helper = new Uint8Array(8);
    this.helperView = new DataView(this.helper.buffer);
    /**
     * Stores the position from the start of the file to where EBML elements have been written. This is used to
     * rewrite/edit elements that were already added before, and to measure sizes of things.
     */
    this.offsets = /* @__PURE__ */ new WeakMap();
    /** Same as offsets, but stores position where the element's data starts (after ID and size fields). */
    this.dataOffsets = /* @__PURE__ */ new WeakMap();
    this.trackDatas = [];
    this.segment = null;
    this.segmentInfo = null;
    this.seekHead = null;
    this.tracksElement = null;
    this.segmentDuration = null;
    this.cues = null;
    this.currentCluster = null;
    this.currentClusterMsTimestamp = null;
    this.trackDatasInCurrentCluster = /* @__PURE__ */ new Set();
    this.duration = 0;
    this.writer = output._writer;
    this.format = format;
    if (this.format._options.streamable) {
      this.writer.ensureMonotonicity = true;
    }
  }
  writeByte(value) {
    this.helperView.setUint8(0, value);
    this.writer.write(this.helper.subarray(0, 1));
  }
  writeFloat32(value) {
    this.helperView.setFloat32(0, value, false);
    this.writer.write(this.helper.subarray(0, 4));
  }
  writeFloat64(value) {
    this.helperView.setFloat64(0, value, false);
    this.writer.write(this.helper);
  }
  writeUnsignedInt(value, width = measureUnsignedInt(value)) {
    let pos = 0;
    switch (width) {
      case 6:
        this.helperView.setUint8(pos++, value / 2 ** 40 | 0);
      // eslint-disable-next-line no-fallthrough
      case 5:
        this.helperView.setUint8(pos++, value / 2 ** 32 | 0);
      // eslint-disable-next-line no-fallthrough
      case 4:
        this.helperView.setUint8(pos++, value >> 24);
      // eslint-disable-next-line no-fallthrough
      case 3:
        this.helperView.setUint8(pos++, value >> 16);
      // eslint-disable-next-line no-fallthrough
      case 2:
        this.helperView.setUint8(pos++, value >> 8);
      // eslint-disable-next-line no-fallthrough
      case 1:
        this.helperView.setUint8(pos++, value);
        break;
      default:
        throw new Error("Bad UINT size " + width);
    }
    this.writer.write(this.helper.subarray(0, pos));
  }
  writeSignedInt(value, width = measureSignedInt(value)) {
    if (value < 0) {
      value += 2 ** (width * 8);
    }
    this.writeUnsignedInt(value, width);
  }
  writeEBMLVarInt(value, width = measureEBMLVarInt(value)) {
    let pos = 0;
    switch (width) {
      case 1:
        this.helperView.setUint8(pos++, 1 << 7 | value);
        break;
      case 2:
        this.helperView.setUint8(pos++, 1 << 6 | value >> 8);
        this.helperView.setUint8(pos++, value);
        break;
      case 3:
        this.helperView.setUint8(pos++, 1 << 5 | value >> 16);
        this.helperView.setUint8(pos++, value >> 8);
        this.helperView.setUint8(pos++, value);
        break;
      case 4:
        this.helperView.setUint8(pos++, 1 << 4 | value >> 24);
        this.helperView.setUint8(pos++, value >> 16);
        this.helperView.setUint8(pos++, value >> 8);
        this.helperView.setUint8(pos++, value);
        break;
      case 5:
        this.helperView.setUint8(pos++, 1 << 3 | value / 2 ** 32 & 7);
        this.helperView.setUint8(pos++, value >> 24);
        this.helperView.setUint8(pos++, value >> 16);
        this.helperView.setUint8(pos++, value >> 8);
        this.helperView.setUint8(pos++, value);
        break;
      case 6:
        this.helperView.setUint8(pos++, 1 << 2 | value / 2 ** 40 & 3);
        this.helperView.setUint8(pos++, value / 2 ** 32 | 0);
        this.helperView.setUint8(pos++, value >> 24);
        this.helperView.setUint8(pos++, value >> 16);
        this.helperView.setUint8(pos++, value >> 8);
        this.helperView.setUint8(pos++, value);
        break;
      default:
        throw new Error("Bad EBML VINT size " + width);
    }
    this.writer.write(this.helper.subarray(0, pos));
  }
  // Assumes the string is ASCII
  writeString(str) {
    this.writer.write(new Uint8Array(str.split("").map((x) => x.charCodeAt(0))));
  }
  writeEBML(data) {
    if (data === null) return;
    if (data instanceof Uint8Array) {
      this.writer.write(data);
    } else if (Array.isArray(data)) {
      for (const elem of data) {
        this.writeEBML(elem);
      }
    } else {
      this.offsets.set(data, this.writer.getPos());
      this.writeUnsignedInt(data.id);
      if (Array.isArray(data.data)) {
        const sizePos = this.writer.getPos();
        const sizeSize = data.size === -1 ? 1 : data.size ?? 4;
        if (data.size === -1) {
          this.writeByte(255);
        } else {
          this.writer.seek(this.writer.getPos() + sizeSize);
        }
        const startPos = this.writer.getPos();
        this.dataOffsets.set(data, startPos);
        this.writeEBML(data.data);
        if (data.size !== -1) {
          const size = this.writer.getPos() - startPos;
          const endPos = this.writer.getPos();
          this.writer.seek(sizePos);
          this.writeEBMLVarInt(size, sizeSize);
          this.writer.seek(endPos);
        }
      } else if (typeof data.data === "number") {
        const size = data.size ?? measureUnsignedInt(data.data);
        this.writeEBMLVarInt(size);
        this.writeUnsignedInt(data.data, size);
      } else if (typeof data.data === "string") {
        this.writeEBMLVarInt(data.data.length);
        this.writeString(data.data);
      } else if (data.data instanceof Uint8Array) {
        this.writeEBMLVarInt(data.data.byteLength, data.size);
        this.writer.write(data.data);
      } else if (data.data instanceof EBMLFloat32) {
        this.writeEBMLVarInt(4);
        this.writeFloat32(data.data.value);
      } else if (data.data instanceof EBMLFloat64) {
        this.writeEBMLVarInt(8);
        this.writeFloat64(data.data.value);
      } else if (data.data instanceof EBMLSignedInt) {
        const size = data.size ?? measureSignedInt(data.data.value);
        this.writeEBMLVarInt(size);
        this.writeSignedInt(data.data.value, size);
      }
    }
  }
  beforeTrackAdd(track) {
    if (!(this.format instanceof WebMOutputFormat)) {
      return;
    }
    if (track.type === "video") {
      if (!["vp8", "vp9", "av1"].includes(track.source._codec)) {
        throw new Error(
          `WebM only supports VP8, VP9 and AV1 as video codecs. Switching to MKV removes this restriction.`
        );
      }
    } else if (track.type === "audio") {
      if (!["opus", "vorbis"].includes(track.source._codec)) {
        throw new Error(
          `WebM only supports Opus and Vorbis as audio codecs. Switching to MKV removes this restriction.`
        );
      }
    } else if (track.type === "subtitle") {
      if (track.source._codec !== "webvtt") {
        throw new Error(
          `WebM only supports WebVTT as subtitle codec. Switching to MKV removes this restriction.`
        );
      }
    } else {
      throw new Error(
        "WebM only supports video, audio and subtitle tracks. Switching to MKV removes this restriction."
      );
    }
  }
  async start() {
    const release = await this.mutex.acquire();
    this.writeEBMLHeader();
    if (!this.format._options.streamable) {
      this.createSeekHead();
    }
    this.createSegmentInfo();
    this.createCues();
    await this.writer.flush();
    release();
  }
  writeEBMLHeader() {
    const ebmlHeader = { id: 440786851 /* EBML */, data: [
      { id: 17030 /* EBMLVersion */, data: 1 },
      { id: 17143 /* EBMLReadVersion */, data: 1 },
      { id: 17138 /* EBMLMaxIDLength */, data: 4 },
      { id: 17139 /* EBMLMaxSizeLength */, data: 8 },
      { id: 17026 /* DocType */, data: this.format instanceof WebMOutputFormat ? "webm" : "matroska" },
      { id: 17031 /* DocTypeVersion */, data: 2 },
      { id: 17029 /* DocTypeReadVersion */, data: 2 }
    ] };
    this.writeEBML(ebmlHeader);
  }
  /**
   * Creates a SeekHead element which is positioned near the start of the file and allows the media player to seek to
   * relevant sections more easily. Since we don't know the positions of those sections yet, we'll set them later.
   */
  createSeekHead() {
    const kaxCues = new Uint8Array([28, 83, 187, 107]);
    const kaxInfo = new Uint8Array([21, 73, 169, 102]);
    const kaxTracks = new Uint8Array([22, 84, 174, 107]);
    const seekHead = { id: 290298740 /* SeekHead */, data: [
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
    this.seekHead = seekHead;
  }
  createSegmentInfo() {
    const segmentDuration = { id: 17545 /* Duration */, data: new EBMLFloat64(0) };
    this.segmentDuration = segmentDuration;
    const segmentInfo = { id: 357149030 /* Info */, data: [
      { id: 2807729 /* TimestampScale */, data: 1e6 },
      { id: 19840 /* MuxingApp */, data: APP_NAME },
      { id: 22337 /* WritingApp */, data: APP_NAME },
      !this.format._options.streamable ? segmentDuration : null
    ] };
    this.segmentInfo = segmentInfo;
  }
  createTracks() {
    const tracksElement = { id: 374648427 /* Tracks */, data: [] };
    this.tracksElement = tracksElement;
    for (const trackData of this.trackDatas) {
      tracksElement.data.push({ id: 174 /* TrackEntry */, data: [
        { id: 215 /* TrackNumber */, data: trackData.track.id },
        { id: 29637 /* TrackUID */, data: trackData.track.id },
        { id: 131 /* TrackType */, data: TRACK_TYPE_MAP[trackData.type] },
        { id: 134 /* CodecID */, data: CODEC_STRING_MAP[trackData.track.source._codec] },
        trackData.type === "video" ? this.videoSpecificTrackInfo(trackData) : null,
        trackData.type === "audio" ? this.audioSpecificTrackInfo(trackData) : null,
        trackData.type === "subtitle" ? this.subtitleSpecificTrackInfo(trackData) : null
      ] });
    }
  }
  videoSpecificTrackInfo(trackData) {
    const elements = [
      trackData.info.decoderConfig.description ? {
        id: 25506 /* CodecPrivate */,
        data: toUint8Array(trackData.info.decoderConfig.description)
      } : null,
      trackData.track.metadata.frameRate ? {
        id: 2352003 /* DefaultDuration */,
        data: 1e9 / trackData.track.metadata.frameRate
      } : null
    ];
    const colorSpace = trackData.info.decoderConfig.colorSpace;
    const videoElement = { id: 224 /* Video */, data: [
      { id: 176 /* PixelWidth */, data: trackData.info.width },
      { id: 186 /* PixelHeight */, data: trackData.info.height },
      colorSpaceIsComplete(colorSpace) ? {
        id: 21936 /* Colour */,
        data: [
          {
            id: 21937 /* MatrixCoefficients */,
            data: MATRIX_COEFFICIENTS_MAP[colorSpace.matrix]
          },
          {
            id: 21946 /* TransferCharacteristics */,
            data: TRANSFER_CHARACTERISTICS_MAP[colorSpace.transfer]
          },
          {
            id: 21947 /* Primaries */,
            data: COLOR_PRIMARIES_MAP[colorSpace.primaries]
          },
          {
            id: 21945 /* Range */,
            data: colorSpace.fullRange ? 2 : 1
          }
        ]
      } : null
    ] };
    elements.push(videoElement);
    return elements;
  }
  audioSpecificTrackInfo(trackData) {
    return [
      trackData.info.decoderConfig.description ? {
        id: 25506 /* CodecPrivate */,
        data: toUint8Array(trackData.info.decoderConfig.description)
      } : null,
      { id: 225 /* Audio */, data: [
        { id: 181 /* SamplingFrequency */, data: new EBMLFloat32(trackData.info.sampleRate) },
        { id: 159 /* Channels */, data: trackData.info.numberOfChannels }
        // TODO Bit depth for when PCM is a thing
      ] }
    ];
  }
  subtitleSpecificTrackInfo(trackData) {
    return [
      { id: 25506 /* CodecPrivate */, data: textEncoder.encode(trackData.info.config.description) }
    ];
  }
  createSegment() {
    const segment = {
      id: 408125543 /* Segment */,
      size: this.format._options.streamable ? -1 : SEGMENT_SIZE_BYTES,
      data: [
        !this.format._options.streamable ? this.seekHead : null,
        this.segmentInfo,
        this.tracksElement
      ]
    };
    this.segment = segment;
    this.writeEBML(segment);
  }
  createCues() {
    this.cues = { id: 475249515 /* Cues */, data: [] };
  }
  get segmentDataOffset() {
    assert(this.segment);
    return this.dataOffsets.get(this.segment);
  }
  getVideoTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
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
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    return newTrackData;
  }
  getAudioTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
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
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    return newTrackData;
  }
  getSubtitleTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
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
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    return newTrackData;
  }
  async addEncodedVideoChunk(track, chunk, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getVideoTrackData(track, meta);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const isKeyFrame = chunk.type === "key";
      const timestamp = this.validateAndNormalizeTimestamp(trackData.track, chunk.timestamp, isKeyFrame);
      const videoChunk = this.createInternalChunk(data, timestamp, (chunk.duration ?? 0) / 1e6, chunk.type);
      if (track.source._codec === "vp9") this.fixVP9ColorSpace(trackData, videoChunk);
      trackData.chunkQueue.push(videoChunk);
      await this.interleaveChunks();
    } finally {
      release();
    }
  }
  async addEncodedAudioChunk(track, chunk, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getAudioTrackData(track, meta);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const chunkType = chunk.type;
      const isKeyFrame = chunkType === "key";
      const timestamp = this.validateAndNormalizeTimestamp(trackData.track, chunk.timestamp, isKeyFrame);
      const audioChunk = this.createInternalChunk(data, timestamp, (chunk.duration ?? 0) / 1e6, chunkType);
      trackData.chunkQueue.push(audioChunk);
      await this.interleaveChunks();
    } finally {
      release();
    }
  }
  async addSubtitleCue(track, cue, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getSubtitleTrackData(track, meta);
      const timestamp = this.validateAndNormalizeTimestamp(trackData.track, 1e6 * cue.timestamp, true);
      let bodyText = cue.text;
      const timestampMs = Math.floor(timestamp * 1e3);
      inlineTimestampRegex.lastIndex = 0;
      bodyText = bodyText.replace(inlineTimestampRegex, (match) => {
        const time = parseSubtitleTimestamp(match.slice(1, -1));
        const offsetTime = time - timestampMs;
        return `<${formatSubtitleTimestamp(offsetTime)}>`;
      });
      const body = textEncoder.encode(bodyText);
      const additions = `${cue.settings ?? ""}
${cue.identifier ?? ""}
${cue.notes ?? ""}`;
      const subtitleChunk = this.createInternalChunk(
        body,
        timestamp,
        cue.duration,
        "key",
        additions.trim() ? textEncoder.encode(additions) : null
      );
      trackData.chunkQueue.push(subtitleChunk);
      await this.interleaveChunks();
    } finally {
      release();
    }
  }
  async interleaveChunks() {
    for (const track of this.output._tracks) {
      if (!track.source._closed && !this.trackDatas.some((x) => x.track === track)) {
        return;
      }
    }
    outer:
      while (true) {
        let trackWithMinTimestamp = null;
        let minTimestamp = Infinity;
        for (const trackData of this.trackDatas) {
          if (trackData.chunkQueue.length === 0 && !trackData.track.source._closed) {
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
        const chunk = trackWithMinTimestamp.chunkQueue.shift();
        this.writeBlock(trackWithMinTimestamp, chunk);
      }
    await this.writer.flush();
  }
  /** Due to [a bug in Chromium](https://bugs.chromium.org/p/chromium/issues/detail?id=1377842), VP9 streams often
   * lack color space information. This method patches in that information. */
  // http://downloads.webmproject.org/docs/vp9/vp9-bitstream_superframe-and-uncompressed-header_v1.0.pdf
  fixVP9ColorSpace(trackData, chunk) {
    if (chunk.type !== "key") return;
    if (!trackData.info.decoderConfig.colorSpace || !trackData.info.decoderConfig.colorSpace.matrix) return;
    let i = 0;
    if (readBits(chunk.data, 0, 2) !== 2) return;
    i += 2;
    const profile = (readBits(chunk.data, i + 1, i + 2) << 1) + readBits(chunk.data, i + 0, i + 1);
    i += 2;
    if (profile === 3) i++;
    const showExistingFrame = readBits(chunk.data, i + 0, i + 1);
    i++;
    if (showExistingFrame) return;
    const frameType = readBits(chunk.data, i + 0, i + 1);
    i++;
    if (frameType !== 0) return;
    i += 2;
    const syncCode = readBits(chunk.data, i + 0, i + 24);
    i += 24;
    if (syncCode !== 4817730) return;
    if (profile >= 2) i++;
    const colorSpaceID = {
      rgb: 7,
      bt709: 2,
      bt470bg: 1,
      smpte170m: 3
    }[trackData.info.decoderConfig.colorSpace.matrix];
    writeBits(chunk.data, i + 0, i + 3, colorSpaceID);
  }
  /** Converts a read-only external chunk into an internal one for easier use. */
  createInternalChunk(data, timestamp, duration, type, additions = null) {
    const internalChunk = {
      data,
      type,
      timestamp,
      duration,
      additions
    };
    return internalChunk;
  }
  /** Writes a block containing media data to the file. */
  writeBlock(trackData, chunk) {
    if (!this.segment) {
      this.createTracks();
      this.createSegment();
    }
    const msTimestamp = Math.floor(1e3 * chunk.timestamp);
    const keyFrameQueuedEverywhere = this.trackDatas.every((otherTrackData) => {
      if (otherTrackData.track.source._closed) {
        return true;
      }
      if (trackData === otherTrackData) {
        return chunk.type === "key";
      }
      const firstQueuedSample = otherTrackData.chunkQueue[0];
      return firstQueuedSample && firstQueuedSample.type === "key";
    });
    if (!this.currentCluster || keyFrameQueuedEverywhere && msTimestamp - this.currentClusterMsTimestamp >= 1e3) {
      this.createNewCluster(msTimestamp);
    }
    const relativeTimestamp = msTimestamp - this.currentClusterMsTimestamp;
    if (relativeTimestamp < 0) {
      return;
    }
    const clusterIsTooLong = relativeTimestamp >= MAX_CHUNK_LENGTH_MS;
    if (clusterIsTooLong) {
      throw new Error(
        `Current Matroska cluster exceeded its maximum allowed length of ${MAX_CHUNK_LENGTH_MS} milliseconds. In order to produce a correct WebM file, you must pass in a key frame at least every ${MAX_CHUNK_LENGTH_MS} milliseconds.`
      );
    }
    const prelude = new Uint8Array(4);
    const view2 = new DataView(prelude.buffer);
    view2.setUint8(0, 128 | trackData.track.id);
    view2.setInt16(1, relativeTimestamp, false);
    const msDuration = Math.floor(1e3 * chunk.duration);
    if (msDuration === 0 && !chunk.additions) {
      view2.setUint8(3, Number(chunk.type === "key") << 7);
      const simpleBlock = { id: 163 /* SimpleBlock */, data: [
        prelude,
        chunk.data
      ] };
      this.writeEBML(simpleBlock);
    } else {
      const blockGroup = { id: 160 /* BlockGroup */, data: [
        { id: 161 /* Block */, data: [
          prelude,
          chunk.data
        ] },
        chunk.type === "delta" ? {
          id: 251 /* ReferenceBlock */,
          data: new EBMLSignedInt(trackData.lastWrittenMsTimestamp - msTimestamp)
        } : null,
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
    this.duration = Math.max(this.duration, msTimestamp + msDuration);
    trackData.lastWrittenMsTimestamp = msTimestamp;
    this.trackDatasInCurrentCluster.add(trackData);
  }
  /** Creates a new Cluster element to contain media chunks. */
  createNewCluster(msTimestamp) {
    if (this.currentCluster && !this.format._options.streamable) {
      this.finalizeCurrentCluster();
    }
    this.currentCluster = {
      id: 524531317 /* Cluster */,
      size: this.format._options.streamable ? -1 : CLUSTER_SIZE_BYTES,
      data: [
        { id: 231 /* Timestamp */, data: msTimestamp }
      ]
    };
    this.writeEBML(this.currentCluster);
    this.currentClusterMsTimestamp = msTimestamp;
    this.trackDatasInCurrentCluster.clear();
  }
  finalizeCurrentCluster() {
    assert(this.currentCluster);
    const clusterSize = this.writer.getPos() - this.dataOffsets.get(this.currentCluster);
    const endPos = this.writer.getPos();
    this.writer.seek(this.offsets.get(this.currentCluster) + 4);
    this.writeEBMLVarInt(clusterSize, CLUSTER_SIZE_BYTES);
    this.writer.seek(endPos);
    const clusterOffsetFromSegment = this.offsets.get(this.currentCluster) - this.segmentDataOffset;
    assert(this.cues);
    this.cues.data.push({ id: 187 /* CuePoint */, data: [
      { id: 179 /* CueTime */, data: this.currentClusterMsTimestamp },
      // We only write out cues for tracks that have at least one chunk in this cluster
      ...[...this.trackDatasInCurrentCluster].map((trackData) => {
        return { id: 183 /* CueTrackPositions */, data: [
          { id: 247 /* CueTrack */, data: trackData.track.id },
          { id: 241 /* CueClusterPosition */, data: clusterOffsetFromSegment }
        ] };
      })
    ] });
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async onTrackClose() {
    const release = await this.mutex.acquire();
    await this.interleaveChunks();
    release();
  }
  /** Finalizes the file, making it ready for use. Must be called after all media chunks have been added. */
  async finalize() {
    const release = await this.mutex.acquire();
    if (!this.segment) {
      this.createTracks();
      this.createSegment();
    }
    for (const trackData of this.trackDatas) {
      while (trackData.chunkQueue.length > 0) {
        this.writeBlock(trackData, trackData.chunkQueue.shift());
      }
    }
    if (!this.format._options.streamable && this.currentCluster) {
      this.finalizeCurrentCluster();
    }
    assert(this.cues);
    this.writeEBML(this.cues);
    if (!this.format._options.streamable) {
      const endPos = this.writer.getPos();
      const segmentSize = this.writer.getPos() - this.segmentDataOffset;
      this.writer.seek(this.offsets.get(this.segment) + 4);
      this.writeEBMLVarInt(segmentSize, SEGMENT_SIZE_BYTES);
      this.segmentDuration.data = new EBMLFloat64(this.duration);
      this.writer.seek(this.offsets.get(this.segmentDuration));
      this.writeEBML(this.segmentDuration);
      this.seekHead.data[0].data[1].data = this.offsets.get(this.cues) - this.segmentDataOffset;
      this.seekHead.data[1].data[1].data = this.offsets.get(this.segmentInfo) - this.segmentDataOffset;
      this.seekHead.data[2].data[1].data = this.offsets.get(this.tracksElement) - this.segmentDataOffset;
      this.writer.seek(this.offsets.get(this.seekHead));
      this.writeEBML(this.seekHead);
      this.writer.seek(endPos);
    }
    release();
  }
};

// src/output-format.ts
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
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
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
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new MatroskaMuxer(output, this);
  }
};
var WebMOutputFormat = class extends MkvOutputFormat2 {
};

// src/media-source.ts
var MediaSource = class {
  constructor() {
    /** @internal */
    this._connectedTrack = null;
    /** @internal */
    this._closed = false;
    /** @internal */
    this._offsetTimestamps = false;
  }
  /** @internal */
  _ensureValidDigest() {
    if (!this._connectedTrack) {
      throw new Error("Cannot call digest without connecting the source to an output track.");
    }
    if (!this._connectedTrack.output._started) {
      throw new Error("Cannot call digest before output has been started.");
    }
    if (this._connectedTrack.output._finalizing) {
      throw new Error("Cannot call digest after output has started finalizing.");
    }
    if (this._closed) {
      throw new Error("Cannot call digest after source has been closed.");
    }
  }
  /** @internal */
  _start() {
  }
  /** @internal */
  async _flush() {
  }
  close() {
    if (this._closed) {
      throw new Error("Source already closed.");
    }
    if (!this._connectedTrack) {
      throw new Error("Cannot call close without connecting the source to an output track.");
    }
    if (!this._connectedTrack.output._started) {
      throw new Error("Cannot call close before output has been started.");
    }
    this._closed = true;
    if (this._connectedTrack.output._finalizing) {
      return;
    }
    this._connectedTrack.output._muxer.onTrackClose(this._connectedTrack);
  }
};
var VideoSource = class extends MediaSource {
  constructor(codec) {
    super();
    /** @internal */
    this._connectedTrack = null;
    if (!VIDEO_CODECS.includes(codec)) {
      throw new TypeError(`Invalid video codec '${codec}'. Must be one of: ${VIDEO_CODECS.join(", ")}.`);
    }
    this._codec = codec;
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
    this._ensureValidDigest();
    return this._connectedTrack.output._muxer.addEncodedVideoChunk(this._connectedTrack, chunk, meta);
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
  if (config.latencyMode !== void 0 && !["quality", "realtime"].includes(config.latencyMode)) {
    throw new TypeError("config.latencyMode, when provided, must be 'quality' or 'realtime'.");
  }
};
var VideoEncoderWrapper = class {
  constructor(source, codecConfig) {
    this.source = source;
    this.codecConfig = codecConfig;
    this.encoder = null;
    this.muxer = null;
    this.lastMultipleOfKeyFrameInterval = -1;
    this.lastWidth = null;
    this.lastHeight = null;
    validateVideoCodecConfig(codecConfig);
  }
  async digest(videoFrame) {
    this.source._ensureValidDigest();
    if (this.lastWidth !== null && this.lastHeight !== null) {
      if (videoFrame.codedWidth !== this.lastWidth || videoFrame.codedHeight !== this.lastHeight) {
        throw new Error(
          `Video frame size must remain constant. Expected ${this.lastWidth}x${this.lastHeight}, got ${videoFrame.codedWidth}x${videoFrame.codedHeight}.`
        );
      }
    } else {
      this.lastWidth = videoFrame.codedWidth;
      this.lastHeight = videoFrame.codedHeight;
    }
    this.ensureEncoder(videoFrame);
    assert(this.encoder);
    const multipleOfKeyFrameInterval = Math.floor(videoFrame.timestamp / 1e6 / KEY_FRAME_INTERVAL);
    this.encoder.encode(videoFrame, {
      keyFrame: multipleOfKeyFrameInterval !== this.lastMultipleOfKeyFrameInterval
    });
    this.lastMultipleOfKeyFrameInterval = multipleOfKeyFrameInterval;
    if (this.encoder.encodeQueueSize >= 4) {
      await new Promise((resolve) => this.encoder.addEventListener("dequeue", resolve, { once: true }));
    }
    await this.muxer.mutex.currentPromise;
  }
  ensureEncoder(videoFrame) {
    if (this.encoder) {
      return;
    }
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => void this.muxer.addEncodedVideoChunk(this.source._connectedTrack, chunk, meta),
      error: (error) => console.error("Video encode error:", error)
    });
    this.encoder.configure({
      codec: buildVideoCodecString(
        this.codecConfig.codec,
        videoFrame.codedWidth,
        videoFrame.codedHeight,
        this.codecConfig.bitrate
      ),
      width: videoFrame.codedWidth,
      height: videoFrame.codedHeight,
      bitrate: this.codecConfig.bitrate,
      framerate: this.source._connectedTrack?.metadata.frameRate,
      latencyMode: this.codecConfig.latencyMode,
      ...getVideoEncoderConfigExtension(this.codecConfig.codec)
    });
    assert(this.source._connectedTrack);
    this.muxer = this.source._connectedTrack.output._muxer;
  }
  async flush() {
    if (this.encoder) {
      await this.encoder.flush();
      this.encoder.close();
    }
  }
};
var VideoFrameSource = class extends VideoSource {
  constructor(codecConfig) {
    super(codecConfig.codec);
    this._encoder = new VideoEncoderWrapper(this, codecConfig);
  }
  digest(videoFrame) {
    if (!(videoFrame instanceof VideoFrame)) {
      throw new TypeError("videoFrame must be a VideoFrame.");
    }
    return this._encoder.digest(videoFrame);
  }
  /** @internal */
  _flush() {
    return this._encoder.flush();
  }
};
var CanvasSource = class extends VideoSource {
  constructor(canvas, codecConfig) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError("canvas must be an HTMLCanvasElement.");
    }
    super(codecConfig.codec);
    this._encoder = new VideoEncoderWrapper(this, codecConfig);
    this._canvas = canvas;
  }
  digest(timestamp, duration = 0) {
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new TypeError("timestamp must be a non-negative number.");
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("duration must be a non-negative number.");
    }
    const frame = new VideoFrame(this._canvas, {
      timestamp: Math.round(1e6 * timestamp),
      duration: Math.round(1e6 * duration),
      alpha: "discard"
    });
    const promise = this._encoder.digest(frame);
    frame.close();
    return promise;
  }
  /** @internal */
  _flush() {
    return this._encoder.flush();
  }
};
var MediaStreamVideoTrackSource = class extends VideoSource {
  constructor(track, codecConfig) {
    if (!(track instanceof MediaStreamTrack) || track.kind !== "video") {
      throw new TypeError("track must be a video MediaStreamTrack.");
    }
    codecConfig = {
      ...codecConfig,
      latencyMode: "realtime"
    };
    super(codecConfig.codec);
    /** @internal */
    this._abortController = null;
    /** @internal */
    this._offsetTimestamps = true;
    this._encoder = new VideoEncoderWrapper(this, codecConfig);
    this._track = track;
  }
  /** @internal */
  _start() {
    this._abortController = new AbortController();
    const processor = new MediaStreamTrackProcessor({ track: this._track });
    const consumer = new WritableStream({
      write: (videoFrame) => {
        void this._encoder.digest(videoFrame);
        videoFrame.close();
      }
    });
    processor.readable.pipeTo(consumer, {
      signal: this._abortController.signal
    }).catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Pipe error:", err);
    });
  }
  /** @internal */
  async _flush() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    await this._encoder.flush();
  }
};
var AudioSource = class extends MediaSource {
  constructor(codec) {
    super();
    /** @internal */
    this._connectedTrack = null;
    if (!AUDIO_CODECS.includes(codec)) {
      throw new TypeError(`Invalid audio codec '${codec}'. Must be one of: ${AUDIO_CODECS.join(", ")}.`);
    }
    this._codec = codec;
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
    this._ensureValidDigest();
    return this._connectedTrack.output._muxer.addEncodedAudioChunk(this._connectedTrack, chunk, meta);
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
    this.muxer = null;
    this.lastNumberOfChannels = null;
    this.lastSampleRate = null;
    validateAudioCodecConfig(codecConfig);
  }
  async digest(audioData) {
    this.source._ensureValidDigest();
    if (this.lastNumberOfChannels !== null && this.lastSampleRate !== null) {
      if (audioData.numberOfChannels !== this.lastNumberOfChannels || audioData.sampleRate !== this.lastSampleRate) {
        throw new Error(
          `Audio parameters must remain constant. Expected ${this.lastNumberOfChannels} channels at ${this.lastSampleRate} Hz, got ${audioData.numberOfChannels} channels at ${audioData.sampleRate} Hz.`
        );
      }
    } else {
      this.lastNumberOfChannels = audioData.numberOfChannels;
      this.lastSampleRate = audioData.sampleRate;
    }
    this.ensureEncoder(audioData);
    assert(this.encoder);
    this.encoder.encode(audioData);
    if (this.encoder.encodeQueueSize >= 4) {
      await new Promise((resolve) => this.encoder.addEventListener("dequeue", resolve, { once: true }));
    }
    await this.muxer.mutex.currentPromise;
  }
  ensureEncoder(audioData) {
    if (this.encoder) {
      return;
    }
    this.encoder = new AudioEncoder({
      output: (chunk, meta) => void this.muxer.addEncodedAudioChunk(this.source._connectedTrack, chunk, meta),
      error: (error) => console.error("Audio encode error:", error)
    });
    this.encoder.configure({
      codec: buildAudioCodecString(this.codecConfig.codec, audioData.numberOfChannels, audioData.sampleRate),
      numberOfChannels: audioData.numberOfChannels,
      sampleRate: audioData.sampleRate,
      bitrate: this.codecConfig.bitrate,
      ...getAudioEncoderConfigExtension(this.codecConfig.codec)
    });
    assert(this.source._connectedTrack);
    this.muxer = this.source._connectedTrack.output._muxer;
  }
  async flush() {
    if (this.encoder) {
      await this.encoder.flush();
      this.encoder.close();
    }
  }
};
var AudioDataSource = class extends AudioSource {
  constructor(codecConfig) {
    super(codecConfig.codec);
    this._encoder = new AudioEncoderWrapper(this, codecConfig);
  }
  digest(audioData) {
    if (!(audioData instanceof AudioData)) {
      throw new TypeError("audioData must be an AudioData.");
    }
    return this._encoder.digest(audioData);
  }
  /** @internal */
  _flush() {
    return this._encoder.flush();
  }
};
var AudioBufferSource = class extends AudioSource {
  constructor(codecConfig) {
    super(codecConfig.codec);
    /** @internal */
    this._accumulatedFrameCount = 0;
    this._encoder = new AudioEncoderWrapper(this, codecConfig);
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
      timestamp: Math.round(1e6 * this._accumulatedFrameCount / sampleRate),
      data
    });
    const promise = this._encoder.digest(audioData);
    audioData.close();
    this._accumulatedFrameCount += numberOfFrames;
    return promise;
  }
  /** @internal */
  _flush() {
    return this._encoder.flush();
  }
};
var MediaStreamAudioTrackSource = class extends AudioSource {
  constructor(track, codecConfig) {
    if (!(track instanceof MediaStreamTrack) || track.kind !== "audio") {
      throw new TypeError("track must be an audio MediaStreamTrack.");
    }
    super(codecConfig.codec);
    /** @internal */
    this._abortController = null;
    /** @internal */
    this._offsetTimestamps = true;
    this._encoder = new AudioEncoderWrapper(this, codecConfig);
    this._track = track;
  }
  /** @internal */
  _start() {
    this._abortController = new AbortController();
    const processor = new MediaStreamTrackProcessor({ track: this._track });
    const consumer = new WritableStream({
      write: (audioData) => {
        void this._encoder.digest(audioData);
        audioData.close();
      }
    });
    processor.readable.pipeTo(consumer, {
      signal: this._abortController.signal
    }).catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Pipe error:", err);
    });
  }
  /** @internal */
  async _flush() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    await this._encoder.flush();
  }
};
var SubtitleSource = class extends MediaSource {
  constructor(codec) {
    super();
    /** @internal */
    this._connectedTrack = null;
    if (!SUBTITLE_CODECS.includes(codec)) {
      throw new TypeError(`Invalid subtitle codec '${codec}'. Must be one of: ${SUBTITLE_CODECS.join(", ")}.`);
    }
    this._codec = codec;
  }
};
var TextSubtitleSource = class extends SubtitleSource {
  constructor(codec) {
    super(codec);
    this._parser = new SubtitleParser({
      codec,
      output: (cue, metadata) => this._connectedTrack?.output._muxer.addSubtitleCue(this._connectedTrack, cue, metadata),
      error: (error) => console.error("Subtitle parse error:", error)
    });
  }
  digest(text) {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string.");
    }
    this._ensureValidDigest();
    this._parser.parse(text);
    return this._connectedTrack.output._muxer.mutex.currentPromise;
  }
};

// src/output.ts
var Output = class {
  constructor(options) {
    /** @internal */
    this._tracks = [];
    /** @internal */
    this._started = false;
    /** @internal */
    this._finalizing = false;
    /** @internal */
    this._mutex = new AsyncMutex();
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!(options.format instanceof OutputFormat)) {
      throw new TypeError("options.format must be an OutputFormat.");
    }
    if (!(options.target instanceof Target)) {
      throw new TypeError("options.target must be a Target.");
    }
    if (options.target._output) {
      throw new Error("Target is already used for another output.");
    }
    options.target._output = this;
    this._writer = options.target._createWriter();
    this._muxer = options.format._createMuxer(this);
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
    this._addTrack("video", source, metadata);
  }
  addAudioTrack(source, metadata = {}) {
    if (!(source instanceof AudioSource)) {
      throw new TypeError("source must be an AudioSource.");
    }
    if (!metadata || typeof metadata !== "object") {
      throw new TypeError("metadata must be an object.");
    }
    this._addTrack("audio", source, metadata);
  }
  addSubtitleTrack(source, metadata = {}) {
    if (!(source instanceof SubtitleSource)) {
      throw new TypeError("source must be a SubtitleSource.");
    }
    if (!metadata || typeof metadata !== "object") {
      throw new TypeError("metadata must be an object.");
    }
    this._addTrack("subtitle", source, metadata);
  }
  /** @internal */
  _addTrack(type, source, metadata) {
    if (this._started) {
      throw new Error("Cannot add track after output has started.");
    }
    if (source._connectedTrack) {
      throw new Error("Source is already used for a track.");
    }
    const track = {
      id: this._tracks.length + 1,
      output: this,
      type,
      source,
      metadata
    };
    this._muxer.beforeTrackAdd(track);
    this._tracks.push(track);
    source._connectedTrack = track;
  }
  async start() {
    if (this._started) {
      throw new Error("Output already started.");
    }
    this._started = true;
    this._writer.start();
    const release = await this._mutex.acquire();
    await this._muxer.start();
    for (const track of this._tracks) {
      track.source._start();
    }
    release();
  }
  async finalize() {
    if (!this._started) {
      throw new Error("Cannot finalize before starting.");
    }
    if (this._finalizing) {
      throw new Error("Cannot call finalize twice.");
    }
    this._finalizing = true;
    const release = await this._mutex.acquire();
    const promises = this._tracks.map((x) => x.source._flush());
    await Promise.all(promises);
    await this._muxer.finalize();
    await this._writer.flush();
    await this._writer.finalize();
    release();
  }
};

// src/source.ts
var Source = class {
  constructor() {
    /** @internal */
    this._sizePromise = null;
  }
  /** @internal */
  _getSize() {
    return this._sizePromise ??= this._retrieveSize();
  }
};
var ArrayBufferSource = class extends Source {
  constructor(buffer) {
    super();
    this._buffer = buffer;
  }
  /** @internal */
  async _read(start, end) {
    return new Uint8Array(this._buffer, start, end - start);
  }
  /** @internal */
  async _retrieveSize() {
    return this._buffer.byteLength;
  }
};
var BlobSource = class extends Source {
  constructor(blob) {
    super();
    this._blob = blob;
  }
  /** @internal */
  async _read(start, end) {
    const slice = this._blob.slice(start, end);
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  }
  /** @internal */
  async _retrieveSize() {
    return this._blob.size;
  }
};

// src/demuxer.ts
var Demuxer = class {
  constructor(input) {
    this.input = input;
  }
};

// src/input-track.ts
var InputTrack = class {
  /** @internal */
  constructor(backing) {
    this._backing = backing;
  }
  isVideoTrack() {
    return this instanceof InputVideoTrack;
  }
  isAudioTrack() {
    return this instanceof InputAudioTrack;
  }
  computeDuration() {
    return this._backing.computeDuration();
  }
};
var InputVideoTrack = class extends InputTrack {
  /** @internal */
  constructor(backing) {
    super(backing);
    this._backing = backing;
  }
  getCodec() {
    return this._backing.getCodec();
  }
  getCodedWidth() {
    return this._backing.getCodedWidth();
  }
  getCodedHeight() {
    return this._backing.getCodedHeight();
  }
  getRotation() {
    return this._backing.getRotation();
  }
  async getDisplayWidth() {
    const rotation = await this._backing.getRotation();
    return rotation % 180 === 0 ? this._backing.getCodedWidth() : this._backing.getCodedHeight();
  }
  async getDisplayHeight() {
    const rotation = await this._backing.getRotation();
    return rotation % 180 === 0 ? this._backing.getCodedHeight() : this._backing.getCodedWidth();
  }
  getDecoderConfig() {
    return this._backing.getDecoderConfig();
  }
  async getCodecMimeType() {
    const decoderConfig = await this.getDecoderConfig();
    return decoderConfig.codec;
  }
};
var InputAudioTrack = class extends InputTrack {
  /** @internal */
  constructor(backing) {
    super(backing);
    this._backing = backing;
  }
  getCodec() {
    return this._backing.getCodec();
  }
  getNumberOfChannels() {
    return this._backing.getNumberOfChannels();
  }
  getSampleRate() {
    return this._backing.getSampleRate();
  }
  getDecoderConfig() {
    return this._backing.getDecoderConfig();
  }
  async getCodecMimeType() {
    const decoderConfig = await this.getDecoderConfig();
    return decoderConfig.codec;
  }
};

// src/reader.ts
var Reader = class {
  constructor(source, maxStorableBytes = Infinity) {
    this.source = source;
    this.maxStorableBytes = maxStorableBytes;
    this.loadedSegments = [];
    this.loadingSegments = [];
    this.sourceSizePromise = null;
    this.nextAge = 0;
    this.totalStoredBytes = 0;
  }
  async loadRange(start, end) {
    end = Math.min(end, await this.source._getSize());
    const matchingLoadingSegment = this.loadingSegments.find((x) => x.start <= start && x.end >= end);
    if (matchingLoadingSegment) {
      await matchingLoadingSegment.promise;
      return;
    }
    const encasingSegmentExists = this.loadedSegments.some((x) => x.start <= start && x.end >= end);
    if (encasingSegmentExists) {
      return;
    }
    const bytesPromise = this.source._read(start, end);
    const loadingSegment = { start, end, promise: bytesPromise };
    this.loadingSegments.push(loadingSegment);
    const bytes2 = await bytesPromise;
    removeItem(this.loadingSegments, loadingSegment);
    this.insertIntoLoadedSegments(start, bytes2);
  }
  insertIntoLoadedSegments(start, bytes2) {
    const segment = {
      start,
      end: start + bytes2.byteLength,
      bytes: bytes2,
      view: new DataView(bytes2.buffer),
      age: this.nextAge++
    };
    let index = binarySearchLessOrEqual(this.loadedSegments, start, (x) => x.start);
    if (index === -1 || this.loadedSegments[index].start < segment.start) {
      index++;
    }
    this.loadedSegments.splice(index, 0, segment);
    this.totalStoredBytes += bytes2.byteLength;
    for (let i = index + 1; i < this.loadedSegments.length; i++) {
      const otherSegment = this.loadedSegments[i];
      if (otherSegment.start >= segment.end) {
        break;
      }
      if (segment.start <= otherSegment.start && otherSegment.end <= segment.end) {
        this.loadedSegments.splice(i, 1);
        i--;
      }
    }
    while (this.totalStoredBytes > this.maxStorableBytes && this.loadedSegments.length > 1) {
      let oldestSegment = null;
      let oldestSegmentIndex = -1;
      for (let i = 0; i < this.loadedSegments.length; i++) {
        const candidate = this.loadedSegments[i];
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
  getViewAndOffset(start, end) {
    const startIndex = binarySearchLessOrEqual(this.loadedSegments, start, (x) => x.start);
    let segment = null;
    if (startIndex !== -1) {
      for (let i = startIndex; i < this.loadedSegments.length; i++) {
        const candidate = this.loadedSegments[i];
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
      offset: segment.bytes.byteOffset + start - segment.start
    };
  }
  forgetRange(start, end) {
    if (end <= start) {
      return;
    }
    const startIndex = binarySearchLessOrEqual(this.loadedSegments, start, (x) => x.start);
    if (startIndex === -1) {
      return;
    }
    const segment = this.loadedSegments[startIndex];
    if (segment.start !== start || segment.end !== end) {
      return;
    }
    this.loadedSegments.splice(startIndex, 1);
    this.totalStoredBytes -= segment.bytes.byteLength;
  }
};

// src/isobmff/isobmff-reader.ts
var IsobmffReader = class {
  constructor(reader) {
    this.reader = reader;
    this.pos = 0;
  }
  readRange(start, end) {
    const { view: view2, offset } = this.reader.getViewAndOffset(start, end);
    return new Uint8Array(view2.buffer, offset, end - start);
  }
  readU8() {
    const { view: view2, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 1);
    this.pos++;
    return view2.getUint8(offset);
  }
  readU16() {
    const { view: view2, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 2);
    this.pos += 2;
    return view2.getUint16(offset, false);
  }
  readU24() {
    const { view: view2, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 3);
    this.pos += 3;
    const high = view2.getUint16(offset, false);
    const low = view2.getUint8(offset + 2);
    return high * 256 + low;
  }
  readS32() {
    const { view: view2, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 4);
    this.pos += 4;
    return view2.getInt32(offset, false);
  }
  readU32() {
    const { view: view2, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 4);
    this.pos += 4;
    return view2.getUint32(offset, false);
  }
  readI32() {
    const { view: view2, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 4);
    this.pos += 4;
    return view2.getInt32(offset, false);
  }
  readU64() {
    const high = this.readU32();
    const low = this.readU32();
    return high * 4294967296 + low;
  }
  readF64() {
    const { view: view2, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 8);
    this.pos += 8;
    return view2.getFloat64(offset, false);
  }
  readFixed_16_16() {
    return this.readS32() / 65536;
  }
  readFixed_2_30() {
    return this.readS32() / 1073741824;
  }
  readAscii(length) {
    const { view: view2, offset } = this.reader.getViewAndOffset(this.pos, this.pos + length);
    this.pos += length;
    let str = "";
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(view2.getUint8(offset + i));
    }
    return str;
  }
  readIsomVariableInteger() {
    let result = 0;
    for (let i = 0; i < 4; i++) {
      result <<= 7;
      const nextByte = this.readU8();
      result |= nextByte & 127;
      if ((nextByte & 128) === 0) {
        break;
      }
    }
    return result;
  }
  readBoxHeader() {
    let totalSize = this.readU32();
    const name = this.readAscii(4);
    let headerSize = 8;
    const hasLargeSize = totalSize === 1;
    if (hasLargeSize) {
      totalSize = this.readU64();
      headerSize = 16;
    }
    return { name, totalSize, headerSize, contentSize: totalSize - headerSize };
  }
};

// src/isobmff/isobmff-demuxer.ts
var knownMatrixes = [rotationMatrix(0), rotationMatrix(90), rotationMatrix(180), rotationMatrix(270)];
var IsobmffDemuxer = class extends Demuxer {
  constructor(input) {
    super(input);
    this.currentTrack = null;
    this.tracks = [];
    this.metadataPromise = null;
    this.movieTimescale = -1;
    this.movieDurationInTimescale = -1;
    this.isFragmented = false;
    this.fragmentTrackDefaults = [];
    this.fragments = [];
    this.currentFragment = null;
    this.fragmentLookupMutex = new AsyncMutex();
    this.isobmffReader = new IsobmffReader(input._mainReader);
    this.chunkReader = new IsobmffReader(new Reader(input._source, 64 * 2 ** 20));
  }
  async computeDuration() {
    const tracks = await this.getTracks();
    const trackDurations = await Promise.all(tracks.map((x) => x.computeDuration()));
    return Math.max(0, ...trackDurations);
  }
  async getTracks() {
    await this.readMetadata();
    return this.tracks.map((track) => track.inputTrack);
  }
  async getMimeType() {
    await this.readMetadata();
    let string = "video/mp4";
    if (this.tracks.length > 0) {
      const codecMimeTypes = await Promise.all(this.tracks.map((x) => x.inputTrack.getCodecMimeType()));
      const uniqueCodecMimeTypes = [...new Set(codecMimeTypes)];
      string += `; codecs="${uniqueCodecMimeTypes.join(", ")}"`;
    }
    return string;
  }
  readMetadata() {
    return this.metadataPromise ??= (async () => {
      const sourceSize = await this.isobmffReader.reader.source._getSize();
      while (this.isobmffReader.pos < sourceSize) {
        await this.isobmffReader.reader.loadRange(this.isobmffReader.pos, this.isobmffReader.pos + 16);
        const startPos = this.isobmffReader.pos;
        const boxInfo = this.isobmffReader.readBoxHeader();
        if (boxInfo.name === "moov") {
          await this.isobmffReader.reader.loadRange(
            this.isobmffReader.pos,
            this.isobmffReader.pos + boxInfo.contentSize
          );
          this.readContiguousBoxes(boxInfo.contentSize);
          break;
        }
        this.isobmffReader.pos = startPos + boxInfo.totalSize;
      }
      if (this.isFragmented) {
        await this.isobmffReader.reader.loadRange(sourceSize - 4, sourceSize);
        this.isobmffReader.pos = sourceSize - 4;
        const lastWord = this.isobmffReader.readU32();
        const potentialMfraPos = sourceSize - lastWord;
        if (potentialMfraPos >= 0 && potentialMfraPos < sourceSize) {
          await this.isobmffReader.reader.loadRange(potentialMfraPos, sourceSize);
          this.isobmffReader.pos = potentialMfraPos;
          const boxInfo = this.isobmffReader.readBoxHeader();
          if (boxInfo.name === "mfra") {
            this.readContiguousBoxes(boxInfo.contentSize);
          }
        }
      }
    })();
  }
  getSampleTableForTrack(internalTrack) {
    if (internalTrack.sampleTable) {
      return internalTrack.sampleTable;
    }
    const sampleTable = {
      sampleTimingEntries: [],
      sampleCompositionTimeOffsets: [],
      sampleSizes: [],
      keySampleIndices: null,
      chunkOffsets: [],
      sampleToChunk: [],
      presentationTimestamps: []
    };
    internalTrack.sampleTable = sampleTable;
    this.isobmffReader.pos = internalTrack.sampleTableOffset;
    this.currentTrack = internalTrack;
    this.traverseBox();
    this.currentTrack = null;
    for (const entry of sampleTable.sampleTimingEntries) {
      for (let i = 0; i < entry.count; i++) {
        sampleTable.presentationTimestamps.push({
          presentationTimestamp: entry.startDecodeTimestamp + i * entry.delta,
          sampleIndex: entry.startIndex + i
        });
      }
    }
    for (const entry of sampleTable.sampleCompositionTimeOffsets) {
      for (let i = 0; i < entry.count; i++) {
        const sampleIndex = entry.startIndex + i;
        const sample = sampleTable.presentationTimestamps[sampleIndex];
        if (!sample) {
          continue;
        }
        sample.presentationTimestamp += entry.offset;
      }
    }
    sampleTable.presentationTimestamps.sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);
    return internalTrack.sampleTable;
  }
  async readFragment() {
    const startPos = this.isobmffReader.pos;
    await this.isobmffReader.reader.loadRange(this.isobmffReader.pos, this.isobmffReader.pos + 16);
    const moofBoxInfo = this.isobmffReader.readBoxHeader();
    assert(moofBoxInfo.name === "moof");
    await this.isobmffReader.reader.loadRange(startPos, startPos + moofBoxInfo.totalSize);
    this.isobmffReader.pos = startPos;
    this.traverseBox();
    const index = binarySearchExact(this.fragments, startPos, (x) => x.moofOffset);
    assert(index !== -1);
    const fragment = this.fragments[index];
    assert(fragment.moofOffset === startPos);
    this.isobmffReader.reader.forgetRange(startPos, startPos + moofBoxInfo.totalSize);
    for (const [trackId, trackData] of fragment.trackData) {
      if (trackData.startTimestampIsFinal) {
        continue;
      }
      const internalTrack = this.tracks.find((x) => x.id === trackId);
      this.isobmffReader.pos = 0;
      let currentFragment = null;
      let lastFragment = null;
      const index2 = binarySearchLessOrEqual(
        internalTrack.fragments,
        startPos - 1,
        (x) => x.moofOffset
      );
      if (index2 !== -1) {
        currentFragment = internalTrack.fragments[index2];
        lastFragment = currentFragment;
        this.isobmffReader.pos = currentFragment.moofOffset + currentFragment.moofSize;
      }
      while (this.isobmffReader.pos < startPos) {
        if (currentFragment?.nextFragment) {
          currentFragment = currentFragment.nextFragment;
          this.isobmffReader.pos = currentFragment.moofOffset + currentFragment.moofSize;
        } else {
          await this.isobmffReader.reader.loadRange(this.isobmffReader.pos, this.isobmffReader.pos + 16);
          const startPos2 = this.isobmffReader.pos;
          const boxInfo = this.isobmffReader.readBoxHeader();
          if (boxInfo.name === "moof") {
            const index3 = binarySearchExact(this.fragments, startPos2, (x) => x.moofOffset);
            if (index3 === -1) {
              this.isobmffReader.pos = startPos2;
              const fragment2 = await this.readFragment();
              if (currentFragment) currentFragment.nextFragment = fragment2;
              currentFragment = fragment2;
            } else {
              const fragment2 = this.fragments[index3];
              if (currentFragment) currentFragment.nextFragment = fragment2;
              currentFragment = fragment2;
            }
          }
          this.isobmffReader.pos = startPos2 + boxInfo.totalSize;
        }
        if (currentFragment && currentFragment.trackData.has(trackId)) {
          lastFragment = currentFragment;
        }
      }
      if (lastFragment) {
        const otherTrackData = lastFragment.trackData.get(trackId);
        assert(otherTrackData.startTimestampIsFinal);
        offsetFragmentTrackDataByTimestamp(trackData, otherTrackData.endTimestamp);
      }
      trackData.startTimestampIsFinal = true;
    }
    return fragment;
  }
  readContiguousBoxes(totalSize) {
    const startIndex = this.isobmffReader.pos;
    while (this.isobmffReader.pos - startIndex < totalSize) {
      this.traverseBox();
    }
  }
  traverseBox() {
    const startPos = this.isobmffReader.pos;
    const boxInfo = this.isobmffReader.readBoxHeader();
    const boxEndPos = startPos + boxInfo.totalSize;
    switch (boxInfo.name) {
      case "mdia":
      case "minf":
      case "dinf":
      case "mfra":
        {
          this.readContiguousBoxes(boxInfo.contentSize);
        }
        ;
        break;
      case "mvhd":
        {
          const version = this.isobmffReader.readU8();
          this.isobmffReader.pos += 3;
          if (version === 1) {
            this.isobmffReader.pos += 8 + 8;
            this.movieTimescale = this.isobmffReader.readU32();
            this.movieDurationInTimescale = this.isobmffReader.readU64();
          } else {
            this.isobmffReader.pos += 4 + 4;
            this.movieTimescale = this.isobmffReader.readU32();
            this.movieDurationInTimescale = this.isobmffReader.readU32();
          }
        }
        ;
        break;
      case "trak":
        {
          const track = {
            id: -1,
            demuxer: this,
            inputTrack: null,
            info: null,
            timescale: -1,
            durationInTimescale: -1,
            rotation: 0,
            sampleTableOffset: -1,
            sampleTable: null,
            fragmentLookupTable: null,
            currentFragmentState: null,
            fragments: []
          };
          this.currentTrack = track;
          this.readContiguousBoxes(boxInfo.contentSize);
          if (track.id !== -1 && track.timescale !== -1 && track.info !== null) {
            if (track.info.type === "video" && track.info.codec !== null) {
              const videoTrack = track;
              track.inputTrack = new InputVideoTrack(new IsobmffVideoTrackBacking(videoTrack));
              this.tracks.push(track);
            } else if (track.info.type === "audio" && track.info.codec !== null) {
              const audioTrack = track;
              track.inputTrack = new InputAudioTrack(new IsobmffAudioTrackBacking(audioTrack));
              this.tracks.push(track);
              if (track.info.codec === "aac") {
                const audioSpecificConfig = parseAacAudioSpecificConfig(track.info.codecDescription);
                if (audioSpecificConfig.numberOfChannels !== null) {
                  track.info.numberOfChannels = audioSpecificConfig.numberOfChannels;
                }
                if (audioSpecificConfig.sampleRate !== null) {
                  track.info.sampleRate = audioSpecificConfig.sampleRate;
                }
              }
            }
          }
          this.currentTrack = null;
        }
        ;
        break;
      case "tkhd":
        {
          const track = this.currentTrack;
          assert(track);
          const version = this.isobmffReader.readU8();
          const flags = this.isobmffReader.readU24();
          const trackEnabled = (flags & 1) !== 0;
          if (!trackEnabled) {
            break;
          }
          if (version === 0) {
            this.isobmffReader.pos += 8;
            track.id = this.isobmffReader.readU32();
            this.isobmffReader.pos += 8;
          } else if (version === 1) {
            this.isobmffReader.pos += 16;
            track.id = this.isobmffReader.readU32();
            this.isobmffReader.pos += 12;
          } else {
            throw new Error(`Incorrect track header version ${version}.`);
          }
          this.isobmffReader.pos += 2 * 4 + 2 + 2 + 2 + 2;
          const rotationMatrix2 = [];
          rotationMatrix2.push(this.isobmffReader.readFixed_16_16(), this.isobmffReader.readFixed_16_16());
          this.isobmffReader.pos += 4;
          rotationMatrix2.push(this.isobmffReader.readFixed_16_16(), this.isobmffReader.readFixed_16_16());
          const matrixIndex = knownMatrixes.findIndex((x) => x.every((y, i) => y === rotationMatrix2[i]));
          if (matrixIndex === -1) {
            track.rotation = 0;
          } else {
            track.rotation = 90 * matrixIndex;
          }
        }
        ;
        break;
      case "mdhd":
        {
          const track = this.currentTrack;
          assert(track);
          const version = this.isobmffReader.readU8();
          this.isobmffReader.pos += 3;
          if (version === 0) {
            this.isobmffReader.pos += 8;
            track.timescale = this.isobmffReader.readU32();
            track.durationInTimescale = this.isobmffReader.readU32();
          } else if (version === 1) {
            this.isobmffReader.pos += 16;
            track.timescale = this.isobmffReader.readU32();
            track.durationInTimescale = this.isobmffReader.readU64();
          }
        }
        ;
        break;
      case "hdlr":
        {
          const track = this.currentTrack;
          assert(track);
          this.isobmffReader.pos += 8;
          const handlerType = this.isobmffReader.readAscii(4);
          if (handlerType === "vide") {
            track.info = {
              type: "video",
              width: -1,
              height: -1,
              codec: null,
              codecDescription: null,
              colorSpace: null
            };
          } else if (handlerType === "soun") {
            track.info = {
              type: "audio",
              numberOfChannels: -1,
              sampleRate: -1,
              codec: null,
              codecDescription: null
            };
          }
        }
        ;
        break;
      case "stbl":
        {
          const track = this.currentTrack;
          assert(track);
          track.sampleTableOffset = startPos;
          this.readContiguousBoxes(boxInfo.contentSize);
        }
        ;
        break;
      case "stsd":
        {
          const track = this.currentTrack;
          assert(track);
          if (track.info === null || track.sampleTable) {
            break;
          }
          const stsdVersion = this.isobmffReader.readU8();
          this.isobmffReader.pos += 3;
          const entries = this.isobmffReader.readU32();
          for (let i = 0; i < entries; i++) {
            const sampleBoxInfo = this.isobmffReader.readBoxHeader();
            if (track.info.type === "video") {
              if (sampleBoxInfo.name === "avc1") {
                track.info.codec = "avc";
              } else if (sampleBoxInfo.name === "hvc1" || sampleBoxInfo.name === "hev1") {
                track.info.codec = "hevc";
              } else {
                console.warn(`Unsupported video sample entry type ${sampleBoxInfo.name}.`);
                break;
              }
              this.isobmffReader.pos += 6 * 1 + 2 + 2 + 2 + 3 * 4;
              track.info.width = this.isobmffReader.readU16();
              track.info.height = this.isobmffReader.readU16();
              this.isobmffReader.pos += 4 + 4 + 4 + 2 + 32 + 2 + 2;
              this.readContiguousBoxes(startPos + sampleBoxInfo.totalSize - this.isobmffReader.pos);
            } else {
              if (sampleBoxInfo.name === "mp4a") {
                track.info.codec = "aac";
              } else if (sampleBoxInfo.name.toLowerCase() === "opus") {
                track.info.codec = "opus";
              } else {
                console.warn(`Unsupported audio sample entry type ${sampleBoxInfo.name}.`);
                break;
              }
              this.isobmffReader.pos += 6 * 1 + 2;
              const version = this.isobmffReader.readU16();
              this.isobmffReader.pos += 3 * 2;
              let channelCount = this.isobmffReader.readU16();
              this.isobmffReader.pos += 2 + 2 + 2;
              let sampleRate = this.isobmffReader.readU32() / 65536;
              if (stsdVersion === 0 && version > 0) {
                if (version === 1) {
                  this.isobmffReader.pos += 4 * 4;
                } else if (version === 2) {
                  this.isobmffReader.pos += 4;
                  sampleRate = this.isobmffReader.readF64();
                  channelCount = this.isobmffReader.readU32();
                  this.isobmffReader.pos += 4;
                  const sampleSize = this.isobmffReader.readU32();
                  const flags = this.isobmffReader.readU32();
                  const bytesPerFrame = this.isobmffReader.readU32();
                  const samplesPerFrame = this.isobmffReader.readU32();
                }
              }
              track.info.numberOfChannels = channelCount;
              track.info.sampleRate = sampleRate;
              this.readContiguousBoxes(startPos + sampleBoxInfo.totalSize - this.isobmffReader.pos);
            }
          }
        }
        ;
        break;
      case "avcC":
        {
          const track = this.currentTrack;
          assert(track && track.info);
          track.info.codecDescription = this.isobmffReader.readRange(
            this.isobmffReader.pos,
            this.isobmffReader.pos + boxInfo.contentSize
          );
        }
        ;
        break;
      case "hvcC":
        {
          const track = this.currentTrack;
          assert(track && track.info);
          track.info.codecDescription = this.isobmffReader.readRange(
            this.isobmffReader.pos,
            this.isobmffReader.pos + boxInfo.contentSize
          );
        }
        ;
        break;
      case "colr":
        {
          const track = this.currentTrack;
          assert(track && track.info?.type === "video");
          const colourType = this.isobmffReader.readAscii(4);
          if (colourType !== "nclx") {
            break;
          }
          const colourPrimaries = this.isobmffReader.readU16();
          const transferCharacteristics = this.isobmffReader.readU16();
          const matrixCoefficients = this.isobmffReader.readU16();
          const fullRangeFlag = Boolean(this.isobmffReader.readU8() & 128);
          track.info.colorSpace = {
            primaries: COLOR_PRIMARIES_MAP_INVERSE[colourPrimaries],
            transfer: TRANSFER_CHARACTERISTICS_MAP_INVERSE[transferCharacteristics],
            matrix: MATRIX_COEFFICIENTS_MAP_INVERSE[matrixCoefficients],
            fullRange: fullRangeFlag
          };
        }
        ;
        break;
      case "wave":
        {
          if (boxInfo.totalSize > 8) {
            this.readContiguousBoxes(boxInfo.contentSize);
          }
        }
        ;
        break;
      case "esds":
        {
          const track = this.currentTrack;
          assert(track && track.info);
          this.isobmffReader.pos += 4;
          const tag = this.isobmffReader.readU8();
          assert(tag === 3);
          this.isobmffReader.readIsomVariableInteger();
          this.isobmffReader.pos += 2;
          const mixed = this.isobmffReader.readU8();
          const streamDependenceFlag = (mixed & 128) !== 0;
          const urlFlag = (mixed & 64) !== 0;
          const ocrStreamFlag = (mixed & 32) !== 0;
          if (streamDependenceFlag) {
            this.isobmffReader.pos += 2;
          }
          if (urlFlag) {
            const urlLength = this.isobmffReader.readU8();
            this.isobmffReader.pos += urlLength;
          }
          if (ocrStreamFlag) {
            this.isobmffReader.pos += 2;
          }
          const decoderConfigTag = this.isobmffReader.readU8();
          assert(decoderConfigTag === 4);
          this.isobmffReader.readIsomVariableInteger();
          const objectTypeIndication = this.isobmffReader.readU8();
          assert(objectTypeIndication === 64);
          this.isobmffReader.pos += 1 + 3 + 4 + 4;
          const decoderSpecificInfoTag = this.isobmffReader.readU8();
          assert(decoderSpecificInfoTag === 5);
          const decoderSpecificInfoLength = this.isobmffReader.readIsomVariableInteger();
          track.info.codecDescription = this.isobmffReader.readRange(
            this.isobmffReader.pos,
            this.isobmffReader.pos + decoderSpecificInfoLength
          );
        }
        ;
        break;
      case "stts":
        {
          const track = this.currentTrack;
          assert(track);
          if (!track.sampleTable) {
            break;
          }
          this.isobmffReader.pos += 4;
          const entryCount = this.isobmffReader.readU32();
          let currentIndex = 0;
          let currentTimestamp = 0;
          for (let i = 0; i < entryCount; i++) {
            const sampleCount = this.isobmffReader.readU32();
            const sampleDelta = this.isobmffReader.readU32();
            track.sampleTable.sampleTimingEntries.push({
              startIndex: currentIndex,
              startDecodeTimestamp: currentTimestamp,
              count: sampleCount,
              delta: sampleDelta
            });
            currentIndex += sampleCount;
            currentTimestamp += sampleCount * sampleDelta;
          }
        }
        ;
        break;
      case "ctts":
        {
          const track = this.currentTrack;
          assert(track);
          if (!track.sampleTable) {
            break;
          }
          this.isobmffReader.pos += 1 + 3;
          const entryCount = this.isobmffReader.readU32();
          let sampleIndex = 0;
          for (let i = 0; i < entryCount; i++) {
            const sampleCount = this.isobmffReader.readU32();
            const sampleOffset = this.isobmffReader.readI32();
            track.sampleTable.sampleCompositionTimeOffsets.push({
              startIndex: sampleIndex,
              count: sampleCount,
              offset: sampleOffset
            });
            sampleIndex += sampleCount;
          }
        }
        ;
        break;
      case "stsz":
        {
          const track = this.currentTrack;
          assert(track);
          if (!track.sampleTable) {
            break;
          }
          this.isobmffReader.pos += 4;
          const sampleSize = this.isobmffReader.readU32();
          const sampleCount = this.isobmffReader.readU32();
          if (sampleSize === 0) {
            for (let i = 0; i < sampleCount; i++) {
              const sampleSize2 = this.isobmffReader.readU32();
              track.sampleTable.sampleSizes.push(sampleSize2);
            }
          } else {
            track.sampleTable.sampleSizes.push(sampleSize);
          }
        }
        ;
        break;
      case "stz2":
        {
          throw new Error("Unsupported.");
        }
        ;
      case "stss":
        {
          const track = this.currentTrack;
          assert(track);
          if (!track.sampleTable) {
            break;
          }
          this.isobmffReader.pos += 4;
          track.sampleTable.keySampleIndices = [];
          const entryCount = this.isobmffReader.readU32();
          for (let i = 0; i < entryCount; i++) {
            const sampleIndex = this.isobmffReader.readU32() - 1;
            track.sampleTable.keySampleIndices.push(sampleIndex);
          }
        }
        ;
        break;
      case "stsc":
        {
          const track = this.currentTrack;
          assert(track);
          if (!track.sampleTable) {
            break;
          }
          this.isobmffReader.pos += 4;
          const entryCount = this.isobmffReader.readU32();
          for (let i = 0; i < entryCount; i++) {
            const startChunkIndex = this.isobmffReader.readU32() - 1;
            const samplesPerChunk = this.isobmffReader.readU32();
            const sampleDescriptionIndex = this.isobmffReader.readU32();
            track.sampleTable.sampleToChunk.push({
              startSampleIndex: -1,
              startChunkIndex,
              samplesPerChunk,
              sampleDescriptionIndex
            });
          }
          let startSampleIndex = 0;
          for (let i = 0; i < track.sampleTable.sampleToChunk.length; i++) {
            track.sampleTable.sampleToChunk[i].startSampleIndex = startSampleIndex;
            if (i < track.sampleTable.sampleToChunk.length - 1) {
              const nextChunk = track.sampleTable.sampleToChunk[i + 1];
              const chunkCount = nextChunk.startChunkIndex - track.sampleTable.sampleToChunk[i].startChunkIndex;
              startSampleIndex += chunkCount * track.sampleTable.sampleToChunk[i].samplesPerChunk;
            }
          }
        }
        ;
        break;
      case "stco":
        {
          const track = this.currentTrack;
          assert(track);
          if (!track.sampleTable) {
            break;
          }
          this.isobmffReader.pos += 4;
          const entryCount = this.isobmffReader.readU32();
          for (let i = 0; i < entryCount; i++) {
            const chunkOffset = this.isobmffReader.readU32();
            track.sampleTable.chunkOffsets.push(chunkOffset);
          }
        }
        ;
        break;
      case "co64":
        {
          const track = this.currentTrack;
          assert(track);
          if (!track.sampleTable) {
            break;
          }
          this.isobmffReader.pos += 4;
          const entryCount = this.isobmffReader.readU32();
          for (let i = 0; i < entryCount; i++) {
            const chunkOffset = this.isobmffReader.readU64();
            track.sampleTable.chunkOffsets.push(chunkOffset);
          }
        }
        ;
        break;
      case "mvex":
        {
          this.isFragmented = true;
          this.readContiguousBoxes(boxInfo.contentSize);
        }
        ;
        break;
      case "mehd":
        {
          const version = this.isobmffReader.readU8();
          this.isobmffReader.pos += 3;
          const fragmentDuration = version === 1 ? this.isobmffReader.readU64() : this.isobmffReader.readU32();
          this.movieDurationInTimescale = fragmentDuration;
        }
        ;
        break;
      case "trex":
        {
          this.isobmffReader.pos += 4;
          const trackId = this.isobmffReader.readU32();
          const defaultSampleDescriptionIndex = this.isobmffReader.readU32();
          const defaultSampleDuration = this.isobmffReader.readU32();
          const defaultSampleSize = this.isobmffReader.readU32();
          const defaultSampleFlags = this.isobmffReader.readU32();
          this.fragmentTrackDefaults.push({
            trackId,
            defaultSampleDescriptionIndex,
            defaultSampleDuration,
            defaultSampleSize,
            defaultSampleFlags
          });
        }
        ;
        break;
      case "tfra":
        {
          const version = this.isobmffReader.readU8();
          this.isobmffReader.pos += 3;
          const trackId = this.isobmffReader.readU32();
          const track = this.tracks.find((x2) => x2.id === trackId);
          if (!track) {
            break;
          }
          track.fragmentLookupTable = [];
          const word = this.isobmffReader.readU32();
          const lengthSizeOfTrafNum = (word & 48) >> 4;
          const lengthSizeOfTrunNum = (word & 12) >> 2;
          const lengthSizeOfSampleNum = word & 3;
          const x = this.isobmffReader;
          const functions = [x.readU8.bind(x), x.readU16.bind(x), x.readU24.bind(x), x.readU32.bind(x)];
          const readTrafNum = functions[lengthSizeOfTrafNum];
          const readTrunNum = functions[lengthSizeOfTrunNum];
          const readSampleNum = functions[lengthSizeOfSampleNum];
          const numberOfEntries = this.isobmffReader.readU32();
          for (let i = 0; i < numberOfEntries; i++) {
            const time = version === 1 ? this.isobmffReader.readU64() : this.isobmffReader.readU32();
            const moofOffset = version === 1 ? this.isobmffReader.readU64() : this.isobmffReader.readU32();
            const trafNumber = readTrafNum();
            const trunNumber = readTrunNum();
            const sampleNumber = readSampleNum();
            track.fragmentLookupTable.push({
              timestamp: time,
              moofOffset
            });
          }
        }
        ;
        break;
      case "moof":
        {
          this.currentFragment = {
            moofOffset: startPos,
            moofSize: boxInfo.totalSize,
            implicitBaseDataOffset: startPos,
            trackData: /* @__PURE__ */ new Map(),
            dataStart: Infinity,
            dataEnd: 0,
            nextFragment: null
          };
          this.readContiguousBoxes(boxInfo.contentSize);
          const insertionIndex = binarySearchLessOrEqual(
            this.fragments,
            this.currentFragment.moofOffset,
            (x) => x.moofOffset
          );
          this.fragments.splice(insertionIndex + 1, 0, this.currentFragment);
          for (const [, trackData] of this.currentFragment.trackData) {
            const firstSample = trackData.samples[0];
            const lastSample = last(trackData.samples);
            this.currentFragment.dataStart = Math.min(
              this.currentFragment.dataStart,
              firstSample.byteOffset
            );
            this.currentFragment.dataEnd = Math.max(
              this.currentFragment.dataEnd,
              lastSample.byteOffset + lastSample.byteSize
            );
          }
          this.currentFragment = null;
        }
        ;
        break;
      case "traf":
        {
          assert(this.currentFragment);
          this.readContiguousBoxes(boxInfo.contentSize);
          if (this.currentTrack) {
            const trackData = this.currentFragment.trackData.get(this.currentTrack.id);
            if (trackData) {
              const insertionIndex = binarySearchLessOrEqual(
                this.currentTrack.fragments,
                this.currentFragment.moofOffset,
                (x) => x.moofOffset
              );
              this.currentTrack.fragments.splice(insertionIndex + 1, 0, this.currentFragment);
              const { currentFragmentState } = this.currentTrack;
              assert(currentFragmentState);
              if (currentFragmentState.startTimestamp !== null) {
                offsetFragmentTrackDataByTimestamp(trackData, currentFragmentState.startTimestamp);
                trackData.startTimestampIsFinal = true;
              }
            }
            this.currentTrack.currentFragmentState = null;
            this.currentTrack = null;
          }
        }
        ;
        break;
      case "tfhd":
        {
          assert(this.currentFragment);
          this.isobmffReader.pos += 1;
          const flags = this.isobmffReader.readU24();
          const baseDataOffsetPresent = Boolean(flags & 1);
          const sampleDescriptionIndexPresent = Boolean(flags & 2);
          const defaultSampleDurationPresent = Boolean(flags & 8);
          const defaultSampleSizePresent = Boolean(flags & 16);
          const defaultSampleFlagsPresent = Boolean(flags & 32);
          const durationIsEmpty = Boolean(flags & 65536);
          const defaultBaseIsMoof = Boolean(flags & 131072);
          const trackId = this.isobmffReader.readU32();
          const track = this.tracks.find((x) => x.id === trackId);
          if (!track) {
            break;
          }
          const defaults = this.fragmentTrackDefaults.find((x) => x.trackId === trackId);
          this.currentTrack = track;
          track.currentFragmentState = {
            baseDataOffset: this.currentFragment.implicitBaseDataOffset,
            sampleDescriptionIndex: defaults?.defaultSampleDescriptionIndex ?? null,
            defaultSampleDuration: defaults?.defaultSampleDuration ?? null,
            defaultSampleSize: defaults?.defaultSampleSize ?? null,
            defaultSampleFlags: defaults?.defaultSampleFlags ?? null,
            startTimestamp: null
          };
          if (baseDataOffsetPresent) {
            track.currentFragmentState.baseDataOffset = this.isobmffReader.readU64();
          } else if (defaultBaseIsMoof) {
            track.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset;
          }
          if (sampleDescriptionIndexPresent) {
            track.currentFragmentState.sampleDescriptionIndex = this.isobmffReader.readU32();
          }
          if (defaultSampleDurationPresent) {
            track.currentFragmentState.defaultSampleDuration = this.isobmffReader.readU32();
          }
          if (defaultSampleSizePresent) {
            track.currentFragmentState.defaultSampleSize = this.isobmffReader.readU32();
          }
          if (defaultSampleFlagsPresent) {
            track.currentFragmentState.defaultSampleFlags = this.isobmffReader.readU32();
          }
          if (durationIsEmpty) {
            track.currentFragmentState.defaultSampleDuration = 0;
          }
        }
        ;
        break;
      case "tfdt":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.currentFragmentState);
          const version = this.isobmffReader.readU8();
          this.isobmffReader.pos += 3;
          const baseMediaDecodeTime = version === 0 ? this.isobmffReader.readU32() : this.isobmffReader.readU64();
          track.currentFragmentState.startTimestamp = baseMediaDecodeTime;
        }
        ;
        break;
      case "trun":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(this.currentFragment);
          assert(track.currentFragmentState);
          if (this.currentFragment.trackData.has(track.id)) {
            throw new Error("Can't have two trun boxes for the same track in one fragment.");
          }
          const version = this.isobmffReader.readU8();
          const flags = this.isobmffReader.readU24();
          const dataOffsetPresent = Boolean(flags & 1);
          const firstSampleFlagsPresent = Boolean(flags & 4);
          const sampleDurationPresent = Boolean(flags & 256);
          const sampleSizePresent = Boolean(flags & 512);
          const sampleFlagsPresent = Boolean(flags & 1024);
          const sampleCompositionTimeOffsetsPresent = Boolean(flags & 2048);
          const sampleCount = this.isobmffReader.readU32();
          let dataOffset = track.currentFragmentState.baseDataOffset;
          if (dataOffsetPresent) {
            dataOffset += this.isobmffReader.readI32();
          }
          let firstSampleFlags = null;
          if (firstSampleFlagsPresent) {
            firstSampleFlags = this.isobmffReader.readU32();
          }
          let currentOffset = dataOffset;
          if (sampleCount === 0) {
            this.currentFragment.implicitBaseDataOffset = currentOffset;
            break;
          }
          let currentTimestamp = 0;
          const trackData = {
            startTimestamp: 0,
            endTimestamp: 0,
            samples: [],
            presentationTimestamps: [],
            startTimestampIsFinal: false
          };
          this.currentFragment.trackData.set(track.id, trackData);
          for (let i = 0; i < sampleCount; i++) {
            let sampleDuration;
            if (sampleDurationPresent) {
              sampleDuration = this.isobmffReader.readU32();
            } else {
              assert(track.currentFragmentState.defaultSampleDuration !== null);
              sampleDuration = track.currentFragmentState.defaultSampleDuration;
            }
            let sampleSize;
            if (sampleSizePresent) {
              sampleSize = this.isobmffReader.readU32();
            } else {
              assert(track.currentFragmentState.defaultSampleSize !== null);
              sampleSize = track.currentFragmentState.defaultSampleSize;
            }
            let sampleFlags;
            if (sampleFlagsPresent) {
              sampleFlags = this.isobmffReader.readU32();
            } else {
              assert(track.currentFragmentState.defaultSampleFlags !== null);
              sampleFlags = track.currentFragmentState.defaultSampleFlags;
            }
            if (i === 0 && firstSampleFlags !== null) {
              sampleFlags = firstSampleFlags;
            }
            let sampleCompositionTimeOffset = 0;
            if (sampleCompositionTimeOffsetsPresent) {
              if (version === 0) {
                sampleCompositionTimeOffset = this.isobmffReader.readU32();
              } else {
                sampleCompositionTimeOffset = this.isobmffReader.readI32();
              }
            }
            const isKeyFrame = !(sampleFlags & 65536);
            trackData.samples.push({
              presentationTimestamp: currentTimestamp + sampleCompositionTimeOffset,
              duration: sampleDuration,
              byteOffset: currentOffset,
              byteSize: sampleSize,
              isKeyFrame
            });
            currentOffset += sampleSize;
            currentTimestamp += sampleDuration;
          }
          trackData.presentationTimestamps = trackData.samples.map((x, i) => ({ presentationTimestamp: x.presentationTimestamp, sampleIndex: i })).sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);
          const firstSample = trackData.samples[trackData.presentationTimestamps[0].sampleIndex];
          const lastSample = trackData.samples[last(trackData.presentationTimestamps).sampleIndex];
          trackData.startTimestamp = firstSample.presentationTimestamp;
          trackData.endTimestamp = lastSample.presentationTimestamp + lastSample.duration;
          this.currentFragment.implicitBaseDataOffset = currentOffset;
        }
        ;
        break;
    }
    this.isobmffReader.pos = boxEndPos;
  }
};
var IsobmffTrackBacking = class {
  constructor(internalTrack) {
    this.internalTrack = internalTrack;
    this.chunkToSampleIndex = /* @__PURE__ */ new WeakMap();
    this.chunkToFragmentLocation = /* @__PURE__ */ new WeakMap();
  }
  getCodec() {
    throw new Error("Not implemented on base class.");
  }
  async computeDuration() {
    const lastChunk = await this.getChunk(Infinity, { metadataOnly: true });
    const timestamp = lastChunk?.timestamp;
    return timestamp ? timestamp / 1e6 : 0;
  }
  async getFirstChunk(options) {
    if (this.internalTrack.demuxer.isFragmented) {
      return this.performFragmentedLookup(
        () => {
          const fragment = this.internalTrack.fragments[0];
          return {
            fragmentIndex: fragment ? 0 : -1,
            sampleIndex: fragment ? 0 : -1,
            correctSampleFound: !!fragment
          };
        },
        0,
        Infinity,
        options
      );
    }
    return this.fetchChunkForSampleIndex(0, options);
  }
  roundToMicrosecond(timestamp) {
    return (Math.floor(timestamp * 1e6) + 0.99999999) / 1e6;
  }
  async getChunk(timestamp, options) {
    timestamp = this.roundToMicrosecond(timestamp);
    const timestampInTimescale = timestamp * this.internalTrack.timescale;
    if (this.internalTrack.demuxer.isFragmented) {
      return this.performFragmentedLookup(
        () => this.findSampleInFragmentsForTimestamp(timestampInTimescale),
        timestampInTimescale,
        timestampInTimescale,
        options
      );
    } else {
      const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
      const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
      return this.fetchChunkForSampleIndex(sampleIndex, options);
    }
  }
  async getNextChunk(chunk, options) {
    if (this.internalTrack.demuxer.isFragmented) {
      const locationInFragment = this.chunkToFragmentLocation.get(chunk);
      if (locationInFragment === void 0) {
        throw new Error("Chunk was not created from this track.");
      }
      const trackData = locationInFragment.fragment.trackData.get(this.internalTrack.id);
      const sample = trackData.samples[locationInFragment.sampleIndex];
      const fragmentIndex = binarySearchExact(
        this.internalTrack.fragments,
        locationInFragment.fragment.moofOffset,
        (x) => x.moofOffset
      );
      assert(fragmentIndex !== -1);
      return this.performFragmentedLookup(
        () => {
          if (locationInFragment.sampleIndex + 1 < trackData.samples.length) {
            return {
              fragmentIndex,
              sampleIndex: locationInFragment.sampleIndex + 1,
              correctSampleFound: true
            };
          } else {
            let currentFragment = locationInFragment.fragment;
            while (currentFragment.nextFragment) {
              currentFragment = currentFragment.nextFragment;
              const trackData2 = currentFragment.trackData.get(this.internalTrack.id);
              if (trackData2) {
                const fragmentIndex2 = binarySearchExact(
                  this.internalTrack.fragments,
                  currentFragment.moofOffset,
                  (x) => x.moofOffset
                );
                assert(fragmentIndex2 !== -1);
                return {
                  fragmentIndex: fragmentIndex2,
                  sampleIndex: 0,
                  correctSampleFound: true
                };
              }
            }
            return {
              fragmentIndex,
              sampleIndex: -1,
              correctSampleFound: false
            };
          }
        },
        sample.presentationTimestamp,
        Infinity,
        options
      );
    }
    const sampleIndex = this.chunkToSampleIndex.get(chunk);
    if (sampleIndex === void 0) {
      throw new Error("Chunk was not created from this track.");
    }
    return this.fetchChunkForSampleIndex(sampleIndex + 1, options);
  }
  async getKeyChunk(timestamp, options) {
    timestamp = this.roundToMicrosecond(timestamp);
    const timestampInTimescale = timestamp * this.internalTrack.timescale;
    if (this.internalTrack.demuxer.isFragmented) {
      return this.performFragmentedLookup(
        () => this.findKeySampleInFragmentsForTimestamp(timestampInTimescale),
        timestampInTimescale,
        timestampInTimescale,
        options
      );
    }
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
    const keyFrameSampleIndex = sampleIndex === -1 ? -1 : getRelevantKeyframeIndexForSample(sampleTable, sampleIndex);
    return this.fetchChunkForSampleIndex(keyFrameSampleIndex, options);
  }
  async getNextKeyChunk(chunk, options) {
    if (this.internalTrack.demuxer.isFragmented) {
      const locationInFragment = this.chunkToFragmentLocation.get(chunk);
      if (locationInFragment === void 0) {
        throw new Error("Chunk was not created from this track.");
      }
      const trackData = locationInFragment.fragment.trackData.get(this.internalTrack.id);
      const sample = trackData.samples[locationInFragment.sampleIndex];
      const fragmentIndex = binarySearchExact(
        this.internalTrack.fragments,
        locationInFragment.fragment.moofOffset,
        (x) => x.moofOffset
      );
      assert(fragmentIndex !== -1);
      return this.performFragmentedLookup(
        () => {
          const nextKeyFrameIndex = trackData.samples.findIndex(
            (x, i) => x.isKeyFrame && i > locationInFragment.sampleIndex
          );
          if (nextKeyFrameIndex !== -1) {
            return {
              fragmentIndex,
              sampleIndex: nextKeyFrameIndex,
              correctSampleFound: true
            };
          } else {
            let currentFragment = locationInFragment.fragment;
            while (currentFragment.nextFragment) {
              currentFragment = currentFragment.nextFragment;
              const trackData2 = currentFragment.trackData.get(this.internalTrack.id);
              if (trackData2) {
                const fragmentIndex2 = binarySearchExact(
                  this.internalTrack.fragments,
                  currentFragment.moofOffset,
                  (x) => x.moofOffset
                );
                assert(fragmentIndex2 !== -1);
                const keyFrameIndex = trackData2.samples.findIndex((x) => x.isKeyFrame);
                if (keyFrameIndex === -1) {
                  throw new Error("Not supported: Fragment does not contain key sample.");
                }
                return {
                  fragmentIndex: fragmentIndex2,
                  sampleIndex: keyFrameIndex,
                  correctSampleFound: true
                };
              }
            }
            return {
              fragmentIndex,
              sampleIndex: -1,
              correctSampleFound: false
            };
          }
        },
        sample.presentationTimestamp,
        Infinity,
        options
      );
    }
    const sampleIndex = this.chunkToSampleIndex.get(chunk);
    if (sampleIndex === void 0) {
      throw new Error("Chunk was not created from this track.");
    }
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const nextKeyFrameSampleIndex = getNextKeyframeIndexForSample(sampleTable, sampleIndex);
    return this.fetchChunkForSampleIndex(nextKeyFrameSampleIndex, options);
  }
  async fetchChunkForSampleIndex(sampleIndex, options) {
    if (sampleIndex === -1) {
      return null;
    }
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleInfo = getSampleInfo(sampleTable, sampleIndex);
    if (!sampleInfo) {
      return null;
    }
    let data;
    if (options.metadataOnly) {
      data = new Uint8Array(0);
    } else {
      await this.internalTrack.demuxer.chunkReader.reader.loadRange(
        sampleInfo.chunkOffset,
        sampleInfo.chunkOffset + sampleInfo.chunkSize
      );
      data = this.internalTrack.demuxer.chunkReader.readRange(
        sampleInfo.sampleOffset,
        sampleInfo.sampleOffset + sampleInfo.sampleSize
      );
    }
    const timestamp = 1e6 * sampleInfo.presentationTimestamp / this.internalTrack.timescale;
    const duration = 1e6 * sampleInfo.duration / this.internalTrack.timescale;
    const chunk = this.createChunk(data, timestamp, duration, sampleInfo.isKeyFrame);
    this.chunkToSampleIndex.set(chunk, sampleIndex);
    return chunk;
  }
  async fetchChunkInFragment(fragment, sampleIndex, options) {
    if (sampleIndex === -1) {
      return null;
    }
    const trackData = fragment.trackData.get(this.internalTrack.id);
    const sample = trackData.samples[sampleIndex];
    assert(sample);
    let data;
    if (options.metadataOnly) {
      data = new Uint8Array(0);
    } else {
      await this.internalTrack.demuxer.chunkReader.reader.loadRange(fragment.dataStart, fragment.dataEnd);
      data = this.internalTrack.demuxer.chunkReader.readRange(
        sample.byteOffset,
        sample.byteOffset + sample.byteSize
      );
    }
    const timestamp = 1e6 * sample.presentationTimestamp / this.internalTrack.timescale;
    const duration = 1e6 * sample.duration / this.internalTrack.timescale;
    const chunk = this.createChunk(data, timestamp, duration, sample.isKeyFrame);
    this.chunkToFragmentLocation.set(chunk, { fragment, sampleIndex });
    return chunk;
  }
  findSampleInFragmentsForTimestamp(timestampInTimescale) {
    const fragmentIndex = binarySearchLessOrEqual(
      this.internalTrack.fragments,
      timestampInTimescale,
      (x) => x.trackData.get(this.internalTrack.id).startTimestamp
    );
    let sampleIndex = -1;
    let correctSampleFound = false;
    if (fragmentIndex !== -1) {
      const fragment = this.internalTrack.fragments[fragmentIndex];
      const trackData = fragment.trackData.get(this.internalTrack.id);
      const index = binarySearchLessOrEqual(
        trackData.presentationTimestamps,
        timestampInTimescale,
        (x) => x.presentationTimestamp
      );
      assert(index !== -1);
      sampleIndex = trackData.presentationTimestamps[index].sampleIndex;
      correctSampleFound = timestampInTimescale < trackData.endTimestamp;
    }
    return { fragmentIndex, sampleIndex, correctSampleFound };
  }
  findKeySampleInFragmentsForTimestamp(timestampInTimescale) {
    const fragmentIndex = binarySearchLessOrEqual(
      this.internalTrack.fragments,
      timestampInTimescale,
      (x) => x.trackData.get(this.internalTrack.id).startTimestamp
    );
    let sampleIndex = -1;
    let correctSampleFound = false;
    if (fragmentIndex !== -1) {
      const fragment = this.internalTrack.fragments[fragmentIndex];
      const trackData = fragment.trackData.get(this.internalTrack.id);
      const index = findLastIndex(trackData.presentationTimestamps, (x) => {
        const sample = trackData.samples[x.sampleIndex];
        return sample.isKeyFrame && x.presentationTimestamp <= timestampInTimescale;
      });
      if (index === -1) {
        throw new Error("Not supported: Fragment does not begin with a key sample.");
      }
      const entry = trackData.presentationTimestamps[index];
      sampleIndex = entry.sampleIndex;
      correctSampleFound = timestampInTimescale < trackData.endTimestamp;
    }
    return { fragmentIndex, sampleIndex, correctSampleFound };
  }
  /** Looks for a sample in the fragments while trying to load as few fragments as possible to retrieve it. */
  async performFragmentedLookup(getBestMatch, searchTimestamp, latestTimestamp, options) {
    const demuxer = this.internalTrack.demuxer;
    const release = await demuxer.fragmentLookupMutex.acquire();
    try {
      const { fragmentIndex, sampleIndex, correctSampleFound } = getBestMatch();
      if (correctSampleFound) {
        const fragment = this.internalTrack.fragments[fragmentIndex];
        return this.fetchChunkInFragment(fragment, sampleIndex, options);
      }
      const isobmffReader = demuxer.isobmffReader;
      const sourceSize = await isobmffReader.reader.source._getSize();
      let prevFragment = null;
      let bestFragmentIndex = fragmentIndex;
      let bestSampleIndex = sampleIndex;
      let lookupEntry = null;
      if (this.internalTrack.fragmentLookupTable) {
        const index = binarySearchLessOrEqual(
          this.internalTrack.fragmentLookupTable,
          searchTimestamp,
          (x) => x.timestamp
        );
        if (index !== -1) {
          lookupEntry = this.internalTrack.fragmentLookupTable[index];
        }
      }
      if (fragmentIndex === -1) {
        isobmffReader.pos = lookupEntry?.moofOffset ?? 0;
      } else {
        const fragment = this.internalTrack.fragments[fragmentIndex];
        if (!lookupEntry || fragment.moofOffset >= fragment.moofOffset) {
          isobmffReader.pos = fragment.moofOffset + fragment.moofSize;
          prevFragment = fragment;
        } else {
          isobmffReader.pos = lookupEntry.moofOffset;
        }
      }
      while (isobmffReader.pos < sourceSize) {
        if (prevFragment) {
          const trackData = prevFragment.trackData.get(this.internalTrack.id);
          if (trackData && trackData.startTimestamp > latestTimestamp) {
            break;
          }
          if (prevFragment.nextFragment) {
            isobmffReader.pos = prevFragment.nextFragment.moofOffset + prevFragment.nextFragment.moofSize;
            prevFragment = prevFragment.nextFragment;
            continue;
          }
        }
        await isobmffReader.reader.loadRange(isobmffReader.pos, isobmffReader.pos + 16);
        const startPos = isobmffReader.pos;
        const boxInfo = isobmffReader.readBoxHeader();
        if (boxInfo.name === "moof") {
          const index = binarySearchExact(demuxer.fragments, startPos, (x) => x.moofOffset);
          if (index === -1) {
            isobmffReader.pos = startPos;
            const fragment = await demuxer.readFragment();
            if (prevFragment) prevFragment.nextFragment = fragment;
            prevFragment = fragment;
            const { fragmentIndex: fragmentIndex2, sampleIndex: sampleIndex2, correctSampleFound: correctSampleFound2 } = getBestMatch();
            if (correctSampleFound2) {
              const fragment2 = this.internalTrack.fragments[fragmentIndex2];
              return this.fetchChunkInFragment(fragment2, sampleIndex2, options);
            }
            if (fragmentIndex2 !== -1) {
              bestFragmentIndex = fragmentIndex2;
              bestSampleIndex = sampleIndex2;
            }
          } else {
            const fragment = demuxer.fragments[index];
            if (prevFragment) prevFragment.nextFragment = fragment;
            prevFragment = fragment;
          }
        }
        isobmffReader.pos = startPos + boxInfo.totalSize;
      }
      if (bestFragmentIndex !== -1) {
        const fragment = this.internalTrack.fragments[bestFragmentIndex];
        return this.fetchChunkInFragment(fragment, bestSampleIndex, options);
      }
      return null;
    } finally {
      release();
    }
  }
};
var IsobmffVideoTrackBacking = class extends IsobmffTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.internalTrack = internalTrack;
  }
  async getCodec() {
    return this.internalTrack.info.codec;
  }
  async getCodedWidth() {
    return this.internalTrack.info.width;
  }
  async getCodedHeight() {
    return this.internalTrack.info.height;
  }
  async getRotation() {
    return this.internalTrack.rotation;
  }
  async getDecoderConfig() {
    return {
      codec: extractVideoCodecString(this.internalTrack.info.codec, this.internalTrack.info.codecDescription),
      codedWidth: this.internalTrack.info.width,
      codedHeight: this.internalTrack.info.height,
      description: this.internalTrack.info.codecDescription ?? void 0,
      colorSpace: this.internalTrack.info.colorSpace ?? void 0
    };
  }
  createChunk(data, timestamp, duration, isKeyFrame) {
    return new EncodedVideoChunk({
      data,
      timestamp,
      duration,
      type: isKeyFrame ? "key" : "delta"
    });
  }
};
var IsobmffAudioTrackBacking = class extends IsobmffTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.internalTrack = internalTrack;
  }
  async getCodec() {
    return this.internalTrack.info.codec;
  }
  async getNumberOfChannels() {
    return this.internalTrack.info.numberOfChannels;
  }
  async getSampleRate() {
    return this.internalTrack.info.sampleRate;
  }
  async getDecoderConfig() {
    return {
      codec: extractAudioCodecString(this.internalTrack.info.codec, this.internalTrack.info.codecDescription),
      numberOfChannels: this.internalTrack.info.numberOfChannels,
      sampleRate: this.internalTrack.info.sampleRate,
      description: this.internalTrack.info.codecDescription ?? void 0
    };
  }
  createChunk(data, timestamp, duration, isKeyFrame) {
    return new EncodedAudioChunk({
      data,
      timestamp,
      duration,
      type: isKeyFrame ? "key" : "delta"
    });
  }
};
var getSampleIndexForTimestamp = (sampleTable, timescaleUnits) => {
  const index = binarySearchLessOrEqual(
    sampleTable.presentationTimestamps,
    timescaleUnits,
    (x) => x.presentationTimestamp
  );
  if (index === -1) {
    return -1;
  }
  return sampleTable.presentationTimestamps[index].sampleIndex;
};
var getSampleInfo = (sampleTable, sampleIndex) => {
  const timingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, sampleIndex, (x) => x.startIndex);
  const timingEntry = sampleTable.sampleTimingEntries[timingEntryIndex];
  if (!timingEntry || timingEntry.startIndex + timingEntry.count <= sampleIndex) {
    return null;
  }
  const decodeTimestamp = timingEntry.startDecodeTimestamp + (sampleIndex - timingEntry.startIndex) * timingEntry.delta;
  let presentationTimestamp = decodeTimestamp;
  const offsetEntryIndex = binarySearchLessOrEqual(
    sampleTable.sampleCompositionTimeOffsets,
    sampleIndex,
    (x) => x.startIndex
  );
  const offsetEntry = sampleTable.sampleCompositionTimeOffsets[offsetEntryIndex];
  if (offsetEntry) {
    presentationTimestamp += offsetEntry.offset;
  }
  const sampleSize = sampleTable.sampleSizes[Math.min(sampleIndex, sampleTable.sampleSizes.length - 1)];
  const chunkEntryIndex = binarySearchLessOrEqual(sampleTable.sampleToChunk, sampleIndex, (x) => x.startSampleIndex);
  const chunkEntry = sampleTable.sampleToChunk[chunkEntryIndex];
  assert(chunkEntry);
  const chunkIndex = chunkEntry.startChunkIndex + Math.floor((sampleIndex - chunkEntry.startSampleIndex) / chunkEntry.samplesPerChunk);
  const chunkOffset = sampleTable.chunkOffsets[chunkIndex];
  let chunkSize = 0;
  let sampleOffset = chunkOffset;
  if (sampleTable.sampleSizes.length === 1) {
    sampleOffset += sampleSize * (sampleIndex - chunkEntry.startSampleIndex);
    chunkSize += sampleSize * chunkEntry.samplesPerChunk;
  } else {
    const startSampleIndex = chunkEntry.startSampleIndex + (chunkIndex - chunkEntry.startChunkIndex) * chunkEntry.samplesPerChunk;
    for (let i = startSampleIndex; i < startSampleIndex + chunkEntry.samplesPerChunk; i++) {
      const sampleSize2 = sampleTable.sampleSizes[i];
      if (i < sampleIndex) {
        sampleOffset += sampleSize2;
      }
      chunkSize += sampleSize2;
    }
  }
  return {
    presentationTimestamp,
    duration: timingEntry.delta,
    sampleOffset,
    sampleSize,
    chunkOffset,
    chunkSize,
    isKeyFrame: sampleTable.keySampleIndices ? binarySearchExact(sampleTable.keySampleIndices, sampleIndex, (x) => x) !== -1 : true
  };
};
var getRelevantKeyframeIndexForSample = (sampleTable, sampleIndex) => {
  if (!sampleTable.keySampleIndices) {
    return sampleIndex;
  }
  const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, (x) => x);
  return sampleTable.keySampleIndices[index] ?? -1;
};
var getNextKeyframeIndexForSample = (sampleTable, sampleIndex) => {
  if (!sampleTable.keySampleIndices) {
    return sampleIndex + 1;
  }
  const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, (x) => x);
  return sampleTable.keySampleIndices[index + 1] ?? -1;
};
var offsetFragmentTrackDataByTimestamp = (trackData, timestamp) => {
  trackData.startTimestamp += timestamp;
  trackData.endTimestamp += timestamp;
  for (const sample of trackData.samples) {
    sample.presentationTimestamp += timestamp;
  }
  for (const entry of trackData.presentationTimestamps) {
    entry.presentationTimestamp += timestamp;
  }
};

// src/input-format.ts
var InputFormat = class {
};
var IsobmffInputFormat = class extends InputFormat {
  /** @internal */
  async _canReadInput(input) {
    const sourceSize = await input._mainReader.source._getSize();
    if (sourceSize < 8) {
      return false;
    }
    const isobmffReader = new IsobmffReader(input._mainReader);
    isobmffReader.pos = 4;
    const fourCc = isobmffReader.readAscii(4);
    return fourCc === "ftyp";
  }
  /** @internal */
  _createDemuxer(input) {
    return new IsobmffDemuxer(input);
  }
};
var MatroskaInputFormat = class extends InputFormat {
  /** @internal */
  async _canReadInput() {
    return false;
  }
  /** @internal */
  _createDemuxer() {
    throw new Error("Not implemented");
  }
};
var ISOBMFF = new IsobmffInputFormat();
var MP4 = ISOBMFF;
var MOV = ISOBMFF;
var MATROSKA = new MatroskaInputFormat();
var MKV = MATROSKA;
var WEBM = MATROSKA;
var ALL_FORMATS = [ISOBMFF, MKV];

// src/input.ts
var Input = class {
  constructor(options) {
    /** @internal */
    this._demuxerPromise = null;
    /** @internal */
    this._format = null;
    this._formats = options.formats;
    this._source = options.source;
    this._mainReader = new Reader(options.source);
  }
  /** @internal */
  _getDemuxer() {
    return this._demuxerPromise ??= (async () => {
      await this._mainReader.loadRange(0, 4096);
      for (const format of this._formats) {
        const canRead = await format._canReadInput(this);
        if (canRead) {
          this._format = format;
          return format._createDemuxer(this);
        }
      }
      throw new Error("Input has an unrecognizable format.");
    })();
  }
  async getFormat() {
    await this._getDemuxer();
    assert(this._format);
    return this._format;
  }
  async computeDuration() {
    const demuxer = await this._getDemuxer();
    return demuxer.computeDuration();
  }
  async getTracks() {
    const demuxer = await this._getDemuxer();
    return demuxer.getTracks();
  }
  async getVideoTracks() {
    const tracks = await this.getTracks();
    return tracks.filter((x) => x.isVideoTrack());
  }
  async getPrimaryVideoTrack() {
    const tracks = await this.getTracks();
    return tracks.find((x) => x.isVideoTrack()) ?? null;
  }
  async getAudioTracks() {
    const tracks = await this.getTracks();
    return tracks.filter((x) => x.isAudioTrack());
  }
  async getPrimaryAudioTrack() {
    const tracks = await this.getTracks();
    return tracks.find((x) => x.isAudioTrack()) ?? null;
  }
  async getMimeType() {
    const demuxer = await this._getDemuxer();
    return demuxer.getMimeType();
  }
};

// src/media-drain.ts
var BaseChunkDrain = class {
  async *chunks(startChunk, endTimestamp = Infinity) {
    const chunkQueue = [];
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let ended = false;
    const timestamps = [];
    const maxQueueSize = () => Math.max(2, timestamps.length);
    void (async () => {
      let chunk = startChunk ?? await this.getFirstChunk();
      while (chunk && !ended) {
        if (chunk.timestamp / 1e6 >= endTimestamp) {
          break;
        }
        if (chunkQueue.length > maxQueueSize()) {
          ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
          await queueDequeue;
          continue;
        }
        chunkQueue.push(chunk);
        onQueueNotEmpty();
        ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
        chunk = await this.getNextChunk(chunk);
      }
      ended = true;
      onQueueNotEmpty();
    })();
    try {
      while (true) {
        if (chunkQueue.length > 0) {
          yield chunkQueue.shift();
          const now = performance.now();
          timestamps.push(now);
          while (timestamps.length > 0 && now - timestamps[0] >= 1e3) {
            timestamps.shift();
          }
          onQueueDequeue();
        } else if (!ended) {
          await queueNotEmpty;
        } else {
          break;
        }
      }
    } finally {
      ended = true;
      onQueueDequeue();
    }
  }
};
var BaseMediaFrameDrain = class {
  /** @internal */
  _duplicateFrame(frame) {
    return structuredClone(frame);
  }
  async *mediaFramesAtTimestamps(timestamps) {
    const timestampIterator = toAsyncIterator(timestamps);
    const timestampsOfInterest = [];
    const frameQueue = [];
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let decoderIsFlushed = false;
    let ended = false;
    const MAX_QUEUE_SIZE = 8;
    let lastUsedFrame = null;
    const pushToQueue = (frame) => {
      frameQueue.push(frame);
      onQueueNotEmpty();
      ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
    };
    const decoder = await this._createDecoder((frame) => {
      onQueueDequeue();
      if (ended) {
        frame.close();
        return;
      }
      let frameUsed = false;
      while (timestampsOfInterest.length > 0 && timestampsOfInterest[0] === frame.timestamp) {
        pushToQueue(this._duplicateFrame(frame));
        timestampsOfInterest.shift();
        frameUsed = true;
      }
      if (frameUsed) {
        lastUsedFrame?.close();
        lastUsedFrame = frame;
      } else {
        frame.close();
      }
    });
    void (async () => {
      const chunkDrain = this._createChunkDrain();
      let lastKeyChunk = null;
      let lastChunk = null;
      for await (const timestamp of timestampIterator) {
        while (frameQueue.length + decoder.decodeQueueSize > MAX_QUEUE_SIZE) {
          ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
          await queueDequeue;
        }
        if (ended) {
          break;
        }
        const targetChunk = await chunkDrain.getChunk(timestamp);
        if (!targetChunk) {
          pushToQueue(null);
          continue;
        }
        const keyChunk = await chunkDrain.getKeyChunk(timestamp);
        if (!keyChunk) {
          pushToQueue(null);
          continue;
        }
        timestampsOfInterest.push(targetChunk.timestamp);
        if (lastKeyChunk && keyChunk.timestamp === lastKeyChunk.timestamp && targetChunk.timestamp >= lastChunk.timestamp) {
          assert(lastChunk);
          if (targetChunk.timestamp === lastChunk.timestamp && timestampsOfInterest.length === 1) {
            if (lastUsedFrame) {
              pushToQueue(this._duplicateFrame(lastUsedFrame));
            }
            timestampsOfInterest.shift();
          }
        } else {
          lastKeyChunk = keyChunk;
          lastChunk = keyChunk;
          decoder.decode(keyChunk);
        }
        while (lastChunk.timestamp !== targetChunk.timestamp) {
          const nextChunk = await chunkDrain.getNextChunk(lastChunk);
          assert(nextChunk);
          lastChunk = nextChunk;
          decoder.decode(nextChunk);
        }
        if (decoder.decodeQueueSize >= 10) {
          await new Promise((resolve) => decoder.addEventListener("dequeue", resolve, { once: true }));
        }
      }
      await decoder.flush();
      decoder.close();
      decoderIsFlushed = true;
      onQueueNotEmpty();
    })();
    try {
      while (true) {
        if (frameQueue.length > 0) {
          const nextFrame = frameQueue.shift();
          assert(nextFrame !== void 0);
          yield nextFrame;
          onQueueDequeue();
        } else if (!decoderIsFlushed) {
          await queueNotEmpty;
        } else {
          break;
        }
      }
    } finally {
      ended = true;
      onQueueDequeue();
      for (const frame of frameQueue) {
        frame?.close();
      }
      lastUsedFrame?.close();
    }
  }
  async *mediaFramesInRange(startTimestamp = 0, endTimestamp = Infinity) {
    const frameQueue = [];
    let firstFrameQueued = false;
    let lastFrame = null;
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let decoderIsFlushed = false;
    let ended = false;
    const MAX_QUEUE_SIZE = 8;
    const decoder = await this._createDecoder((frame) => {
      onQueueDequeue();
      const frameTimestamp = frame.timestamp / 1e6;
      if (frameTimestamp >= endTimestamp) {
        ended = true;
      }
      if (ended) {
        frame.close();
        return;
      }
      if (lastFrame) {
        if (frameTimestamp > startTimestamp) {
          frameQueue.push(lastFrame);
          firstFrameQueued = true;
        } else {
          lastFrame.close();
        }
      }
      if (frameTimestamp >= startTimestamp) {
        frameQueue.push(frame);
        firstFrameQueued = true;
      }
      lastFrame = firstFrameQueued ? null : frame;
      if (frameQueue.length > 0) {
        onQueueNotEmpty();
        ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
      }
    });
    const chunkDrain = this._createChunkDrain();
    const keyChunk = await chunkDrain.getKeyChunk(startTimestamp) ?? await chunkDrain.getFirstChunk();
    if (!keyChunk) {
      return;
    }
    void (async () => {
      let currentChunk = keyChunk;
      let chunksEndTimestamp = Infinity;
      if (endTimestamp < Infinity) {
        const endFrame = await chunkDrain.getChunk(endTimestamp);
        const endKeyFrame = !endFrame ? null : endFrame.type === "key" && endFrame.timestamp / 1e6 === endTimestamp ? endFrame : await chunkDrain.getNextKeyChunk(endFrame);
        if (endKeyFrame) {
          chunksEndTimestamp = endKeyFrame.timestamp / 1e6;
        }
      }
      const chunks = chunkDrain.chunks(keyChunk, chunksEndTimestamp);
      await chunks.next();
      while (currentChunk && !ended) {
        if (frameQueue.length + decoder.decodeQueueSize > MAX_QUEUE_SIZE) {
          ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
          await queueDequeue;
          continue;
        }
        decoder.decode(currentChunk);
        const chunkResult = await chunks.next();
        if (chunkResult.done) {
          break;
        }
        currentChunk = chunkResult.value;
      }
      await chunks.return();
      await decoder.flush();
      decoder.close();
      if (!firstFrameQueued && lastFrame) {
        frameQueue.push(lastFrame);
      }
      decoderIsFlushed = true;
      onQueueNotEmpty();
    })();
    try {
      while (true) {
        if (frameQueue.length > 0) {
          yield frameQueue.shift();
          onQueueDequeue();
        } else if (!decoderIsFlushed) {
          await queueNotEmpty;
        } else {
          break;
        }
      }
    } finally {
      ended = true;
      onQueueDequeue();
      for (const frame of frameQueue) {
        frame.close();
      }
    }
  }
};
var EncodedVideoChunkDrain = class extends BaseChunkDrain {
  constructor(videoTrack) {
    super();
    this._videoTrack = videoTrack;
  }
  getFirstChunk(options = {}) {
    return this._videoTrack._backing.getFirstChunk(options);
  }
  getChunk(timestamp, options = {}) {
    return this._videoTrack._backing.getChunk(timestamp, options);
  }
  getNextChunk(chunk, options = {}) {
    return this._videoTrack._backing.getNextChunk(chunk, options);
  }
  getKeyChunk(timestamp, options = {}) {
    return this._videoTrack._backing.getKeyChunk(timestamp, options);
  }
  getNextKeyChunk(chunk, options = {}) {
    return this._videoTrack._backing.getNextKeyChunk(chunk, options);
  }
};
var VideoFrameDrain = class extends BaseMediaFrameDrain {
  constructor(videoTrack) {
    super();
    /** @internal */
    this._decoderConfig = null;
    this._videoTrack = videoTrack;
  }
  /** @internal */
  async _createDecoder(onFrame) {
    this._decoderConfig ??= await this._videoTrack.getDecoderConfig();
    const decoder = new VideoDecoder({
      output: onFrame,
      error: (error) => console.error(error)
    });
    decoder.configure(this._decoderConfig);
    return decoder;
  }
  /** @internal */
  _createChunkDrain() {
    return new EncodedVideoChunkDrain(this._videoTrack);
  }
  async getFrame(timestamp) {
    for await (const frame of this.mediaFramesAtTimestamps([timestamp])) {
      return frame;
    }
    throw new Error("Internal error: Iterator returned nothing.");
  }
  frames(startTimestamp = 0, endTimestamp = Infinity) {
    return this.mediaFramesInRange(startTimestamp, endTimestamp);
  }
  framesAtTimestamps(timestamps) {
    return this.mediaFramesAtTimestamps(timestamps);
  }
};
var CanvasDrain = class {
  constructor(videoTrack, dimensions) {
    this._videoTrack = videoTrack;
    this._dimensions = dimensions;
    this._videoFrameDrain = new VideoFrameDrain(videoTrack);
  }
  /** @internal */
  async _videoFrameToWrappedCanvas(frame) {
    const width = this._dimensions?.width ?? await this._videoTrack.getDisplayWidth();
    const height = this._dimensions?.height ?? await this._videoTrack.getDisplayHeight();
    const rotation = await this._videoTrack.getRotation();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    assert(context);
    context.translate(width / 2, height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.translate(-width / 2, -height / 2);
    const [imageWidth, imageHeight] = rotation % 180 === 0 ? [width, height] : [height, width];
    context.drawImage(frame, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    const result = {
      canvas,
      timestamp: frame.timestamp / 1e6,
      duration: (frame.duration ?? 0) / 1e6
    };
    frame.close();
    return result;
  }
  async getCanvas(timestamp) {
    const frame = await this._videoFrameDrain.getFrame(timestamp);
    return frame && this._videoFrameToWrappedCanvas(frame);
  }
  async *canvases(startTimestamp = 0, endTimestamp = Infinity) {
    for await (const frame of this._videoFrameDrain.frames(startTimestamp, endTimestamp)) {
      yield this._videoFrameToWrappedCanvas(frame);
    }
  }
  async *canvasesAtTimestamps(timestamps) {
    for await (const frame of this._videoFrameDrain.framesAtTimestamps(timestamps)) {
      yield frame && this._videoFrameToWrappedCanvas(frame);
    }
  }
};
var EncodedAudioChunkDrain = class extends BaseChunkDrain {
  constructor(audioTrack) {
    super();
    this._audioTrack = audioTrack;
  }
  getFirstChunk(options = {}) {
    return this._audioTrack._backing.getFirstChunk(options);
  }
  getChunk(timestamp, options = {}) {
    return this._audioTrack._backing.getChunk(timestamp, options);
  }
  getNextChunk(chunk, options = {}) {
    return this._audioTrack._backing.getNextChunk(chunk, options);
  }
  getKeyChunk(timestamp, options = {}) {
    return this._audioTrack._backing.getKeyChunk(timestamp, options);
  }
  getNextKeyChunk(chunk, options = {}) {
    return this._audioTrack._backing.getNextKeyChunk(chunk, options);
  }
};
var AudioDataDrain = class extends BaseMediaFrameDrain {
  constructor(audioTrack) {
    super();
    /** @internal */
    this._decoderConfig = null;
    this._audioTrack = audioTrack;
  }
  /** @internal */
  async _createDecoder(onData) {
    this._decoderConfig ??= await this._audioTrack.getDecoderConfig();
    const decoder = new AudioDecoder({
      output: onData,
      error: (error) => console.error(error)
    });
    decoder.configure(this._decoderConfig);
    return decoder;
  }
  /** @internal */
  _createChunkDrain() {
    return new EncodedAudioChunkDrain(this._audioTrack);
  }
  async getData(timestamp) {
    for await (const data of this.mediaFramesAtTimestamps([timestamp])) {
      return data;
    }
    throw new Error("Internal error: Iterator returned nothing.");
  }
  data(startTimestamp = 0, endTimestamp = Infinity) {
    return this.mediaFramesInRange(startTimestamp, endTimestamp);
  }
  dataAtTimestamps(timestamps) {
    return this.mediaFramesAtTimestamps(timestamps);
  }
};
var AudioBufferDrain = class {
  constructor(audioTrack) {
    this._audioDataDrain = new AudioDataDrain(audioTrack);
  }
  /** @internal */
  _audioDataToWrappedArrayBuffer(data) {
    const audioBuffer = new AudioBuffer({
      numberOfChannels: data.numberOfChannels,
      length: data.numberOfFrames,
      sampleRate: data.sampleRate
    });
    const dataBytes = new Float32Array(data.allocationSize({ planeIndex: 0, format: "f32-planar" }) / 4);
    for (let i = 0; i < data.numberOfChannels; i++) {
      data.copyTo(dataBytes, { planeIndex: i, format: "f32-planar" });
      audioBuffer.copyToChannel(dataBytes, i);
    }
    const sampleDuration = 1 / data.sampleRate;
    const result = {
      buffer: audioBuffer,
      // Rounding the timestamp based on the sample duration removes audio playback artifacts
      timestamp: Math.round(data.timestamp / 1e6 / sampleDuration) * sampleDuration
    };
    data.close();
    return result;
  }
  async getBuffer(timestamp) {
    const data = await this._audioDataDrain.getData(timestamp);
    return data && this._audioDataToWrappedArrayBuffer(data);
  }
  async *buffers(startTimestamp = 0, endTimestamp = Infinity) {
    for await (const data of this._audioDataDrain.data(startTimestamp, endTimestamp)) {
      yield this._audioDataToWrappedArrayBuffer(data);
    }
  }
  async *buffersAtTimestamps(timestamps) {
    for await (const data of this._audioDataDrain.dataAtTimestamps(timestamps)) {
      yield data && this._audioDataToWrappedArrayBuffer(data);
    }
  }
};
export {
  ALL_FORMATS,
  AUDIO_CODECS,
  ArrayBufferSource,
  ArrayBufferTarget,
  AudioBufferDrain,
  AudioBufferSource,
  AudioDataDrain,
  AudioDataSource,
  AudioSource,
  BaseChunkDrain,
  BaseMediaFrameDrain,
  BlobSource,
  CanvasDrain,
  CanvasSource,
  EncodedAudioChunkDrain,
  EncodedAudioChunkSource,
  EncodedVideoChunkDrain,
  EncodedVideoChunkSource,
  ISOBMFF,
  Input,
  InputAudioTrack,
  InputFormat,
  InputTrack,
  InputVideoTrack,
  IsobmffInputFormat,
  MATROSKA,
  MKV,
  MOV,
  MP4,
  MatroskaInputFormat,
  MediaSource,
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  MkvOutputFormat2 as MkvOutputFormat,
  Mp4OutputFormat,
  Output,
  OutputFormat,
  SUBTITLE_CODECS,
  Source,
  StreamTarget,
  SubtitleSource,
  Target,
  TextSubtitleSource,
  VIDEO_CODECS,
  VideoFrameDrain,
  VideoFrameSource,
  VideoSource,
  WEBM,
  WebMOutputFormat
};
