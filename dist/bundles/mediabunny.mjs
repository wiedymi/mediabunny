/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/subtitles.ts
var subtitles_exports = {};
__export(subtitles_exports, {
  SubtitleParser: () => SubtitleParser,
  convertDialogueLineToMkvFormat: () => convertDialogueLineToMkvFormat,
  formatAssTimestamp: () => formatAssTimestamp,
  formatCuesToAss: () => formatCuesToAss,
  formatCuesToSrt: () => formatCuesToSrt,
  formatCuesToWebVTT: () => formatCuesToWebVTT,
  formatSrtTimestamp: () => formatSrtTimestamp,
  formatSubtitleTimestamp: () => formatSubtitleTimestamp,
  inlineTimestampRegex: () => inlineTimestampRegex,
  parseAssTimestamp: () => parseAssTimestamp,
  parseSrtTimestamp: () => parseSrtTimestamp,
  parseSubtitleTimestamp: () => parseSubtitleTimestamp,
  splitAssIntoCues: () => splitAssIntoCues,
  splitSrtIntoCues: () => splitSrtIntoCues
});
var cueBlockHeaderRegex, preambleStartRegex, inlineTimestampRegex, SubtitleParser, timestampRegex, parseSubtitleTimestamp, formatSubtitleTimestamp, srtTimestampRegex, parseSrtTimestamp, formatSrtTimestamp, splitSrtIntoCues, extractTextFromAssCue, formatCuesToSrt, formatCuesToWebVTT, assTimestampRegex, parseAssTimestamp, formatAssTimestamp, splitAssIntoCues, parseAssFormat, convertDialogueLineToMkvFormat, formatCuesToAss;
var init_subtitles = __esm({
  "src/subtitles.ts"() {
    "use strict";
    cueBlockHeaderRegex = /(?:(.+?)\n)?((?:\d{2}:)?\d{2}:\d{2}.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}.\d{3})/g;
    preambleStartRegex = /^WEBVTT(.|\n)*?\n{2}/;
    inlineTimestampRegex = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g;
    SubtitleParser = class {
      constructor(options) {
        this.preambleText = null;
        this.preambleEmitted = false;
        this.options = options;
      }
      parse(text) {
        if (this.options.codec === "srt") {
          this.parseSrt(text);
        } else if (this.options.codec === "ass" || this.options.codec === "ssa") {
          this.parseAss(text);
        } else if (this.options.codec === "tx3g") {
          this.parseTx3g(text);
        } else if (this.options.codec === "ttml") {
          this.parseTtml(text);
        } else {
          this.parseWebVTT(text);
        }
      }
      parseSrt(text) {
        const cues = splitSrtIntoCues(text);
        for (let i = 0; i < cues.length; i++) {
          const meta = {};
          if (i === 0) {
            meta.config = { description: "" };
          }
          this.options.output(cues[i], meta);
        }
      }
      parseAss(text) {
        const { header, cues } = splitAssIntoCues(text);
        for (let i = 0; i < cues.length; i++) {
          const meta = {};
          if (i === 0 && header) {
            meta.config = { description: header };
          }
          this.options.output(cues[i], meta);
        }
      }
      parseWebVTT(text) {
        text = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
        cueBlockHeaderRegex.lastIndex = 0;
        let match;
        if (!this.preambleText) {
          if (!preambleStartRegex.test(text)) {
            throw new Error("WebVTT preamble incorrect.");
          }
          match = cueBlockHeaderRegex.exec(text);
          const preamble = text.slice(0, match?.index ?? text.length).trimEnd();
          if (!preamble) {
            throw new Error("No WebVTT preamble provided.");
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
      parseTx3g(text) {
        const meta = { config: { description: "" } };
        const cue = {
          timestamp: 0,
          duration: 0,
          text: text.trim()
        };
        this.options.output(cue, meta);
      }
      parseTtml(text) {
        const pRegex = /<p[^>]*>(.*?)<\/p>/gs;
        const matches = [...text.matchAll(pRegex)];
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const content = match[1]?.replace(/<[^>]+>/g, "") || "";
          const meta = {};
          if (i === 0) {
            meta.config = { description: "" };
          }
          const cue = {
            timestamp: 0,
            duration: 0,
            text: content.trim()
          };
          this.options.output(cue, meta);
        }
      }
    };
    timestampRegex = /(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})/;
    parseSubtitleTimestamp = (string) => {
      const match = timestampRegex.exec(string);
      if (!match) throw new Error("Expected match.");
      return 60 * 60 * 1e3 * Number(match[1] || "0") + 60 * 1e3 * Number(match[2]) + 1e3 * Number(match[3]) + Number(match[4]);
    };
    formatSubtitleTimestamp = (timestamp) => {
      const hours = Math.floor(timestamp / (60 * 60 * 1e3));
      const minutes = Math.floor(timestamp % (60 * 60 * 1e3) / (60 * 1e3));
      const seconds = Math.floor(timestamp % (60 * 1e3) / 1e3);
      const milliseconds = timestamp % 1e3;
      return hours.toString().padStart(2, "0") + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0") + "." + milliseconds.toString().padStart(3, "0");
    };
    srtTimestampRegex = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
    parseSrtTimestamp = (timeString) => {
      const match = srtTimestampRegex.exec(timeString);
      if (!match) throw new Error("Invalid SRT timestamp format");
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      const milliseconds = Number(match[4]);
      return hours * 3600 + minutes * 60 + seconds + milliseconds / 1e3;
    };
    formatSrtTimestamp = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor(seconds % 3600 / 60);
      const secs = Math.floor(seconds % 60);
      const milliseconds = Math.round(seconds % 1 * 1e3);
      return hours.toString().padStart(2, "0") + ":" + minutes.toString().padStart(2, "0") + ":" + secs.toString().padStart(2, "0") + "," + milliseconds.toString().padStart(3, "0");
    };
    splitSrtIntoCues = (text) => {
      text = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
      const cues = [];
      const cueRegex = /(\d+)\n(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})\n([\s\S]*?)(?=\n\n\d+\n|\n*$)/g;
      let match;
      while (match = cueRegex.exec(text)) {
        const startTime = parseSrtTimestamp(match[2]);
        const endTime = parseSrtTimestamp(match[3]);
        const cueText = match[4].trim();
        cues.push({
          timestamp: startTime,
          duration: endTime - startTime,
          text: cueText,
          identifier: match[1]
        });
      }
      return cues;
    };
    extractTextFromAssCue = (text) => {
      if (text.startsWith("Dialogue:") || text.startsWith("Comment:")) {
        const colonIndex = text.indexOf(":");
        if (colonIndex === -1) return text;
        const afterColon = text.substring(colonIndex + 1);
        const parts2 = afterColon.split(",");
        if (parts2.length >= 10) {
          return parts2.slice(9).join(",");
        }
      }
      const parts = text.split(",");
      if (parts.length >= 8) {
        const firstPart = parts[0]?.trim();
        const secondPart = parts[1]?.trim();
        if (firstPart && !isNaN(parseInt(firstPart))) {
          if (secondPart && !isNaN(parseInt(secondPart)) && parts.length >= 9) {
            return parts.slice(8).join(",");
          } else if (parts.length >= 8) {
            return parts.slice(7).join(",");
          }
        }
      }
      return text;
    };
    formatCuesToSrt = (cues) => {
      return cues.map((cue, index) => {
        const sequenceNumber = index + 1;
        const startTime = formatSrtTimestamp(cue.timestamp);
        const endTime = formatSrtTimestamp(cue.timestamp + cue.duration);
        const text = extractTextFromAssCue(cue.text);
        return `${sequenceNumber}
${startTime} --> ${endTime}
${text}
`;
      }).join("\n");
    };
    formatCuesToWebVTT = (cues, preamble) => {
      let result = preamble || "WEBVTT\n";
      if (!result.endsWith("\n\n")) {
        result += "\n";
      }
      const formattedCues = cues.map((cue) => {
        const startTime = formatSubtitleTimestamp(cue.timestamp * 1e3);
        const endTime = formatSubtitleTimestamp((cue.timestamp + cue.duration) * 1e3);
        const text = extractTextFromAssCue(cue.text);
        return `${startTime} --> ${endTime}
${text}`;
      });
      return result + formattedCues.join("\n\n");
    };
    assTimestampRegex = /(\d+):(\d{2}):(\d{2})\.(\d{2})/;
    parseAssTimestamp = (timeString) => {
      const match = assTimestampRegex.exec(timeString);
      if (!match) throw new Error("Invalid ASS timestamp format");
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      const centiseconds = Number(match[4]);
      return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
    };
    formatAssTimestamp = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor(seconds % 3600 / 60);
      const secs = Math.floor(seconds % 60);
      const centiseconds = Math.floor(seconds % 1 * 100);
      return hours.toString() + ":" + minutes.toString().padStart(2, "0") + ":" + secs.toString().padStart(2, "0") + "." + centiseconds.toString().padStart(2, "0");
    };
    splitAssIntoCues = (text) => {
      text = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
      const lines = text.split("\n");
      const eventsIndex = lines.findIndex((line) => line.trim() === "[Events]");
      if (eventsIndex === -1) {
        return { header: text, cues: [] };
      }
      const headerSections = [];
      const eventsHeader = [];
      const eventLines = [];
      const postEventsSections = [];
      let currentSection = headerSections;
      let inEventsSection = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && line.startsWith("[") && line.endsWith("]")) {
          const trimmedLine = line.trim();
          if (trimmedLine === "[Events]") {
            inEventsSection = true;
            eventsHeader.push(line);
            continue;
          }
          if (inEventsSection) {
            currentSection = postEventsSections;
            inEventsSection = false;
          }
          currentSection.push(line);
          continue;
        }
        if (inEventsSection) {
          if (!line) {
            continue;
          }
          if (line.startsWith("Format:")) {
            eventsHeader.push(line);
          } else if (line.startsWith("Dialogue:")) {
            eventLines.push(line);
          } else if (line.startsWith("Comment:")) {
            eventsHeader.push(line);
          }
        } else {
          if (line !== void 0) {
            currentSection.push(line);
          }
        }
      }
      const header = [
        ...headerSections,
        ...eventsHeader,
        // Includes [Events], Format:, and Comment: lines
        ...postEventsSections
      ].join("\n");
      const cues = [];
      for (const line of eventLines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;
        const parts = line.substring(colonIndex + 1).split(",");
        if (parts.length < 10) continue;
        try {
          const startTime = parseAssTimestamp(parts[1].trim());
          const endTime = parseAssTimestamp(parts[2].trim());
          cues.push({
            timestamp: startTime,
            duration: endTime - startTime,
            text: line
            // Store the entire line (Dialogue: or Comment:)
          });
        } catch {
          continue;
        }
      }
      return { header, cues };
    };
    parseAssFormat = (formatLine) => {
      const fields = formatLine.substring(formatLine.indexOf(":") + 1).split(",").map((f) => f.trim());
      const fieldMap = /* @__PURE__ */ new Map();
      fields.forEach((field, index) => {
        fieldMap.set(field, index);
      });
      return fieldMap;
    };
    convertDialogueLineToMkvFormat = (line) => {
      const match = /^(Dialogue|Comment):\s*(\d+),\d+:\d{2}:\d{2}\.\d{2},\d+:\d{2}:\d{2}\.\d{2},(.*)$/.exec(line);
      if (match) {
        const layer = match[2];
        const restFields = match[3];
        return `${layer},${restFields}`;
      }
      if (line.startsWith("Dialogue:") || line.startsWith("Comment:")) {
        return line.substring(line.indexOf(":") + 1).trim();
      }
      return line;
    };
    formatCuesToAss = (cues, header) => {
      if (!header || header.trim() === "") {
        header = `[Script Info]
Title: Default
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
      }
      const headerLines = header.split("\n");
      const eventsIndex = headerLines.findIndex((line) => line.trim() === "[Events]");
      if (eventsIndex === -1) {
        return header + `

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
` + cues.map((c) => c.text).join("\n");
      }
      let formatIndex = -1;
      let formatLine = "";
      for (let i = eventsIndex + 1; i < headerLines.length; i++) {
        const line = headerLines[i];
        if (line && line.trim().startsWith("Format:")) {
          formatIndex = i;
          formatLine = line;
          break;
        }
        if (line && line.startsWith("[") && line.endsWith("]")) {
          break;
        }
      }
      const fieldMap = formatLine ? parseAssFormat(formatLine) : null;
      const dialogueLines = cues.map((cue) => {
        if (cue.text.startsWith("Dialogue:") || cue.text.startsWith("Comment:")) {
          if (/^(Dialogue|Comment):\s*\d+,\d+:\d{2}:\d{2}\.\d{2},\d+:\d{2}:\d{2}\.\d{2},/.test(cue.text)) {
            return cue.text;
          }
        }
        let params = cue.text;
        const isComment = params.startsWith("Comment:");
        const prefix = isComment ? "Comment:" : "Dialogue:";
        if (params.startsWith("Dialogue:") || params.startsWith("Comment:")) {
          params = params.substring(params.indexOf(":") + 1).trim();
        }
        const parts = params.split(",");
        const startTime = formatAssTimestamp(cue.timestamp);
        const endTime = formatAssTimestamp(cue.timestamp + cue.duration);
        let layer;
        let restFields;
        const blockHasReadOrder = parts.length >= 9 && !isNaN(parseInt(parts[0])) && !isNaN(parseInt(parts[1]));
        const blockHasLayer = parts.length >= 8 && !isNaN(parseInt(parts[0]));
        if (blockHasReadOrder) {
          layer = parts[1] || "0";
          restFields = parts.slice(2);
        } else if (blockHasLayer) {
          layer = parts[0] || "0";
          restFields = parts.slice(1);
        } else {
          return `${prefix} 0,${startTime},${endTime},Default,,0,0,0,,${cue.text}`;
        }
        return `${prefix} ${layer},${startTime},${endTime},${restFields.join(",")}`;
      });
      if (formatIndex === -1) {
        return header + "\n" + dialogueLines.join("\n");
      }
      const commentLines = [];
      let nextSectionIndex = headerLines.length;
      for (let i = formatIndex + 1; i < headerLines.length; i++) {
        const line = headerLines[i];
        if (line && line.startsWith("Comment:")) {
          commentLines.push(line);
        }
        if (line && line.startsWith("[") && line.endsWith("]")) {
          nextSectionIndex = i;
          break;
        }
      }
      const beforeDialogues = headerLines.slice(0, formatIndex + 1);
      const afterDialogues = headerLines.slice(nextSectionIndex);
      return [
        ...beforeDialogues,
        ...dialogueLines,
        ...commentLines,
        ...afterDialogues
      ].join("\n");
    };
  }
});

// (disabled):src/node
var require_node = __commonJS({
  "(disabled):src/node"() {
  }
});

// src/misc.ts
function assert(x) {
  if (!x) {
    throw new Error("Assertion failed.");
  }
}
var normalizeRotation = (rotation) => {
  const mappedRotation = (rotation % 360 + 360) % 360;
  if (mappedRotation === 0 || mappedRotation === 90 || mappedRotation === 180 || mappedRotation === 270) {
    return mappedRotation;
  } else {
    throw new Error(`Invalid rotation ${rotation}.`);
  }
};
var last = (arr) => {
  return arr && arr[arr.length - 1];
};
var isU32 = (value) => {
  return value >= 0 && value < 2 ** 32;
};
var Bitstream = class _Bitstream {
  constructor(bytes2) {
    this.bytes = bytes2;
    /** Current offset in bits. */
    this.pos = 0;
  }
  seekToByte(byteOffset) {
    this.pos = 8 * byteOffset;
  }
  readBit() {
    const byteIndex = Math.floor(this.pos / 8);
    const byte = this.bytes[byteIndex] ?? 0;
    const bitIndex = 7 - (this.pos & 7);
    const bit = (byte & 1 << bitIndex) >> bitIndex;
    this.pos++;
    return bit;
  }
  readBits(n) {
    if (n === 1) {
      return this.readBit();
    }
    let result = 0;
    for (let i = 0; i < n; i++) {
      result <<= 1;
      result |= this.readBit();
    }
    return result;
  }
  writeBits(n, value) {
    const end = this.pos + n;
    for (let i = this.pos; i < end; i++) {
      const byteIndex = Math.floor(i / 8);
      let byte = this.bytes[byteIndex];
      const bitIndex = 7 - (i & 7);
      byte &= ~(1 << bitIndex);
      byte |= (value & 1 << end - i - 1) >> end - i - 1 << bitIndex;
      this.bytes[byteIndex] = byte;
    }
    this.pos = end;
  }
  readAlignedByte() {
    if (this.pos % 8 !== 0) {
      throw new Error("Bitstream is not byte-aligned.");
    }
    const byteIndex = this.pos / 8;
    const byte = this.bytes[byteIndex] ?? 0;
    this.pos += 8;
    return byte;
  }
  skipBits(n) {
    this.pos += n;
  }
  getBitsLeft() {
    return this.bytes.length * 8 - this.pos;
  }
  clone() {
    const clone = new _Bitstream(this.bytes);
    clone.pos = this.pos;
    return clone;
  }
};
var readExpGolomb = (bitstream) => {
  let leadingZeroBits = 0;
  while (bitstream.readBits(1) === 0 && leadingZeroBits < 32) {
    leadingZeroBits++;
  }
  if (leadingZeroBits >= 32) {
    throw new Error("Invalid exponential-Golomb code.");
  }
  const result = (1 << leadingZeroBits) - 1 + bitstream.readBits(leadingZeroBits);
  return result;
};
var readSignedExpGolomb = (bitstream) => {
  const codeNum = readExpGolomb(bitstream);
  return (codeNum & 1) === 0 ? -(codeNum >> 1) : codeNum + 1 >> 1;
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
  if (source.constructor === Uint8Array) {
    return source;
  } else if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  } else {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }
};
var toDataView = (source) => {
  if (source.constructor === DataView) {
    return source;
  } else if (source instanceof ArrayBuffer) {
    return new DataView(source);
  } else {
    return new DataView(source.buffer, source.byteOffset, source.byteLength);
  }
};
var textDecoder = new TextDecoder();
var textEncoder = new TextEncoder();
var isIso88591Compatible = (text) => {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 255) {
      return false;
    }
  }
  return true;
};
var invertObject = (object) => {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [value, key]));
};
var COLOR_PRIMARIES_MAP = {
  bt709: 1,
  // ITU-R BT.709
  bt470bg: 5,
  // ITU-R BT.470BG
  smpte170m: 6,
  // ITU-R BT.601 525 - SMPTE 170M
  bt2020: 9,
  // ITU-R BT.202
  smpte432: 12
  // SMPTE EG 432-1
};
var COLOR_PRIMARIES_MAP_INVERSE = invertObject(COLOR_PRIMARIES_MAP);
var TRANSFER_CHARACTERISTICS_MAP = {
  "bt709": 1,
  // ITU-R BT.709
  "smpte170m": 6,
  // SMPTE 170M
  "linear": 8,
  // Linear transfer characteristics
  "iec61966-2-1": 13,
  // IEC 61966-2-1
  "pg": 16,
  // Rec. ITU-R BT.2100-2 perceptual quantization (PQ) system
  "hlg": 18
  // Rec. ITU-R BT.2100-2 hybrid loggamma (HLG) system
};
var TRANSFER_CHARACTERISTICS_MAP_INVERSE = invertObject(TRANSFER_CHARACTERISTICS_MAP);
var MATRIX_COEFFICIENTS_MAP = {
  "rgb": 0,
  // Identity
  "bt709": 1,
  // ITU-R BT.709
  "bt470bg": 5,
  // ITU-R BT.470BG
  "smpte170m": 6,
  // SMPTE 170M
  "bt2020-ncl": 9
  // ITU-R BT.2020-2 (non-constant luminance)
};
var MATRIX_COEFFICIENTS_MAP_INVERSE = invertObject(MATRIX_COEFFICIENTS_MAP);
var colorSpaceIsComplete = (colorSpace) => {
  return !!colorSpace && !!colorSpace.primaries && !!colorSpace.transfer && !!colorSpace.matrix && colorSpace.fullRange !== void 0;
};
var isAllowSharedBufferSource = (x) => {
  return x instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && x instanceof SharedArrayBuffer || ArrayBuffer.isView(x);
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
  let ans = -1;
  while (low <= high) {
    const mid = low + high >> 1;
    const midVal = valueGetter(arr[mid]);
    if (midVal === key) {
      ans = mid;
      high = mid - 1;
    } else if (midVal < key) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ans;
};
var binarySearchLessOrEqual = (arr, key, valueGetter) => {
  let low = 0;
  let high = arr.length - 1;
  let ans = -1;
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
var insertSorted = (arr, item, valueGetter) => {
  const insertionIndex = binarySearchLessOrEqual(arr, valueGetter(item), valueGetter);
  arr.splice(insertionIndex + 1, 0, item);
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
var findLast = (arr, predicate) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      return arr[i];
    }
  }
  return void 0;
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
var validateAnyIterable = (iterable) => {
  if (!(Symbol.iterator in iterable) && !(Symbol.asyncIterator in iterable)) {
    throw new TypeError("Argument must be an iterable or async iterable.");
  }
};
var assertNever = (x) => {
  throw new Error(`Unexpected value: ${x}`);
};
var getUint24 = (view2, byteOffset, littleEndian) => {
  const byte1 = view2.getUint8(byteOffset);
  const byte2 = view2.getUint8(byteOffset + 1);
  const byte3 = view2.getUint8(byteOffset + 2);
  if (littleEndian) {
    return byte1 | byte2 << 8 | byte3 << 16;
  } else {
    return byte1 << 16 | byte2 << 8 | byte3;
  }
};
var getInt24 = (view2, byteOffset, littleEndian) => {
  return getUint24(view2, byteOffset, littleEndian) << 8 >> 8;
};
var setUint24 = (view2, byteOffset, value, littleEndian) => {
  value = value >>> 0;
  value = value & 16777215;
  if (littleEndian) {
    view2.setUint8(byteOffset, value & 255);
    view2.setUint8(byteOffset + 1, value >>> 8 & 255);
    view2.setUint8(byteOffset + 2, value >>> 16 & 255);
  } else {
    view2.setUint8(byteOffset, value >>> 16 & 255);
    view2.setUint8(byteOffset + 1, value >>> 8 & 255);
    view2.setUint8(byteOffset + 2, value & 255);
  }
};
var setInt24 = (view2, byteOffset, value, littleEndian) => {
  value = clamp(value, -8388608, 8388607);
  if (value < 0) {
    value = value + 16777216 & 16777215;
  }
  setUint24(view2, byteOffset, value, littleEndian);
};
var setInt64 = (view2, byteOffset, value, littleEndian) => {
  if (littleEndian) {
    view2.setUint32(byteOffset + 0, value, true);
    view2.setInt32(byteOffset + 4, Math.floor(value / 2 ** 32), true);
  } else {
    view2.setInt32(byteOffset + 0, Math.floor(value / 2 ** 32), true);
    view2.setUint32(byteOffset + 4, value, true);
  }
};
var mapAsyncGenerator = (generator, map) => {
  return {
    async next() {
      const result = await generator.next();
      if (result.done) {
        return { value: void 0, done: true };
      } else {
        return { value: map(result.value), done: false };
      }
    },
    return() {
      return generator.return();
    },
    throw(error) {
      return generator.throw(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
};
var clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};
var UNDETERMINED_LANGUAGE = "und";
var roundToPrecision = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
var roundToMultiple = (value, multiple) => {
  return Math.round(value / multiple) * multiple;
};
var ilog = (x) => {
  let ret = 0;
  while (x) {
    ret++;
    x >>= 1;
  }
  return ret;
};
var ISO_639_2_REGEX = /^[a-z]{3}$/;
var isIso639Dash2LanguageCode = (x) => {
  return ISO_639_2_REGEX.test(x);
};
var SECOND_TO_MICROSECOND_FACTOR = 1e6 * (1 + Number.EPSILON);
var mergeRequestInit = (init1, init2) => {
  const merged = { ...init1, ...init2 };
  if (init1.headers || init2.headers) {
    const headers1 = init1.headers ? normalizeHeaders(init1.headers) : {};
    const headers2 = init2.headers ? normalizeHeaders(init2.headers) : {};
    const mergedHeaders = { ...headers1 };
    Object.entries(headers2).forEach(([key2, value2]) => {
      const existingKey = Object.keys(mergedHeaders).find(
        (key1) => key1.toLowerCase() === key2.toLowerCase()
      );
      if (existingKey) {
        delete mergedHeaders[existingKey];
      }
      mergedHeaders[key2] = value2;
    });
    merged.headers = mergedHeaders;
  }
  return merged;
};
var normalizeHeaders = (headers) => {
  if (headers instanceof Headers) {
    const result = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    const result = {};
    headers.forEach(([key, value]) => {
      result[key] = value;
    });
    return result;
  }
  return headers;
};
var retriedFetch = async (fetchFn, url2, requestInit, getRetryDelay) => {
  let attempts = 0;
  while (true) {
    try {
      return await fetchFn(url2, requestInit);
    } catch (error) {
      attempts++;
      const retryDelayInSeconds = getRetryDelay(attempts, error, url2);
      if (retryDelayInSeconds === null) {
        throw error;
      }
      console.error("Retrying failed fetch. Error:", error);
      if (!Number.isFinite(retryDelayInSeconds) || retryDelayInSeconds < 0) {
        throw new TypeError("Retry delay must be a non-negative finite number.");
      }
      if (retryDelayInSeconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1e3 * retryDelayInSeconds));
      }
    }
  }
};
var computeRationalApproximation = (x, maxDenominator) => {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  let prevNumerator = 0, prevDenominator = 1;
  let currNumerator = 1, currDenominator = 0;
  let remainder = x;
  while (true) {
    const integer = Math.floor(remainder);
    const nextNumerator = integer * currNumerator + prevNumerator;
    const nextDenominator = integer * currDenominator + prevDenominator;
    if (nextDenominator > maxDenominator) {
      return {
        numerator: sign * currNumerator,
        denominator: currDenominator
      };
    }
    prevNumerator = currNumerator;
    prevDenominator = currDenominator;
    currNumerator = nextNumerator;
    currDenominator = nextDenominator;
    remainder = 1 / (remainder - integer);
    if (!isFinite(remainder)) {
      break;
    }
  }
  return {
    numerator: sign * currNumerator,
    denominator: currDenominator
  };
};
var CallSerializer = class {
  constructor() {
    this.currentPromise = Promise.resolve();
  }
  call(fn) {
    return this.currentPromise = this.currentPromise.then(fn);
  }
};
var isSafariCache = null;
var isSafari = () => {
  if (isSafariCache !== null) {
    return isSafariCache;
  }
  const result = !!(typeof navigator !== "undefined" && navigator.vendor?.match(/apple/i) && !navigator.userAgent?.match(/crios/i) && !navigator.userAgent?.match(/fxios/i) && !navigator.userAgent?.match(/Opera|OPT\//));
  isSafariCache = result;
  return result;
};
var isFirefoxCache = null;
var isFirefox = () => {
  if (isFirefoxCache !== null) {
    return isFirefoxCache;
  }
  return isFirefoxCache = typeof navigator !== "undefined" && navigator.userAgent?.includes("Firefox");
};
var coalesceIndex = (a, b) => {
  return a !== -1 ? a : b;
};
var closedIntervalsOverlap = (startA, endA, startB, endB) => {
  return startA <= endB && startB <= endA;
};
var keyValueIterator = function* (object) {
  for (const key in object) {
    const value = object[key];
    if (value === void 0) {
      continue;
    }
    yield { key, value };
  }
};
var imageMimeTypeToExtension = (mimeType) => {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/bmp":
      return ".bmp";
    case "image/svg+xml":
      return ".svg";
    case "image/tiff":
      return ".tiff";
    case "image/avif":
      return ".avif";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return ".ico";
    default:
      return null;
  }
};
var base64ToBytes = (base64) => {
  const decoded = atob(base64);
  const bytes2 = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes2[i] = decoded.charCodeAt(i);
  }
  return bytes2;
};
var bytesToBase64 = (bytes2) => {
  let string = "";
  for (let i = 0; i < bytes2.length; i++) {
    string += String.fromCharCode(bytes2[i]);
  }
  return btoa(string);
};
var uint8ArraysAreEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};
var polyfillSymbolDispose = () => {
  Symbol.dispose ??= Symbol("Symbol.dispose");
};
var isNumber = (x) => {
  return typeof x === "number" && !Number.isNaN(x);
};

// src/tags.ts
var RichImageData = class {
  /** Creates a new {@link RichImageData}. */
  constructor(data, mimeType) {
    this.data = data;
    this.mimeType = mimeType;
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array.");
    }
    if (typeof mimeType !== "string") {
      throw new TypeError("mimeType must be a string.");
    }
  }
};
var AttachedFile = class {
  /** Creates a new {@link AttachedFile}. */
  constructor(data, mimeType, name, description) {
    this.data = data;
    this.mimeType = mimeType;
    this.name = name;
    this.description = description;
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array.");
    }
    if (mimeType !== void 0 && typeof mimeType !== "string") {
      throw new TypeError("mimeType, when provided, must be a string.");
    }
    if (name !== void 0 && typeof name !== "string") {
      throw new TypeError("name, when provided, must be a string.");
    }
    if (description !== void 0 && typeof description !== "string") {
      throw new TypeError("description, when provided, must be a string.");
    }
  }
};
var validateMetadataTags = (tags) => {
  if (!tags || typeof tags !== "object") {
    throw new TypeError("tags must be an object.");
  }
  if (tags.title !== void 0 && typeof tags.title !== "string") {
    throw new TypeError("tags.title, when provided, must be a string.");
  }
  if (tags.description !== void 0 && typeof tags.description !== "string") {
    throw new TypeError("tags.description, when provided, must be a string.");
  }
  if (tags.artist !== void 0 && typeof tags.artist !== "string") {
    throw new TypeError("tags.artist, when provided, must be a string.");
  }
  if (tags.album !== void 0 && typeof tags.album !== "string") {
    throw new TypeError("tags.album, when provided, must be a string.");
  }
  if (tags.albumArtist !== void 0 && typeof tags.albumArtist !== "string") {
    throw new TypeError("tags.albumArtist, when provided, must be a string.");
  }
  if (tags.trackNumber !== void 0 && (!Number.isInteger(tags.trackNumber) || tags.trackNumber <= 0)) {
    throw new TypeError("tags.trackNumber, when provided, must be a positive integer.");
  }
  if (tags.tracksTotal !== void 0 && (!Number.isInteger(tags.tracksTotal) || tags.tracksTotal <= 0)) {
    throw new TypeError("tags.tracksTotal, when provided, must be a positive integer.");
  }
  if (tags.discNumber !== void 0 && (!Number.isInteger(tags.discNumber) || tags.discNumber <= 0)) {
    throw new TypeError("tags.discNumber, when provided, must be a positive integer.");
  }
  if (tags.discsTotal !== void 0 && (!Number.isInteger(tags.discsTotal) || tags.discsTotal <= 0)) {
    throw new TypeError("tags.discsTotal, when provided, must be a positive integer.");
  }
  if (tags.genre !== void 0 && typeof tags.genre !== "string") {
    throw new TypeError("tags.genre, when provided, must be a string.");
  }
  if (tags.date !== void 0 && (!(tags.date instanceof Date) || Number.isNaN(tags.date.getTime()))) {
    throw new TypeError("tags.date, when provided, must be a valid Date.");
  }
  if (tags.lyrics !== void 0 && typeof tags.lyrics !== "string") {
    throw new TypeError("tags.lyrics, when provided, must be a string.");
  }
  if (tags.images !== void 0) {
    if (!Array.isArray(tags.images)) {
      throw new TypeError("tags.images, when provided, must be an array.");
    }
    for (const image of tags.images) {
      if (!image || typeof image !== "object") {
        throw new TypeError("Each image in tags.images must be an object.");
      }
      if (!(image.data instanceof Uint8Array)) {
        throw new TypeError("Each image.data must be a Uint8Array.");
      }
      if (typeof image.mimeType !== "string") {
        throw new TypeError("Each image.mimeType must be a string.");
      }
      if (!["coverFront", "coverBack", "unknown"].includes(image.kind)) {
        throw new TypeError("Each image.kind must be 'coverFront', 'coverBack', or 'unknown'.");
      }
    }
  }
  if (tags.comment !== void 0 && typeof tags.comment !== "string") {
    throw new TypeError("tags.comment, when provided, must be a string.");
  }
  if (tags.raw !== void 0) {
    if (!tags.raw || typeof tags.raw !== "object") {
      throw new TypeError("tags.raw, when provided, must be an object.");
    }
    for (const value of Object.values(tags.raw)) {
      if (value !== null && typeof value !== "string" && !(value instanceof Uint8Array) && !(value instanceof RichImageData) && !(value instanceof AttachedFile)) {
        throw new TypeError(
          "Each value in tags.raw must be a string, Uint8Array, RichImageData, AttachedFile, or null."
        );
      }
    }
  }
};
var metadataTagsAreEmpty = (tags) => {
  return tags.title === void 0 && tags.description === void 0 && tags.artist === void 0 && tags.album === void 0 && tags.albumArtist === void 0 && tags.trackNumber === void 0 && tags.tracksTotal === void 0 && tags.discNumber === void 0 && tags.discsTotal === void 0 && tags.genre === void 0 && tags.date === void 0 && tags.lyrics === void 0 && (!tags.images || tags.images.length === 0) && tags.comment === void 0 && (tags.raw === void 0 || Object.keys(tags.raw).length === 0);
};

// src/codec.ts
var VIDEO_CODECS = [
  "avc",
  "hevc",
  "vp9",
  "av1",
  "vp8",
  "mpeg4"
];
var PCM_AUDIO_CODECS = [
  "pcm-s16",
  // We don't prefix 'le' so we're compatible with the WebCodecs-registered PCM codec strings
  "pcm-s16be",
  "pcm-s24",
  "pcm-s24be",
  "pcm-s32",
  "pcm-s32be",
  "pcm-f32",
  "pcm-f32be",
  "pcm-f64",
  "pcm-f64be",
  "pcm-u8",
  "pcm-s8",
  "ulaw",
  "alaw"
];
var NON_PCM_AUDIO_CODECS = [
  "aac",
  "opus",
  "mp3",
  "vorbis",
  "flac",
  "ac3",
  "eac3"
];
var AUDIO_CODECS = [
  ...NON_PCM_AUDIO_CODECS,
  ...PCM_AUDIO_CODECS
];
var SUBTITLE_CODECS = [
  "webvtt",
  "tx3g",
  "ttml",
  "srt",
  "ass",
  "ssa"
];
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
var VP9_DEFAULT_SUFFIX = ".01.01.01.01.00";
var AV1_DEFAULT_SUFFIX = ".0.110.01.01.01.0";
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
    return `vp09.${profile}.${levelInfo.level.toString().padStart(2, "0")}.${bitDepth}`;
  } else if (codec === "av1") {
    const profile = 0;
    const pictureSize = width * height;
    const levelInfo = AV1_LEVEL_TABLE.find(
      (level2) => pictureSize <= level2.maxPictureSize && bitrate <= level2.maxBitrate
    ) ?? last(AV1_LEVEL_TABLE);
    const level = levelInfo.level.toString().padStart(2, "0");
    const bitDepth = "08";
    return `av01.${profile}.${level}${levelInfo.tier}.${bitDepth}`;
  } else if (codec === "mpeg4") {
    return "mp4v.20.9";
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var generateVp9CodecConfigurationFromCodecString = (codecString) => {
  const parts = codecString.split(".");
  const profile = Number(parts[1]);
  const level = Number(parts[2]);
  const bitDepth = Number(parts[3]);
  const chromaSubsampling = parts[4] ? Number(parts[4]) : 1;
  return [
    1,
    1,
    profile,
    2,
    1,
    level,
    3,
    1,
    bitDepth,
    4,
    1,
    chromaSubsampling
  ];
};
var generateAv1CodecConfigurationFromCodecString = (codecString) => {
  const parts = codecString.split(".");
  const marker = 1;
  const version = 1;
  const firstByte = (marker << 7) + version;
  const profile = Number(parts[1]);
  const levelAndTier = parts[2];
  const level = Number(levelAndTier.slice(0, -1));
  const secondByte = (profile << 5) + level;
  const tier = levelAndTier.slice(-1) === "H" ? 1 : 0;
  const bitDepth = Number(parts[3]);
  const highBitDepth = bitDepth === 8 ? 0 : 1;
  const twelveBit = 0;
  const monochrome = parts[4] ? Number(parts[4]) : 0;
  const chromaSubsamplingX = parts[5] ? Number(parts[5][0]) : 1;
  const chromaSubsamplingY = parts[5] ? Number(parts[5][1]) : 1;
  const chromaSamplePosition = parts[5] ? Number(parts[5][2]) : 0;
  const thirdByte = (tier << 7) + (highBitDepth << 6) + (twelveBit << 5) + (monochrome << 4) + (chromaSubsamplingX << 3) + (chromaSubsamplingY << 2) + chromaSamplePosition;
  const initialPresentationDelayPresent = 0;
  const fourthByte = initialPresentationDelayPresent;
  return [firstByte, secondByte, thirdByte, fourthByte];
};
var extractVideoCodecString = (trackInfo) => {
  const { codec, codecDescription, colorSpace, avcCodecInfo, hevcCodecInfo, vp9CodecInfo, av1CodecInfo } = trackInfo;
  if (codec === "avc") {
    if (avcCodecInfo) {
      const bytes2 = new Uint8Array([
        avcCodecInfo.avcProfileIndication,
        avcCodecInfo.profileCompatibility,
        avcCodecInfo.avcLevelIndication
      ]);
      return `avc1.${bytesToHexString(bytes2)}`;
    }
    if (!codecDescription || codecDescription.byteLength < 4) {
      throw new TypeError("AVC decoder description is not provided or is not at least 4 bytes long.");
    }
    return `avc1.${bytesToHexString(codecDescription.subarray(1, 4))}`;
  } else if (codec === "hevc") {
    let generalProfileSpace;
    let generalProfileIdc;
    let compatibilityFlags;
    let generalTierFlag;
    let generalLevelIdc;
    let constraintFlags;
    if (hevcCodecInfo) {
      generalProfileSpace = hevcCodecInfo.generalProfileSpace;
      generalProfileIdc = hevcCodecInfo.generalProfileIdc;
      compatibilityFlags = reverseBitsU32(hevcCodecInfo.generalProfileCompatibilityFlags);
      generalTierFlag = hevcCodecInfo.generalTierFlag;
      generalLevelIdc = hevcCodecInfo.generalLevelIdc;
      constraintFlags = [...hevcCodecInfo.generalConstraintIndicatorFlags];
    } else {
      if (!codecDescription || codecDescription.byteLength < 23) {
        throw new TypeError("HEVC decoder description is not provided or is not at least 23 bytes long.");
      }
      const view2 = toDataView(codecDescription);
      const profileByte = view2.getUint8(1);
      generalProfileSpace = profileByte >> 6 & 3;
      generalProfileIdc = profileByte & 31;
      compatibilityFlags = reverseBitsU32(view2.getUint32(2));
      generalTierFlag = profileByte >> 5 & 1;
      generalLevelIdc = view2.getUint8(12);
      constraintFlags = [];
      for (let i = 0; i < 6; i++) {
        constraintFlags.push(view2.getUint8(6 + i));
      }
    }
    let codecString = "hev1.";
    codecString += ["", "A", "B", "C"][generalProfileSpace] + generalProfileIdc;
    codecString += ".";
    codecString += compatibilityFlags.toString(16).toUpperCase();
    codecString += ".";
    codecString += generalTierFlag === 0 ? "L" : "H";
    codecString += generalLevelIdc;
    while (constraintFlags.length > 0 && constraintFlags[constraintFlags.length - 1] === 0) {
      constraintFlags.pop();
    }
    if (constraintFlags.length > 0) {
      codecString += ".";
      codecString += constraintFlags.map((x) => x.toString(16).toUpperCase()).join(".");
    }
    return codecString;
  } else if (codec === "vp8") {
    return "vp8";
  } else if (codec === "vp9") {
    if (!vp9CodecInfo) {
      const pictureSize = trackInfo.width * trackInfo.height;
      let level2 = last(VP9_LEVEL_TABLE).level;
      for (const entry of VP9_LEVEL_TABLE) {
        if (pictureSize <= entry.maxPictureSize) {
          level2 = entry.level;
          break;
        }
      }
      return `vp09.00.${level2.toString().padStart(2, "0")}.08`;
    }
    const profile = vp9CodecInfo.profile.toString().padStart(2, "0");
    const level = vp9CodecInfo.level.toString().padStart(2, "0");
    const bitDepth = vp9CodecInfo.bitDepth.toString().padStart(2, "0");
    const chromaSubsampling = vp9CodecInfo.chromaSubsampling.toString().padStart(2, "0");
    const colourPrimaries = vp9CodecInfo.colourPrimaries.toString().padStart(2, "0");
    const transferCharacteristics = vp9CodecInfo.transferCharacteristics.toString().padStart(2, "0");
    const matrixCoefficients = vp9CodecInfo.matrixCoefficients.toString().padStart(2, "0");
    const videoFullRangeFlag = vp9CodecInfo.videoFullRangeFlag.toString().padStart(2, "0");
    let string = `vp09.${profile}.${level}.${bitDepth}.${chromaSubsampling}`;
    string += `.${colourPrimaries}.${transferCharacteristics}.${matrixCoefficients}.${videoFullRangeFlag}`;
    if (string.endsWith(VP9_DEFAULT_SUFFIX)) {
      string = string.slice(0, -VP9_DEFAULT_SUFFIX.length);
    }
    return string;
  } else if (codec === "av1") {
    if (!av1CodecInfo) {
      const pictureSize = trackInfo.width * trackInfo.height;
      let level2 = last(VP9_LEVEL_TABLE).level;
      for (const entry of VP9_LEVEL_TABLE) {
        if (pictureSize <= entry.maxPictureSize) {
          level2 = entry.level;
          break;
        }
      }
      return `av01.0.${level2.toString().padStart(2, "0")}M.08`;
    }
    const profile = av1CodecInfo.profile;
    const level = av1CodecInfo.level.toString().padStart(2, "0");
    const tier = av1CodecInfo.tier ? "H" : "M";
    const bitDepth = av1CodecInfo.bitDepth.toString().padStart(2, "0");
    const monochrome = av1CodecInfo.monochrome ? "1" : "0";
    const chromaSubsampling = 100 * av1CodecInfo.chromaSubsamplingX + 10 * av1CodecInfo.chromaSubsamplingY + 1 * (av1CodecInfo.chromaSubsamplingX && av1CodecInfo.chromaSubsamplingY ? av1CodecInfo.chromaSamplePosition : 0);
    const colorPrimaries = colorSpace?.primaries ? COLOR_PRIMARIES_MAP[colorSpace.primaries] : 1;
    const transferCharacteristics = colorSpace?.transfer ? TRANSFER_CHARACTERISTICS_MAP[colorSpace.transfer] : 1;
    const matrixCoefficients = colorSpace?.matrix ? MATRIX_COEFFICIENTS_MAP[colorSpace.matrix] : 1;
    const videoFullRangeFlag = colorSpace?.fullRange ? 1 : 0;
    let string = `av01.${profile}.${level}${tier}.${bitDepth}`;
    string += `.${monochrome}.${chromaSubsampling.toString().padStart(3, "0")}`;
    string += `.${colorPrimaries.toString().padStart(2, "0")}`;
    string += `.${transferCharacteristics.toString().padStart(2, "0")}`;
    string += `.${matrixCoefficients.toString().padStart(2, "0")}`;
    string += `.${videoFullRangeFlag}`;
    if (string.endsWith(AV1_DEFAULT_SUFFIX)) {
      string = string.slice(0, -AV1_DEFAULT_SUFFIX.length);
    }
    return string;
  } else if (codec === "mpeg4") {
    return "mp4v";
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
  } else if (codec === "mp3") {
    return "mp3";
  } else if (codec === "opus") {
    return "opus";
  } else if (codec === "vorbis") {
    return "vorbis";
  } else if (codec === "flac") {
    return "flac";
  } else if (codec === "ac3") {
    return "ac-3";
  } else if (codec === "eac3") {
    return "ec-3";
  } else if (PCM_AUDIO_CODECS.includes(codec)) {
    return codec;
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var extractAudioCodecString = (trackInfo) => {
  const { codec, codecDescription, aacCodecInfo } = trackInfo;
  if (codec === "aac") {
    if (!aacCodecInfo) {
      throw new TypeError("AAC codec info must be provided.");
    }
    if (aacCodecInfo.isMpeg2) {
      return "mp4a.67";
    } else {
      const audioSpecificConfig = parseAacAudioSpecificConfig(codecDescription);
      return `mp4a.40.${audioSpecificConfig.objectType}`;
    }
  } else if (codec === "mp3") {
    return "mp3";
  } else if (codec === "opus") {
    return "opus";
  } else if (codec === "vorbis") {
    return "vorbis";
  } else if (codec === "flac") {
    return "flac";
  } else if (codec === "ac3") {
    return "ac3";
  } else if (codec === "eac3") {
    return "ec-3";
  } else if (codec && PCM_AUDIO_CODECS.includes(codec)) {
    return codec;
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var aacFrequencyTable = [
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
var aacChannelMap = [-1, 1, 2, 3, 4, 5, 6, 8];
var parseAacAudioSpecificConfig = (bytes2) => {
  if (!bytes2 || bytes2.byteLength < 2) {
    throw new TypeError("AAC description must be at least 2 bytes long.");
  }
  const bitstream = new Bitstream(bytes2);
  let objectType = bitstream.readBits(5);
  if (objectType === 31) {
    objectType = 32 + bitstream.readBits(6);
  }
  const frequencyIndex = bitstream.readBits(4);
  let sampleRate = null;
  if (frequencyIndex === 15) {
    sampleRate = bitstream.readBits(24);
  } else {
    if (frequencyIndex < aacFrequencyTable.length) {
      sampleRate = aacFrequencyTable[frequencyIndex];
    }
  }
  const channelConfiguration = bitstream.readBits(4);
  let numberOfChannels = null;
  if (channelConfiguration >= 1 && channelConfiguration <= 7) {
    numberOfChannels = aacChannelMap[channelConfiguration];
  }
  return {
    objectType,
    frequencyIndex,
    sampleRate,
    channelConfiguration,
    numberOfChannels
  };
};
var OPUS_SAMPLE_RATE = 48e3;
var PCM_CODEC_REGEX = /^pcm-([usf])(\d+)+(be)?$/;
var parsePcmCodec = (codec) => {
  assert(PCM_AUDIO_CODECS.includes(codec));
  if (codec === "ulaw") {
    return { dataType: "ulaw", sampleSize: 1, littleEndian: true, silentValue: 255 };
  } else if (codec === "alaw") {
    return { dataType: "alaw", sampleSize: 1, littleEndian: true, silentValue: 213 };
  }
  const match = PCM_CODEC_REGEX.exec(codec);
  assert(match);
  let dataType;
  if (match[1] === "u") {
    dataType = "unsigned";
  } else if (match[1] === "s") {
    dataType = "signed";
  } else {
    dataType = "float";
  }
  const sampleSize = Number(match[2]) / 8;
  const littleEndian = match[3] !== "be";
  const silentValue = codec === "pcm-u8" ? 2 ** 7 : 0;
  return { dataType, sampleSize, littleEndian, silentValue };
};
var inferCodecFromCodecString = (codecString) => {
  if (codecString.startsWith("avc1") || codecString.startsWith("avc3")) {
    return "avc";
  } else if (codecString.startsWith("hev1") || codecString.startsWith("hvc1")) {
    return "hevc";
  } else if (codecString === "vp8") {
    return "vp8";
  } else if (codecString.startsWith("vp09")) {
    return "vp9";
  } else if (codecString.startsWith("av01")) {
    return "av1";
  } else if (codecString === "mp4v" || codecString.startsWith("mp4v.")) {
    return "mpeg4";
  }
  if (codecString.startsWith("mp4a.40") || codecString === "mp4a.67") {
    return "aac";
  } else if (codecString === "mp3" || codecString === "mp4a.69" || codecString === "mp4a.6B" || codecString === "mp4a.6b") {
    return "mp3";
  } else if (codecString === "opus") {
    return "opus";
  } else if (codecString === "vorbis") {
    return "vorbis";
  } else if (codecString === "flac") {
    return "flac";
  } else if (codecString === "ac-3" || codecString === "ac3") {
    return "ac3";
  } else if (codecString === "ec-3" || codecString === "eac3") {
    return "eac3";
  } else if (codecString === "ulaw") {
    return "ulaw";
  } else if (codecString === "alaw") {
    return "alaw";
  } else if (PCM_CODEC_REGEX.test(codecString)) {
    return codecString;
  }
  if (codecString === "webvtt") {
    return "webvtt";
  } else if (codecString === "srt") {
    return "srt";
  } else if (codecString === "ass") {
    return "ass";
  } else if (codecString === "ssa") {
    return "ssa";
  }
  return null;
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
var VALID_VIDEO_CODEC_STRING_PREFIXES = ["avc1", "avc3", "hev1", "hvc1", "vp8", "vp09", "av01", "mp4v"];
var AVC_CODEC_STRING_REGEX = /^(avc1|avc3)\.[0-9a-fA-F]{6}$/;
var HEVC_CODEC_STRING_REGEX = /^(hev1|hvc1)\.(?:[ABC]?\d+)\.[0-9a-fA-F]{1,8}\.[LH]\d+(?:\.[0-9a-fA-F]{1,2}){0,6}$/;
var VP9_CODEC_STRING_REGEX = /^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/;
var AV1_CODEC_STRING_REGEX = /^av01\.\d\.\d{2}[MH]\.\d{2}(?:\.\d\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d)?$/;
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
  if (!VALID_VIDEO_CODEC_STRING_PREFIXES.some((prefix) => metadata.decoderConfig.codec.startsWith(prefix))) {
    throw new TypeError(
      "Video chunk metadata decoder configuration codec string must be a valid video codec string as specified in the WebCodecs Codec Registry."
    );
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
  if (metadata.decoderConfig.codec.startsWith("avc1") || metadata.decoderConfig.codec.startsWith("avc3")) {
    if (!AVC_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
      throw new TypeError(
        "Video chunk metadata decoder configuration codec string for AVC must be a valid AVC codec string as specified in Section 3.4 of RFC 6381."
      );
    }
  } else if (metadata.decoderConfig.codec.startsWith("hev1") || metadata.decoderConfig.codec.startsWith("hvc1")) {
    if (!HEVC_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
      throw new TypeError(
        "Video chunk metadata decoder configuration codec string for HEVC must be a valid HEVC codec string as specified in Section E.3 of ISO 14496-15."
      );
    }
  } else if (metadata.decoderConfig.codec.startsWith("vp8")) {
    if (metadata.decoderConfig.codec !== "vp8") {
      throw new TypeError('Video chunk metadata decoder configuration codec string for VP8 must be "vp8".');
    }
  } else if (metadata.decoderConfig.codec.startsWith("vp09")) {
    if (!VP9_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
      throw new TypeError(
        'Video chunk metadata decoder configuration codec string for VP9 must be a valid VP9 codec string as specified in Section "Codecs Parameter String" of https://www.webmproject.org/vp9/mp4/.'
      );
    }
  } else if (metadata.decoderConfig.codec.startsWith("av01")) {
    if (!AV1_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
      throw new TypeError(
        'Video chunk metadata decoder configuration codec string for AV1 must be a valid AV1 codec string as specified in Section "Codecs Parameter String" of https://aomediacodec.github.io/av1-isobmff/.'
      );
    }
  } else if (metadata.decoderConfig.codec === "mp4v" || metadata.decoderConfig.codec.startsWith("mp4v.")) {
    if (metadata.decoderConfig.codec !== "mp4v") {
      throw new TypeError('Video chunk metadata decoder configuration codec string for MPEG-4 must be "mp4v".');
    }
  }
};
var VALID_AUDIO_CODEC_STRING_PREFIXES = ["mp4a", "mp3", "opus", "vorbis", "flac", "ulaw", "alaw", "pcm", "ac-3", "ec-3"];
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
  if (!VALID_AUDIO_CODEC_STRING_PREFIXES.some((prefix) => metadata.decoderConfig.codec.startsWith(prefix))) {
    throw new TypeError(
      "Audio chunk metadata decoder configuration codec string must be a valid audio codec string as specified in the WebCodecs Codec Registry."
    );
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
  if (metadata.decoderConfig.codec.startsWith("mp4a") && metadata.decoderConfig.codec !== "mp4a.69" && metadata.decoderConfig.codec !== "mp4a.6B" && metadata.decoderConfig.codec !== "mp4a.6b") {
    const validStrings = ["mp4a.40.2", "mp4a.40.02", "mp4a.40.5", "mp4a.40.05", "mp4a.40.29", "mp4a.67"];
    if (!validStrings.includes(metadata.decoderConfig.codec)) {
      throw new TypeError(
        "Audio chunk metadata decoder configuration codec string for AAC must be a valid AAC codec string as specified in https://www.w3.org/TR/webcodecs-aac-codec-registration/."
      );
    }
    if (!metadata.decoderConfig.description) {
      throw new TypeError(
        "Audio chunk metadata decoder configuration for AAC must include a description, which is expected to be an AudioSpecificConfig as specified in ISO 14496-3."
      );
    }
  } else if (metadata.decoderConfig.codec.startsWith("mp3") || metadata.decoderConfig.codec.startsWith("mp4a")) {
    if (metadata.decoderConfig.codec !== "mp3" && metadata.decoderConfig.codec !== "mp4a.69" && metadata.decoderConfig.codec !== "mp4a.6B" && metadata.decoderConfig.codec !== "mp4a.6b") {
      throw new TypeError(
        'Audio chunk metadata decoder configuration codec string for MP3 must be "mp3", "mp4a.69" or "mp4a.6B".'
      );
    }
  } else if (metadata.decoderConfig.codec.startsWith("opus")) {
    if (metadata.decoderConfig.codec !== "opus") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for Opus must be "opus".');
    }
    if (metadata.decoderConfig.description && metadata.decoderConfig.description.byteLength < 18) {
      throw new TypeError(
        "Audio chunk metadata decoder configuration description, when specified, is expected to be an Identification Header as specified in Section 5.1 of RFC 7845."
      );
    }
  } else if (metadata.decoderConfig.codec.startsWith("vorbis")) {
    if (metadata.decoderConfig.codec !== "vorbis") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for Vorbis must be "vorbis".');
    }
    if (!metadata.decoderConfig.description) {
      throw new TypeError(
        "Audio chunk metadata decoder configuration for Vorbis must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-vorbis-codec-registration/."
      );
    }
  } else if (metadata.decoderConfig.codec.startsWith("flac")) {
    if (metadata.decoderConfig.codec !== "flac") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for FLAC must be "flac".');
    }
    const minDescriptionSize = 4 + 4 + 34;
    if (!metadata.decoderConfig.description || metadata.decoderConfig.description.byteLength < minDescriptionSize) {
      throw new TypeError(
        "Audio chunk metadata decoder configuration for FLAC must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-flac-codec-registration/."
      );
    }
  } else if (metadata.decoderConfig.codec === "ac-3" || metadata.decoderConfig.codec === "ac3") {
    if (metadata.decoderConfig.codec !== "ac-3") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for AC-3 must be "ac-3".');
    }
  } else if (metadata.decoderConfig.codec === "ec-3" || metadata.decoderConfig.codec === "eac3") {
    if (metadata.decoderConfig.codec !== "ec-3") {
      throw new TypeError('Audio chunk metadata decoder configuration codec string for E-AC-3 must be "ec-3".');
    }
  } else if (metadata.decoderConfig.codec.startsWith("pcm") || metadata.decoderConfig.codec.startsWith("ulaw") || metadata.decoderConfig.codec.startsWith("alaw")) {
    if (!PCM_AUDIO_CODECS.includes(metadata.decoderConfig.codec)) {
      throw new TypeError(
        `Audio chunk metadata decoder configuration codec string for PCM must be one of the supported PCM codecs (${PCM_AUDIO_CODECS.join(", ")}).`
      );
    }
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

// src/muxer.ts
var Muxer = class {
  constructor(output) {
    this.mutex = new AsyncMutex();
    /**
     * This field is used to synchronize multiple MediaStreamTracks. They use the same time coordinate system across
     * tracks, and to ensure correct audio-video sync, we must use the same offset for all of them. The reason an offset
     * is needed at all is because the timestamps typically don't start at zero.
     */
    this.firstMediaStreamTimestamp = null;
    this.trackTimestampInfo = /* @__PURE__ */ new WeakMap();
    this.output = output;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrackClose(track) {
  }
  validateAndNormalizeTimestamp(track, timestampInSeconds, isKeyFrame) {
    timestampInSeconds += track.source._timestampOffset;
    let timestampInfo = this.trackTimestampInfo.get(track);
    if (!timestampInfo) {
      if (!isKeyFrame) {
        throw new Error("First frame must be a key frame.");
      }
      timestampInfo = {
        maxTimestamp: timestampInSeconds,
        maxTimestampBeforeLastKeyFrame: timestampInSeconds
      };
      this.trackTimestampInfo.set(track, timestampInfo);
    }
    if (timestampInSeconds < 0) {
      throw new Error(`Timestamps must be non-negative (got ${timestampInSeconds}s).`);
    }
    if (isKeyFrame) {
      timestampInfo.maxTimestampBeforeLastKeyFrame = timestampInfo.maxTimestamp;
    }
    if (timestampInSeconds < timestampInfo.maxTimestampBeforeLastKeyFrame) {
      throw new Error(
        `Timestamps cannot be smaller than the highest timestamp of the previous GOP (a GOP begins with a key frame and ends right before the next key frame). Got ${timestampInSeconds}s, but highest timestamp is ${timestampInfo.maxTimestampBeforeLastKeyFrame}s.`
      );
    }
    timestampInfo.maxTimestamp = Math.max(timestampInfo.maxTimestamp, timestampInSeconds);
    return timestampInSeconds;
  }
};

// src/adts/adts-muxer.ts
var AdtsMuxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.header = new Uint8Array(7);
    this.headerBitstream = new Bitstream(this.header);
    this.audioSpecificConfig = null;
    this.format = format;
    this.writer = output._writer;
  }
  async start() {
  }
  async getMimeType() {
    return "audio/aac";
  }
  async addEncodedVideoPacket() {
    throw new Error("ADTS does not support video.");
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      this.validateAndNormalizeTimestamp(track, packet.timestamp, packet.type === "key");
      if (!this.audioSpecificConfig) {
        validateAudioChunkMetadata(meta);
        const description = meta?.decoderConfig?.description;
        assert(description);
        this.audioSpecificConfig = parseAacAudioSpecificConfig(toUint8Array(description));
        const { objectType, frequencyIndex, channelConfiguration } = this.audioSpecificConfig;
        const profile = objectType - 1;
        this.headerBitstream.writeBits(12, 4095);
        this.headerBitstream.writeBits(1, 0);
        this.headerBitstream.writeBits(2, 0);
        this.headerBitstream.writeBits(1, 1);
        this.headerBitstream.writeBits(2, profile);
        this.headerBitstream.writeBits(4, frequencyIndex);
        this.headerBitstream.writeBits(1, 0);
        this.headerBitstream.writeBits(3, channelConfiguration);
        this.headerBitstream.writeBits(1, 0);
        this.headerBitstream.writeBits(1, 0);
        this.headerBitstream.writeBits(1, 0);
        this.headerBitstream.writeBits(1, 0);
        this.headerBitstream.skipBits(13);
        this.headerBitstream.writeBits(11, 2047);
        this.headerBitstream.writeBits(2, 0);
      }
      const frameLength = packet.data.byteLength + this.header.byteLength;
      this.headerBitstream.pos = 30;
      this.headerBitstream.writeBits(13, frameLength);
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
    throw new Error("ADTS does not support subtitles.");
  }
  async finalize() {
  }
};

// src/codec-data.ts
var findNalUnitsInAnnexB = (packetData) => {
  const nalUnits = [];
  let i = 0;
  while (i < packetData.length) {
    let startCodePos = -1;
    let startCodeLength = 0;
    for (let j = i; j < packetData.length - 3; j++) {
      if (packetData[j] === 0 && packetData[j + 1] === 0 && packetData[j + 2] === 1) {
        startCodePos = j;
        startCodeLength = 3;
        break;
      }
      if (j < packetData.length - 4 && packetData[j] === 0 && packetData[j + 1] === 0 && packetData[j + 2] === 0 && packetData[j + 3] === 1) {
        startCodePos = j;
        startCodeLength = 4;
        break;
      }
    }
    if (startCodePos === -1) {
      break;
    }
    if (i > 0 && startCodePos > i) {
      const nalData = packetData.subarray(i, startCodePos);
      if (nalData.length > 0) {
        nalUnits.push(nalData);
      }
    }
    i = startCodePos + startCodeLength;
  }
  if (i < packetData.length) {
    const nalData = packetData.subarray(i);
    if (nalData.length > 0) {
      nalUnits.push(nalData);
    }
  }
  return nalUnits;
};
var findNalUnitsInLengthPrefixed = (packetData, lengthSize) => {
  const nalUnits = [];
  let offset = 0;
  const dataView = new DataView(packetData.buffer, packetData.byteOffset, packetData.byteLength);
  while (offset + lengthSize <= packetData.length) {
    let nalUnitLength;
    if (lengthSize === 1) {
      nalUnitLength = dataView.getUint8(offset);
    } else if (lengthSize === 2) {
      nalUnitLength = dataView.getUint16(offset, false);
    } else if (lengthSize === 3) {
      nalUnitLength = getUint24(dataView, offset, false);
    } else if (lengthSize === 4) {
      nalUnitLength = dataView.getUint32(offset, false);
    } else {
      assertNever(lengthSize);
      assert(false);
    }
    offset += lengthSize;
    const nalUnit = packetData.subarray(offset, offset + nalUnitLength);
    nalUnits.push(nalUnit);
    offset += nalUnitLength;
  }
  return nalUnits;
};
var removeEmulationPreventionBytes = (data) => {
  const result = [];
  const len = data.length;
  for (let i = 0; i < len; i++) {
    if (i + 2 < len && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 3) {
      result.push(0, 0);
      i += 2;
    } else {
      result.push(data[i]);
    }
  }
  return new Uint8Array(result);
};
var transformAnnexBToLengthPrefixed = (packetData) => {
  const NAL_UNIT_LENGTH_SIZE = 4;
  const nalUnits = findNalUnitsInAnnexB(packetData);
  if (nalUnits.length === 0) {
    return null;
  }
  let totalSize = 0;
  for (const nalUnit of nalUnits) {
    totalSize += NAL_UNIT_LENGTH_SIZE + nalUnit.byteLength;
  }
  const avccData = new Uint8Array(totalSize);
  const dataView = new DataView(avccData.buffer);
  let offset = 0;
  for (const nalUnit of nalUnits) {
    const length = nalUnit.byteLength;
    dataView.setUint32(offset, length, false);
    offset += 4;
    avccData.set(nalUnit, offset);
    offset += nalUnit.byteLength;
  }
  return avccData;
};
var extractAvcNalUnits = (packetData, decoderConfig) => {
  if (decoderConfig.description) {
    const bytes2 = toUint8Array(decoderConfig.description);
    const lengthSizeMinusOne = bytes2[4] & 3;
    const lengthSize = lengthSizeMinusOne + 1;
    return findNalUnitsInLengthPrefixed(packetData, lengthSize);
  } else {
    return findNalUnitsInAnnexB(packetData);
  }
};
var extractNalUnitTypeForAvc = (data) => {
  return data[0] & 31;
};
var extractAvcDecoderConfigurationRecord = (packetData) => {
  try {
    const nalUnits = findNalUnitsInAnnexB(packetData);
    const spsUnits = nalUnits.filter((unit) => extractNalUnitTypeForAvc(unit) === 7 /* SPS */);
    const ppsUnits = nalUnits.filter((unit) => extractNalUnitTypeForAvc(unit) === 8 /* PPS */);
    const spsExtUnits = nalUnits.filter((unit) => extractNalUnitTypeForAvc(unit) === 13 /* SPS_EXT */);
    if (spsUnits.length === 0) {
      return null;
    }
    if (ppsUnits.length === 0) {
      return null;
    }
    const spsData = spsUnits[0];
    const bitstream = new Bitstream(removeEmulationPreventionBytes(spsData));
    bitstream.skipBits(1);
    bitstream.skipBits(2);
    const nal_unit_type = bitstream.readBits(5);
    if (nal_unit_type !== 7) {
      console.error("Invalid SPS NAL unit type");
      return null;
    }
    const profile_idc = bitstream.readAlignedByte();
    const constraint_flags = bitstream.readAlignedByte();
    const level_idc = bitstream.readAlignedByte();
    const record = {
      configurationVersion: 1,
      avcProfileIndication: profile_idc,
      profileCompatibility: constraint_flags,
      avcLevelIndication: level_idc,
      lengthSizeMinusOne: 3,
      // Typically 4 bytes for length field
      sequenceParameterSets: spsUnits,
      pictureParameterSets: ppsUnits,
      chromaFormat: null,
      bitDepthLumaMinus8: null,
      bitDepthChromaMinus8: null,
      sequenceParameterSetExt: null
    };
    if (profile_idc === 100 || profile_idc === 110 || profile_idc === 122 || profile_idc === 144) {
      readExpGolomb(bitstream);
      const chroma_format_idc = readExpGolomb(bitstream);
      if (chroma_format_idc === 3) {
        bitstream.skipBits(1);
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
    console.error("Error building AVC Decoder Configuration Record:", error);
    return null;
  }
};
var serializeAvcDecoderConfigurationRecord = (record) => {
  const bytes2 = [];
  bytes2.push(record.configurationVersion);
  bytes2.push(record.avcProfileIndication);
  bytes2.push(record.profileCompatibility);
  bytes2.push(record.avcLevelIndication);
  bytes2.push(252 | record.lengthSizeMinusOne & 3);
  bytes2.push(224 | record.sequenceParameterSets.length & 31);
  for (const sps of record.sequenceParameterSets) {
    const length = sps.byteLength;
    bytes2.push(length >> 8);
    bytes2.push(length & 255);
    for (let i = 0; i < length; i++) {
      bytes2.push(sps[i]);
    }
  }
  bytes2.push(record.pictureParameterSets.length);
  for (const pps of record.pictureParameterSets) {
    const length = pps.byteLength;
    bytes2.push(length >> 8);
    bytes2.push(length & 255);
    for (let i = 0; i < length; i++) {
      bytes2.push(pps[i]);
    }
  }
  if (record.avcProfileIndication === 100 || record.avcProfileIndication === 110 || record.avcProfileIndication === 122 || record.avcProfileIndication === 144) {
    assert(record.chromaFormat !== null);
    assert(record.bitDepthLumaMinus8 !== null);
    assert(record.bitDepthChromaMinus8 !== null);
    assert(record.sequenceParameterSetExt !== null);
    bytes2.push(252 | record.chromaFormat & 3);
    bytes2.push(248 | record.bitDepthLumaMinus8 & 7);
    bytes2.push(248 | record.bitDepthChromaMinus8 & 7);
    bytes2.push(record.sequenceParameterSetExt.length);
    for (const spsExt of record.sequenceParameterSetExt) {
      const length = spsExt.byteLength;
      bytes2.push(length >> 8);
      bytes2.push(length & 255);
      for (let i = 0; i < length; i++) {
        bytes2.push(spsExt[i]);
      }
    }
  }
  return new Uint8Array(bytes2);
};
var extractHevcNalUnits = (packetData, decoderConfig) => {
  if (decoderConfig.description) {
    const bytes2 = toUint8Array(decoderConfig.description);
    const lengthSizeMinusOne = bytes2[21] & 3;
    const lengthSize = lengthSizeMinusOne + 1;
    return findNalUnitsInLengthPrefixed(packetData, lengthSize);
  } else {
    return findNalUnitsInAnnexB(packetData);
  }
};
var extractNalUnitTypeForHevc = (data) => {
  return data[0] >> 1 & 63;
};
var extractHevcDecoderConfigurationRecord = (packetData) => {
  try {
    const nalUnits = findNalUnitsInAnnexB(packetData);
    const vpsUnits = nalUnits.filter((unit) => extractNalUnitTypeForHevc(unit) === 32 /* VPS_NUT */);
    const spsUnits = nalUnits.filter((unit) => extractNalUnitTypeForHevc(unit) === 33 /* SPS_NUT */);
    const ppsUnits = nalUnits.filter((unit) => extractNalUnitTypeForHevc(unit) === 34 /* PPS_NUT */);
    const seiUnits = nalUnits.filter(
      (unit) => extractNalUnitTypeForHevc(unit) === 39 /* PREFIX_SEI_NUT */ || extractNalUnitTypeForHevc(unit) === 40 /* SUFFIX_SEI_NUT */
    );
    if (spsUnits.length === 0 || ppsUnits.length === 0) return null;
    const sps = spsUnits[0];
    const bitstream = new Bitstream(removeEmulationPreventionBytes(sps));
    bitstream.skipBits(16);
    bitstream.readBits(4);
    const sps_max_sub_layers_minus1 = bitstream.readBits(3);
    const sps_temporal_id_nesting_flag = bitstream.readBits(1);
    const {
      general_profile_space,
      general_tier_flag,
      general_profile_idc,
      general_profile_compatibility_flags,
      general_constraint_indicator_flags,
      general_level_idc
    } = parseProfileTierLevel(bitstream, sps_max_sub_layers_minus1);
    readExpGolomb(bitstream);
    const chroma_format_idc = readExpGolomb(bitstream);
    if (chroma_format_idc === 3) bitstream.skipBits(1);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    if (bitstream.readBits(1)) {
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    const bit_depth_luma_minus8 = readExpGolomb(bitstream);
    const bit_depth_chroma_minus8 = readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    const sps_sub_layer_ordering_info_present_flag = bitstream.readBits(1);
    const maxNum = sps_sub_layer_ordering_info_present_flag ? 0 : sps_max_sub_layers_minus1;
    for (let i = maxNum; i <= sps_max_sub_layers_minus1; i++) {
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    if (bitstream.readBits(1)) {
      if (bitstream.readBits(1)) {
        skipScalingListData(bitstream);
      }
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    if (bitstream.readBits(1)) {
      bitstream.skipBits(4);
      bitstream.skipBits(4);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      bitstream.skipBits(1);
    }
    const num_short_term_ref_pic_sets = readExpGolomb(bitstream);
    skipAllStRefPicSets(bitstream, num_short_term_ref_pic_sets);
    if (bitstream.readBits(1)) {
      const num_long_term_ref_pics_sps = readExpGolomb(bitstream);
      for (let i = 0; i < num_long_term_ref_pics_sps; i++) {
        readExpGolomb(bitstream);
        bitstream.skipBits(1);
      }
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    let min_spatial_segmentation_idc = 0;
    if (bitstream.readBits(1)) {
      min_spatial_segmentation_idc = parseVuiForMinSpatialSegmentationIdc(bitstream, sps_max_sub_layers_minus1);
    }
    let parallelismType = 0;
    if (ppsUnits.length > 0) {
      const pps = ppsUnits[0];
      const ppsBitstream = new Bitstream(removeEmulationPreventionBytes(pps));
      ppsBitstream.skipBits(16);
      readExpGolomb(ppsBitstream);
      readExpGolomb(ppsBitstream);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(3);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      readExpGolomb(ppsBitstream);
      readExpGolomb(ppsBitstream);
      readSignedExpGolomb(ppsBitstream);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      if (ppsBitstream.readBits(1)) {
        readExpGolomb(ppsBitstream);
      }
      readSignedExpGolomb(ppsBitstream);
      readSignedExpGolomb(ppsBitstream);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      const tiles_enabled_flag = ppsBitstream.readBits(1);
      const entropy_coding_sync_enabled_flag = ppsBitstream.readBits(1);
      if (!tiles_enabled_flag && !entropy_coding_sync_enabled_flag) parallelismType = 0;
      else if (tiles_enabled_flag && !entropy_coding_sync_enabled_flag) parallelismType = 2;
      else if (!tiles_enabled_flag && entropy_coding_sync_enabled_flag) parallelismType = 3;
      else parallelismType = 0;
    }
    const arrays = [
      ...vpsUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: 32 /* VPS_NUT */,
          nalUnits: vpsUnits
        }
      ] : [],
      ...spsUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: 33 /* SPS_NUT */,
          nalUnits: spsUnits
        }
      ] : [],
      ...ppsUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: 34 /* PPS_NUT */,
          nalUnits: ppsUnits
        }
      ] : [],
      ...seiUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: extractNalUnitTypeForHevc(seiUnits[0]),
          nalUnits: seiUnits
        }
      ] : []
    ];
    const record = {
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
      arrays
    };
    return record;
  } catch (error) {
    console.error("Error building HEVC Decoder Configuration Record:", error);
    return null;
  }
};
var parseProfileTierLevel = (bitstream, maxNumSubLayersMinus1) => {
  const general_profile_space = bitstream.readBits(2);
  const general_tier_flag = bitstream.readBits(1);
  const general_profile_idc = bitstream.readBits(5);
  let general_profile_compatibility_flags = 0;
  for (let i = 0; i < 32; i++) {
    general_profile_compatibility_flags = general_profile_compatibility_flags << 1 | bitstream.readBits(1);
  }
  const general_constraint_indicator_flags = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    general_constraint_indicator_flags[i] = bitstream.readBits(8);
  }
  const general_level_idc = bitstream.readBits(8);
  const sub_layer_profile_present_flag = [];
  const sub_layer_level_present_flag = [];
  for (let i = 0; i < maxNumSubLayersMinus1; i++) {
    sub_layer_profile_present_flag.push(bitstream.readBits(1));
    sub_layer_level_present_flag.push(bitstream.readBits(1));
  }
  if (maxNumSubLayersMinus1 > 0) {
    for (let i = maxNumSubLayersMinus1; i < 8; i++) {
      bitstream.skipBits(2);
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
    general_level_idc
  };
};
var skipScalingListData = (bitstream) => {
  for (let sizeId = 0; sizeId < 4; sizeId++) {
    for (let matrixId = 0; matrixId < (sizeId === 3 ? 2 : 6); matrixId++) {
      const scaling_list_pred_mode_flag = bitstream.readBits(1);
      if (!scaling_list_pred_mode_flag) {
        readExpGolomb(bitstream);
      } else {
        const coefNum = Math.min(64, 1 << 4 + (sizeId << 1));
        if (sizeId > 1) {
          readSignedExpGolomb(bitstream);
        }
        for (let i = 0; i < coefNum; i++) {
          readSignedExpGolomb(bitstream);
        }
      }
    }
  }
};
var skipAllStRefPicSets = (bitstream, num_short_term_ref_pic_sets) => {
  const NumDeltaPocs = [];
  for (let stRpsIdx = 0; stRpsIdx < num_short_term_ref_pic_sets; stRpsIdx++) {
    NumDeltaPocs[stRpsIdx] = skipStRefPicSet(bitstream, stRpsIdx, num_short_term_ref_pic_sets, NumDeltaPocs);
  }
};
var skipStRefPicSet = (bitstream, stRpsIdx, num_short_term_ref_pic_sets, NumDeltaPocs) => {
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
    bitstream.readBits(1);
    readExpGolomb(bitstream);
    const numDelta = NumDeltaPocs[RefRpsIdx] ?? 0;
    for (let j = 0; j <= numDelta; j++) {
      const used_by_curr_pic_flag = bitstream.readBits(1);
      if (!used_by_curr_pic_flag) {
        bitstream.readBits(1);
      }
    }
    NumDeltaPocsThis = NumDeltaPocs[RefRpsIdx];
  } else {
    const num_negative_pics = readExpGolomb(bitstream);
    const num_positive_pics = readExpGolomb(bitstream);
    for (let i = 0; i < num_negative_pics; i++) {
      readExpGolomb(bitstream);
      bitstream.readBits(1);
    }
    for (let i = 0; i < num_positive_pics; i++) {
      readExpGolomb(bitstream);
      bitstream.readBits(1);
    }
    NumDeltaPocsThis = num_negative_pics + num_positive_pics;
  }
  return NumDeltaPocsThis;
};
var parseVuiForMinSpatialSegmentationIdc = (bitstream, sps_max_sub_layers_minus1) => {
  if (bitstream.readBits(1)) {
    const aspect_ratio_idc = bitstream.readBits(8);
    if (aspect_ratio_idc === 255) {
      bitstream.readBits(16);
      bitstream.readBits(16);
    }
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(1);
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(3);
    bitstream.readBits(1);
    if (bitstream.readBits(1)) {
      bitstream.readBits(8);
      bitstream.readBits(8);
      bitstream.readBits(8);
    }
  }
  if (bitstream.readBits(1)) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
  }
  bitstream.readBits(1);
  bitstream.readBits(1);
  bitstream.readBits(1);
  if (bitstream.readBits(1)) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(32);
    bitstream.readBits(32);
    if (bitstream.readBits(1)) {
      readExpGolomb(bitstream);
    }
    if (bitstream.readBits(1)) {
      skipHrdParameters(bitstream, true, sps_max_sub_layers_minus1);
    }
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(1);
    bitstream.readBits(1);
    bitstream.readBits(1);
    const min_spatial_segmentation_idc = readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    return min_spatial_segmentation_idc;
  }
  return 0;
};
var skipHrdParameters = (bitstream, commonInfPresentFlag, maxNumSubLayersMinus1) => {
  let nal_hrd_parameters_present_flag = false;
  let vcl_hrd_parameters_present_flag = false;
  let sub_pic_hrd_params_present_flag = false;
  if (commonInfPresentFlag) {
    nal_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
    vcl_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
    if (nal_hrd_parameters_present_flag || vcl_hrd_parameters_present_flag) {
      sub_pic_hrd_params_present_flag = bitstream.readBits(1) === 1;
      if (sub_pic_hrd_params_present_flag) {
        bitstream.readBits(8);
        bitstream.readBits(5);
        bitstream.readBits(1);
        bitstream.readBits(5);
      }
      bitstream.readBits(4);
      bitstream.readBits(4);
      if (sub_pic_hrd_params_present_flag) {
        bitstream.readBits(4);
      }
      bitstream.readBits(5);
      bitstream.readBits(5);
      bitstream.readBits(5);
    }
  }
  for (let i = 0; i <= maxNumSubLayersMinus1; i++) {
    const fixed_pic_rate_general_flag = bitstream.readBits(1) === 1;
    let fixed_pic_rate_within_cvs_flag = true;
    if (!fixed_pic_rate_general_flag) {
      fixed_pic_rate_within_cvs_flag = bitstream.readBits(1) === 1;
    }
    let low_delay_hrd_flag = false;
    if (fixed_pic_rate_within_cvs_flag) {
      readExpGolomb(bitstream);
    } else {
      low_delay_hrd_flag = bitstream.readBits(1) === 1;
    }
    let CpbCnt = 1;
    if (!low_delay_hrd_flag) {
      const cpb_cnt_minus1 = readExpGolomb(bitstream);
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
var skipSubLayerHrdParameters = (bitstream, CpbCnt, sub_pic_hrd_params_present_flag) => {
  for (let i = 0; i < CpbCnt; i++) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    if (sub_pic_hrd_params_present_flag) {
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    bitstream.readBits(1);
  }
};
var serializeHevcDecoderConfigurationRecord = (record) => {
  const bytes2 = [];
  bytes2.push(record.configurationVersion);
  bytes2.push(
    (record.generalProfileSpace & 3) << 6 | (record.generalTierFlag & 1) << 5 | record.generalProfileIdc & 31
  );
  bytes2.push(record.generalProfileCompatibilityFlags >>> 24 & 255);
  bytes2.push(record.generalProfileCompatibilityFlags >>> 16 & 255);
  bytes2.push(record.generalProfileCompatibilityFlags >>> 8 & 255);
  bytes2.push(record.generalProfileCompatibilityFlags & 255);
  bytes2.push(...record.generalConstraintIndicatorFlags);
  bytes2.push(record.generalLevelIdc & 255);
  bytes2.push(240 | record.minSpatialSegmentationIdc >> 8 & 15);
  bytes2.push(record.minSpatialSegmentationIdc & 255);
  bytes2.push(252 | record.parallelismType & 3);
  bytes2.push(252 | record.chromaFormatIdc & 3);
  bytes2.push(248 | record.bitDepthLumaMinus8 & 7);
  bytes2.push(248 | record.bitDepthChromaMinus8 & 7);
  bytes2.push(record.avgFrameRate >> 8 & 255);
  bytes2.push(record.avgFrameRate & 255);
  bytes2.push(
    (record.constantFrameRate & 3) << 6 | (record.numTemporalLayers & 7) << 3 | (record.temporalIdNested & 1) << 2 | record.lengthSizeMinusOne & 3
  );
  bytes2.push(record.arrays.length & 255);
  for (const arr of record.arrays) {
    bytes2.push(
      (arr.arrayCompleteness & 1) << 7 | 0 << 6 | arr.nalUnitType & 63
    );
    bytes2.push(arr.nalUnits.length >> 8 & 255);
    bytes2.push(arr.nalUnits.length & 255);
    for (const nal of arr.nalUnits) {
      bytes2.push(nal.length >> 8 & 255);
      bytes2.push(nal.length & 255);
      for (let i = 0; i < nal.length; i++) {
        bytes2.push(nal[i]);
      }
    }
  }
  return new Uint8Array(bytes2);
};
var extractVp9CodecInfoFromPacket = (packet) => {
  const bitstream = new Bitstream(packet);
  const frameMarker = bitstream.readBits(2);
  if (frameMarker !== 2) {
    return null;
  }
  const profileLowBit = bitstream.readBits(1);
  const profileHighBit = bitstream.readBits(1);
  const profile = (profileHighBit << 1) + profileLowBit;
  if (profile === 3) {
    bitstream.skipBits(1);
  }
  const showExistingFrame = bitstream.readBits(1);
  if (showExistingFrame === 1) {
    return null;
  }
  const frameType = bitstream.readBits(1);
  if (frameType !== 0) {
    return null;
  }
  bitstream.skipBits(2);
  const syncCode = bitstream.readBits(24);
  if (syncCode !== 4817730) {
    return null;
  }
  let bitDepth = 8;
  if (profile >= 2) {
    const tenOrTwelveBit = bitstream.readBits(1);
    bitDepth = tenOrTwelveBit ? 12 : 10;
  }
  const colorSpace = bitstream.readBits(3);
  let chromaSubsampling = 0;
  let videoFullRangeFlag = 0;
  if (colorSpace !== 7) {
    const colorRange = bitstream.readBits(1);
    videoFullRangeFlag = colorRange;
    if (profile === 1 || profile === 3) {
      const subsamplingX = bitstream.readBits(1);
      const subsamplingY = bitstream.readBits(1);
      chromaSubsampling = !subsamplingX && !subsamplingY ? 3 : subsamplingX && !subsamplingY ? 2 : 1;
      bitstream.skipBits(1);
    } else {
      chromaSubsampling = 1;
    }
  } else {
    chromaSubsampling = 3;
    videoFullRangeFlag = 1;
  }
  const widthMinusOne = bitstream.readBits(16);
  const heightMinusOne = bitstream.readBits(16);
  const width = widthMinusOne + 1;
  const height = heightMinusOne + 1;
  const pictureSize = width * height;
  let level = last(VP9_LEVEL_TABLE).level;
  for (const entry of VP9_LEVEL_TABLE) {
    if (pictureSize <= entry.maxPictureSize) {
      level = entry.level;
      break;
    }
  }
  const matrixCoefficients = colorSpace === 7 ? 0 : colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
  const colourPrimaries = colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
  const transferCharacteristics = colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
  return {
    profile,
    level,
    bitDepth,
    chromaSubsampling,
    videoFullRangeFlag,
    colourPrimaries,
    transferCharacteristics,
    matrixCoefficients
  };
};
var iterateAv1PacketObus = function* (packet) {
  const bitstream = new Bitstream(packet);
  const readLeb128 = () => {
    let value = 0;
    for (let i = 0; i < 8; i++) {
      const byte = bitstream.readAlignedByte();
      value |= (byte & 127) << i * 7;
      if (!(byte & 128)) {
        break;
      }
      if (i === 7 && byte & 128) {
        return null;
      }
    }
    if (value >= 2 ** 32 - 1) {
      return null;
    }
    return value;
  };
  while (bitstream.getBitsLeft() >= 8) {
    bitstream.skipBits(1);
    const obuType = bitstream.readBits(4);
    const obuExtension = bitstream.readBits(1);
    const obuHasSizeField = bitstream.readBits(1);
    bitstream.skipBits(1);
    if (obuExtension) {
      bitstream.skipBits(8);
    }
    let obuSize;
    if (obuHasSizeField) {
      const obuSizeValue = readLeb128();
      if (obuSizeValue === null) return;
      obuSize = obuSizeValue;
    } else {
      obuSize = Math.floor(bitstream.getBitsLeft() / 8);
    }
    assert(bitstream.pos % 8 === 0);
    yield {
      type: obuType,
      data: packet.subarray(bitstream.pos / 8, bitstream.pos / 8 + obuSize)
    };
    bitstream.skipBits(obuSize * 8);
  }
};
var extractAv1CodecInfoFromPacket = (packet) => {
  for (const { type, data } of iterateAv1PacketObus(packet)) {
    if (type !== 1) {
      continue;
    }
    const bitstream = new Bitstream(data);
    const seqProfile = bitstream.readBits(3);
    const stillPicture = bitstream.readBits(1);
    const reducedStillPictureHeader = bitstream.readBits(1);
    let seqLevel = 0;
    let seqTier = 0;
    let bufferDelayLengthMinus1 = 0;
    if (reducedStillPictureHeader) {
      seqLevel = bitstream.readBits(5);
    } else {
      const timingInfoPresentFlag = bitstream.readBits(1);
      if (timingInfoPresentFlag) {
        bitstream.skipBits(32);
        bitstream.skipBits(32);
        const equalPictureInterval = bitstream.readBits(1);
        if (equalPictureInterval) {
          return null;
        }
      }
      const decoderModelInfoPresentFlag = bitstream.readBits(1);
      if (decoderModelInfoPresentFlag) {
        bufferDelayLengthMinus1 = bitstream.readBits(5);
        bitstream.skipBits(32);
        bitstream.skipBits(5);
        bitstream.skipBits(5);
      }
      const operatingPointsCntMinus1 = bitstream.readBits(5);
      for (let i = 0; i <= operatingPointsCntMinus1; i++) {
        bitstream.skipBits(12);
        const seqLevelIdx = bitstream.readBits(5);
        if (i === 0) {
          seqLevel = seqLevelIdx;
        }
        if (seqLevelIdx > 7) {
          const seqTierTemp = bitstream.readBits(1);
          if (i === 0) {
            seqTier = seqTierTemp;
          }
        }
        if (decoderModelInfoPresentFlag) {
          const decoderModelPresentForThisOp = bitstream.readBits(1);
          if (decoderModelPresentForThisOp) {
            const n = bufferDelayLengthMinus1 + 1;
            bitstream.skipBits(n);
            bitstream.skipBits(n);
            bitstream.skipBits(1);
          }
        }
        const initialDisplayDelayPresentFlag = bitstream.readBits(1);
        if (initialDisplayDelayPresentFlag) {
          bitstream.skipBits(4);
        }
      }
    }
    const highBitdepth = bitstream.readBits(1);
    let bitDepth = 8;
    if (seqProfile === 2 && highBitdepth) {
      const twelveBit = bitstream.readBits(1);
      bitDepth = twelveBit ? 12 : 10;
    } else if (seqProfile <= 2) {
      bitDepth = highBitdepth ? 10 : 8;
    }
    let monochrome = 0;
    if (seqProfile !== 1) {
      monochrome = bitstream.readBits(1);
    }
    let chromaSubsamplingX = 1;
    let chromaSubsamplingY = 1;
    let chromaSamplePosition = 0;
    if (!monochrome) {
      if (seqProfile === 0) {
        chromaSubsamplingX = 1;
        chromaSubsamplingY = 1;
      } else if (seqProfile === 1) {
        chromaSubsamplingX = 0;
        chromaSubsamplingY = 0;
      } else {
        if (bitDepth === 12) {
          chromaSubsamplingX = bitstream.readBits(1);
          if (chromaSubsamplingX) {
            chromaSubsamplingY = bitstream.readBits(1);
          }
        }
      }
      if (chromaSubsamplingX && chromaSubsamplingY) {
        chromaSamplePosition = bitstream.readBits(2);
      }
    }
    return {
      profile: seqProfile,
      level: seqLevel,
      tier: seqTier,
      bitDepth,
      monochrome,
      chromaSubsamplingX,
      chromaSubsamplingY,
      chromaSamplePosition
    };
  }
  return null;
};
var parseOpusIdentificationHeader = (bytes2) => {
  const view2 = toDataView(bytes2);
  const outputChannelCount = view2.getUint8(9);
  const preSkip = view2.getUint16(10, true);
  const inputSampleRate = view2.getUint32(12, true);
  const outputGain = view2.getInt16(16, true);
  const channelMappingFamily = view2.getUint8(18);
  let channelMappingTable = null;
  if (channelMappingFamily) {
    channelMappingTable = bytes2.subarray(19, 19 + 2 + outputChannelCount);
  }
  return {
    outputChannelCount,
    preSkip,
    inputSampleRate,
    outputGain,
    channelMappingFamily,
    channelMappingTable
  };
};
var OPUS_FRAME_DURATION_TABLE = [
  480,
  960,
  1920,
  2880,
  480,
  960,
  1920,
  2880,
  480,
  960,
  1920,
  2880,
  480,
  960,
  480,
  960,
  120,
  240,
  480,
  960,
  120,
  240,
  480,
  960,
  120,
  240,
  480,
  960,
  120,
  240,
  480,
  960
];
var parseOpusTocByte = (packet) => {
  const config = packet[0] >> 3;
  return {
    durationInSamples: OPUS_FRAME_DURATION_TABLE[config]
  };
};
var parseModesFromVorbisSetupPacket = (setupHeader) => {
  if (setupHeader.length < 7) {
    throw new Error("Setup header is too short.");
  }
  if (setupHeader[0] !== 5) {
    throw new Error("Wrong packet type in Setup header.");
  }
  const signature = String.fromCharCode(...setupHeader.slice(1, 7));
  if (signature !== "vorbis") {
    throw new Error("Invalid packet signature in Setup header.");
  }
  const bufSize = setupHeader.length;
  const revBuffer = new Uint8Array(bufSize);
  for (let i = 0; i < bufSize; i++) {
    revBuffer[i] = setupHeader[bufSize - 1 - i];
  }
  const bitstream = new Bitstream(revBuffer);
  let gotFramingBit = 0;
  while (bitstream.getBitsLeft() > 97) {
    if (bitstream.readBits(1) === 1) {
      gotFramingBit = bitstream.pos;
      break;
    }
  }
  if (gotFramingBit === 0) {
    throw new Error("Invalid Setup header: framing bit not found.");
  }
  let modeCount = 0;
  let gotModeHeader = false;
  let lastModeCount = 0;
  while (bitstream.getBitsLeft() >= 97) {
    const tempPos = bitstream.pos;
    const a = bitstream.readBits(8);
    const b = bitstream.readBits(16);
    const c = bitstream.readBits(16);
    if (a > 63 || b !== 0 || c !== 0) {
      bitstream.pos = tempPos;
      break;
    }
    bitstream.skipBits(1);
    modeCount++;
    if (modeCount > 64) {
      break;
    }
    const bsClone = bitstream.clone();
    const candidate = bsClone.readBits(6) + 1;
    if (candidate === modeCount) {
      gotModeHeader = true;
      lastModeCount = modeCount;
    }
  }
  if (!gotModeHeader) {
    throw new Error("Invalid Setup header: mode header not found.");
  }
  if (lastModeCount > 63) {
    throw new Error(`Unsupported mode count: ${lastModeCount}.`);
  }
  const finalModeCount = lastModeCount;
  bitstream.pos = 0;
  bitstream.skipBits(gotFramingBit);
  const modeBlockflags = Array(finalModeCount).fill(0);
  for (let i = finalModeCount - 1; i >= 0; i--) {
    bitstream.skipBits(40);
    modeBlockflags[i] = bitstream.readBits(1);
  }
  return { modeBlockflags };
};
var determineVideoPacketType = (codec, decoderConfig, packetData) => {
  switch (codec) {
    case "avc":
      {
        const nalUnits = extractAvcNalUnits(packetData, decoderConfig);
        const isKeyframe = nalUnits.some((x) => extractNalUnitTypeForAvc(x) === 5 /* IDR */);
        return isKeyframe ? "key" : "delta";
      }
      ;
    case "hevc":
      {
        const nalUnits = extractHevcNalUnits(packetData, decoderConfig);
        const isKeyframe = nalUnits.some((x) => {
          const type = extractNalUnitTypeForHevc(x);
          return 16 /* BLA_W_LP */ <= type && type <= 23 /* RSV_IRAP_VCL23 */;
        });
        return isKeyframe ? "key" : "delta";
      }
      ;
    case "vp8":
      {
        const frameType = packetData[0] & 1;
        return frameType === 0 ? "key" : "delta";
      }
      ;
    case "vp9":
      {
        const bitstream = new Bitstream(packetData);
        if (bitstream.readBits(2) !== 2) {
          return null;
        }
        ;
        const profileLowBit = bitstream.readBits(1);
        const profileHighBit = bitstream.readBits(1);
        const profile = (profileHighBit << 1) + profileLowBit;
        if (profile === 3) {
          bitstream.skipBits(1);
        }
        const showExistingFrame = bitstream.readBits(1);
        if (showExistingFrame) {
          return null;
        }
        const frameType = bitstream.readBits(1);
        return frameType === 0 ? "key" : "delta";
      }
      ;
    case "av1":
      {
        let reducedStillPictureHeader = false;
        for (const { type, data } of iterateAv1PacketObus(packetData)) {
          if (type === 1) {
            const bitstream = new Bitstream(data);
            bitstream.skipBits(4);
            reducedStillPictureHeader = !!bitstream.readBits(1);
          } else if (type === 3 || type === 6 || type === 7) {
            if (reducedStillPictureHeader) {
              return "key";
            }
            const bitstream = new Bitstream(data);
            const showExistingFrame = bitstream.readBits(1);
            if (showExistingFrame) {
              return null;
            }
            const frameType = bitstream.readBits(2);
            return frameType === 0 ? "key" : "delta";
          }
        }
        return null;
      }
      ;
    case "mpeg4":
      {
        for (let i = 0; i < packetData.length - 4; i++) {
          if (packetData[i] === 0 && packetData[i + 1] === 0 && packetData[i + 2] === 1 && packetData[i + 3] === 182) {
            const vopCodingType = packetData[i + 4] >> 6 & 3;
            return vopCodingType === 0 ? "key" : "delta";
          }
        }
        return null;
      }
      ;
    default:
      {
        assertNever(codec);
        assert(false);
      }
      ;
  }
};
var readVorbisComments = (bytes2, metadataTags) => {
  const commentView = toDataView(bytes2);
  let commentPos = 0;
  const vendorStringLength = commentView.getUint32(commentPos, true);
  commentPos += 4;
  const vendorString = textDecoder.decode(
    bytes2.subarray(commentPos, commentPos + vendorStringLength)
  );
  commentPos += vendorStringLength;
  if (vendorStringLength > 0) {
    metadataTags.raw ??= {};
    metadataTags.raw["vendor"] ??= vendorString;
  }
  const listLength = commentView.getUint32(commentPos, true);
  commentPos += 4;
  for (let i = 0; i < listLength; i++) {
    const stringLength = commentView.getUint32(commentPos, true);
    commentPos += 4;
    const string = textDecoder.decode(
      bytes2.subarray(commentPos, commentPos + stringLength)
    );
    commentPos += stringLength;
    const separatorIndex = string.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = string.slice(0, separatorIndex).toUpperCase();
    const value = string.slice(separatorIndex + 1);
    metadataTags.raw ??= {};
    metadataTags.raw[key] ??= value;
    switch (key) {
      case "TITLE":
        {
          metadataTags.title ??= value;
        }
        ;
        break;
      case "DESCRIPTION":
        {
          metadataTags.description ??= value;
        }
        ;
        break;
      case "ARTIST":
        {
          metadataTags.artist ??= value;
        }
        ;
        break;
      case "ALBUM":
        {
          metadataTags.album ??= value;
        }
        ;
        break;
      case "ALBUMARTIST":
        {
          metadataTags.albumArtist ??= value;
        }
        ;
        break;
      case "COMMENT":
        {
          metadataTags.comment ??= value;
        }
        ;
        break;
      case "LYRICS":
        {
          metadataTags.lyrics ??= value;
        }
        ;
        break;
      case "TRACKNUMBER":
        {
          const parts = value.split("/");
          const trackNum = Number.parseInt(parts[0], 10);
          const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
          if (Number.isInteger(trackNum) && trackNum > 0) {
            metadataTags.trackNumber ??= trackNum;
          }
          if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
            metadataTags.tracksTotal ??= tracksTotal;
          }
        }
        ;
        break;
      case "TRACKTOTAL":
        {
          const tracksTotal = Number.parseInt(value, 10);
          if (Number.isInteger(tracksTotal) && tracksTotal > 0) {
            metadataTags.tracksTotal ??= tracksTotal;
          }
        }
        ;
        break;
      case "DISCNUMBER":
        {
          const parts = value.split("/");
          const discNum = Number.parseInt(parts[0], 10);
          const discsTotal = parts[1] && Number.parseInt(parts[1], 10);
          if (Number.isInteger(discNum) && discNum > 0) {
            metadataTags.discNumber ??= discNum;
          }
          if (discsTotal && Number.isInteger(discsTotal) && discsTotal > 0) {
            metadataTags.discsTotal ??= discsTotal;
          }
        }
        ;
        break;
      case "DISCTOTAL":
        {
          const discsTotal = Number.parseInt(value, 10);
          if (Number.isInteger(discsTotal) && discsTotal > 0) {
            metadataTags.discsTotal ??= discsTotal;
          }
        }
        ;
        break;
      case "DATE":
        {
          const date = new Date(value);
          if (!Number.isNaN(date.getTime())) {
            metadataTags.date ??= date;
          }
        }
        ;
        break;
      case "GENRE":
        {
          metadataTags.genre ??= value;
        }
        ;
        break;
      case "METADATA_BLOCK_PICTURE":
        {
          const decoded = base64ToBytes(value);
          const view2 = toDataView(decoded);
          const pictureType = view2.getUint32(0, false);
          const mediaTypeLength = view2.getUint32(4, false);
          const mediaType = String.fromCharCode(...decoded.subarray(8, 8 + mediaTypeLength));
          const descriptionLength = view2.getUint32(8 + mediaTypeLength, false);
          const description = textDecoder.decode(decoded.subarray(
            12 + mediaTypeLength,
            12 + mediaTypeLength + descriptionLength
          ));
          const dataLength = view2.getUint32(mediaTypeLength + descriptionLength + 28);
          const data = decoded.subarray(
            mediaTypeLength + descriptionLength + 32,
            mediaTypeLength + descriptionLength + 32 + dataLength
          );
          metadataTags.images ??= [];
          metadataTags.images.push({
            data,
            mimeType: mediaType,
            kind: pictureType === 3 ? "coverFront" : pictureType === 4 ? "coverBack" : "unknown",
            name: void 0,
            description: description || void 0
          });
        }
        ;
        break;
    }
  }
};
var createVorbisComments = (headerBytes, tags, writeImages) => {
  const commentHeaderParts = [
    headerBytes
  ];
  const vendorString = "Mediabunny";
  const encodedVendorString = textEncoder.encode(vendorString);
  let currentBuffer = new Uint8Array(4 + encodedVendorString.length);
  let currentView = new DataView(currentBuffer.buffer);
  currentView.setUint32(0, encodedVendorString.length, true);
  currentBuffer.set(encodedVendorString, 4);
  commentHeaderParts.push(currentBuffer);
  const writtenTags = /* @__PURE__ */ new Set();
  const addCommentTag = (key, value) => {
    const joined = `${key}=${value}`;
    const encoded = textEncoder.encode(joined);
    currentBuffer = new Uint8Array(4 + encoded.length);
    currentView = new DataView(currentBuffer.buffer);
    currentView.setUint32(0, encoded.length, true);
    currentBuffer.set(encoded, 4);
    commentHeaderParts.push(currentBuffer);
    writtenTags.add(key);
  };
  for (const { key, value } of keyValueIterator(tags)) {
    switch (key) {
      case "title":
        {
          addCommentTag("TITLE", value);
        }
        ;
        break;
      case "description":
        {
          addCommentTag("DESCRIPTION", value);
        }
        ;
        break;
      case "artist":
        {
          addCommentTag("ARTIST", value);
        }
        ;
        break;
      case "album":
        {
          addCommentTag("ALBUM", value);
        }
        ;
        break;
      case "albumArtist":
        {
          addCommentTag("ALBUMARTIST", value);
        }
        ;
        break;
      case "genre":
        {
          addCommentTag("GENRE", value);
        }
        ;
        break;
      case "date":
        {
          const rawVersion = tags.raw?.["DATE"] ?? tags.raw?.["date"];
          if (rawVersion && typeof rawVersion === "string") {
            addCommentTag("DATE", rawVersion);
          } else {
            addCommentTag("DATE", value.toISOString().slice(0, 10));
          }
        }
        ;
        break;
      case "comment":
        {
          addCommentTag("COMMENT", value);
        }
        ;
        break;
      case "lyrics":
        {
          addCommentTag("LYRICS", value);
        }
        ;
        break;
      case "trackNumber":
        {
          addCommentTag("TRACKNUMBER", value.toString());
        }
        ;
        break;
      case "tracksTotal":
        {
          addCommentTag("TRACKTOTAL", value.toString());
        }
        ;
        break;
      case "discNumber":
        {
          addCommentTag("DISCNUMBER", value.toString());
        }
        ;
        break;
      case "discsTotal":
        {
          addCommentTag("DISCTOTAL", value.toString());
        }
        ;
        break;
      case "images":
        {
          if (!writeImages) {
            break;
          }
          for (const image of value) {
            const pictureType = image.kind === "coverFront" ? 3 : image.kind === "coverBack" ? 4 : 0;
            const encodedMediaType = new Uint8Array(image.mimeType.length);
            for (let i = 0; i < image.mimeType.length; i++) {
              encodedMediaType[i] = image.mimeType.charCodeAt(i);
            }
            const encodedDescription = textEncoder.encode(image.description ?? "");
            const buffer = new Uint8Array(
              4 + 4 + encodedMediaType.length + 4 + encodedDescription.length + 16 + 4 + image.data.length
              // Picture data
            );
            const view2 = toDataView(buffer);
            view2.setUint32(0, pictureType, false);
            view2.setUint32(4, encodedMediaType.length, false);
            buffer.set(encodedMediaType, 8);
            view2.setUint32(8 + encodedMediaType.length, encodedDescription.length, false);
            buffer.set(encodedDescription, 12 + encodedMediaType.length);
            view2.setUint32(
              28 + encodedMediaType.length + encodedDescription.length,
              image.data.length,
              false
            );
            buffer.set(
              image.data,
              32 + encodedMediaType.length + encodedDescription.length
            );
            const encoded = bytesToBase64(buffer);
            addCommentTag("METADATA_BLOCK_PICTURE", encoded);
          }
        }
        ;
        break;
      case "raw":
        {
        }
        ;
        break;
      default:
        assertNever(key);
    }
  }
  if (tags.raw) {
    for (const key in tags.raw) {
      const value = tags.raw[key] ?? tags.raw[key.toLowerCase()];
      if (key === "vendor" || value == null || writtenTags.has(key)) {
        continue;
      }
      if (typeof value === "string") {
        addCommentTag(key, value);
      }
    }
  }
  const listLengthBuffer = new Uint8Array(4);
  toDataView(listLengthBuffer).setUint32(0, writtenTags.size, true);
  commentHeaderParts.splice(2, 0, listLengthBuffer);
  const commentHeaderLength = commentHeaderParts.reduce((a, b) => a + b.length, 0);
  const commentHeader = new Uint8Array(commentHeaderLength);
  let pos = 0;
  for (const part of commentHeaderParts) {
    commentHeader.set(part, pos);
    pos += part.length;
  }
  return commentHeader;
};

// src/demuxer.ts
var Demuxer = class {
  constructor(input) {
    this.input = input;
  }
};

// src/custom-coder.ts
var CustomVideoDecoder = class {
  /** Returns true if and only if the decoder can decode the given codec configuration. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static supports(codec, config) {
    return false;
  }
};
var CustomAudioDecoder = class {
  /** Returns true if and only if the decoder can decode the given codec configuration. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static supports(codec, config) {
    return false;
  }
};
var CustomVideoEncoder = class {
  /** Returns true if and only if the encoder can encode the given codec configuration. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static supports(codec, config) {
    return false;
  }
};
var CustomAudioEncoder = class {
  /** Returns true if and only if the encoder can encode the given codec configuration. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static supports(codec, config) {
    return false;
  }
};
var customVideoDecoders = [];
var customAudioDecoders = [];
var customVideoEncoders = [];
var customAudioEncoders = [];
var registerDecoder = (decoder) => {
  if (decoder.prototype instanceof CustomVideoDecoder) {
    const casted = decoder;
    if (customVideoDecoders.includes(casted)) {
      console.warn("Video decoder already registered.");
      return;
    }
    customVideoDecoders.push(casted);
  } else if (decoder.prototype instanceof CustomAudioDecoder) {
    const casted = decoder;
    if (customAudioDecoders.includes(casted)) {
      console.warn("Audio decoder already registered.");
      return;
    }
    customAudioDecoders.push(casted);
  } else {
    throw new TypeError("Decoder must be a CustomVideoDecoder or CustomAudioDecoder.");
  }
};
var registerEncoder = (encoder) => {
  if (encoder.prototype instanceof CustomVideoEncoder) {
    const casted = encoder;
    if (customVideoEncoders.includes(casted)) {
      console.warn("Video encoder already registered.");
      return;
    }
    customVideoEncoders.push(casted);
  } else if (encoder.prototype instanceof CustomAudioEncoder) {
    const casted = encoder;
    if (customAudioEncoders.includes(casted)) {
      console.warn("Audio encoder already registered.");
      return;
    }
    customAudioEncoders.push(casted);
  } else {
    throw new TypeError("Encoder must be a CustomVideoEncoder or CustomAudioEncoder.");
  }
};

// src/packet.ts
var PLACEHOLDER_DATA = new Uint8Array(0);
var EncodedPacket = class _EncodedPacket {
  /** Creates a new {@link EncodedPacket} from raw bytes and timing information. */
  constructor(data, type, timestamp, duration, sequenceNumber = -1, byteLength, sideData) {
    this.data = data;
    this.type = type;
    this.timestamp = timestamp;
    this.duration = duration;
    this.sequenceNumber = sequenceNumber;
    if (data === PLACEHOLDER_DATA && byteLength === void 0) {
      throw new Error(
        "Internal error: byteLength must be explicitly provided when constructing metadata-only packets."
      );
    }
    if (byteLength === void 0) {
      byteLength = data.byteLength;
    }
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array.");
    }
    if (type !== "key" && type !== "delta") {
      throw new TypeError('type must be either "key" or "delta".');
    }
    if (!Number.isFinite(timestamp)) {
      throw new TypeError("timestamp must be a number.");
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("duration must be a non-negative number.");
    }
    if (!Number.isFinite(sequenceNumber)) {
      throw new TypeError("sequenceNumber must be a number.");
    }
    if (!Number.isInteger(byteLength) || byteLength < 0) {
      throw new TypeError("byteLength must be a non-negative integer.");
    }
    if (sideData !== void 0 && (typeof sideData !== "object" || !sideData)) {
      throw new TypeError("sideData, when provided, must be an object.");
    }
    if (sideData?.alpha !== void 0 && !(sideData.alpha instanceof Uint8Array)) {
      throw new TypeError("sideData.alpha, when provided, must be a Uint8Array.");
    }
    if (sideData?.alphaByteLength !== void 0 && (!Number.isInteger(sideData.alphaByteLength) || sideData.alphaByteLength < 0)) {
      throw new TypeError("sideData.alphaByteLength, when provided, must be a non-negative integer.");
    }
    this.byteLength = byteLength;
    this.sideData = sideData ?? {};
    if (this.sideData.alpha && this.sideData.alphaByteLength === void 0) {
      this.sideData.alphaByteLength = this.sideData.alpha.byteLength;
    }
  }
  /** If this packet is a metadata-only packet. Metadata-only packets don't contain their packet data. */
  get isMetadataOnly() {
    return this.data === PLACEHOLDER_DATA;
  }
  /** The timestamp of this packet in microseconds. */
  get microsecondTimestamp() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
  }
  /** The duration of this packet in microseconds. */
  get microsecondDuration() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
  }
  /** Converts this packet to an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
   * WebCodecs API. */
  toEncodedVideoChunk() {
    if (this.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
    }
    if (typeof EncodedVideoChunk === "undefined") {
      throw new Error("Your browser does not support EncodedVideoChunk.");
    }
    return new EncodedVideoChunk({
      data: this.data,
      type: this.type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /**
   * Converts this packet to an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
   * WebCodecs API, using the alpha side data instead of the color data. Throws if no alpha side data is defined.
   */
  alphaToEncodedVideoChunk(type = this.type) {
    if (!this.sideData.alpha) {
      throw new TypeError("This packet does not contain alpha side data.");
    }
    if (this.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
    }
    if (typeof EncodedVideoChunk === "undefined") {
      throw new Error("Your browser does not support EncodedVideoChunk.");
    }
    return new EncodedVideoChunk({
      data: this.sideData.alpha,
      type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /** Converts this packet to an
   * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk) for use with the
   * WebCodecs API. */
  toEncodedAudioChunk() {
    if (this.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be converted to an audio chunk.");
    }
    if (typeof EncodedAudioChunk === "undefined") {
      throw new Error("Your browser does not support EncodedAudioChunk.");
    }
    return new EncodedAudioChunk({
      data: this.data,
      type: this.type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /**
   * Creates an {@link EncodedPacket} from an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) or
   * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk). This method is useful
   * for converting chunks from the WebCodecs API to `EncodedPacket` instances.
   */
  static fromEncodedChunk(chunk, sideData) {
    if (!(chunk instanceof EncodedVideoChunk || chunk instanceof EncodedAudioChunk)) {
      throw new TypeError("chunk must be an EncodedVideoChunk or EncodedAudioChunk.");
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    return new _EncodedPacket(
      data,
      chunk.type,
      chunk.timestamp / 1e6,
      (chunk.duration ?? 0) / 1e6,
      void 0,
      void 0,
      sideData
    );
  }
  /** Clones this packet while optionally updating timing information. */
  clone(options) {
    if (options !== void 0 && (typeof options !== "object" || options === null)) {
      throw new TypeError("options, when provided, must be an object.");
    }
    if (options?.timestamp !== void 0 && !Number.isFinite(options.timestamp)) {
      throw new TypeError("options.timestamp, when provided, must be a number.");
    }
    if (options?.duration !== void 0 && !Number.isFinite(options.duration)) {
      throw new TypeError("options.duration, when provided, must be a number.");
    }
    return new _EncodedPacket(
      this.data,
      this.type,
      options?.timestamp ?? this.timestamp,
      options?.duration ?? this.duration,
      this.sequenceNumber,
      this.byteLength
    );
  }
};

// src/pcm.ts
var toUlaw = (s16) => {
  const MULAW_MAX = 8191;
  const MULAW_BIAS = 33;
  let number = s16;
  let mask = 4096;
  let sign = 0;
  let position = 12;
  let lsb = 0;
  if (number < 0) {
    number = -number;
    sign = 128;
  }
  number += MULAW_BIAS;
  if (number > MULAW_MAX) {
    number = MULAW_MAX;
  }
  while ((number & mask) !== mask && position >= 5) {
    mask >>= 1;
    position--;
  }
  lsb = number >> position - 4 & 15;
  return ~(sign | position - 5 << 4 | lsb) & 255;
};
var fromUlaw = (u82) => {
  const MULAW_BIAS = 33;
  let sign = 0;
  let position = 0;
  let number = ~u82;
  if (number & 128) {
    number &= ~(1 << 7);
    sign = -1;
  }
  position = ((number & 240) >> 4) + 5;
  const decoded = (1 << position | (number & 15) << position - 4 | 1 << position - 5) - MULAW_BIAS;
  return sign === 0 ? decoded : -decoded;
};
var toAlaw = (s16) => {
  const ALAW_MAX = 4095;
  let mask = 2048;
  let sign = 0;
  let position = 11;
  let lsb = 0;
  let number = s16;
  if (number < 0) {
    number = -number;
    sign = 128;
  }
  if (number > ALAW_MAX) {
    number = ALAW_MAX;
  }
  while ((number & mask) !== mask && position >= 5) {
    mask >>= 1;
    position--;
  }
  lsb = number >> (position === 4 ? 1 : position - 4) & 15;
  return (sign | position - 4 << 4 | lsb) ^ 85;
};
var fromAlaw = (u82) => {
  let sign = 0;
  let position = 0;
  let number = u82 ^ 85;
  if (number & 128) {
    number &= ~(1 << 7);
    sign = -1;
  }
  position = ((number & 240) >> 4) + 4;
  let decoded = 0;
  if (position !== 4) {
    decoded = 1 << position | (number & 15) << position - 4 | 1 << position - 5;
  } else {
    decoded = number << 1 | 1;
  }
  return sign === 0 ? decoded : -decoded;
};

// src/sample.ts
polyfillSymbolDispose();
var VideoSample = class _VideoSample {
  constructor(data, init) {
    /** @internal */
    this._closed = false;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      if (!init || typeof init !== "object") {
        throw new TypeError("init must be an object.");
      }
      if (!("format" in init) || typeof init.format !== "string") {
        throw new TypeError("init.format must be a string.");
      }
      if (!Number.isInteger(init.codedWidth) || init.codedWidth <= 0) {
        throw new TypeError("init.codedWidth must be a positive integer.");
      }
      if (!Number.isInteger(init.codedHeight) || init.codedHeight <= 0) {
        throw new TypeError("init.codedHeight must be a positive integer.");
      }
      if (init.rotation !== void 0 && ![0, 90, 180, 270].includes(init.rotation)) {
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      }
      if (!Number.isFinite(init.timestamp)) {
        throw new TypeError("init.timestamp must be a number.");
      }
      if (init.duration !== void 0 && (!Number.isFinite(init.duration) || init.duration < 0)) {
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      }
      this._data = toUint8Array(data).slice();
      this.format = init.format;
      this.codedWidth = init.codedWidth;
      this.codedHeight = init.codedHeight;
      this.rotation = init.rotation ?? 0;
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? 0;
      this.colorSpace = new VideoColorSpace(init.colorSpace);
    } else if (typeof VideoFrame !== "undefined" && data instanceof VideoFrame) {
      if (init?.rotation !== void 0 && ![0, 90, 180, 270].includes(init.rotation)) {
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      }
      if (init?.timestamp !== void 0 && !Number.isFinite(init?.timestamp)) {
        throw new TypeError("init.timestamp, when provided, must be a number.");
      }
      if (init?.duration !== void 0 && (!Number.isFinite(init.duration) || init.duration < 0)) {
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      }
      this._data = data;
      this.format = data.format;
      this.codedWidth = data.displayWidth;
      this.codedHeight = data.displayHeight;
      this.rotation = init?.rotation ?? 0;
      this.timestamp = init?.timestamp ?? data.timestamp / 1e6;
      this.duration = init?.duration ?? (data.duration ?? 0) / 1e6;
      this.colorSpace = data.colorSpace;
    } else if (typeof HTMLImageElement !== "undefined" && data instanceof HTMLImageElement || typeof SVGImageElement !== "undefined" && data instanceof SVGImageElement || typeof ImageBitmap !== "undefined" && data instanceof ImageBitmap || typeof HTMLVideoElement !== "undefined" && data instanceof HTMLVideoElement || typeof HTMLCanvasElement !== "undefined" && data instanceof HTMLCanvasElement || typeof OffscreenCanvas !== "undefined" && data instanceof OffscreenCanvas) {
      if (!init || typeof init !== "object") {
        throw new TypeError("init must be an object.");
      }
      if (init.rotation !== void 0 && ![0, 90, 180, 270].includes(init.rotation)) {
        throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
      }
      if (!Number.isFinite(init.timestamp)) {
        throw new TypeError("init.timestamp must be a number.");
      }
      if (init.duration !== void 0 && (!Number.isFinite(init.duration) || init.duration < 0)) {
        throw new TypeError("init.duration, when provided, must be a non-negative number.");
      }
      if (typeof VideoFrame !== "undefined") {
        return new _VideoSample(
          new VideoFrame(data, {
            timestamp: Math.trunc(init.timestamp * SECOND_TO_MICROSECOND_FACTOR),
            // Drag 0 to undefined
            duration: Math.trunc((init.duration ?? 0) * SECOND_TO_MICROSECOND_FACTOR) || void 0
          }),
          init
        );
      }
      let width = 0;
      let height = 0;
      if ("naturalWidth" in data) {
        width = data.naturalWidth;
        height = data.naturalHeight;
      } else if ("videoWidth" in data) {
        width = data.videoWidth;
        height = data.videoHeight;
      } else if ("width" in data) {
        width = Number(data.width);
        height = Number(data.height);
      }
      if (!width || !height) {
        throw new TypeError("Could not determine dimensions.");
      }
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", {
        alpha: isFirefox(),
        // Firefox has VideoFrame glitches with opaque canvases
        willReadFrequently: true
      });
      assert(context);
      context.drawImage(data, 0, 0);
      this._data = canvas;
      this.format = "RGBX";
      this.codedWidth = width;
      this.codedHeight = height;
      this.rotation = init.rotation ?? 0;
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? 0;
      this.colorSpace = new VideoColorSpace({
        matrix: "rgb",
        primaries: "bt709",
        transfer: "iec61966-2-1",
        fullRange: true
      });
    } else {
      throw new TypeError("Invalid data type: Must be a BufferSource or CanvasImageSource.");
    }
  }
  /** The width of the frame in pixels after rotation. */
  get displayWidth() {
    return this.rotation % 180 === 0 ? this.codedWidth : this.codedHeight;
  }
  /** The height of the frame in pixels after rotation. */
  get displayHeight() {
    return this.rotation % 180 === 0 ? this.codedHeight : this.codedWidth;
  }
  /** The presentation timestamp of the frame in microseconds. */
  get microsecondTimestamp() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
  }
  /** The duration of the frame in microseconds. */
  get microsecondDuration() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
  }
  /**
   * Whether this sample uses a pixel format that can hold transparency data. Note that this doesn't necessarily mean
   * that the sample is transparent.
   */
  get hasAlpha() {
    return this.format && this.format.includes("A");
  }
  /** Clones this video sample. */
  clone() {
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    assert(this._data !== null);
    if (isVideoFrame(this._data)) {
      return new _VideoSample(this._data.clone(), {
        timestamp: this.timestamp,
        duration: this.duration,
        rotation: this.rotation
      });
    } else if (this._data instanceof Uint8Array) {
      return new _VideoSample(this._data.slice(), {
        format: this.format,
        codedWidth: this.codedWidth,
        codedHeight: this.codedHeight,
        timestamp: this.timestamp,
        duration: this.duration,
        colorSpace: this.colorSpace,
        rotation: this.rotation
      });
    } else {
      return new _VideoSample(this._data, {
        format: this.format,
        codedWidth: this.codedWidth,
        codedHeight: this.codedHeight,
        timestamp: this.timestamp,
        duration: this.duration,
        colorSpace: this.colorSpace,
        rotation: this.rotation
      });
    }
  }
  /**
   * Closes this video sample, releasing held resources. Video samples should be closed as soon as they are not
   * needed anymore.
   */
  close() {
    if (this._closed) {
      return;
    }
    if (isVideoFrame(this._data)) {
      this._data.close();
    } else {
      this._data = null;
    }
    this._closed = true;
  }
  /** Returns the number of bytes required to hold this video sample's pixel data. */
  allocationSize() {
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    assert(this._data !== null);
    if (isVideoFrame(this._data)) {
      return this._data.allocationSize();
    } else if (this._data instanceof Uint8Array) {
      return this._data.byteLength;
    } else {
      return this.codedWidth * this.codedHeight * 4;
    }
  }
  /** Copies this video sample's pixel data to an ArrayBuffer or ArrayBufferView. */
  async copyTo(destination) {
    if (!isAllowSharedBufferSource(destination)) {
      throw new TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
    }
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    assert(this._data !== null);
    if (isVideoFrame(this._data)) {
      await this._data.copyTo(destination);
    } else if (this._data instanceof Uint8Array) {
      const dest = toUint8Array(destination);
      dest.set(this._data);
    } else {
      const canvas = this._data;
      const context = canvas.getContext("2d");
      assert(context);
      const imageData = context.getImageData(0, 0, this.codedWidth, this.codedHeight);
      const dest = toUint8Array(destination);
      dest.set(imageData.data);
    }
  }
  /**
   * Converts this video sample to a VideoFrame for use with the WebCodecs API. The VideoFrame returned by this
   * method *must* be closed separately from this video sample.
   */
  toVideoFrame() {
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    assert(this._data !== null);
    if (isVideoFrame(this._data)) {
      return new VideoFrame(this._data, {
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration || void 0
        // Drag 0 duration to undefined, glitches some codecs
      });
    } else if (this._data instanceof Uint8Array) {
      return new VideoFrame(this._data, {
        format: this.format,
        codedWidth: this.codedWidth,
        codedHeight: this.codedHeight,
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration || void 0,
        colorSpace: this.colorSpace
      });
    } else {
      return new VideoFrame(this._data, {
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration || void 0
      });
    }
  }
  draw(context, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
    let sx = 0;
    let sy = 0;
    let sWidth = this.displayWidth;
    let sHeight = this.displayHeight;
    let dx = 0;
    let dy = 0;
    let dWidth = this.displayWidth;
    let dHeight = this.displayHeight;
    if (arg5 !== void 0) {
      sx = arg1;
      sy = arg2;
      sWidth = arg3;
      sHeight = arg4;
      dx = arg5;
      dy = arg6;
      if (arg7 !== void 0) {
        dWidth = arg7;
        dHeight = arg8;
      } else {
        dWidth = sWidth;
        dHeight = sHeight;
      }
    } else {
      dx = arg1;
      dy = arg2;
      if (arg3 !== void 0) {
        dWidth = arg3;
        dHeight = arg4;
      }
    }
    if (!(typeof CanvasRenderingContext2D !== "undefined" && context instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D !== "undefined" && context instanceof OffscreenCanvasRenderingContext2D)) {
      throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
    }
    if (!Number.isFinite(sx)) {
      throw new TypeError("sx must be a number.");
    }
    if (!Number.isFinite(sy)) {
      throw new TypeError("sy must be a number.");
    }
    if (!Number.isFinite(sWidth) || sWidth < 0) {
      throw new TypeError("sWidth must be a non-negative number.");
    }
    if (!Number.isFinite(sHeight) || sHeight < 0) {
      throw new TypeError("sHeight must be a non-negative number.");
    }
    if (!Number.isFinite(dx)) {
      throw new TypeError("dx must be a number.");
    }
    if (!Number.isFinite(dy)) {
      throw new TypeError("dy must be a number.");
    }
    if (!Number.isFinite(dWidth) || dWidth < 0) {
      throw new TypeError("dWidth must be a non-negative number.");
    }
    if (!Number.isFinite(dHeight) || dHeight < 0) {
      throw new TypeError("dHeight must be a non-negative number.");
    }
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    ({ sx, sy, sWidth, sHeight } = this._rotateSourceRegion(sx, sy, sWidth, sHeight, this.rotation));
    const source = this.toCanvasImageSource();
    context.save();
    const centerX = dx + dWidth / 2;
    const centerY = dy + dHeight / 2;
    context.translate(centerX, centerY);
    context.rotate(this.rotation * Math.PI / 180);
    const aspectRatioChange = this.rotation % 180 === 0 ? 1 : dWidth / dHeight;
    context.scale(1 / aspectRatioChange, aspectRatioChange);
    context.drawImage(
      source,
      sx,
      sy,
      sWidth,
      sHeight,
      -dWidth / 2,
      -dHeight / 2,
      dWidth,
      dHeight
    );
    context.restore();
  }
  /**
   * Draws the sample in the middle of the canvas corresponding to the context with the specified fit behavior.
   */
  drawWithFit(context, options) {
    if (!(typeof CanvasRenderingContext2D !== "undefined" && context instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D !== "undefined" && context instanceof OffscreenCanvasRenderingContext2D)) {
      throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!["fill", "contain", "cover"].includes(options.fit)) {
      throw new TypeError("options.fit must be 'fill', 'contain', or 'cover'.");
    }
    if (options.rotation !== void 0 && ![0, 90, 180, 270].includes(options.rotation)) {
      throw new TypeError("options.rotation, when provided, must be 0, 90, 180, or 270.");
    }
    if (options.crop !== void 0) {
      validateCropRectangle(options.crop, "options.");
    }
    const canvasWidth = context.canvas.width;
    const canvasHeight = context.canvas.height;
    const rotation = options.rotation ?? this.rotation;
    const [rotatedWidth, rotatedHeight] = rotation % 180 === 0 ? [this.codedWidth, this.codedHeight] : [this.codedHeight, this.codedWidth];
    if (options.crop) {
      clampCropRectangle(options.crop, rotatedWidth, rotatedHeight);
    }
    let dx;
    let dy;
    let newWidth;
    let newHeight;
    const { sx, sy, sWidth, sHeight } = this._rotateSourceRegion(
      options.crop?.left ?? 0,
      options.crop?.top ?? 0,
      options.crop?.width ?? rotatedWidth,
      options.crop?.height ?? rotatedHeight,
      rotation
    );
    if (options.fit === "fill") {
      dx = 0;
      dy = 0;
      newWidth = canvasWidth;
      newHeight = canvasHeight;
    } else {
      const [sampleWidth, sampleHeight] = options.crop ? [options.crop.width, options.crop.height] : [rotatedWidth, rotatedHeight];
      const scale = options.fit === "contain" ? Math.min(canvasWidth / sampleWidth, canvasHeight / sampleHeight) : Math.max(canvasWidth / sampleWidth, canvasHeight / sampleHeight);
      newWidth = sampleWidth * scale;
      newHeight = sampleHeight * scale;
      dx = (canvasWidth - newWidth) / 2;
      dy = (canvasHeight - newHeight) / 2;
    }
    const aspectRatioChange = rotation % 180 === 0 ? 1 : newWidth / newHeight;
    context.translate(canvasWidth / 2, canvasHeight / 2);
    context.rotate(rotation * Math.PI / 180);
    context.scale(1 / aspectRatioChange, aspectRatioChange);
    context.translate(-canvasWidth / 2, -canvasHeight / 2);
    context.drawImage(this.toCanvasImageSource(), sx, sy, sWidth, sHeight, dx, dy, newWidth, newHeight);
  }
  /** @internal */
  _rotateSourceRegion(sx, sy, sWidth, sHeight, rotation) {
    if (rotation === 90) {
      [sx, sy, sWidth, sHeight] = [
        sy,
        this.codedHeight - sx - sWidth,
        sHeight,
        sWidth
      ];
    } else if (rotation === 180) {
      [sx, sy] = [
        this.codedWidth - sx - sWidth,
        this.codedHeight - sy - sHeight
      ];
    } else if (rotation === 270) {
      [sx, sy, sWidth, sHeight] = [
        this.codedWidth - sy - sHeight,
        sx,
        sHeight,
        sWidth
      ];
    }
    return { sx, sy, sWidth, sHeight };
  }
  /**
   * Converts this video sample to a
   * [`CanvasImageSource`](https://udn.realityripple.com/docs/Web/API/CanvasImageSource) for drawing to a canvas.
   *
   * You must use the value returned by this method immediately, as any VideoFrame created internally will
   * automatically be closed in the next microtask.
   */
  toCanvasImageSource() {
    if (this._closed) {
      throw new Error("VideoSample is closed.");
    }
    assert(this._data !== null);
    if (this._data instanceof Uint8Array) {
      const videoFrame = this.toVideoFrame();
      queueMicrotask(() => videoFrame.close());
      return videoFrame;
    } else {
      return this._data;
    }
  }
  /** Sets the rotation metadata of this video sample. */
  setRotation(newRotation) {
    if (![0, 90, 180, 270].includes(newRotation)) {
      throw new TypeError("newRotation must be 0, 90, 180, or 270.");
    }
    this.rotation = newRotation;
  }
  /** Sets the presentation timestamp of this video sample, in seconds. */
  setTimestamp(newTimestamp) {
    if (!Number.isFinite(newTimestamp)) {
      throw new TypeError("newTimestamp must be a number.");
    }
    this.timestamp = newTimestamp;
  }
  /** Sets the duration of this video sample, in seconds. */
  setDuration(newDuration) {
    if (!Number.isFinite(newDuration) || newDuration < 0) {
      throw new TypeError("newDuration must be a non-negative number.");
    }
    this.duration = newDuration;
  }
  /** Calls `.close()`. */
  [Symbol.dispose]() {
    this.close();
  }
};
var isVideoFrame = (x) => {
  return typeof VideoFrame !== "undefined" && x instanceof VideoFrame;
};
var clampCropRectangle = (crop, outerWidth, outerHeight) => {
  crop.left = Math.min(crop.left, outerWidth);
  crop.top = Math.min(crop.top, outerHeight);
  crop.width = Math.min(crop.width, outerWidth - crop.left);
  crop.height = Math.min(crop.height, outerHeight - crop.top);
  assert(crop.width >= 0);
  assert(crop.height >= 0);
};
var validateCropRectangle = (crop, prefix) => {
  if (!crop || typeof crop !== "object") {
    throw new TypeError(prefix + "crop, when provided, must be an object.");
  }
  if (!Number.isInteger(crop.left) || crop.left < 0) {
    throw new TypeError(prefix + "crop.left must be a non-negative integer.");
  }
  if (!Number.isInteger(crop.top) || crop.top < 0) {
    throw new TypeError(prefix + "crop.top must be a non-negative integer.");
  }
  if (!Number.isInteger(crop.width) || crop.width < 0) {
    throw new TypeError(prefix + "crop.width must be a non-negative integer.");
  }
  if (!Number.isInteger(crop.height) || crop.height < 0) {
    throw new TypeError(prefix + "crop.height must be a non-negative integer.");
  }
};
var AUDIO_SAMPLE_FORMATS = /* @__PURE__ */ new Set(
  ["f32", "f32-planar", "s16", "s16-planar", "s32", "s32-planar", "u8", "u8-planar"]
);
var AudioSample = class _AudioSample {
  /**
   * Creates a new {@link AudioSample}, either from an existing
   * [`AudioData`](https://developer.mozilla.org/en-US/docs/Web/API/AudioData) or from raw bytes specified in
   * {@link AudioSampleInit}.
   */
  constructor(init) {
    /** @internal */
    this._closed = false;
    if (isAudioData(init)) {
      if (init.format === null) {
        throw new TypeError("AudioData with null format is not supported.");
      }
      this._data = init;
      this.format = init.format;
      this.sampleRate = init.sampleRate;
      this.numberOfFrames = init.numberOfFrames;
      this.numberOfChannels = init.numberOfChannels;
      this.timestamp = init.timestamp / 1e6;
      this.duration = init.numberOfFrames / init.sampleRate;
    } else {
      if (!init || typeof init !== "object") {
        throw new TypeError("Invalid AudioDataInit: must be an object.");
      }
      if (!AUDIO_SAMPLE_FORMATS.has(init.format)) {
        throw new TypeError("Invalid AudioDataInit: invalid format.");
      }
      if (!Number.isFinite(init.sampleRate) || init.sampleRate <= 0) {
        throw new TypeError("Invalid AudioDataInit: sampleRate must be > 0.");
      }
      if (!Number.isInteger(init.numberOfChannels) || init.numberOfChannels === 0) {
        throw new TypeError("Invalid AudioDataInit: numberOfChannels must be an integer > 0.");
      }
      if (!Number.isFinite(init?.timestamp)) {
        throw new TypeError("init.timestamp must be a number.");
      }
      const numberOfFrames = init.data.byteLength / (getBytesPerSample(init.format) * init.numberOfChannels);
      if (!Number.isInteger(numberOfFrames)) {
        throw new TypeError("Invalid AudioDataInit: data size is not a multiple of frame size.");
      }
      this.format = init.format;
      this.sampleRate = init.sampleRate;
      this.numberOfFrames = numberOfFrames;
      this.numberOfChannels = init.numberOfChannels;
      this.timestamp = init.timestamp;
      this.duration = numberOfFrames / init.sampleRate;
      let dataBuffer;
      if (init.data instanceof ArrayBuffer) {
        dataBuffer = new Uint8Array(init.data);
      } else if (ArrayBuffer.isView(init.data)) {
        dataBuffer = new Uint8Array(init.data.buffer, init.data.byteOffset, init.data.byteLength);
      } else {
        throw new TypeError("Invalid AudioDataInit: data is not a BufferSource.");
      }
      const expectedSize = this.numberOfFrames * this.numberOfChannels * getBytesPerSample(this.format);
      if (dataBuffer.byteLength < expectedSize) {
        throw new TypeError("Invalid AudioDataInit: insufficient data size.");
      }
      this._data = dataBuffer;
    }
  }
  /** The presentation timestamp of the sample in microseconds. */
  get microsecondTimestamp() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
  }
  /** The duration of the sample in microseconds. */
  get microsecondDuration() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
  }
  /** Returns the number of bytes required to hold the audio sample's data as specified by the given options. */
  allocationSize(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!Number.isInteger(options.planeIndex) || options.planeIndex < 0) {
      throw new TypeError("planeIndex must be a non-negative integer.");
    }
    if (options.format !== void 0 && !AUDIO_SAMPLE_FORMATS.has(options.format)) {
      throw new TypeError("Invalid format.");
    }
    if (options.frameOffset !== void 0 && (!Number.isInteger(options.frameOffset) || options.frameOffset < 0)) {
      throw new TypeError("frameOffset must be a non-negative integer.");
    }
    if (options.frameCount !== void 0 && (!Number.isInteger(options.frameCount) || options.frameCount < 0)) {
      throw new TypeError("frameCount must be a non-negative integer.");
    }
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    const destFormat = options.format ?? this.format;
    const frameOffset = options.frameOffset ?? 0;
    if (frameOffset >= this.numberOfFrames) {
      throw new RangeError("frameOffset out of range");
    }
    const copyFrameCount = options.frameCount !== void 0 ? options.frameCount : this.numberOfFrames - frameOffset;
    if (copyFrameCount > this.numberOfFrames - frameOffset) {
      throw new RangeError("frameCount out of range");
    }
    const bytesPerSample = getBytesPerSample(destFormat);
    const isPlanar = formatIsPlanar(destFormat);
    if (isPlanar && options.planeIndex >= this.numberOfChannels) {
      throw new RangeError("planeIndex out of range");
    }
    if (!isPlanar && options.planeIndex !== 0) {
      throw new RangeError("planeIndex out of range");
    }
    const elementCount = isPlanar ? copyFrameCount : copyFrameCount * this.numberOfChannels;
    return elementCount * bytesPerSample;
  }
  /** Copies the audio sample's data to an ArrayBuffer or ArrayBufferView as specified by the given options. */
  copyTo(destination, options) {
    if (!isAllowSharedBufferSource(destination)) {
      throw new TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!Number.isInteger(options.planeIndex) || options.planeIndex < 0) {
      throw new TypeError("planeIndex must be a non-negative integer.");
    }
    if (options.format !== void 0 && !AUDIO_SAMPLE_FORMATS.has(options.format)) {
      throw new TypeError("Invalid format.");
    }
    if (options.frameOffset !== void 0 && (!Number.isInteger(options.frameOffset) || options.frameOffset < 0)) {
      throw new TypeError("frameOffset must be a non-negative integer.");
    }
    if (options.frameCount !== void 0 && (!Number.isInteger(options.frameCount) || options.frameCount < 0)) {
      throw new TypeError("frameCount must be a non-negative integer.");
    }
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    const { planeIndex, format, frameCount: optFrameCount, frameOffset: optFrameOffset } = options;
    const destFormat = format ?? this.format;
    if (!destFormat) throw new Error("Destination format not determined");
    const numFrames = this.numberOfFrames;
    const numChannels = this.numberOfChannels;
    const frameOffset = optFrameOffset ?? 0;
    if (frameOffset >= numFrames) {
      throw new RangeError("frameOffset out of range");
    }
    const copyFrameCount = optFrameCount !== void 0 ? optFrameCount : numFrames - frameOffset;
    if (copyFrameCount > numFrames - frameOffset) {
      throw new RangeError("frameCount out of range");
    }
    const destBytesPerSample = getBytesPerSample(destFormat);
    const destIsPlanar = formatIsPlanar(destFormat);
    if (destIsPlanar && planeIndex >= numChannels) {
      throw new RangeError("planeIndex out of range");
    }
    if (!destIsPlanar && planeIndex !== 0) {
      throw new RangeError("planeIndex out of range");
    }
    const destElementCount = destIsPlanar ? copyFrameCount : copyFrameCount * numChannels;
    const requiredSize = destElementCount * destBytesPerSample;
    if (destination.byteLength < requiredSize) {
      throw new RangeError("Destination buffer is too small");
    }
    const destView = toDataView(destination);
    const writeFn = getWriteFunction(destFormat);
    if (isAudioData(this._data)) {
      if (destIsPlanar) {
        if (destFormat === "f32-planar") {
          this._data.copyTo(destination, {
            planeIndex,
            frameOffset,
            frameCount: copyFrameCount,
            format: "f32-planar"
          });
        } else {
          const tempBuffer = new ArrayBuffer(copyFrameCount * 4);
          const tempArray = new Float32Array(tempBuffer);
          this._data.copyTo(tempArray, {
            planeIndex,
            frameOffset,
            frameCount: copyFrameCount,
            format: "f32-planar"
          });
          const tempView = new DataView(tempBuffer);
          for (let i = 0; i < copyFrameCount; i++) {
            const destOffset = i * destBytesPerSample;
            const sample = tempView.getFloat32(i * 4, true);
            writeFn(destView, destOffset, sample);
          }
        }
      } else {
        const numCh = numChannels;
        const temp = new Float32Array(copyFrameCount);
        for (let ch = 0; ch < numCh; ch++) {
          this._data.copyTo(temp, {
            planeIndex: ch,
            frameOffset,
            frameCount: copyFrameCount,
            format: "f32-planar"
          });
          for (let i = 0; i < copyFrameCount; i++) {
            const destIndex = i * numCh + ch;
            const destOffset = destIndex * destBytesPerSample;
            writeFn(destView, destOffset, temp[i]);
          }
        }
      }
    } else {
      const uint8Data = this._data;
      const srcView = new DataView(uint8Data.buffer, uint8Data.byteOffset, uint8Data.byteLength);
      const srcFormat = this.format;
      const readFn = getReadFunction(srcFormat);
      const srcBytesPerSample = getBytesPerSample(srcFormat);
      const srcIsPlanar = formatIsPlanar(srcFormat);
      for (let i = 0; i < copyFrameCount; i++) {
        if (destIsPlanar) {
          const destOffset = i * destBytesPerSample;
          let srcOffset;
          if (srcIsPlanar) {
            srcOffset = (planeIndex * numFrames + (i + frameOffset)) * srcBytesPerSample;
          } else {
            srcOffset = ((i + frameOffset) * numChannels + planeIndex) * srcBytesPerSample;
          }
          const normalized = readFn(srcView, srcOffset);
          writeFn(destView, destOffset, normalized);
        } else {
          for (let ch = 0; ch < numChannels; ch++) {
            const destIndex = i * numChannels + ch;
            const destOffset = destIndex * destBytesPerSample;
            let srcOffset;
            if (srcIsPlanar) {
              srcOffset = (ch * numFrames + (i + frameOffset)) * srcBytesPerSample;
            } else {
              srcOffset = ((i + frameOffset) * numChannels + ch) * srcBytesPerSample;
            }
            const normalized = readFn(srcView, srcOffset);
            writeFn(destView, destOffset, normalized);
          }
        }
      }
    }
  }
  /** Clones this audio sample. */
  clone() {
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    if (isAudioData(this._data)) {
      const sample = new _AudioSample(this._data.clone());
      sample.setTimestamp(this.timestamp);
      return sample;
    } else {
      return new _AudioSample({
        format: this.format,
        sampleRate: this.sampleRate,
        numberOfFrames: this.numberOfFrames,
        numberOfChannels: this.numberOfChannels,
        timestamp: this.timestamp,
        data: this._data
      });
    }
  }
  /**
   * Closes this audio sample, releasing held resources. Audio samples should be closed as soon as they are not
   * needed anymore.
   */
  close() {
    if (this._closed) {
      return;
    }
    if (isAudioData(this._data)) {
      this._data.close();
    } else {
      this._data = new Uint8Array(0);
    }
    this._closed = true;
  }
  /**
   * Converts this audio sample to an AudioData for use with the WebCodecs API. The AudioData returned by this
   * method *must* be closed separately from this audio sample.
   */
  toAudioData() {
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    if (isAudioData(this._data)) {
      if (this._data.timestamp === this.microsecondTimestamp) {
        return this._data.clone();
      } else {
        if (formatIsPlanar(this.format)) {
          const size = this.allocationSize({ planeIndex: 0, format: this.format });
          const data = new ArrayBuffer(size * this.numberOfChannels);
          for (let i = 0; i < this.numberOfChannels; i++) {
            this.copyTo(new Uint8Array(data, i * size, size), { planeIndex: i, format: this.format });
          }
          return new AudioData({
            format: this.format,
            sampleRate: this.sampleRate,
            numberOfFrames: this.numberOfFrames,
            numberOfChannels: this.numberOfChannels,
            timestamp: this.microsecondTimestamp,
            data
          });
        } else {
          const data = new ArrayBuffer(this.allocationSize({ planeIndex: 0, format: this.format }));
          this.copyTo(data, { planeIndex: 0, format: this.format });
          return new AudioData({
            format: this.format,
            sampleRate: this.sampleRate,
            numberOfFrames: this.numberOfFrames,
            numberOfChannels: this.numberOfChannels,
            timestamp: this.microsecondTimestamp,
            data
          });
        }
      }
    } else {
      return new AudioData({
        format: this.format,
        sampleRate: this.sampleRate,
        numberOfFrames: this.numberOfFrames,
        numberOfChannels: this.numberOfChannels,
        timestamp: this.microsecondTimestamp,
        data: this._data
      });
    }
  }
  /** Convert this audio sample to an AudioBuffer for use with the Web Audio API. */
  toAudioBuffer() {
    if (this._closed) {
      throw new Error("AudioSample is closed.");
    }
    const audioBuffer = new AudioBuffer({
      numberOfChannels: this.numberOfChannels,
      length: this.numberOfFrames,
      sampleRate: this.sampleRate
    });
    const dataBytes = new Float32Array(this.allocationSize({ planeIndex: 0, format: "f32-planar" }) / 4);
    for (let i = 0; i < this.numberOfChannels; i++) {
      this.copyTo(dataBytes, { planeIndex: i, format: "f32-planar" });
      audioBuffer.copyToChannel(dataBytes, i);
    }
    return audioBuffer;
  }
  /** Sets the presentation timestamp of this audio sample, in seconds. */
  setTimestamp(newTimestamp) {
    if (!Number.isFinite(newTimestamp)) {
      throw new TypeError("newTimestamp must be a number.");
    }
    this.timestamp = newTimestamp;
  }
  /** Calls `.close()`. */
  [Symbol.dispose]() {
    this.close();
  }
  /** @internal */
  static *_fromAudioBuffer(audioBuffer, timestamp) {
    if (!(audioBuffer instanceof AudioBuffer)) {
      throw new TypeError("audioBuffer must be an AudioBuffer.");
    }
    const MAX_FLOAT_COUNT = 48e3 * 5;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const totalFrames = audioBuffer.length;
    const maxFramesPerChunk = Math.floor(MAX_FLOAT_COUNT / numberOfChannels);
    let currentRelativeFrame = 0;
    let remainingFrames = totalFrames;
    while (remainingFrames > 0) {
      const framesToCopy = Math.min(maxFramesPerChunk, remainingFrames);
      const chunkData = new Float32Array(numberOfChannels * framesToCopy);
      for (let channel = 0; channel < numberOfChannels; channel++) {
        audioBuffer.copyFromChannel(
          chunkData.subarray(channel * framesToCopy, (channel + 1) * framesToCopy),
          channel,
          currentRelativeFrame
        );
      }
      yield new _AudioSample({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: framesToCopy,
        numberOfChannels,
        timestamp: timestamp + currentRelativeFrame / sampleRate,
        data: chunkData
      });
      currentRelativeFrame += framesToCopy;
      remainingFrames -= framesToCopy;
    }
  }
  /**
   * Creates AudioSamples from an AudioBuffer, starting at the given timestamp in seconds. Typically creates exactly
   * one sample, but may create multiple if the AudioBuffer is exceedingly large.
   */
  static fromAudioBuffer(audioBuffer, timestamp) {
    if (!(audioBuffer instanceof AudioBuffer)) {
      throw new TypeError("audioBuffer must be an AudioBuffer.");
    }
    const MAX_FLOAT_COUNT = 48e3 * 5;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const totalFrames = audioBuffer.length;
    const maxFramesPerChunk = Math.floor(MAX_FLOAT_COUNT / numberOfChannels);
    let currentRelativeFrame = 0;
    let remainingFrames = totalFrames;
    const result = [];
    while (remainingFrames > 0) {
      const framesToCopy = Math.min(maxFramesPerChunk, remainingFrames);
      const chunkData = new Float32Array(numberOfChannels * framesToCopy);
      for (let channel = 0; channel < numberOfChannels; channel++) {
        audioBuffer.copyFromChannel(
          chunkData.subarray(channel * framesToCopy, (channel + 1) * framesToCopy),
          channel,
          currentRelativeFrame
        );
      }
      const audioSample = new _AudioSample({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: framesToCopy,
        numberOfChannels,
        timestamp: timestamp + currentRelativeFrame / sampleRate,
        data: chunkData
      });
      result.push(audioSample);
      currentRelativeFrame += framesToCopy;
      remainingFrames -= framesToCopy;
    }
    return result;
  }
};
var getBytesPerSample = (format) => {
  switch (format) {
    case "u8":
    case "u8-planar":
      return 1;
    case "s16":
    case "s16-planar":
      return 2;
    case "s32":
    case "s32-planar":
      return 4;
    case "f32":
    case "f32-planar":
      return 4;
    default:
      throw new Error("Unknown AudioSampleFormat");
  }
};
var formatIsPlanar = (format) => {
  switch (format) {
    case "u8-planar":
    case "s16-planar":
    case "s32-planar":
    case "f32-planar":
      return true;
    default:
      return false;
  }
};
var getReadFunction = (format) => {
  switch (format) {
    case "u8":
    case "u8-planar":
      return (view2, offset) => (view2.getUint8(offset) - 128) / 128;
    case "s16":
    case "s16-planar":
      return (view2, offset) => view2.getInt16(offset, true) / 32768;
    case "s32":
    case "s32-planar":
      return (view2, offset) => view2.getInt32(offset, true) / 2147483648;
    case "f32":
    case "f32-planar":
      return (view2, offset) => view2.getFloat32(offset, true);
  }
};
var getWriteFunction = (format) => {
  switch (format) {
    case "u8":
    case "u8-planar":
      return (view2, offset, value) => view2.setUint8(offset, clamp((value + 1) * 127.5, 0, 255));
    case "s16":
    case "s16-planar":
      return (view2, offset, value) => view2.setInt16(offset, clamp(Math.round(value * 32767), -32768, 32767), true);
    case "s32":
    case "s32-planar":
      return (view2, offset, value) => view2.setInt32(offset, clamp(Math.round(value * 2147483647), -2147483648, 2147483647), true);
    case "f32":
    case "f32-planar":
      return (view2, offset, value) => view2.setFloat32(offset, value, true);
  }
};
var isAudioData = (x) => {
  return typeof AudioData !== "undefined" && x instanceof AudioData;
};

// src/media-sink.ts
var validatePacketRetrievalOptions = (options) => {
  if (!options || typeof options !== "object") {
    throw new TypeError("options must be an object.");
  }
  if (options.metadataOnly !== void 0 && typeof options.metadataOnly !== "boolean") {
    throw new TypeError("options.metadataOnly, when defined, must be a boolean.");
  }
  if (options.verifyKeyPackets !== void 0 && typeof options.verifyKeyPackets !== "boolean") {
    throw new TypeError("options.verifyKeyPackets, when defined, must be a boolean.");
  }
  if (options.verifyKeyPackets && options.metadataOnly) {
    throw new TypeError("options.verifyKeyPackets and options.metadataOnly cannot be enabled together.");
  }
};
var validateTimestamp = (timestamp) => {
  if (!isNumber(timestamp)) {
    throw new TypeError("timestamp must be a number.");
  }
};
var maybeFixPacketType = (track, promise, options) => {
  if (options.verifyKeyPackets) {
    return promise.then(async (packet) => {
      if (!packet || packet.type === "delta") {
        return packet;
      }
      const determinedType = await track.determinePacketType(packet);
      if (determinedType) {
        packet.type = determinedType;
      }
      return packet;
    });
  } else {
    return promise;
  }
};
var EncodedPacketSink = class {
  /** Creates a new {@link EncodedPacketSink} for the given {@link InputTrack}. */
  constructor(track) {
    if (!(track instanceof InputTrack)) {
      throw new TypeError("track must be an InputTrack.");
    }
    this._track = track;
  }
  /**
   * Retrieves the track's first packet (in decode order), or null if it has no packets. The first packet is very
   * likely to be a key packet.
   */
  getFirstPacket(options = {}) {
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    return maybeFixPacketType(this._track, this._track._backing.getFirstPacket(options), options);
  }
  /**
   * Retrieves the packet corresponding to the given timestamp, in seconds. More specifically, returns the last packet
   * (in presentation order) with a start timestamp less than or equal to the given timestamp. This method can be
   * used to retrieve a track's last packet using `getPacket(Infinity)`. The method returns null if the timestamp
   * is before the first packet in the track.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  getPacket(timestamp, options = {}) {
    validateTimestamp(timestamp);
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    return maybeFixPacketType(this._track, this._track._backing.getPacket(timestamp, options), options);
  }
  /**
   * Retrieves the packet following the given packet (in decode order), or null if the given packet is the
   * last packet.
   */
  getNextPacket(packet, options = {}) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    return maybeFixPacketType(this._track, this._track._backing.getNextPacket(packet, options), options);
  }
  /**
   * Retrieves the key packet corresponding to the given timestamp, in seconds. More specifically, returns the last
   * key packet (in presentation order) with a start timestamp less than or equal to the given timestamp. A key packet
   * is a packet that doesn't require previous packets to be decoded. This method can be used to retrieve a track's
   * last key packet using `getKeyPacket(Infinity)`. The method returns null if the timestamp is before the first
   * key packet in the track.
   *
   * To ensure that the returned packet is guaranteed to be a real key frame, enable `options.verifyKeyPackets`.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  async getKeyPacket(timestamp, options = {}) {
    validateTimestamp(timestamp);
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    if (!options.verifyKeyPackets) {
      return this._track._backing.getKeyPacket(timestamp, options);
    }
    const packet = await this._track._backing.getKeyPacket(timestamp, options);
    if (!packet || packet.type === "delta") {
      return packet;
    }
    const determinedType = await this._track.determinePacketType(packet);
    if (determinedType === "delta") {
      return this.getKeyPacket(packet.timestamp - 1 / this._track.timeResolution, options);
    }
    return packet;
  }
  /**
   * Retrieves the key packet following the given packet (in decode order), or null if the given packet is the last
   * key packet.
   *
   * To ensure that the returned packet is guaranteed to be a real key frame, enable `options.verifyKeyPackets`.
   */
  async getNextKeyPacket(packet, options = {}) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    if (!options.verifyKeyPackets) {
      return this._track._backing.getNextKeyPacket(packet, options);
    }
    const nextPacket = await this._track._backing.getNextKeyPacket(packet, options);
    if (!nextPacket || nextPacket.type === "delta") {
      return nextPacket;
    }
    const determinedType = await this._track.determinePacketType(nextPacket);
    if (determinedType === "delta") {
      return this.getNextKeyPacket(nextPacket, options);
    }
    return nextPacket;
  }
  /**
   * Creates an async iterator that yields the packets in this track in decode order. To enable fast iteration, this
   * method will intelligently preload packets based on the speed of the consumer.
   *
   * @param startPacket - (optional) The packet from which iteration should begin. This packet will also be yielded.
   * @param endTimestamp - (optional) The timestamp at which iteration should end. This packet will _not_ be yielded.
   */
  packets(startPacket, endPacket, options = {}) {
    if (startPacket !== void 0 && !(startPacket instanceof EncodedPacket)) {
      throw new TypeError("startPacket must be an EncodedPacket.");
    }
    if (startPacket !== void 0 && startPacket.isMetadataOnly && !options?.metadataOnly) {
      throw new TypeError("startPacket can only be metadata-only if options.metadataOnly is enabled.");
    }
    if (endPacket !== void 0 && !(endPacket instanceof EncodedPacket)) {
      throw new TypeError("endPacket must be an EncodedPacket.");
    }
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    const packetQueue = [];
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let ended = false;
    let terminated = false;
    let outOfBandError = null;
    const timestamps = [];
    const maxQueueSize = () => Math.max(2, timestamps.length);
    (async () => {
      let packet = startPacket ?? await this.getFirstPacket(options);
      while (packet && !terminated && !this._track.input._disposed) {
        if (endPacket && packet.sequenceNumber >= endPacket?.sequenceNumber) {
          break;
        }
        if (packetQueue.length > maxQueueSize()) {
          ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
          await queueDequeue;
          continue;
        }
        packetQueue.push(packet);
        onQueueNotEmpty();
        ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
        packet = await this.getNextPacket(packet, options);
      }
      ended = true;
      onQueueNotEmpty();
    })().catch((error) => {
      if (!outOfBandError) {
        outOfBandError = error;
        onQueueNotEmpty();
      }
    });
    const track = this._track;
    return {
      async next() {
        while (true) {
          if (track.input._disposed) {
            throw new InputDisposedError();
          } else if (terminated) {
            return { value: void 0, done: true };
          } else if (outOfBandError) {
            throw outOfBandError;
          } else if (packetQueue.length > 0) {
            const value = packetQueue.shift();
            const now = performance.now();
            timestamps.push(now);
            while (timestamps.length > 0 && now - timestamps[0] >= 1e3) {
              timestamps.shift();
            }
            onQueueDequeue();
            return { value, done: false };
          } else if (ended) {
            return { value: void 0, done: true };
          } else {
            await queueNotEmpty;
          }
        }
      },
      async return() {
        terminated = true;
        onQueueDequeue();
        onQueueNotEmpty();
        return { value: void 0, done: true };
      },
      async throw(error) {
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
};
var DecoderWrapper = class {
  constructor(onSample, onError) {
    this.onSample = onSample;
    this.onError = onError;
  }
};
var BaseMediaSampleSink = class {
  /** @internal */
  mediaSamplesInRange(startTimestamp = 0, endTimestamp = Infinity) {
    validateTimestamp(startTimestamp);
    validateTimestamp(endTimestamp);
    const sampleQueue = [];
    let firstSampleQueued = false;
    let lastSample = null;
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let decoderIsFlushed = false;
    let ended = false;
    let terminated = false;
    let outOfBandError = null;
    (async () => {
      const decoderError = new Error();
      const decoder = await this._createDecoder((sample) => {
        onQueueDequeue();
        if (sample.timestamp >= endTimestamp) {
          ended = true;
        }
        if (ended) {
          sample.close();
          return;
        }
        if (lastSample) {
          if (sample.timestamp > startTimestamp) {
            sampleQueue.push(lastSample);
            firstSampleQueued = true;
          } else {
            lastSample.close();
          }
        }
        if (sample.timestamp >= startTimestamp) {
          sampleQueue.push(sample);
          firstSampleQueued = true;
        }
        lastSample = firstSampleQueued ? null : sample;
        if (sampleQueue.length > 0) {
          onQueueNotEmpty();
          ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
        }
      }, (error) => {
        if (!outOfBandError) {
          error.stack = decoderError.stack;
          outOfBandError = error;
          onQueueNotEmpty();
        }
      });
      const packetSink = this._createPacketSink();
      const keyPacket = await packetSink.getKeyPacket(startTimestamp, { verifyKeyPackets: true }) ?? await packetSink.getFirstPacket();
      if (!keyPacket) {
        return;
      }
      let currentPacket = keyPacket;
      let endPacket = void 0;
      if (endTimestamp < Infinity) {
        const packet = await packetSink.getPacket(endTimestamp);
        const keyPacket2 = !packet ? null : packet.type === "key" && packet.timestamp === endTimestamp ? packet : await packetSink.getNextKeyPacket(packet, { verifyKeyPackets: true });
        if (keyPacket2) {
          endPacket = keyPacket2;
        }
      }
      const packets = packetSink.packets(keyPacket, endPacket);
      await packets.next();
      while (currentPacket && !ended && !this._track.input._disposed) {
        const maxQueueSize = computeMaxQueueSize(sampleQueue.length);
        if (sampleQueue.length + decoder.getDecodeQueueSize() > maxQueueSize) {
          ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
          await queueDequeue;
          continue;
        }
        decoder.decode(currentPacket);
        const packetResult = await packets.next();
        if (packetResult.done) {
          break;
        }
        currentPacket = packetResult.value;
      }
      await packets.return();
      if (!terminated && !this._track.input._disposed) {
        await decoder.flush();
      }
      decoder.close();
      if (!firstSampleQueued && lastSample) {
        sampleQueue.push(lastSample);
      }
      decoderIsFlushed = true;
      onQueueNotEmpty();
    })().catch((error) => {
      if (!outOfBandError) {
        outOfBandError = error;
        onQueueNotEmpty();
      }
    });
    const track = this._track;
    const closeSamples = () => {
      lastSample?.close();
      for (const sample of sampleQueue) {
        sample.close();
      }
    };
    return {
      async next() {
        while (true) {
          if (track.input._disposed) {
            closeSamples();
            throw new InputDisposedError();
          } else if (terminated) {
            return { value: void 0, done: true };
          } else if (outOfBandError) {
            closeSamples();
            throw outOfBandError;
          } else if (sampleQueue.length > 0) {
            const value = sampleQueue.shift();
            onQueueDequeue();
            return { value, done: false };
          } else if (!decoderIsFlushed) {
            await queueNotEmpty;
          } else {
            return { value: void 0, done: true };
          }
        }
      },
      async return() {
        terminated = true;
        ended = true;
        onQueueDequeue();
        onQueueNotEmpty();
        closeSamples();
        return { value: void 0, done: true };
      },
      async throw(error) {
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
  /** @internal */
  mediaSamplesAtTimestamps(timestamps) {
    validateAnyIterable(timestamps);
    const timestampIterator = toAsyncIterator(timestamps);
    const timestampsOfInterest = [];
    const sampleQueue = [];
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let decoderIsFlushed = false;
    let terminated = false;
    let outOfBandError = null;
    const pushToQueue = (sample) => {
      sampleQueue.push(sample);
      onQueueNotEmpty();
      ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
    };
    (async () => {
      const decoderError = new Error();
      const decoder = await this._createDecoder((sample) => {
        onQueueDequeue();
        if (terminated) {
          sample.close();
          return;
        }
        let sampleUses = 0;
        while (timestampsOfInterest.length > 0 && sample.timestamp - timestampsOfInterest[0] > -1e-10) {
          sampleUses++;
          timestampsOfInterest.shift();
        }
        if (sampleUses > 0) {
          for (let i = 0; i < sampleUses; i++) {
            pushToQueue(i < sampleUses - 1 ? sample.clone() : sample);
          }
        } else {
          sample.close();
        }
      }, (error) => {
        if (!outOfBandError) {
          error.stack = decoderError.stack;
          outOfBandError = error;
          onQueueNotEmpty();
        }
      });
      const packetSink = this._createPacketSink();
      let lastPacket = null;
      let lastKeyPacket = null;
      let maxSequenceNumber = -1;
      const decodePackets = async () => {
        assert(lastKeyPacket);
        let currentPacket = lastKeyPacket;
        decoder.decode(currentPacket);
        while (currentPacket.sequenceNumber < maxSequenceNumber) {
          const maxQueueSize = computeMaxQueueSize(sampleQueue.length);
          while (sampleQueue.length + decoder.getDecodeQueueSize() > maxQueueSize && !terminated) {
            ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
            await queueDequeue;
          }
          if (terminated) {
            break;
          }
          const nextPacket = await packetSink.getNextPacket(currentPacket);
          assert(nextPacket);
          decoder.decode(nextPacket);
          currentPacket = nextPacket;
        }
        maxSequenceNumber = -1;
      };
      const flushDecoder = async () => {
        await decoder.flush();
        for (let i = 0; i < timestampsOfInterest.length; i++) {
          pushToQueue(null);
        }
        timestampsOfInterest.length = 0;
      };
      for await (const timestamp of timestampIterator) {
        validateTimestamp(timestamp);
        if (terminated || this._track.input._disposed) {
          break;
        }
        const targetPacket = await packetSink.getPacket(timestamp);
        const keyPacket = targetPacket && await packetSink.getKeyPacket(timestamp, { verifyKeyPackets: true });
        if (!keyPacket) {
          if (maxSequenceNumber !== -1) {
            await decodePackets();
            await flushDecoder();
          }
          pushToQueue(null);
          lastPacket = null;
          continue;
        }
        if (lastPacket && (keyPacket.sequenceNumber !== lastKeyPacket.sequenceNumber || targetPacket.timestamp < lastPacket.timestamp)) {
          await decodePackets();
          await flushDecoder();
        }
        timestampsOfInterest.push(targetPacket.timestamp);
        maxSequenceNumber = Math.max(targetPacket.sequenceNumber, maxSequenceNumber);
        lastPacket = targetPacket;
        lastKeyPacket = keyPacket;
      }
      if (!terminated && !this._track.input._disposed) {
        if (maxSequenceNumber !== -1) {
          await decodePackets();
        }
        await flushDecoder();
      }
      decoder.close();
      decoderIsFlushed = true;
      onQueueNotEmpty();
    })().catch((error) => {
      if (!outOfBandError) {
        outOfBandError = error;
        onQueueNotEmpty();
      }
    });
    const track = this._track;
    const closeSamples = () => {
      for (const sample of sampleQueue) {
        sample?.close();
      }
    };
    return {
      async next() {
        while (true) {
          if (track.input._disposed) {
            closeSamples();
            throw new InputDisposedError();
          } else if (terminated) {
            return { value: void 0, done: true };
          } else if (outOfBandError) {
            closeSamples();
            throw outOfBandError;
          } else if (sampleQueue.length > 0) {
            const value = sampleQueue.shift();
            assert(value !== void 0);
            onQueueDequeue();
            return { value, done: false };
          } else if (!decoderIsFlushed) {
            await queueNotEmpty;
          } else {
            return { value: void 0, done: true };
          }
        }
      },
      async return() {
        terminated = true;
        onQueueDequeue();
        onQueueNotEmpty();
        closeSamples();
        return { value: void 0, done: true };
      },
      async throw(error) {
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
};
var computeMaxQueueSize = (decodedSampleQueueSize) => {
  return decodedSampleQueueSize === 0 ? 40 : 8;
};
var VideoDecoderWrapper = class extends DecoderWrapper {
  // For HEVC stuff
  constructor(onSample, onError, codec, decoderConfig, rotation, timeResolution) {
    super(onSample, onError);
    this.codec = codec;
    this.decoderConfig = decoderConfig;
    this.rotation = rotation;
    this.timeResolution = timeResolution;
    this.decoder = null;
    this.customDecoder = null;
    this.customDecoderCallSerializer = new CallSerializer();
    this.customDecoderQueueSize = 0;
    this.inputTimestamps = [];
    // Timestamps input into the decoder, sorted.
    this.sampleQueue = [];
    // Safari-specific thing, check usage.
    this.currentPacketIndex = 0;
    this.raslSkipped = false;
    // For HEVC stuff
    // Alpha stuff
    this.alphaDecoder = null;
    this.alphaHadKeyframe = false;
    this.colorQueue = [];
    this.alphaQueue = [];
    this.merger = null;
    this.mergerCreationFailed = false;
    this.decodedAlphaChunkCount = 0;
    this.alphaDecoderQueueSize = 0;
    /** Each value is the number of decoded alpha chunks at which a null alpha frame should be added. */
    this.nullAlphaFrameQueue = [];
    this.currentAlphaPacketIndex = 0;
    this.alphaRaslSkipped = false;
    const MatchingCustomDecoder = customVideoDecoders.find((x) => x.supports(codec, decoderConfig));
    if (MatchingCustomDecoder) {
      this.customDecoder = new MatchingCustomDecoder();
      this.customDecoder.codec = codec;
      this.customDecoder.config = decoderConfig;
      this.customDecoder.onSample = (sample) => {
        if (!(sample instanceof VideoSample)) {
          throw new TypeError("The argument passed to onSample must be a VideoSample.");
        }
        this.finalizeAndEmitSample(sample);
      };
      void this.customDecoderCallSerializer.call(() => this.customDecoder.init());
    } else {
      const colorHandler = (frame) => {
        if (this.alphaQueue.length > 0) {
          const alphaFrame = this.alphaQueue.shift();
          assert(alphaFrame !== void 0);
          this.mergeAlpha(frame, alphaFrame);
        } else {
          this.colorQueue.push(frame);
        }
      };
      this.decoder = new VideoDecoder({
        output: (frame) => {
          try {
            colorHandler(frame);
          } catch (error) {
            this.onError(error);
          }
        },
        error: onError
      });
      this.decoder.configure(decoderConfig);
    }
  }
  getDecodeQueueSize() {
    if (this.customDecoder) {
      return this.customDecoderQueueSize;
    } else {
      assert(this.decoder);
      return Math.max(
        this.decoder.decodeQueueSize,
        this.alphaDecoder?.decodeQueueSize ?? 0
      );
    }
  }
  decode(packet) {
    if (this.codec === "hevc" && this.currentPacketIndex > 0 && !this.raslSkipped) {
      if (this.hasHevcRaslPicture(packet.data)) {
        return;
      }
      this.raslSkipped = true;
    }
    this.currentPacketIndex++;
    if (this.customDecoder) {
      this.customDecoderQueueSize++;
      void this.customDecoderCallSerializer.call(() => this.customDecoder.decode(packet)).then(() => this.customDecoderQueueSize--);
    } else {
      assert(this.decoder);
      if (!isSafari()) {
        insertSorted(this.inputTimestamps, packet.timestamp, (x) => x);
      }
      this.decoder.decode(packet.toEncodedVideoChunk());
      this.decodeAlphaData(packet);
    }
  }
  decodeAlphaData(packet) {
    if (!packet.sideData.alpha || this.mergerCreationFailed) {
      this.pushNullAlphaFrame();
      return;
    }
    if (!this.merger) {
      try {
        this.merger = new ColorAlphaMerger();
      } catch (error) {
        console.error("Due to an error, only color data will be decoded.", error);
        this.mergerCreationFailed = true;
        this.decodeAlphaData(packet);
        return;
      }
    }
    if (!this.alphaDecoder) {
      const alphaHandler = (frame) => {
        this.alphaDecoderQueueSize--;
        if (this.colorQueue.length > 0) {
          const colorFrame = this.colorQueue.shift();
          assert(colorFrame !== void 0);
          this.mergeAlpha(colorFrame, frame);
        } else {
          this.alphaQueue.push(frame);
        }
        this.decodedAlphaChunkCount++;
        while (this.nullAlphaFrameQueue.length > 0 && this.nullAlphaFrameQueue[0] === this.decodedAlphaChunkCount) {
          this.nullAlphaFrameQueue.shift();
          if (this.colorQueue.length > 0) {
            const colorFrame = this.colorQueue.shift();
            assert(colorFrame !== void 0);
            this.mergeAlpha(colorFrame, null);
          } else {
            this.alphaQueue.push(null);
          }
        }
      };
      this.alphaDecoder = new VideoDecoder({
        output: (frame) => {
          try {
            alphaHandler(frame);
          } catch (error) {
            this.onError(error);
          }
        },
        error: this.onError
      });
      this.alphaDecoder.configure(this.decoderConfig);
    }
    const type = determineVideoPacketType(this.codec, this.decoderConfig, packet.sideData.alpha);
    if (!this.alphaHadKeyframe) {
      this.alphaHadKeyframe = type === "key";
    }
    if (this.alphaHadKeyframe) {
      if (this.codec === "hevc" && this.currentAlphaPacketIndex > 0 && !this.alphaRaslSkipped) {
        if (this.hasHevcRaslPicture(packet.sideData.alpha)) {
          this.pushNullAlphaFrame();
          return;
        }
        this.alphaRaslSkipped = true;
      }
      this.currentAlphaPacketIndex++;
      this.alphaDecoder.decode(packet.alphaToEncodedVideoChunk(type ?? packet.type));
      this.alphaDecoderQueueSize++;
    } else {
      this.pushNullAlphaFrame();
    }
  }
  pushNullAlphaFrame() {
    if (this.alphaDecoderQueueSize === 0) {
      this.alphaQueue.push(null);
    } else {
      this.nullAlphaFrameQueue.push(this.decodedAlphaChunkCount + this.alphaDecoderQueueSize);
    }
  }
  /**
   * If we're using HEVC, we need to make sure to skip any RASL slices that follow a non-IDR key frame such as
   * CRA_NUT. This is because RASL slices cannot be decoded without data before the CRA_NUT. Browsers behave
   * differently here: Chromium drops the packets, Safari throws a decoder error. Either way, it's not good
   * and causes bugs upstream. So, let's take the dropping into our own hands.
   */
  hasHevcRaslPicture(packetData) {
    const nalUnits = extractHevcNalUnits(packetData, this.decoderConfig);
    return nalUnits.some((x) => {
      const type = extractNalUnitTypeForHevc(x);
      return type === 8 /* RASL_N */ || type === 9 /* RASL_R */;
    });
  }
  /** Handler for the WebCodecs VideoDecoder for ironing out browser differences. */
  sampleHandler(sample) {
    if (isSafari()) {
      if (this.sampleQueue.length > 0 && sample.timestamp >= last(this.sampleQueue).timestamp) {
        for (const sample2 of this.sampleQueue) {
          this.finalizeAndEmitSample(sample2);
        }
        this.sampleQueue.length = 0;
      }
      insertSorted(this.sampleQueue, sample, (x) => x.timestamp);
    } else {
      const timestamp = this.inputTimestamps.shift();
      assert(timestamp !== void 0);
      sample.setTimestamp(timestamp);
      this.finalizeAndEmitSample(sample);
    }
  }
  finalizeAndEmitSample(sample) {
    sample.setTimestamp(Math.round(sample.timestamp * this.timeResolution) / this.timeResolution);
    sample.setDuration(Math.round(sample.duration * this.timeResolution) / this.timeResolution);
    sample.setRotation(this.rotation);
    this.onSample(sample);
  }
  mergeAlpha(color, alpha) {
    if (!alpha) {
      const finalSample2 = new VideoSample(color);
      this.sampleHandler(finalSample2);
      return;
    }
    assert(this.merger);
    this.merger.update(color, alpha);
    color.close();
    alpha.close();
    const finalFrame = new VideoFrame(this.merger.canvas, {
      timestamp: color.timestamp,
      duration: color.duration ?? void 0
    });
    const finalSample = new VideoSample(finalFrame);
    this.sampleHandler(finalSample);
  }
  async flush() {
    if (this.customDecoder) {
      await this.customDecoderCallSerializer.call(() => this.customDecoder.flush());
    } else {
      assert(this.decoder);
      await Promise.all([
        this.decoder.flush(),
        this.alphaDecoder?.flush()
      ]);
      this.colorQueue.forEach((x) => x.close());
      this.colorQueue.length = 0;
      this.alphaQueue.forEach((x) => x?.close());
      this.alphaQueue.length = 0;
      this.alphaHadKeyframe = false;
      this.decodedAlphaChunkCount = 0;
      this.alphaDecoderQueueSize = 0;
      this.nullAlphaFrameQueue.length = 0;
      this.currentAlphaPacketIndex = 0;
      this.alphaRaslSkipped = false;
    }
    if (isSafari()) {
      for (const sample of this.sampleQueue) {
        this.finalizeAndEmitSample(sample);
      }
      this.sampleQueue.length = 0;
    }
    this.currentPacketIndex = 0;
    this.raslSkipped = false;
  }
  close() {
    if (this.customDecoder) {
      void this.customDecoderCallSerializer.call(() => this.customDecoder.close());
    } else {
      assert(this.decoder);
      this.decoder.close();
      this.alphaDecoder?.close();
      this.colorQueue.forEach((x) => x.close());
      this.colorQueue.length = 0;
      this.alphaQueue.forEach((x) => x?.close());
      this.alphaQueue.length = 0;
      this.merger?.close();
    }
    for (const sample of this.sampleQueue) {
      sample.close();
    }
    this.sampleQueue.length = 0;
  }
};
var ColorAlphaMerger = class {
  constructor() {
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(300, 150);
    } else {
      this.canvas = document.createElement("canvas");
    }
    const gl = this.canvas.getContext("webgl2", {
      premultipliedAlpha: false
    });
    if (!gl) {
      throw new Error("Couldn't acquire WebGL 2 context.");
    }
    this.gl = gl;
    this.program = this.createProgram();
    this.vao = this.createVAO();
    this.colorTexture = this.createTexture();
    this.alphaTexture = this.createTexture();
    this.gl.useProgram(this.program);
    this.gl.uniform1i(this.gl.getUniformLocation(this.program, "u_colorTexture"), 0);
    this.gl.uniform1i(this.gl.getUniformLocation(this.program, "u_alphaTexture"), 1);
  }
  createProgram() {
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, `#version 300 es
			in vec2 a_position;
			in vec2 a_texCoord;
			out vec2 v_texCoord;
			
			void main() {
				gl_Position = vec4(a_position, 0.0, 1.0);
				v_texCoord = a_texCoord;
			}
		`);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, `#version 300 es
			precision highp float;
			
			uniform sampler2D u_colorTexture;
			uniform sampler2D u_alphaTexture;
			in vec2 v_texCoord;
			out vec4 fragColor;
			
			void main() {
				vec3 color = texture(u_colorTexture, v_texCoord).rgb;
				float alpha = texture(u_alphaTexture, v_texCoord).r;
				fragColor = vec4(color, alpha);
			}
		`);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    return program;
  }
  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    return shader;
  }
  createVAO() {
    const vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(vao);
    const vertices = new Float32Array([
      -1,
      -1,
      0,
      1,
      1,
      -1,
      1,
      1,
      -1,
      1,
      0,
      0,
      1,
      1,
      1,
      0
    ]);
    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    const positionLocation = this.gl.getAttribLocation(this.program, "a_position");
    const texCoordLocation = this.gl.getAttribLocation(this.program, "a_texCoord");
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(texCoordLocation);
    this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 16, 8);
    return vao;
  }
  createTexture() {
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    return texture;
  }
  update(color, alpha) {
    if (color.displayWidth !== this.canvas.width || color.displayHeight !== this.canvas.height) {
      this.canvas.width = color.displayWidth;
      this.canvas.height = color.displayHeight;
    }
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.colorTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, color);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.alphaTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, alpha);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }
  close() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
  }
};
var VideoSampleSink = class extends BaseMediaSampleSink {
  /** Creates a new {@link VideoSampleSink} for the given {@link InputVideoTrack}. */
  constructor(videoTrack) {
    if (!(videoTrack instanceof InputVideoTrack)) {
      throw new TypeError("videoTrack must be an InputVideoTrack.");
    }
    super();
    this._track = videoTrack;
  }
  /** @internal */
  async _createDecoder(onSample, onError) {
    if (!await this._track.canDecode()) {
      throw new Error(
        "This video track cannot be decoded by this browser. Make sure to check decodability before using a track."
      );
    }
    const codec = this._track.codec;
    const rotation = this._track.rotation;
    const decoderConfig = await this._track.getDecoderConfig();
    const timeResolution = this._track.timeResolution;
    assert(codec && decoderConfig);
    return new VideoDecoderWrapper(onSample, onError, codec, decoderConfig, rotation, timeResolution);
  }
  /** @internal */
  _createPacketSink() {
    return new EncodedPacketSink(this._track);
  }
  /**
   * Retrieves the video sample (frame) corresponding to the given timestamp, in seconds. More specifically, returns
   * the last video sample (in presentation order) with a start timestamp less than or equal to the given timestamp.
   * Returns null if the timestamp is before the track's first timestamp.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  async getSample(timestamp) {
    validateTimestamp(timestamp);
    for await (const sample of this.mediaSamplesAtTimestamps([timestamp])) {
      return sample;
    }
    throw new Error("Internal error: Iterator returned nothing.");
  }
  /**
   * Creates an async iterator that yields the video samples (frames) of this track in presentation order. This method
   * will intelligently pre-decode a few frames ahead to enable fast iteration.
   *
   * @param startTimestamp - The timestamp in seconds at which to start yielding samples (inclusive).
   * @param endTimestamp - The timestamp in seconds at which to stop yielding samples (exclusive).
   */
  samples(startTimestamp = 0, endTimestamp = Infinity) {
    return this.mediaSamplesInRange(startTimestamp, endTimestamp);
  }
  /**
   * Creates an async iterator that yields a video sample (frame) for each timestamp in the argument. This method
   * uses an optimized decoding pipeline if these timestamps are monotonically sorted, decoding each packet at most
   * once, and is therefore more efficient than manually getting the sample for every timestamp. The iterator may
   * yield null if no frame is available for a given timestamp.
   *
   * @param timestamps - An iterable or async iterable of timestamps in seconds.
   */
  samplesAtTimestamps(timestamps) {
    return this.mediaSamplesAtTimestamps(timestamps);
  }
};
var CanvasSink = class {
  /** Creates a new {@link CanvasSink} for the given {@link InputVideoTrack}. */
  constructor(videoTrack, options = {}) {
    /** @internal */
    this._nextCanvasIndex = 0;
    if (!(videoTrack instanceof InputVideoTrack)) {
      throw new TypeError("videoTrack must be an InputVideoTrack.");
    }
    if (options && typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.alpha !== void 0 && typeof options.alpha !== "boolean") {
      throw new TypeError("options.alpha, when provided, must be a boolean.");
    }
    if (options.width !== void 0 && (!Number.isInteger(options.width) || options.width <= 0)) {
      throw new TypeError("options.width, when defined, must be a positive integer.");
    }
    if (options.height !== void 0 && (!Number.isInteger(options.height) || options.height <= 0)) {
      throw new TypeError("options.height, when defined, must be a positive integer.");
    }
    if (options.fit !== void 0 && !["fill", "contain", "cover"].includes(options.fit)) {
      throw new TypeError('options.fit, when provided, must be one of "fill", "contain", or "cover".');
    }
    if (options.width !== void 0 && options.height !== void 0 && options.fit === void 0) {
      throw new TypeError(
        "When both options.width and options.height are provided, options.fit must also be provided."
      );
    }
    if (options.rotation !== void 0 && ![0, 90, 180, 270].includes(options.rotation)) {
      throw new TypeError("options.rotation, when provided, must be 0, 90, 180 or 270.");
    }
    if (options.crop !== void 0) {
      validateCropRectangle(options.crop, "options.");
    }
    if (options.poolSize !== void 0 && (typeof options.poolSize !== "number" || !Number.isInteger(options.poolSize) || options.poolSize < 0)) {
      throw new TypeError("poolSize must be a non-negative integer.");
    }
    const rotation = options.rotation ?? videoTrack.rotation;
    const [rotatedWidth, rotatedHeight] = rotation % 180 === 0 ? [videoTrack.codedWidth, videoTrack.codedHeight] : [videoTrack.codedHeight, videoTrack.codedWidth];
    const crop = options.crop;
    if (crop) {
      clampCropRectangle(crop, rotatedWidth, rotatedHeight);
    }
    let [width, height] = crop ? [crop.width, crop.height] : [rotatedWidth, rotatedHeight];
    const originalAspectRatio = width / height;
    if (options.width !== void 0 && options.height === void 0) {
      width = options.width;
      height = Math.round(width / originalAspectRatio);
    } else if (options.width === void 0 && options.height !== void 0) {
      height = options.height;
      width = Math.round(height * originalAspectRatio);
    } else if (options.width !== void 0 && options.height !== void 0) {
      width = options.width;
      height = options.height;
    }
    this._videoTrack = videoTrack;
    this._alpha = options.alpha ?? false;
    this._width = width;
    this._height = height;
    this._rotation = rotation;
    this._crop = crop;
    this._fit = options.fit ?? "fill";
    this._videoSampleSink = new VideoSampleSink(videoTrack);
    this._canvasPool = Array.from({ length: options.poolSize ?? 0 }, () => null);
  }
  /** @internal */
  _videoSampleToWrappedCanvas(sample) {
    let canvas = this._canvasPool[this._nextCanvasIndex];
    let canvasIsNew = false;
    if (!canvas) {
      if (typeof document !== "undefined") {
        canvas = document.createElement("canvas");
        canvas.width = this._width;
        canvas.height = this._height;
      } else {
        canvas = new OffscreenCanvas(this._width, this._height);
      }
      if (this._canvasPool.length > 0) {
        this._canvasPool[this._nextCanvasIndex] = canvas;
      }
      canvasIsNew = true;
    }
    if (this._canvasPool.length > 0) {
      this._nextCanvasIndex = (this._nextCanvasIndex + 1) % this._canvasPool.length;
    }
    const context = canvas.getContext("2d", {
      alpha: this._alpha || isFirefox()
      // Firefox has VideoFrame glitches with opaque canvases
    });
    assert(context);
    context.resetTransform();
    if (!canvasIsNew) {
      if (!this._alpha && isFirefox()) {
        context.fillStyle = "black";
        context.fillRect(0, 0, this._width, this._height);
      } else {
        context.clearRect(0, 0, this._width, this._height);
      }
    }
    sample.drawWithFit(context, {
      fit: this._fit,
      rotation: this._rotation,
      crop: this._crop
    });
    const result = {
      canvas,
      timestamp: sample.timestamp,
      duration: sample.duration
    };
    sample.close();
    return result;
  }
  /**
   * Retrieves a canvas with the video frame corresponding to the given timestamp, in seconds. More specifically,
   * returns the last video frame (in presentation order) with a start timestamp less than or equal to the given
   * timestamp. Returns null if the timestamp is before the track's first timestamp.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  async getCanvas(timestamp) {
    validateTimestamp(timestamp);
    const sample = await this._videoSampleSink.getSample(timestamp);
    return sample && this._videoSampleToWrappedCanvas(sample);
  }
  /**
   * Creates an async iterator that yields canvases with the video frames of this track in presentation order. This
   * method will intelligently pre-decode a few frames ahead to enable fast iteration.
   *
   * @param startTimestamp - The timestamp in seconds at which to start yielding canvases (inclusive).
   * @param endTimestamp - The timestamp in seconds at which to stop yielding canvases (exclusive).
   */
  canvases(startTimestamp = 0, endTimestamp = Infinity) {
    return mapAsyncGenerator(
      this._videoSampleSink.samples(startTimestamp, endTimestamp),
      (sample) => this._videoSampleToWrappedCanvas(sample)
    );
  }
  /**
   * Creates an async iterator that yields a canvas for each timestamp in the argument. This method uses an optimized
   * decoding pipeline if these timestamps are monotonically sorted, decoding each packet at most once, and is
   * therefore more efficient than manually getting the canvas for every timestamp. The iterator may yield null if
   * no frame is available for a given timestamp.
   *
   * @param timestamps - An iterable or async iterable of timestamps in seconds.
   */
  canvasesAtTimestamps(timestamps) {
    return mapAsyncGenerator(
      this._videoSampleSink.samplesAtTimestamps(timestamps),
      (sample) => sample && this._videoSampleToWrappedCanvas(sample)
    );
  }
};
var AudioDecoderWrapper = class extends DecoderWrapper {
  constructor(onSample, onError, codec, decoderConfig) {
    super(onSample, onError);
    this.decoder = null;
    this.customDecoder = null;
    this.customDecoderCallSerializer = new CallSerializer();
    this.customDecoderQueueSize = 0;
    // Internal state to accumulate a precise current timestamp based on audio durations, not the (potentially
    // inaccurate) packet timestamps.
    this.currentTimestamp = null;
    const sampleHandler = (sample) => {
      if (this.currentTimestamp === null || Math.abs(sample.timestamp - this.currentTimestamp) >= sample.duration) {
        this.currentTimestamp = sample.timestamp;
      }
      const preciseTimestamp = this.currentTimestamp;
      this.currentTimestamp += sample.duration;
      if (sample.numberOfFrames === 0) {
        sample.close();
        return;
      }
      const sampleRate = decoderConfig.sampleRate;
      sample.setTimestamp(Math.round(preciseTimestamp * sampleRate) / sampleRate);
      onSample(sample);
    };
    const MatchingCustomDecoder = customAudioDecoders.find((x) => x.supports(codec, decoderConfig));
    if (MatchingCustomDecoder) {
      this.customDecoder = new MatchingCustomDecoder();
      this.customDecoder.codec = codec;
      this.customDecoder.config = decoderConfig;
      this.customDecoder.onSample = (sample) => {
        if (!(sample instanceof AudioSample)) {
          throw new TypeError("The argument passed to onSample must be an AudioSample.");
        }
        sampleHandler(sample);
      };
      void this.customDecoderCallSerializer.call(() => this.customDecoder.init());
    } else {
      this.decoder = new AudioDecoder({
        output: (data) => {
          try {
            sampleHandler(new AudioSample(data));
          } catch (error) {
            this.onError(error);
          }
        },
        error: onError
      });
      this.decoder.configure(decoderConfig);
    }
  }
  getDecodeQueueSize() {
    if (this.customDecoder) {
      return this.customDecoderQueueSize;
    } else {
      assert(this.decoder);
      return this.decoder.decodeQueueSize;
    }
  }
  decode(packet) {
    if (this.customDecoder) {
      this.customDecoderQueueSize++;
      void this.customDecoderCallSerializer.call(() => this.customDecoder.decode(packet)).then(() => this.customDecoderQueueSize--);
    } else {
      assert(this.decoder);
      this.decoder.decode(packet.toEncodedAudioChunk());
    }
  }
  flush() {
    if (this.customDecoder) {
      return this.customDecoderCallSerializer.call(() => this.customDecoder.flush());
    } else {
      assert(this.decoder);
      return this.decoder.flush();
    }
  }
  close() {
    if (this.customDecoder) {
      void this.customDecoderCallSerializer.call(() => this.customDecoder.close());
    } else {
      assert(this.decoder);
      this.decoder.close();
    }
  }
};
var PcmAudioDecoderWrapper = class extends DecoderWrapper {
  constructor(onSample, onError, decoderConfig) {
    super(onSample, onError);
    this.decoderConfig = decoderConfig;
    // Internal state to accumulate a precise current timestamp based on audio durations, not the (potentially
    // inaccurate) packet timestamps.
    this.currentTimestamp = null;
    assert(PCM_AUDIO_CODECS.includes(decoderConfig.codec));
    this.codec = decoderConfig.codec;
    const { dataType, sampleSize, littleEndian } = parsePcmCodec(this.codec);
    this.inputSampleSize = sampleSize;
    switch (sampleSize) {
      case 1:
        {
          if (dataType === "unsigned") {
            this.readInputValue = (view2, byteOffset) => view2.getUint8(byteOffset) - 2 ** 7;
          } else if (dataType === "signed") {
            this.readInputValue = (view2, byteOffset) => view2.getInt8(byteOffset);
          } else if (dataType === "ulaw") {
            this.readInputValue = (view2, byteOffset) => fromUlaw(view2.getUint8(byteOffset));
          } else if (dataType === "alaw") {
            this.readInputValue = (view2, byteOffset) => fromAlaw(view2.getUint8(byteOffset));
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 2:
        {
          if (dataType === "unsigned") {
            this.readInputValue = (view2, byteOffset) => view2.getUint16(byteOffset, littleEndian) - 2 ** 15;
          } else if (dataType === "signed") {
            this.readInputValue = (view2, byteOffset) => view2.getInt16(byteOffset, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 3:
        {
          if (dataType === "unsigned") {
            this.readInputValue = (view2, byteOffset) => getUint24(view2, byteOffset, littleEndian) - 2 ** 23;
          } else if (dataType === "signed") {
            this.readInputValue = (view2, byteOffset) => getInt24(view2, byteOffset, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 4:
        {
          if (dataType === "unsigned") {
            this.readInputValue = (view2, byteOffset) => view2.getUint32(byteOffset, littleEndian) - 2 ** 31;
          } else if (dataType === "signed") {
            this.readInputValue = (view2, byteOffset) => view2.getInt32(byteOffset, littleEndian);
          } else if (dataType === "float") {
            this.readInputValue = (view2, byteOffset) => view2.getFloat32(byteOffset, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 8:
        {
          if (dataType === "float") {
            this.readInputValue = (view2, byteOffset) => view2.getFloat64(byteOffset, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      default:
        {
          assertNever(sampleSize);
          assert(false);
        }
        ;
    }
    switch (sampleSize) {
      case 1:
        {
          if (dataType === "ulaw" || dataType === "alaw") {
            this.outputSampleSize = 2;
            this.outputFormat = "s16";
            this.writeOutputValue = (view2, byteOffset, value) => view2.setInt16(byteOffset, value, true);
          } else {
            this.outputSampleSize = 1;
            this.outputFormat = "u8";
            this.writeOutputValue = (view2, byteOffset, value) => view2.setUint8(byteOffset, value + 2 ** 7);
          }
        }
        ;
        break;
      case 2:
        {
          this.outputSampleSize = 2;
          this.outputFormat = "s16";
          this.writeOutputValue = (view2, byteOffset, value) => view2.setInt16(byteOffset, value, true);
        }
        ;
        break;
      case 3:
        {
          this.outputSampleSize = 4;
          this.outputFormat = "s32";
          this.writeOutputValue = (view2, byteOffset, value) => view2.setInt32(byteOffset, value << 8, true);
        }
        ;
        break;
      case 4:
        {
          this.outputSampleSize = 4;
          if (dataType === "float") {
            this.outputFormat = "f32";
            this.writeOutputValue = (view2, byteOffset, value) => view2.setFloat32(byteOffset, value, true);
          } else {
            this.outputFormat = "s32";
            this.writeOutputValue = (view2, byteOffset, value) => view2.setInt32(byteOffset, value, true);
          }
        }
        ;
        break;
      case 8:
        {
          this.outputSampleSize = 4;
          this.outputFormat = "f32";
          this.writeOutputValue = (view2, byteOffset, value) => view2.setFloat32(byteOffset, value, true);
        }
        ;
        break;
      default:
        {
          assertNever(sampleSize);
          assert(false);
        }
        ;
    }
    ;
  }
  getDecodeQueueSize() {
    return 0;
  }
  decode(packet) {
    const inputView = toDataView(packet.data);
    const numberOfFrames = packet.byteLength / this.decoderConfig.numberOfChannels / this.inputSampleSize;
    const outputBufferSize = numberOfFrames * this.decoderConfig.numberOfChannels * this.outputSampleSize;
    const outputBuffer = new ArrayBuffer(outputBufferSize);
    const outputView = new DataView(outputBuffer);
    for (let i = 0; i < numberOfFrames * this.decoderConfig.numberOfChannels; i++) {
      const inputIndex = i * this.inputSampleSize;
      const outputIndex = i * this.outputSampleSize;
      const value = this.readInputValue(inputView, inputIndex);
      this.writeOutputValue(outputView, outputIndex, value);
    }
    const preciseDuration = numberOfFrames / this.decoderConfig.sampleRate;
    if (this.currentTimestamp === null || Math.abs(packet.timestamp - this.currentTimestamp) >= preciseDuration) {
      this.currentTimestamp = packet.timestamp;
    }
    const preciseTimestamp = this.currentTimestamp;
    this.currentTimestamp += preciseDuration;
    const audioSample = new AudioSample({
      format: this.outputFormat,
      data: outputBuffer,
      numberOfChannels: this.decoderConfig.numberOfChannels,
      sampleRate: this.decoderConfig.sampleRate,
      numberOfFrames,
      timestamp: preciseTimestamp
    });
    this.onSample(audioSample);
  }
  async flush() {
  }
  close() {
  }
};
var AudioSampleSink = class extends BaseMediaSampleSink {
  /** Creates a new {@link AudioSampleSink} for the given {@link InputAudioTrack}. */
  constructor(audioTrack) {
    if (!(audioTrack instanceof InputAudioTrack)) {
      throw new TypeError("audioTrack must be an InputAudioTrack.");
    }
    super();
    this._track = audioTrack;
  }
  /** @internal */
  async _createDecoder(onSample, onError) {
    if (!await this._track.canDecode()) {
      throw new Error(
        "This audio track cannot be decoded by this browser. Make sure to check decodability before using a track."
      );
    }
    const codec = this._track.codec;
    const decoderConfig = await this._track.getDecoderConfig();
    assert(codec && decoderConfig);
    if (PCM_AUDIO_CODECS.includes(decoderConfig.codec)) {
      return new PcmAudioDecoderWrapper(onSample, onError, decoderConfig);
    } else {
      return new AudioDecoderWrapper(onSample, onError, codec, decoderConfig);
    }
  }
  /** @internal */
  _createPacketSink() {
    return new EncodedPacketSink(this._track);
  }
  /**
   * Retrieves the audio sample corresponding to the given timestamp, in seconds. More specifically, returns
   * the last audio sample (in presentation order) with a start timestamp less than or equal to the given timestamp.
   * Returns null if the timestamp is before the track's first timestamp.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  async getSample(timestamp) {
    validateTimestamp(timestamp);
    for await (const sample of this.mediaSamplesAtTimestamps([timestamp])) {
      return sample;
    }
    throw new Error("Internal error: Iterator returned nothing.");
  }
  /**
   * Creates an async iterator that yields the audio samples of this track in presentation order. This method
   * will intelligently pre-decode a few samples ahead to enable fast iteration.
   *
   * @param startTimestamp - The timestamp in seconds at which to start yielding samples (inclusive).
   * @param endTimestamp - The timestamp in seconds at which to stop yielding samples (exclusive).
   */
  samples(startTimestamp = 0, endTimestamp = Infinity) {
    return this.mediaSamplesInRange(startTimestamp, endTimestamp);
  }
  /**
   * Creates an async iterator that yields an audio sample for each timestamp in the argument. This method
   * uses an optimized decoding pipeline if these timestamps are monotonically sorted, decoding each packet at most
   * once, and is therefore more efficient than manually getting the sample for every timestamp. The iterator may
   * yield null if no sample is available for a given timestamp.
   *
   * @param timestamps - An iterable or async iterable of timestamps in seconds.
   */
  samplesAtTimestamps(timestamps) {
    return this.mediaSamplesAtTimestamps(timestamps);
  }
};
var AudioBufferSink = class {
  /** Creates a new {@link AudioBufferSink} for the given {@link InputAudioTrack}. */
  constructor(audioTrack) {
    if (!(audioTrack instanceof InputAudioTrack)) {
      throw new TypeError("audioTrack must be an InputAudioTrack.");
    }
    this._audioSampleSink = new AudioSampleSink(audioTrack);
  }
  /** @internal */
  _audioSampleToWrappedArrayBuffer(sample) {
    return {
      buffer: sample.toAudioBuffer(),
      timestamp: sample.timestamp,
      duration: sample.duration
    };
  }
  /**
   * Retrieves the audio buffer corresponding to the given timestamp, in seconds. More specifically, returns
   * the last audio buffer (in presentation order) with a start timestamp less than or equal to the given timestamp.
   * Returns null if the timestamp is before the track's first timestamp.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  async getBuffer(timestamp) {
    validateTimestamp(timestamp);
    const data = await this._audioSampleSink.getSample(timestamp);
    return data && this._audioSampleToWrappedArrayBuffer(data);
  }
  /**
   * Creates an async iterator that yields audio buffers of this track in presentation order. This method
   * will intelligently pre-decode a few buffers ahead to enable fast iteration.
   *
   * @param startTimestamp - The timestamp in seconds at which to start yielding buffers (inclusive).
   * @param endTimestamp - The timestamp in seconds at which to stop yielding buffers (exclusive).
   */
  buffers(startTimestamp = 0, endTimestamp = Infinity) {
    return mapAsyncGenerator(
      this._audioSampleSink.samples(startTimestamp, endTimestamp),
      (data) => this._audioSampleToWrappedArrayBuffer(data)
    );
  }
  /**
   * Creates an async iterator that yields an audio buffer for each timestamp in the argument. This method
   * uses an optimized decoding pipeline if these timestamps are monotonically sorted, decoding each packet at most
   * once, and is therefore more efficient than manually getting the buffer for every timestamp. The iterator may
   * yield null if no buffer is available for a given timestamp.
   *
   * @param timestamps - An iterable or async iterable of timestamps in seconds.
   */
  buffersAtTimestamps(timestamps) {
    return mapAsyncGenerator(
      this._audioSampleSink.samplesAtTimestamps(timestamps),
      (data) => data && this._audioSampleToWrappedArrayBuffer(data)
    );
  }
};

// src/input-track.ts
var InputTrack = class {
  /** @internal */
  constructor(input, backing) {
    this.input = input;
    this._backing = backing;
  }
  /** Returns true if and only if this track is a video track. */
  isVideoTrack() {
    return this instanceof InputVideoTrack;
  }
  /** Returns true if and only if this track is an audio track. */
  isAudioTrack() {
    return this instanceof InputAudioTrack;
  }
  /** Returns true if and only if this track is a subtitle track. */
  isSubtitleTrack() {
    return this instanceof InputSubtitleTrack;
  }
  /** The unique ID of this track in the input file. */
  get id() {
    return this._backing.getId();
  }
  /**
   * The identifier of the codec used internally by the container. It is not homogenized by Mediabunny
   * and depends entirely on the container format.
   *
   * This field can be used to determine the codec of a track in case Mediabunny doesn't know that codec.
   *
   * - For ISOBMFF files, this field returns the name of the Sample Description Box (e.g. `'avc1'`).
   * - For Matroska files, this field returns the value of the `CodecID` element.
   * - For WAVE files, this field returns the value of the format tag in the `'fmt '` chunk.
   * - For ADTS files, this field contains the `MPEG-4 Audio Object Type`.
   * - In all other cases, this field is `null`.
   */
  get internalCodecId() {
    return this._backing.getInternalCodecId();
  }
  /**
   * The ISO 639-2/T language code for this track. If the language is unknown, this field is `'und'` (undetermined).
   */
  get languageCode() {
    return this._backing.getLanguageCode();
  }
  /** A user-defined name for this track. */
  get name() {
    return this._backing.getName();
  }
  /**
   * A positive number x such that all timestamps and durations of all packets of this track are
   * integer multiples of 1/x.
   */
  get timeResolution() {
    return this._backing.getTimeResolution();
  }
  /**
   * Returns the start timestamp of the first packet of this track, in seconds. While often near zero, this value
   * may be positive or even negative. A negative starting timestamp means the track's timing has been offset. Samples
   * with a negative timestamp should not be presented.
   */
  getFirstTimestamp() {
    return this._backing.getFirstTimestamp();
  }
  /** Returns the end timestamp of the last packet of this track, in seconds. */
  computeDuration() {
    return this._backing.computeDuration();
  }
  /**
   * Computes aggregate packet statistics for this track, such as average packet rate or bitrate.
   *
   * @param targetPacketCount - This optional parameter sets a target for how many packets this method must have
   * looked at before it can return early; this means, you can use it to aggregate only a subset (prefix) of all
   * packets. This is very useful for getting a great estimate of video frame rate without having to scan through the
   * entire file.
   */
  async computePacketStats(targetPacketCount = Infinity) {
    const sink = new EncodedPacketSink(this);
    let startTimestamp = Infinity;
    let endTimestamp = -Infinity;
    let packetCount = 0;
    let totalPacketBytes = 0;
    for await (const packet of sink.packets(void 0, void 0, { metadataOnly: true })) {
      if (packetCount >= targetPacketCount && packet.timestamp >= endTimestamp) {
        break;
      }
      startTimestamp = Math.min(startTimestamp, packet.timestamp);
      endTimestamp = Math.max(endTimestamp, packet.timestamp + packet.duration);
      packetCount++;
      totalPacketBytes += packet.byteLength;
    }
    return {
      packetCount,
      averagePacketRate: packetCount ? Number((packetCount / (endTimestamp - startTimestamp)).toPrecision(16)) : 0,
      averageBitrate: packetCount ? Number((8 * totalPacketBytes / (endTimestamp - startTimestamp)).toPrecision(16)) : 0
    };
  }
};
var InputVideoTrack = class extends InputTrack {
  /** @internal */
  constructor(input, backing) {
    super(input, backing);
    this._backing = backing;
  }
  get type() {
    return "video";
  }
  get codec() {
    return this._backing.getCodec();
  }
  /** The width in pixels of the track's coded samples, before any transformations or rotations. */
  get codedWidth() {
    return this._backing.getCodedWidth();
  }
  /** The height in pixels of the track's coded samples, before any transformations or rotations. */
  get codedHeight() {
    return this._backing.getCodedHeight();
  }
  /** The angle in degrees by which the track's frames should be rotated (clockwise). */
  get rotation() {
    return this._backing.getRotation();
  }
  /** The width in pixels of the track's frames after rotation. */
  get displayWidth() {
    const rotation = this._backing.getRotation();
    return rotation % 180 === 0 ? this._backing.getCodedWidth() : this._backing.getCodedHeight();
  }
  /** The height in pixels of the track's frames after rotation. */
  get displayHeight() {
    const rotation = this._backing.getRotation();
    return rotation % 180 === 0 ? this._backing.getCodedHeight() : this._backing.getCodedWidth();
  }
  /** Returns the color space of the track's samples. */
  getColorSpace() {
    return this._backing.getColorSpace();
  }
  /** If this method returns true, the track's samples use a high dynamic range (HDR). */
  async hasHighDynamicRange() {
    const colorSpace = await this._backing.getColorSpace();
    return colorSpace.primaries === "bt2020" || colorSpace.primaries === "smpte432" || colorSpace.transfer === "pg" || colorSpace.transfer === "hlg" || colorSpace.matrix === "bt2020-ncl";
  }
  /** Checks if this track may contain transparent samples with alpha data. */
  canBeTransparent() {
    return this._backing.canBeTransparent();
  }
  /**
   * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#video-decoder-config) for decoding the
   * track's packets using a [`VideoDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder). Returns
   * null if the track's codec is unknown.
   */
  getDecoderConfig() {
    return this._backing.getDecoderConfig();
  }
  async getCodecParameterString() {
    const decoderConfig = await this._backing.getDecoderConfig();
    return decoderConfig?.codec ?? null;
  }
  async canDecode() {
    try {
      const decoderConfig = await this._backing.getDecoderConfig();
      if (!decoderConfig) {
        return false;
      }
      const codec = this._backing.getCodec();
      assert(codec !== null);
      if (customVideoDecoders.some((x) => x.supports(codec, decoderConfig))) {
        return true;
      }
      if (typeof VideoDecoder === "undefined") {
        return false;
      }
      const support = await VideoDecoder.isConfigSupported(decoderConfig);
      return support.supported === true;
    } catch (error) {
      console.error("Error during decodability check:", error);
      return false;
    }
  }
  async determinePacketType(packet) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (packet.isMetadataOnly) {
      throw new TypeError("packet must not be metadata-only to determine its type.");
    }
    if (this.codec === null) {
      return null;
    }
    const decoderConfig = await this.getDecoderConfig();
    assert(decoderConfig);
    return determineVideoPacketType(this.codec, decoderConfig, packet.data);
  }
};
var InputAudioTrack = class extends InputTrack {
  /** @internal */
  constructor(input, backing) {
    super(input, backing);
    this._backing = backing;
  }
  get type() {
    return "audio";
  }
  get codec() {
    return this._backing.getCodec();
  }
  /** The number of audio channels in the track. */
  get numberOfChannels() {
    return this._backing.getNumberOfChannels();
  }
  /** The track's audio sample rate in hertz. */
  get sampleRate() {
    return this._backing.getSampleRate();
  }
  /**
   * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#audio-decoder-config) for decoding the
   * track's packets using an [`AudioDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/AudioDecoder). Returns
   * null if the track's codec is unknown.
   */
  getDecoderConfig() {
    return this._backing.getDecoderConfig();
  }
  async getCodecParameterString() {
    const decoderConfig = await this._backing.getDecoderConfig();
    return decoderConfig?.codec ?? null;
  }
  async canDecode() {
    try {
      const decoderConfig = await this._backing.getDecoderConfig();
      if (!decoderConfig) {
        return false;
      }
      const codec = this._backing.getCodec();
      assert(codec !== null);
      if (customAudioDecoders.some((x) => x.supports(codec, decoderConfig))) {
        return true;
      }
      if (decoderConfig.codec.startsWith("pcm-")) {
        return true;
      } else {
        if (typeof AudioDecoder === "undefined") {
          return false;
        }
        const support = await AudioDecoder.isConfigSupported(decoderConfig);
        return support.supported === true;
      }
    } catch (error) {
      console.error("Error during decodability check:", error);
      return false;
    }
  }
  async determinePacketType(packet) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (this.codec === null) {
      return null;
    }
    return "key";
  }
};
var InputSubtitleTrack = class extends InputTrack {
  /** @internal */
  constructor(input, backing) {
    super(input, backing);
    this._backing = backing;
  }
  get type() {
    return "subtitle";
  }
  get codec() {
    return this._backing.getCodec();
  }
  /**
   * Returns an async iterator that yields all subtitle cues in this track.
   */
  getCues() {
    return this._backing.getCues();
  }
  /**
   * Exports all subtitle cues to text format. If targetFormat is specified,
   * attempts to convert to that format (limited conversion support).
   */
  async exportToText(targetFormat) {
    const cues = [];
    for await (const cue of this.getCues()) {
      cues.push(cue);
    }
    const codec = targetFormat || this.codec;
    const codecPrivate = this._backing.getCodecPrivate();
    if (codec === "srt") {
      const { formatCuesToSrt: formatCuesToSrt2 } = await Promise.resolve().then(() => (init_subtitles(), subtitles_exports));
      return formatCuesToSrt2(cues);
    } else if (codec === "ass" || codec === "ssa") {
      const { formatCuesToAss: formatCuesToAss2, splitAssIntoCues: splitAssIntoCues2 } = await Promise.resolve().then(() => (init_subtitles(), subtitles_exports));
      const parsed = codecPrivate ? splitAssIntoCues2(codecPrivate) : { header: "", cues: [] };
      return formatCuesToAss2(cues, parsed.header);
    } else if (codec === "webvtt") {
      const { formatCuesToWebVTT: formatCuesToWebVTT2 } = await Promise.resolve().then(() => (init_subtitles(), subtitles_exports));
      return formatCuesToWebVTT2(cues, codecPrivate || void 0);
    } else {
      const { formatCuesToSrt: formatCuesToSrt2 } = await Promise.resolve().then(() => (init_subtitles(), subtitles_exports));
      return formatCuesToSrt2(cues);
    }
  }
  async getCodecParameterString() {
    return this.codec;
  }
  async canDecode() {
    return this.codec !== null;
  }
  async determinePacketType(packet) {
    return "key";
  }
};

// src/isobmff/isobmff-misc.ts
var buildIsobmffMimeType = (info) => {
  const base = info.hasVideo ? "video/" : info.hasAudio ? "audio/" : "application/";
  let string = base + (info.isQuickTime ? "quicktime" : "mp4");
  if (info.codecStrings.length > 0) {
    const uniqueCodecMimeTypes = [...new Set(info.codecStrings)];
    string += `; codecs="${uniqueCodecMimeTypes.join(", ")}"`;
  }
  return string;
};

// src/isobmff/isobmff-reader.ts
var MIN_BOX_HEADER_SIZE = 8;
var MAX_BOX_HEADER_SIZE = 16;
var readBoxHeader = (slice) => {
  let totalSize = readU32Be(slice);
  const name = readAscii(slice, 4);
  let headerSize = 8;
  const hasLargeSize = totalSize === 1;
  if (hasLargeSize) {
    totalSize = readU64Be(slice);
    headerSize = 16;
  }
  const contentSize = totalSize - headerSize;
  if (contentSize < 0) {
    return null;
  }
  return { name, totalSize, headerSize, contentSize };
};
var readFixed_16_16 = (slice) => {
  return readI32Be(slice) / 65536;
};
var readFixed_2_30 = (slice) => {
  return readI32Be(slice) / 1073741824;
};
var readIsomVariableInteger = (slice) => {
  let result = 0;
  for (let i = 0; i < 4; i++) {
    result <<= 7;
    const nextByte = readU8(slice);
    result |= nextByte & 127;
    if ((nextByte & 128) === 0) {
      break;
    }
  }
  return result;
};
var readMetadataStringShort = (slice) => {
  let stringLength = readU16Be(slice);
  slice.skip(2);
  stringLength = Math.min(stringLength, slice.remainingLength);
  return textDecoder.decode(readBytes(slice, stringLength));
};
var readDataBox = (slice) => {
  const header = readBoxHeader(slice);
  if (!header || header.name !== "data") {
    return null;
  }
  const typeIndicator = readU32Be(slice);
  slice.skip(4);
  const data = readBytes(slice, header.contentSize - 8);
  switch (typeIndicator) {
    case 1:
      return textDecoder.decode(data);
    // UTF-8
    case 2:
      return new TextDecoder("utf-16be").decode(data);
    // UTF-16-BE
    case 13:
      return new RichImageData(data, "image/jpeg");
    case 14:
      return new RichImageData(data, "image/png");
    case 27:
      return new RichImageData(data, "image/bmp");
    default:
      return data;
  }
};

// src/isobmff/isobmff-demuxer.ts
var IsobmffDemuxer = class extends Demuxer {
  constructor(input) {
    super(input);
    this.moovSlice = null;
    this.currentTrack = null;
    this.tracks = [];
    this.metadataPromise = null;
    this.movieTimescale = -1;
    this.movieDurationInTimescale = -1;
    this.isQuickTime = false;
    this.metadataTags = {};
    this.currentMetadataKeys = null;
    this.isFragmented = false;
    this.fragmentTrackDefaults = [];
    this.currentFragment = null;
    /**
     * Caches the last fragment that was read. Based on the assumption that there will be multiple reads to the
     * same fragment in quick succession.
     */
    this.lastReadFragment = null;
    this.reader = input._reader;
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
    const codecStrings = await Promise.all(this.tracks.map((x) => x.inputTrack.getCodecParameterString()));
    return buildIsobmffMimeType({
      isQuickTime: this.isQuickTime,
      hasVideo: this.tracks.some((x) => x.info?.type === "video"),
      hasAudio: this.tracks.some((x) => x.info?.type === "audio"),
      codecStrings: codecStrings.filter(Boolean)
    });
  }
  async getMetadataTags() {
    await this.readMetadata();
    return this.metadataTags;
  }
  readMetadata() {
    return this.metadataPromise ??= (async () => {
      let currentPos = 0;
      while (true) {
        let slice = this.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
        if (slice instanceof Promise) slice = await slice;
        if (!slice) break;
        const startPos = currentPos;
        const boxInfo = readBoxHeader(slice);
        if (!boxInfo) {
          break;
        }
        if (boxInfo.name === "ftyp") {
          const majorBrand = readAscii(slice, 4);
          this.isQuickTime = majorBrand === "qt  ";
        } else if (boxInfo.name === "moov") {
          let moovSlice = this.reader.requestSlice(slice.filePos, boxInfo.contentSize);
          if (moovSlice instanceof Promise) moovSlice = await moovSlice;
          if (!moovSlice) break;
          this.moovSlice = moovSlice;
          this.readContiguousBoxes(this.moovSlice);
          for (const track of this.tracks) {
            const previousSegmentDurationsInSeconds = track.editListPreviousSegmentDurations / this.movieTimescale;
            track.editListOffset -= Math.round(previousSegmentDurationsInSeconds * track.timescale);
          }
          break;
        }
        currentPos = startPos + boxInfo.totalSize;
      }
      if (this.isFragmented && this.reader.fileSize !== null) {
        let lastWordSlice = this.reader.requestSlice(this.reader.fileSize - 4, 4);
        if (lastWordSlice instanceof Promise) lastWordSlice = await lastWordSlice;
        assert(lastWordSlice);
        const lastWord = readU32Be(lastWordSlice);
        const potentialMfraPos = this.reader.fileSize - lastWord;
        if (potentialMfraPos >= 0 && potentialMfraPos <= this.reader.fileSize - MAX_BOX_HEADER_SIZE) {
          let mfraHeaderSlice = this.reader.requestSliceRange(
            potentialMfraPos,
            MIN_BOX_HEADER_SIZE,
            MAX_BOX_HEADER_SIZE
          );
          if (mfraHeaderSlice instanceof Promise) mfraHeaderSlice = await mfraHeaderSlice;
          if (mfraHeaderSlice) {
            const boxInfo = readBoxHeader(mfraHeaderSlice);
            if (boxInfo && boxInfo.name === "mfra") {
              let mfraSlice = this.reader.requestSlice(mfraHeaderSlice.filePos, boxInfo.contentSize);
              if (mfraSlice instanceof Promise) mfraSlice = await mfraSlice;
              if (mfraSlice) {
                this.readContiguousBoxes(mfraSlice);
              }
            }
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
      presentationTimestamps: null,
      presentationTimestampIndexMap: null
    };
    internalTrack.sampleTable = sampleTable;
    assert(this.moovSlice);
    const stblContainerSlice = this.moovSlice.slice(internalTrack.sampleTableByteOffset);
    this.currentTrack = internalTrack;
    this.traverseBox(stblContainerSlice);
    this.currentTrack = null;
    const isPcmCodec = internalTrack.info?.type === "audio" && internalTrack.info.codec && PCM_AUDIO_CODECS.includes(internalTrack.info.codec);
    if (isPcmCodec && sampleTable.sampleCompositionTimeOffsets.length === 0) {
      assert(internalTrack.info?.type === "audio");
      const pcmInfo = parsePcmCodec(internalTrack.info.codec);
      const newSampleTimingEntries = [];
      const newSampleSizes = [];
      for (let i = 0; i < sampleTable.sampleToChunk.length; i++) {
        const chunkEntry = sampleTable.sampleToChunk[i];
        const nextEntry = sampleTable.sampleToChunk[i + 1];
        const chunkCount = (nextEntry ? nextEntry.startChunkIndex : sampleTable.chunkOffsets.length) - chunkEntry.startChunkIndex;
        for (let j = 0; j < chunkCount; j++) {
          const startSampleIndex = chunkEntry.startSampleIndex + j * chunkEntry.samplesPerChunk;
          const endSampleIndex = startSampleIndex + chunkEntry.samplesPerChunk;
          const startTimingEntryIndex = binarySearchLessOrEqual(
            sampleTable.sampleTimingEntries,
            startSampleIndex,
            (x) => x.startIndex
          );
          const startTimingEntry = sampleTable.sampleTimingEntries[startTimingEntryIndex];
          const endTimingEntryIndex = binarySearchLessOrEqual(
            sampleTable.sampleTimingEntries,
            endSampleIndex,
            (x) => x.startIndex
          );
          const endTimingEntry = sampleTable.sampleTimingEntries[endTimingEntryIndex];
          const firstSampleTimestamp = startTimingEntry.startDecodeTimestamp + (startSampleIndex - startTimingEntry.startIndex) * startTimingEntry.delta;
          const lastSampleTimestamp = endTimingEntry.startDecodeTimestamp + (endSampleIndex - endTimingEntry.startIndex) * endTimingEntry.delta;
          const delta = lastSampleTimestamp - firstSampleTimestamp;
          const lastSampleTimingEntry = last(newSampleTimingEntries);
          if (lastSampleTimingEntry && lastSampleTimingEntry.delta === delta) {
            lastSampleTimingEntry.count++;
          } else {
            newSampleTimingEntries.push({
              startIndex: chunkEntry.startChunkIndex + j,
              startDecodeTimestamp: firstSampleTimestamp,
              count: 1,
              delta
            });
          }
          const chunkSize = chunkEntry.samplesPerChunk * pcmInfo.sampleSize * internalTrack.info.numberOfChannels;
          newSampleSizes.push(chunkSize);
        }
        chunkEntry.startSampleIndex = chunkEntry.startChunkIndex;
        chunkEntry.samplesPerChunk = 1;
      }
      sampleTable.sampleTimingEntries = newSampleTimingEntries;
      sampleTable.sampleSizes = newSampleSizes;
    }
    if (sampleTable.sampleCompositionTimeOffsets.length > 0) {
      sampleTable.presentationTimestamps = [];
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
      sampleTable.presentationTimestampIndexMap = Array(sampleTable.presentationTimestamps.length).fill(-1);
      for (let i = 0; i < sampleTable.presentationTimestamps.length; i++) {
        sampleTable.presentationTimestampIndexMap[sampleTable.presentationTimestamps[i].sampleIndex] = i;
      }
    } else {
    }
    return sampleTable;
  }
  async readFragment(startPos) {
    if (this.lastReadFragment?.moofOffset === startPos) {
      return this.lastReadFragment;
    }
    let headerSlice = this.reader.requestSliceRange(startPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
    if (headerSlice instanceof Promise) headerSlice = await headerSlice;
    assert(headerSlice);
    const moofBoxInfo = readBoxHeader(headerSlice);
    assert(moofBoxInfo?.name === "moof");
    let entireSlice = this.reader.requestSlice(startPos, moofBoxInfo.totalSize);
    if (entireSlice instanceof Promise) entireSlice = await entireSlice;
    assert(entireSlice);
    this.traverseBox(entireSlice);
    const fragment = this.lastReadFragment;
    assert(fragment && fragment.moofOffset === startPos);
    for (const [, trackData] of fragment.trackData) {
      const track = trackData.track;
      const { fragmentPositionCache } = track;
      if (!trackData.startTimestampIsFinal) {
        const lookupEntry = track.fragmentLookupTable.find((x) => x.moofOffset === fragment.moofOffset);
        if (lookupEntry) {
          offsetFragmentTrackDataByTimestamp(trackData, lookupEntry.timestamp);
        } else {
          const lastCacheIndex = binarySearchLessOrEqual(
            fragmentPositionCache,
            fragment.moofOffset - 1,
            (x) => x.moofOffset
          );
          if (lastCacheIndex !== -1) {
            const lastCache = fragmentPositionCache[lastCacheIndex];
            offsetFragmentTrackDataByTimestamp(trackData, lastCache.endTimestamp);
          } else {
          }
        }
        trackData.startTimestampIsFinal = true;
      }
      const insertionIndex = binarySearchLessOrEqual(
        fragmentPositionCache,
        trackData.startTimestamp,
        (x) => x.startTimestamp
      );
      if (insertionIndex === -1 || fragmentPositionCache[insertionIndex].moofOffset !== fragment.moofOffset) {
        fragmentPositionCache.splice(insertionIndex + 1, 0, {
          moofOffset: fragment.moofOffset,
          startTimestamp: trackData.startTimestamp,
          endTimestamp: trackData.endTimestamp
        });
      }
    }
    return fragment;
  }
  readContiguousBoxes(slice) {
    const startIndex = slice.filePos;
    while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
      const foundBox = this.traverseBox(slice);
      if (!foundBox) {
        break;
      }
    }
  }
  // eslint-disable-next-line @stylistic/generator-star-spacing
  *iterateContiguousBoxes(slice) {
    const startIndex = slice.filePos;
    while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
      const startPos = slice.filePos;
      const boxInfo = readBoxHeader(slice);
      if (!boxInfo) {
        break;
      }
      yield { boxInfo, slice };
      slice.filePos = startPos + boxInfo.totalSize;
    }
  }
  traverseBox(slice) {
    const startPos = slice.filePos;
    const boxInfo = readBoxHeader(slice);
    if (!boxInfo) {
      return false;
    }
    const contentStartPos = slice.filePos;
    const boxEndPos = startPos + boxInfo.totalSize;
    switch (boxInfo.name) {
      case "mdia":
      case "minf":
      case "dinf":
      case "mfra":
      case "edts":
        {
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "mvhd":
        {
          const version = readU8(slice);
          slice.skip(3);
          if (version === 1) {
            slice.skip(8 + 8);
            this.movieTimescale = readU32Be(slice);
            this.movieDurationInTimescale = readU64Be(slice);
          } else {
            slice.skip(4 + 4);
            this.movieTimescale = readU32Be(slice);
            this.movieDurationInTimescale = readU32Be(slice);
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
            durationInMovieTimescale: -1,
            durationInMediaTimescale: -1,
            rotation: 0,
            internalCodecId: null,
            name: null,
            languageCode: UNDETERMINED_LANGUAGE,
            sampleTableByteOffset: -1,
            sampleTable: null,
            fragmentLookupTable: [],
            currentFragmentState: null,
            fragmentPositionCache: [],
            editListPreviousSegmentDurations: 0,
            editListOffset: 0
          };
          this.currentTrack = track;
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          if (track.id !== -1 && track.timescale !== -1 && track.info !== null) {
            if (track.info.type === "video" && track.info.width !== -1) {
              const videoTrack = track;
              track.inputTrack = new InputVideoTrack(this.input, new IsobmffVideoTrackBacking(videoTrack));
              this.tracks.push(track);
            } else if (track.info.type === "audio" && track.info.numberOfChannels !== -1) {
              const audioTrack = track;
              track.inputTrack = new InputAudioTrack(this.input, new IsobmffAudioTrackBacking(audioTrack));
              this.tracks.push(track);
            } else if (track.info.type === "subtitle") {
              const subtitleTrack = track;
              track.inputTrack = new InputSubtitleTrack(this.input, new IsobmffSubtitleTrackBacking(subtitleTrack));
              this.tracks.push(track);
            }
          }
          this.currentTrack = null;
        }
        ;
        break;
      case "tkhd":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const version = readU8(slice);
          const flags = readU24Be(slice);
          const trackEnabled = (flags & 1) !== 0;
          if (!trackEnabled) {
            break;
          }
          if (version === 0) {
            slice.skip(8);
            track.id = readU32Be(slice);
            slice.skip(4);
            track.durationInMovieTimescale = readU32Be(slice);
          } else if (version === 1) {
            slice.skip(16);
            track.id = readU32Be(slice);
            slice.skip(4);
            track.durationInMovieTimescale = readU64Be(slice);
          } else {
            throw new Error(`Incorrect track header version ${version}.`);
          }
          slice.skip(2 * 4 + 2 + 2 + 2 + 2);
          const matrix = [
            readFixed_16_16(slice),
            readFixed_16_16(slice),
            readFixed_2_30(slice),
            readFixed_16_16(slice),
            readFixed_16_16(slice),
            readFixed_2_30(slice),
            readFixed_16_16(slice),
            readFixed_16_16(slice),
            readFixed_2_30(slice)
          ];
          const rotation = normalizeRotation(roundToMultiple(extractRotationFromMatrix(matrix), 90));
          assert(rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270);
          track.rotation = rotation;
        }
        ;
        break;
      case "elst":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const version = readU8(slice);
          slice.skip(3);
          let relevantEntryFound = false;
          let previousSegmentDurations = 0;
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const segmentDuration = version === 1 ? readU64Be(slice) : readU32Be(slice);
            const mediaTime = version === 1 ? readI64Be(slice) : readI32Be(slice);
            const mediaRate = readFixed_16_16(slice);
            if (segmentDuration === 0) {
              continue;
            }
            if (relevantEntryFound) {
              console.warn(
                "Unsupported edit list: multiple edits are not currently supported. Only using first edit."
              );
              break;
            }
            if (mediaTime === -1) {
              previousSegmentDurations += segmentDuration;
              continue;
            }
            if (mediaRate !== 1) {
              console.warn("Unsupported edit list entry: media rate must be 1.");
              break;
            }
            track.editListPreviousSegmentDurations = previousSegmentDurations;
            track.editListOffset = mediaTime;
            relevantEntryFound = true;
          }
        }
        ;
        break;
      case "mdhd":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const version = readU8(slice);
          slice.skip(3);
          if (version === 0) {
            slice.skip(8);
            track.timescale = readU32Be(slice);
            track.durationInMediaTimescale = readU32Be(slice);
          } else if (version === 1) {
            slice.skip(16);
            track.timescale = readU32Be(slice);
            track.durationInMediaTimescale = readU64Be(slice);
          }
          let language = readU16Be(slice);
          if (language > 0) {
            track.languageCode = "";
            for (let i = 0; i < 3; i++) {
              track.languageCode = String.fromCharCode(96 + (language & 31)) + track.languageCode;
              language >>= 5;
            }
            if (!isIso639Dash2LanguageCode(track.languageCode)) {
              track.languageCode = UNDETERMINED_LANGUAGE;
            }
          }
        }
        ;
        break;
      case "hdlr":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          slice.skip(8);
          const handlerType = readAscii(slice, 4);
          if (handlerType === "vide") {
            track.info = {
              type: "video",
              width: -1,
              height: -1,
              codec: null,
              codecDescription: null,
              colorSpace: null,
              avcCodecInfo: null,
              hevcCodecInfo: null,
              vp9CodecInfo: null,
              av1CodecInfo: null
            };
          } else if (handlerType === "soun") {
            track.info = {
              type: "audio",
              numberOfChannels: -1,
              sampleRate: -1,
              codec: null,
              codecDescription: null,
              aacCodecInfo: null
            };
          } else if (handlerType === "text" || handlerType === "subt" || handlerType === "sbtl") {
            track.info = {
              type: "subtitle",
              codec: null,
              codecPrivateText: null
            };
          }
        }
        ;
        break;
      case "stbl":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          track.sampleTableByteOffset = startPos;
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "stsd":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (track.info === null || track.sampleTable) {
            break;
          }
          const stsdVersion = readU8(slice);
          slice.skip(3);
          const entries = readU32Be(slice);
          for (let i = 0; i < entries; i++) {
            const sampleBoxStartPos = slice.filePos;
            const sampleBoxInfo = readBoxHeader(slice);
            if (!sampleBoxInfo) {
              break;
            }
            track.internalCodecId = sampleBoxInfo.name;
            const lowercaseBoxName = sampleBoxInfo.name.toLowerCase();
            if (track.info.type === "video") {
              if (lowercaseBoxName === "avc1") {
                track.info.codec = "avc";
              } else if (lowercaseBoxName === "hvc1" || lowercaseBoxName === "hev1") {
                track.info.codec = "hevc";
              } else if (lowercaseBoxName === "vp08") {
                track.info.codec = "vp8";
              } else if (lowercaseBoxName === "vp09") {
                track.info.codec = "vp9";
              } else if (lowercaseBoxName === "av01") {
                track.info.codec = "av1";
              } else if (lowercaseBoxName === "mp4v") {
                track.info.codec = "mpeg4";
              } else {
                console.warn(`Unsupported video codec (sample entry type '${sampleBoxInfo.name}').`);
              }
              slice.skip(6 * 1 + 2 + 2 + 2 + 3 * 4);
              track.info.width = readU16Be(slice);
              track.info.height = readU16Be(slice);
              slice.skip(4 + 4 + 4 + 2 + 32 + 2 + 2);
              this.readContiguousBoxes(
                slice.slice(
                  slice.filePos,
                  sampleBoxStartPos + sampleBoxInfo.totalSize - slice.filePos
                )
              );
            } else if (track.info.type === "subtitle") {
              slice.skip(6);
              const dataReferenceIndex = readU16Be(slice);
              if (lowercaseBoxName === "wvtt") {
                track.info.codec = "webvtt";
              } else if (lowercaseBoxName === "tx3g" || lowercaseBoxName === "text") {
                track.info.codec = "tx3g";
              } else if (lowercaseBoxName === "stpp") {
                track.info.codec = "ttml";
              }
              this.readContiguousBoxes(
                slice.slice(
                  slice.filePos,
                  sampleBoxStartPos + sampleBoxInfo.totalSize - slice.filePos
                )
              );
            } else {
              if (lowercaseBoxName === "mp4a") {
              } else if (lowercaseBoxName === "opus") {
                track.info.codec = "opus";
              } else if (lowercaseBoxName === "flac") {
                track.info.codec = "flac";
              } else if (lowercaseBoxName === "twos" || lowercaseBoxName === "sowt" || lowercaseBoxName === "raw " || lowercaseBoxName === "in24" || lowercaseBoxName === "in32" || lowercaseBoxName === "fl32" || lowercaseBoxName === "fl64" || lowercaseBoxName === "lpcm" || lowercaseBoxName === "ipcm" || lowercaseBoxName === "fpcm") {
              } else if (lowercaseBoxName === "ulaw") {
                track.info.codec = "ulaw";
              } else if (lowercaseBoxName === "alaw") {
                track.info.codec = "alaw";
              } else if (lowercaseBoxName === "ac-3") {
                track.info.codec = "ac3";
              } else if (lowercaseBoxName === "ec-3") {
                track.info.codec = "eac3";
              } else {
                console.warn(`Unsupported audio codec (sample entry type '${sampleBoxInfo.name}').`);
              }
              slice.skip(6 * 1 + 2);
              const version = readU16Be(slice);
              slice.skip(3 * 2);
              let channelCount = readU16Be(slice);
              let sampleSize = readU16Be(slice);
              slice.skip(2 * 2);
              let sampleRate = readU32Be(slice) / 65536;
              if (stsdVersion === 0 && version > 0) {
                if (version === 1) {
                  slice.skip(4);
                  sampleSize = 8 * readU32Be(slice);
                  slice.skip(2 * 4);
                } else if (version === 2) {
                  slice.skip(4);
                  sampleRate = readF64Be(slice);
                  channelCount = readU32Be(slice);
                  slice.skip(4);
                  sampleSize = readU32Be(slice);
                  const flags = readU32Be(slice);
                  slice.skip(2 * 4);
                  if (lowercaseBoxName === "lpcm") {
                    const bytesPerSample = sampleSize + 7 >> 3;
                    const isFloat = Boolean(flags & 1);
                    const isBigEndian = Boolean(flags & 2);
                    const sFlags = flags & 4 ? -1 : 0;
                    if (sampleSize > 0 && sampleSize <= 64) {
                      if (isFloat) {
                        if (sampleSize === 32) {
                          track.info.codec = isBigEndian ? "pcm-f32be" : "pcm-f32";
                        }
                      } else {
                        if (sFlags & 1 << bytesPerSample - 1) {
                          if (bytesPerSample === 1) {
                            track.info.codec = "pcm-s8";
                          } else if (bytesPerSample === 2) {
                            track.info.codec = isBigEndian ? "pcm-s16be" : "pcm-s16";
                          } else if (bytesPerSample === 3) {
                            track.info.codec = isBigEndian ? "pcm-s24be" : "pcm-s24";
                          } else if (bytesPerSample === 4) {
                            track.info.codec = isBigEndian ? "pcm-s32be" : "pcm-s32";
                          }
                        } else {
                          if (bytesPerSample === 1) {
                            track.info.codec = "pcm-u8";
                          }
                        }
                      }
                    }
                    if (track.info.codec === null) {
                      console.warn("Unsupported PCM format.");
                    }
                  }
                }
              }
              if (track.info.codec === "opus") {
                sampleRate = OPUS_SAMPLE_RATE;
              }
              track.info.numberOfChannels = channelCount;
              track.info.sampleRate = sampleRate;
              if (lowercaseBoxName === "twos") {
                if (sampleSize === 8) {
                  track.info.codec = "pcm-s8";
                } else if (sampleSize === 16) {
                  track.info.codec = "pcm-s16be";
                } else {
                  console.warn(`Unsupported sample size ${sampleSize} for codec 'twos'.`);
                  track.info.codec = null;
                }
              } else if (lowercaseBoxName === "sowt") {
                if (sampleSize === 8) {
                  track.info.codec = "pcm-s8";
                } else if (sampleSize === 16) {
                  track.info.codec = "pcm-s16";
                } else {
                  console.warn(`Unsupported sample size ${sampleSize} for codec 'sowt'.`);
                  track.info.codec = null;
                }
              } else if (lowercaseBoxName === "raw ") {
                track.info.codec = "pcm-u8";
              } else if (lowercaseBoxName === "in24") {
                track.info.codec = "pcm-s24be";
              } else if (lowercaseBoxName === "in32") {
                track.info.codec = "pcm-s32be";
              } else if (lowercaseBoxName === "fl32") {
                track.info.codec = "pcm-f32be";
              } else if (lowercaseBoxName === "fl64") {
                track.info.codec = "pcm-f64be";
              } else if (lowercaseBoxName === "ipcm") {
                track.info.codec = "pcm-s16be";
              } else if (lowercaseBoxName === "fpcm") {
                track.info.codec = "pcm-f32be";
              }
              this.readContiguousBoxes(
                slice.slice(
                  slice.filePos,
                  sampleBoxStartPos + sampleBoxInfo.totalSize - slice.filePos
                )
              );
            }
          }
        }
        ;
        break;
      case "avcC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info);
          if (track.info.type === "video") {
            track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
          }
        }
        ;
        break;
      case "hvcC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info);
          if (track.info.type === "video") {
            track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
          }
        }
        ;
        break;
      case "vpcC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          slice.skip(4);
          const profile = readU8(slice);
          const level = readU8(slice);
          const thirdByte = readU8(slice);
          const bitDepth = thirdByte >> 4;
          const chromaSubsampling = thirdByte >> 1 & 7;
          const videoFullRangeFlag = thirdByte & 1;
          const colourPrimaries = readU8(slice);
          const transferCharacteristics = readU8(slice);
          const matrixCoefficients = readU8(slice);
          track.info.vp9CodecInfo = {
            profile,
            level,
            bitDepth,
            chromaSubsampling,
            videoFullRangeFlag,
            colourPrimaries,
            transferCharacteristics,
            matrixCoefficients
          };
        }
        ;
        break;
      case "av1C":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          slice.skip(1);
          const secondByte = readU8(slice);
          const profile = secondByte >> 5;
          const level = secondByte & 31;
          const thirdByte = readU8(slice);
          const tier = thirdByte >> 7;
          const highBitDepth = thirdByte >> 6 & 1;
          const twelveBit = thirdByte >> 5 & 1;
          const monochrome = thirdByte >> 4 & 1;
          const chromaSubsamplingX = thirdByte >> 3 & 1;
          const chromaSubsamplingY = thirdByte >> 2 & 1;
          const chromaSamplePosition = thirdByte & 3;
          const bitDepth = profile === 2 && highBitDepth ? twelveBit ? 12 : 10 : highBitDepth ? 10 : 8;
          track.info.av1CodecInfo = {
            profile,
            level,
            tier,
            bitDepth,
            monochrome,
            chromaSubsamplingX,
            chromaSubsamplingY,
            chromaSamplePosition
          };
        }
        ;
        break;
      case "colr":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          const colourType = readAscii(slice, 4);
          if (colourType !== "nclx") {
            break;
          }
          const colourPrimaries = readU16Be(slice);
          const transferCharacteristics = readU16Be(slice);
          const matrixCoefficients = readU16Be(slice);
          const fullRangeFlag = Boolean(readU8(slice) & 128);
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
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "esds":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (track.info?.type !== "audio" && track.info?.type !== "video") {
            break;
          }
          slice.skip(4);
          const tag = readU8(slice);
          assert(tag === 3);
          readIsomVariableInteger(slice);
          slice.skip(2);
          const mixed = readU8(slice);
          const streamDependenceFlag = (mixed & 128) !== 0;
          const urlFlag = (mixed & 64) !== 0;
          const ocrStreamFlag = (mixed & 32) !== 0;
          if (streamDependenceFlag) {
            slice.skip(2);
          }
          if (urlFlag) {
            const urlLength = readU8(slice);
            slice.skip(urlLength);
          }
          if (ocrStreamFlag) {
            slice.skip(2);
          }
          const decoderConfigTag = readU8(slice);
          assert(decoderConfigTag === 4);
          const decoderConfigDescriptorLength = readIsomVariableInteger(slice);
          const payloadStart = slice.filePos;
          const objectTypeIndication = readU8(slice);
          if (track.info.type === "audio") {
            if (objectTypeIndication === 64 || objectTypeIndication === 103) {
              track.info.codec = "aac";
              track.info.aacCodecInfo = { isMpeg2: objectTypeIndication === 103 };
            } else if (objectTypeIndication === 105 || objectTypeIndication === 107) {
              track.info.codec = "mp3";
            } else if (objectTypeIndication === 221) {
              track.info.codec = "vorbis";
            } else {
              console.warn(
                `Unsupported audio codec (objectTypeIndication ${objectTypeIndication}) - discarding track.`
              );
            }
          } else if (track.info.type === "video") {
            if (objectTypeIndication === 32) {
              track.info.codec = "mpeg4";
            }
          }
          slice.skip(1 + 3 + 4 + 4);
          if (decoderConfigDescriptorLength > slice.filePos - payloadStart) {
            const decoderSpecificInfoTag = readU8(slice);
            assert(decoderSpecificInfoTag === 5);
            const decoderSpecificInfoLength = readIsomVariableInteger(slice);
            track.info.codecDescription = readBytes(slice, decoderSpecificInfoLength);
            if (track.info.type === "audio" && track.info.codec === "aac") {
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
        ;
        break;
      case "enda":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          const littleEndian = readU16Be(slice) & 255;
          if (littleEndian) {
            if (track.info.codec === "pcm-s16be") {
              track.info.codec = "pcm-s16";
            } else if (track.info.codec === "pcm-s24be") {
              track.info.codec = "pcm-s24";
            } else if (track.info.codec === "pcm-s32be") {
              track.info.codec = "pcm-s32";
            } else if (track.info.codec === "pcm-f32be") {
              track.info.codec = "pcm-f32";
            } else if (track.info.codec === "pcm-f64be") {
              track.info.codec = "pcm-f64";
            }
          }
        }
        ;
        break;
      case "pcmC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(1 + 3);
          const formatFlags = readU8(slice);
          const isLittleEndian = Boolean(formatFlags & 1);
          const pcmSampleSize = readU8(slice);
          if (track.info.codec === "pcm-s16be") {
            if (isLittleEndian) {
              if (pcmSampleSize === 16) {
                track.info.codec = "pcm-s16";
              } else if (pcmSampleSize === 24) {
                track.info.codec = "pcm-s24";
              } else if (pcmSampleSize === 32) {
                track.info.codec = "pcm-s32";
              } else {
                console.warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
                track.info.codec = null;
              }
            } else {
              if (pcmSampleSize === 16) {
                track.info.codec = "pcm-s16be";
              } else if (pcmSampleSize === 24) {
                track.info.codec = "pcm-s24be";
              } else if (pcmSampleSize === 32) {
                track.info.codec = "pcm-s32be";
              } else {
                console.warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
                track.info.codec = null;
              }
            }
          } else if (track.info.codec === "pcm-f32be") {
            if (isLittleEndian) {
              if (pcmSampleSize === 32) {
                track.info.codec = "pcm-f32";
              } else if (pcmSampleSize === 64) {
                track.info.codec = "pcm-f64";
              } else {
                console.warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
                track.info.codec = null;
              }
            } else {
              if (pcmSampleSize === 32) {
                track.info.codec = "pcm-f32be";
              } else if (pcmSampleSize === 64) {
                track.info.codec = "pcm-f64be";
              } else {
                console.warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
                track.info.codec = null;
              }
            }
          }
          break;
        }
        ;
      case "dOps":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(1);
          const outputChannelCount = readU8(slice);
          const preSkip = readU16Be(slice);
          const inputSampleRate = readU32Be(slice);
          const outputGain = readI16Be(slice);
          const channelMappingFamily = readU8(slice);
          let channelMappingTable;
          if (channelMappingFamily !== 0) {
            channelMappingTable = readBytes(slice, 2 + outputChannelCount);
          } else {
            channelMappingTable = new Uint8Array(0);
          }
          const description = new Uint8Array(8 + 1 + 1 + 2 + 4 + 2 + 1 + channelMappingTable.byteLength);
          const view2 = new DataView(description.buffer);
          view2.setUint32(0, 1332770163, false);
          view2.setUint32(4, 1214603620, false);
          view2.setUint8(8, 1);
          view2.setUint8(9, outputChannelCount);
          view2.setUint16(10, preSkip, true);
          view2.setUint32(12, inputSampleRate, true);
          view2.setInt16(16, outputGain, true);
          view2.setUint8(18, channelMappingFamily);
          description.set(channelMappingTable, 19);
          track.info.codecDescription = description;
          track.info.numberOfChannels = outputChannelCount;
        }
        ;
        break;
      case "dfLa":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(4);
          const BLOCK_TYPE_MASK = 127;
          const LAST_METADATA_BLOCK_FLAG_MASK = 128;
          const startPos2 = slice.filePos;
          while (slice.filePos < boxEndPos) {
            const flagAndType = readU8(slice);
            const metadataBlockLength = readU24Be(slice);
            const type = flagAndType & BLOCK_TYPE_MASK;
            if (type === 0 /* STREAMINFO */) {
              slice.skip(10);
              const word = readU32Be(slice);
              const sampleRate = word >>> 12;
              const numberOfChannels = (word >> 9 & 7) + 1;
              track.info.sampleRate = sampleRate;
              track.info.numberOfChannels = numberOfChannels;
              slice.skip(20);
            } else {
              slice.skip(metadataBlockLength);
            }
            if (flagAndType & LAST_METADATA_BLOCK_FLAG_MASK) {
              break;
            }
          }
          const endPos = slice.filePos;
          slice.filePos = startPos2;
          const bytes2 = readBytes(slice, endPos - startPos2);
          const description = new Uint8Array(4 + bytes2.byteLength);
          const view2 = new DataView(description.buffer);
          view2.setUint32(0, 1716281667, false);
          description.set(bytes2, 4);
          track.info.codecDescription = description;
        }
        ;
        break;
      case "stts":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          let currentIndex = 0;
          let currentTimestamp = 0;
          for (let i = 0; i < entryCount; i++) {
            const sampleCount = readU32Be(slice);
            const sampleDelta = readU32Be(slice);
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
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(1 + 3);
          const entryCount = readU32Be(slice);
          let sampleIndex = 0;
          for (let i = 0; i < entryCount; i++) {
            const sampleCount = readU32Be(slice);
            const sampleOffset = readI32Be(slice);
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
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const sampleSize = readU32Be(slice);
          const sampleCount = readU32Be(slice);
          if (sampleSize === 0) {
            for (let i = 0; i < sampleCount; i++) {
              const sampleSize2 = readU32Be(slice);
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
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          slice.skip(3);
          const fieldSize = readU8(slice);
          const sampleCount = readU32Be(slice);
          const bytes2 = readBytes(slice, Math.ceil(sampleCount * fieldSize / 8));
          const bitstream = new Bitstream(bytes2);
          for (let i = 0; i < sampleCount; i++) {
            const sampleSize = bitstream.readBits(fieldSize);
            track.sampleTable.sampleSizes.push(sampleSize);
          }
        }
        ;
        break;
      case "stss":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          track.sampleTable.keySampleIndices = [];
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const sampleIndex = readU32Be(slice) - 1;
            track.sampleTable.keySampleIndices.push(sampleIndex);
          }
          if (track.sampleTable.keySampleIndices[0] !== 0) {
            track.sampleTable.keySampleIndices.unshift(0);
          }
        }
        ;
        break;
      case "stsc":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const startChunkIndex = readU32Be(slice) - 1;
            const samplesPerChunk = readU32Be(slice);
            const sampleDescriptionIndex = readU32Be(slice);
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
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const chunkOffset = readU32Be(slice);
            track.sampleTable.chunkOffsets.push(chunkOffset);
          }
        }
        ;
        break;
      case "co64":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const chunkOffset = readU64Be(slice);
            track.sampleTable.chunkOffsets.push(chunkOffset);
          }
        }
        ;
        break;
      case "mvex":
        {
          this.isFragmented = true;
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "mehd":
        {
          const version = readU8(slice);
          slice.skip(3);
          const fragmentDuration = version === 1 ? readU64Be(slice) : readU32Be(slice);
          this.movieDurationInTimescale = fragmentDuration;
        }
        ;
        break;
      case "trex":
        {
          slice.skip(4);
          const trackId = readU32Be(slice);
          const defaultSampleDescriptionIndex = readU32Be(slice);
          const defaultSampleDuration = readU32Be(slice);
          const defaultSampleSize = readU32Be(slice);
          const defaultSampleFlags = readU32Be(slice);
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
          const version = readU8(slice);
          slice.skip(3);
          const trackId = readU32Be(slice);
          const track = this.tracks.find((x) => x.id === trackId);
          if (!track) {
            break;
          }
          const word = readU32Be(slice);
          const lengthSizeOfTrafNum = (word & 48) >> 4;
          const lengthSizeOfTrunNum = (word & 12) >> 2;
          const lengthSizeOfSampleNum = word & 3;
          const functions = [readU8, readU16Be, readU24Be, readU32Be];
          const readTrafNum = functions[lengthSizeOfTrafNum];
          const readTrunNum = functions[lengthSizeOfTrunNum];
          const readSampleNum = functions[lengthSizeOfSampleNum];
          const numberOfEntries = readU32Be(slice);
          for (let i = 0; i < numberOfEntries; i++) {
            const time = version === 1 ? readU64Be(slice) : readU32Be(slice);
            const moofOffset = version === 1 ? readU64Be(slice) : readU32Be(slice);
            readTrafNum(slice);
            readTrunNum(slice);
            readSampleNum(slice);
            track.fragmentLookupTable.push({
              timestamp: time,
              moofOffset
            });
          }
          track.fragmentLookupTable.sort((a, b) => a.timestamp - b.timestamp);
          for (let i = 0; i < track.fragmentLookupTable.length - 1; i++) {
            const entry1 = track.fragmentLookupTable[i];
            const entry2 = track.fragmentLookupTable[i + 1];
            if (entry1.timestamp === entry2.timestamp) {
              track.fragmentLookupTable.splice(i + 1, 1);
              i--;
            }
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
            trackData: /* @__PURE__ */ new Map()
          };
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          this.lastReadFragment = this.currentFragment;
          this.currentFragment = null;
        }
        ;
        break;
      case "traf":
        {
          assert(this.currentFragment);
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          if (this.currentTrack) {
            const trackData = this.currentFragment.trackData.get(this.currentTrack.id);
            if (trackData) {
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
          slice.skip(1);
          const flags = readU24Be(slice);
          const baseDataOffsetPresent = Boolean(flags & 1);
          const sampleDescriptionIndexPresent = Boolean(flags & 2);
          const defaultSampleDurationPresent = Boolean(flags & 8);
          const defaultSampleSizePresent = Boolean(flags & 16);
          const defaultSampleFlagsPresent = Boolean(flags & 32);
          const durationIsEmpty = Boolean(flags & 65536);
          const defaultBaseIsMoof = Boolean(flags & 131072);
          const trackId = readU32Be(slice);
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
            track.currentFragmentState.baseDataOffset = readU64Be(slice);
          } else if (defaultBaseIsMoof) {
            track.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset;
          }
          if (sampleDescriptionIndexPresent) {
            track.currentFragmentState.sampleDescriptionIndex = readU32Be(slice);
          }
          if (defaultSampleDurationPresent) {
            track.currentFragmentState.defaultSampleDuration = readU32Be(slice);
          }
          if (defaultSampleSizePresent) {
            track.currentFragmentState.defaultSampleSize = readU32Be(slice);
          }
          if (defaultSampleFlagsPresent) {
            track.currentFragmentState.defaultSampleFlags = readU32Be(slice);
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
          const version = readU8(slice);
          slice.skip(3);
          const baseMediaDecodeTime = version === 0 ? readU32Be(slice) : readU64Be(slice);
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
            console.warn("Can't have two trun boxes for the same track in one fragment. Ignoring...");
            break;
          }
          const version = readU8(slice);
          const flags = readU24Be(slice);
          const dataOffsetPresent = Boolean(flags & 1);
          const firstSampleFlagsPresent = Boolean(flags & 4);
          const sampleDurationPresent = Boolean(flags & 256);
          const sampleSizePresent = Boolean(flags & 512);
          const sampleFlagsPresent = Boolean(flags & 1024);
          const sampleCompositionTimeOffsetsPresent = Boolean(flags & 2048);
          const sampleCount = readU32Be(slice);
          let dataOffset = track.currentFragmentState.baseDataOffset;
          if (dataOffsetPresent) {
            dataOffset += readI32Be(slice);
          }
          let firstSampleFlags = null;
          if (firstSampleFlagsPresent) {
            firstSampleFlags = readU32Be(slice);
          }
          let currentOffset = dataOffset;
          if (sampleCount === 0) {
            this.currentFragment.implicitBaseDataOffset = currentOffset;
            break;
          }
          let currentTimestamp = 0;
          const trackData = {
            track,
            startTimestamp: 0,
            endTimestamp: 0,
            firstKeyFrameTimestamp: null,
            samples: [],
            presentationTimestamps: [],
            startTimestampIsFinal: false
          };
          this.currentFragment.trackData.set(track.id, trackData);
          for (let i = 0; i < sampleCount; i++) {
            let sampleDuration;
            if (sampleDurationPresent) {
              sampleDuration = readU32Be(slice);
            } else {
              assert(track.currentFragmentState.defaultSampleDuration !== null);
              sampleDuration = track.currentFragmentState.defaultSampleDuration;
            }
            let sampleSize;
            if (sampleSizePresent) {
              sampleSize = readU32Be(slice);
            } else {
              assert(track.currentFragmentState.defaultSampleSize !== null);
              sampleSize = track.currentFragmentState.defaultSampleSize;
            }
            let sampleFlags;
            if (sampleFlagsPresent) {
              sampleFlags = readU32Be(slice);
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
                sampleCompositionTimeOffset = readU32Be(slice);
              } else {
                sampleCompositionTimeOffset = readI32Be(slice);
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
          for (let i = 0; i < trackData.presentationTimestamps.length; i++) {
            const currentEntry = trackData.presentationTimestamps[i];
            const currentSample = trackData.samples[currentEntry.sampleIndex];
            if (trackData.firstKeyFrameTimestamp === null && currentSample.isKeyFrame) {
              trackData.firstKeyFrameTimestamp = currentSample.presentationTimestamp;
            }
            if (i < trackData.presentationTimestamps.length - 1) {
              const nextEntry = trackData.presentationTimestamps[i + 1];
              currentSample.duration = nextEntry.presentationTimestamp - currentEntry.presentationTimestamp;
            }
          }
          const firstSample = trackData.samples[trackData.presentationTimestamps[0].sampleIndex];
          const lastSample = trackData.samples[last(trackData.presentationTimestamps).sampleIndex];
          trackData.startTimestamp = firstSample.presentationTimestamp;
          trackData.endTimestamp = lastSample.presentationTimestamp + lastSample.duration;
          this.currentFragment.implicitBaseDataOffset = currentOffset;
        }
        ;
        break;
      // Metadata section
      // https://exiftool.org/TagNames/QuickTime.html
      // https://mp4workshop.com/about
      case "udta":
        {
          const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          for (const { boxInfo: boxInfo2, slice: slice2 } of iterator) {
            if (boxInfo2.name !== "meta" && !this.currentTrack) {
              const startPos2 = slice2.filePos;
              this.metadataTags.raw ??= {};
              if (boxInfo2.name[0] === "\xA9") {
                this.metadataTags.raw[boxInfo2.name] ??= readMetadataStringShort(slice2);
              } else {
                this.metadataTags.raw[boxInfo2.name] ??= readBytes(slice2, boxInfo2.contentSize);
              }
              slice2.filePos = startPos2;
            }
            switch (boxInfo2.name) {
              case "meta":
                {
                  slice2.skip(-boxInfo2.headerSize);
                  this.traverseBox(slice2);
                }
                ;
                break;
              case "\xA9nam":
              case "name":
                {
                  if (this.currentTrack) {
                    this.currentTrack.name = textDecoder.decode(readBytes(slice2, boxInfo2.contentSize));
                  } else {
                    this.metadataTags.title ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9des":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.description ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9ART":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.artist ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9alb":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.album ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "albr":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.albumArtist ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9gen":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.genre ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9day":
                {
                  if (!this.currentTrack) {
                    const date = new Date(readMetadataStringShort(slice2));
                    if (!Number.isNaN(date.getTime())) {
                      this.metadataTags.date ??= date;
                    }
                  }
                }
                ;
                break;
              case "\xA9cmt":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.comment ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9lyr":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.lyrics ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
            }
          }
        }
        ;
        break;
      case "meta":
        {
          if (this.currentTrack) {
            break;
          }
          const word = readU32Be(slice);
          const isQuickTime = word !== 0;
          this.currentMetadataKeys = /* @__PURE__ */ new Map();
          if (isQuickTime) {
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          } else {
            this.readContiguousBoxes(slice.slice(contentStartPos + 4, boxInfo.contentSize - 4));
          }
          this.currentMetadataKeys = null;
        }
        ;
        break;
      case "keys":
        {
          if (!this.currentMetadataKeys) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const keySize = readU32Be(slice);
            slice.skip(4);
            const keyName = textDecoder.decode(readBytes(slice, keySize - 8));
            this.currentMetadataKeys.set(i + 1, keyName);
          }
        }
        ;
        break;
      case "ilst":
        {
          if (!this.currentMetadataKeys) {
            break;
          }
          const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          for (const { boxInfo: boxInfo2, slice: slice2 } of iterator) {
            let metadataKey = boxInfo2.name;
            const nameAsNumber = (metadataKey.charCodeAt(0) << 24) + (metadataKey.charCodeAt(1) << 16) + (metadataKey.charCodeAt(2) << 8) + metadataKey.charCodeAt(3);
            if (this.currentMetadataKeys.has(nameAsNumber)) {
              metadataKey = this.currentMetadataKeys.get(nameAsNumber);
            }
            const data = readDataBox(slice2);
            this.metadataTags.raw ??= {};
            this.metadataTags.raw[metadataKey] ??= data;
            switch (metadataKey) {
              case "\xA9nam":
              case "titl":
              case "com.apple.quicktime.title":
              case "title":
                {
                  if (typeof data === "string") {
                    this.metadataTags.title ??= data;
                  }
                }
                ;
                break;
              case "\xA9des":
              case "desc":
              case "dscp":
              case "com.apple.quicktime.description":
              case "description":
                {
                  if (typeof data === "string") {
                    this.metadataTags.description ??= data;
                  }
                }
                ;
                break;
              case "\xA9ART":
              case "com.apple.quicktime.artist":
              case "artist":
                {
                  if (typeof data === "string") {
                    this.metadataTags.artist ??= data;
                  }
                }
                ;
                break;
              case "\xA9alb":
              case "albm":
              case "com.apple.quicktime.album":
              case "album":
                {
                  if (typeof data === "string") {
                    this.metadataTags.album ??= data;
                  }
                }
                ;
                break;
              case "aART":
              case "album_artist":
                {
                  if (typeof data === "string") {
                    this.metadataTags.albumArtist ??= data;
                  }
                }
                ;
                break;
              case "\xA9cmt":
              case "com.apple.quicktime.comment":
              case "comment":
                {
                  if (typeof data === "string") {
                    this.metadataTags.comment ??= data;
                  }
                }
                ;
                break;
              case "\xA9gen":
              case "gnre":
              case "com.apple.quicktime.genre":
              case "genre":
                {
                  if (typeof data === "string") {
                    this.metadataTags.genre ??= data;
                  }
                }
                ;
                break;
              case "\xA9lyr":
              case "lyrics":
                {
                  if (typeof data === "string") {
                    this.metadataTags.lyrics ??= data;
                  }
                }
                ;
                break;
              case "\xA9day":
              case "rldt":
              case "com.apple.quicktime.creationdate":
              case "date":
                {
                  if (typeof data === "string") {
                    const date = new Date(data);
                    if (!Number.isNaN(date.getTime())) {
                      this.metadataTags.date ??= date;
                    }
                  }
                }
                ;
                break;
              case "covr":
              case "com.apple.quicktime.artwork":
                {
                  if (data instanceof RichImageData) {
                    this.metadataTags.images ??= [];
                    this.metadataTags.images.push({
                      data: data.data,
                      kind: "coverFront",
                      mimeType: data.mimeType
                    });
                  } else if (data instanceof Uint8Array) {
                    this.metadataTags.images ??= [];
                    this.metadataTags.images.push({
                      data,
                      kind: "coverFront",
                      mimeType: "image/*"
                    });
                  }
                }
                ;
                break;
              case "track":
                {
                  if (typeof data === "string") {
                    const parts = data.split("/");
                    const trackNum = Number.parseInt(parts[0], 10);
                    const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
                    if (Number.isInteger(trackNum) && trackNum > 0) {
                      this.metadataTags.trackNumber ??= trackNum;
                    }
                    if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
                      this.metadataTags.tracksTotal ??= tracksTotal;
                    }
                  }
                }
                ;
                break;
              case "trkn":
                {
                  if (data instanceof Uint8Array && data.length >= 6) {
                    const view2 = toDataView(data);
                    const trackNumber = view2.getUint16(2, false);
                    const tracksTotal = view2.getUint16(4, false);
                    if (trackNumber > 0) {
                      this.metadataTags.trackNumber ??= trackNumber;
                    }
                    if (tracksTotal > 0) {
                      this.metadataTags.tracksTotal ??= tracksTotal;
                    }
                  }
                }
                ;
                break;
              case "disc":
              case "disk":
                {
                  if (data instanceof Uint8Array && data.length >= 6) {
                    const view2 = toDataView(data);
                    const discNumber = view2.getUint16(2, false);
                    const discNumberMax = view2.getUint16(4, false);
                    if (discNumber > 0) {
                      this.metadataTags.discNumber ??= discNumber;
                    }
                    if (discNumberMax > 0) {
                      this.metadataTags.discsTotal ??= discNumberMax;
                    }
                  }
                }
                ;
                break;
            }
          }
        }
        ;
        break;
    }
    slice.filePos = boxEndPos;
    return true;
  }
};
var IsobmffTrackBacking = class {
  constructor(internalTrack) {
    this.internalTrack = internalTrack;
    this.packetToSampleIndex = /* @__PURE__ */ new WeakMap();
    this.packetToFragmentLocation = /* @__PURE__ */ new WeakMap();
  }
  getId() {
    return this.internalTrack.id;
  }
  getCodec() {
    throw new Error("Not implemented on base class.");
  }
  getInternalCodecId() {
    return this.internalTrack.internalCodecId;
  }
  getName() {
    return this.internalTrack.name;
  }
  getLanguageCode() {
    return this.internalTrack.languageCode;
  }
  getTimeResolution() {
    return this.internalTrack.timescale;
  }
  async computeDuration() {
    const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
    return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
  }
  async getFirstTimestamp() {
    const firstPacket = await this.getFirstPacket({ metadataOnly: true });
    return firstPacket?.timestamp ?? 0;
  }
  async getFirstPacket(options) {
    const regularPacket = await this.fetchPacketForSampleIndex(0, options);
    if (regularPacket || !this.internalTrack.demuxer.isFragmented) {
      return regularPacket;
    }
    return this.performFragmentedLookup(
      null,
      (fragment) => {
        const trackData = fragment.trackData.get(this.internalTrack.id);
        if (trackData) {
          return {
            sampleIndex: 0,
            correctSampleFound: true
          };
        }
        return {
          sampleIndex: -1,
          correctSampleFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the lookup entries
      Infinity,
      options
    );
  }
  mapTimestampIntoTimescale(timestamp) {
    return roundToPrecision(timestamp * this.internalTrack.timescale, 14) + this.internalTrack.editListOffset;
  }
  async getPacket(timestamp, options) {
    const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
    const regularPacket = await this.fetchPacketForSampleIndex(sampleIndex, options);
    if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
      return regularPacket;
    }
    return this.performFragmentedLookup(
      null,
      (fragment) => {
        const trackData = fragment.trackData.get(this.internalTrack.id);
        if (!trackData) {
          return { sampleIndex: -1, correctSampleFound: false };
        }
        const index = binarySearchLessOrEqual(
          trackData.presentationTimestamps,
          timestampInTimescale,
          (x) => x.presentationTimestamp
        );
        const sampleIndex2 = index !== -1 ? trackData.presentationTimestamps[index].sampleIndex : -1;
        const correctSampleFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
        return { sampleIndex: sampleIndex2, correctSampleFound };
      },
      timestampInTimescale,
      timestampInTimescale,
      options
    );
  }
  async getNextPacket(packet, options) {
    const regularSampleIndex = this.packetToSampleIndex.get(packet);
    if (regularSampleIndex !== void 0) {
      return this.fetchPacketForSampleIndex(regularSampleIndex + 1, options);
    }
    const locationInFragment = this.packetToFragmentLocation.get(packet);
    if (locationInFragment === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performFragmentedLookup(
      locationInFragment.fragment,
      (fragment) => {
        if (fragment === locationInFragment.fragment) {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (locationInFragment.sampleIndex + 1 < trackData.samples.length) {
            return {
              sampleIndex: locationInFragment.sampleIndex + 1,
              correctSampleFound: true
            };
          }
        } else {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (trackData) {
            return {
              sampleIndex: 0,
              correctSampleFound: true
            };
          }
        }
        return {
          sampleIndex: -1,
          correctSampleFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the lookup entries
      Infinity,
      options
    );
  }
  async getKeyPacket(timestamp, options) {
    const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
    const keyFrameSampleIndex = sampleIndex === -1 ? -1 : getRelevantKeyframeIndexForSample(sampleTable, sampleIndex);
    const regularPacket = await this.fetchPacketForSampleIndex(keyFrameSampleIndex, options);
    if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
      return regularPacket;
    }
    return this.performFragmentedLookup(
      null,
      (fragment) => {
        const trackData = fragment.trackData.get(this.internalTrack.id);
        if (!trackData) {
          return { sampleIndex: -1, correctSampleFound: false };
        }
        const index = findLastIndex(trackData.presentationTimestamps, (x) => {
          const sample = trackData.samples[x.sampleIndex];
          return sample.isKeyFrame && x.presentationTimestamp <= timestampInTimescale;
        });
        const sampleIndex2 = index !== -1 ? trackData.presentationTimestamps[index].sampleIndex : -1;
        const correctSampleFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
        return { sampleIndex: sampleIndex2, correctSampleFound };
      },
      timestampInTimescale,
      timestampInTimescale,
      options
    );
  }
  async getNextKeyPacket(packet, options) {
    const regularSampleIndex = this.packetToSampleIndex.get(packet);
    if (regularSampleIndex !== void 0) {
      const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
      const nextKeyFrameSampleIndex = getNextKeyframeIndexForSample(sampleTable, regularSampleIndex);
      return this.fetchPacketForSampleIndex(nextKeyFrameSampleIndex, options);
    }
    const locationInFragment = this.packetToFragmentLocation.get(packet);
    if (locationInFragment === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performFragmentedLookup(
      locationInFragment.fragment,
      (fragment) => {
        if (fragment === locationInFragment.fragment) {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          const nextKeyFrameIndex = trackData.samples.findIndex(
            (x, i) => x.isKeyFrame && i > locationInFragment.sampleIndex
          );
          if (nextKeyFrameIndex !== -1) {
            return {
              sampleIndex: nextKeyFrameIndex,
              correctSampleFound: true
            };
          }
        } else {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (trackData && trackData.firstKeyFrameTimestamp !== null) {
            const keyFrameIndex = trackData.samples.findIndex((x) => x.isKeyFrame);
            assert(keyFrameIndex !== -1);
            return {
              sampleIndex: keyFrameIndex,
              correctSampleFound: true
            };
          }
        }
        return {
          sampleIndex: -1,
          correctSampleFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the lookup entries
      Infinity,
      options
    );
  }
  async fetchPacketForSampleIndex(sampleIndex, options) {
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
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.internalTrack.demuxer.reader.requestSlice(
        sampleInfo.sampleOffset,
        sampleInfo.sampleSize
      );
      if (slice instanceof Promise) slice = await slice;
      assert(slice);
      data = readBytes(slice, sampleInfo.sampleSize);
    }
    const timestamp = (sampleInfo.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale;
    const duration = sampleInfo.duration / this.internalTrack.timescale;
    const packet = new EncodedPacket(
      data,
      sampleInfo.isKeyFrame ? "key" : "delta",
      timestamp,
      duration,
      sampleIndex,
      sampleInfo.sampleSize
    );
    this.packetToSampleIndex.set(packet, sampleIndex);
    return packet;
  }
  async fetchPacketInFragment(fragment, sampleIndex, options) {
    if (sampleIndex === -1) {
      return null;
    }
    const trackData = fragment.trackData.get(this.internalTrack.id);
    const fragmentSample = trackData.samples[sampleIndex];
    assert(fragmentSample);
    let data;
    if (options.metadataOnly) {
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.internalTrack.demuxer.reader.requestSlice(
        fragmentSample.byteOffset,
        fragmentSample.byteSize
      );
      if (slice instanceof Promise) slice = await slice;
      assert(slice);
      data = readBytes(slice, fragmentSample.byteSize);
    }
    const timestamp = (fragmentSample.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale;
    const duration = fragmentSample.duration / this.internalTrack.timescale;
    const packet = new EncodedPacket(
      data,
      fragmentSample.isKeyFrame ? "key" : "delta",
      timestamp,
      duration,
      fragment.moofOffset + sampleIndex,
      fragmentSample.byteSize
    );
    this.packetToFragmentLocation.set(packet, { fragment, sampleIndex });
    return packet;
  }
  /** Looks for a packet in the fragments while trying to load as few fragments as possible to retrieve it. */
  async performFragmentedLookup(startFragment, getMatchInFragment, searchTimestamp, latestTimestamp, options) {
    const demuxer = this.internalTrack.demuxer;
    let currentFragment = null;
    let bestFragment = null;
    let bestSampleIndex = -1;
    if (startFragment) {
      const { sampleIndex, correctSampleFound } = getMatchInFragment(startFragment);
      if (correctSampleFound) {
        return this.fetchPacketInFragment(startFragment, sampleIndex, options);
      }
      if (sampleIndex !== -1) {
        bestFragment = startFragment;
        bestSampleIndex = sampleIndex;
      }
    }
    const lookupEntryIndex = binarySearchLessOrEqual(
      this.internalTrack.fragmentLookupTable,
      searchTimestamp,
      (x) => x.timestamp
    );
    const lookupEntry = lookupEntryIndex !== -1 ? this.internalTrack.fragmentLookupTable[lookupEntryIndex] : null;
    const positionCacheIndex = binarySearchLessOrEqual(
      this.internalTrack.fragmentPositionCache,
      searchTimestamp,
      (x) => x.startTimestamp
    );
    const positionCacheEntry = positionCacheIndex !== -1 ? this.internalTrack.fragmentPositionCache[positionCacheIndex] : null;
    const lookupEntryPosition = Math.max(
      lookupEntry?.moofOffset ?? 0,
      positionCacheEntry?.moofOffset ?? 0
    ) || null;
    let currentPos;
    if (!startFragment) {
      currentPos = lookupEntryPosition ?? 0;
    } else {
      if (lookupEntryPosition === null || startFragment.moofOffset >= lookupEntryPosition) {
        currentPos = startFragment.moofOffset + startFragment.moofSize;
        currentFragment = startFragment;
      } else {
        currentPos = lookupEntryPosition;
      }
    }
    while (true) {
      if (currentFragment) {
        const trackData = currentFragment.trackData.get(this.internalTrack.id);
        if (trackData && trackData.startTimestamp > latestTimestamp) {
          break;
        }
      }
      let slice = demuxer.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
      if (slice instanceof Promise) slice = await slice;
      if (!slice) break;
      const boxStartPos = currentPos;
      const boxInfo = readBoxHeader(slice);
      if (!boxInfo) {
        break;
      }
      if (boxInfo.name === "moof") {
        currentFragment = await demuxer.readFragment(boxStartPos);
        const { sampleIndex, correctSampleFound } = getMatchInFragment(currentFragment);
        if (correctSampleFound) {
          return this.fetchPacketInFragment(currentFragment, sampleIndex, options);
        }
        if (sampleIndex !== -1) {
          bestFragment = currentFragment;
          bestSampleIndex = sampleIndex;
        }
      }
      currentPos = boxStartPos + boxInfo.totalSize;
    }
    if (lookupEntry && (!bestFragment || bestFragment.moofOffset < lookupEntry.moofOffset)) {
      const previousLookupEntry = this.internalTrack.fragmentLookupTable[lookupEntryIndex - 1];
      assert(!previousLookupEntry || previousLookupEntry.timestamp < lookupEntry.timestamp);
      const newSearchTimestamp = previousLookupEntry?.timestamp ?? -Infinity;
      return this.performFragmentedLookup(
        null,
        getMatchInFragment,
        newSearchTimestamp,
        latestTimestamp,
        options
      );
    }
    if (bestFragment) {
      return this.fetchPacketInFragment(bestFragment, bestSampleIndex, options);
    }
    return null;
  }
};
var IsobmffVideoTrackBacking = class extends IsobmffTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfigPromise = null;
    this.internalTrack = internalTrack;
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getCodedWidth() {
    return this.internalTrack.info.width;
  }
  getCodedHeight() {
    return this.internalTrack.info.height;
  }
  getRotation() {
    return this.internalTrack.rotation;
  }
  async getColorSpace() {
    return {
      primaries: this.internalTrack.info.colorSpace?.primaries,
      transfer: this.internalTrack.info.colorSpace?.transfer,
      matrix: this.internalTrack.info.colorSpace?.matrix,
      fullRange: this.internalTrack.info.colorSpace?.fullRange
    };
  }
  async canBeTransparent() {
    return false;
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfigPromise ??= (async () => {
      if (this.internalTrack.info.codec === "vp9" && !this.internalTrack.info.vp9CodecInfo) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.vp9CodecInfo = firstPacket && extractVp9CodecInfoFromPacket(firstPacket.data);
      } else if (this.internalTrack.info.codec === "av1" && !this.internalTrack.info.av1CodecInfo) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.av1CodecInfo = firstPacket && extractAv1CodecInfoFromPacket(firstPacket.data);
      }
      return {
        codec: extractVideoCodecString(this.internalTrack.info),
        codedWidth: this.internalTrack.info.width,
        codedHeight: this.internalTrack.info.height,
        description: this.internalTrack.info.codecDescription ?? void 0,
        colorSpace: this.internalTrack.info.colorSpace ?? void 0
      };
    })();
  }
};
var IsobmffAudioTrackBacking = class extends IsobmffTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfig = null;
    this.internalTrack = internalTrack;
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getNumberOfChannels() {
    return this.internalTrack.info.numberOfChannels;
  }
  getSampleRate() {
    return this.internalTrack.info.sampleRate;
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfig ??= {
      codec: extractAudioCodecString(this.internalTrack.info),
      numberOfChannels: this.internalTrack.info.numberOfChannels,
      sampleRate: this.internalTrack.info.sampleRate,
      description: this.internalTrack.info.codecDescription ?? void 0
    };
  }
};
var IsobmffSubtitleTrackBacking = class extends IsobmffTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.internalTrack = internalTrack;
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getCodecPrivate() {
    return this.internalTrack.info.codecPrivateText;
  }
  async *getCues() {
    let packet = await this.getFirstPacket({});
    while (packet) {
      let text = "";
      if (this.internalTrack.info.codec === "webvtt") {
        const dataBytes = new Uint8Array(packet.data);
        const dataSlice = new FileSlice2(
          dataBytes,
          new DataView(dataBytes.buffer, dataBytes.byteOffset, dataBytes.byteLength),
          0,
          0,
          dataBytes.length
        );
        while (dataSlice.remainingLength > 0) {
          const boxHeader = readBoxHeader(dataSlice);
          if (!boxHeader) break;
          if (boxHeader.name === "vttc") {
            const vttcEnd = dataSlice.filePos + boxHeader.contentSize;
            while (dataSlice.filePos < vttcEnd && dataSlice.remainingLength > 0) {
              const innerBox = readBoxHeader(dataSlice);
              if (!innerBox) break;
              if (innerBox.name === "payl") {
                const textBytes = readBytes(dataSlice, innerBox.contentSize);
                const decoder = new TextDecoder("utf-8");
                text += decoder.decode(textBytes);
              } else {
                dataSlice.skip(innerBox.contentSize);
              }
            }
          } else if (boxHeader.name === "vtte") {
            dataSlice.skip(boxHeader.contentSize);
          } else {
            dataSlice.skip(boxHeader.contentSize);
          }
        }
      } else {
        const decoder = new TextDecoder("utf-8");
        text = decoder.decode(packet.data);
      }
      if (text) {
        yield {
          timestamp: packet.timestamp,
          duration: packet.duration,
          text
        };
      }
      packet = await this.getNextPacket(packet, {});
    }
  }
};
var getSampleIndexForTimestamp = (sampleTable, timescaleUnits) => {
  if (sampleTable.presentationTimestamps) {
    const index = binarySearchLessOrEqual(
      sampleTable.presentationTimestamps,
      timescaleUnits,
      (x) => x.presentationTimestamp
    );
    if (index === -1) {
      return -1;
    }
    return sampleTable.presentationTimestamps[index].sampleIndex;
  } else {
    const index = binarySearchLessOrEqual(
      sampleTable.sampleTimingEntries,
      timescaleUnits,
      (x) => x.startDecodeTimestamp
    );
    if (index === -1) {
      return -1;
    }
    const entry = sampleTable.sampleTimingEntries[index];
    return entry.startIndex + Math.min(Math.floor((timescaleUnits - entry.startDecodeTimestamp) / entry.delta), entry.count - 1);
  }
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
  if (offsetEntry && sampleIndex - offsetEntry.startIndex < offsetEntry.count) {
    presentationTimestamp += offsetEntry.offset;
  }
  const sampleSize = sampleTable.sampleSizes[Math.min(sampleIndex, sampleTable.sampleSizes.length - 1)];
  const chunkEntryIndex = binarySearchLessOrEqual(sampleTable.sampleToChunk, sampleIndex, (x) => x.startSampleIndex);
  const chunkEntry = sampleTable.sampleToChunk[chunkEntryIndex];
  assert(chunkEntry);
  const chunkIndex = chunkEntry.startChunkIndex + Math.floor((sampleIndex - chunkEntry.startSampleIndex) / chunkEntry.samplesPerChunk);
  const chunkOffset = sampleTable.chunkOffsets[chunkIndex];
  const startSampleIndexOfChunk = chunkEntry.startSampleIndex + (chunkIndex - chunkEntry.startChunkIndex) * chunkEntry.samplesPerChunk;
  let chunkSize = 0;
  let sampleOffset = chunkOffset;
  if (sampleTable.sampleSizes.length === 1) {
    sampleOffset += sampleSize * (sampleIndex - startSampleIndexOfChunk);
    chunkSize += sampleSize * chunkEntry.samplesPerChunk;
  } else {
    for (let i = startSampleIndexOfChunk; i < startSampleIndexOfChunk + chunkEntry.samplesPerChunk; i++) {
      const sampleSize2 = sampleTable.sampleSizes[i];
      if (i < sampleIndex) {
        sampleOffset += sampleSize2;
      }
      chunkSize += sampleSize2;
    }
  }
  let duration = timingEntry.delta;
  if (sampleTable.presentationTimestamps) {
    const presentationIndex = sampleTable.presentationTimestampIndexMap[sampleIndex];
    assert(presentationIndex !== void 0);
    if (presentationIndex < sampleTable.presentationTimestamps.length - 1) {
      const nextEntry = sampleTable.presentationTimestamps[presentationIndex + 1];
      const nextPresentationTimestamp = nextEntry.presentationTimestamp;
      duration = nextPresentationTimestamp - presentationTimestamp;
    }
  }
  return {
    presentationTimestamp,
    duration,
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
var extractRotationFromMatrix = (matrix) => {
  const [m11, , , m21] = matrix;
  const scaleX = Math.hypot(m11, m21);
  const cosTheta = m11 / scaleX;
  const sinTheta = m21 / scaleX;
  const result = -Math.atan2(sinTheta, cosTheta) * (180 / Math.PI);
  if (!Number.isFinite(result)) {
    return 0;
  }
  return result;
};
var sampleTableIsEmpty = (sampleTable) => {
  return sampleTable.sampleSizes.length === 0;
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
var EBMLUnicodeString = class {
  constructor(value) {
    this.value = value;
  }
};
var LEVEL_0_EBML_IDS = [
  440786851 /* EBML */,
  408125543 /* Segment */
];
var LEVEL_1_EBML_IDS = [
  290298740 /* SeekHead */,
  357149030 /* Info */,
  524531317 /* Cluster */,
  374648427 /* Tracks */,
  475249515 /* Cues */,
  423732329 /* Attachments */,
  272869232 /* Chapters */,
  307544935 /* Tags */
];
var LEVEL_0_AND_1_EBML_IDS = [
  ...LEVEL_0_EBML_IDS,
  ...LEVEL_1_EBML_IDS
];
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
var measureUnsignedBigInt = (value) => {
  if (value < 1n << 8n) {
    return 1;
  } else if (value < 1n << 16n) {
    return 2;
  } else if (value < 1n << 24n) {
    return 3;
  } else if (value < 1n << 32n) {
    return 4;
  } else if (value < 1n << 40n) {
    return 5;
  } else if (value < 1n << 48n) {
    return 6;
  } else if (value < 1n << 56n) {
    return 7;
  } else {
    return 8;
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
var measureVarInt = (value) => {
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
    throw new Error("EBML varint size not supported " + value);
  }
};
var EBMLWriter = class {
  constructor(writer) {
    this.writer = writer;
    this.helper = new Uint8Array(8);
    this.helperView = new DataView(this.helper.buffer);
    /**
     * Stores the position from the start of the file to where EBML elements have been written. This is used to
     * rewrite/edit elements that were already added before, and to measure sizes of things.
     */
    this.offsets = /* @__PURE__ */ new WeakMap();
    /** Same as offsets, but stores position where the element's data starts (after ID and size fields). */
    this.dataOffsets = /* @__PURE__ */ new WeakMap();
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
        throw new Error("Bad unsigned int size " + width);
    }
    this.writer.write(this.helper.subarray(0, pos));
  }
  writeUnsignedBigInt(value, width = measureUnsignedBigInt(value)) {
    let pos = 0;
    for (let i = width - 1; i >= 0; i--) {
      this.helperView.setUint8(pos++, Number(value >> BigInt(i * 8) & 0xffn));
    }
    this.writer.write(this.helper.subarray(0, pos));
  }
  writeSignedInt(value, width = measureSignedInt(value)) {
    if (value < 0) {
      value += 2 ** (width * 8);
    }
    this.writeUnsignedInt(value, width);
  }
  writeVarInt(value, width = measureVarInt(value)) {
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
        throw new Error("Bad EBML varint size " + width);
    }
    this.writer.write(this.helper.subarray(0, pos));
  }
  writeAsciiString(str) {
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
          this.writeVarInt(size, sizeSize);
          this.writer.seek(endPos);
        }
      } else if (typeof data.data === "number") {
        const size = data.size ?? measureUnsignedInt(data.data);
        this.writeVarInt(size);
        this.writeUnsignedInt(data.data, size);
      } else if (typeof data.data === "bigint") {
        const size = data.size ?? measureUnsignedBigInt(data.data);
        this.writeVarInt(size);
        this.writeUnsignedBigInt(data.data, size);
      } else if (typeof data.data === "string") {
        this.writeVarInt(data.data.length);
        this.writeAsciiString(data.data);
      } else if (data.data instanceof Uint8Array) {
        this.writeVarInt(data.data.byteLength, data.size);
        this.writer.write(data.data);
      } else if (data.data instanceof EBMLFloat32) {
        this.writeVarInt(4);
        this.writeFloat32(data.data.value);
      } else if (data.data instanceof EBMLFloat64) {
        this.writeVarInt(8);
        this.writeFloat64(data.data.value);
      } else if (data.data instanceof EBMLSignedInt) {
        const size = data.size ?? measureSignedInt(data.data.value);
        this.writeVarInt(size);
        this.writeSignedInt(data.data.value, size);
      } else if (data.data instanceof EBMLUnicodeString) {
        const bytes2 = textEncoder.encode(data.data.value);
        this.writeVarInt(bytes2.length);
        this.writer.write(bytes2);
      } else {
        assertNever(data.data);
      }
    }
  }
};
var MAX_VAR_INT_SIZE = 8;
var MIN_HEADER_SIZE = 2;
var MAX_HEADER_SIZE = 2 * MAX_VAR_INT_SIZE;
var readVarIntSize = (slice) => {
  const firstByte = readU8(slice);
  slice.skip(-1);
  if (firstByte === 0) {
    return null;
  }
  let width = 1;
  let mask = 128;
  while ((firstByte & mask) === 0) {
    width++;
    mask >>= 1;
  }
  return width;
};
var readVarInt = (slice) => {
  const firstByte = readU8(slice);
  if (firstByte === 0) {
    return null;
  }
  let width = 1;
  let mask = 1 << 7;
  while ((firstByte & mask) === 0) {
    width++;
    mask >>= 1;
  }
  let value = firstByte & mask - 1;
  for (let i = 1; i < width; i++) {
    value *= 1 << 8;
    value += readU8(slice);
  }
  return value;
};
var readUnsignedInt = (slice, width) => {
  if (width < 1 || width > 8) {
    throw new Error("Bad unsigned int size " + width);
  }
  let value = 0;
  for (let i = 0; i < width; i++) {
    value *= 1 << 8;
    value += readU8(slice);
  }
  return value;
};
var readUnsignedBigInt = (slice, width) => {
  if (width < 1) {
    throw new Error("Bad unsigned int size " + width);
  }
  let value = 0n;
  for (let i = 0; i < width; i++) {
    value <<= 8n;
    value += BigInt(readU8(slice));
  }
  return value;
};
var readSignedInt = (slice, width) => {
  let value = readUnsignedInt(slice, width);
  if (value & 1 << width * 8 - 1) {
    value -= 2 ** (width * 8);
  }
  return value;
};
var readElementId = (slice) => {
  const size = readVarIntSize(slice);
  if (size === null) {
    return null;
  }
  const id = readUnsignedInt(slice, size);
  return id;
};
var readElementSize = (slice) => {
  let size = readU8(slice);
  if (size === 255) {
    size = null;
  } else {
    slice.skip(-1);
    size = readVarInt(slice);
    if (size === 72057594037927940) {
      size = null;
    }
  }
  return size;
};
var readElementHeader = (slice) => {
  const id = readElementId(slice);
  if (id === null) {
    return null;
  }
  const size = readElementSize(slice);
  return { id, size };
};
var readAsciiString = (slice, length) => {
  const bytes2 = readBytes(slice, length);
  let strLength = 0;
  while (strLength < length && bytes2[strLength] !== 0) {
    strLength += 1;
  }
  return String.fromCharCode(...bytes2.subarray(0, strLength));
};
var readUnicodeString = (slice, length) => {
  const bytes2 = readBytes(slice, length);
  let strLength = 0;
  while (strLength < length && bytes2[strLength] !== 0) {
    strLength += 1;
  }
  return textDecoder.decode(bytes2.subarray(0, strLength));
};
var readFloat = (slice, width) => {
  if (width === 0) {
    return 0;
  }
  if (width !== 4 && width !== 8) {
    throw new Error("Bad float size " + width);
  }
  return width === 4 ? readF32Be(slice) : readF64Be(slice);
};
var searchForNextElementId = async (reader, startPos, ids, until) => {
  const idsSet = new Set(ids);
  let currentPos = startPos;
  while (until === null || currentPos < until) {
    let slice = reader.requestSliceRange(currentPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) break;
    const elementHeader = readElementHeader(slice);
    if (!elementHeader) {
      break;
    }
    if (idsSet.has(elementHeader.id)) {
      return { pos: currentPos, found: true };
    }
    assertDefinedSize(elementHeader.size);
    currentPos = slice.filePos + elementHeader.size;
  }
  return { pos: until !== null && until > currentPos ? until : currentPos, found: false };
};
var resync = async (reader, startPos, ids, until) => {
  const CHUNK_SIZE = 2 ** 16;
  const idsSet = new Set(ids);
  let currentPos = startPos;
  while (currentPos < until) {
    let slice = reader.requestSliceRange(currentPos, 0, Math.min(CHUNK_SIZE, until - currentPos));
    if (slice instanceof Promise) slice = await slice;
    if (!slice) break;
    if (slice.length < MAX_VAR_INT_SIZE) break;
    for (let i = 0; i < slice.length - MAX_VAR_INT_SIZE; i++) {
      slice.filePos = currentPos;
      const elementId = readElementId(slice);
      if (elementId !== null && idsSet.has(elementId)) {
        return currentPos;
      }
      currentPos++;
    }
  }
  return null;
};
var CODEC_STRING_MAP = {
  "avc": "V_MPEG4/ISO/AVC",
  "hevc": "V_MPEGH/ISO/HEVC",
  "vp8": "V_VP8",
  "vp9": "V_VP9",
  "av1": "V_AV1",
  "mpeg4": "V_MPEG4/ISO/ASP",
  "aac": "A_AAC",
  "mp3": "A_MPEG/L3",
  "opus": "A_OPUS",
  "vorbis": "A_VORBIS",
  "flac": "A_FLAC",
  "ac3": "A_AC3",
  "eac3": "A_EAC3",
  "pcm-u8": "A_PCM/INT/LIT",
  "pcm-s16": "A_PCM/INT/LIT",
  "pcm-s16be": "A_PCM/INT/BIG",
  "pcm-s24": "A_PCM/INT/LIT",
  "pcm-s24be": "A_PCM/INT/BIG",
  "pcm-s32": "A_PCM/INT/LIT",
  "pcm-s32be": "A_PCM/INT/BIG",
  "pcm-f32": "A_PCM/FLOAT/IEEE",
  "pcm-f64": "A_PCM/FLOAT/IEEE",
  "webvtt": "S_TEXT/WEBVTT",
  "srt": "S_TEXT/UTF8",
  "ass": "S_TEXT/ASS",
  "ssa": "S_TEXT/SSA"
};
function assertDefinedSize(size) {
  if (size === null) {
    throw new Error("Undefined element size is used in a place where it is not supported.");
  }
}

// src/matroska/matroska-misc.ts
var buildMatroskaMimeType = (info) => {
  const base = info.hasVideo ? "video/" : info.hasAudio ? "audio/" : "application/";
  let string = base + (info.isWebM ? "webm" : "x-matroska");
  if (info.codecStrings.length > 0) {
    const uniqueCodecMimeTypes = [...new Set(info.codecStrings.filter(Boolean))];
    string += `; codecs="${uniqueCodecMimeTypes.join(", ")}"`;
  }
  return string;
};

// src/matroska/matroska-demuxer.ts
var METADATA_ELEMENTS = [
  { id: 290298740 /* SeekHead */, flag: "seekHeadSeen" },
  { id: 357149030 /* Info */, flag: "infoSeen" },
  { id: 374648427 /* Tracks */, flag: "tracksSeen" },
  { id: 475249515 /* Cues */, flag: "cuesSeen" }
];
var MAX_RESYNC_LENGTH = 10 * 2 ** 20;
var MatroskaDemuxer = class extends Demuxer {
  constructor(input) {
    super(input);
    this.readMetadataPromise = null;
    this.segments = [];
    this.currentSegment = null;
    this.currentTrack = null;
    this.currentCluster = null;
    this.currentBlock = null;
    this.currentBlockAdditional = null;
    this.currentCueTime = null;
    this.currentDecodingInstruction = null;
    this.currentTagTargetIsMovie = true;
    this.currentSimpleTagName = null;
    this.currentAttachedFile = null;
    this.isWebM = false;
    this.reader = input._reader;
  }
  async computeDuration() {
    const tracks = await this.getTracks();
    const trackDurations = await Promise.all(tracks.map((x) => x.computeDuration()));
    return Math.max(0, ...trackDurations);
  }
  async getTracks() {
    await this.readMetadata();
    return this.segments.flatMap((segment) => segment.tracks.map((track) => track.inputTrack));
  }
  async getMimeType() {
    await this.readMetadata();
    const tracks = await this.getTracks();
    const codecStrings = await Promise.all(tracks.map((x) => x.getCodecParameterString()));
    return buildMatroskaMimeType({
      isWebM: this.isWebM,
      hasVideo: this.segments.some((segment) => segment.tracks.some((x) => x.info?.type === "video")),
      hasAudio: this.segments.some((segment) => segment.tracks.some((x) => x.info?.type === "audio")),
      codecStrings: codecStrings.filter(Boolean)
    });
  }
  async getMetadataTags() {
    await this.readMetadata();
    for (const segment of this.segments) {
      if (!segment.metadataTagsCollected) {
        if (this.reader.fileSize !== null) {
          await this.loadSegmentMetadata(segment);
        } else {
        }
        segment.metadataTagsCollected = true;
      }
    }
    let metadataTags = {};
    for (const segment of this.segments) {
      metadataTags = { ...metadataTags, ...segment.metadataTags };
    }
    return metadataTags;
  }
  readMetadata() {
    return this.readMetadataPromise ??= (async () => {
      let currentPos = 0;
      while (true) {
        let slice = this.reader.requestSliceRange(currentPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
        if (slice instanceof Promise) slice = await slice;
        if (!slice) break;
        const header = readElementHeader(slice);
        if (!header) {
          break;
        }
        const id = header.id;
        let size = header.size;
        const dataStartPos = slice.filePos;
        if (id === 440786851 /* EBML */) {
          assertDefinedSize(size);
          let slice2 = this.reader.requestSlice(dataStartPos, size);
          if (slice2 instanceof Promise) slice2 = await slice2;
          if (!slice2) break;
          this.readContiguousElements(slice2);
        } else if (id === 408125543 /* Segment */) {
          await this.readSegment(dataStartPos, size);
          if (size === null) {
            break;
          }
          if (this.reader.fileSize === null) {
            break;
          }
        } else if (id === 524531317 /* Cluster */) {
          if (this.reader.fileSize === null) {
            break;
          }
          if (size === null) {
            const nextElementPos = await searchForNextElementId(
              this.reader,
              dataStartPos,
              LEVEL_0_AND_1_EBML_IDS,
              this.reader.fileSize
            );
            size = nextElementPos.pos - dataStartPos;
          }
          const lastSegment = last(this.segments);
          if (lastSegment) {
            lastSegment.elementEndPos = dataStartPos + size;
          }
        }
        assertDefinedSize(size);
        currentPos = dataStartPos + size;
      }
    })();
  }
  async readSegment(segmentDataStart, dataSize) {
    this.currentSegment = {
      seekHeadSeen: false,
      infoSeen: false,
      tracksSeen: false,
      cuesSeen: false,
      tagsSeen: false,
      attachmentsSeen: false,
      timestampScale: -1,
      timestampFactor: -1,
      duration: -1,
      seekEntries: [],
      tracks: [],
      cuePoints: [],
      dataStartPos: segmentDataStart,
      elementEndPos: dataSize === null ? null : segmentDataStart + dataSize,
      clusterSeekStartPos: segmentDataStart,
      lastReadCluster: null,
      metadataTags: {},
      metadataTagsCollected: false
    };
    this.segments.push(this.currentSegment);
    let currentPos = segmentDataStart;
    while (this.currentSegment.elementEndPos === null || currentPos < this.currentSegment.elementEndPos) {
      let slice = this.reader.requestSliceRange(currentPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
      if (slice instanceof Promise) slice = await slice;
      if (!slice) break;
      const elementStartPos = currentPos;
      const header = readElementHeader(slice);
      if (!header || !LEVEL_1_EBML_IDS.includes(header.id) && header.id !== 236 /* Void */) {
        const nextPos = await resync(
          this.reader,
          elementStartPos,
          LEVEL_1_EBML_IDS,
          Math.min(this.currentSegment.elementEndPos ?? Infinity, elementStartPos + MAX_RESYNC_LENGTH)
        );
        if (nextPos) {
          currentPos = nextPos;
          continue;
        } else {
          break;
        }
      }
      const { id, size } = header;
      const dataStartPos = slice.filePos;
      const metadataElementIndex = METADATA_ELEMENTS.findIndex((x) => x.id === id);
      if (metadataElementIndex !== -1) {
        const field = METADATA_ELEMENTS[metadataElementIndex].flag;
        this.currentSegment[field] = true;
        assertDefinedSize(size);
        let slice2 = this.reader.requestSlice(dataStartPos, size);
        if (slice2 instanceof Promise) slice2 = await slice2;
        if (slice2) {
          this.readContiguousElements(slice2);
        }
      } else if (id === 307544935 /* Tags */ || id === 423732329 /* Attachments */) {
        if (id === 307544935 /* Tags */) {
          this.currentSegment.tagsSeen = true;
        } else {
          this.currentSegment.attachmentsSeen = true;
        }
        assertDefinedSize(size);
        let slice2 = this.reader.requestSlice(dataStartPos, size);
        if (slice2 instanceof Promise) slice2 = await slice2;
        if (slice2) {
          this.readContiguousElements(slice2);
        }
      } else if (id === 524531317 /* Cluster */) {
        this.currentSegment.clusterSeekStartPos = elementStartPos;
        break;
      }
      if (size === null) {
        break;
      } else {
        currentPos = dataStartPos + size;
      }
    }
    this.currentSegment.seekEntries.sort((a, b) => a.segmentPosition - b.segmentPosition);
    if (this.reader.fileSize !== null) {
      for (const seekEntry of this.currentSegment.seekEntries) {
        const target = METADATA_ELEMENTS.find((x) => x.id === seekEntry.id);
        if (!target) {
          continue;
        }
        if (this.currentSegment[target.flag]) continue;
        let slice = this.reader.requestSliceRange(
          segmentDataStart + seekEntry.segmentPosition,
          MIN_HEADER_SIZE,
          MAX_HEADER_SIZE
        );
        if (slice instanceof Promise) slice = await slice;
        if (!slice) continue;
        const header = readElementHeader(slice);
        if (!header) continue;
        const { id, size } = header;
        if (id !== target.id) continue;
        assertDefinedSize(size);
        this.currentSegment[target.flag] = true;
        let dataSlice = this.reader.requestSlice(slice.filePos, size);
        if (dataSlice instanceof Promise) dataSlice = await dataSlice;
        if (!dataSlice) continue;
        this.readContiguousElements(dataSlice);
      }
    }
    if (this.currentSegment.timestampScale === -1) {
      this.currentSegment.timestampScale = 1e6;
      this.currentSegment.timestampFactor = 1e9 / 1e6;
    }
    this.currentSegment.tracks.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    const idToTrack = new Map(this.currentSegment.tracks.map((x) => [x.id, x]));
    for (const cuePoint of this.currentSegment.cuePoints) {
      const track = idToTrack.get(cuePoint.trackId);
      if (track) {
        track.cuePoints.push(cuePoint);
      }
    }
    for (const track of this.currentSegment.tracks) {
      track.cuePoints.sort((a, b) => a.time - b.time);
      for (let i = 0; i < track.cuePoints.length - 1; i++) {
        const cuePoint1 = track.cuePoints[i];
        const cuePoint2 = track.cuePoints[i + 1];
        if (cuePoint1.time === cuePoint2.time) {
          track.cuePoints.splice(i + 1, 1);
          i--;
        }
      }
    }
    let trackWithMostCuePoints = null;
    let maxCuePointCount = -Infinity;
    for (const track of this.currentSegment.tracks) {
      if (track.cuePoints.length > maxCuePointCount) {
        maxCuePointCount = track.cuePoints.length;
        trackWithMostCuePoints = track;
      }
    }
    for (const track of this.currentSegment.tracks) {
      if (track.cuePoints.length === 0) {
        track.cuePoints = trackWithMostCuePoints.cuePoints;
      }
    }
    this.currentSegment = null;
  }
  async readCluster(startPos, segment) {
    if (segment.lastReadCluster?.elementStartPos === startPos) {
      return segment.lastReadCluster;
    }
    let headerSlice = this.reader.requestSliceRange(startPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
    if (headerSlice instanceof Promise) headerSlice = await headerSlice;
    assert(headerSlice);
    const elementStartPos = startPos;
    const elementHeader = readElementHeader(headerSlice);
    assert(elementHeader);
    const id = elementHeader.id;
    assert(id === 524531317 /* Cluster */);
    let size = elementHeader.size;
    const dataStartPos = headerSlice.filePos;
    if (size === null) {
      const nextElementPos = await searchForNextElementId(
        this.reader,
        dataStartPos,
        LEVEL_0_AND_1_EBML_IDS,
        segment.elementEndPos
      );
      size = nextElementPos.pos - dataStartPos;
    }
    let dataSlice = this.reader.requestSlice(dataStartPos, size);
    if (dataSlice instanceof Promise) dataSlice = await dataSlice;
    const cluster = {
      segment,
      elementStartPos,
      elementEndPos: dataStartPos + size,
      dataStartPos,
      timestamp: -1,
      trackData: /* @__PURE__ */ new Map()
    };
    this.currentCluster = cluster;
    if (dataSlice) {
      this.readContiguousElements(dataSlice);
    }
    for (const [, trackData] of cluster.trackData) {
      const track = trackData.track;
      assert(trackData.blocks.length > 0);
      let blockReferencesExist = false;
      let hasLacedBlocks = false;
      for (let i = 0; i < trackData.blocks.length; i++) {
        const block = trackData.blocks[i];
        block.timestamp += cluster.timestamp;
        blockReferencesExist ||= block.referencedTimestamps.length > 0;
        hasLacedBlocks ||= block.lacing !== 0 /* None */;
      }
      if (blockReferencesExist) {
        trackData.blocks = sortBlocksByReferences(trackData.blocks);
      }
      trackData.presentationTimestamps = trackData.blocks.map((block, i) => ({ timestamp: block.timestamp, blockIndex: i })).sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 0; i < trackData.presentationTimestamps.length; i++) {
        const currentEntry = trackData.presentationTimestamps[i];
        const currentBlock = trackData.blocks[currentEntry.blockIndex];
        if (trackData.firstKeyFrameTimestamp === null && currentBlock.isKeyFrame) {
          trackData.firstKeyFrameTimestamp = currentBlock.timestamp;
        }
        if (i < trackData.presentationTimestamps.length - 1) {
          const nextEntry = trackData.presentationTimestamps[i + 1];
          currentBlock.duration = nextEntry.timestamp - currentBlock.timestamp;
        } else if (currentBlock.duration === 0) {
          if (track.defaultDuration != null) {
            if (currentBlock.lacing === 0 /* None */) {
              currentBlock.duration = track.defaultDuration;
            } else {
            }
          }
        }
      }
      if (hasLacedBlocks) {
        this.expandLacedBlocks(trackData.blocks, track);
        trackData.presentationTimestamps = trackData.blocks.map((block, i) => ({ timestamp: block.timestamp, blockIndex: i })).sort((a, b) => a.timestamp - b.timestamp);
      }
      const firstBlock = trackData.blocks[trackData.presentationTimestamps[0].blockIndex];
      const lastBlock = trackData.blocks[last(trackData.presentationTimestamps).blockIndex];
      trackData.startTimestamp = firstBlock.timestamp;
      trackData.endTimestamp = lastBlock.timestamp + lastBlock.duration;
      const insertionIndex = binarySearchLessOrEqual(
        track.clusterPositionCache,
        trackData.startTimestamp,
        (x) => x.startTimestamp
      );
      if (insertionIndex === -1 || track.clusterPositionCache[insertionIndex].elementStartPos !== elementStartPos) {
        track.clusterPositionCache.splice(insertionIndex + 1, 0, {
          elementStartPos: cluster.elementStartPos,
          startTimestamp: trackData.startTimestamp
        });
      }
    }
    segment.lastReadCluster = cluster;
    return cluster;
  }
  getTrackDataInCluster(cluster, trackNumber) {
    let trackData = cluster.trackData.get(trackNumber);
    if (!trackData) {
      const track = cluster.segment.tracks.find((x) => x.id === trackNumber);
      if (!track) {
        return null;
      }
      trackData = {
        track,
        startTimestamp: 0,
        endTimestamp: 0,
        firstKeyFrameTimestamp: null,
        blocks: [],
        presentationTimestamps: []
      };
      cluster.trackData.set(trackNumber, trackData);
    }
    return trackData;
  }
  expandLacedBlocks(blocks, track) {
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const originalBlock = blocks[blockIndex];
      if (originalBlock.lacing === 0 /* None */) {
        continue;
      }
      if (!originalBlock.decoded) {
        originalBlock.data = this.decodeBlockData(track, originalBlock.data);
        originalBlock.decoded = true;
      }
      const slice = FileSlice2.tempFromBytes(originalBlock.data);
      const frameSizes = [];
      const frameCount = readU8(slice) + 1;
      switch (originalBlock.lacing) {
        case 1 /* Xiph */:
          {
            let totalUsedSize = 0;
            for (let i = 0; i < frameCount - 1; i++) {
              let frameSize = 0;
              while (slice.bufferPos < slice.length) {
                const value = readU8(slice);
                frameSize += value;
                if (value < 255) {
                  frameSizes.push(frameSize);
                  totalUsedSize += frameSize;
                  break;
                }
              }
            }
            frameSizes.push(slice.length - (slice.bufferPos + totalUsedSize));
          }
          ;
          break;
        case 2 /* FixedSize */:
          {
            const totalDataSize = slice.length - 1;
            const frameSize = Math.floor(totalDataSize / frameCount);
            for (let i = 0; i < frameCount; i++) {
              frameSizes.push(frameSize);
            }
          }
          ;
          break;
        case 3 /* Ebml */:
          {
            const firstResult = readVarInt(slice);
            assert(firstResult !== null);
            let currentSize = firstResult;
            frameSizes.push(currentSize);
            let totalUsedSize = currentSize;
            for (let i = 1; i < frameCount - 1; i++) {
              const startPos = slice.bufferPos;
              const diffResult = readVarInt(slice);
              assert(diffResult !== null);
              const unsignedDiff = diffResult;
              const width = slice.bufferPos - startPos;
              const bias = (1 << width * 7 - 1) - 1;
              const diff = unsignedDiff - bias;
              currentSize += diff;
              frameSizes.push(currentSize);
              totalUsedSize += currentSize;
            }
            frameSizes.push(slice.length - (slice.bufferPos + totalUsedSize));
          }
          ;
          break;
        default:
          assert(false);
      }
      assert(frameSizes.length === frameCount);
      blocks.splice(blockIndex, 1);
      for (let i = 0; i < frameCount; i++) {
        const frameSize = frameSizes[i];
        const frameData = readBytes(slice, frameSize);
        const blockDuration = originalBlock.duration || frameCount * (track.defaultDuration ?? 0);
        const frameTimestamp = originalBlock.timestamp + blockDuration * i / frameCount;
        const frameDuration = blockDuration / frameCount;
        blocks.splice(blockIndex + i, 0, {
          timestamp: frameTimestamp,
          duration: frameDuration,
          isKeyFrame: originalBlock.isKeyFrame,
          referencedTimestamps: originalBlock.referencedTimestamps,
          data: frameData,
          lacing: 0 /* None */,
          decoded: true,
          mainAdditional: originalBlock.mainAdditional
        });
      }
      blockIndex += frameCount;
      blockIndex--;
    }
  }
  async loadSegmentMetadata(segment) {
    for (const seekEntry of segment.seekEntries) {
      if (seekEntry.id === 307544935 /* Tags */ && !segment.tagsSeen) {
      } else if (seekEntry.id === 423732329 /* Attachments */ && !segment.attachmentsSeen) {
      } else {
        continue;
      }
      let slice = this.reader.requestSliceRange(
        segment.dataStartPos + seekEntry.segmentPosition,
        MIN_HEADER_SIZE,
        MAX_HEADER_SIZE
      );
      if (slice instanceof Promise) slice = await slice;
      if (!slice) continue;
      const header = readElementHeader(slice);
      if (!header || header.id !== seekEntry.id) continue;
      const { size } = header;
      assertDefinedSize(size);
      assert(!this.currentSegment);
      this.currentSegment = segment;
      let dataSlice = this.reader.requestSlice(slice.filePos, size);
      if (dataSlice instanceof Promise) dataSlice = await dataSlice;
      if (dataSlice) {
        this.readContiguousElements(dataSlice);
      }
      this.currentSegment = null;
      if (seekEntry.id === 307544935 /* Tags */) {
        segment.tagsSeen = true;
      } else if (seekEntry.id === 423732329 /* Attachments */) {
        segment.attachmentsSeen = true;
      }
    }
  }
  readContiguousElements(slice) {
    const startIndex = slice.filePos;
    while (slice.filePos - startIndex <= slice.length - MIN_HEADER_SIZE) {
      const foundElement = this.traverseElement(slice);
      if (!foundElement) {
        break;
      }
    }
  }
  traverseElement(slice) {
    const header = readElementHeader(slice);
    if (!header) {
      return false;
    }
    const { id, size } = header;
    const dataStartPos = slice.filePos;
    assertDefinedSize(size);
    switch (id) {
      case 17026 /* DocType */:
        {
          this.isWebM = readAsciiString(slice, size) === "webm";
        }
        ;
        break;
      case 19899 /* Seek */:
        {
          if (!this.currentSegment) break;
          const seekEntry = { id: -1, segmentPosition: -1 };
          this.currentSegment.seekEntries.push(seekEntry);
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (seekEntry.id === -1 || seekEntry.segmentPosition === -1) {
            this.currentSegment.seekEntries.pop();
          }
        }
        ;
        break;
      case 21419 /* SeekID */:
        {
          const lastSeekEntry = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
          if (!lastSeekEntry) break;
          lastSeekEntry.id = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 21420 /* SeekPosition */:
        {
          const lastSeekEntry = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
          if (!lastSeekEntry) break;
          lastSeekEntry.segmentPosition = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 2807729 /* TimestampScale */:
        {
          if (!this.currentSegment) break;
          this.currentSegment.timestampScale = readUnsignedInt(slice, size);
          this.currentSegment.timestampFactor = 1e9 / this.currentSegment.timestampScale;
        }
        ;
        break;
      case 17545 /* Duration */:
        {
          if (!this.currentSegment) break;
          this.currentSegment.duration = readFloat(slice, size);
        }
        ;
        break;
      case 174 /* TrackEntry */:
        {
          if (!this.currentSegment) break;
          this.currentTrack = {
            id: -1,
            segment: this.currentSegment,
            demuxer: this,
            clusterPositionCache: [],
            cuePoints: [],
            isDefault: false,
            inputTrack: null,
            codecId: null,
            codecPrivate: null,
            defaultDuration: null,
            name: null,
            languageCode: UNDETERMINED_LANGUAGE,
            decodingInstructions: [],
            info: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (this.currentTrack.decodingInstructions.some((instruction) => {
            return instruction.data?.type !== "decompress" || instruction.scope !== 1 /* Block */ || instruction.data.algorithm !== 3 /* HeaderStripping */;
          })) {
            console.warn(`Track #${this.currentTrack.id} has an unsupported content encoding; dropping.`);
            this.currentTrack = null;
          }
          if (this.currentTrack && this.currentTrack.id !== -1 && this.currentTrack.codecId && this.currentTrack.info) {
            const slashIndex = this.currentTrack.codecId.indexOf("/");
            const codecIdWithoutSuffix = slashIndex === -1 ? this.currentTrack.codecId : this.currentTrack.codecId.slice(0, slashIndex);
            if (this.currentTrack.info.type === "video" && this.currentTrack.info.width !== -1 && this.currentTrack.info.height !== -1) {
              if (this.currentTrack.codecId === CODEC_STRING_MAP.avc) {
                this.currentTrack.info.codec = "avc";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (this.currentTrack.codecId === CODEC_STRING_MAP.hevc) {
                this.currentTrack.info.codec = "hevc";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.vp8) {
                this.currentTrack.info.codec = "vp8";
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.vp9) {
                this.currentTrack.info.codec = "vp9";
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.av1) {
                this.currentTrack.info.codec = "av1";
              } else if (this.currentTrack.codecId === CODEC_STRING_MAP.mpeg4) {
                this.currentTrack.info.codec = "mpeg4";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              }
              const videoTrack = this.currentTrack;
              const inputTrack = new InputVideoTrack(this.input, new MatroskaVideoTrackBacking(videoTrack));
              this.currentTrack.inputTrack = inputTrack;
              this.currentSegment.tracks.push(this.currentTrack);
            } else if (this.currentTrack.info.type === "audio" && this.currentTrack.info.numberOfChannels !== -1 && this.currentTrack.info.sampleRate !== -1) {
              if (codecIdWithoutSuffix === CODEC_STRING_MAP.aac) {
                this.currentTrack.info.codec = "aac";
                this.currentTrack.info.aacCodecInfo = {
                  isMpeg2: this.currentTrack.codecId.includes("MPEG2")
                };
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (this.currentTrack.codecId === CODEC_STRING_MAP.mp3) {
                this.currentTrack.info.codec = "mp3";
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.opus) {
                this.currentTrack.info.codec = "opus";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
                this.currentTrack.info.sampleRate = OPUS_SAMPLE_RATE;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.vorbis) {
                this.currentTrack.info.codec = "vorbis";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.flac) {
                this.currentTrack.info.codec = "flac";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.ac3) {
                this.currentTrack.info.codec = "ac3";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.eac3) {
                this.currentTrack.info.codec = "eac3";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (this.currentTrack.codecId === "A_PCM/INT/LIT") {
                if (this.currentTrack.info.bitDepth === 8) {
                  this.currentTrack.info.codec = "pcm-u8";
                } else if (this.currentTrack.info.bitDepth === 16) {
                  this.currentTrack.info.codec = "pcm-s16";
                } else if (this.currentTrack.info.bitDepth === 24) {
                  this.currentTrack.info.codec = "pcm-s24";
                } else if (this.currentTrack.info.bitDepth === 32) {
                  this.currentTrack.info.codec = "pcm-s32";
                }
              } else if (this.currentTrack.codecId === "A_PCM/INT/BIG") {
                if (this.currentTrack.info.bitDepth === 8) {
                  this.currentTrack.info.codec = "pcm-u8";
                } else if (this.currentTrack.info.bitDepth === 16) {
                  this.currentTrack.info.codec = "pcm-s16be";
                } else if (this.currentTrack.info.bitDepth === 24) {
                  this.currentTrack.info.codec = "pcm-s24be";
                } else if (this.currentTrack.info.bitDepth === 32) {
                  this.currentTrack.info.codec = "pcm-s32be";
                }
              } else if (this.currentTrack.codecId === "A_PCM/FLOAT/IEEE") {
                if (this.currentTrack.info.bitDepth === 32) {
                  this.currentTrack.info.codec = "pcm-f32";
                } else if (this.currentTrack.info.bitDepth === 64) {
                  this.currentTrack.info.codec = "pcm-f64";
                }
              }
              const audioTrack = this.currentTrack;
              const inputTrack = new InputAudioTrack(this.input, new MatroskaAudioTrackBacking(audioTrack));
              this.currentTrack.inputTrack = inputTrack;
              this.currentSegment.tracks.push(this.currentTrack);
            } else if (this.currentTrack.info.type === "subtitle") {
              const codecId = this.currentTrack.codecId;
              if (codecId === "S_TEXT/UTF8") {
                this.currentTrack.info.codec = "srt";
              } else if (codecId === "S_TEXT/SSA" || codecId === "S_SSA") {
                this.currentTrack.info.codec = "ssa";
              } else if (codecId === "S_TEXT/ASS" || codecId === "S_ASS") {
                this.currentTrack.info.codec = "ass";
              } else if (codecId === "S_TEXT/WEBVTT" || codecId === "D_WEBVTT" || codecId === "D_WEBVTT/SUBTITLES") {
                this.currentTrack.info.codec = "webvtt";
              }
              if (this.currentTrack.codecPrivate) {
                const decoder = new TextDecoder("utf-8");
                this.currentTrack.info.codecPrivateText = decoder.decode(this.currentTrack.codecPrivate);
              }
              const subtitleTrack = this.currentTrack;
              const inputTrack = new InputSubtitleTrack(this.input, new MatroskaSubtitleTrackBacking(subtitleTrack));
              this.currentTrack.inputTrack = inputTrack;
              this.currentSegment.tracks.push(this.currentTrack);
            }
          }
          this.currentTrack = null;
        }
        ;
        break;
      case 215 /* TrackNumber */:
        {
          if (!this.currentTrack) break;
          this.currentTrack.id = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 131 /* TrackType */:
        {
          if (!this.currentTrack) break;
          const type = readUnsignedInt(slice, size);
          if (type === 1) {
            this.currentTrack.info = {
              type: "video",
              width: -1,
              height: -1,
              rotation: 0,
              codec: null,
              codecDescription: null,
              colorSpace: null,
              alphaMode: false
            };
          } else if (type === 2) {
            this.currentTrack.info = {
              type: "audio",
              numberOfChannels: -1,
              sampleRate: -1,
              bitDepth: -1,
              codec: null,
              codecDescription: null,
              aacCodecInfo: null
            };
          } else if (type === 17) {
            this.currentTrack.info = {
              type: "subtitle",
              codec: null,
              codecPrivateText: null
            };
          }
        }
        ;
        break;
      case 185 /* FlagEnabled */:
        {
          if (!this.currentTrack) break;
          const enabled = readUnsignedInt(slice, size);
          if (!enabled) {
            this.currentSegment.tracks.pop();
            this.currentTrack = null;
          }
        }
        ;
        break;
      case 136 /* FlagDefault */:
        {
          if (!this.currentTrack) break;
          this.currentTrack.isDefault = !!readUnsignedInt(slice, size);
        }
        ;
        break;
      case 134 /* CodecID */:
        {
          if (!this.currentTrack) break;
          this.currentTrack.codecId = readAsciiString(slice, size);
        }
        ;
        break;
      case 25506 /* CodecPrivate */:
        {
          if (!this.currentTrack) break;
          this.currentTrack.codecPrivate = readBytes(slice, size);
        }
        ;
        break;
      case 2352003 /* DefaultDuration */:
        {
          if (!this.currentTrack) break;
          this.currentTrack.defaultDuration = this.currentTrack.segment.timestampFactor * readUnsignedInt(slice, size) / 1e9;
        }
        ;
        break;
      case 21358 /* Name */:
        {
          if (!this.currentTrack) break;
          this.currentTrack.name = readUnicodeString(slice, size);
        }
        ;
        break;
      case 2274716 /* Language */:
        {
          if (!this.currentTrack) break;
          if (this.currentTrack.languageCode !== UNDETERMINED_LANGUAGE) {
            break;
          }
          this.currentTrack.languageCode = readAsciiString(slice, size);
          if (!isIso639Dash2LanguageCode(this.currentTrack.languageCode)) {
            this.currentTrack.languageCode = UNDETERMINED_LANGUAGE;
          }
        }
        ;
        break;
      case 2274717 /* LanguageBCP47 */:
        {
          if (!this.currentTrack) break;
          const bcp47 = readAsciiString(slice, size);
          const languageSubtag = bcp47.split("-")[0];
          if (languageSubtag) {
            this.currentTrack.languageCode = languageSubtag;
          } else {
            this.currentTrack.languageCode = UNDETERMINED_LANGUAGE;
          }
        }
        ;
        break;
      case 224 /* Video */:
        {
          if (this.currentTrack?.info?.type !== "video") break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case 176 /* PixelWidth */:
        {
          if (this.currentTrack?.info?.type !== "video") break;
          this.currentTrack.info.width = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 186 /* PixelHeight */:
        {
          if (this.currentTrack?.info?.type !== "video") break;
          this.currentTrack.info.height = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 21440 /* AlphaMode */:
        {
          if (this.currentTrack?.info?.type !== "video") break;
          this.currentTrack.info.alphaMode = readUnsignedInt(slice, size) === 1;
        }
        ;
        break;
      case 21936 /* Colour */:
        {
          if (this.currentTrack?.info?.type !== "video") break;
          this.currentTrack.info.colorSpace = {};
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case 21937 /* MatrixCoefficients */:
        {
          if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace) break;
          const matrixCoefficients = readUnsignedInt(slice, size);
          const mapped = MATRIX_COEFFICIENTS_MAP_INVERSE[matrixCoefficients] ?? null;
          this.currentTrack.info.colorSpace.matrix = mapped;
        }
        ;
        break;
      case 21945 /* Range */:
        {
          if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace) break;
          this.currentTrack.info.colorSpace.fullRange = readUnsignedInt(slice, size) === 2;
        }
        ;
        break;
      case 21946 /* TransferCharacteristics */:
        {
          if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace) break;
          const transferCharacteristics = readUnsignedInt(slice, size);
          const mapped = TRANSFER_CHARACTERISTICS_MAP_INVERSE[transferCharacteristics] ?? null;
          this.currentTrack.info.colorSpace.transfer = mapped;
        }
        ;
        break;
      case 21947 /* Primaries */:
        {
          if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace) break;
          const primaries = readUnsignedInt(slice, size);
          const mapped = COLOR_PRIMARIES_MAP_INVERSE[primaries] ?? null;
          this.currentTrack.info.colorSpace.primaries = mapped;
        }
        ;
        break;
      case 30320 /* Projection */:
        {
          if (this.currentTrack?.info?.type !== "video") break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case 30325 /* ProjectionPoseRoll */:
        {
          if (this.currentTrack?.info?.type !== "video") break;
          const rotation = readFloat(slice, size);
          const flippedRotation = -rotation;
          try {
            this.currentTrack.info.rotation = normalizeRotation(flippedRotation);
          } catch {
          }
        }
        ;
        break;
      case 225 /* Audio */:
        {
          if (this.currentTrack?.info?.type !== "audio") break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case 181 /* SamplingFrequency */:
        {
          if (this.currentTrack?.info?.type !== "audio") break;
          this.currentTrack.info.sampleRate = readFloat(slice, size);
        }
        ;
        break;
      case 159 /* Channels */:
        {
          if (this.currentTrack?.info?.type !== "audio") break;
          this.currentTrack.info.numberOfChannels = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 25188 /* BitDepth */:
        {
          if (this.currentTrack?.info?.type !== "audio") break;
          this.currentTrack.info.bitDepth = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 187 /* CuePoint */:
        {
          if (!this.currentSegment) break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
          this.currentCueTime = null;
        }
        ;
        break;
      case 179 /* CueTime */:
        {
          this.currentCueTime = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 183 /* CueTrackPositions */:
        {
          if (this.currentCueTime === null) break;
          assert(this.currentSegment);
          const cuePoint = { time: this.currentCueTime, trackId: -1, clusterPosition: -1 };
          this.currentSegment.cuePoints.push(cuePoint);
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (cuePoint.trackId === -1 || cuePoint.clusterPosition === -1) {
            this.currentSegment.cuePoints.pop();
          }
        }
        ;
        break;
      case 247 /* CueTrack */:
        {
          const lastCuePoint = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
          if (!lastCuePoint) break;
          lastCuePoint.trackId = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 241 /* CueClusterPosition */:
        {
          const lastCuePoint = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
          if (!lastCuePoint) break;
          assert(this.currentSegment);
          lastCuePoint.clusterPosition = this.currentSegment.dataStartPos + readUnsignedInt(slice, size);
        }
        ;
        break;
      case 231 /* Timestamp */:
        {
          if (!this.currentCluster) break;
          this.currentCluster.timestamp = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 163 /* SimpleBlock */:
        {
          if (!this.currentCluster) break;
          const trackNumber = readVarInt(slice);
          if (trackNumber === null) break;
          const trackData = this.getTrackDataInCluster(this.currentCluster, trackNumber);
          if (!trackData) break;
          const relativeTimestamp = readI16Be(slice);
          const flags = readU8(slice);
          const isKeyFrame = !!(flags & 128);
          const lacing = flags >> 1 & 3;
          const blockData = readBytes(slice, size - (slice.filePos - dataStartPos));
          const hasDecodingInstructions = trackData.track.decodingInstructions.length > 0;
          trackData.blocks.push({
            timestamp: relativeTimestamp,
            // We'll add the cluster's timestamp to this later
            duration: 0,
            // Will set later
            isKeyFrame,
            referencedTimestamps: [],
            data: blockData,
            lacing,
            decoded: !hasDecodingInstructions,
            mainAdditional: null
          });
        }
        ;
        break;
      case 160 /* BlockGroup */:
        {
          if (!this.currentCluster) break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (this.currentBlock) {
            for (let i = 0; i < this.currentBlock.referencedTimestamps.length; i++) {
              this.currentBlock.referencedTimestamps[i] += this.currentBlock.timestamp;
            }
            this.currentBlock = null;
          }
        }
        ;
        break;
      case 161 /* Block */:
        {
          if (!this.currentCluster) break;
          const trackNumber = readVarInt(slice);
          if (trackNumber === null) break;
          const trackData = this.getTrackDataInCluster(this.currentCluster, trackNumber);
          if (!trackData) break;
          const relativeTimestamp = readI16Be(slice);
          const flags = readU8(slice);
          const lacing = flags >> 1 & 3;
          const blockData = readBytes(slice, size - (slice.filePos - dataStartPos));
          const hasDecodingInstructions = trackData.track.decodingInstructions.length > 0;
          this.currentBlock = {
            timestamp: relativeTimestamp,
            // We'll add the cluster's timestamp to this later
            duration: 0,
            // Will set later
            isKeyFrame: true,
            referencedTimestamps: [],
            data: blockData,
            lacing,
            decoded: !hasDecodingInstructions,
            mainAdditional: null
          };
          trackData.blocks.push(this.currentBlock);
        }
        ;
        break;
      case 30113 /* BlockAdditions */:
        {
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case 166 /* BlockMore */:
        {
          if (!this.currentBlock) break;
          this.currentBlockAdditional = {
            addId: 1,
            data: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (this.currentBlockAdditional.data && this.currentBlockAdditional.addId === 1) {
            this.currentBlock.mainAdditional = this.currentBlockAdditional.data;
          }
          this.currentBlockAdditional = null;
        }
        ;
        break;
      case 165 /* BlockAdditional */:
        {
          if (!this.currentBlockAdditional) break;
          this.currentBlockAdditional.data = readBytes(slice, size);
        }
        ;
        break;
      case 238 /* BlockAddID */:
        {
          if (!this.currentBlockAdditional) break;
          this.currentBlockAdditional.addId = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 155 /* BlockDuration */:
        {
          if (!this.currentBlock) break;
          this.currentBlock.duration = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 251 /* ReferenceBlock */:
        {
          if (!this.currentBlock) break;
          this.currentBlock.isKeyFrame = false;
          const relativeTimestamp = readSignedInt(slice, size);
          this.currentBlock.referencedTimestamps.push(relativeTimestamp);
        }
        ;
        break;
      case 29555 /* Tag */:
        {
          this.currentTagTargetIsMovie = true;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case 25536 /* Targets */:
        {
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case 26826 /* TargetTypeValue */:
        {
          const targetTypeValue = readUnsignedInt(slice, size);
          if (targetTypeValue !== 50) {
            this.currentTagTargetIsMovie = false;
          }
        }
        ;
        break;
      case 25541 /* TagTrackUID */:
      case 25545 /* TagEditionUID */:
      case 25540 /* TagChapterUID */:
      case 25542 /* TagAttachmentUID */:
        {
          this.currentTagTargetIsMovie = false;
        }
        ;
        break;
      case 26568 /* SimpleTag */:
        {
          if (!this.currentTagTargetIsMovie) break;
          this.currentSimpleTagName = null;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case 17827 /* TagName */:
        {
          this.currentSimpleTagName = readUnicodeString(slice, size);
        }
        ;
        break;
      case 17543 /* TagString */:
        {
          if (!this.currentSimpleTagName) break;
          const value = readUnicodeString(slice, size);
          this.processTagValue(this.currentSimpleTagName, value);
        }
        ;
        break;
      case 17541 /* TagBinary */:
        {
          if (!this.currentSimpleTagName) break;
          const value = readBytes(slice, size);
          this.processTagValue(this.currentSimpleTagName, value);
        }
        ;
        break;
      case 24999 /* AttachedFile */:
        {
          if (!this.currentSegment) break;
          this.currentAttachedFile = {
            fileUid: null,
            fileName: null,
            fileMediaType: null,
            fileData: null,
            fileDescription: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
          const tags = this.currentSegment.metadataTags;
          if (this.currentAttachedFile.fileUid && this.currentAttachedFile.fileData) {
            tags.raw ??= {};
            tags.raw[this.currentAttachedFile.fileUid.toString()] = new AttachedFile(
              this.currentAttachedFile.fileData,
              this.currentAttachedFile.fileMediaType ?? void 0,
              this.currentAttachedFile.fileName ?? void 0,
              this.currentAttachedFile.fileDescription ?? void 0
            );
          }
          if (this.currentAttachedFile.fileMediaType?.startsWith("image/") && this.currentAttachedFile.fileData) {
            const fileName = this.currentAttachedFile.fileName;
            let kind = "unknown";
            if (fileName) {
              const lowerName = fileName.toLowerCase();
              if (lowerName.startsWith("cover.")) {
                kind = "coverFront";
              } else if (lowerName.startsWith("back.")) {
                kind = "coverBack";
              }
            }
            tags.images ??= [];
            tags.images.push({
              data: this.currentAttachedFile.fileData,
              mimeType: this.currentAttachedFile.fileMediaType,
              kind,
              name: this.currentAttachedFile.fileName ?? void 0,
              description: this.currentAttachedFile.fileDescription ?? void 0
            });
          }
          this.currentAttachedFile = null;
        }
        ;
        break;
      case 18094 /* FileUID */:
        {
          if (!this.currentAttachedFile) break;
          this.currentAttachedFile.fileUid = readUnsignedBigInt(slice, size);
        }
        ;
        break;
      case 18030 /* FileName */:
        {
          if (!this.currentAttachedFile) break;
          this.currentAttachedFile.fileName = readUnicodeString(slice, size);
        }
        ;
        break;
      case 18016 /* FileMediaType */:
        {
          if (!this.currentAttachedFile) break;
          this.currentAttachedFile.fileMediaType = readAsciiString(slice, size);
        }
        ;
        break;
      case 18012 /* FileData */:
        {
          if (!this.currentAttachedFile) break;
          this.currentAttachedFile.fileData = readBytes(slice, size);
        }
        ;
        break;
      case 18046 /* FileDescription */:
        {
          if (!this.currentAttachedFile) break;
          this.currentAttachedFile.fileDescription = readUnicodeString(slice, size);
        }
        ;
        break;
      case 28032 /* ContentEncodings */:
        {
          if (!this.currentTrack) break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
          this.currentTrack.decodingInstructions.sort((a, b) => b.order - a.order);
        }
        ;
        break;
      case 25152 /* ContentEncoding */:
        {
          this.currentDecodingInstruction = {
            order: 0,
            scope: 1 /* Block */,
            data: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (this.currentDecodingInstruction.data) {
            this.currentTrack.decodingInstructions.push(this.currentDecodingInstruction);
          }
          this.currentDecodingInstruction = null;
        }
        ;
        break;
      case 20529 /* ContentEncodingOrder */:
        {
          if (!this.currentDecodingInstruction) break;
          this.currentDecodingInstruction.order = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 20530 /* ContentEncodingScope */:
        {
          if (!this.currentDecodingInstruction) break;
          this.currentDecodingInstruction.scope = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 20532 /* ContentCompression */:
        {
          if (!this.currentDecodingInstruction) break;
          this.currentDecodingInstruction.data = {
            type: "decompress",
            algorithm: 0 /* Zlib */,
            settings: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case 16980 /* ContentCompAlgo */:
        {
          if (this.currentDecodingInstruction?.data?.type !== "decompress") break;
          this.currentDecodingInstruction.data.algorithm = readUnsignedInt(slice, size);
        }
        ;
        break;
      case 16981 /* ContentCompSettings */:
        {
          if (this.currentDecodingInstruction?.data?.type !== "decompress") break;
          this.currentDecodingInstruction.data.settings = readBytes(slice, size);
        }
        ;
        break;
      case 20533 /* ContentEncryption */:
        {
          if (!this.currentDecodingInstruction) break;
          this.currentDecodingInstruction.data = {
            type: "decrypt"
          };
        }
        ;
        break;
    }
    slice.filePos = dataStartPos + size;
    return true;
  }
  decodeBlockData(track, rawData) {
    assert(track.decodingInstructions.length > 0);
    let currentData = rawData;
    for (const instruction of track.decodingInstructions) {
      assert(instruction.data);
      switch (instruction.data.type) {
        case "decompress":
          {
            switch (instruction.data.algorithm) {
              case 3 /* HeaderStripping */:
                {
                  if (instruction.data.settings && instruction.data.settings.length > 0) {
                    const prefix = instruction.data.settings;
                    const newData = new Uint8Array(prefix.length + currentData.length);
                    newData.set(prefix, 0);
                    newData.set(currentData, prefix.length);
                    currentData = newData;
                  }
                }
                ;
                break;
              default:
                {
                }
                ;
            }
          }
          ;
          break;
        default:
          {
          }
          ;
      }
    }
    return currentData;
  }
  processTagValue(name, value) {
    if (!this.currentSegment?.metadataTags) return;
    const metadataTags = this.currentSegment.metadataTags;
    metadataTags.raw ??= {};
    metadataTags.raw[name] ??= value;
    if (typeof value === "string") {
      switch (name.toLowerCase()) {
        case "title":
          {
            metadataTags.title ??= value;
          }
          ;
          break;
        case "description":
          {
            metadataTags.description ??= value;
          }
          ;
          break;
        case "artist":
          {
            metadataTags.artist ??= value;
          }
          ;
          break;
        case "album":
          {
            metadataTags.album ??= value;
          }
          ;
          break;
        case "album_artist":
          {
            metadataTags.albumArtist ??= value;
          }
          ;
          break;
        case "genre":
          {
            metadataTags.genre ??= value;
          }
          ;
          break;
        case "comment":
          {
            metadataTags.comment ??= value;
          }
          ;
          break;
        case "lyrics":
          {
            metadataTags.lyrics ??= value;
          }
          ;
          break;
        case "date":
          {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) {
              metadataTags.date ??= date;
            }
          }
          ;
          break;
        case "track_number":
        case "part_number":
          {
            const parts = value.split("/");
            const trackNum = Number.parseInt(parts[0], 10);
            const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
            if (Number.isInteger(trackNum) && trackNum > 0) {
              metadataTags.trackNumber ??= trackNum;
            }
            if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
              metadataTags.tracksTotal ??= tracksTotal;
            }
          }
          ;
          break;
        case "disc_number":
        case "disc":
          {
            const discParts = value.split("/");
            const discNum = Number.parseInt(discParts[0], 10);
            const discsTotal = discParts[1] && Number.parseInt(discParts[1], 10);
            if (Number.isInteger(discNum) && discNum > 0) {
              metadataTags.discNumber ??= discNum;
            }
            if (discsTotal && Number.isInteger(discsTotal) && discsTotal > 0) {
              metadataTags.discsTotal ??= discsTotal;
            }
          }
          ;
          break;
      }
    }
  }
};
var MatroskaTrackBacking = class {
  constructor(internalTrack) {
    this.internalTrack = internalTrack;
    this.packetToClusterLocation = /* @__PURE__ */ new WeakMap();
  }
  getId() {
    return this.internalTrack.id;
  }
  getCodec() {
    throw new Error("Not implemented on base class.");
  }
  getInternalCodecId() {
    return this.internalTrack.codecId;
  }
  async computeDuration() {
    const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
    return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
  }
  getName() {
    return this.internalTrack.name;
  }
  getLanguageCode() {
    return this.internalTrack.languageCode;
  }
  async getFirstTimestamp() {
    const firstPacket = await this.getFirstPacket({ metadataOnly: true });
    return firstPacket?.timestamp ?? 0;
  }
  getTimeResolution() {
    return this.internalTrack.segment.timestampFactor;
  }
  async getFirstPacket(options) {
    return this.performClusterLookup(
      null,
      (cluster) => {
        const trackData = cluster.trackData.get(this.internalTrack.id);
        if (trackData) {
          return {
            blockIndex: 0,
            correctBlockFound: true
          };
        }
        return {
          blockIndex: -1,
          correctBlockFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the cues
      Infinity,
      options
    );
  }
  intoTimescale(timestamp) {
    return roundToPrecision(timestamp * this.internalTrack.segment.timestampFactor, 14);
  }
  async getPacket(timestamp, options) {
    const timestampInTimescale = this.intoTimescale(timestamp);
    return this.performClusterLookup(
      null,
      (cluster) => {
        const trackData = cluster.trackData.get(this.internalTrack.id);
        if (!trackData) {
          return { blockIndex: -1, correctBlockFound: false };
        }
        const index = binarySearchLessOrEqual(
          trackData.presentationTimestamps,
          timestampInTimescale,
          (x) => x.timestamp
        );
        const blockIndex = index !== -1 ? trackData.presentationTimestamps[index].blockIndex : -1;
        const correctBlockFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
        return { blockIndex, correctBlockFound };
      },
      timestampInTimescale,
      timestampInTimescale,
      options
    );
  }
  async getNextPacket(packet, options) {
    const locationInCluster = this.packetToClusterLocation.get(packet);
    if (locationInCluster === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performClusterLookup(
      locationInCluster.cluster,
      (cluster) => {
        if (cluster === locationInCluster.cluster) {
          const trackData = cluster.trackData.get(this.internalTrack.id);
          if (locationInCluster.blockIndex + 1 < trackData.blocks.length) {
            return {
              blockIndex: locationInCluster.blockIndex + 1,
              correctBlockFound: true
            };
          }
        } else {
          const trackData = cluster.trackData.get(this.internalTrack.id);
          if (trackData) {
            return {
              blockIndex: 0,
              correctBlockFound: true
            };
          }
        }
        return {
          blockIndex: -1,
          correctBlockFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the cues
      Infinity,
      options
    );
  }
  async getKeyPacket(timestamp, options) {
    const timestampInTimescale = this.intoTimescale(timestamp);
    return this.performClusterLookup(
      null,
      (cluster) => {
        const trackData = cluster.trackData.get(this.internalTrack.id);
        if (!trackData) {
          return { blockIndex: -1, correctBlockFound: false };
        }
        const index = findLastIndex(trackData.presentationTimestamps, (x) => {
          const block = trackData.blocks[x.blockIndex];
          return block.isKeyFrame && x.timestamp <= timestampInTimescale;
        });
        const blockIndex = index !== -1 ? trackData.presentationTimestamps[index].blockIndex : -1;
        const correctBlockFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
        return { blockIndex, correctBlockFound };
      },
      timestampInTimescale,
      timestampInTimescale,
      options
    );
  }
  async getNextKeyPacket(packet, options) {
    const locationInCluster = this.packetToClusterLocation.get(packet);
    if (locationInCluster === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performClusterLookup(
      locationInCluster.cluster,
      (cluster) => {
        if (cluster === locationInCluster.cluster) {
          const trackData = cluster.trackData.get(this.internalTrack.id);
          const nextKeyFrameIndex = trackData.blocks.findIndex(
            (x, i) => x.isKeyFrame && i > locationInCluster.blockIndex
          );
          if (nextKeyFrameIndex !== -1) {
            return {
              blockIndex: nextKeyFrameIndex,
              correctBlockFound: true
            };
          }
        } else {
          const trackData = cluster.trackData.get(this.internalTrack.id);
          if (trackData && trackData.firstKeyFrameTimestamp !== null) {
            const keyFrameIndex = trackData.blocks.findIndex((x) => x.isKeyFrame);
            assert(keyFrameIndex !== -1);
            return {
              blockIndex: keyFrameIndex,
              correctBlockFound: true
            };
          }
        }
        return {
          blockIndex: -1,
          correctBlockFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the cues
      Infinity,
      options
    );
  }
  async fetchPacketInCluster(cluster, blockIndex, options) {
    if (blockIndex === -1) {
      return null;
    }
    const trackData = cluster.trackData.get(this.internalTrack.id);
    const block = trackData.blocks[blockIndex];
    assert(block);
    if (!block.decoded) {
      block.data = this.internalTrack.demuxer.decodeBlockData(this.internalTrack, block.data);
      block.decoded = true;
    }
    const data = options.metadataOnly ? PLACEHOLDER_DATA : block.data;
    const timestamp = block.timestamp / this.internalTrack.segment.timestampFactor;
    const duration = block.duration / this.internalTrack.segment.timestampFactor;
    const sideData = {};
    if (block.mainAdditional && this.internalTrack.info?.type === "video" && this.internalTrack.info.alphaMode) {
      sideData.alpha = options.metadataOnly ? PLACEHOLDER_DATA : block.mainAdditional;
      sideData.alphaByteLength = block.mainAdditional.byteLength;
    }
    const packet = new EncodedPacket(
      data,
      block.isKeyFrame ? "key" : "delta",
      timestamp,
      duration,
      cluster.dataStartPos + blockIndex,
      block.data.byteLength,
      sideData
    );
    this.packetToClusterLocation.set(packet, { cluster, blockIndex });
    return packet;
  }
  /** Looks for a packet in the clusters while trying to load as few clusters as possible to retrieve it. */
  async performClusterLookup(startCluster, getMatchInCluster, searchTimestamp, latestTimestamp, options) {
    const { demuxer, segment } = this.internalTrack;
    let currentCluster = null;
    let bestCluster = null;
    let bestBlockIndex = -1;
    if (startCluster) {
      const { blockIndex, correctBlockFound } = getMatchInCluster(startCluster);
      if (correctBlockFound) {
        return this.fetchPacketInCluster(startCluster, blockIndex, options);
      }
      if (blockIndex !== -1) {
        bestCluster = startCluster;
        bestBlockIndex = blockIndex;
      }
    }
    const cuePointIndex = binarySearchLessOrEqual(
      this.internalTrack.cuePoints,
      searchTimestamp,
      (x) => x.time
    );
    const cuePoint = cuePointIndex !== -1 ? this.internalTrack.cuePoints[cuePointIndex] : null;
    const positionCacheIndex = binarySearchLessOrEqual(
      this.internalTrack.clusterPositionCache,
      searchTimestamp,
      (x) => x.startTimestamp
    );
    const positionCacheEntry = positionCacheIndex !== -1 ? this.internalTrack.clusterPositionCache[positionCacheIndex] : null;
    const lookupEntryPosition = Math.max(
      cuePoint?.clusterPosition ?? 0,
      positionCacheEntry?.elementStartPos ?? 0
    ) || null;
    let currentPos;
    if (!startCluster) {
      currentPos = lookupEntryPosition ?? segment.clusterSeekStartPos;
    } else {
      if (lookupEntryPosition === null || startCluster.elementStartPos >= lookupEntryPosition) {
        currentPos = startCluster.elementEndPos;
        currentCluster = startCluster;
      } else {
        currentPos = lookupEntryPosition;
      }
    }
    while (segment.elementEndPos === null || currentPos <= segment.elementEndPos - MIN_HEADER_SIZE) {
      if (currentCluster) {
        const trackData = currentCluster.trackData.get(this.internalTrack.id);
        if (trackData && trackData.startTimestamp > latestTimestamp) {
          break;
        }
      }
      let slice = demuxer.reader.requestSliceRange(currentPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
      if (slice instanceof Promise) slice = await slice;
      if (!slice) break;
      const elementStartPos = currentPos;
      const elementHeader = readElementHeader(slice);
      if (!elementHeader || !LEVEL_1_EBML_IDS.includes(elementHeader.id) && elementHeader.id !== 236 /* Void */) {
        const nextPos = await resync(
          demuxer.reader,
          elementStartPos,
          LEVEL_1_EBML_IDS,
          Math.min(segment.elementEndPos ?? Infinity, elementStartPos + MAX_RESYNC_LENGTH)
        );
        if (nextPos) {
          currentPos = nextPos;
          continue;
        } else {
          break;
        }
      }
      const id = elementHeader.id;
      let size = elementHeader.size;
      const dataStartPos = slice.filePos;
      if (id === 524531317 /* Cluster */) {
        currentCluster = await demuxer.readCluster(elementStartPos, segment);
        const { blockIndex, correctBlockFound } = getMatchInCluster(currentCluster);
        if (correctBlockFound) {
          return this.fetchPacketInCluster(currentCluster, blockIndex, options);
        }
        if (blockIndex !== -1) {
          bestCluster = currentCluster;
          bestBlockIndex = blockIndex;
        }
      }
      if (size === null) {
        if (id === 524531317 /* Cluster */) {
          assert(currentCluster);
          size = currentCluster.elementEndPos - dataStartPos;
        } else {
          const nextElementPos = await searchForNextElementId(
            demuxer.reader,
            dataStartPos,
            LEVEL_0_AND_1_EBML_IDS,
            segment.elementEndPos
          );
          size = nextElementPos.pos - dataStartPos;
        }
        const endPos = dataStartPos + size;
        if (segment.elementEndPos !== null && endPos > segment.elementEndPos - MIN_HEADER_SIZE) {
          break;
        } else {
          let slice2 = demuxer.reader.requestSliceRange(endPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
          if (slice2 instanceof Promise) slice2 = await slice2;
          if (!slice2) break;
          const elementId = readElementId(slice2);
          if (elementId === 408125543 /* Segment */) {
            segment.elementEndPos = endPos;
            break;
          }
        }
      }
      currentPos = dataStartPos + size;
    }
    if (cuePoint && (!bestCluster || bestCluster.elementStartPos < cuePoint.clusterPosition)) {
      const previousCuePoint = this.internalTrack.cuePoints[cuePointIndex - 1];
      assert(!previousCuePoint || previousCuePoint.time < cuePoint.time);
      const newSearchTimestamp = previousCuePoint?.time ?? -Infinity;
      return this.performClusterLookup(null, getMatchInCluster, newSearchTimestamp, latestTimestamp, options);
    }
    if (bestCluster) {
      return this.fetchPacketInCluster(bestCluster, bestBlockIndex, options);
    }
    return null;
  }
};
var MatroskaVideoTrackBacking = class extends MatroskaTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfigPromise = null;
    this.internalTrack = internalTrack;
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getCodedWidth() {
    return this.internalTrack.info.width;
  }
  getCodedHeight() {
    return this.internalTrack.info.height;
  }
  getRotation() {
    return this.internalTrack.info.rotation;
  }
  async getColorSpace() {
    return {
      primaries: this.internalTrack.info.colorSpace?.primaries,
      transfer: this.internalTrack.info.colorSpace?.transfer,
      matrix: this.internalTrack.info.colorSpace?.matrix,
      fullRange: this.internalTrack.info.colorSpace?.fullRange
    };
  }
  async canBeTransparent() {
    return this.internalTrack.info.alphaMode;
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfigPromise ??= (async () => {
      let firstPacket = null;
      const needsPacketForAdditionalInfo = this.internalTrack.info.codec === "vp9" || this.internalTrack.info.codec === "av1" || this.internalTrack.info.codec === "avc" && !this.internalTrack.info.codecDescription || this.internalTrack.info.codec === "hevc" && !this.internalTrack.info.codecDescription;
      if (needsPacketForAdditionalInfo) {
        firstPacket = await this.getFirstPacket({});
      }
      return {
        codec: extractVideoCodecString({
          width: this.internalTrack.info.width,
          height: this.internalTrack.info.height,
          codec: this.internalTrack.info.codec,
          codecDescription: this.internalTrack.info.codecDescription,
          colorSpace: this.internalTrack.info.colorSpace,
          avcCodecInfo: this.internalTrack.info.codec === "avc" && firstPacket ? extractAvcDecoderConfigurationRecord(firstPacket.data) : null,
          hevcCodecInfo: this.internalTrack.info.codec === "hevc" && firstPacket ? extractHevcDecoderConfigurationRecord(firstPacket.data) : null,
          vp9CodecInfo: this.internalTrack.info.codec === "vp9" && firstPacket ? extractVp9CodecInfoFromPacket(firstPacket.data) : null,
          av1CodecInfo: this.internalTrack.info.codec === "av1" && firstPacket ? extractAv1CodecInfoFromPacket(firstPacket.data) : null
        }),
        codedWidth: this.internalTrack.info.width,
        codedHeight: this.internalTrack.info.height,
        description: this.internalTrack.info.codecDescription ?? void 0,
        colorSpace: this.internalTrack.info.colorSpace ?? void 0
      };
    })();
  }
};
var MatroskaAudioTrackBacking = class extends MatroskaTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfig = null;
    this.internalTrack = internalTrack;
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getNumberOfChannels() {
    return this.internalTrack.info.numberOfChannels;
  }
  getSampleRate() {
    return this.internalTrack.info.sampleRate;
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfig ??= {
      codec: extractAudioCodecString({
        codec: this.internalTrack.info.codec,
        codecDescription: this.internalTrack.info.codecDescription,
        aacCodecInfo: this.internalTrack.info.aacCodecInfo
      }),
      numberOfChannels: this.internalTrack.info.numberOfChannels,
      sampleRate: this.internalTrack.info.sampleRate,
      description: this.internalTrack.info.codecDescription ?? void 0
    };
  }
};
var MatroskaSubtitleTrackBacking = class extends MatroskaTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.internalTrack = internalTrack;
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getCodecPrivate() {
    return this.internalTrack.info.codecPrivateText;
  }
  async *getCues() {
    let packet = await this.getFirstPacket({});
    while (packet) {
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(packet.data);
      yield {
        timestamp: packet.timestamp,
        duration: packet.duration,
        text
      };
      packet = await this.getNextPacket(packet, {});
    }
  }
};
var sortBlocksByReferences = (blocks) => {
  const timestampToBlock = /* @__PURE__ */ new Map();
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    timestampToBlock.set(block.timestamp, block);
  }
  const processedBlocks = /* @__PURE__ */ new Set();
  const result = [];
  const processBlock = (block) => {
    if (processedBlocks.has(block)) {
      return;
    }
    processedBlocks.add(block);
    for (let j = 0; j < block.referencedTimestamps.length; j++) {
      const timestamp = block.referencedTimestamps[j];
      const otherBlock = timestampToBlock.get(timestamp);
      if (!otherBlock) {
        continue;
      }
      processBlock(otherBlock);
    }
    result.push(block);
  };
  for (let i = 0; i < blocks.length; i++) {
    processBlock(blocks[i]);
  }
  return result;
};

// shared/mp3-misc.ts
var FRAME_HEADER_SIZE = 4;
var SAMPLING_RATES = [44100, 48e3, 32e3];
var KILOBIT_RATES = [
  // lowSamplingFrequency === 0
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  // layer = 0
  -1,
  32,
  40,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  160,
  192,
  224,
  256,
  320,
  -1,
  // layer 1
  -1,
  32,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  160,
  192,
  224,
  256,
  320,
  384,
  -1,
  // layer = 2
  -1,
  32,
  64,
  96,
  128,
  160,
  192,
  224,
  256,
  288,
  320,
  352,
  384,
  416,
  448,
  -1,
  // layer = 3
  // lowSamplingFrequency === 1
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  // layer = 0
  -1,
  8,
  16,
  24,
  32,
  40,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  144,
  160,
  -1,
  // layer = 1
  -1,
  8,
  16,
  24,
  32,
  40,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  144,
  160,
  -1,
  // layer = 2
  -1,
  32,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  144,
  160,
  176,
  192,
  224,
  256,
  -1
  // layer = 3
];
var XING = 1483304551;
var INFO = 1231971951;
var computeMp3FrameSize = (lowSamplingFrequency, layer, bitrate, sampleRate, padding) => {
  if (layer === 0) {
    return 0;
  } else if (layer === 1) {
    return Math.floor(144 * bitrate / (sampleRate << lowSamplingFrequency)) + padding;
  } else if (layer === 2) {
    return Math.floor(144 * bitrate / sampleRate) + padding;
  } else {
    return (Math.floor(12 * bitrate / sampleRate) + padding) * 4;
  }
};
var getXingOffset = (mpegVersionId, channel) => {
  return mpegVersionId === 3 ? channel === 3 ? 21 : 36 : channel === 3 ? 13 : 21;
};
var readFrameHeader = (word, remainingBytes) => {
  const firstByte = word >>> 24;
  const secondByte = word >>> 16 & 255;
  const thirdByte = word >>> 8 & 255;
  const fourthByte = word & 255;
  if (firstByte !== 255 && secondByte !== 255 && thirdByte !== 255 && fourthByte !== 255) {
    return {
      header: null,
      bytesAdvanced: 4
    };
  }
  if (firstByte !== 255) {
    return { header: null, bytesAdvanced: 1 };
  }
  if ((secondByte & 224) !== 224) {
    return { header: null, bytesAdvanced: 1 };
  }
  let lowSamplingFrequency = 0;
  let mpeg25 = 0;
  if (secondByte & 1 << 4) {
    lowSamplingFrequency = secondByte & 1 << 3 ? 0 : 1;
  } else {
    lowSamplingFrequency = 1;
    mpeg25 = 1;
  }
  const mpegVersionId = secondByte >> 3 & 3;
  const layer = secondByte >> 1 & 3;
  const bitrateIndex = thirdByte >> 4 & 15;
  const frequencyIndex = (thirdByte >> 2 & 3) % 3;
  const padding = thirdByte >> 1 & 1;
  const channel = fourthByte >> 6 & 3;
  const modeExtension = fourthByte >> 4 & 3;
  const copyright = fourthByte >> 3 & 1;
  const original = fourthByte >> 2 & 1;
  const emphasis = fourthByte & 3;
  const kilobitRate = KILOBIT_RATES[lowSamplingFrequency * 16 * 4 + layer * 16 + bitrateIndex];
  if (kilobitRate === -1) {
    return { header: null, bytesAdvanced: 1 };
  }
  const bitrate = kilobitRate * 1e3;
  const sampleRate = SAMPLING_RATES[frequencyIndex] >> lowSamplingFrequency + mpeg25;
  const frameLength = computeMp3FrameSize(lowSamplingFrequency, layer, bitrate, sampleRate, padding);
  if (remainingBytes !== null && remainingBytes < frameLength) {
    return { header: null, bytesAdvanced: 1 };
  }
  let audioSamplesInFrame;
  if (mpegVersionId === 3) {
    audioSamplesInFrame = layer === 3 ? 384 : 1152;
  } else {
    if (layer === 3) {
      audioSamplesInFrame = 384;
    } else if (layer === 2) {
      audioSamplesInFrame = 1152;
    } else {
      audioSamplesInFrame = 576;
    }
  }
  return {
    header: {
      totalSize: frameLength,
      mpegVersionId,
      layer,
      bitrate,
      frequencyIndex,
      sampleRate,
      channel,
      modeExtension,
      copyright,
      original,
      emphasis,
      audioSamplesInFrame
    },
    bytesAdvanced: 1
  };
};
var encodeSynchsafe = (unsynchsafed) => {
  let mask = 127;
  let synchsafed = 0;
  let unsynchsafedRest = unsynchsafed;
  while ((mask ^ 2147483647) !== 0) {
    synchsafed = unsynchsafedRest & ~mask;
    synchsafed <<= 1;
    synchsafed |= unsynchsafedRest & mask;
    mask = (mask + 1 << 8) - 1;
    unsynchsafedRest = synchsafed;
  }
  return synchsafed;
};
var decodeSynchsafe = (synchsafed) => {
  let mask = 2130706432;
  let unsynchsafed = 0;
  while (mask !== 0) {
    unsynchsafed >>= 1;
    unsynchsafed |= synchsafed & mask;
    mask >>= 8;
  }
  return unsynchsafed;
};

// src/id3.ts
var ID3_V1_TAG_SIZE = 128;
var ID3_V2_HEADER_SIZE = 10;
var ID3_V1_GENRES = [
  "Blues",
  "Classic rock",
  "Country",
  "Dance",
  "Disco",
  "Funk",
  "Grunge",
  "Hip-hop",
  "Jazz",
  "Metal",
  "New age",
  "Oldies",
  "Other",
  "Pop",
  "Rhythm and blues",
  "Rap",
  "Reggae",
  "Rock",
  "Techno",
  "Industrial",
  "Alternative",
  "Ska",
  "Death metal",
  "Pranks",
  "Soundtrack",
  "Euro-techno",
  "Ambient",
  "Trip-hop",
  "Vocal",
  "Jazz & funk",
  "Fusion",
  "Trance",
  "Classical",
  "Instrumental",
  "Acid",
  "House",
  "Game",
  "Sound clip",
  "Gospel",
  "Noise",
  "Alternative rock",
  "Bass",
  "Soul",
  "Punk",
  "Space",
  "Meditative",
  "Instrumental pop",
  "Instrumental rock",
  "Ethnic",
  "Gothic",
  "Darkwave",
  "Techno-industrial",
  "Electronic",
  "Pop-folk",
  "Eurodance",
  "Dream",
  "Southern rock",
  "Comedy",
  "Cult",
  "Gangsta",
  "Top 40",
  "Christian rap",
  "Pop/funk",
  "Jungle music",
  "Native US",
  "Cabaret",
  "New wave",
  "Psychedelic",
  "Rave",
  "Showtunes",
  "Trailer",
  "Lo-fi",
  "Tribal",
  "Acid punk",
  "Acid jazz",
  "Polka",
  "Retro",
  "Musical",
  "Rock 'n' roll",
  "Hard rock",
  "Folk",
  "Folk rock",
  "National folk",
  "Swing",
  "Fast fusion",
  "Bebop",
  "Latin",
  "Revival",
  "Celtic",
  "Bluegrass",
  "Avantgarde",
  "Gothic rock",
  "Progressive rock",
  "Psychedelic rock",
  "Symphonic rock",
  "Slow rock",
  "Big band",
  "Chorus",
  "Easy listening",
  "Acoustic",
  "Humour",
  "Speech",
  "Chanson",
  "Opera",
  "Chamber music",
  "Sonata",
  "Symphony",
  "Booty bass",
  "Primus",
  "Porn groove",
  "Satire",
  "Slow jam",
  "Club",
  "Tango",
  "Samba",
  "Folklore",
  "Ballad",
  "Power ballad",
  "Rhythmic Soul",
  "Freestyle",
  "Duet",
  "Punk rock",
  "Drum solo",
  "A cappella",
  "Euro-house",
  "Dance hall",
  "Goa music",
  "Drum & bass",
  "Club-house",
  "Hardcore techno",
  "Terror",
  "Indie",
  "Britpop",
  "Negerpunk",
  "Polsk punk",
  "Beat",
  "Christian gangsta rap",
  "Heavy metal",
  "Black metal",
  "Crossover",
  "Contemporary Christian",
  "Christian rock",
  "Merengue",
  "Salsa",
  "Thrash metal",
  "Anime",
  "Jpop",
  "Synthpop",
  "Christmas",
  "Art rock",
  "Baroque",
  "Bhangra",
  "Big beat",
  "Breakbeat",
  "Chillout",
  "Downtempo",
  "Dub",
  "EBM",
  "Eclectic",
  "Electro",
  "Electroclash",
  "Emo",
  "Experimental",
  "Garage",
  "Global",
  "IDM",
  "Illbient",
  "Industro-Goth",
  "Jam Band",
  "Krautrock",
  "Leftfield",
  "Lounge",
  "Math rock",
  "New romantic",
  "Nu-breakz",
  "Post-punk",
  "Post-rock",
  "Psytrance",
  "Shoegaze",
  "Space rock",
  "Trop rock",
  "World music",
  "Neoclassical",
  "Audiobook",
  "Audio theatre",
  "Neue Deutsche Welle",
  "Podcast",
  "Indie rock",
  "G-Funk",
  "Dubstep",
  "Garage rock",
  "Psybient"
];
var parseId3V1Tag = (slice, tags) => {
  const startPos = slice.filePos;
  tags.raw ??= {};
  tags.raw["TAG"] ??= readBytes(slice, ID3_V1_TAG_SIZE - 3);
  slice.filePos = startPos;
  const title = readId3V1String(slice, 30);
  if (title) tags.title ??= title;
  const artist = readId3V1String(slice, 30);
  if (artist) tags.artist ??= artist;
  const album = readId3V1String(slice, 30);
  if (album) tags.album ??= album;
  const yearText = readId3V1String(slice, 4);
  const year = Number.parseInt(yearText, 10);
  if (Number.isInteger(year) && year > 0) {
    tags.date ??= new Date(year, 0, 1);
  }
  const commentBytes = readBytes(slice, 30);
  let comment;
  if (commentBytes[28] === 0 && commentBytes[29] !== 0) {
    const trackNum = commentBytes[29];
    if (trackNum > 0) {
      tags.trackNumber ??= trackNum;
    }
    slice.skip(-30);
    comment = readId3V1String(slice, 28);
    slice.skip(2);
  } else {
    slice.skip(-30);
    comment = readId3V1String(slice, 30);
  }
  if (comment) tags.comment ??= comment;
  const genreIndex = readU8(slice);
  if (genreIndex < ID3_V1_GENRES.length) {
    tags.genre ??= ID3_V1_GENRES[genreIndex];
  }
};
var readId3V1String = (slice, length) => {
  const bytes2 = readBytes(slice, length);
  const endIndex = coalesceIndex(bytes2.indexOf(0), bytes2.length);
  const relevantBytes = bytes2.subarray(0, endIndex);
  let str = "";
  for (let i = 0; i < relevantBytes.length; i++) {
    str += String.fromCharCode(relevantBytes[i]);
  }
  return str.trimEnd();
};
var readId3V2Header = (slice) => {
  const startPos = slice.filePos;
  const tag = readAscii(slice, 3);
  const majorVersion = readU8(slice);
  const revision = readU8(slice);
  const flags = readU8(slice);
  const sizeRaw = readU32Be(slice);
  if (tag !== "ID3" || majorVersion === 255 || revision === 255 || (sizeRaw & 2155905152) !== 0) {
    slice.filePos = startPos;
    return null;
  }
  const size = decodeSynchsafe(sizeRaw);
  return { majorVersion, revision, flags, size };
};
var parseId3V2Tag = (slice, header, tags) => {
  if (![2, 3, 4].includes(header.majorVersion)) {
    console.warn(`Unsupported ID3v2 major version: ${header.majorVersion}`);
    return;
  }
  const bytes2 = readBytes(slice, header.size);
  const reader = new Id3V2Reader(header, bytes2);
  if (header.flags & 16 /* Footer */) {
    reader.removeFooter();
  }
  if (header.flags & 128 /* Unsynchronisation */ && header.majorVersion === 3) {
    reader.ununsynchronizeAll();
  }
  if (header.flags & 64 /* ExtendedHeader */) {
    const extendedHeaderSize = reader.readU32();
    if (header.majorVersion === 3) {
      reader.pos += extendedHeaderSize;
    } else {
      reader.pos += extendedHeaderSize - 4;
    }
  }
  while (reader.pos <= reader.bytes.length - reader.frameHeaderSize()) {
    const frame = reader.readId3V2Frame();
    if (!frame) {
      break;
    }
    const frameStartPos = reader.pos;
    const frameEndPos = reader.pos + frame.size;
    let frameEncrypted = false;
    let frameCompressed = false;
    let frameUnsynchronized = false;
    if (header.majorVersion === 3) {
      frameEncrypted = !!(frame.flags & 1 << 6);
      frameCompressed = !!(frame.flags & 1 << 7);
    } else if (header.majorVersion === 4) {
      frameEncrypted = !!(frame.flags & 1 << 2);
      frameCompressed = !!(frame.flags & 1 << 3);
      frameUnsynchronized = !!(frame.flags & 1 << 1) || !!(header.flags & 128 /* Unsynchronisation */);
    }
    if (frameEncrypted) {
      console.warn(`Skipping encrypted ID3v2 frame ${frame.id}`);
      reader.pos = frameEndPos;
      continue;
    }
    if (frameCompressed) {
      console.warn(`Skipping compressed ID3v2 frame ${frame.id}`);
      reader.pos = frameEndPos;
      continue;
    }
    if (frameUnsynchronized) {
      reader.ununsynchronizeRegion(reader.pos, frameEndPos);
    }
    tags.raw ??= {};
    if (frame.id[0] === "T") {
      tags.raw[frame.id] ??= reader.readId3V2EncodingAndText(frameEndPos);
    } else {
      tags.raw[frame.id] ??= reader.readBytes(frame.size);
    }
    reader.pos = frameStartPos;
    switch (frame.id) {
      case "TIT2":
      case "TT2":
        {
          tags.title ??= reader.readId3V2EncodingAndText(frameEndPos);
        }
        ;
        break;
      case "TIT3":
      case "TT3":
        {
          tags.description ??= reader.readId3V2EncodingAndText(frameEndPos);
        }
        ;
        break;
      case "TPE1":
      case "TP1":
        {
          tags.artist ??= reader.readId3V2EncodingAndText(frameEndPos);
        }
        ;
        break;
      case "TALB":
      case "TAL":
        {
          tags.album ??= reader.readId3V2EncodingAndText(frameEndPos);
        }
        ;
        break;
      case "TPE2":
      case "TP2":
        {
          tags.albumArtist ??= reader.readId3V2EncodingAndText(frameEndPos);
        }
        ;
        break;
      case "TRCK":
      case "TRK":
        {
          const trackText = reader.readId3V2EncodingAndText(frameEndPos);
          const parts = trackText.split("/");
          const trackNum = Number.parseInt(parts[0], 10);
          const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
          if (Number.isInteger(trackNum) && trackNum > 0) {
            tags.trackNumber ??= trackNum;
          }
          if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
            tags.tracksTotal ??= tracksTotal;
          }
        }
        ;
        break;
      case "TPOS":
      case "TPA":
        {
          const discText = reader.readId3V2EncodingAndText(frameEndPos);
          const parts = discText.split("/");
          const discNum = Number.parseInt(parts[0], 10);
          const discsTotal = parts[1] && Number.parseInt(parts[1], 10);
          if (Number.isInteger(discNum) && discNum > 0) {
            tags.discNumber ??= discNum;
          }
          if (discsTotal && Number.isInteger(discsTotal) && discsTotal > 0) {
            tags.discsTotal ??= discsTotal;
          }
        }
        ;
        break;
      case "TCON":
      case "TCO":
        {
          const genreText = reader.readId3V2EncodingAndText(frameEndPos);
          let match = /^\((\d+)\)/.exec(genreText);
          if (match) {
            const genreNumber = Number.parseInt(match[1]);
            if (ID3_V1_GENRES[genreNumber] !== void 0) {
              tags.genre ??= ID3_V1_GENRES[genreNumber];
              break;
            }
          }
          match = /^\d+$/.exec(genreText);
          if (match) {
            const genreNumber = Number.parseInt(match[0]);
            if (ID3_V1_GENRES[genreNumber] !== void 0) {
              tags.genre ??= ID3_V1_GENRES[genreNumber];
              break;
            }
          }
          tags.genre ??= genreText;
        }
        ;
        break;
      case "TDRC":
      case "TDAT":
        {
          const dateText = reader.readId3V2EncodingAndText(frameEndPos);
          const date = new Date(dateText);
          if (!Number.isNaN(date.getTime())) {
            tags.date ??= date;
          }
        }
        ;
        break;
      case "TYER":
      case "TYE":
        {
          const yearText = reader.readId3V2EncodingAndText(frameEndPos);
          const year = Number.parseInt(yearText, 10);
          if (Number.isInteger(year)) {
            tags.date ??= new Date(year, 0, 1);
          }
        }
        ;
        break;
      case "USLT":
      case "ULT":
        {
          const encoding = reader.readU8();
          reader.pos += 3;
          reader.readId3V2Text(encoding, frameEndPos);
          tags.lyrics ??= reader.readId3V2Text(encoding, frameEndPos);
        }
        ;
        break;
      case "COMM":
      case "COM":
        {
          const encoding = reader.readU8();
          reader.pos += 3;
          reader.readId3V2Text(encoding, frameEndPos);
          tags.comment ??= reader.readId3V2Text(encoding, frameEndPos);
        }
        ;
        break;
      case "APIC":
      case "PIC":
        {
          const encoding = reader.readId3V2TextEncoding();
          let mimeType;
          if (header.majorVersion === 2) {
            const imageFormat = reader.readAscii(3);
            mimeType = imageFormat === "PNG" ? "image/png" : imageFormat === "JPG" ? "image/jpeg" : "image/*";
          } else {
            mimeType = reader.readId3V2Text(encoding, frameEndPos);
          }
          const pictureType = reader.readU8();
          const description = reader.readId3V2Text(encoding, frameEndPos).trimEnd();
          const imageDataSize = frameEndPos - reader.pos;
          if (imageDataSize >= 0) {
            const imageData = reader.readBytes(imageDataSize);
            if (!tags.images) tags.images = [];
            tags.images.push({
              data: imageData,
              mimeType,
              kind: pictureType === 3 ? "coverFront" : pictureType === 4 ? "coverBack" : "unknown",
              description
            });
          }
        }
        ;
        break;
      default:
        {
          reader.pos += frame.size;
        }
        ;
        break;
    }
    reader.pos = frameEndPos;
  }
};
var Id3V2Reader = class {
  constructor(header, bytes2) {
    this.header = header;
    this.bytes = bytes2;
    this.pos = 0;
    this.view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength);
  }
  frameHeaderSize() {
    return this.header.majorVersion === 2 ? 6 : 10;
  }
  ununsynchronizeAll() {
    const newBytes = [];
    for (let i = 0; i < this.bytes.length; i++) {
      const value1 = this.bytes[i];
      newBytes.push(value1);
      if (value1 === 255 && i !== this.bytes.length - 1) {
        const value2 = this.bytes[i];
        if (value2 === 0) {
          i++;
        }
      }
    }
    this.bytes = new Uint8Array(newBytes);
    this.view = new DataView(this.bytes.buffer);
  }
  ununsynchronizeRegion(start, end) {
    const newBytes = [];
    for (let i = start; i < end; i++) {
      const value1 = this.bytes[i];
      newBytes.push(value1);
      if (value1 === 255 && i !== end - 1) {
        const value2 = this.bytes[i + 1];
        if (value2 === 0) {
          i++;
        }
      }
    }
    const before = this.bytes.subarray(0, start);
    const after = this.bytes.subarray(end);
    this.bytes = new Uint8Array(before.length + newBytes.length + after.length);
    this.bytes.set(before, 0);
    this.bytes.set(newBytes, before.length);
    this.bytes.set(after, before.length + newBytes.length);
    this.view = new DataView(this.bytes.buffer);
  }
  removeFooter() {
    this.bytes = this.bytes.subarray(0, this.bytes.length - ID3_V2_HEADER_SIZE);
    this.view = new DataView(this.bytes.buffer);
  }
  readBytes(length) {
    const slice = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }
  readU8() {
    const value = this.view.getUint8(this.pos);
    this.pos += 1;
    return value;
  }
  readU16() {
    const value = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return value;
  }
  readU24() {
    const high = this.view.getUint16(this.pos, false);
    const low = this.view.getUint8(this.pos + 1);
    this.pos += 3;
    return high * 256 + low;
  }
  readU32() {
    const value = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return value;
  }
  readAscii(length) {
    let str = "";
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(this.view.getUint8(this.pos + i));
    }
    this.pos += length;
    return str;
  }
  readId3V2Frame() {
    if (this.header.majorVersion === 2) {
      const id = this.readAscii(3);
      if (id === "\0\0\0") {
        return null;
      }
      const size = this.readU24();
      return { id, size, flags: 0 };
    } else {
      const id = this.readAscii(4);
      if (id === "\0\0\0\0") {
        return null;
      }
      const sizeRaw = this.readU32();
      let size = this.header.majorVersion === 4 ? decodeSynchsafe(sizeRaw) : sizeRaw;
      const flags = this.readU16();
      const headerEndPos = this.pos;
      const isSizeValid = (size2) => {
        const nextPos = this.pos + size2;
        if (nextPos > this.bytes.length) {
          return false;
        }
        if (nextPos <= this.bytes.length - this.frameHeaderSize()) {
          this.pos += size2;
          const nextId = this.readAscii(4);
          if (nextId !== "\0\0\0\0" && !/[0-9A-Z]{4}/.test(nextId)) {
            return false;
          }
        }
        return true;
      };
      if (!isSizeValid(size)) {
        const otherSize = this.header.majorVersion === 4 ? sizeRaw : decodeSynchsafe(sizeRaw);
        if (isSizeValid(otherSize)) {
          size = otherSize;
        }
      }
      this.pos = headerEndPos;
      return { id, size, flags };
    }
  }
  readId3V2TextEncoding() {
    const number = this.readU8();
    if (number > 3) {
      throw new Error(`Unsupported text encoding: ${number}`);
    }
    return number;
  }
  readId3V2Text(encoding, until) {
    const startPos = this.pos;
    const data = this.readBytes(until - this.pos);
    switch (encoding) {
      case 0 /* ISO_8859_1 */: {
        let str = "";
        for (let i = 0; i < data.length; i++) {
          const value = data[i];
          if (value === 0) {
            this.pos = startPos + i + 1;
            break;
          }
          str += String.fromCharCode(value);
        }
        return str;
      }
      case 1 /* UTF_16_WITH_BOM */: {
        if (data[0] === 255 && data[1] === 254) {
          const decoder = new TextDecoder("utf-16le");
          const endIndex = coalesceIndex(
            data.findIndex((x, i) => x === 0 && data[i + 1] === 0 && i % 2 === 0),
            data.length
          );
          this.pos = startPos + Math.min(endIndex + 2, data.length);
          return decoder.decode(data.subarray(2, endIndex));
        } else if (data[0] === 254 && data[1] === 255) {
          const decoder = new TextDecoder("utf-16be");
          const endIndex = coalesceIndex(
            data.findIndex((x, i) => x === 0 && data[i + 1] === 0 && i % 2 === 0),
            data.length
          );
          this.pos = startPos + Math.min(endIndex + 2, data.length);
          return decoder.decode(data.subarray(2, endIndex));
        } else {
          const endIndex = coalesceIndex(data.findIndex((x) => x === 0), data.length);
          this.pos = startPos + Math.min(endIndex + 1, data.length);
          return textDecoder.decode(data.subarray(0, endIndex));
        }
      }
      case 2 /* UTF_16_BE_NO_BOM */: {
        const decoder = new TextDecoder("utf-16be");
        const endIndex = coalesceIndex(
          data.findIndex((x, i) => x === 0 && data[i + 1] === 0 && i % 2 === 0),
          data.length
        );
        this.pos = startPos + Math.min(endIndex + 2, data.length);
        return decoder.decode(data.subarray(0, endIndex));
      }
      case 3 /* UTF_8 */: {
        const endIndex = coalesceIndex(data.findIndex((x) => x === 0), data.length);
        this.pos = startPos + Math.min(endIndex + 1, data.length);
        return textDecoder.decode(data.subarray(0, endIndex));
      }
    }
  }
  readId3V2EncodingAndText(until) {
    if (this.pos >= until) {
      return "";
    }
    const encoding = this.readId3V2TextEncoding();
    return this.readId3V2Text(encoding, until);
  }
};
var Id3V2Writer = class {
  constructor(writer) {
    this.helper = new Uint8Array(8);
    this.helperView = toDataView(this.helper);
    this.writer = writer;
  }
  writeId3V2Tag(metadata) {
    const tagStartPos = this.writer.getPos();
    this.writeAscii("ID3");
    this.writeU8(4);
    this.writeU8(0);
    this.writeU8(0);
    this.writeSynchsafeU32(0);
    const framesStartPos = this.writer.getPos();
    const writtenTags = /* @__PURE__ */ new Set();
    for (const { key, value } of keyValueIterator(metadata)) {
      switch (key) {
        case "title":
          {
            this.writeId3V2TextFrame("TIT2", value);
            writtenTags.add("TIT2");
          }
          ;
          break;
        case "description":
          {
            this.writeId3V2TextFrame("TIT3", value);
            writtenTags.add("TIT3");
          }
          ;
          break;
        case "artist":
          {
            this.writeId3V2TextFrame("TPE1", value);
            writtenTags.add("TPE1");
          }
          ;
          break;
        case "album":
          {
            this.writeId3V2TextFrame("TALB", value);
            writtenTags.add("TALB");
          }
          ;
          break;
        case "albumArtist":
          {
            this.writeId3V2TextFrame("TPE2", value);
            writtenTags.add("TPE2");
          }
          ;
          break;
        case "trackNumber":
          {
            const string = metadata.tracksTotal !== void 0 ? `${value}/${metadata.tracksTotal}` : value.toString();
            this.writeId3V2TextFrame("TRCK", string);
            writtenTags.add("TRCK");
          }
          ;
          break;
        case "discNumber":
          {
            const string = metadata.discsTotal !== void 0 ? `${value}/${metadata.discsTotal}` : value.toString();
            this.writeId3V2TextFrame("TPOS", string);
            writtenTags.add("TPOS");
          }
          ;
          break;
        case "genre":
          {
            this.writeId3V2TextFrame("TCON", value);
            writtenTags.add("TCON");
          }
          ;
          break;
        case "date":
          {
            this.writeId3V2TextFrame("TDRC", value.toISOString().slice(0, 10));
            writtenTags.add("TDRC");
          }
          ;
          break;
        case "lyrics":
          {
            this.writeId3V2LyricsFrame(value);
            writtenTags.add("USLT");
          }
          ;
          break;
        case "comment":
          {
            this.writeId3V2CommentFrame(value);
            writtenTags.add("COMM");
          }
          ;
          break;
        case "images":
          {
            const pictureTypeMap = { coverFront: 3, coverBack: 4, unknown: 0 };
            for (const image of value) {
              const pictureType = pictureTypeMap[image.kind] ?? 0;
              const description = image.description ?? "";
              this.writeId3V2ApicFrame(image.mimeType, pictureType, description, image.data);
            }
          }
          ;
          break;
        case "tracksTotal":
        case "discsTotal":
          {
          }
          ;
          break;
        case "raw":
          {
          }
          ;
          break;
        default: {
          assertNever(key);
        }
      }
    }
    if (metadata.raw) {
      for (const key in metadata.raw) {
        const value = metadata.raw[key];
        if (value == null || key.length !== 4 || writtenTags.has(key)) {
          continue;
        }
        let bytes2;
        if (typeof value === "string") {
          const encoded = textEncoder.encode(value);
          bytes2 = new Uint8Array(encoded.byteLength + 2);
          bytes2[0] = 3 /* UTF_8 */;
          bytes2.set(encoded, 1);
        } else if (value instanceof Uint8Array) {
          bytes2 = value;
        } else {
          continue;
        }
        this.writeAscii(key);
        this.writeSynchsafeU32(bytes2.byteLength);
        this.writeU16(0);
        this.writer.write(bytes2);
      }
    }
    const framesEndPos = this.writer.getPos();
    const framesSize = framesEndPos - framesStartPos;
    this.writer.seek(tagStartPos + 6);
    this.writeSynchsafeU32(framesSize);
    this.writer.seek(framesEndPos);
    return framesSize + 10;
  }
  writeU8(value) {
    this.helper[0] = value;
    this.writer.write(this.helper.subarray(0, 1));
  }
  writeU16(value) {
    this.helperView.setUint16(0, value, false);
    this.writer.write(this.helper.subarray(0, 2));
  }
  writeU32(value) {
    this.helperView.setUint32(0, value, false);
    this.writer.write(this.helper.subarray(0, 4));
  }
  writeAscii(text) {
    for (let i = 0; i < text.length; i++) {
      this.helper[i] = text.charCodeAt(i);
    }
    this.writer.write(this.helper.subarray(0, text.length));
  }
  writeSynchsafeU32(value) {
    this.writeU32(encodeSynchsafe(value));
  }
  writeIsoString(text) {
    const bytes2 = new Uint8Array(text.length + 1);
    for (let i = 0; i < text.length; i++) {
      bytes2[i] = text.charCodeAt(i);
    }
    bytes2[text.length] = 0;
    this.writer.write(bytes2);
  }
  writeUtf8String(text) {
    const utf8Data = textEncoder.encode(text);
    this.writer.write(utf8Data);
    this.writeU8(0);
  }
  writeId3V2TextFrame(frameId, text) {
    const useIso88591 = isIso88591Compatible(text);
    const textDataLength = useIso88591 ? text.length : textEncoder.encode(text).byteLength;
    const frameSize = 1 + textDataLength + 1;
    this.writeAscii(frameId);
    this.writeSynchsafeU32(frameSize);
    this.writeU16(0);
    this.writeU8(useIso88591 ? 0 /* ISO_8859_1 */ : 3 /* UTF_8 */);
    if (useIso88591) {
      this.writeIsoString(text);
    } else {
      this.writeUtf8String(text);
    }
  }
  writeId3V2LyricsFrame(lyrics) {
    const useIso88591 = isIso88591Compatible(lyrics);
    const shortDescription = "";
    const frameSize = 1 + 3 + shortDescription.length + 1 + lyrics.length + 1;
    this.writeAscii("USLT");
    this.writeSynchsafeU32(frameSize);
    this.writeU16(0);
    this.writeU8(useIso88591 ? 0 /* ISO_8859_1 */ : 3 /* UTF_8 */);
    this.writeAscii("und");
    if (useIso88591) {
      this.writeIsoString(shortDescription);
      this.writeIsoString(lyrics);
    } else {
      this.writeUtf8String(shortDescription);
      this.writeUtf8String(lyrics);
    }
  }
  writeId3V2CommentFrame(comment) {
    const useIso88591 = isIso88591Compatible(comment);
    const textDataLength = useIso88591 ? comment.length : textEncoder.encode(comment).byteLength;
    const shortDescription = "";
    const frameSize = 1 + 3 + shortDescription.length + 1 + textDataLength + 1;
    this.writeAscii("COMM");
    this.writeSynchsafeU32(frameSize);
    this.writeU16(0);
    this.writeU8(useIso88591 ? 0 /* ISO_8859_1 */ : 3 /* UTF_8 */);
    this.writeU8(117);
    this.writeU8(110);
    this.writeU8(100);
    if (useIso88591) {
      this.writeIsoString(shortDescription);
      this.writeIsoString(comment);
    } else {
      this.writeUtf8String(shortDescription);
      this.writeUtf8String(comment);
    }
  }
  writeId3V2ApicFrame(mimeType, pictureType, description, imageData) {
    const useIso88591 = isIso88591Compatible(mimeType) && isIso88591Compatible(description);
    const descriptionDataLength = useIso88591 ? description.length : textEncoder.encode(description).byteLength;
    const frameSize = 1 + mimeType.length + 1 + 1 + descriptionDataLength + 1 + imageData.byteLength;
    this.writeAscii("APIC");
    this.writeSynchsafeU32(frameSize);
    this.writeU16(0);
    this.writeU8(useIso88591 ? 0 /* ISO_8859_1 */ : 3 /* UTF_8 */);
    if (useIso88591) {
      this.writeIsoString(mimeType);
    } else {
      this.writeUtf8String(mimeType);
    }
    this.writeU8(pictureType);
    if (useIso88591) {
      this.writeIsoString(description);
    } else {
      this.writeUtf8String(description);
    }
    this.writer.write(imageData);
  }
};

// src/mp3/mp3-reader.ts
var readNextFrameHeader = async (reader, startPos, until) => {
  let currentPos = startPos;
  while (until === null || currentPos < until) {
    let slice = reader.requestSlice(currentPos, FRAME_HEADER_SIZE);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) break;
    const word = readU32Be(slice);
    const result = readFrameHeader(word, reader.fileSize !== null ? reader.fileSize - currentPos : null);
    if (result.header) {
      return { header: result.header, startPos: currentPos };
    }
    currentPos += result.bytesAdvanced;
  }
  return null;
};

// src/mp3/mp3-demuxer.ts
var Mp3Demuxer = class extends Demuxer {
  constructor(input) {
    super(input);
    this.metadataPromise = null;
    this.firstFrameHeader = null;
    this.loadedSamples = [];
    // All samples from the start of the file to lastLoadedPos
    this.metadataTags = null;
    this.tracks = [];
    this.readingMutex = new AsyncMutex();
    this.lastSampleLoaded = false;
    this.lastLoadedPos = 0;
    this.nextTimestampInSamples = 0;
    this.reader = input._reader;
  }
  async readMetadata() {
    return this.metadataPromise ??= (async () => {
      while (!this.firstFrameHeader && !this.lastSampleLoaded) {
        await this.advanceReader();
      }
      if (!this.firstFrameHeader) {
        throw new Error("No valid MP3 frame found.");
      }
      this.tracks = [new InputAudioTrack(this.input, new Mp3AudioTrackBacking(this))];
    })();
  }
  async advanceReader() {
    if (this.lastLoadedPos === 0) {
      while (true) {
        let slice2 = this.reader.requestSlice(this.lastLoadedPos, ID3_V2_HEADER_SIZE);
        if (slice2 instanceof Promise) slice2 = await slice2;
        if (!slice2) {
          this.lastSampleLoaded = true;
          return;
        }
        const id3V2Header = readId3V2Header(slice2);
        if (!id3V2Header) {
          break;
        }
        this.lastLoadedPos = slice2.filePos + id3V2Header.size;
      }
    }
    const result = await readNextFrameHeader(this.reader, this.lastLoadedPos, this.reader.fileSize);
    if (!result) {
      this.lastSampleLoaded = true;
      return;
    }
    const header = result.header;
    this.lastLoadedPos = result.startPos + header.totalSize - 1;
    const xingOffset = getXingOffset(header.mpegVersionId, header.channel);
    let slice = this.reader.requestSlice(result.startPos + xingOffset, 4);
    if (slice instanceof Promise) slice = await slice;
    if (slice) {
      const word = readU32Be(slice);
      const isXing = word === XING || word === INFO;
      if (isXing) {
        return;
      }
    }
    if (!this.firstFrameHeader) {
      this.firstFrameHeader = header;
    }
    if (header.sampleRate !== this.firstFrameHeader.sampleRate) {
      console.warn(
        `MP3 changed sample rate mid-file: ${this.firstFrameHeader.sampleRate} Hz to ${header.sampleRate} Hz. Might be a bug, so please report this file.`
      );
    }
    const sampleDuration = header.audioSamplesInFrame / this.firstFrameHeader.sampleRate;
    const sample = {
      timestamp: this.nextTimestampInSamples / this.firstFrameHeader.sampleRate,
      duration: sampleDuration,
      dataStart: result.startPos,
      dataSize: header.totalSize
    };
    this.loadedSamples.push(sample);
    this.nextTimestampInSamples += header.audioSamplesInFrame;
    return;
  }
  async getMimeType() {
    return "audio/mpeg";
  }
  async getTracks() {
    await this.readMetadata();
    return this.tracks;
  }
  async computeDuration() {
    await this.readMetadata();
    const track = this.tracks[0];
    assert(track);
    return track.computeDuration();
  }
  async getMetadataTags() {
    const release = await this.readingMutex.acquire();
    try {
      await this.readMetadata();
      if (this.metadataTags) {
        return this.metadataTags;
      }
      this.metadataTags = {};
      let currentPos = 0;
      let id3V2HeaderFound = false;
      while (true) {
        let headerSlice = this.reader.requestSlice(currentPos, ID3_V2_HEADER_SIZE);
        if (headerSlice instanceof Promise) headerSlice = await headerSlice;
        if (!headerSlice) break;
        const id3V2Header = readId3V2Header(headerSlice);
        if (!id3V2Header) {
          break;
        }
        id3V2HeaderFound = true;
        let contentSlice = this.reader.requestSlice(headerSlice.filePos, id3V2Header.size);
        if (contentSlice instanceof Promise) contentSlice = await contentSlice;
        if (!contentSlice) break;
        parseId3V2Tag(contentSlice, id3V2Header, this.metadataTags);
        currentPos = headerSlice.filePos + id3V2Header.size;
      }
      if (!id3V2HeaderFound && this.reader.fileSize !== null && this.reader.fileSize >= ID3_V1_TAG_SIZE) {
        let slice = this.reader.requestSlice(this.reader.fileSize - ID3_V1_TAG_SIZE, ID3_V1_TAG_SIZE);
        if (slice instanceof Promise) slice = await slice;
        assert(slice);
        const tag = readAscii(slice, 3);
        if (tag === "TAG") {
          parseId3V1Tag(slice, this.metadataTags);
        }
      }
      return this.metadataTags;
    } finally {
      release();
    }
  }
};
var Mp3AudioTrackBacking = class {
  constructor(demuxer) {
    this.demuxer = demuxer;
  }
  getId() {
    return 1;
  }
  async getFirstTimestamp() {
    return 0;
  }
  getTimeResolution() {
    assert(this.demuxer.firstFrameHeader);
    return this.demuxer.firstFrameHeader.sampleRate / this.demuxer.firstFrameHeader.audioSamplesInFrame;
  }
  async computeDuration() {
    const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
    return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
  }
  getName() {
    return null;
  }
  getLanguageCode() {
    return UNDETERMINED_LANGUAGE;
  }
  getCodec() {
    return "mp3";
  }
  getInternalCodecId() {
    return null;
  }
  getNumberOfChannels() {
    assert(this.demuxer.firstFrameHeader);
    return this.demuxer.firstFrameHeader.channel === 3 ? 1 : 2;
  }
  getSampleRate() {
    assert(this.demuxer.firstFrameHeader);
    return this.demuxer.firstFrameHeader.sampleRate;
  }
  async getDecoderConfig() {
    assert(this.demuxer.firstFrameHeader);
    return {
      codec: "mp3",
      numberOfChannels: this.demuxer.firstFrameHeader.channel === 3 ? 1 : 2,
      sampleRate: this.demuxer.firstFrameHeader.sampleRate
    };
  }
  async getPacketAtIndex(sampleIndex, options) {
    if (sampleIndex === -1) {
      return null;
    }
    const rawSample = this.demuxer.loadedSamples[sampleIndex];
    if (!rawSample) {
      return null;
    }
    let data;
    if (options.metadataOnly) {
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.demuxer.reader.requestSlice(rawSample.dataStart, rawSample.dataSize);
      if (slice instanceof Promise) slice = await slice;
      if (!slice) {
        return null;
      }
      data = readBytes(slice, rawSample.dataSize);
    }
    return new EncodedPacket(
      data,
      "key",
      rawSample.timestamp,
      rawSample.duration,
      sampleIndex,
      rawSample.dataSize
    );
  }
  getFirstPacket(options) {
    return this.getPacketAtIndex(0, options);
  }
  async getNextPacket(packet, options) {
    const release = await this.demuxer.readingMutex.acquire();
    try {
      const sampleIndex = binarySearchExact(
        this.demuxer.loadedSamples,
        packet.timestamp,
        (x) => x.timestamp
      );
      if (sampleIndex === -1) {
        throw new Error("Packet was not created from this track.");
      }
      const nextIndex = sampleIndex + 1;
      while (nextIndex >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded) {
        await this.demuxer.advanceReader();
      }
      return this.getPacketAtIndex(nextIndex, options);
    } finally {
      release();
    }
  }
  async getPacket(timestamp, options) {
    const release = await this.demuxer.readingMutex.acquire();
    try {
      while (true) {
        const index = binarySearchLessOrEqual(
          this.demuxer.loadedSamples,
          timestamp,
          (x) => x.timestamp
        );
        if (index === -1 && this.demuxer.loadedSamples.length > 0) {
          return null;
        }
        if (this.demuxer.lastSampleLoaded) {
          return this.getPacketAtIndex(index, options);
        }
        if (index >= 0 && index + 1 < this.demuxer.loadedSamples.length) {
          return this.getPacketAtIndex(index, options);
        }
        await this.demuxer.advanceReader();
      }
    } finally {
      release();
    }
  }
  getKeyPacket(timestamp, options) {
    return this.getPacket(timestamp, options);
  }
  getNextKeyPacket(packet, options) {
    return this.getNextPacket(packet, options);
  }
};

// src/ogg/ogg-misc.ts
var OGGS = 1399285583;
var OGG_CRC_POLYNOMIAL = 79764919;
var OGG_CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let crc = n << 24;
  for (let k = 0; k < 8; k++) {
    crc = crc & 2147483648 ? crc << 1 ^ OGG_CRC_POLYNOMIAL : crc << 1;
  }
  OGG_CRC_TABLE[n] = crc >>> 0 & 4294967295;
}
var computeOggPageCrc = (bytes2) => {
  const view2 = toDataView(bytes2);
  const originalChecksum = view2.getUint32(22, true);
  view2.setUint32(22, 0, true);
  let crc = 0;
  for (let i = 0; i < bytes2.length; i++) {
    const byte = bytes2[i];
    crc = (crc << 8 ^ OGG_CRC_TABLE[crc >>> 24 ^ byte]) >>> 0;
  }
  view2.setUint32(22, originalChecksum, true);
  return crc;
};
var extractSampleMetadata = (data, codecInfo, vorbisLastBlocksize) => {
  let durationInSamples = 0;
  let currentBlocksize = null;
  if (data.length > 0) {
    if (codecInfo.codec === "vorbis") {
      assert(codecInfo.vorbisInfo);
      const vorbisModeCount = codecInfo.vorbisInfo.modeBlockflags.length;
      const bitCount = ilog(vorbisModeCount - 1);
      const modeMask = (1 << bitCount) - 1 << 1;
      const modeNumber = (data[0] & modeMask) >> 1;
      if (modeNumber >= codecInfo.vorbisInfo.modeBlockflags.length) {
        throw new Error("Invalid mode number.");
      }
      let prevBlocksize = vorbisLastBlocksize;
      const blockflag = codecInfo.vorbisInfo.modeBlockflags[modeNumber];
      currentBlocksize = codecInfo.vorbisInfo.blocksizes[blockflag];
      if (blockflag === 1) {
        const prevMask = (modeMask | 1) + 1;
        const flag = data[0] & prevMask ? 1 : 0;
        prevBlocksize = codecInfo.vorbisInfo.blocksizes[flag];
      }
      durationInSamples = prevBlocksize !== null ? prevBlocksize + currentBlocksize >> 2 : 0;
    } else if (codecInfo.codec === "opus") {
      const toc = parseOpusTocByte(data);
      durationInSamples = toc.durationInSamples;
    }
  }
  return {
    durationInSamples,
    vorbisBlockSize: currentBlocksize
  };
};
var buildOggMimeType = (info) => {
  let string = "audio/ogg";
  if (info.codecStrings) {
    const uniqueCodecMimeTypes = [...new Set(info.codecStrings)];
    string += `; codecs="${uniqueCodecMimeTypes.join(", ")}"`;
  }
  return string;
};

// src/ogg/ogg-reader.ts
var MIN_PAGE_HEADER_SIZE = 27;
var MAX_PAGE_HEADER_SIZE = 27 + 255;
var MAX_PAGE_SIZE = MAX_PAGE_HEADER_SIZE + 255 * 255;
var readPageHeader = (slice) => {
  const startPos = slice.filePos;
  const capturePattern = readU32Le(slice);
  if (capturePattern !== OGGS) {
    return null;
  }
  slice.skip(1);
  const headerType = readU8(slice);
  const granulePosition = readI64Le(slice);
  const serialNumber = readU32Le(slice);
  const sequenceNumber = readU32Le(slice);
  const checksum = readU32Le(slice);
  const numberPageSegments = readU8(slice);
  const lacingValues = new Uint8Array(numberPageSegments);
  for (let i = 0; i < numberPageSegments; i++) {
    lacingValues[i] = readU8(slice);
  }
  const headerSize = 27 + numberPageSegments;
  const dataSize = lacingValues.reduce((a, b) => a + b, 0);
  const totalSize = headerSize + dataSize;
  return {
    headerStartPos: startPos,
    totalSize,
    dataStartPos: startPos + headerSize,
    dataSize,
    headerType,
    granulePosition,
    serialNumber,
    sequenceNumber,
    checksum,
    lacingValues
  };
};
var findNextPageHeader = (slice, until) => {
  while (slice.filePos < until - (4 - 1)) {
    const word = readU32Le(slice);
    const firstByte = word & 255;
    const secondByte = word >>> 8 & 255;
    const thirdByte = word >>> 16 & 255;
    const fourthByte = word >>> 24 & 255;
    const O = 79;
    if (firstByte !== O && secondByte !== O && thirdByte !== O && fourthByte !== O) {
      continue;
    }
    slice.skip(-4);
    if (word === OGGS) {
      return true;
    }
    slice.skip(1);
  }
  return false;
};

// src/ogg/ogg-demuxer.ts
var OggDemuxer = class extends Demuxer {
  constructor(input) {
    super(input);
    this.metadataPromise = null;
    this.bitstreams = [];
    this.tracks = [];
    this.metadataTags = {};
    this.reader = input._reader;
  }
  async readMetadata() {
    return this.metadataPromise ??= (async () => {
      let currentPos = 0;
      while (true) {
        let slice = this.reader.requestSliceRange(currentPos, MIN_PAGE_HEADER_SIZE, MAX_PAGE_HEADER_SIZE);
        if (slice instanceof Promise) slice = await slice;
        if (!slice) break;
        const page = readPageHeader(slice);
        if (!page) {
          break;
        }
        const isBos = !!(page.headerType & 2);
        if (!isBos) {
          break;
        }
        this.bitstreams.push({
          serialNumber: page.serialNumber,
          bosPage: page,
          description: null,
          numberOfChannels: -1,
          sampleRate: -1,
          codecInfo: {
            codec: null,
            vorbisInfo: null,
            opusInfo: null
          },
          lastMetadataPacket: null
        });
        currentPos = page.headerStartPos + page.totalSize;
      }
      for (const bitstream of this.bitstreams) {
        const firstPacket = await this.readPacket(bitstream.bosPage, 0);
        if (!firstPacket) {
          continue;
        }
        if (
          // Check for Vorbis
          firstPacket.data.byteLength >= 7 && firstPacket.data[0] === 1 && firstPacket.data[1] === 118 && firstPacket.data[2] === 111 && firstPacket.data[3] === 114 && firstPacket.data[4] === 98 && firstPacket.data[5] === 105 && firstPacket.data[6] === 115
        ) {
          await this.readVorbisMetadata(firstPacket, bitstream);
        } else if (
          // Check for Opus
          firstPacket.data.byteLength >= 8 && firstPacket.data[0] === 79 && firstPacket.data[1] === 112 && firstPacket.data[2] === 117 && firstPacket.data[3] === 115 && firstPacket.data[4] === 72 && firstPacket.data[5] === 101 && firstPacket.data[6] === 97 && firstPacket.data[7] === 100
        ) {
          await this.readOpusMetadata(firstPacket, bitstream);
        }
        if (bitstream.codecInfo.codec !== null) {
          this.tracks.push(new InputAudioTrack(this.input, new OggAudioTrackBacking(bitstream, this)));
        }
      }
    })();
  }
  async readVorbisMetadata(firstPacket, bitstream) {
    let nextPacketPosition = await this.findNextPacketStart(firstPacket);
    if (!nextPacketPosition) {
      return;
    }
    const secondPacket = await this.readPacket(nextPacketPosition.startPage, nextPacketPosition.startSegmentIndex);
    if (!secondPacket) {
      return;
    }
    nextPacketPosition = await this.findNextPacketStart(secondPacket);
    if (!nextPacketPosition) {
      return;
    }
    const thirdPacket = await this.readPacket(nextPacketPosition.startPage, nextPacketPosition.startSegmentIndex);
    if (!thirdPacket) {
      return;
    }
    if (secondPacket.data[0] !== 3 || thirdPacket.data[0] !== 5) {
      return;
    }
    const lacingValues = [];
    const addBytesToSegmentTable = (bytes2) => {
      while (true) {
        lacingValues.push(Math.min(255, bytes2));
        if (bytes2 < 255) {
          break;
        }
        bytes2 -= 255;
      }
    };
    addBytesToSegmentTable(firstPacket.data.length);
    addBytesToSegmentTable(secondPacket.data.length);
    const description = new Uint8Array(
      1 + lacingValues.length + firstPacket.data.length + secondPacket.data.length + thirdPacket.data.length
    );
    description[0] = 2;
    description.set(
      lacingValues,
      1
    );
    description.set(
      firstPacket.data,
      1 + lacingValues.length
    );
    description.set(
      secondPacket.data,
      1 + lacingValues.length + firstPacket.data.length
    );
    description.set(
      thirdPacket.data,
      1 + lacingValues.length + firstPacket.data.length + secondPacket.data.length
    );
    bitstream.codecInfo.codec = "vorbis";
    bitstream.description = description;
    bitstream.lastMetadataPacket = thirdPacket;
    const view2 = toDataView(firstPacket.data);
    bitstream.numberOfChannels = view2.getUint8(11);
    bitstream.sampleRate = view2.getUint32(12, true);
    const blockSizeByte = view2.getUint8(28);
    bitstream.codecInfo.vorbisInfo = {
      blocksizes: [
        1 << (blockSizeByte & 15),
        1 << (blockSizeByte >> 4)
      ],
      modeBlockflags: parseModesFromVorbisSetupPacket(thirdPacket.data).modeBlockflags
    };
    readVorbisComments(secondPacket.data.subarray(7), this.metadataTags);
  }
  async readOpusMetadata(firstPacket, bitstream) {
    const nextPacketPosition = await this.findNextPacketStart(firstPacket);
    if (!nextPacketPosition) {
      return;
    }
    const secondPacket = await this.readPacket(
      nextPacketPosition.startPage,
      nextPacketPosition.startSegmentIndex
    );
    if (!secondPacket) {
      return;
    }
    bitstream.codecInfo.codec = "opus";
    bitstream.description = firstPacket.data;
    bitstream.lastMetadataPacket = secondPacket;
    const header = parseOpusIdentificationHeader(firstPacket.data);
    bitstream.numberOfChannels = header.outputChannelCount;
    bitstream.sampleRate = OPUS_SAMPLE_RATE;
    bitstream.codecInfo.opusInfo = {
      preSkip: header.preSkip
    };
    readVorbisComments(secondPacket.data.subarray(8), this.metadataTags);
  }
  async readPacket(startPage, startSegmentIndex) {
    assert(startSegmentIndex < startPage.lacingValues.length);
    let startDataOffset = 0;
    for (let i = 0; i < startSegmentIndex; i++) {
      startDataOffset += startPage.lacingValues[i];
    }
    let currentPage = startPage;
    let currentDataOffset = startDataOffset;
    let currentSegmentIndex = startSegmentIndex;
    const chunks = [];
    outer:
      while (true) {
        let pageSlice = this.reader.requestSlice(currentPage.dataStartPos, currentPage.dataSize);
        if (pageSlice instanceof Promise) pageSlice = await pageSlice;
        assert(pageSlice);
        const pageData = readBytes(pageSlice, currentPage.dataSize);
        while (true) {
          if (currentSegmentIndex === currentPage.lacingValues.length) {
            chunks.push(pageData.subarray(startDataOffset, currentDataOffset));
            break;
          }
          const lacingValue = currentPage.lacingValues[currentSegmentIndex];
          currentDataOffset += lacingValue;
          if (lacingValue < 255) {
            chunks.push(pageData.subarray(startDataOffset, currentDataOffset));
            break outer;
          }
          currentSegmentIndex++;
        }
        let currentPos = currentPage.headerStartPos + currentPage.totalSize;
        while (true) {
          let headerSlice = this.reader.requestSliceRange(currentPos, MIN_PAGE_HEADER_SIZE, MAX_PAGE_HEADER_SIZE);
          if (headerSlice instanceof Promise) headerSlice = await headerSlice;
          if (!headerSlice) {
            return null;
          }
          const nextPage = readPageHeader(headerSlice);
          if (!nextPage) {
            return null;
          }
          currentPage = nextPage;
          if (currentPage.serialNumber === startPage.serialNumber) {
            break;
          }
          currentPos = currentPage.headerStartPos + currentPage.totalSize;
        }
        startDataOffset = 0;
        currentDataOffset = 0;
        currentSegmentIndex = 0;
      }
    const totalPacketSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const packetData = new Uint8Array(totalPacketSize);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      packetData.set(chunk, offset);
      offset += chunk.length;
    }
    return {
      data: packetData,
      endPage: currentPage,
      endSegmentIndex: currentSegmentIndex
    };
  }
  async findNextPacketStart(lastPacket) {
    if (lastPacket.endSegmentIndex < lastPacket.endPage.lacingValues.length - 1) {
      return { startPage: lastPacket.endPage, startSegmentIndex: lastPacket.endSegmentIndex + 1 };
    }
    const isEos = !!(lastPacket.endPage.headerType & 4);
    if (isEos) {
      return null;
    }
    let currentPos = lastPacket.endPage.headerStartPos + lastPacket.endPage.totalSize;
    while (true) {
      let slice = this.reader.requestSliceRange(currentPos, MIN_PAGE_HEADER_SIZE, MAX_PAGE_HEADER_SIZE);
      if (slice instanceof Promise) slice = await slice;
      if (!slice) {
        return null;
      }
      const nextPage = readPageHeader(slice);
      if (!nextPage) {
        return null;
      }
      if (nextPage.serialNumber === lastPacket.endPage.serialNumber) {
        return { startPage: nextPage, startSegmentIndex: 0 };
      }
      currentPos = nextPage.headerStartPos + nextPage.totalSize;
    }
  }
  async getMimeType() {
    await this.readMetadata();
    const codecStrings = await Promise.all(this.tracks.map((x) => x.getCodecParameterString()));
    return buildOggMimeType({
      codecStrings: codecStrings.filter(Boolean)
    });
  }
  async getTracks() {
    await this.readMetadata();
    return this.tracks;
  }
  async computeDuration() {
    const tracks = await this.getTracks();
    const trackDurations = await Promise.all(tracks.map((x) => x.computeDuration()));
    return Math.max(0, ...trackDurations);
  }
  async getMetadataTags() {
    await this.readMetadata();
    return this.metadataTags;
  }
};
var OggAudioTrackBacking = class {
  constructor(bitstream, demuxer) {
    this.bitstream = bitstream;
    this.demuxer = demuxer;
    this.encodedPacketToMetadata = /* @__PURE__ */ new WeakMap();
    this.sequentialScanCache = [];
    this.sequentialScanMutex = new AsyncMutex();
    this.internalSampleRate = bitstream.codecInfo.codec === "opus" ? OPUS_SAMPLE_RATE : bitstream.sampleRate;
  }
  getId() {
    return this.bitstream.serialNumber;
  }
  getNumberOfChannels() {
    return this.bitstream.numberOfChannels;
  }
  getSampleRate() {
    return this.bitstream.sampleRate;
  }
  getTimeResolution() {
    return this.bitstream.sampleRate;
  }
  getCodec() {
    return this.bitstream.codecInfo.codec;
  }
  getInternalCodecId() {
    return null;
  }
  async getDecoderConfig() {
    assert(this.bitstream.codecInfo.codec);
    return {
      codec: this.bitstream.codecInfo.codec,
      numberOfChannels: this.bitstream.numberOfChannels,
      sampleRate: this.bitstream.sampleRate,
      description: this.bitstream.description ?? void 0
    };
  }
  getName() {
    return null;
  }
  getLanguageCode() {
    return UNDETERMINED_LANGUAGE;
  }
  async getFirstTimestamp() {
    return 0;
  }
  async computeDuration() {
    const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
    return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
  }
  granulePositionToTimestampInSamples(granulePosition) {
    if (this.bitstream.codecInfo.codec === "opus") {
      assert(this.bitstream.codecInfo.opusInfo);
      return granulePosition - this.bitstream.codecInfo.opusInfo.preSkip;
    }
    return granulePosition;
  }
  createEncodedPacketFromOggPacket(packet, additional, options) {
    if (!packet) {
      return null;
    }
    const { durationInSamples, vorbisBlockSize } = extractSampleMetadata(
      packet.data,
      this.bitstream.codecInfo,
      additional.vorbisLastBlocksize
    );
    const encodedPacket = new EncodedPacket(
      options.metadataOnly ? PLACEHOLDER_DATA : packet.data,
      "key",
      Math.max(0, additional.timestampInSamples) / this.internalSampleRate,
      durationInSamples / this.internalSampleRate,
      packet.endPage.headerStartPos + packet.endSegmentIndex,
      packet.data.byteLength
    );
    this.encodedPacketToMetadata.set(encodedPacket, {
      packet,
      timestampInSamples: additional.timestampInSamples,
      durationInSamples,
      vorbisLastBlockSize: additional.vorbisLastBlocksize,
      vorbisBlockSize
    });
    return encodedPacket;
  }
  async getFirstPacket(options) {
    assert(this.bitstream.lastMetadataPacket);
    const packetPosition = await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);
    if (!packetPosition) {
      return null;
    }
    let timestampInSamples = 0;
    if (this.bitstream.codecInfo.codec === "opus") {
      assert(this.bitstream.codecInfo.opusInfo);
      timestampInSamples -= this.bitstream.codecInfo.opusInfo.preSkip;
    }
    const packet = await this.demuxer.readPacket(packetPosition.startPage, packetPosition.startSegmentIndex);
    return this.createEncodedPacketFromOggPacket(
      packet,
      {
        timestampInSamples,
        vorbisLastBlocksize: null
      },
      options
    );
  }
  async getNextPacket(prevPacket, options) {
    const prevMetadata = this.encodedPacketToMetadata.get(prevPacket);
    if (!prevMetadata) {
      throw new Error("Packet was not created from this track.");
    }
    const packetPosition = await this.demuxer.findNextPacketStart(prevMetadata.packet);
    if (!packetPosition) {
      return null;
    }
    const timestampInSamples = prevMetadata.timestampInSamples + prevMetadata.durationInSamples;
    const packet = await this.demuxer.readPacket(
      packetPosition.startPage,
      packetPosition.startSegmentIndex
    );
    return this.createEncodedPacketFromOggPacket(
      packet,
      {
        timestampInSamples,
        vorbisLastBlocksize: prevMetadata.vorbisBlockSize
      },
      options
    );
  }
  async getPacket(timestamp, options) {
    if (this.demuxer.reader.fileSize === null) {
      return this.getPacketSequential(timestamp, options);
    }
    const timestampInSamples = roundToPrecision(timestamp * this.internalSampleRate, 14);
    if (timestampInSamples === 0) {
      return this.getFirstPacket(options);
    }
    if (timestampInSamples < 0) {
      return null;
    }
    assert(this.bitstream.lastMetadataPacket);
    const startPosition = await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);
    if (!startPosition) {
      return null;
    }
    let lowPage = startPosition.startPage;
    let high = this.demuxer.reader.fileSize;
    const lowPages = [lowPage];
    outer:
      while (lowPage.headerStartPos + lowPage.totalSize < high) {
        const low = lowPage.headerStartPos;
        const mid = Math.floor((low + high) / 2);
        let searchStartPos = mid;
        while (true) {
          const until = Math.min(
            searchStartPos + MAX_PAGE_SIZE,
            high - MIN_PAGE_HEADER_SIZE
          );
          let searchSlice = this.demuxer.reader.requestSlice(searchStartPos, until - searchStartPos);
          if (searchSlice instanceof Promise) searchSlice = await searchSlice;
          assert(searchSlice);
          const found = findNextPageHeader(searchSlice, until);
          if (!found) {
            high = mid + MIN_PAGE_HEADER_SIZE;
            continue outer;
          }
          let headerSlice = this.demuxer.reader.requestSliceRange(
            searchSlice.filePos,
            MIN_PAGE_HEADER_SIZE,
            MAX_PAGE_HEADER_SIZE
          );
          if (headerSlice instanceof Promise) headerSlice = await headerSlice;
          assert(headerSlice);
          const page = readPageHeader(headerSlice);
          assert(page);
          let pageValid = false;
          if (page.serialNumber === this.bitstream.serialNumber) {
            pageValid = true;
          } else {
            let pageSlice = this.demuxer.reader.requestSlice(page.headerStartPos, page.totalSize);
            if (pageSlice instanceof Promise) pageSlice = await pageSlice;
            assert(pageSlice);
            const bytes2 = readBytes(pageSlice, page.totalSize);
            const crc = computeOggPageCrc(bytes2);
            pageValid = crc === page.checksum;
          }
          if (!pageValid) {
            searchStartPos = page.headerStartPos + 4;
            continue;
          }
          if (pageValid && page.serialNumber !== this.bitstream.serialNumber) {
            searchStartPos = page.headerStartPos + page.totalSize;
            continue;
          }
          const isContinuationPage = page.granulePosition === -1;
          if (isContinuationPage) {
            searchStartPos = page.headerStartPos + page.totalSize;
            continue;
          }
          if (this.granulePositionToTimestampInSamples(page.granulePosition) > timestampInSamples) {
            high = page.headerStartPos;
          } else {
            lowPage = page;
            lowPages.push(page);
          }
          continue outer;
        }
      }
    let lowerPage = startPosition.startPage;
    for (const otherLowPage of lowPages) {
      if (otherLowPage.granulePosition === lowPage.granulePosition) {
        break;
      }
      if (!lowerPage || otherLowPage.headerStartPos > lowerPage.headerStartPos) {
        lowerPage = otherLowPage;
      }
    }
    let currentPage = lowerPage;
    const previousPages = [currentPage];
    while (true) {
      if (currentPage.serialNumber === this.bitstream.serialNumber && currentPage.granulePosition === lowPage.granulePosition) {
        break;
      }
      const nextPos = currentPage.headerStartPos + currentPage.totalSize;
      let slice = this.demuxer.reader.requestSliceRange(nextPos, MIN_PAGE_HEADER_SIZE, MAX_PAGE_HEADER_SIZE);
      if (slice instanceof Promise) slice = await slice;
      assert(slice);
      const nextPage = readPageHeader(slice);
      assert(nextPage);
      currentPage = nextPage;
      if (currentPage.serialNumber === this.bitstream.serialNumber) {
        previousPages.push(currentPage);
      }
    }
    assert(currentPage.granulePosition !== -1);
    let currentSegmentIndex = null;
    let currentTimestampInSamples;
    let currentTimestampIsCorrect;
    let endPage = currentPage;
    let endSegmentIndex = 0;
    if (currentPage.headerStartPos === startPosition.startPage.headerStartPos) {
      currentTimestampInSamples = this.granulePositionToTimestampInSamples(0);
      currentTimestampIsCorrect = true;
      currentSegmentIndex = 0;
    } else {
      currentTimestampInSamples = 0;
      currentTimestampIsCorrect = false;
      for (let i = currentPage.lacingValues.length - 1; i >= 0; i--) {
        const value = currentPage.lacingValues[i];
        if (value < 255) {
          currentSegmentIndex = i + 1;
          break;
        }
      }
      if (currentSegmentIndex === null) {
        throw new Error("Invalid page with granule position: no packets end on this page.");
      }
      endSegmentIndex = currentSegmentIndex - 1;
      const pseudopacket = {
        data: PLACEHOLDER_DATA,
        endPage,
        endSegmentIndex
      };
      const nextPosition = await this.demuxer.findNextPacketStart(pseudopacket);
      if (nextPosition) {
        const endPosition = findPreviousPacketEndPosition(previousPages, currentPage, currentSegmentIndex);
        assert(endPosition);
        const startPosition2 = findPacketStartPosition(
          previousPages,
          endPosition.page,
          endPosition.segmentIndex
        );
        if (startPosition2) {
          currentPage = startPosition2.page;
          currentSegmentIndex = startPosition2.segmentIndex;
        }
      } else {
        while (true) {
          const endPosition = findPreviousPacketEndPosition(
            previousPages,
            currentPage,
            currentSegmentIndex
          );
          if (!endPosition) {
            break;
          }
          const startPosition2 = findPacketStartPosition(
            previousPages,
            endPosition.page,
            endPosition.segmentIndex
          );
          if (!startPosition2) {
            break;
          }
          currentPage = startPosition2.page;
          currentSegmentIndex = startPosition2.segmentIndex;
          if (endPosition.page.headerStartPos !== endPage.headerStartPos) {
            endPage = endPosition.page;
            endSegmentIndex = endPosition.segmentIndex;
            break;
          }
        }
      }
    }
    let lastEncodedPacket = null;
    let lastEncodedPacketMetadata = null;
    while (currentPage !== null) {
      assert(currentSegmentIndex !== null);
      const packet = await this.demuxer.readPacket(currentPage, currentSegmentIndex);
      if (!packet) {
        break;
      }
      const skipPacket = currentPage.headerStartPos === startPosition.startPage.headerStartPos && currentSegmentIndex < startPosition.startSegmentIndex;
      if (!skipPacket) {
        let encodedPacket = this.createEncodedPacketFromOggPacket(
          packet,
          {
            timestampInSamples: currentTimestampInSamples,
            vorbisLastBlocksize: lastEncodedPacketMetadata?.vorbisBlockSize ?? null
          },
          options
        );
        assert(encodedPacket);
        let encodedPacketMetadata = this.encodedPacketToMetadata.get(encodedPacket);
        assert(encodedPacketMetadata);
        if (!currentTimestampIsCorrect && packet.endPage.headerStartPos === endPage.headerStartPos && packet.endSegmentIndex === endSegmentIndex) {
          currentTimestampInSamples = this.granulePositionToTimestampInSamples(
            currentPage.granulePosition
          );
          currentTimestampIsCorrect = true;
          encodedPacket = this.createEncodedPacketFromOggPacket(
            packet,
            {
              timestampInSamples: currentTimestampInSamples - encodedPacketMetadata.durationInSamples,
              vorbisLastBlocksize: lastEncodedPacketMetadata?.vorbisBlockSize ?? null
            },
            options
          );
          assert(encodedPacket);
          encodedPacketMetadata = this.encodedPacketToMetadata.get(encodedPacket);
          assert(encodedPacketMetadata);
        } else {
          currentTimestampInSamples += encodedPacketMetadata.durationInSamples;
        }
        lastEncodedPacket = encodedPacket;
        lastEncodedPacketMetadata = encodedPacketMetadata;
        if (currentTimestampIsCorrect && // Next timestamp will be too late
        (Math.max(currentTimestampInSamples, 0) > timestampInSamples || Math.max(encodedPacketMetadata.timestampInSamples, 0) === timestampInSamples)) {
          break;
        }
      }
      const nextPosition = await this.demuxer.findNextPacketStart(packet);
      if (!nextPosition) {
        break;
      }
      currentPage = nextPosition.startPage;
      currentSegmentIndex = nextPosition.startSegmentIndex;
    }
    return lastEncodedPacket;
  }
  // A slower but simpler and sequential algorithm for finding a packet in a file
  async getPacketSequential(timestamp, options) {
    const release = await this.sequentialScanMutex.acquire();
    try {
      const timestampInSamples = roundToPrecision(timestamp * this.internalSampleRate, 14);
      timestamp = timestampInSamples / this.internalSampleRate;
      const index = binarySearchLessOrEqual(
        this.sequentialScanCache,
        timestampInSamples,
        (x) => x.timestampInSamples
      );
      let currentPacket;
      if (index !== -1) {
        const cacheEntry = this.sequentialScanCache[index];
        currentPacket = this.createEncodedPacketFromOggPacket(
          cacheEntry.packet,
          {
            timestampInSamples: cacheEntry.timestampInSamples,
            vorbisLastBlocksize: cacheEntry.vorbisLastBlockSize
          },
          options
        );
      } else {
        currentPacket = await this.getFirstPacket(options);
      }
      let i = 0;
      while (currentPacket && currentPacket.timestamp < timestamp) {
        const nextPacket = await this.getNextPacket(currentPacket, options);
        if (!nextPacket || nextPacket.timestamp > timestamp) {
          break;
        }
        currentPacket = nextPacket;
        i++;
        if (i === 100) {
          i = 0;
          const metadata = this.encodedPacketToMetadata.get(currentPacket);
          assert(metadata);
          if (this.sequentialScanCache.length > 0) {
            assert(last(this.sequentialScanCache).timestampInSamples <= metadata.timestampInSamples);
          }
          this.sequentialScanCache.push(metadata);
        }
      }
      return currentPacket;
    } finally {
      release();
    }
  }
  getKeyPacket(timestamp, options) {
    return this.getPacket(timestamp, options);
  }
  getNextKeyPacket(packet, options) {
    return this.getNextPacket(packet, options);
  }
};
var findPacketStartPosition = (pageList, endPage, endSegmentIndex) => {
  let page = endPage;
  let segmentIndex = endSegmentIndex;
  outer:
    while (true) {
      segmentIndex--;
      for (segmentIndex; segmentIndex >= 0; segmentIndex--) {
        const lacingValue = page.lacingValues[segmentIndex];
        if (lacingValue < 255) {
          segmentIndex++;
          break outer;
        }
      }
      assert(segmentIndex === -1);
      const pageStartsWithFreshPacket = !(page.headerType & 1);
      if (pageStartsWithFreshPacket) {
        segmentIndex = 0;
        break;
      }
      const previousPage = findLast(
        pageList,
        (x) => x.headerStartPos < page.headerStartPos
      );
      if (!previousPage) {
        return null;
      }
      page = previousPage;
      segmentIndex = page.lacingValues.length;
    }
  assert(segmentIndex !== -1);
  if (segmentIndex === page.lacingValues.length) {
    const nextPage = pageList[pageList.indexOf(page) + 1];
    assert(nextPage);
    page = nextPage;
    segmentIndex = 0;
  }
  return { page, segmentIndex };
};
var findPreviousPacketEndPosition = (pageList, startPage, startSegmentIndex) => {
  if (startSegmentIndex > 0) {
    return { page: startPage, segmentIndex: startSegmentIndex - 1 };
  }
  const previousPage = findLast(
    pageList,
    (x) => x.headerStartPos < startPage.headerStartPos
  );
  if (!previousPage) {
    return null;
  }
  return { page: previousPage, segmentIndex: previousPage.lacingValues.length - 1 };
};

// src/wave/wave-demuxer.ts
var WaveDemuxer = class extends Demuxer {
  constructor(input) {
    super(input);
    this.metadataPromise = null;
    this.dataStart = -1;
    this.dataSize = -1;
    this.audioInfo = null;
    this.tracks = [];
    this.lastKnownPacketIndex = 0;
    this.metadataTags = {};
    this.reader = input._reader;
  }
  async readMetadata() {
    return this.metadataPromise ??= (async () => {
      let slice = this.reader.requestSlice(0, 12);
      if (slice instanceof Promise) slice = await slice;
      assert(slice);
      const riffType = readAscii(slice, 4);
      const littleEndian = riffType !== "RIFX";
      const isRf64 = riffType === "RF64";
      const outerChunkSize = readU32(slice, littleEndian);
      let totalFileSize = isRf64 ? this.reader.fileSize : Math.min(outerChunkSize + 8, this.reader.fileSize ?? Infinity);
      const format = readAscii(slice, 4);
      if (format !== "WAVE") {
        throw new Error("Invalid WAVE file - wrong format");
      }
      let chunksRead = 0;
      let dataChunkSize = null;
      let currentPos = slice.filePos;
      while (totalFileSize === null || currentPos < totalFileSize) {
        let slice2 = this.reader.requestSlice(currentPos, 8);
        if (slice2 instanceof Promise) slice2 = await slice2;
        if (!slice2) break;
        const chunkId = readAscii(slice2, 4);
        const chunkSize = readU32(slice2, littleEndian);
        const startPos = slice2.filePos;
        if (isRf64 && chunksRead === 0 && chunkId !== "ds64") {
          throw new Error('Invalid RF64 file: First chunk must be "ds64".');
        }
        if (chunkId === "fmt ") {
          await this.parseFmtChunk(startPos, chunkSize, littleEndian);
        } else if (chunkId === "data") {
          dataChunkSize ??= chunkSize;
          this.dataStart = slice2.filePos;
          this.dataSize = Math.min(dataChunkSize, (totalFileSize ?? Infinity) - this.dataStart);
          if (this.reader.fileSize === null) {
            break;
          }
        } else if (chunkId === "ds64") {
          let ds64Slice = this.reader.requestSlice(startPos, chunkSize);
          if (ds64Slice instanceof Promise) ds64Slice = await ds64Slice;
          if (!ds64Slice) break;
          const riffChunkSize = readU64(ds64Slice, littleEndian);
          dataChunkSize = readU64(ds64Slice, littleEndian);
          totalFileSize = Math.min(riffChunkSize + 8, this.reader.fileSize ?? Infinity);
        } else if (chunkId === "LIST") {
          await this.parseListChunk(startPos, chunkSize, littleEndian);
        } else if (chunkId === "ID3 " || chunkId === "id3 ") {
          await this.parseId3Chunk(startPos, chunkSize);
        }
        currentPos = startPos + chunkSize + (chunkSize & 1);
        chunksRead++;
      }
      if (!this.audioInfo) {
        throw new Error('Invalid WAVE file - missing "fmt " chunk');
      }
      if (this.dataStart === -1) {
        throw new Error('Invalid WAVE file - missing "data" chunk');
      }
      const blockSize = this.audioInfo.blockSizeInBytes;
      this.dataSize = Math.floor(this.dataSize / blockSize) * blockSize;
      this.tracks.push(new InputAudioTrack(this.input, new WaveAudioTrackBacking(this)));
    })();
  }
  async parseFmtChunk(startPos, size, littleEndian) {
    let slice = this.reader.requestSlice(startPos, size);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return;
    let formatTag = readU16(slice, littleEndian);
    const numChannels = readU16(slice, littleEndian);
    const sampleRate = readU32(slice, littleEndian);
    slice.skip(4);
    const blockAlign = readU16(slice, littleEndian);
    let bitsPerSample;
    if (size === 14) {
      bitsPerSample = 8;
    } else {
      bitsPerSample = readU16(slice, littleEndian);
    }
    if (size >= 18 && formatTag !== 357) {
      const cbSize = readU16(slice, littleEndian);
      const remainingSize = size - 18;
      const extensionSize = Math.min(remainingSize, cbSize);
      if (extensionSize >= 22 && formatTag === 65534 /* EXTENSIBLE */) {
        slice.skip(2 + 4);
        const subFormat = readBytes(slice, 16);
        formatTag = subFormat[0] | subFormat[1] << 8;
      }
    }
    if (formatTag === 7 /* MULAW */ || formatTag === 6 /* ALAW */) {
      bitsPerSample = 8;
    }
    this.audioInfo = {
      format: formatTag,
      numberOfChannels: numChannels,
      sampleRate,
      sampleSizeInBytes: Math.ceil(bitsPerSample / 8),
      blockSizeInBytes: blockAlign
    };
  }
  async parseListChunk(startPos, size, littleEndian) {
    let slice = this.reader.requestSlice(startPos, size);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return;
    const infoType = readAscii(slice, 4);
    if (infoType !== "INFO" && infoType !== "INF0") {
      return;
    }
    let currentPos = slice.filePos;
    while (currentPos <= startPos + size - 8) {
      slice.filePos = currentPos;
      const chunkName = readAscii(slice, 4);
      const chunkSize = readU32(slice, littleEndian);
      const bytes2 = readBytes(slice, chunkSize);
      let stringLength = 0;
      for (let i = 0; i < bytes2.length; i++) {
        if (bytes2[i] === 0) {
          break;
        }
        stringLength++;
      }
      const value = String.fromCharCode(...bytes2.subarray(0, stringLength));
      this.metadataTags.raw ??= {};
      this.metadataTags.raw[chunkName] = value;
      switch (chunkName) {
        case "INAM":
        case "TITL":
          {
            this.metadataTags.title ??= value;
          }
          ;
          break;
        case "TIT3":
          {
            this.metadataTags.description ??= value;
          }
          ;
          break;
        case "IART":
          {
            this.metadataTags.artist ??= value;
          }
          ;
          break;
        case "IPRD":
          {
            this.metadataTags.album ??= value;
          }
          ;
          break;
        case "IPRT":
        case "ITRK":
        case "TRCK":
          {
            const parts = value.split("/");
            const trackNum = Number.parseInt(parts[0], 10);
            const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
            if (Number.isInteger(trackNum) && trackNum > 0) {
              this.metadataTags.trackNumber ??= trackNum;
            }
            if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
              this.metadataTags.tracksTotal ??= tracksTotal;
            }
          }
          ;
          break;
        case "ICRD":
        case "IDIT":
          {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) {
              this.metadataTags.date ??= date;
            }
          }
          ;
          break;
        case "YEAR":
          {
            const year = Number.parseInt(value, 10);
            if (Number.isInteger(year) && year > 0) {
              this.metadataTags.date ??= new Date(year, 0, 1);
            }
          }
          ;
          break;
        case "IGNR":
        case "GENR":
          {
            this.metadataTags.genre ??= value;
          }
          ;
          break;
        case "ICMT":
        case "CMNT":
        case "COMM":
          {
            this.metadataTags.comment ??= value;
          }
          ;
          break;
      }
      currentPos += 8 + chunkSize + (chunkSize & 1);
    }
  }
  async parseId3Chunk(startPos, size) {
    let slice = this.reader.requestSlice(startPos, size);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return;
    const id3V2Header = readId3V2Header(slice);
    if (id3V2Header) {
      const contentSlice = slice.slice(startPos + 10, id3V2Header.size);
      parseId3V2Tag(contentSlice, id3V2Header, this.metadataTags);
    }
  }
  getCodec() {
    assert(this.audioInfo);
    if (this.audioInfo.format === 7 /* MULAW */) {
      return "ulaw";
    }
    if (this.audioInfo.format === 6 /* ALAW */) {
      return "alaw";
    }
    if (this.audioInfo.format === 1 /* PCM */) {
      if (this.audioInfo.sampleSizeInBytes === 1) {
        return "pcm-u8";
      } else if (this.audioInfo.sampleSizeInBytes === 2) {
        return "pcm-s16";
      } else if (this.audioInfo.sampleSizeInBytes === 3) {
        return "pcm-s24";
      } else if (this.audioInfo.sampleSizeInBytes === 4) {
        return "pcm-s32";
      }
    }
    if (this.audioInfo.format === 3 /* IEEE_FLOAT */) {
      if (this.audioInfo.sampleSizeInBytes === 4) {
        return "pcm-f32";
      }
    }
    return null;
  }
  async getMimeType() {
    return "audio/wav";
  }
  async computeDuration() {
    await this.readMetadata();
    const track = this.tracks[0];
    assert(track);
    return track.computeDuration();
  }
  async getTracks() {
    await this.readMetadata();
    return this.tracks;
  }
  async getMetadataTags() {
    await this.readMetadata();
    return this.metadataTags;
  }
};
var PACKET_SIZE_IN_FRAMES = 2048;
var WaveAudioTrackBacking = class {
  constructor(demuxer) {
    this.demuxer = demuxer;
  }
  getId() {
    return 1;
  }
  getCodec() {
    return this.demuxer.getCodec();
  }
  getInternalCodecId() {
    assert(this.demuxer.audioInfo);
    return this.demuxer.audioInfo.format;
  }
  async getDecoderConfig() {
    const codec = this.demuxer.getCodec();
    if (!codec) {
      return null;
    }
    assert(this.demuxer.audioInfo);
    return {
      codec,
      numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
      sampleRate: this.demuxer.audioInfo.sampleRate
    };
  }
  async computeDuration() {
    const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
    return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
  }
  getNumberOfChannels() {
    assert(this.demuxer.audioInfo);
    return this.demuxer.audioInfo.numberOfChannels;
  }
  getSampleRate() {
    assert(this.demuxer.audioInfo);
    return this.demuxer.audioInfo.sampleRate;
  }
  getTimeResolution() {
    assert(this.demuxer.audioInfo);
    return this.demuxer.audioInfo.sampleRate;
  }
  getName() {
    return null;
  }
  getLanguageCode() {
    return UNDETERMINED_LANGUAGE;
  }
  async getFirstTimestamp() {
    return 0;
  }
  async getPacketAtIndex(packetIndex, options) {
    assert(this.demuxer.audioInfo);
    const startOffset = packetIndex * PACKET_SIZE_IN_FRAMES * this.demuxer.audioInfo.blockSizeInBytes;
    if (startOffset >= this.demuxer.dataSize) {
      return null;
    }
    const sizeInBytes = Math.min(
      PACKET_SIZE_IN_FRAMES * this.demuxer.audioInfo.blockSizeInBytes,
      this.demuxer.dataSize - startOffset
    );
    if (this.demuxer.reader.fileSize === null) {
      let slice = this.demuxer.reader.requestSlice(this.demuxer.dataStart + startOffset, sizeInBytes);
      if (slice instanceof Promise) slice = await slice;
      if (!slice) {
        return null;
      }
    }
    let data;
    if (options.metadataOnly) {
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.demuxer.reader.requestSlice(this.demuxer.dataStart + startOffset, sizeInBytes);
      if (slice instanceof Promise) slice = await slice;
      assert(slice);
      data = readBytes(slice, sizeInBytes);
    }
    const timestamp = packetIndex * PACKET_SIZE_IN_FRAMES / this.demuxer.audioInfo.sampleRate;
    const duration = sizeInBytes / this.demuxer.audioInfo.blockSizeInBytes / this.demuxer.audioInfo.sampleRate;
    this.demuxer.lastKnownPacketIndex = Math.max(
      packetIndex,
      timestamp
    );
    return new EncodedPacket(
      data,
      "key",
      timestamp,
      duration,
      packetIndex,
      sizeInBytes
    );
  }
  getFirstPacket(options) {
    return this.getPacketAtIndex(0, options);
  }
  async getPacket(timestamp, options) {
    assert(this.demuxer.audioInfo);
    const packetIndex = Math.floor(Math.min(
      timestamp * this.demuxer.audioInfo.sampleRate / PACKET_SIZE_IN_FRAMES,
      (this.demuxer.dataSize - 1) / (PACKET_SIZE_IN_FRAMES * this.demuxer.audioInfo.blockSizeInBytes)
    ));
    const packet = await this.getPacketAtIndex(packetIndex, options);
    if (packet) {
      return packet;
    }
    if (packetIndex === 0) {
      return null;
    }
    assert(this.demuxer.reader.fileSize === null);
    let currentPacket = await this.getPacketAtIndex(this.demuxer.lastKnownPacketIndex, options);
    while (currentPacket) {
      const nextPacket = await this.getNextPacket(currentPacket, options);
      if (!nextPacket) {
        break;
      }
      currentPacket = nextPacket;
    }
    return currentPacket;
  }
  getNextPacket(packet, options) {
    assert(this.demuxer.audioInfo);
    const packetIndex = Math.round(packet.timestamp * this.demuxer.audioInfo.sampleRate / PACKET_SIZE_IN_FRAMES);
    return this.getPacketAtIndex(packetIndex + 1, options);
  }
  getKeyPacket(timestamp, options) {
    return this.getPacket(timestamp, options);
  }
  getNextKeyPacket(packet, options) {
    return this.getNextPacket(packet, options);
  }
};

// src/adts/adts-reader.ts
var MIN_FRAME_HEADER_SIZE = 7;
var MAX_FRAME_HEADER_SIZE = 9;
var readFrameHeader2 = (slice) => {
  const startPos = slice.filePos;
  const bytes2 = readBytes(slice, 9);
  const bitstream = new Bitstream(bytes2);
  const syncword = bitstream.readBits(12);
  if (syncword !== 4095) {
    return null;
  }
  bitstream.skipBits(1);
  const layer = bitstream.readBits(2);
  if (layer !== 0) {
    return null;
  }
  const protectionAbsence = bitstream.readBits(1);
  const objectType = bitstream.readBits(2) + 1;
  const samplingFrequencyIndex = bitstream.readBits(4);
  if (samplingFrequencyIndex === 15) {
    return null;
  }
  bitstream.skipBits(1);
  const channelConfiguration = bitstream.readBits(3);
  if (channelConfiguration === 0) {
    throw new Error("ADTS frames with channel configuration 0 are not supported.");
  }
  bitstream.skipBits(1);
  bitstream.skipBits(1);
  bitstream.skipBits(1);
  bitstream.skipBits(1);
  const frameLength = bitstream.readBits(13);
  bitstream.skipBits(11);
  const numberOfAacFrames = bitstream.readBits(2) + 1;
  if (numberOfAacFrames !== 1) {
    throw new Error("ADTS frames with more than one AAC frame are not supported.");
  }
  let crcCheck = null;
  if (protectionAbsence === 1) {
    slice.filePos -= 2;
  } else {
    crcCheck = bitstream.readBits(16);
  }
  return {
    objectType,
    samplingFrequencyIndex,
    channelConfiguration,
    frameLength,
    numberOfAacFrames,
    crcCheck,
    startPos
  };
};

// src/adts/adts-demuxer.ts
var SAMPLES_PER_AAC_FRAME = 1024;
var AdtsDemuxer = class extends Demuxer {
  constructor(input) {
    super(input);
    this.metadataPromise = null;
    this.firstFrameHeader = null;
    this.loadedSamples = [];
    this.tracks = [];
    this.readingMutex = new AsyncMutex();
    this.lastSampleLoaded = false;
    this.lastLoadedPos = 0;
    this.nextTimestampInSamples = 0;
    this.reader = input._reader;
  }
  async readMetadata() {
    return this.metadataPromise ??= (async () => {
      while (!this.firstFrameHeader && !this.lastSampleLoaded) {
        await this.advanceReader();
      }
      assert(this.firstFrameHeader);
      this.tracks = [new InputAudioTrack(this.input, new AdtsAudioTrackBacking(this))];
    })();
  }
  async advanceReader() {
    let slice = this.reader.requestSliceRange(this.lastLoadedPos, MIN_FRAME_HEADER_SIZE, MAX_FRAME_HEADER_SIZE);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) {
      this.lastSampleLoaded = true;
      return;
    }
    const header = readFrameHeader2(slice);
    if (!header) {
      this.lastSampleLoaded = true;
      return;
    }
    if (this.reader.fileSize !== null && header.startPos + header.frameLength > this.reader.fileSize) {
      this.lastSampleLoaded = true;
      return;
    }
    if (!this.firstFrameHeader) {
      this.firstFrameHeader = header;
    }
    const sampleRate = aacFrequencyTable[header.samplingFrequencyIndex];
    assert(sampleRate !== void 0);
    const sampleDuration = SAMPLES_PER_AAC_FRAME / sampleRate;
    const headerSize = header.crcCheck ? MAX_FRAME_HEADER_SIZE : MIN_FRAME_HEADER_SIZE;
    const sample = {
      timestamp: this.nextTimestampInSamples / sampleRate,
      duration: sampleDuration,
      dataStart: header.startPos + headerSize,
      dataSize: header.frameLength - headerSize
    };
    this.loadedSamples.push(sample);
    this.nextTimestampInSamples += SAMPLES_PER_AAC_FRAME;
    this.lastLoadedPos = header.startPos + header.frameLength;
  }
  async getMimeType() {
    return "audio/aac";
  }
  async getTracks() {
    await this.readMetadata();
    return this.tracks;
  }
  async computeDuration() {
    await this.readMetadata();
    const track = this.tracks[0];
    assert(track);
    return track.computeDuration();
  }
  async getMetadataTags() {
    return {};
  }
};
var AdtsAudioTrackBacking = class {
  constructor(demuxer) {
    this.demuxer = demuxer;
  }
  getId() {
    return 1;
  }
  async getFirstTimestamp() {
    return 0;
  }
  getTimeResolution() {
    const sampleRate = this.getSampleRate();
    return sampleRate / SAMPLES_PER_AAC_FRAME;
  }
  async computeDuration() {
    const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
    return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
  }
  getName() {
    return null;
  }
  getLanguageCode() {
    return UNDETERMINED_LANGUAGE;
  }
  getCodec() {
    return "aac";
  }
  getInternalCodecId() {
    assert(this.demuxer.firstFrameHeader);
    return this.demuxer.firstFrameHeader.objectType;
  }
  getNumberOfChannels() {
    assert(this.demuxer.firstFrameHeader);
    const numberOfChannels = aacChannelMap[this.demuxer.firstFrameHeader.channelConfiguration];
    assert(numberOfChannels !== void 0);
    return numberOfChannels;
  }
  getSampleRate() {
    assert(this.demuxer.firstFrameHeader);
    const sampleRate = aacFrequencyTable[this.demuxer.firstFrameHeader.samplingFrequencyIndex];
    assert(sampleRate !== void 0);
    return sampleRate;
  }
  async getDecoderConfig() {
    assert(this.demuxer.firstFrameHeader);
    const bytes2 = new Uint8Array(3);
    const bitstream = new Bitstream(bytes2);
    const { objectType, samplingFrequencyIndex, channelConfiguration } = this.demuxer.firstFrameHeader;
    if (objectType > 31) {
      bitstream.writeBits(5, 31);
      bitstream.writeBits(6, objectType - 32);
    } else {
      bitstream.writeBits(5, objectType);
    }
    bitstream.writeBits(4, samplingFrequencyIndex);
    bitstream.writeBits(4, channelConfiguration);
    return {
      codec: `mp4a.40.${this.demuxer.firstFrameHeader.objectType}`,
      numberOfChannels: this.getNumberOfChannels(),
      sampleRate: this.getSampleRate(),
      description: bytes2.subarray(0, Math.ceil((bitstream.pos - 1) / 8))
    };
  }
  async getPacketAtIndex(sampleIndex, options) {
    if (sampleIndex === -1) {
      return null;
    }
    const rawSample = this.demuxer.loadedSamples[sampleIndex];
    if (!rawSample) {
      return null;
    }
    let data;
    if (options.metadataOnly) {
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.demuxer.reader.requestSlice(rawSample.dataStart, rawSample.dataSize);
      if (slice instanceof Promise) slice = await slice;
      if (!slice) {
        return null;
      }
      data = readBytes(slice, rawSample.dataSize);
    }
    return new EncodedPacket(
      data,
      "key",
      rawSample.timestamp,
      rawSample.duration,
      sampleIndex,
      rawSample.dataSize
    );
  }
  getFirstPacket(options) {
    return this.getPacketAtIndex(0, options);
  }
  async getNextPacket(packet, options) {
    const release = await this.demuxer.readingMutex.acquire();
    try {
      const sampleIndex = binarySearchExact(
        this.demuxer.loadedSamples,
        packet.timestamp,
        (x) => x.timestamp
      );
      if (sampleIndex === -1) {
        throw new Error("Packet was not created from this track.");
      }
      const nextIndex = sampleIndex + 1;
      while (nextIndex >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded) {
        await this.demuxer.advanceReader();
      }
      return this.getPacketAtIndex(nextIndex, options);
    } finally {
      release();
    }
  }
  async getPacket(timestamp, options) {
    const release = await this.demuxer.readingMutex.acquire();
    try {
      while (true) {
        const index = binarySearchLessOrEqual(
          this.demuxer.loadedSamples,
          timestamp,
          (x) => x.timestamp
        );
        if (index === -1 && this.demuxer.loadedSamples.length > 0) {
          return null;
        }
        if (this.demuxer.lastSampleLoaded) {
          return this.getPacketAtIndex(index, options);
        }
        if (index >= 0 && index + 1 < this.demuxer.loadedSamples.length) {
          return this.getPacketAtIndex(index, options);
        }
        await this.demuxer.advanceReader();
      }
    } finally {
      release();
    }
  }
  getKeyPacket(timestamp, options) {
    return this.getPacket(timestamp, options);
  }
  getNextKeyPacket(packet, options) {
    return this.getNextPacket(packet, options);
  }
};

// src/flac/flac-misc.ts
var getBlockSizeOrUncommon = (bits) => {
  if (bits === 0) {
    return null;
  } else if (bits === 1) {
    return 192;
  } else if (bits >= 2 && bits <= 5) {
    return 144 * 2 ** bits;
  } else if (bits === 6) {
    return "uncommon-u8";
  } else if (bits === 7) {
    return "uncommon-u16";
  } else if (bits >= 8 && bits <= 15) {
    return 2 ** bits;
  } else {
    return null;
  }
};
var getSampleRateOrUncommon = (sampleRateBits, streamInfoSampleRate) => {
  switch (sampleRateBits) {
    case 0:
      return streamInfoSampleRate;
    case 1:
      return 88200;
    case 2:
      return 176400;
    case 3:
      return 192e3;
    case 4:
      return 8e3;
    case 5:
      return 16e3;
    case 6:
      return 22050;
    case 7:
      return 24e3;
    case 8:
      return 32e3;
    case 9:
      return 44100;
    case 10:
      return 48e3;
    case 11:
      return 96e3;
    case 12:
      return "uncommon-u8";
    case 13:
      return "uncommon-u16";
    case 14:
      return "uncommon-u16-10";
    default:
      return null;
  }
};
var readCodedNumber = (fileSlice) => {
  let ones = 0;
  const bitstream1 = new Bitstream(readBytes(fileSlice, 1));
  while (bitstream1.readBits(1) === 1) {
    ones++;
  }
  if (ones === 0) {
    return bitstream1.readBits(7);
  }
  const bitArray = [];
  const extraBytes = ones - 1;
  const bitstream2 = new Bitstream(readBytes(fileSlice, extraBytes));
  const firstByteBits = 8 - ones - 1;
  for (let i = 0; i < firstByteBits; i++) {
    bitArray.unshift(bitstream1.readBits(1));
  }
  for (let i = 0; i < extraBytes; i++) {
    for (let j = 0; j < 8; j++) {
      const val = bitstream2.readBits(1);
      if (j < 2) {
        continue;
      }
      bitArray.unshift(val);
    }
  }
  const encoded = bitArray.reduce((acc, bit, index) => {
    return acc | bit << index;
  }, 0);
  return encoded;
};
var readBlockSize = (slice, blockSizeBits) => {
  if (blockSizeBits === "uncommon-u16") {
    return readU16Be(slice) + 1;
  } else if (blockSizeBits === "uncommon-u8") {
    return readU8(slice) + 1;
  } else if (typeof blockSizeBits === "number") {
    return blockSizeBits;
  } else {
    assertNever(blockSizeBits);
    assert(false);
  }
};
var readSampleRate = (slice, sampleRateOrUncommon) => {
  if (sampleRateOrUncommon === "uncommon-u16") {
    return readU16Be(slice);
  }
  if (sampleRateOrUncommon === "uncommon-u16-10") {
    return readU16Be(slice) * 10;
  }
  if (sampleRateOrUncommon === "uncommon-u8") {
    return readU8(slice);
  }
  if (typeof sampleRateOrUncommon === "number") {
    return sampleRateOrUncommon;
  }
  return null;
};
var calculateCrc8 = (data) => {
  const polynomial = 7;
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if ((crc & 128) !== 0) {
        crc = crc << 1 ^ polynomial;
      } else {
        crc <<= 1;
      }
      crc &= 255;
    }
  }
  return crc;
};

// src/flac/flac-demuxer.ts
var FlacDemuxer = class extends Demuxer {
  constructor(input) {
    super(input);
    this.loadedSamples = [];
    // All samples from the start of the file to lastLoadedPos
    this.metadataPromise = null;
    this.track = null;
    this.metadataTags = {};
    this.audioInfo = null;
    this.lastLoadedPos = null;
    this.blockingBit = null;
    this.readingMutex = new AsyncMutex();
    this.lastSampleLoaded = false;
    this.reader = input._reader;
  }
  async computeDuration() {
    await this.readMetadata();
    assert(this.track);
    return this.track.computeDuration();
  }
  async getMetadataTags() {
    await this.readMetadata();
    return this.metadataTags;
  }
  async getTracks() {
    await this.readMetadata();
    assert(this.track);
    return [this.track];
  }
  async getMimeType() {
    return "audio/flac";
  }
  async readMetadata() {
    let currentPos = 4;
    return this.metadataPromise ??= (async () => {
      while (this.reader.fileSize === null || currentPos < this.reader.fileSize) {
        let sizeSlice = this.reader.requestSlice(currentPos, 4);
        if (sizeSlice instanceof Promise) sizeSlice = await sizeSlice;
        currentPos += 4;
        if (sizeSlice === null) {
          throw new Error(
            `Metadata block at position ${currentPos} is too small! Corrupted file.`
          );
        }
        assert(sizeSlice);
        const byte = readU8(sizeSlice);
        const size = readU24Be(sizeSlice);
        const isLastMetadata = (byte & 128) !== 0;
        const metaBlockType = byte & 127;
        switch (metaBlockType) {
          case 0 /* STREAMINFO */: {
            let streamInfoBlock = this.reader.requestSlice(
              currentPos,
              size
            );
            if (streamInfoBlock instanceof Promise) streamInfoBlock = await streamInfoBlock;
            assert(streamInfoBlock);
            if (streamInfoBlock === null) {
              throw new Error(
                `StreamInfo block at position ${currentPos} is too small! Corrupted file.`
              );
            }
            const streamInfoBytes = readBytes(streamInfoBlock, 34);
            const bitstream = new Bitstream(streamInfoBytes);
            const minimumBlockSize = bitstream.readBits(16);
            const maximumBlockSize = bitstream.readBits(16);
            const minimumFrameSize = bitstream.readBits(24);
            const maximumFrameSize = bitstream.readBits(24);
            const sampleRate = bitstream.readBits(20);
            const numberOfChannels = bitstream.readBits(3) + 1;
            bitstream.readBits(5);
            const totalSamples = bitstream.readBits(36);
            bitstream.skipBits(16 * 8);
            const description = new Uint8Array(42);
            description.set(new Uint8Array([102, 76, 97, 67]), 0);
            description.set(new Uint8Array([128, 0, 0, 34]), 4);
            description.set(streamInfoBytes, 8);
            this.audioInfo = {
              numberOfChannels,
              sampleRate,
              totalSamples,
              minimumBlockSize,
              maximumBlockSize,
              minimumFrameSize,
              maximumFrameSize,
              description
            };
            this.track = new InputAudioTrack(this.input, new FlacAudioTrackBacking(this));
            break;
          }
          case 4 /* VORBIS_COMMENT */: {
            let vorbisCommentBlock = this.reader.requestSlice(
              currentPos,
              size
            );
            if (vorbisCommentBlock instanceof Promise) vorbisCommentBlock = await vorbisCommentBlock;
            assert(vorbisCommentBlock);
            readVorbisComments(
              readBytes(vorbisCommentBlock, size),
              this.metadataTags
            );
            break;
          }
          case 6 /* PICTURE */: {
            let pictureBlock = this.reader.requestSlice(
              currentPos,
              size
            );
            if (pictureBlock instanceof Promise) pictureBlock = await pictureBlock;
            assert(pictureBlock);
            const pictureType = readU32Be(pictureBlock);
            const mediaTypeLength = readU32Be(pictureBlock);
            const mediaType = textDecoder.decode(
              readBytes(pictureBlock, mediaTypeLength)
            );
            const descriptionLength = readU32Be(pictureBlock);
            const description = textDecoder.decode(
              readBytes(pictureBlock, descriptionLength)
            );
            pictureBlock.skip(4 + 4 + 4 + 4);
            const dataLength = readU32Be(pictureBlock);
            const data = readBytes(pictureBlock, dataLength);
            this.metadataTags.images ??= [];
            this.metadataTags.images.push({
              data,
              mimeType: mediaType,
              // https://www.rfc-editor.org/rfc/rfc9639.html#table13
              kind: pictureType === 3 ? "coverFront" : pictureType === 4 ? "coverBack" : "unknown",
              description
            });
            break;
          }
          default:
            break;
        }
        currentPos += size;
        if (isLastMetadata) {
          this.lastLoadedPos = currentPos;
          break;
        }
      }
    })();
  }
  async readNextFlacFrame({
    startPos,
    isFirstPacket
  }) {
    assert(this.audioInfo);
    const minimumHeaderLength = 6;
    const maximumHeaderSize = 16;
    const maximumSliceLength = this.audioInfo.maximumFrameSize + maximumHeaderSize;
    const slice = await this.reader.requestSliceRange(
      startPos,
      this.audioInfo.minimumFrameSize,
      maximumSliceLength
    );
    if (!slice) {
      return null;
    }
    const frameHeader = this.readFlacFrameHeader({
      slice,
      isFirstPacket
    });
    if (!frameHeader) {
      return null;
    }
    slice.filePos = startPos + this.audioInfo.minimumFrameSize;
    while (true) {
      if (slice.filePos > slice.end - minimumHeaderLength) {
        return {
          num: frameHeader.num,
          blockSize: frameHeader.blockSize,
          sampleRate: frameHeader.sampleRate,
          size: slice.end - startPos,
          isLastFrame: true
        };
      }
      const nextByte = readU8(slice);
      if (nextByte === 255) {
        const byteAfterNextByte = readU8(slice);
        const expected = this.blockingBit === 1 ? 249 : 248;
        if (byteAfterNextByte !== expected) {
          slice.skip(-1);
          continue;
        }
        slice.skip(-2);
        const lengthIfNextFlacFrameHeaderIsLegit = slice.filePos - startPos;
        const nextIsLegit = this.readFlacFrameHeader({
          slice,
          isFirstPacket: false
        });
        if (!nextIsLegit) {
          slice.skip(-1);
          continue;
        }
        return {
          num: frameHeader.num,
          blockSize: frameHeader.blockSize,
          sampleRate: frameHeader.sampleRate,
          size: lengthIfNextFlacFrameHeaderIsLegit,
          isLastFrame: false
        };
      }
    }
  }
  readFlacFrameHeader({
    slice,
    isFirstPacket
  }) {
    const startOffset = slice.filePos;
    const bytes2 = readBytes(slice, 4);
    const bitstream = new Bitstream(bytes2);
    const bits = bitstream.readBits(15);
    if (bits !== 32764) {
      return null;
    }
    if (this.blockingBit === null) {
      assert(isFirstPacket);
      const newBlockingBit = bitstream.readBits(1);
      this.blockingBit = newBlockingBit;
    } else if (this.blockingBit === 1) {
      assert(!isFirstPacket);
      const newBlockingBit = bitstream.readBits(1);
      if (newBlockingBit !== 1) {
        return null;
      }
    } else if (this.blockingBit === 0) {
      assert(!isFirstPacket);
      const newBlockingBit = bitstream.readBits(1);
      if (newBlockingBit !== 0) {
        return null;
      }
    } else {
      throw new Error("Invalid blocking bit");
    }
    const blockSizeOrUncommon = getBlockSizeOrUncommon(bitstream.readBits(4));
    if (!blockSizeOrUncommon) {
      return null;
    }
    assert(this.audioInfo);
    const sampleRateOrUncommon = getSampleRateOrUncommon(
      bitstream.readBits(4),
      this.audioInfo.sampleRate
    );
    if (!sampleRateOrUncommon) {
      return null;
    }
    bitstream.readBits(4);
    bitstream.readBits(3);
    const reservedZero = bitstream.readBits(1);
    if (reservedZero !== 0) {
      return null;
    }
    const num = readCodedNumber(slice);
    const blockSize = readBlockSize(slice, blockSizeOrUncommon);
    const sampleRate = readSampleRate(slice, sampleRateOrUncommon);
    if (sampleRate === null) {
      return null;
    }
    const size = slice.filePos - startOffset;
    const crc = readU8(slice);
    slice.skip(-size);
    slice.skip(-1);
    const crcCalculated = calculateCrc8(readBytes(slice, size));
    if (crc !== crcCalculated) {
      return null;
    }
    return { num, blockSize, sampleRate };
  }
  async advanceReader() {
    await this.readMetadata();
    assert(this.lastLoadedPos !== null);
    assert(this.audioInfo);
    const startPos = this.lastLoadedPos;
    const frame = await this.readNextFlacFrame({
      startPos,
      isFirstPacket: this.loadedSamples.length === 0
    });
    if (!frame) {
      this.lastSampleLoaded = true;
      return;
    }
    const lastSample = this.loadedSamples[this.loadedSamples.length - 1];
    const blockOffset = lastSample ? lastSample.blockOffset + lastSample.blockSize : 0;
    const sample = {
      blockOffset,
      blockSize: frame.blockSize,
      byteOffset: startPos,
      byteSize: frame.size
    };
    this.lastLoadedPos = this.lastLoadedPos + frame.size;
    this.loadedSamples.push(sample);
    if (frame.isLastFrame) {
      this.lastSampleLoaded = true;
      return;
    }
  }
};
var FlacAudioTrackBacking = class {
  constructor(demuxer) {
    this.demuxer = demuxer;
  }
  getId() {
    return 1;
  }
  getCodec() {
    return "flac";
  }
  getInternalCodecId() {
    return null;
  }
  getNumberOfChannels() {
    assert(this.demuxer.audioInfo);
    return this.demuxer.audioInfo.numberOfChannels;
  }
  async computeDuration() {
    const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
    return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
  }
  getSampleRate() {
    assert(this.demuxer.audioInfo);
    return this.demuxer.audioInfo.sampleRate;
  }
  getName() {
    return null;
  }
  getLanguageCode() {
    return UNDETERMINED_LANGUAGE;
  }
  getTimeResolution() {
    assert(this.demuxer.audioInfo);
    return this.demuxer.audioInfo.sampleRate;
  }
  async getFirstTimestamp() {
    return 0;
  }
  async getDecoderConfig() {
    assert(this.demuxer.audioInfo);
    return {
      codec: "flac",
      numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
      sampleRate: this.demuxer.audioInfo.sampleRate,
      description: this.demuxer.audioInfo.description
    };
  }
  async getPacket(timestamp, options) {
    assert(this.demuxer.audioInfo);
    if (timestamp < 0) {
      throw new Error("Timestamp cannot be negative");
    }
    const release = await this.demuxer.readingMutex.acquire();
    try {
      while (true) {
        const packetIndex = binarySearchLessOrEqual(
          this.demuxer.loadedSamples,
          timestamp,
          (x) => x.blockOffset / this.demuxer.audioInfo.sampleRate
        );
        if (packetIndex === -1) {
          await this.demuxer.advanceReader();
          continue;
        }
        const packet = this.demuxer.loadedSamples[packetIndex];
        const sampleTimestamp = packet.blockOffset / this.demuxer.audioInfo.sampleRate;
        const sampleDuration = packet.blockSize / this.demuxer.audioInfo.sampleRate;
        if (sampleTimestamp + sampleDuration <= timestamp) {
          if (this.demuxer.lastSampleLoaded) {
            return this.getPacketAtIndex(
              this.demuxer.loadedSamples.length - 1,
              options
            );
          }
          await this.demuxer.advanceReader();
          continue;
        }
        return this.getPacketAtIndex(packetIndex, options);
      }
    } finally {
      release();
    }
  }
  async getNextPacket(packet, options) {
    const release = await this.demuxer.readingMutex.acquire();
    try {
      const nextIndex = packet.sequenceNumber + 1;
      if (this.demuxer.lastSampleLoaded && nextIndex >= this.demuxer.loadedSamples.length) {
        return null;
      }
      while (nextIndex >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded) {
        await this.demuxer.advanceReader();
      }
      return this.getPacketAtIndex(nextIndex, options);
    } finally {
      release();
    }
  }
  getKeyPacket(timestamp, options) {
    return this.getPacket(timestamp, options);
  }
  getNextKeyPacket(packet, options) {
    return this.getNextPacket(packet, options);
  }
  async getPacketAtIndex(sampleIndex, options) {
    const rawSample = this.demuxer.loadedSamples[sampleIndex];
    if (!rawSample) {
      return null;
    }
    let data;
    if (options.metadataOnly) {
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.demuxer.reader.requestSlice(
        rawSample.byteOffset,
        rawSample.byteSize
      );
      if (slice instanceof Promise) slice = await slice;
      if (!slice) {
        return null;
      }
      data = readBytes(slice, rawSample.byteSize);
    }
    assert(this.demuxer.audioInfo);
    const timestamp = rawSample.blockOffset / this.demuxer.audioInfo.sampleRate;
    const duration = rawSample.blockSize / this.demuxer.audioInfo.sampleRate;
    return new EncodedPacket(
      data,
      "key",
      timestamp,
      duration,
      sampleIndex,
      rawSample.byteSize
    );
  }
  async getFirstPacket(options) {
    while (this.demuxer.loadedSamples.length === 0 && !this.demuxer.lastSampleLoaded) {
      await this.demuxer.advanceReader();
    }
    return this.getPacketAtIndex(0, options);
  }
};

// src/avi/avi-misc.ts
var AVIIF_KEYFRAME = 16;
var VIDEO_FOURCC_TO_CODEC = {
  "H264": "avc",
  "h264": "avc",
  "AVC1": "avc",
  "avc1": "avc",
  "H265": "hevc",
  "h265": "hevc",
  "HEVC": "hevc",
  "hevc": "hevc",
  "hev1": "hevc",
  "hvc1": "hevc",
  "VP80": "vp8",
  "VP8 ": "vp8",
  "VP90": "vp9",
  "VP9 ": "vp9",
  "AV01": "av1",
  "av01": "av1",
  "XVID": "mpeg4",
  "xvid": "mpeg4",
  "DIVX": "mpeg4",
  "DX50": "mpeg4",
  "FMP4": "mpeg4",
  "MP4V": "mpeg4"
};
var AUDIO_FORMAT_TAG_TO_CODEC = {
  1: "pcm-s16",
  3: "pcm-f32",
  6: "alaw",
  7: "ulaw",
  85: "mp3",
  146: "ac3",
  255: "aac",
  8192: "aac",
  22127: "vorbis",
  26447: "vorbis",
  61868: "flac"
};
function aviVideoFourccToCodec(fourccStr) {
  const codec = VIDEO_FOURCC_TO_CODEC[fourccStr];
  return codec || null;
}
function aviAudioFormatTagToCodec(formatTag) {
  const codec = AUDIO_FORMAT_TAG_TO_CODEC[formatTag];
  return codec || null;
}
var CODEC_TO_PREFERRED_FOURCC = {
  avc: "H264",
  hevc: "H265",
  vp8: "VP80",
  vp9: "VP90",
  av1: "AV01",
  mpeg4: "XVID"
};
function aviVideoCodecToFourcc(codec) {
  const preferred = CODEC_TO_PREFERRED_FOURCC[codec];
  if (preferred) return preferred;
  for (const [fourccStr, codecId] of Object.entries(VIDEO_FOURCC_TO_CODEC)) {
    if (codecId === codec) {
      return fourccStr;
    }
  }
  return null;
}
function aviAudioCodecToFormatTag(codec) {
  for (const [tag, codecId] of Object.entries(AUDIO_FORMAT_TAG_TO_CODEC)) {
    if (codecId === codec) {
      return Number(tag);
    }
  }
  return null;
}
function parseMainHeader(data) {
  return {
    microSecPerFrame: data.getUint32(0, true),
    maxBytesPerSec: data.getUint32(4, true),
    paddingGranularity: data.getUint32(8, true),
    flags: data.getUint32(12, true),
    totalFrames: data.getUint32(16, true),
    initialFrames: data.getUint32(20, true),
    streams: data.getUint32(24, true),
    suggestedBufferSize: data.getUint32(28, true),
    width: data.getUint32(32, true),
    height: data.getUint32(36, true)
  };
}
function parseStreamHeader(data) {
  const decoder = new TextDecoder("latin1");
  return {
    fccType: decoder.decode(new Uint8Array(data.buffer, data.byteOffset, 4)),
    fccHandler: decoder.decode(new Uint8Array(data.buffer, data.byteOffset + 4, 4)),
    flags: data.getUint32(8, true),
    priority: data.getUint16(12, true),
    language: data.getUint16(14, true),
    initialFrames: data.getUint32(16, true),
    scale: data.getUint32(20, true),
    rate: data.getUint32(24, true),
    start: data.getUint32(28, true),
    length: data.getUint32(32, true),
    suggestedBufferSize: data.getUint32(36, true),
    quality: data.getUint32(40, true),
    sampleSize: data.getUint32(44, true),
    frame: {
      left: data.getUint16(48, true),
      top: data.getUint16(50, true),
      right: data.getUint16(52, true),
      bottom: data.getUint16(54, true)
    }
  };
}
function parseBitmapInfoHeader(data) {
  const decoder = new TextDecoder("latin1");
  return {
    size: data.getUint32(0, true),
    width: data.getInt32(4, true),
    height: data.getInt32(8, true),
    planes: data.getUint16(12, true),
    bitCount: data.getUint16(14, true),
    compression: decoder.decode(new Uint8Array(data.buffer, data.byteOffset + 16, 4)),
    sizeImage: data.getUint32(20, true),
    xPelsPerMeter: data.getInt32(24, true),
    yPelsPerMeter: data.getInt32(28, true),
    clrUsed: data.getUint32(32, true),
    clrImportant: data.getUint32(36, true)
  };
}
function parseWaveFormatEx(data) {
  const formatTag = data.getUint16(0, true);
  const channels = data.getUint16(2, true);
  const samplesPerSec = data.getUint32(4, true);
  const avgBytesPerSec = data.getUint32(8, true);
  const blockAlign = data.getUint16(12, true);
  const bitsPerSample = data.getUint16(14, true);
  let cbSize = 0;
  let extraData;
  if (data.byteLength >= 18) {
    cbSize = data.getUint16(16, true);
    if (cbSize > 0 && data.byteLength >= 18 + cbSize) {
      extraData = new Uint8Array(data.buffer, data.byteOffset + 18, cbSize);
    }
  }
  return {
    formatTag,
    channels,
    samplesPerSec,
    avgBytesPerSec,
    blockAlign,
    bitsPerSample,
    cbSize,
    extraData
  };
}
function parseIndexEntry(data, offset) {
  const decoder = new TextDecoder("latin1");
  return {
    ckid: decoder.decode(new Uint8Array(data.buffer, data.byteOffset + offset, 4)),
    flags: data.getUint32(offset + 4, true),
    offset: data.getUint32(offset + 8, true),
    size: data.getUint32(offset + 12, true)
  };
}
function makeStreamChunkId(streamNumber, type) {
  const streamStr = streamNumber.toString().padStart(2, "0");
  return streamStr + type;
}
function parseStreamChunkId(ckid) {
  if (ckid.length !== 4) return null;
  const streamStr = ckid.substring(0, 2);
  const type = ckid.substring(2);
  const streamNumber = parseInt(streamStr, 10);
  if (isNaN(streamNumber)) return null;
  return { streamNumber, type };
}

// src/avi/avi-demuxer.ts
var AviTrackBacking = class {
  constructor(demuxer, streamInfo) {
    this.demuxer = demuxer;
    this.streamInfo = streamInfo;
    this.packetToIndex = /* @__PURE__ */ new WeakMap();
  }
  getId() {
    return this.streamInfo.index;
  }
  getCodec() {
    throw new Error("Not implemented on base class.");
  }
  getInternalCodecId() {
    if (this.streamInfo.header.fccType === "vids") {
      const format = this.streamInfo.format;
      return format.compression;
    } else if (this.streamInfo.header.fccType === "auds") {
      const format = this.streamInfo.format;
      return format.formatTag.toString();
    }
    return null;
  }
  getName() {
    return null;
  }
  getLanguageCode() {
    return "eng";
  }
  getTimeResolution() {
    if (this.streamInfo.header.rate > 0) {
      return this.streamInfo.header.rate / this.streamInfo.header.scale;
    }
    return 1e6;
  }
  async getFirstTimestamp() {
    if (this.streamInfo.packets.length === 0) return 0;
    if (this.streamInfo.keyPacketIndices.length > 0) {
      const firstKeyIndex = this.streamInfo.keyPacketIndices[0];
      const firstKeyPacket = this.streamInfo.packets[firstKeyIndex];
      return firstKeyPacket.timestamp + firstKeyPacket.duration;
    }
    return this.streamInfo.packets[0].timestamp;
  }
  async computeDuration() {
    const lastPacket = await this.getPacket(Infinity, { metadataOnly: true });
    return (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
  }
  async getFirstPacket(options) {
    if (this.streamInfo.keyPacketIndices.length === 0) return null;
    const firstKeyIndex = this.streamInfo.keyPacketIndices[0];
    const packetInfo = this.streamInfo.packets[firstKeyIndex];
    if (options.metadataOnly) {
      const packet2 = new EncodedPacket(
        new Uint8Array(),
        "key",
        packetInfo.timestamp,
        packetInfo.duration,
        firstKeyIndex,
        packetInfo.entry.size
      );
      this.packetToIndex.set(packet2, firstKeyIndex);
      return packet2;
    }
    const packet = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp, packetInfo.duration, firstKeyIndex);
    if (packet) {
      this.packetToIndex.set(packet, firstKeyIndex);
    }
    return packet;
  }
  async getPacket(timestamp, options) {
    if (this.streamInfo.presentationTimestamps.length === 0) {
      return null;
    }
    const index = binarySearchLessOrEqual(
      this.streamInfo.presentationTimestamps,
      timestamp,
      (x) => x.timestamp
    );
    if (index === -1) {
      const entry2 = this.streamInfo.presentationTimestamps[0];
      const packetIndex2 = entry2.packetIndex;
      const packetInfo2 = this.streamInfo.packets[packetIndex2];
      if (options.metadataOnly) {
        const packet3 = new EncodedPacket(
          new Uint8Array(),
          packetInfo2.entry.flags & AVIIF_KEYFRAME ? "key" : "delta",
          packetInfo2.timestamp,
          packetInfo2.duration,
          packetIndex2,
          packetInfo2.entry.size
        );
        this.packetToIndex.set(packet3, packetIndex2);
        return packet3;
      }
      const packet2 = await this.demuxer.readPacket(packetInfo2.entry, packetInfo2.timestamp, packetInfo2.duration, packetIndex2);
      if (packet2) {
        this.packetToIndex.set(packet2, packetIndex2);
      }
      return packet2;
    }
    const entry = this.streamInfo.presentationTimestamps[index];
    let packetIndex = entry.packetIndex;
    let packetInfo = this.streamInfo.packets[packetIndex];
    if (timestamp > packetInfo.timestamp && index + 1 < this.streamInfo.presentationTimestamps.length) {
      const nextEntry = this.streamInfo.presentationTimestamps[index + 1];
      const nextPacketInfo = this.streamInfo.packets[nextEntry.packetIndex];
      if (timestamp > packetInfo.timestamp + packetInfo.duration * 0.5) {
        packetIndex = nextEntry.packetIndex;
        packetInfo = nextPacketInfo;
      }
    }
    if (options.metadataOnly) {
      const packet2 = new EncodedPacket(
        new Uint8Array(),
        packetInfo.entry.flags & AVIIF_KEYFRAME ? "key" : "delta",
        packetInfo.timestamp,
        packetInfo.duration,
        packetIndex,
        packetInfo.entry.size
      );
      this.packetToIndex.set(packet2, packetIndex);
      return packet2;
    }
    const packet = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp, packetInfo.duration, packetIndex);
    if (packet) {
      this.packetToIndex.set(packet, packetIndex);
    }
    return packet;
  }
  async getNextPacket(packet, options) {
    const index = this.packetToIndex.get(packet);
    if (index === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    const nextIndex = index + 1;
    if (nextIndex >= this.streamInfo.packets.length) return null;
    const packetInfo = this.streamInfo.packets[nextIndex];
    if (options.metadataOnly) {
      const newPacket2 = new EncodedPacket(
        new Uint8Array(),
        packetInfo.entry.flags & AVIIF_KEYFRAME ? "key" : "delta",
        packetInfo.timestamp,
        packetInfo.duration,
        nextIndex,
        packetInfo.entry.size
      );
      this.packetToIndex.set(newPacket2, nextIndex);
      return newPacket2;
    }
    const newPacket = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp, packetInfo.duration, nextIndex);
    if (newPacket) {
      this.packetToIndex.set(newPacket, nextIndex);
    }
    return newPacket;
  }
  async getKeyPacket(timestamp, options) {
    if (this.streamInfo.keyPacketIndices.length === 0) return null;
    let bestKeyIndex = -1;
    let left = 0;
    let right = this.streamInfo.keyPacketIndices.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const packetIndex = this.streamInfo.keyPacketIndices[mid];
      const packetInfo2 = this.streamInfo.packets[packetIndex];
      if (packetInfo2.timestamp <= timestamp) {
        bestKeyIndex = packetIndex;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    if (bestKeyIndex === -1 && this.streamInfo.keyPacketIndices.length > 0) {
      bestKeyIndex = this.streamInfo.keyPacketIndices[0];
    }
    if (bestKeyIndex === -1) return null;
    const packetInfo = this.streamInfo.packets[bestKeyIndex];
    if (options.metadataOnly) {
      const packet2 = new EncodedPacket(
        new Uint8Array(),
        "key",
        packetInfo.timestamp,
        packetInfo.duration,
        bestKeyIndex,
        packetInfo.entry.size
      );
      this.packetToIndex.set(packet2, bestKeyIndex);
      return packet2;
    }
    const packet = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp, packetInfo.duration, bestKeyIndex);
    if (packet) {
      this.packetToIndex.set(packet, bestKeyIndex);
    }
    return packet;
  }
  async getNextKeyPacket(packet, options) {
    const index = this.packetToIndex.get(packet);
    if (index === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    const keyIndex = binarySearchExact(
      this.streamInfo.keyPacketIndices,
      index,
      (x) => x
    );
    let nextKeyIndex = -1;
    if (keyIndex !== -1) {
      if (keyIndex + 1 < this.streamInfo.keyPacketIndices.length) {
        nextKeyIndex = this.streamInfo.keyPacketIndices[keyIndex + 1];
      }
    } else {
      for (let i = 0; i < this.streamInfo.keyPacketIndices.length; i++) {
        const keyPacketIndex = this.streamInfo.keyPacketIndices[i];
        if (keyPacketIndex > index) {
          nextKeyIndex = keyPacketIndex;
          break;
        }
      }
    }
    if (nextKeyIndex === -1) return null;
    const packetInfo = this.streamInfo.packets[nextKeyIndex];
    if (options.metadataOnly) {
      const newPacket2 = new EncodedPacket(
        new Uint8Array(),
        "key",
        packetInfo.timestamp,
        packetInfo.duration,
        nextKeyIndex,
        packetInfo.entry.size
      );
      this.packetToIndex.set(newPacket2, nextKeyIndex);
      return newPacket2;
    }
    const newPacket = await this.demuxer.readPacket(packetInfo.entry, packetInfo.timestamp, packetInfo.duration, nextKeyIndex);
    if (newPacket) {
      this.packetToIndex.set(newPacket, nextKeyIndex);
    }
    return newPacket;
  }
};
var AviVideoTrackBacking = class extends AviTrackBacking {
  constructor() {
    super(...arguments);
    this.decoderConfigPromise = null;
  }
  getCodec() {
    const format = this.streamInfo.format;
    let codec = aviVideoFourccToCodec(format.compression);
    if (!codec || format.compression.trim() === "") {
      codec = aviVideoFourccToCodec(this.streamInfo.header.fccHandler);
    }
    return codec;
  }
  getCodedWidth() {
    const format = this.streamInfo.format;
    return Math.abs(format.width);
  }
  getCodedHeight() {
    const format = this.streamInfo.format;
    return Math.abs(format.height);
  }
  getRotation() {
    return 0;
  }
  async getColorSpace() {
    return {};
  }
  async canBeTransparent() {
    return false;
  }
  async getDecoderConfig() {
    const codec = this.getCodec();
    if (!codec) return null;
    return this.decoderConfigPromise ??= (async () => {
      return {
        codec,
        codedWidth: this.getCodedWidth(),
        codedHeight: this.getCodedHeight()
      };
    })();
  }
};
var AviAudioTrackBacking = class extends AviTrackBacking {
  constructor() {
    super(...arguments);
    this.decoderConfig = null;
  }
  getCodec() {
    const format = this.streamInfo.format;
    return aviAudioFormatTagToCodec(format.formatTag);
  }
  getNumberOfChannels() {
    const format = this.streamInfo.format;
    return format.channels;
  }
  getSampleRate() {
    const format = this.streamInfo.format;
    return format.samplesPerSec;
  }
  async getDecoderConfig() {
    const codec = this.getCodec();
    if (!codec) return null;
    return this.decoderConfig ??= {
      codec,
      numberOfChannels: this.getNumberOfChannels(),
      sampleRate: this.getSampleRate()
    };
  }
};
var AVIDemuxer = class _AVIDemuxer extends Demuxer {
  constructor(input) {
    super(input);
    this.mainHeader = null;
    this.streams = [];
    this.index = [];
    this.moviStart = 0;
    this.moviSize = 0;
    this.isRIFX = false;
    this.inputTracks = [];
    this.metadataPromise = null;
    this.reader = input._reader;
  }
  static async _canReadInput(input) {
    const reader = input._reader;
    const slice = await reader.requestSlice(0, 12);
    if (!slice || slice.remainingLength < 12) return false;
    const riffBytes = readBytes(slice, 4);
    if (!riffBytes) return false;
    const riffType = _AVIDemuxer.fourcc(riffBytes);
    if (riffType !== "RIFF" && riffType !== "RIFX" && riffType !== "RF64") {
      return false;
    }
    slice.skip(4);
    const typeBytes = readBytes(slice, 4);
    if (!typeBytes) return false;
    const fileType = _AVIDemuxer.fourcc(typeBytes);
    return fileType === "AVI ";
  }
  static fourcc(bytes2) {
    if (!bytes2 || bytes2.length !== 4) return "    ";
    return textDecoder.decode(bytes2);
  }
  async computeDuration() {
    await this.ensureMetadata();
    if (this.mainHeader && this.mainHeader.microSecPerFrame > 0 && this.mainHeader.totalFrames > 0) {
      return this.mainHeader.totalFrames * this.mainHeader.microSecPerFrame / 1e6;
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
  async getTracks() {
    await this.ensureMetadata();
    return this.inputTracks;
  }
  async getMimeType() {
    return "video/x-msvideo";
  }
  async getMetadataTags() {
    return {};
  }
  async ensureMetadata() {
    if (!this.metadataPromise) {
      this.metadataPromise = this.readMetadata();
    }
    await this.metadataPromise;
  }
  async readMetadata() {
    const slice = await this.reader.requestSlice(0, 12);
    if (!slice || slice.remainingLength < 12) {
      throw new Error("Invalid AVI file: insufficient header");
    }
    const magic = _AVIDemuxer.fourcc(readBytes(slice, 4));
    const fileSize = readU32Le(slice);
    const fileType = _AVIDemuxer.fourcc(readBytes(slice, 4));
    if (fileType !== "AVI ") {
      throw new Error("Invalid AVI file type");
    }
    this.isRIFX = magic === "RIFX";
    await this.parseChunks();
    this.processIndex();
    this.createTracks();
  }
  async parseChunks() {
    let position = 12;
    while (true) {
      const chunk = await this.readChunkHeader(position);
      if (!chunk) break;
      if (chunk.fourcc === "LIST") {
        const listTypeSlice = await this.reader.requestSlice(position + 8, 4);
        if (!listTypeSlice) break;
        const listType = _AVIDemuxer.fourcc(readBytes(listTypeSlice, 4));
        if (listType === "hdrl") {
          await this.parseHeaderList(position + 12, chunk.size - 4);
        } else if (listType === "movi") {
          this.moviStart = position + 8;
          this.moviSize = chunk.size - 4;
        }
        position += 8 + chunk.size;
      } else if (chunk.fourcc === "idx1") {
        await this.parseIndex(position + 8, chunk.size);
        position += 8 + chunk.size;
      } else {
        position += 8 + chunk.size;
      }
      if (chunk.size % 2 !== 0) {
        position++;
      }
    }
  }
  async readChunkHeader(position) {
    const slice = await this.reader.requestSlice(position, 8);
    if (!slice || slice.remainingLength < 8) return null;
    const chunkFourcc = _AVIDemuxer.fourcc(readBytes(slice, 4));
    const chunkSize = this.isRIFX ? readU32Le(slice) : readU32Le(slice);
    return {
      fourcc: chunkFourcc,
      size: chunkSize,
      position: position + 8
    };
  }
  async parseHeaderList(position, size) {
    const endPos = position + size;
    let currentPos = position;
    while (currentPos < endPos) {
      const chunk = await this.readChunkHeader(currentPos);
      if (!chunk) break;
      if (chunk.fourcc === "avih") {
        const slice = await this.reader.requestSlice(chunk.position, chunk.size);
        if (slice) {
          this.mainHeader = parseMainHeader(new DataView(slice.bytes.buffer, slice.bytes.byteOffset + slice.bufferPos, chunk.size));
        }
        currentPos = chunk.position + chunk.size;
      } else if (chunk.fourcc === "LIST") {
        const listTypeSlice = await this.reader.requestSlice(chunk.position, 4);
        if (listTypeSlice) {
          const listType = _AVIDemuxer.fourcc(readBytes(listTypeSlice, 4));
          if (listType === "strl") {
            await this.parseStreamList(chunk.position + 4, chunk.size - 4);
          }
        }
        currentPos = chunk.position + chunk.size;
      } else {
        currentPos = chunk.position + chunk.size;
      }
      if (chunk.size % 2 !== 0) {
        currentPos++;
      }
    }
  }
  async parseStreamList(position, size) {
    const endPos = position + size;
    let currentPos = position;
    const streamInfo = {
      packets: [],
      presentationTimestamps: [],
      keyPacketIndices: [],
      index: this.streams.length
    };
    while (currentPos < endPos) {
      const chunk = await this.readChunkHeader(currentPos);
      if (!chunk) break;
      if (chunk.fourcc === "strh") {
        const slice = await this.reader.requestSlice(chunk.position, chunk.size);
        if (slice) {
          streamInfo.header = parseStreamHeader(new DataView(slice.bytes.buffer, slice.bytes.byteOffset + slice.bufferPos, chunk.size));
        }
        currentPos = chunk.position + chunk.size;
      } else if (chunk.fourcc === "strf") {
        const slice = await this.reader.requestSlice(chunk.position, chunk.size);
        if (slice && streamInfo.header) {
          const dataView = new DataView(slice.bytes.buffer, slice.bytes.byteOffset + slice.bufferPos, chunk.size);
          if (streamInfo.header.fccType === "vids") {
            streamInfo.format = parseBitmapInfoHeader(dataView);
          } else if (streamInfo.header.fccType === "auds") {
            streamInfo.format = parseWaveFormatEx(dataView);
          }
        }
        currentPos = chunk.position + chunk.size;
      } else {
        currentPos = chunk.position + chunk.size;
      }
      if (chunk.size % 2 !== 0) {
        currentPos++;
      }
    }
    if (streamInfo.header && streamInfo.format) {
      const completeStream = {
        header: streamInfo.header,
        format: streamInfo.format,
        packets: streamInfo.packets,
        presentationTimestamps: streamInfo.presentationTimestamps,
        keyPacketIndices: streamInfo.keyPacketIndices,
        index: streamInfo.index
      };
      this.streams.push(completeStream);
    }
  }
  async parseIndex(position, size) {
    const slice = await this.reader.requestSlice(position, size);
    if (!slice) return;
    const dataView = new DataView(slice.bytes.buffer, slice.bytes.byteOffset + slice.bufferPos, size);
    const numEntries = Math.floor(size / 16);
    for (let i = 0; i < numEntries; i++) {
      const entry = parseIndexEntry(dataView, i * 16);
      this.index.push(entry);
    }
  }
  processIndex() {
    for (const entry of this.index) {
      const parsed = parseStreamChunkId(entry.ckid);
      if (!parsed) continue;
      const streamIndex = parsed.streamNumber;
      if (streamIndex >= this.streams.length) continue;
      const stream = this.streams[streamIndex];
      const packetIndex = stream.packets.length;
      const timestamp = this.calculateTimestamp(stream, packetIndex);
      const duration = this.calculatePacketDuration(stream, packetIndex);
      stream.packets.push({
        entry,
        timestamp,
        duration
      });
      stream.presentationTimestamps.push({
        timestamp,
        packetIndex
      });
      if (entry.flags & AVIIF_KEYFRAME) {
        stream.keyPacketIndices.push(packetIndex);
      }
    }
    for (const stream of this.streams) {
      stream.presentationTimestamps.sort((a, b) => a.timestamp - b.timestamp);
    }
  }
  createTracks() {
    for (const stream of this.streams) {
      const { header, format } = stream;
      if (header.fccType === "vids" && "compression" in format) {
        const bmpInfo = format;
        let codec = aviVideoFourccToCodec(bmpInfo.compression);
        if (!codec || bmpInfo.compression.trim() === "") {
          codec = aviVideoFourccToCodec(header.fccHandler);
        }
        if (codec) {
          const backing = new AviVideoTrackBacking(this, stream);
          stream.track = backing;
          const track = new InputVideoTrack(this.input, backing);
          this.inputTracks.push(track);
        }
      } else if (header.fccType === "auds" && "formatTag" in format) {
        const waveFormat = format;
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
  async readPacket(entry, timestamp, duration = 0, sequenceNumber = -1) {
    const packetPos = this.moviStart + entry.offset + 8;
    const slice = await this.reader.requestSlice(packetPos, entry.size);
    if (!slice) return null;
    const data = readBytes(slice, entry.size);
    if (!data) return null;
    return new EncodedPacket(
      data,
      entry.flags & AVIIF_KEYFRAME ? "key" : "delta",
      timestamp,
      duration,
      sequenceNumber,
      data.byteLength
    );
  }
  calculateTimestamp(stream, packetIndex) {
    if (stream.header.fccType === "vids" && stream.header.rate > 0 && stream.header.scale > 0) {
      return packetIndex * stream.header.scale / stream.header.rate;
    } else if (stream.header.fccType === "auds") {
      const format = stream.format;
      if (stream.header.sampleSize === 0 || stream.header.sampleSize === 1) {
        const samplesPerFrame = 1152;
        return packetIndex * samplesPerFrame / format.samplesPerSec;
      }
      if (stream.header.rate > 0 && stream.header.scale > 0) {
        return packetIndex * stream.header.scale / stream.header.rate;
      }
    }
    return 0;
  }
  calculatePacketDuration(stream, packetIndex) {
    if (stream.header.fccType === "vids" && stream.header.rate > 0 && stream.header.scale > 0) {
      return stream.header.scale / stream.header.rate;
    } else if (stream.header.fccType === "auds") {
      const format = stream.format;
      if (stream.header.sampleSize === 0 || stream.header.sampleSize === 1) {
        const samplesPerFrame = 1152;
        return samplesPerFrame / format.samplesPerSec;
      }
      if (stream.header.rate > 0 && stream.header.scale > 0) {
        return stream.header.scale / stream.header.rate;
      }
    }
    return 0;
  }
};

// src/input-format.ts
var InputFormat = class {
};
var IsobmffInputFormat = class extends InputFormat {
  /** @internal */
  async _getMajorBrand(input) {
    let slice = input._reader.requestSlice(0, 12);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return null;
    slice.skip(4);
    const fourCc = readAscii(slice, 4);
    if (fourCc !== "ftyp") {
      return null;
    }
    return readAscii(slice, 4);
  }
  /** @internal */
  _createDemuxer(input) {
    return new IsobmffDemuxer(input);
  }
};
var Mp4InputFormat = class extends IsobmffInputFormat {
  /** @internal */
  async _canReadInput(input) {
    const majorBrand = await this._getMajorBrand(input);
    return !!majorBrand && majorBrand !== "qt  ";
  }
  get name() {
    return "MP4";
  }
  get mimeType() {
    return "video/mp4";
  }
};
var QuickTimeInputFormat = class extends IsobmffInputFormat {
  /** @internal */
  async _canReadInput(input) {
    const majorBrand = await this._getMajorBrand(input);
    return majorBrand === "qt  ";
  }
  get name() {
    return "QuickTime File Format";
  }
  get mimeType() {
    return "video/quicktime";
  }
};
var MatroskaInputFormat = class extends InputFormat {
  /** @internal */
  async isSupportedEBMLOfDocType(input, desiredDocType) {
    let headerSlice = input._reader.requestSlice(0, MAX_HEADER_SIZE);
    if (headerSlice instanceof Promise) headerSlice = await headerSlice;
    if (!headerSlice) return false;
    const varIntSize = readVarIntSize(headerSlice);
    if (varIntSize === null) {
      return false;
    }
    if (varIntSize < 1 || varIntSize > 8) {
      return false;
    }
    const id = readUnsignedInt(headerSlice, varIntSize);
    if (id !== 440786851 /* EBML */) {
      return false;
    }
    const dataSize = readElementSize(headerSlice);
    if (dataSize === null) {
      return false;
    }
    let dataSlice = input._reader.requestSlice(headerSlice.filePos, dataSize);
    if (dataSlice instanceof Promise) dataSlice = await dataSlice;
    if (!dataSlice) return false;
    const startPos = headerSlice.filePos;
    while (dataSlice.filePos <= startPos + dataSize - MIN_HEADER_SIZE) {
      const header = readElementHeader(dataSlice);
      if (!header) break;
      const { id: id2, size } = header;
      const dataStartPos = dataSlice.filePos;
      if (size === null) return false;
      switch (id2) {
        case 17030 /* EBMLVersion */:
          {
            const ebmlVersion = readUnsignedInt(dataSlice, size);
            if (ebmlVersion !== 1) {
              return false;
            }
          }
          ;
          break;
        case 17143 /* EBMLReadVersion */:
          {
            const ebmlReadVersion = readUnsignedInt(dataSlice, size);
            if (ebmlReadVersion !== 1) {
              return false;
            }
          }
          ;
          break;
        case 17026 /* DocType */:
          {
            const docType = readAsciiString(dataSlice, size);
            if (docType !== desiredDocType) {
              return false;
            }
          }
          ;
          break;
        case 17031 /* DocTypeVersion */:
          {
            const docTypeVersion = readUnsignedInt(dataSlice, size);
            if (docTypeVersion > 4) {
              return false;
            }
          }
          ;
          break;
      }
      dataSlice.filePos = dataStartPos + size;
    }
    return true;
  }
  /** @internal */
  _canReadInput(input) {
    return this.isSupportedEBMLOfDocType(input, "matroska");
  }
  /** @internal */
  _createDemuxer(input) {
    return new MatroskaDemuxer(input);
  }
  get name() {
    return "Matroska";
  }
  get mimeType() {
    return "video/x-matroska";
  }
};
var WebMInputFormat = class extends MatroskaInputFormat {
  /** @internal */
  _canReadInput(input) {
    return this.isSupportedEBMLOfDocType(input, "webm");
  }
  get name() {
    return "WebM";
  }
  get mimeType() {
    return "video/webm";
  }
};
var Mp3InputFormat = class extends InputFormat {
  /** @internal */
  async _canReadInput(input) {
    let slice = input._reader.requestSlice(0, 10);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return false;
    let currentPos = 0;
    let id3V2HeaderFound = false;
    while (true) {
      let slice2 = input._reader.requestSlice(currentPos, ID3_V2_HEADER_SIZE);
      if (slice2 instanceof Promise) slice2 = await slice2;
      if (!slice2) break;
      const id3V2Header = readId3V2Header(slice2);
      if (!id3V2Header) {
        break;
      }
      id3V2HeaderFound = true;
      currentPos = slice2.filePos + id3V2Header.size;
    }
    const firstResult = await readNextFrameHeader(input._reader, currentPos, currentPos + 4096);
    if (!firstResult) {
      return false;
    }
    if (id3V2HeaderFound) {
      return true;
    }
    currentPos = firstResult.startPos + firstResult.header.totalSize;
    const secondResult = await readNextFrameHeader(input._reader, currentPos, currentPos + FRAME_HEADER_SIZE);
    if (!secondResult) {
      return false;
    }
    const firstHeader = firstResult.header;
    const secondHeader = secondResult.header;
    if (firstHeader.channel !== secondHeader.channel || firstHeader.sampleRate !== secondHeader.sampleRate) {
      return false;
    }
    return true;
  }
  /** @internal */
  _createDemuxer(input) {
    return new Mp3Demuxer(input);
  }
  get name() {
    return "MP3";
  }
  get mimeType() {
    return "audio/mpeg";
  }
};
var WaveInputFormat = class extends InputFormat {
  /** @internal */
  async _canReadInput(input) {
    let slice = input._reader.requestSlice(0, 12);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return false;
    const riffType = readAscii(slice, 4);
    if (riffType !== "RIFF" && riffType !== "RIFX" && riffType !== "RF64") {
      return false;
    }
    slice.skip(4);
    const format = readAscii(slice, 4);
    return format === "WAVE";
  }
  /** @internal */
  _createDemuxer(input) {
    return new WaveDemuxer(input);
  }
  get name() {
    return "WAVE";
  }
  get mimeType() {
    return "audio/wav";
  }
};
var OggInputFormat = class extends InputFormat {
  /** @internal */
  async _canReadInput(input) {
    let slice = input._reader.requestSlice(0, 4);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return false;
    return readAscii(slice, 4) === "OggS";
  }
  /** @internal */
  _createDemuxer(input) {
    return new OggDemuxer(input);
  }
  get name() {
    return "Ogg";
  }
  get mimeType() {
    return "application/ogg";
  }
};
var FlacInputFormat = class extends InputFormat {
  /** @internal */
  async _canReadInput(input) {
    let slice = input._reader.requestSlice(0, 4);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return false;
    return readAscii(slice, 4) === "fLaC";
  }
  get name() {
    return "FLAC";
  }
  get mimeType() {
    return "audio/flac";
  }
  /** @internal */
  _createDemuxer(input) {
    return new FlacDemuxer(input);
  }
};
var AdtsInputFormat = class extends InputFormat {
  /** @internal */
  async _canReadInput(input) {
    let slice = input._reader.requestSliceRange(0, MIN_FRAME_HEADER_SIZE, MAX_FRAME_HEADER_SIZE);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return false;
    const firstHeader = readFrameHeader2(slice);
    if (!firstHeader) {
      return false;
    }
    slice = input._reader.requestSliceRange(firstHeader.frameLength, MIN_FRAME_HEADER_SIZE, MAX_FRAME_HEADER_SIZE);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return false;
    const secondHeader = readFrameHeader2(slice);
    if (!secondHeader) {
      return false;
    }
    return firstHeader.objectType === secondHeader.objectType && firstHeader.samplingFrequencyIndex === secondHeader.samplingFrequencyIndex && firstHeader.channelConfiguration === secondHeader.channelConfiguration;
  }
  /** @internal */
  _createDemuxer(input) {
    return new AdtsDemuxer(input);
  }
  get name() {
    return "ADTS";
  }
  get mimeType() {
    return "audio/aac";
  }
};
var MP4 = new Mp4InputFormat();
var QTFF = new QuickTimeInputFormat();
var MATROSKA = new MatroskaInputFormat();
var WEBM = new WebMInputFormat();
var MP3 = new Mp3InputFormat();
var WAVE = new WaveInputFormat();
var OGG = new OggInputFormat();
var ADTS = new AdtsInputFormat();
var FLAC = new FlacInputFormat();
var AviInputFormat = class extends InputFormat {
  /** @internal */
  async _canReadInput(input) {
    let slice = input._reader.requestSlice(0, 12);
    if (slice instanceof Promise) slice = await slice;
    if (!slice) return false;
    const riffType = readAscii(slice, 4);
    if (riffType !== "RIFF" && riffType !== "RIFX" && riffType !== "RF64") {
      return false;
    }
    slice.skip(4);
    const format = readAscii(slice, 4);
    return format === "AVI ";
  }
  /** @internal */
  _createDemuxer(input) {
    return new AVIDemuxer(input);
  }
  get name() {
    return "AVI";
  }
  get mimeType() {
    return "video/x-msvideo";
  }
};
var AVI = new AviInputFormat();
var ALL_FORMATS = [MP4, QTFF, MATROSKA, WEBM, WAVE, OGG, FLAC, MP3, ADTS, AVI];

// src/source.ts
var nodeAlias = __toESM(require_node(), 1);
var node = typeof nodeAlias !== "undefined" ? nodeAlias : void 0;
var Source = class {
  constructor() {
    /** @internal */
    this._disposed = false;
    /** @internal */
    this._sizePromise = null;
    /** Called each time data is retrieved from the source. Will be called with the retrieved range (end exclusive). */
    this.onread = null;
  }
  /**
   * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
   * will retrieve the size.
   *
   * Returns null if the source is unsized.
   */
  async getSizeOrNull() {
    if (this._disposed) {
      throw new InputDisposedError();
    }
    return this._sizePromise ??= Promise.resolve(this._retrieveSize());
  }
  /**
   * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
   * will retrieve the size.
   *
   * Throws an error if the source is unsized.
   */
  async getSize() {
    if (this._disposed) {
      throw new InputDisposedError();
    }
    const result = await this.getSizeOrNull();
    if (result === null) {
      throw new Error("Cannot determine the size of an unsized source.");
    }
    return result;
  }
};
var BufferSource = class extends Source {
  /** Creates a new {@link BufferSource} backed the specified `ArrayBuffer` or `ArrayBufferView`. */
  constructor(buffer) {
    if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) {
      throw new TypeError("buffer must be an ArrayBuffer or ArrayBufferView.");
    }
    super();
    /** @internal */
    this._onreadCalled = false;
    this._bytes = toUint8Array(buffer);
    this._view = toDataView(buffer);
  }
  /** @internal */
  _retrieveSize() {
    return this._bytes.byteLength;
  }
  /** @internal */
  _read() {
    if (!this._onreadCalled) {
      this.onread?.(0, this._bytes.byteLength);
      this._onreadCalled = true;
    }
    return {
      bytes: this._bytes,
      view: this._view,
      offset: 0
    };
  }
  /** @internal */
  _dispose() {
  }
};
var BlobSource = class extends Source {
  /**
   * Creates a new {@link BlobSource} backed by the specified
   * [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob).
   */
  constructor(blob, options = {}) {
    if (!(blob instanceof Blob)) {
      throw new TypeError("blob must be a Blob.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.maxCacheSize !== void 0 && (!isNumber(options.maxCacheSize) || options.maxCacheSize < 0)) {
      throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
    }
    super();
    /** @internal */
    this._readers = /* @__PURE__ */ new WeakMap();
    this._blob = blob;
    this._orchestrator = new ReadOrchestrator({
      maxCacheSize: options.maxCacheSize ?? 8 * 2 ** 20,
      maxWorkerCount: 4,
      runWorker: this._runWorker.bind(this),
      prefetchProfile: PREFETCH_PROFILES.fileSystem
    });
  }
  /** @internal */
  _retrieveSize() {
    const size = this._blob.size;
    this._orchestrator.fileSize = size;
    return size;
  }
  /** @internal */
  _read(start, end) {
    return this._orchestrator.read(start, end);
  }
  /** @internal */
  async _runWorker(worker) {
    let reader = this._readers.get(worker);
    if (reader === void 0) {
      if ("stream" in this._blob) {
        const slice = this._blob.slice(worker.currentPos);
        reader = slice.stream().getReader();
      } else {
        reader = null;
      }
      this._readers.set(worker, reader);
    }
    while (worker.currentPos < worker.targetPos && !worker.aborted) {
      if (reader) {
        const { done, value } = await reader.read();
        if (done) {
          this._orchestrator.forgetWorker(worker);
          if (worker.currentPos < worker.targetPos) {
            throw new Error("Blob reader stopped unexpectedly before all requested data was read.");
          }
          break;
        }
        this.onread?.(worker.currentPos, worker.currentPos + value.length);
        this._orchestrator.supplyWorkerData(worker, value);
      } else {
        const data = await this._blob.slice(worker.currentPos, worker.targetPos).arrayBuffer();
        this.onread?.(worker.currentPos, worker.currentPos + data.byteLength);
        this._orchestrator.supplyWorkerData(worker, new Uint8Array(data));
      }
    }
    worker.running = false;
  }
  /** @internal */
  _dispose() {
    this._orchestrator.dispose();
  }
};
var URL_SOURCE_MIN_LOAD_AMOUNT = 0.5 * 2 ** 20;
var DEFAULT_RETRY_DELAY = (previousAttempts, error, src) => {
  const couldBeCorsError = error instanceof Error && (error.message.includes("Failed to fetch") || error.message.includes("Load failed") || error.message.includes("NetworkError when attempting to fetch resource"));
  if (couldBeCorsError) {
    let originOfSrc = null;
    try {
      if (typeof window !== "undefined" && typeof window.location !== "undefined") {
        originOfSrc = new URL(src instanceof Request ? src.url : src, window.location.href).origin;
      }
    } catch {
    }
    const isOnline = typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : true;
    if (isOnline && originOfSrc !== null && originOfSrc !== window.location.origin) {
      return null;
    }
  }
  return Math.min(2 ** (previousAttempts - 2), 16);
};
var UrlSource = class extends Source {
  /** Creates a new {@link UrlSource} backed by the resource at the specified URL. */
  constructor(url2, options = {}) {
    if (typeof url2 !== "string" && !(url2 instanceof URL) && !(typeof Request !== "undefined" && url2 instanceof Request)) {
      throw new TypeError("url must be a string, URL or Request.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.requestInit !== void 0 && (!options.requestInit || typeof options.requestInit !== "object")) {
      throw new TypeError("options.requestInit, when provided, must be an object.");
    }
    if (options.getRetryDelay !== void 0 && typeof options.getRetryDelay !== "function") {
      throw new TypeError("options.getRetryDelay, when provided, must be a function.");
    }
    if (options.maxCacheSize !== void 0 && (!isNumber(options.maxCacheSize) || options.maxCacheSize < 0)) {
      throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
    }
    if (options.fetchFn !== void 0 && typeof options.fetchFn !== "function") {
      throw new TypeError("options.fetchFn, when provided, must be a function.");
    }
    super();
    /** @internal */
    this._existingResponses = /* @__PURE__ */ new WeakMap();
    this._url = url2;
    this._options = options;
    this._getRetryDelay = options.getRetryDelay ?? DEFAULT_RETRY_DELAY;
    this._orchestrator = new ReadOrchestrator({
      maxCacheSize: options.maxCacheSize ?? 64 * 2 ** 20,
      // Most files in the real-world have a single sequential access pattern, but having two in parallel can
      // also happen
      maxWorkerCount: 2,
      runWorker: this._runWorker.bind(this),
      prefetchProfile: PREFETCH_PROFILES.network
    });
  }
  /** @internal */
  async _retrieveSize() {
    const abortController = new AbortController();
    const response = await retriedFetch(
      this._options.fetchFn ?? fetch,
      this._url,
      mergeRequestInit(this._options.requestInit ?? {}, {
        headers: {
          // We could also send a non-range request to request the same bytes (all of them), but doing it like
          // this is an easy way to check if the server supports range requests in the first place
          Range: "bytes=0-"
        },
        signal: abortController.signal
      }),
      this._getRetryDelay
    );
    if (!response.ok) {
      throw new Error(`Error fetching ${String(this._url)}: ${response.status} ${response.statusText}`);
    }
    let worker;
    let fileSize;
    if (response.status === 206) {
      fileSize = this._getPartialLengthFromRangeResponse(response);
      worker = this._orchestrator.createWorker(0, Math.min(fileSize, URL_SOURCE_MIN_LOAD_AMOUNT));
    } else {
      const contentLength = response.headers.get("Content-Length");
      if (contentLength) {
        fileSize = Number(contentLength);
        worker = this._orchestrator.createWorker(0, fileSize);
        this._orchestrator.options.maxCacheSize = Infinity;
        console.warn(
          "HTTP server did not respond with 206 Partial Content, meaning the entire remote resource now has to be downloaded. For efficient media file streaming across a network, please make sure your server supports range requests."
        );
      } else {
        throw new Error(`HTTP response (status ${response.status}) must surface Content-Length header.`);
      }
    }
    this._orchestrator.fileSize = fileSize;
    this._existingResponses.set(worker, { response, abortController });
    this._orchestrator.runWorker(worker);
    return fileSize;
  }
  /** @internal */
  _read(start, end) {
    return this._orchestrator.read(start, end);
  }
  /** @internal */
  async _runWorker(worker) {
    while (!worker.aborted) {
      const existing = this._existingResponses.get(worker);
      this._existingResponses.delete(worker);
      let abortController = existing?.abortController;
      let response = existing?.response;
      if (!abortController) {
        abortController = new AbortController();
        response = await retriedFetch(
          this._options.fetchFn ?? fetch,
          this._url,
          mergeRequestInit(this._options.requestInit ?? {}, {
            headers: {
              Range: `bytes=${worker.currentPos}-`
            },
            signal: abortController.signal
          }),
          this._getRetryDelay
        );
      }
      assert(response);
      if (!response.ok) {
        throw new Error(`Error fetching ${String(this._url)}: ${response.status} ${response.statusText}`);
      }
      if (worker.currentPos > 0 && response.status !== 206) {
        throw new Error(
          "HTTP server did not respond with 206 Partial Content to a range request. To enable efficient media file streaming across a network, please make sure your server supports range requests."
        );
      }
      const length = this._getPartialLengthFromRangeResponse(response);
      const required = worker.targetPos - worker.currentPos;
      if (length < required) {
        throw new Error(
          `HTTP response unexpectedly too short: Needed at least ${required} bytes, got only ${length}.`
        );
      }
      if (!response.body) {
        throw new Error(
          "Missing HTTP response body stream. The used fetch function must provide the response body as a ReadableStream."
        );
      }
      const reader = response.body.getReader();
      while (true) {
        if (worker.currentPos >= worker.targetPos || worker.aborted) {
          abortController.abort();
          worker.running = false;
          return;
        }
        let readResult;
        try {
          readResult = await reader.read();
        } catch (error) {
          const retryDelayInSeconds = this._getRetryDelay(1, error, this._url);
          if (retryDelayInSeconds !== null) {
            console.error("Error while reading response stream. Attempting to resume.", error);
            await new Promise((resolve) => setTimeout(resolve, 1e3 * retryDelayInSeconds));
            break;
          } else {
            throw error;
          }
        }
        const { done, value } = readResult;
        if (done) {
          this._orchestrator.forgetWorker(worker);
          if (worker.currentPos < worker.targetPos) {
            throw new Error(
              "Response stream reader stopped unexpectedly before all requested data was read."
            );
          }
          worker.running = false;
          return;
        }
        this.onread?.(worker.currentPos, worker.currentPos + value.length);
        this._orchestrator.supplyWorkerData(worker, value);
      }
    }
    worker.running = false;
  }
  /** @internal */
  _getPartialLengthFromRangeResponse(response) {
    const contentRange = response.headers.get("Content-Range");
    if (contentRange) {
      const match = /\/(\d+)/.exec(contentRange);
      if (match) {
        return Number(match[1]);
      } else {
        throw new Error(`Invalid Content-Range header: ${contentRange}`);
      }
    } else {
      const contentLength = response.headers.get("Content-Length");
      if (contentLength) {
        return Number(contentLength);
      } else {
        throw new Error(
          "Partial HTTP response (status 206) must surface either Content-Range or Content-Length header."
        );
      }
    }
  }
  /** @internal */
  _dispose() {
    this._orchestrator.dispose();
  }
};
var FilePathSource = class extends Source {
  /** Creates a new {@link FilePathSource} backed by the file at the specified file path. */
  constructor(filePath, options = {}) {
    if (typeof filePath !== "string") {
      throw new TypeError("filePath must be a string.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.maxCacheSize !== void 0 && (!isNumber(options.maxCacheSize) || options.maxCacheSize < 0)) {
      throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
    }
    super();
    /** @internal */
    this._fileHandle = null;
    this._streamSource = new StreamSource({
      getSize: async () => {
        this._fileHandle = await node.fs.open(filePath, "r");
        const stats = await this._fileHandle.stat();
        return stats.size;
      },
      read: async (start, end) => {
        assert(this._fileHandle);
        const buffer = new Uint8Array(end - start);
        await this._fileHandle.read(buffer, 0, end - start, start);
        return buffer;
      },
      maxCacheSize: options.maxCacheSize,
      prefetchProfile: "fileSystem"
    });
  }
  /** @internal */
  _read(start, end) {
    return this._streamSource._read(start, end);
  }
  /** @internal */
  _retrieveSize() {
    return this._streamSource._retrieveSize();
  }
  /** @internal */
  _dispose() {
    this._streamSource._dispose();
    void this._fileHandle?.close();
    this._fileHandle = null;
  }
};
var StreamSource = class extends Source {
  /** Creates a new {@link StreamSource} whose behavior is specified by `options`.  */
  constructor(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (typeof options.getSize !== "function") {
      throw new TypeError("options.getSize must be a function.");
    }
    if (typeof options.read !== "function") {
      throw new TypeError("options.read must be a function.");
    }
    if (options.dispose !== void 0 && typeof options.dispose !== "function") {
      throw new TypeError("options.dispose, when provided, must be a function.");
    }
    if (options.maxCacheSize !== void 0 && (!isNumber(options.maxCacheSize) || options.maxCacheSize < 0)) {
      throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
    }
    if (options.prefetchProfile && !["none", "fileSystem", "network"].includes(options.prefetchProfile)) {
      throw new TypeError(
        "options.prefetchProfile, when provided, must be one of 'none', 'fileSystem' or 'network'."
      );
    }
    super();
    this._options = options;
    this._orchestrator = new ReadOrchestrator({
      maxCacheSize: options.maxCacheSize ?? 8 * 2 ** 20,
      maxWorkerCount: 2,
      // Fixed for now, *should* be fine
      prefetchProfile: PREFETCH_PROFILES[options.prefetchProfile ?? "none"],
      runWorker: this._runWorker.bind(this)
    });
  }
  /** @internal */
  _retrieveSize() {
    const result = this._options.getSize();
    if (result instanceof Promise) {
      return result.then((size) => {
        if (!Number.isInteger(size) || size < 0) {
          throw new TypeError("options.getSize must return or resolve to a non-negative integer.");
        }
        this._orchestrator.fileSize = size;
        return size;
      });
    } else {
      if (!Number.isInteger(result) || result < 0) {
        throw new TypeError("options.getSize must return or resolve to a non-negative integer.");
      }
      this._orchestrator.fileSize = result;
      return result;
    }
  }
  /** @internal */
  _read(start, end) {
    return this._orchestrator.read(start, end);
  }
  /** @internal */
  async _runWorker(worker) {
    while (worker.currentPos < worker.targetPos && !worker.aborted) {
      const originalCurrentPos = worker.currentPos;
      const originalTargetPos = worker.targetPos;
      let data = this._options.read(worker.currentPos, originalTargetPos);
      if (data instanceof Promise) data = await data;
      if (data instanceof Uint8Array) {
        data = toUint8Array(data);
        if (data.length !== originalTargetPos - worker.currentPos) {
          throw new Error(
            `options.read returned a Uint8Array with unexpected length: Requested ${originalTargetPos - worker.currentPos} bytes, but got ${data.length}.`
          );
        }
        this.onread?.(worker.currentPos, worker.currentPos + data.length);
        this._orchestrator.supplyWorkerData(worker, data);
      } else if (data instanceof ReadableStream) {
        const reader = data.getReader();
        while (worker.currentPos < originalTargetPos && !worker.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            if (worker.currentPos < originalTargetPos) {
              throw new Error(
                `ReadableStream returned by options.read ended before supplying enough data. Requested ${originalTargetPos - originalCurrentPos} bytes, but got ${worker.currentPos - originalCurrentPos}`
              );
            }
            break;
          }
          if (!(value instanceof Uint8Array)) {
            throw new TypeError("ReadableStream returned by options.read must yield Uint8Array chunks.");
          }
          const data2 = toUint8Array(value);
          this.onread?.(worker.currentPos, worker.currentPos + data2.length);
          this._orchestrator.supplyWorkerData(worker, data2);
        }
      } else {
        throw new TypeError("options.read must return or resolve to a Uint8Array or a ReadableStream.");
      }
    }
    worker.running = false;
  }
  /** @internal */
  _dispose() {
    this._orchestrator.dispose();
    this._options.dispose?.();
  }
};
var ReadableStreamSource = class extends Source {
  /** Creates a new {@link ReadableStreamSource} backed by the specified `ReadableStream<Uint8Array>`. */
  constructor(stream, options = {}) {
    if (!(stream instanceof ReadableStream)) {
      throw new TypeError("stream must be a ReadableStream.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.maxCacheSize !== void 0 && (!isNumber(options.maxCacheSize) || options.maxCacheSize < 0)) {
      throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
    }
    super();
    /** @internal */
    this._reader = null;
    /** @internal */
    this._cache = [];
    /** @internal */
    this._pendingSlices = [];
    /** @internal */
    this._currentIndex = 0;
    /** @internal */
    this._targetIndex = 0;
    /** @internal */
    this._maxRequestedIndex = 0;
    /** @internal */
    this._endIndex = null;
    /** @internal */
    this._pulling = false;
    this._stream = stream;
    this._maxCacheSize = options.maxCacheSize ?? 16 * 2 ** 20;
  }
  /** @internal */
  _retrieveSize() {
    return this._endIndex;
  }
  /** @internal */
  _read(start, end) {
    if (this._endIndex !== null && end > this._endIndex) {
      return null;
    }
    this._maxRequestedIndex = Math.max(this._maxRequestedIndex, end);
    const cacheStartIndex = binarySearchLessOrEqual(this._cache, start, (x) => x.start);
    const cacheStartEntry = cacheStartIndex !== -1 ? this._cache[cacheStartIndex] : null;
    if (cacheStartEntry && cacheStartEntry.start <= start && end <= cacheStartEntry.end) {
      return {
        bytes: cacheStartEntry.bytes,
        view: cacheStartEntry.view,
        offset: cacheStartEntry.start
      };
    }
    let lastEnd = start;
    const bytes2 = new Uint8Array(end - start);
    if (cacheStartIndex !== -1) {
      for (let i = cacheStartIndex; i < this._cache.length; i++) {
        const cacheEntry = this._cache[i];
        if (cacheEntry.start >= end) {
          break;
        }
        const cappedStart = Math.max(start, cacheEntry.start);
        if (cappedStart > lastEnd) {
          this._throwDueToCacheMiss();
        }
        const cappedEnd = Math.min(end, cacheEntry.end);
        if (cappedStart < cappedEnd) {
          bytes2.set(
            cacheEntry.bytes.subarray(cappedStart - cacheEntry.start, cappedEnd - cacheEntry.start),
            cappedStart - start
          );
          lastEnd = cappedEnd;
        }
      }
    }
    if (lastEnd === end) {
      return {
        bytes: bytes2,
        view: toDataView(bytes2),
        offset: start
      };
    }
    if (this._currentIndex > lastEnd) {
      this._throwDueToCacheMiss();
    }
    const { promise, resolve, reject } = promiseWithResolvers();
    this._pendingSlices.push({
      start,
      end,
      bytes: bytes2,
      resolve,
      reject
    });
    this._targetIndex = Math.max(this._targetIndex, end);
    if (!this._pulling) {
      this._pulling = true;
      void this._pull().catch((error) => {
        this._pulling = false;
        if (this._pendingSlices.length > 0) {
          this._pendingSlices.forEach((x) => x.reject(error));
          this._pendingSlices.length = 0;
        } else {
          throw error;
        }
      });
    }
    return promise;
  }
  /** @internal */
  _throwDueToCacheMiss() {
    throw new Error(
      "Read is before the cached region. With ReadableStreamSource, you must access the data more sequentially or increase the size of its cache."
    );
  }
  /** @internal */
  async _pull() {
    this._reader ??= this._stream.getReader();
    while (this._currentIndex < this._targetIndex && !this._disposed) {
      const { done, value } = await this._reader.read();
      if (done) {
        for (const pendingSlice of this._pendingSlices) {
          pendingSlice.resolve(null);
        }
        this._pendingSlices.length = 0;
        this._endIndex = this._currentIndex;
        break;
      }
      const startIndex = this._currentIndex;
      const endIndex = this._currentIndex + value.byteLength;
      for (let i = 0; i < this._pendingSlices.length; i++) {
        const pendingSlice = this._pendingSlices[i];
        const cappedStart = Math.max(startIndex, pendingSlice.start);
        const cappedEnd = Math.min(endIndex, pendingSlice.end);
        if (cappedStart < cappedEnd) {
          pendingSlice.bytes.set(
            value.subarray(cappedStart - startIndex, cappedEnd - startIndex),
            cappedStart - pendingSlice.start
          );
          if (cappedEnd === pendingSlice.end) {
            pendingSlice.resolve({
              bytes: pendingSlice.bytes,
              view: toDataView(pendingSlice.bytes),
              offset: pendingSlice.start
            });
            this._pendingSlices.splice(i, 1);
            i--;
          }
        }
      }
      this._cache.push({
        start: startIndex,
        end: endIndex,
        bytes: value,
        view: toDataView(value),
        age: 0
        // Unused
      });
      while (this._cache.length > 0) {
        const firstEntry = this._cache[0];
        const distance = this._maxRequestedIndex - firstEntry.end;
        if (distance <= this._maxCacheSize) {
          break;
        }
        this._cache.shift();
      }
      this._currentIndex += value.byteLength;
    }
    this._pulling = false;
  }
  /** @internal */
  _dispose() {
    this._pendingSlices.length = 0;
    this._cache.length = 0;
  }
};
var PREFETCH_PROFILES = {
  none: (start, end) => ({ start, end }),
  fileSystem: (start, end) => {
    const padding = 2 ** 16;
    start = Math.floor((start - padding) / padding) * padding;
    end = Math.ceil((end + padding) / padding) * padding;
    return { start, end };
  },
  network: (start, end, workers) => {
    const paddingStart = 2 ** 16;
    start = Math.max(0, Math.floor((start - paddingStart) / paddingStart) * paddingStart);
    for (const worker of workers) {
      const maxExtensionAmount = 8 * 2 ** 20;
      const thresholdPoint = Math.max(
        (worker.startPos + worker.targetPos) / 2,
        worker.targetPos - maxExtensionAmount
      );
      if (closedIntervalsOverlap(
        start,
        end,
        thresholdPoint,
        worker.targetPos
      )) {
        const size = worker.targetPos - worker.startPos;
        const a = Math.ceil((size + 1) / maxExtensionAmount) * maxExtensionAmount;
        const b = 2 ** Math.ceil(Math.log2(size + 1));
        const extent = Math.min(b, a);
        end = Math.max(end, worker.startPos + extent);
      }
    }
    end = Math.max(end, start + URL_SOURCE_MIN_LOAD_AMOUNT);
    return {
      start,
      end
    };
  }
};
var ReadOrchestrator = class {
  constructor(options) {
    this.options = options;
    this.fileSize = null;
    this.nextAge = 0;
    // Used for LRU eviction of both cache entries and workers
    this.workers = [];
    this.cache = [];
    this.currentCacheSize = 0;
    this.disposed = false;
  }
  read(innerStart, innerEnd) {
    assert(this.fileSize !== null);
    const prefetchRange = this.options.prefetchProfile(innerStart, innerEnd, this.workers);
    const outerStart = Math.max(prefetchRange.start, 0);
    const outerEnd = Math.min(prefetchRange.end, this.fileSize);
    assert(outerStart <= innerStart && innerEnd <= outerEnd);
    let result = null;
    const innerCacheStartIndex = binarySearchLessOrEqual(this.cache, innerStart, (x) => x.start);
    const innerStartEntry = innerCacheStartIndex !== -1 ? this.cache[innerCacheStartIndex] : null;
    if (innerStartEntry && innerStartEntry.start <= innerStart && innerEnd <= innerStartEntry.end) {
      innerStartEntry.age = this.nextAge++;
      result = {
        bytes: innerStartEntry.bytes,
        view: innerStartEntry.view,
        offset: innerStartEntry.start
      };
    }
    const outerCacheStartIndex = binarySearchLessOrEqual(this.cache, outerStart, (x) => x.start);
    const bytes2 = result ? null : new Uint8Array(innerEnd - innerStart);
    let contiguousBytesWriteEnd = 0;
    let lastEnd = outerStart;
    const outerHoles = [];
    if (outerCacheStartIndex !== -1) {
      for (let i = outerCacheStartIndex; i < this.cache.length; i++) {
        const entry = this.cache[i];
        if (entry.start >= outerEnd) {
          break;
        }
        if (entry.end <= outerStart) {
          continue;
        }
        const cappedOuterStart = Math.max(outerStart, entry.start);
        const cappedOuterEnd = Math.min(outerEnd, entry.end);
        assert(cappedOuterStart <= cappedOuterEnd);
        if (lastEnd < cappedOuterStart) {
          outerHoles.push({ start: lastEnd, end: cappedOuterStart });
        }
        lastEnd = cappedOuterEnd;
        if (bytes2) {
          const cappedInnerStart = Math.max(innerStart, entry.start);
          const cappedInnerEnd = Math.min(innerEnd, entry.end);
          if (cappedInnerStart < cappedInnerEnd) {
            const relativeOffset = cappedInnerStart - innerStart;
            bytes2.set(
              entry.bytes.subarray(cappedInnerStart - entry.start, cappedInnerEnd - entry.start),
              relativeOffset
            );
            if (relativeOffset === contiguousBytesWriteEnd) {
              contiguousBytesWriteEnd = cappedInnerEnd - innerStart;
            }
          }
        }
        entry.age = this.nextAge++;
      }
      if (lastEnd < outerEnd) {
        outerHoles.push({ start: lastEnd, end: outerEnd });
      }
    } else {
      outerHoles.push({ start: outerStart, end: outerEnd });
    }
    if (bytes2 && contiguousBytesWriteEnd >= bytes2.length) {
      result = {
        bytes: bytes2,
        view: toDataView(bytes2),
        offset: innerStart
      };
    }
    if (outerHoles.length === 0) {
      assert(result);
      return result;
    }
    const { promise, resolve, reject } = promiseWithResolvers();
    const innerHoles = [];
    for (const outerHole of outerHoles) {
      const cappedStart = Math.max(innerStart, outerHole.start);
      const cappedEnd = Math.min(innerEnd, outerHole.end);
      if (cappedStart === outerHole.start && cappedEnd === outerHole.end) {
        innerHoles.push(outerHole);
      } else if (cappedStart < cappedEnd) {
        innerHoles.push({ start: cappedStart, end: cappedEnd });
      }
    }
    for (const outerHole of outerHoles) {
      const pendingSlice = bytes2 && {
        start: innerStart,
        bytes: bytes2,
        holes: innerHoles,
        resolve,
        reject
      };
      let workerFound = false;
      for (const worker of this.workers) {
        const gapTolerance = 2 ** 17;
        if (closedIntervalsOverlap(
          outerHole.start - gapTolerance,
          outerHole.start,
          worker.currentPos,
          worker.targetPos
        )) {
          worker.targetPos = Math.max(worker.targetPos, outerHole.end);
          workerFound = true;
          if (pendingSlice && !worker.pendingSlices.includes(pendingSlice)) {
            worker.pendingSlices.push(pendingSlice);
          }
          if (!worker.running) {
            this.runWorker(worker);
          }
          break;
        }
      }
      if (!workerFound) {
        const newWorker = this.createWorker(outerHole.start, outerHole.end);
        if (pendingSlice) {
          newWorker.pendingSlices = [pendingSlice];
        }
        this.runWorker(newWorker);
      }
    }
    if (!result) {
      assert(bytes2);
      result = promise.then((bytes3) => ({
        bytes: bytes3,
        view: toDataView(bytes3),
        offset: innerStart
      }));
    } else {
    }
    return result;
  }
  createWorker(startPos, targetPos) {
    const worker = {
      startPos,
      currentPos: startPos,
      targetPos,
      running: false,
      aborted: false,
      pendingSlices: [],
      age: this.nextAge++
    };
    this.workers.push(worker);
    while (this.workers.length > this.options.maxWorkerCount) {
      let oldestIndex = 0;
      let oldestWorker = this.workers[0];
      for (let i = 1; i < this.workers.length; i++) {
        const worker2 = this.workers[i];
        if (worker2.age < oldestWorker.age) {
          oldestIndex = i;
          oldestWorker = worker2;
        }
      }
      if (oldestWorker.running && oldestWorker.pendingSlices.length > 0) {
        break;
      }
      oldestWorker.aborted = true;
      this.workers.splice(oldestIndex, 1);
    }
    return worker;
  }
  runWorker(worker) {
    assert(!worker.running);
    assert(worker.currentPos < worker.targetPos);
    worker.running = true;
    worker.age = this.nextAge++;
    void this.options.runWorker(worker).catch((error) => {
      worker.running = false;
      if (worker.pendingSlices.length > 0) {
        worker.pendingSlices.forEach((x) => x.reject(error));
        worker.pendingSlices.length = 0;
      } else {
        throw error;
      }
    });
  }
  /** Called by a worker when it has read some data. */
  supplyWorkerData(worker, bytes2) {
    if (this.disposed) {
      return;
    }
    const start = worker.currentPos;
    const end = start + bytes2.length;
    this.insertIntoCache({
      start,
      end,
      bytes: bytes2,
      view: toDataView(bytes2),
      age: this.nextAge++
    });
    worker.currentPos += bytes2.length;
    worker.targetPos = Math.max(worker.targetPos, worker.currentPos);
    for (let i = 0; i < worker.pendingSlices.length; i++) {
      const pendingSlice = worker.pendingSlices[i];
      const clampedStart = Math.max(start, pendingSlice.start);
      const clampedEnd = Math.min(end, pendingSlice.start + pendingSlice.bytes.length);
      if (clampedStart < clampedEnd) {
        pendingSlice.bytes.set(
          bytes2.subarray(clampedStart - start, clampedEnd - start),
          clampedStart - pendingSlice.start
        );
      }
      for (let j = 0; j < pendingSlice.holes.length; j++) {
        const hole = pendingSlice.holes[j];
        if (start <= hole.start && end > hole.start) {
          hole.start = end;
        }
        if (hole.end <= hole.start) {
          pendingSlice.holes.splice(j, 1);
          j--;
        }
      }
      if (pendingSlice.holes.length === 0) {
        pendingSlice.resolve(pendingSlice.bytes);
        worker.pendingSlices.splice(i, 1);
        i--;
      }
    }
    for (let i = 0; i < this.workers.length; i++) {
      const otherWorker = this.workers[i];
      if (worker === otherWorker || otherWorker.running) {
        continue;
      }
      if (closedIntervalsOverlap(
        start,
        end,
        otherWorker.currentPos,
        otherWorker.targetPos
        // These should typically be equal when the worker's idle
      )) {
        this.workers.splice(i, 1);
        i--;
      }
    }
  }
  forgetWorker(worker) {
    const index = this.workers.indexOf(worker);
    assert(index !== -1);
    this.workers.splice(index, 1);
  }
  insertIntoCache(entry) {
    if (this.options.maxCacheSize === 0) {
      return;
    }
    let insertionIndex = binarySearchLessOrEqual(this.cache, entry.start, (x) => x.start) + 1;
    if (insertionIndex > 0) {
      const previous = this.cache[insertionIndex - 1];
      if (previous.end >= entry.end) {
        return;
      }
      if (previous.end > entry.start) {
        const joined = new Uint8Array(entry.end - previous.start);
        joined.set(previous.bytes, 0);
        joined.set(entry.bytes, entry.start - previous.start);
        this.currentCacheSize += entry.end - previous.end;
        previous.bytes = joined;
        previous.view = toDataView(joined);
        previous.end = entry.end;
        insertionIndex--;
        entry = previous;
      } else {
        this.cache.splice(insertionIndex, 0, entry);
        this.currentCacheSize += entry.bytes.length;
      }
    } else {
      this.cache.splice(insertionIndex, 0, entry);
      this.currentCacheSize += entry.bytes.length;
    }
    for (let i = insertionIndex + 1; i < this.cache.length; i++) {
      const next = this.cache[i];
      if (entry.end <= next.start) {
        break;
      }
      if (entry.end >= next.end) {
        this.cache.splice(i, 1);
        this.currentCacheSize -= next.bytes.length;
        i--;
        continue;
      }
      const joined = new Uint8Array(next.end - entry.start);
      joined.set(entry.bytes, 0);
      joined.set(next.bytes, next.start - entry.start);
      this.currentCacheSize -= entry.end - next.start;
      entry.bytes = joined;
      entry.view = toDataView(joined);
      entry.end = next.end;
      this.cache.splice(i, 1);
      break;
    }
    while (this.currentCacheSize > this.options.maxCacheSize) {
      let oldestIndex = 0;
      let oldestEntry = this.cache[0];
      for (let i = 1; i < this.cache.length; i++) {
        const entry2 = this.cache[i];
        if (entry2.age < oldestEntry.age) {
          oldestIndex = i;
          oldestEntry = entry2;
        }
      }
      if (this.currentCacheSize - oldestEntry.bytes.length <= this.options.maxCacheSize) {
        break;
      }
      this.cache.splice(oldestIndex, 1);
      this.currentCacheSize -= oldestEntry.bytes.length;
    }
  }
  dispose() {
    for (const worker of this.workers) {
      worker.aborted = true;
    }
    this.workers.length = 0;
    this.cache.length = 0;
    this.disposed = true;
  }
};

// src/input.ts
polyfillSymbolDispose();
var Input = class {
  /**
   * Creates a new input file from the specified options. No reading operations will be performed until methods are
   * called on this instance.
   */
  constructor(options) {
    /** @internal */
    this._demuxerPromise = null;
    /** @internal */
    this._format = null;
    /** @internal */
    this._disposed = false;
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!Array.isArray(options.formats) || options.formats.some((x) => !(x instanceof InputFormat))) {
      throw new TypeError("options.formats must be an array of InputFormat.");
    }
    if (!(options.source instanceof Source)) {
      throw new TypeError("options.source must be a Source.");
    }
    if (options.source._disposed) {
      throw new Error("options.source must not be disposed.");
    }
    this._formats = options.formats;
    this._source = options.source;
    this._reader = new Reader11(options.source);
  }
  /** True if the input has been disposed. */
  get disposed() {
    return this._disposed;
  }
  /** @internal */
  _getDemuxer() {
    return this._demuxerPromise ??= (async () => {
      this._reader.fileSize = await this._source.getSizeOrNull();
      for (const format of this._formats) {
        const canRead = await format._canReadInput(this);
        if (canRead) {
          this._format = format;
          return format._createDemuxer(this);
        }
      }
      throw new Error("Input has an unsupported or unrecognizable format.");
    })();
  }
  /**
   * Returns the source from which this input file reads its data. This is the same source that was passed to the
   * constructor.
   */
  get source() {
    return this._source;
  }
  /**
   * Returns the format of the input file. You can compare this result directly to the {@link InputFormat} singletons
   * or use `instanceof` checks for subset-aware logic (for example, `format instanceof MatroskaInputFormat` is true
   * for both MKV and WebM).
   */
  async getFormat() {
    await this._getDemuxer();
    assert(this._format);
    return this._format;
  }
  /**
   * Computes the duration of the input file, in seconds. More precisely, returns the largest end timestamp among
   * all tracks.
   */
  async computeDuration() {
    const demuxer = await this._getDemuxer();
    return demuxer.computeDuration();
  }
  /** Returns the list of all tracks of this input file. */
  async getTracks() {
    const demuxer = await this._getDemuxer();
    return demuxer.getTracks();
  }
  /** Returns the list of all video tracks of this input file. */
  async getVideoTracks() {
    const tracks = await this.getTracks();
    return tracks.filter((x) => x.isVideoTrack());
  }
  /** Returns the list of all audio tracks of this input file. */
  async getAudioTracks() {
    const tracks = await this.getTracks();
    return tracks.filter((x) => x.isAudioTrack());
  }
  /** Returns the list of all subtitle tracks of this input file. */
  async getSubtitleTracks() {
    const tracks = await this.getTracks();
    return tracks.filter((x) => x.isSubtitleTrack());
  }
  /** Returns the primary video track of this input file, or null if there are no video tracks. */
  async getPrimaryVideoTrack() {
    const tracks = await this.getTracks();
    return tracks.find((x) => x.isVideoTrack()) ?? null;
  }
  /** Returns the primary audio track of this input file, or null if there are no audio tracks. */
  async getPrimaryAudioTrack() {
    const tracks = await this.getTracks();
    return tracks.find((x) => x.isAudioTrack()) ?? null;
  }
  /**
   * Returns the list of all subtitle tracks of this input file. This is a convenience property that calls
   * {@link Input.getSubtitleTracks} and caches the result. Note that this property is a promise!
   */
  get subtitleTracks() {
    return this.getSubtitleTracks();
  }
  /**
   * Returns the list of all video tracks of this input file. This is a convenience property that calls
   * {@link Input.getVideoTracks} and caches the result. Note that this property is a promise!
   */
  get videoTracks() {
    return this.getVideoTracks();
  }
  /**
   * Returns the list of all audio tracks of this input file. This is a convenience property that calls
   * {@link Input.getAudioTracks} and caches the result. Note that this property is a promise!
   */
  get audioTracks() {
    return this.getAudioTracks();
  }
  /** Returns the full MIME type of this input file, including track codecs. */
  async getMimeType() {
    const demuxer = await this._getDemuxer();
    return demuxer.getMimeType();
  }
  /**
   * Returns descriptive metadata tags about the media file, such as title, author, date, cover art, or other
   * attached files.
   */
  async getMetadataTags() {
    const demuxer = await this._getDemuxer();
    return demuxer.getMetadataTags();
  }
  /**
   * Disposes this input and frees connected resources. When an input is disposed, ongoing read operations will be
   * canceled, all future read operations will fail, any open decoders will be closed, and all ongoing media sink
   * operations will be canceled. Disallowed and canceled operations will throw an {@link InputDisposedError}.
   *
   * You are expected not to use an input after disposing it. While some operations may still work, it is not
   * specified and may change in any future update.
   */
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._source._disposed = true;
    this._source._dispose();
  }
  /**
   * Calls `.dispose()` on the input, implementing the `Disposable` interface for use with
   * JavaScript Explicit Resource Management features.
   */
  [Symbol.dispose]() {
    this.dispose();
  }
};
var InputDisposedError = class extends Error {
  /** Creates a new {@link InputDisposedError}. */
  constructor(message = "Input has been disposed.") {
    super(message);
    this.name = "InputDisposedError";
  }
};

// src/reader.ts
var Reader11 = class {
  constructor(source) {
    this.source = source;
  }
  requestSlice(start, length) {
    if (this.source._disposed) {
      throw new InputDisposedError();
    }
    if (this.fileSize !== null && start + length > this.fileSize) {
      return null;
    }
    const end = start + length;
    const result = this.source._read(start, end);
    if (result instanceof Promise) {
      return result.then((x) => {
        if (!x) {
          return null;
        }
        return new FileSlice2(x.bytes, x.view, x.offset, start, end);
      });
    } else {
      if (!result) {
        return null;
      }
      return new FileSlice2(result.bytes, result.view, result.offset, start, end);
    }
  }
  requestSliceRange(start, minLength, maxLength) {
    if (this.source._disposed) {
      throw new InputDisposedError();
    }
    if (this.fileSize !== null) {
      return this.requestSlice(
        start,
        clamp(this.fileSize - start, minLength, maxLength)
      );
    } else {
      const promisedAttempt = this.requestSlice(start, maxLength);
      const handleAttempt = (attempt) => {
        if (attempt) {
          return attempt;
        }
        const handleFileSize = (fileSize) => {
          assert(fileSize !== null);
          return this.requestSlice(
            start,
            clamp(fileSize - start, minLength, maxLength)
          );
        };
        const promisedFileSize = this.source._retrieveSize();
        if (promisedFileSize instanceof Promise) {
          return promisedFileSize.then(handleFileSize);
        } else {
          return handleFileSize(promisedFileSize);
        }
      };
      if (promisedAttempt instanceof Promise) {
        return promisedAttempt.then(handleAttempt);
      } else {
        return handleAttempt(promisedAttempt);
      }
    }
  }
};
var FileSlice2 = class _FileSlice {
  constructor(bytes2, view2, offset, start, end) {
    this.bytes = bytes2;
    this.view = view2;
    this.offset = offset;
    this.start = start;
    this.end = end;
    this.bufferPos = start - offset;
  }
  static tempFromBytes(bytes2) {
    return new _FileSlice(
      bytes2,
      toDataView(bytes2),
      0,
      0,
      bytes2.length
    );
  }
  get length() {
    return this.end - this.start;
  }
  get filePos() {
    return this.offset + this.bufferPos;
  }
  set filePos(value) {
    this.bufferPos = value - this.offset;
  }
  /** The number of bytes left from the current pos to the end of the slice. */
  get remainingLength() {
    return Math.max(this.end - this.filePos, 0);
  }
  skip(byteCount) {
    this.bufferPos += byteCount;
  }
  /** Creates a new subslice of this slice whose byte range must be contained within this slice. */
  slice(filePos, length = this.end - filePos) {
    if (filePos < this.start || filePos + length > this.end) {
      throw new RangeError("Slicing outside of original slice.");
    }
    return new _FileSlice(
      this.bytes,
      this.view,
      this.offset,
      filePos,
      filePos + length
    );
  }
};
var checkIsInRange = (slice, bytesToRead) => {
  if (slice.filePos < slice.start || slice.filePos + bytesToRead > slice.end) {
    throw new RangeError(
      `Tried reading [${slice.filePos}, ${slice.filePos + bytesToRead}), but slice is [${slice.start}, ${slice.end}). This is likely an internal error, please report it alongside the file that caused it.`
    );
  }
};
var readBytes = (slice, length) => {
  checkIsInRange(slice, length);
  const bytes2 = slice.bytes.subarray(slice.bufferPos, slice.bufferPos + length);
  slice.bufferPos += length;
  return bytes2;
};
var readU8 = (slice) => {
  checkIsInRange(slice, 1);
  return slice.view.getUint8(slice.bufferPos++);
};
var readU16 = (slice, littleEndian) => {
  checkIsInRange(slice, 2);
  const value = slice.view.getUint16(slice.bufferPos, littleEndian);
  slice.bufferPos += 2;
  return value;
};
var readU16Be = (slice) => {
  checkIsInRange(slice, 2);
  const value = slice.view.getUint16(slice.bufferPos, false);
  slice.bufferPos += 2;
  return value;
};
var readU24Be = (slice) => {
  checkIsInRange(slice, 3);
  const value = getUint24(slice.view, slice.bufferPos, false);
  slice.bufferPos += 3;
  return value;
};
var readI16Be = (slice) => {
  checkIsInRange(slice, 2);
  const value = slice.view.getInt16(slice.bufferPos, false);
  slice.bufferPos += 2;
  return value;
};
var readU32 = (slice, littleEndian) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getUint32(slice.bufferPos, littleEndian);
  slice.bufferPos += 4;
  return value;
};
var readU32Be = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getUint32(slice.bufferPos, false);
  slice.bufferPos += 4;
  return value;
};
var readU32Le = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getUint32(slice.bufferPos, true);
  slice.bufferPos += 4;
  return value;
};
var readI32Be = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getInt32(slice.bufferPos, false);
  slice.bufferPos += 4;
  return value;
};
var readI32Le = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getInt32(slice.bufferPos, true);
  slice.bufferPos += 4;
  return value;
};
var readU64 = (slice, littleEndian) => {
  let low;
  let high;
  if (littleEndian) {
    low = readU32(slice, true);
    high = readU32(slice, true);
  } else {
    high = readU32(slice, false);
    low = readU32(slice, false);
  }
  return high * 4294967296 + low;
};
var readU64Be = (slice) => {
  const high = readU32Be(slice);
  const low = readU32Be(slice);
  return high * 4294967296 + low;
};
var readI64Be = (slice) => {
  const high = readI32Be(slice);
  const low = readU32Be(slice);
  return high * 4294967296 + low;
};
var readI64Le = (slice) => {
  const low = readU32Le(slice);
  const high = readI32Le(slice);
  return high * 4294967296 + low;
};
var readF32Be = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getFloat32(slice.bufferPos, false);
  slice.bufferPos += 4;
  return value;
};
var readF64Be = (slice) => {
  checkIsInRange(slice, 8);
  const value = slice.view.getFloat64(slice.bufferPos, false);
  slice.bufferPos += 8;
  return value;
};
var readAscii = (slice, length) => {
  checkIsInRange(slice, length);
  let str = "";
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(slice.bytes[slice.bufferPos++]);
  }
  return str;
};

// src/flac/flac-muxer.ts
var FLAC_HEADER = new Uint8Array([102, 76, 97, 67]);
var STREAMINFO_SIZE = 38;
var STREAMINFO_BLOCK_SIZE = 34;
var FlacMuxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.metadataWritten = false;
    this.blockSizes = [];
    this.frameSizes = [];
    this.sampleRate = null;
    this.channels = null;
    this.bitsPerSample = null;
    this.writer = output._writer;
    this.format = format;
  }
  async start() {
    this.writer.write(FLAC_HEADER);
  }
  writeHeader({
    bitsPerSample,
    minimumBlockSize,
    maximumBlockSize,
    minimumFrameSize,
    maximumFrameSize,
    sampleRate,
    channels,
    totalSamples
  }) {
    assert(this.writer.getPos() === 4);
    const hasMetadata = !metadataTagsAreEmpty(this.output._metadataTags);
    const headerBitstream = new Bitstream(new Uint8Array(4));
    headerBitstream.writeBits(1, Number(!hasMetadata));
    headerBitstream.writeBits(7, 0 /* STREAMINFO */);
    headerBitstream.writeBits(24, STREAMINFO_BLOCK_SIZE);
    this.writer.write(headerBitstream.bytes);
    const contentBitstream = new Bitstream(new Uint8Array(18));
    contentBitstream.writeBits(16, minimumBlockSize);
    contentBitstream.writeBits(16, maximumBlockSize);
    contentBitstream.writeBits(24, minimumFrameSize);
    contentBitstream.writeBits(24, maximumFrameSize);
    contentBitstream.writeBits(20, sampleRate);
    contentBitstream.writeBits(3, channels - 1);
    contentBitstream.writeBits(5, bitsPerSample - 1);
    if (totalSamples >= 2 ** 32) {
      throw new Error("This muxer only supports writing up to 2 ** 32 samples");
    }
    contentBitstream.writeBits(4, 0);
    contentBitstream.writeBits(32, totalSamples);
    this.writer.write(contentBitstream.bytes);
    this.writer.write(new Uint8Array(16));
  }
  writePictureBlock(picture) {
    const headerSize = 32 + picture.mimeType.length + (picture.description?.length ?? 0) + picture.data.length;
    const header = new Uint8Array(headerSize);
    let offset = 0;
    const dataView = toDataView(header);
    dataView.setUint32(
      offset,
      picture.kind === "coverFront" ? 3 : picture.kind === "coverBack" ? 4 : 0
    );
    offset += 4;
    dataView.setUint32(offset, picture.mimeType.length);
    offset += 4;
    header.set(textEncoder.encode(picture.mimeType), 8);
    offset += picture.mimeType.length;
    dataView.setUint32(offset, picture.description?.length ?? 0);
    offset += 4;
    header.set(textEncoder.encode(picture.description ?? ""), offset);
    offset += picture.description?.length ?? 0;
    offset += 4 + 4 + 4 + 4;
    dataView.setUint32(offset, picture.data.length);
    offset += 4;
    header.set(picture.data, offset);
    offset += picture.data.length;
    assert(offset === headerSize);
    const headerBitstream = new Bitstream(new Uint8Array(4));
    headerBitstream.writeBits(1, 0);
    headerBitstream.writeBits(7, 6 /* PICTURE */);
    headerBitstream.writeBits(24, headerSize);
    this.writer.write(headerBitstream.bytes);
    this.writer.write(header);
  }
  writeVorbisCommentAndPictureBlock() {
    this.writer.seek(STREAMINFO_SIZE + FLAC_HEADER.byteLength);
    if (metadataTagsAreEmpty(this.output._metadataTags)) {
      this.metadataWritten = true;
      return;
    }
    const pictures = this.output._metadataTags.images ?? [];
    for (const picture of pictures) {
      this.writePictureBlock(picture);
    }
    const vorbisComment = createVorbisComments(
      new Uint8Array(0),
      this.output._metadataTags,
      false
    );
    const headerBitstream = new Bitstream(new Uint8Array(4));
    headerBitstream.writeBits(1, 1);
    headerBitstream.writeBits(7, 4 /* VORBIS_COMMENT */);
    headerBitstream.writeBits(24, vorbisComment.length);
    this.writer.write(headerBitstream.bytes);
    this.writer.write(vorbisComment);
    this.metadataWritten = true;
  }
  async getMimeType() {
    return "audio/flac";
  }
  async addEncodedVideoPacket() {
    throw new Error("FLAC does not support video.");
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    validateAudioChunkMetadata(meta);
    assert(meta);
    assert(meta.decoderConfig);
    assert(meta.decoderConfig.description);
    try {
      this.validateAndNormalizeTimestamp(
        track,
        packet.timestamp,
        packet.type === "key"
      );
      if (this.sampleRate === null) {
        this.sampleRate = meta.decoderConfig.sampleRate;
      }
      if (this.channels === null) {
        this.channels = meta.decoderConfig.numberOfChannels;
      }
      if (this.bitsPerSample === null) {
        const descriptionBitstream = new Bitstream(
          toUint8Array(meta.decoderConfig.description)
        );
        descriptionBitstream.skipBits(103 + 64);
        const bitsPerSample = descriptionBitstream.readBits(5) + 1;
        this.bitsPerSample = bitsPerSample;
      }
      if (!this.metadataWritten) {
        this.writeVorbisCommentAndPictureBlock();
      }
      const slice = FileSlice2.tempFromBytes(packet.data);
      readBytes(slice, 2);
      const bytes2 = readBytes(slice, 2);
      const bitstream = new Bitstream(bytes2);
      const blockSizeOrUncommon = getBlockSizeOrUncommon(bitstream.readBits(4));
      if (blockSizeOrUncommon === null) {
        throw new Error("Invalid FLAC frame: Invalid block size.");
      }
      readCodedNumber(slice);
      const blockSize = readBlockSize(slice, blockSizeOrUncommon);
      this.blockSizes.push(blockSize);
      this.frameSizes.push(packet.data.length);
      const startPos = this.writer.getPos();
      this.writer.write(packet.data);
      if (this.format._options.onFrame) {
        this.format._options.onFrame(packet.data, startPos);
      }
      await this.writer.flush();
    } finally {
      release();
    }
  }
  addSubtitleCue() {
    throw new Error("FLAC does not support subtitles.");
  }
  async finalize() {
    const release = await this.mutex.acquire();
    let minimumBlockSize = Infinity;
    let maximumBlockSize = 0;
    let minimumFrameSize = Infinity;
    let maximumFrameSize = 0;
    let totalSamples = 0;
    for (let i = 0; i < this.blockSizes.length; i++) {
      minimumFrameSize = Math.min(minimumFrameSize, this.frameSizes[i]);
      maximumFrameSize = Math.max(maximumFrameSize, this.frameSizes[i]);
      maximumBlockSize = Math.max(maximumBlockSize, this.blockSizes[i]);
      totalSamples += this.blockSizes[i];
      const isLastFrame = i === this.blockSizes.length - 1;
      if (isLastFrame) {
        continue;
      }
      minimumBlockSize = Math.min(minimumBlockSize, this.blockSizes[i]);
    }
    assert(this.sampleRate !== null);
    assert(this.channels !== null);
    assert(this.bitsPerSample !== null);
    this.writer.seek(4);
    this.writeHeader({
      minimumBlockSize,
      maximumBlockSize,
      minimumFrameSize,
      maximumFrameSize,
      sampleRate: this.sampleRate,
      channels: this.channels,
      bitsPerSample: this.bitsPerSample,
      totalSamples
    });
    release();
  }
};

// src/isobmff/isobmff-boxes.ts
init_subtitles();
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
var rotationMatrix = (rotationInDegrees) => {
  const theta = rotationInDegrees * (Math.PI / 180);
  const cosTheta = Math.round(Math.cos(theta));
  const sinTheta = Math.round(Math.sin(theta));
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
  const minorVersion = 512;
  if (details.isQuickTime) {
    return box("ftyp", [
      ascii("qt  "),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("qt  ")
    ]);
  }
  if (details.fragmented) {
    return box("ftyp", [
      ascii("iso5"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("iso5"),
      ascii("iso6"),
      ascii("mp41")
    ]);
  }
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
var moov = (muxer) => box("moov", void 0, [
  mvhd(muxer.creationTime, muxer.trackDatas),
  ...muxer.trackDatas.map((x) => trak(x, muxer.creationTime)),
  muxer.isFragmented ? mvex(muxer.trackDatas) : null,
  udta(muxer)
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
var trak = (trackData, creationTime) => {
  const trackMetadata = getTrackMetadata(trackData);
  return box("trak", void 0, [
    tkhd(trackData, creationTime),
    mdia(trackData, creationTime),
    trackMetadata.name !== void 0 ? box("udta", void 0, [
      box("name", [
        // VLC (and Mediabunny) also recognize ©nam
        ...textEncoder.encode(trackMetadata.name)
      ])
    ]) : null
  ]);
};
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
    matrix = rotationMatrix(rotation ?? 0);
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
  hdlr(true, TRACK_TYPE_TO_COMPONENT_SUBTYPE[trackData.type], TRACK_TYPE_TO_HANDLER_NAME[trackData.type]),
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
    u16(getLanguageCodeInt(trackData.track.metadata.languageCode ?? UNDETERMINED_LANGUAGE)),
    // Language
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
  video: "MediabunnyVideoHandler",
  audio: "MediabunnySoundHandler",
  subtitle: "MediabunnyTextHandler"
};
var hdlr = (hasComponentType, handlerType, name, manufacturer = "\0\0\0\0") => fullBox("hdlr", 0, 0, [
  hasComponentType ? ascii("mhlr") : u32(0),
  // Component type
  ascii(handlerType),
  // Component subtype
  ascii(manufacturer),
  // Component manufacturer
  u32(0),
  // Component flags
  u32(0),
  // Component flags mask
  ascii(name, true)
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
    needsCtts ? ctts(trackData) : null,
    needsCtts ? cslg(trackData) : null,
    stsc(trackData),
    stsz(trackData),
    stco(trackData),
    stss(trackData)
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
    const boxName = audioCodecToBoxName(trackData.track.source._codec, trackData.muxer.isQuickTime);
    assert(boxName);
    sampleDescription = soundSampleDescription(
      boxName,
      trackData
    );
  } else if (trackData.type === "subtitle") {
    const boxName = SUBTITLE_CODEC_TO_BOX_NAME[trackData.track.source._codec];
    if (!boxName) {
      throw new Error(
        `Subtitle codec '${trackData.track.source._codec}' is not supported in MP4/MOV. Only WebVTT is supported.`
      );
    }
    sampleDescription = subtitleSampleDescription(
      boxName,
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
  const parts = decoderConfig.codec.split(".");
  const profile = Number(parts[1]);
  const level = Number(parts[2]);
  const bitDepth = Number(parts[3]);
  const chromaSubsampling = parts[4] ? Number(parts[4]) : 1;
  const videoFullRangeFlag = parts[8] ? Number(parts[8]) : Number(decoderConfig.colorSpace?.fullRange ?? 0);
  const thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + videoFullRangeFlag;
  const colourPrimaries = parts[5] ? Number(parts[5]) : decoderConfig.colorSpace?.primaries ? COLOR_PRIMARIES_MAP[decoderConfig.colorSpace.primaries] : 2;
  const transferCharacteristics = parts[6] ? Number(parts[6]) : decoderConfig.colorSpace?.transfer ? TRANSFER_CHARACTERISTICS_MAP[decoderConfig.colorSpace.transfer] : 2;
  const matrixCoefficients = parts[7] ? Number(parts[7]) : decoderConfig.colorSpace?.matrix ? MATRIX_COEFFICIENTS_MAP[decoderConfig.colorSpace.matrix] : 2;
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
var av1C = (trackData) => {
  return box("av1C", generateAv1CodecConfigurationFromCodecString(trackData.info.decoderConfig.codec));
};
var soundSampleDescription = (compressionType, trackData) => {
  let version = 0;
  let contents;
  let sampleSizeInBits = 16;
  if (PCM_AUDIO_CODECS.includes(trackData.track.source._codec)) {
    const codec = trackData.track.source._codec;
    const { sampleSize } = parsePcmCodec(codec);
    sampleSizeInBits = 8 * sampleSize;
    if (sampleSizeInBits > 16) {
      version = 1;
    }
  }
  if (version === 0) {
    contents = [
      Array(6).fill(0),
      // Reserved
      u16(1),
      // Data reference index
      u16(version),
      // Version
      u16(0),
      // Revision level
      u32(0),
      // Vendor
      u16(trackData.info.numberOfChannels),
      // Number of channels
      u16(sampleSizeInBits),
      // Sample size (bits)
      u16(0),
      // Compression ID
      u16(0),
      // Packet size
      u16(trackData.info.sampleRate < 2 ** 16 ? trackData.info.sampleRate : 0),
      // Sample rate (upper)
      u16(0)
      // Sample rate (lower)
    ];
  } else {
    contents = [
      Array(6).fill(0),
      // Reserved
      u16(1),
      // Data reference index
      u16(version),
      // Version
      u16(0),
      // Revision level
      u32(0),
      // Vendor
      u16(trackData.info.numberOfChannels),
      // Number of channels
      u16(Math.min(sampleSizeInBits, 16)),
      // Sample size (bits)
      u16(0),
      // Compression ID
      u16(0),
      // Packet size
      u16(trackData.info.sampleRate < 2 ** 16 ? trackData.info.sampleRate : 0),
      // Sample rate (upper)
      u16(0),
      // Sample rate (lower)
      u32(1),
      // Samples per packet (must be 1 for uncompressed formats)
      u32(sampleSizeInBits / 8),
      // Bytes per packet
      u32(trackData.info.numberOfChannels * sampleSizeInBits / 8),
      // Bytes per frame
      u32(2)
      // Bytes per sample (constant in FFmpeg)
    ];
  }
  return box(compressionType, contents, [
    audioCodecToConfigurationBox(trackData.track.source._codec, trackData.muxer.isQuickTime)?.(trackData) ?? null
  ]);
};
var esds = (trackData) => {
  let objectTypeIndication;
  switch (trackData.track.source._codec) {
    case "aac":
      {
        objectTypeIndication = 64;
      }
      ;
      break;
    case "mp3":
      {
        objectTypeIndication = 107;
      }
      ;
      break;
    case "vorbis":
      {
        objectTypeIndication = 221;
      }
      ;
      break;
    default:
      throw new Error(`Unhandled audio codec: ${trackData.track.source._codec}`);
  }
  let bytes2 = [
    ...u8(objectTypeIndication),
    // Object type indication
    ...u8(21),
    // stream type(6bits)=5 audio, flags(2bits)=1
    ...u24(0),
    // 24bit buffer size
    ...u32(0),
    // max bitrate
    ...u32(0)
    // avg bitrate
  ];
  if (trackData.info.decoderConfig.description) {
    const description = toUint8Array(trackData.info.decoderConfig.description);
    bytes2 = [
      ...bytes2,
      ...u8(5),
      // TAG(5) = DecoderSpecificInfo
      ...variableUnsignedInt(description.byteLength),
      ...description
    ];
  }
  bytes2 = [
    ...u16(1),
    // ES_ID = 1
    ...u8(0),
    // flags etc = 0
    ...u8(4),
    // TAG(4) = ES Descriptor
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
    // TAG(3) = Object Descriptor
    ...variableUnsignedInt(bytes2.length),
    ...bytes2
  ];
  return fullBox("esds", 0, 0, bytes2);
};
var wave = (trackData) => {
  return box("wave", void 0, [
    frma(trackData),
    enda(trackData),
    box("\0\0\0\0")
    // NULL tag at the end
  ]);
};
var frma = (trackData) => {
  return box("frma", [
    ascii(audioCodecToBoxName(trackData.track.source._codec, trackData.muxer.isQuickTime))
  ]);
};
var enda = (trackData) => {
  const { littleEndian } = parsePcmCodec(trackData.track.source._codec);
  return box("enda", [
    u16(+littleEndian)
  ]);
};
var dOps = (trackData) => {
  let outputChannelCount = trackData.info.numberOfChannels;
  let preSkip = 3840;
  let inputSampleRate = trackData.info.sampleRate;
  let outputGain = 0;
  let channelMappingFamily = 0;
  let channelMappingTable = new Uint8Array(0);
  const description = trackData.info.decoderConfig?.description;
  if (description) {
    assert(description.byteLength >= 18);
    const bytes2 = toUint8Array(description);
    const header = parseOpusIdentificationHeader(bytes2);
    outputChannelCount = header.outputChannelCount;
    preSkip = header.preSkip;
    inputSampleRate = header.inputSampleRate;
    outputGain = header.outputGain;
    channelMappingFamily = header.channelMappingFamily;
    if (header.channelMappingTable) {
      channelMappingTable = header.channelMappingTable;
    }
  }
  return box("dOps", [
    u8(0),
    // Version
    u8(outputChannelCount),
    // OutputChannelCount
    u16(preSkip),
    // PreSkip
    u32(inputSampleRate),
    // InputSampleRate
    i16(outputGain),
    // OutputGain
    u8(channelMappingFamily),
    // ChannelMappingFamily
    ...channelMappingTable
  ]);
};
var dfLa = (trackData) => {
  const description = trackData.info.decoderConfig?.description;
  assert(description);
  const bytes2 = toUint8Array(description);
  return fullBox("dfLa", 0, 0, [
    ...bytes2.subarray(4)
  ]);
};
var pcmC = (trackData) => {
  const { littleEndian, sampleSize } = parsePcmCodec(trackData.track.source._codec);
  const formatFlags = +littleEndian;
  return fullBox("pcmC", 0, 0, [
    u8(formatFlags),
    u8(8 * sampleSize)
  ]);
};
var subtitleSampleDescription = (compressionType, trackData) => {
  const configBox = SUBTITLE_CODEC_TO_CONFIGURATION_BOX[trackData.track.source._codec];
  if (!configBox) {
    throw new Error(
      `Subtitle codec '${trackData.track.source._codec}' is not supported in MP4/MOV. Only WebVTT is supported.`
    );
  }
  return box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1)
    // Data reference index
  ], [
    configBox(trackData)
  ]);
};
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
var stsz = (trackData) => {
  if (trackData.type === "audio" && trackData.info.requiresPcmTransformation) {
    const { sampleSize } = parsePcmCodec(trackData.track.source._codec);
    return fullBox("stsz", 0, 0, [
      u32(sampleSize * trackData.info.numberOfChannels),
      // Sample size
      u32(trackData.samples.reduce((acc, x) => acc + intoTimescale(x.duration, trackData.timescale), 0))
    ]);
  }
  return fullBox("stsz", 0, 0, [
    u32(0),
    // Sample size (0 means non-constant size)
    u32(trackData.samples.length),
    // Number of entries
    trackData.samples.map((x) => u32(x.size))
    // Sample size table
  ]);
};
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
  return fullBox("ctts", 1, 0, [
    u32(trackData.compositionTimeOffsetTable.length),
    // Number of entries
    trackData.compositionTimeOffsetTable.map((x) => [
      // Time-to-sample table
      u32(x.sampleCount),
      // Sample count
      i32(x.sampleCompositionTimeOffset)
      // Sample offset
    ])
  ]);
};
var cslg = (trackData) => {
  let leastDecodeToDisplayDelta = Infinity;
  let greatestDecodeToDisplayDelta = -Infinity;
  let compositionStartTime = Infinity;
  let compositionEndTime = -Infinity;
  assert(trackData.compositionTimeOffsetTable.length > 0);
  assert(trackData.samples.length > 0);
  for (let i = 0; i < trackData.compositionTimeOffsetTable.length; i++) {
    const entry = trackData.compositionTimeOffsetTable[i];
    leastDecodeToDisplayDelta = Math.min(leastDecodeToDisplayDelta, entry.sampleCompositionTimeOffset);
    greatestDecodeToDisplayDelta = Math.max(greatestDecodeToDisplayDelta, entry.sampleCompositionTimeOffset);
  }
  for (let i = 0; i < trackData.samples.length; i++) {
    const sample = trackData.samples[i];
    compositionStartTime = Math.min(
      compositionStartTime,
      intoTimescale(sample.timestamp, trackData.timescale)
    );
    compositionEndTime = Math.max(
      compositionEndTime,
      intoTimescale(sample.timestamp + sample.duration, trackData.timescale)
    );
  }
  const compositionToDtsShift = Math.max(-leastDecodeToDisplayDelta, 0);
  if (compositionEndTime >= 2 ** 31) {
    return null;
  }
  return fullBox("cslg", 0, 0, [
    i32(compositionToDtsShift),
    // Composition to DTS shift
    i32(leastDecodeToDisplayDelta),
    // Least decode to display delta
    i32(greatestDecodeToDisplayDelta),
    // Greatest decode to display delta
    i32(compositionStartTime),
    // Composition start time
    i32(compositionEndTime)
    // Composition end time
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
var udta = (muxer) => {
  const boxes = [];
  const metadataFormat = muxer.format._options.metadataFormat ?? "auto";
  const metadataTags = muxer.output._metadataTags;
  if (metadataFormat === "mdir" || metadataFormat === "auto" && !muxer.isQuickTime) {
    const metaBox = metaMdir(metadataTags);
    if (metaBox) boxes.push(metaBox);
  } else if (metadataFormat === "mdta") {
    const metaBox = metaMdta(metadataTags);
    if (metaBox) boxes.push(metaBox);
  } else if (metadataFormat === "udta" || metadataFormat === "auto" && muxer.isQuickTime) {
    addQuickTimeMetadataTagBoxes(boxes, muxer.output._metadataTags);
  }
  if (boxes.length === 0) {
    return null;
  }
  return box("udta", void 0, boxes);
};
var addQuickTimeMetadataTagBoxes = (boxes, tags) => {
  for (const { key, value } of keyValueIterator(tags)) {
    switch (key) {
      case "title":
        {
          boxes.push(metadataTagStringBoxShort("\xA9nam", value));
        }
        ;
        break;
      case "description":
        {
          boxes.push(metadataTagStringBoxShort("\xA9des", value));
        }
        ;
        break;
      case "artist":
        {
          boxes.push(metadataTagStringBoxShort("\xA9ART", value));
        }
        ;
        break;
      case "album":
        {
          boxes.push(metadataTagStringBoxShort("\xA9alb", value));
        }
        ;
        break;
      case "albumArtist":
        {
          boxes.push(metadataTagStringBoxShort("albr", value));
        }
        ;
        break;
      case "genre":
        {
          boxes.push(metadataTagStringBoxShort("\xA9gen", value));
        }
        ;
        break;
      case "date":
        {
          boxes.push(metadataTagStringBoxShort("\xA9day", value.toISOString().slice(0, 10)));
        }
        ;
        break;
      case "comment":
        {
          boxes.push(metadataTagStringBoxShort("\xA9cmt", value));
        }
        ;
        break;
      case "lyrics":
        {
          boxes.push(metadataTagStringBoxShort("\xA9lyr", value));
        }
        ;
        break;
      case "raw":
        {
        }
        ;
        break;
      case "discNumber":
      case "discsTotal":
      case "trackNumber":
      case "tracksTotal":
      case "images":
        {
        }
        ;
        break;
      default:
        assertNever(key);
    }
  }
  if (tags.raw) {
    for (const key in tags.raw) {
      const value = tags.raw[key];
      if (value == null || key.length !== 4 || boxes.some((x) => x.type === key)) {
        continue;
      }
      if (typeof value === "string") {
        boxes.push(metadataTagStringBoxShort(key, value));
      } else if (value instanceof Uint8Array) {
        boxes.push(box(key, Array.from(value)));
      }
    }
  }
};
var metadataTagStringBoxShort = (name, value) => {
  const encoded = textEncoder.encode(value);
  return box(name, [
    u16(encoded.length),
    u16(getLanguageCodeInt("und")),
    Array.from(encoded)
  ]);
};
var DATA_BOX_MIME_TYPE_MAP = {
  "image/jpeg": 13,
  "image/png": 14,
  "image/bmp": 27
};
var generateMetadataPairs = (tags, isMdta) => {
  const pairs = [];
  for (const { key, value } of keyValueIterator(tags)) {
    switch (key) {
      case "title":
        {
          pairs.push({ key: isMdta ? "title" : "\xA9nam", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "description":
        {
          pairs.push({ key: isMdta ? "description" : "\xA9des", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "artist":
        {
          pairs.push({ key: isMdta ? "artist" : "\xA9ART", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "album":
        {
          pairs.push({ key: isMdta ? "album" : "\xA9alb", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "albumArtist":
        {
          pairs.push({ key: isMdta ? "album_artist" : "aART", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "comment":
        {
          pairs.push({ key: isMdta ? "comment" : "\xA9cmt", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "genre":
        {
          pairs.push({ key: isMdta ? "genre" : "\xA9gen", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "lyrics":
        {
          pairs.push({ key: isMdta ? "lyrics" : "\xA9lyr", value: dataStringBoxLong(value) });
        }
        ;
        break;
      case "date":
        {
          pairs.push({
            key: isMdta ? "date" : "\xA9day",
            value: dataStringBoxLong(value.toISOString().slice(0, 10))
          });
        }
        ;
        break;
      case "images":
        {
          for (const image of value) {
            if (image.kind !== "coverFront") {
              continue;
            }
            pairs.push({ key: "covr", value: box("data", [
              u32(DATA_BOX_MIME_TYPE_MAP[image.mimeType] ?? 0),
              // Type indicator
              u32(0),
              // Locale indicator
              Array.from(image.data)
              // Kinda slow, hopefully temp
            ]) });
          }
        }
        ;
        break;
      case "trackNumber":
        {
          if (isMdta) {
            const string = tags.tracksTotal !== void 0 ? `${value}/${tags.tracksTotal}` : value.toString();
            pairs.push({ key: "track", value: dataStringBoxLong(string) });
          } else {
            pairs.push({ key: "trkn", value: box("data", [
              u32(0),
              // 8 bytes empty
              u32(0),
              u16(0),
              // Empty
              u16(value),
              u16(tags.tracksTotal ?? 0),
              u16(0)
              // Empty
            ]) });
          }
        }
        ;
        break;
      case "discNumber":
        {
          if (!isMdta) {
            pairs.push({ key: "disc", value: box("data", [
              u32(0),
              // 8 bytes empty
              u32(0),
              u16(0),
              // Empty
              u16(value),
              u16(tags.discsTotal ?? 0),
              u16(0)
              // Empty
            ]) });
          }
        }
        ;
        break;
      case "tracksTotal":
      case "discsTotal":
        {
        }
        ;
        break;
      case "raw":
        {
        }
        ;
        break;
      default:
        assertNever(key);
    }
  }
  if (tags.raw) {
    for (const key in tags.raw) {
      const value = tags.raw[key];
      if (value == null || !isMdta && key.length !== 4 || pairs.some((x) => x.key === key)) {
        continue;
      }
      if (typeof value === "string") {
        pairs.push({ key, value: dataStringBoxLong(value) });
      } else if (value instanceof Uint8Array) {
        pairs.push({ key, value: box("data", [
          u32(0),
          // Type indicator
          u32(0),
          // Locale indicator
          Array.from(value)
        ]) });
      } else if (value instanceof RichImageData) {
        pairs.push({ key, value: box("data", [
          u32(DATA_BOX_MIME_TYPE_MAP[value.mimeType] ?? 0),
          // Type indicator
          u32(0),
          // Locale indicator
          Array.from(value.data)
          // Kinda slow, hopefully temp
        ]) });
      }
    }
  }
  return pairs;
};
var metaMdir = (tags) => {
  const pairs = generateMetadataPairs(tags, false);
  if (pairs.length === 0) {
    return null;
  }
  return fullBox("meta", 0, 0, void 0, [
    hdlr(false, "mdir", "", "appl"),
    // mdir handler
    box("ilst", void 0, pairs.map((pair) => box(pair.key, void 0, [pair.value])))
    // Item list without keys box
  ]);
};
var metaMdta = (tags) => {
  const pairs = generateMetadataPairs(tags, true);
  if (pairs.length === 0) {
    return null;
  }
  return box("meta", void 0, [
    hdlr(false, "mdta", ""),
    // mdta handler
    fullBox("keys", 0, 0, [
      u32(pairs.length)
    ], pairs.map((pair) => box("mdta", [
      // Hacky since these aren't boxes technically, but if not box why box-shaped?
      ...textEncoder.encode(pair.key)
    ]))),
    box("ilst", void 0, pairs.map((pair, i) => {
      const boxName = String.fromCharCode(...u32(i + 1));
      return box(boxName, void 0, [pair.value]);
    }))
  ]);
};
var dataStringBoxLong = (value) => {
  return box("data", [
    u32(1),
    // Type indicator (UTF-8)
    u32(0),
    // Locale indicator
    ...textEncoder.encode(value)
  ]);
};
var VIDEO_CODEC_TO_BOX_NAME = {
  avc: "avc1",
  hevc: "hvc1",
  vp8: "vp08",
  vp9: "vp09",
  av1: "av01",
  mpeg4: "mp4v"
};
var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
  avc: avcC,
  hevc: hvcC,
  vp8: vpcC,
  vp9: vpcC,
  av1: av1C,
  mpeg4: () => null
};
var audioCodecToBoxName = (codec, isQuickTime) => {
  switch (codec) {
    case "aac":
      return "mp4a";
    case "mp3":
      return "mp4a";
    case "opus":
      return "Opus";
    case "vorbis":
      return "mp4a";
    case "flac":
      return "fLaC";
    case "ulaw":
      return "ulaw";
    case "alaw":
      return "alaw";
    case "pcm-u8":
      return "raw ";
    case "pcm-s8":
      return "sowt";
    case "eac3":
      return "ec-3";
  }
  if (isQuickTime) {
    switch (codec) {
      case "pcm-s16":
        return "sowt";
      case "pcm-s16be":
        return "twos";
      case "pcm-s24":
        return "in24";
      case "pcm-s24be":
        return "in24";
      case "pcm-s32":
        return "in32";
      case "pcm-s32be":
        return "in32";
      case "pcm-f32":
        return "fl32";
      case "pcm-f32be":
        return "fl32";
      case "pcm-f64":
        return "fl64";
      case "pcm-f64be":
        return "fl64";
    }
  } else {
    switch (codec) {
      case "pcm-s16":
        return "ipcm";
      case "pcm-s16be":
        return "ipcm";
      case "pcm-s24":
        return "ipcm";
      case "pcm-s24be":
        return "ipcm";
      case "pcm-s32":
        return "ipcm";
      case "pcm-s32be":
        return "ipcm";
      case "pcm-f32":
        return "fpcm";
      case "pcm-f32be":
        return "fpcm";
      case "pcm-f64":
        return "fpcm";
      case "pcm-f64be":
        return "fpcm";
    }
  }
  throw new Error(`Unsupported audio codec: ${codec}`);
};
var audioCodecToConfigurationBox = (codec, isQuickTime) => {
  switch (codec) {
    case "aac":
      return esds;
    case "mp3":
      return esds;
    case "opus":
      return dOps;
    case "vorbis":
      return esds;
    case "flac":
      return dfLa;
  }
  if (isQuickTime) {
    switch (codec) {
      case "pcm-s24":
        return wave;
      case "pcm-s24be":
        return wave;
      case "pcm-s32":
        return wave;
      case "pcm-s32be":
        return wave;
      case "pcm-f32":
        return wave;
      case "pcm-f32be":
        return wave;
      case "pcm-f64":
        return wave;
      case "pcm-f64be":
        return wave;
    }
  } else {
    switch (codec) {
      case "pcm-s16":
        return pcmC;
      case "pcm-s16be":
        return pcmC;
      case "pcm-s24":
        return pcmC;
      case "pcm-s24be":
        return pcmC;
      case "pcm-s32":
        return pcmC;
      case "pcm-s32be":
        return pcmC;
      case "pcm-f32":
        return pcmC;
      case "pcm-f32be":
        return pcmC;
      case "pcm-f64":
        return pcmC;
      case "pcm-f64be":
        return pcmC;
    }
  }
  return null;
};
var SUBTITLE_CODEC_TO_BOX_NAME = {
  webvtt: "wvtt",
  tx3g: "tx3g",
  ttml: "stpp"
};
var SUBTITLE_CODEC_TO_CONFIGURATION_BOX = {
  webvtt: vttC,
  tx3g: () => null,
  // tx3g doesn't require a configuration box
  ttml: () => null
  // stpp configuration is optional
};
var getLanguageCodeInt = (code) => {
  assert(code.length === 3);
  ;
  let language = 0;
  for (let i = 0; i < 3; i++) {
    language <<= 5;
    language += code.charCodeAt(i) - 96;
  }
  return language;
};

// src/writer.ts
var Writer = class {
  constructor() {
    /** Setting this to true will cause the writer to ensure data is written in a strictly monotonic, streamable way. */
    this.ensureMonotonicity = false;
    this.trackedWrites = null;
    this.trackedStart = -1;
    this.trackedEnd = -1;
  }
  start() {
  }
  maybeTrackWrites(data) {
    if (!this.trackedWrites) {
      return;
    }
    let pos = this.getPos();
    if (pos < this.trackedStart) {
      if (pos + data.byteLength <= this.trackedStart) {
        return;
      }
      data = data.subarray(this.trackedStart - pos);
      pos = 0;
    }
    const neededSize = pos + data.byteLength - this.trackedStart;
    let newLength = this.trackedWrites.byteLength;
    while (newLength < neededSize) {
      newLength *= 2;
    }
    if (newLength !== this.trackedWrites.byteLength) {
      const copy = new Uint8Array(newLength);
      copy.set(this.trackedWrites, 0);
      this.trackedWrites = copy;
    }
    this.trackedWrites.set(data, pos - this.trackedStart);
    this.trackedEnd = Math.max(this.trackedEnd, pos + data.byteLength);
  }
  startTrackingWrites() {
    this.trackedWrites = new Uint8Array(2 ** 10);
    this.trackedStart = this.getPos();
    this.trackedEnd = this.trackedStart;
  }
  stopTrackingWrites() {
    if (!this.trackedWrites) {
      throw new Error("Internal error: Can't get tracked writes since nothing was tracked.");
    }
    const slice = this.trackedWrites.subarray(0, this.trackedEnd - this.trackedStart);
    const result = {
      data: slice,
      start: this.trackedStart,
      end: this.trackedEnd
    };
    this.trackedWrites = null;
    return result;
  }
};
var ARRAY_BUFFER_INITIAL_SIZE = 2 ** 16;
var ARRAY_BUFFER_MAX_SIZE = 2 ** 32;
var BufferTargetWriter = class extends Writer {
  constructor(target) {
    super();
    this.pos = 0;
    this.maxPos = 0;
    this.target = target;
    this.supportsResize = "resize" in new ArrayBuffer(0);
    if (this.supportsResize) {
      try {
        this.buffer = new ArrayBuffer(ARRAY_BUFFER_INITIAL_SIZE, { maxByteLength: ARRAY_BUFFER_MAX_SIZE });
      } catch {
        this.buffer = new ArrayBuffer(ARRAY_BUFFER_INITIAL_SIZE);
        this.supportsResize = false;
      }
    } else {
      this.buffer = new ArrayBuffer(ARRAY_BUFFER_INITIAL_SIZE);
    }
    this.bytes = new Uint8Array(this.buffer);
  }
  ensureSize(size) {
    let newLength = this.buffer.byteLength;
    while (newLength < size) newLength *= 2;
    if (newLength === this.buffer.byteLength) return;
    if (newLength > ARRAY_BUFFER_MAX_SIZE) {
      throw new Error(
        `ArrayBuffer exceeded maximum size of ${ARRAY_BUFFER_MAX_SIZE} bytes. Please consider using another target.`
      );
    }
    if (this.supportsResize) {
      this.buffer.resize(newLength);
    } else {
      const newBuffer = new ArrayBuffer(newLength);
      const newBytes = new Uint8Array(newBuffer);
      newBytes.set(this.bytes, 0);
      this.buffer = newBuffer;
      this.bytes = newBytes;
    }
  }
  write(data) {
    this.maybeTrackWrites(data);
    this.ensureSize(this.pos + data.byteLength);
    this.bytes.set(data, this.pos);
    this.target.onwrite?.(this.pos, this.pos + data.byteLength);
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
  async close() {
  }
  getSlice(start, end) {
    return this.bytes.slice(start, end);
  }
};
var DEFAULT_CHUNK_SIZE = 2 ** 24;
var MAX_CHUNKS_AT_ONCE = 2;
var StreamTargetWriter = class extends Writer {
  constructor(target) {
    super();
    this.pos = 0;
    this.sections = [];
    this.lastWriteEnd = 0;
    this.lastFlushEnd = 0;
    this.writer = null;
    /**
     * The data is divided up into fixed-size chunks, whose contents are first filled in RAM and then flushed out.
     * A chunk is flushed if all of its contents have been written.
     */
    this.chunks = [];
    this.target = target;
    this.chunked = target._options.chunked ?? false;
    this.chunkSize = target._options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  }
  start() {
    this.writer = this.target._writable.getWriter();
  }
  write(data) {
    if (this.pos > this.lastWriteEnd) {
      const paddingBytesNeeded = this.pos - this.lastWriteEnd;
      this.pos = this.lastWriteEnd;
      this.write(new Uint8Array(paddingBytesNeeded));
    }
    this.maybeTrackWrites(data);
    this.sections.push({
      data: data.slice(),
      start: this.pos
    });
    this.target.onwrite?.(this.pos, this.pos + data.byteLength);
    this.pos += data.byteLength;
    this.lastWriteEnd = Math.max(this.lastWriteEnd, this.pos);
  }
  seek(newPos) {
    this.pos = newPos;
  }
  getPos() {
    return this.pos;
  }
  async flush() {
    if (this.pos > this.lastWriteEnd) {
      const paddingBytesNeeded = this.pos - this.lastWriteEnd;
      this.pos = this.lastWriteEnd;
      this.write(new Uint8Array(paddingBytesNeeded));
    }
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
      if (this.writer.desiredSize !== null && this.writer.desiredSize <= 0) {
        await this.writer.ready;
      }
      if (this.chunked) {
        this.writeDataIntoChunks(chunk.data, chunk.start);
        this.tryToFlushChunks();
      } else {
        if (this.ensureMonotonicity && chunk.start !== this.lastFlushEnd) {
          throw new Error("Internal error: Monotonicity violation.");
        }
        void this.writer.write({
          type: "write",
          data: chunk.data,
          position: chunk.start
        });
        this.lastFlushEnd = chunk.start + chunk.data.byteLength;
      }
    }
    this.sections.length = 0;
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
      this.tryToFlushChunks();
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
  tryToFlushChunks(force = false) {
    assert(this.writer);
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      if (!chunk.shouldFlush && !force) continue;
      for (const section of chunk.written) {
        const position = chunk.start + section.start;
        if (this.ensureMonotonicity && position !== this.lastFlushEnd) {
          throw new Error("Internal error: Monotonicity violation.");
        }
        void this.writer.write({
          type: "write",
          data: chunk.data.subarray(section.start, section.end),
          position
        });
        this.lastFlushEnd = chunk.start + section.end;
      }
      this.chunks.splice(i--, 1);
    }
  }
  finalize() {
    if (this.chunked) {
      this.tryToFlushChunks(true);
    }
    assert(this.writer);
    return this.writer.close();
  }
  async close() {
    return this.writer?.close();
  }
};
var NullTargetWriter = class extends Writer {
  constructor(target) {
    super();
    this.target = target;
    this.pos = 0;
  }
  write(data) {
    this.maybeTrackWrites(data);
    this.target.onwrite?.(this.pos, this.pos + data.byteLength);
    this.pos += data.byteLength;
  }
  getPos() {
    return this.pos;
  }
  seek(newPos) {
    this.pos = newPos;
  }
  async flush() {
  }
  async finalize() {
  }
  async close() {
  }
};

// src/isobmff/isobmff-muxer.ts
init_subtitles();

// src/target.ts
var nodeAlias2 = __toESM(require_node(), 1);
var node2 = typeof nodeAlias2 !== "undefined" ? nodeAlias2 : void 0;
var Target = class {
  constructor() {
    /** @internal */
    this._output = null;
    /**
     * Called each time data is written to the target. Will be called with the byte range into which data was written.
     *
     * Use this callback to track the size of the output file as it grows. But be warned, this function is chatty and
     * gets called *extremely* often.
     */
    this.onwrite = null;
  }
};
var BufferTarget = class extends Target {
  constructor() {
    super(...arguments);
    /** Stores the final output buffer. Until the output is finalized, this will be `null`. */
    this.buffer = null;
  }
  /** @internal */
  _createWriter() {
    return new BufferTargetWriter(this);
  }
};
var StreamTarget = class extends Target {
  /** Creates a new {@link StreamTarget} which writes to the specified `writable`. */
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
    if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize < 1024)) {
      throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
    }
    this._writable = writable;
    this._options = options;
  }
  /** @internal */
  _createWriter() {
    return new StreamTargetWriter(this);
  }
};
var FilePathTarget = class extends Target {
  /** Creates a new {@link FilePathTarget} that writes to the file at the specified file path. */
  constructor(filePath, options = {}) {
    if (typeof filePath !== "string") {
      throw new TypeError("filePath must be a string.");
    }
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    super();
    /** @internal */
    this._fileHandle = null;
    const writable = new WritableStream({
      start: async () => {
        this._fileHandle = await node2.fs.open(filePath, "w");
      },
      write: async (chunk) => {
        assert(this._fileHandle);
        await this._fileHandle.write(chunk.data, 0, chunk.data.byteLength, chunk.position);
      },
      close: async () => {
        if (this._fileHandle) {
          await this._fileHandle.close();
          this._fileHandle = null;
        }
      }
    });
    this._streamTarget = new StreamTarget(writable, {
      chunked: true,
      ...options
    });
    this._streamTarget._output = this._output;
  }
  /** @internal */
  _createWriter() {
    return this._streamTarget._createWriter();
  }
};
var NullTarget = class extends Target {
  /** @internal */
  _createWriter() {
    return new NullTargetWriter(this);
  }
};

// src/isobmff/isobmff-muxer.ts
var GLOBAL_TIMESCALE = 1e3;
var TIMESTAMP_OFFSET = 2082844800;
var getTrackMetadata = (trackData) => {
  const metadata = {};
  const track = trackData.track;
  if (track.metadata.name !== void 0) {
    metadata.name = track.metadata.name;
  }
  return metadata;
};
var intoTimescale = (timeInSeconds, timescale, round = true) => {
  const value = timeInSeconds * timescale;
  return round ? Math.round(value) : value;
};
var IsobmffMuxer2 = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.auxTarget = new BufferTarget();
    this.auxWriter = this.auxTarget._createWriter();
    this.auxBoxWriter = new IsobmffBoxWriter(this.auxWriter);
    this.mdat = null;
    this.ftypSize = null;
    this.trackDatas = [];
    this.allTracksKnown = promiseWithResolvers();
    this.creationTime = Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET;
    this.finalizedChunks = [];
    this.nextFragmentNumber = 1;
    // Only relevant for fragmented files, to make sure new fragments start with the highest timestamp seen so far
    this.maxWrittenTimestamp = -Infinity;
    this.format = format;
    this.writer = output._writer;
    this.boxWriter = new IsobmffBoxWriter(this.writer);
    this.isQuickTime = format instanceof MovOutputFormat;
    const fastStartDefault = this.writer instanceof BufferTargetWriter ? "in-memory" : false;
    this.fastStart = format._options.fastStart ?? fastStartDefault;
    this.isFragmented = this.fastStart === "fragmented";
    if (this.fastStart === "in-memory" || this.isFragmented) {
      this.writer.ensureMonotonicity = true;
    }
    this.minimumFragmentDuration = format._options.minimumFragmentDuration ?? 1;
  }
  async start() {
    const release = await this.mutex.acquire();
    const holdsAvc = this.output._tracks.some((x) => x.type === "video" && x.source._codec === "avc");
    {
      if (this.format._options.onFtyp) {
        this.writer.startTrackingWrites();
      }
      this.boxWriter.writeBox(ftyp({
        isQuickTime: this.isQuickTime,
        holdsAvc,
        fragmented: this.isFragmented
      }));
      if (this.format._options.onFtyp) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onFtyp(data, start);
      }
    }
    this.ftypSize = this.writer.getPos();
    if (this.fastStart === "in-memory") {
    } else if (this.fastStart === "reserve") {
      for (const track of this.output._tracks) {
        if (track.metadata.maximumPacketCount === void 0) {
          throw new Error(
            "All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'."
          );
        }
      }
    } else if (this.isFragmented) {
    } else {
      if (this.format._options.onMdat) {
        this.writer.startTrackingWrites();
      }
      this.mdat = mdat(true);
      this.boxWriter.writeBox(this.mdat);
    }
    await this.writer.flush();
    release();
  }
  allTracksAreKnown() {
    for (const track of this.output._tracks) {
      if (!track.source._closed && !this.trackDatas.some((x) => x.track === track)) {
        return false;
      }
    }
    return true;
  }
  async getMimeType() {
    await this.allTracksKnown.promise;
    const codecStrings = this.trackDatas.map((trackData) => {
      if (trackData.type === "video") {
        return trackData.info.decoderConfig.codec;
      } else if (trackData.type === "audio") {
        return trackData.info.decoderConfig.codec;
      } else {
        const map = {
          webvtt: "wvtt",
          tx3g: "tx3g",
          ttml: "stpp",
          srt: "wvtt",
          // MP4 stores SRT as WebVTT
          ass: "wvtt",
          // MP4 stores ASS as WebVTT
          ssa: "wvtt"
          // MP4 stores SSA as WebVTT
        };
        return map[trackData.track.source._codec];
      }
    });
    return buildIsobmffMimeType({
      isQuickTime: this.isQuickTime,
      hasVideo: this.trackDatas.some((x) => x.type === "video"),
      hasAudio: this.trackDatas.some((x) => x.type === "audio"),
      codecStrings
    });
  }
  getVideoTrackData(track, packet, meta) {
    const existingTrackData = this.trackDatas.find((x) => x.track === track);
    if (existingTrackData) {
      return existingTrackData;
    }
    validateVideoChunkMetadata(meta);
    assert(meta);
    assert(meta.decoderConfig);
    const decoderConfig = { ...meta.decoderConfig };
    assert(decoderConfig.codedWidth !== void 0);
    assert(decoderConfig.codedHeight !== void 0);
    let requiresAnnexBTransformation = false;
    if (track.source._codec === "avc" && !decoderConfig.description) {
      const decoderConfigurationRecord = extractAvcDecoderConfigurationRecord(packet.data);
      if (!decoderConfigurationRecord) {
        throw new Error(
          "Couldn't extract an AVCDecoderConfigurationRecord from the AVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.264) when not providing a description, or provide a description (must be an AVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in AVCC format."
        );
      }
      decoderConfig.description = serializeAvcDecoderConfigurationRecord(decoderConfigurationRecord);
      requiresAnnexBTransformation = true;
    } else if (track.source._codec === "hevc" && !decoderConfig.description) {
      const decoderConfigurationRecord = extractHevcDecoderConfigurationRecord(packet.data);
      if (!decoderConfigurationRecord) {
        throw new Error(
          "Couldn't extract an HEVCDecoderConfigurationRecord from the HEVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.265) when not providing a description, or provide a description (must be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in HEVC format."
        );
      }
      decoderConfig.description = serializeHevcDecoderConfigurationRecord(decoderConfigurationRecord);
      requiresAnnexBTransformation = true;
    }
    const timescale = computeRationalApproximation(1 / (track.metadata.frameRate ?? 57600), 1e6).denominator;
    const newTrackData = {
      muxer: this,
      track,
      type: "video",
      info: {
        width: decoderConfig.codedWidth,
        height: decoderConfig.codedHeight,
        decoderConfig,
        requiresAnnexBTransformation
      },
      timescale,
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
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
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
      muxer: this,
      track,
      type: "audio",
      info: {
        numberOfChannels: meta.decoderConfig.numberOfChannels,
        sampleRate: meta.decoderConfig.sampleRate,
        decoderConfig: meta.decoderConfig,
        requiresPcmTransformation: !this.isFragmented && PCM_AUDIO_CODECS.includes(track.source._codec)
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
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
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
      muxer: this,
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
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    return newTrackData;
  }
  async addEncodedVideoPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getVideoTrackData(track, packet, meta);
      let packetData = packet.data;
      if (trackData.info.requiresAnnexBTransformation) {
        const transformedData = transformAnnexBToLengthPrefixed(packetData);
        if (!transformedData) {
          throw new Error(
            "Failed to transform packet data. Make sure all packets are provided in Annex B format, as specified in ITU-T-REC-H.264 and ITU-T-REC-H.265."
          );
        }
        packetData = transformedData;
      }
      const timestamp = this.validateAndNormalizeTimestamp(
        trackData.track,
        packet.timestamp,
        packet.type === "key"
      );
      const internalSample = this.createSampleForTrack(
        trackData,
        packetData,
        timestamp,
        packet.duration,
        packet.type
      );
      await this.registerSample(trackData, internalSample);
    } finally {
      release();
    }
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getAudioTrackData(track, meta);
      const timestamp = this.validateAndNormalizeTimestamp(
        trackData.track,
        packet.timestamp,
        packet.type === "key"
      );
      const internalSample = this.createSampleForTrack(
        trackData,
        packet.data,
        timestamp,
        packet.duration,
        packet.type
      );
      if (trackData.info.requiresPcmTransformation) {
        await this.maybePadWithSilence(trackData, timestamp);
      }
      await this.registerSample(trackData, internalSample);
    } finally {
      release();
    }
  }
  async maybePadWithSilence(trackData, untilTimestamp) {
    const lastSample = last(trackData.samples);
    const lastEndTimestamp = lastSample ? lastSample.timestamp + lastSample.duration : 0;
    const delta = untilTimestamp - lastEndTimestamp;
    const deltaInTimescale = intoTimescale(delta, trackData.timescale);
    if (deltaInTimescale > 0) {
      const { sampleSize, silentValue } = parsePcmCodec(
        trackData.info.decoderConfig.codec
      );
      const samplesNeeded = deltaInTimescale * trackData.info.numberOfChannels;
      const data = new Uint8Array(sampleSize * samplesNeeded).fill(silentValue);
      const paddingSample = this.createSampleForTrack(
        trackData,
        new Uint8Array(data.buffer),
        lastEndTimestamp,
        delta,
        "key"
      );
      await this.registerSample(trackData, paddingSample);
    }
  }
  async addSubtitleCue(track, cue, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getSubtitleTrackData(track, meta);
      this.validateAndNormalizeTimestamp(trackData.track, cue.timestamp, true);
      if (track.source._codec === "webvtt") {
        trackData.cueQueue.push(cue);
        await this.processWebVTTCues(trackData, cue.timestamp);
      } else {
        throw new Error(
          `${track.source._codec} subtitles are not supported in ${this.format._name}. Only WebVTT is supported.`
        );
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
      timescaleUnitsToNextSample: intoTimescale(duration, trackData.timescale)
      // Will be refined
    };
    return sample;
  }
  processTimestamps(trackData, nextSample) {
    if (trackData.timestampProcessingQueue.length === 0) {
      return;
    }
    if (trackData.type === "audio" && trackData.info.requiresPcmTransformation) {
      let totalDuration = 0;
      for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
        const sample = trackData.timestampProcessingQueue[i];
        const duration = intoTimescale(sample.duration, trackData.timescale);
        totalDuration += duration;
      }
      if (trackData.timeToSampleTable.length === 0) {
        trackData.timeToSampleTable.push({
          sampleCount: totalDuration,
          sampleDelta: 1
        });
      } else {
        const lastEntry = last(trackData.timeToSampleTable);
        lastEntry.sampleCount += totalDuration;
      }
      trackData.timestampProcessingQueue.length = 0;
      return;
    }
    const sortedTimestamps = trackData.timestampProcessingQueue.map((x) => x.timestamp).sort((a, b) => a - b);
    for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
      const sample = trackData.timestampProcessingQueue[i];
      sample.decodeTimestamp = sortedTimestamps[i];
      if (!this.isFragmented && trackData.lastTimescaleUnits === null) {
        sample.decodeTimestamp = 0;
      }
      const sampleCompositionTimeOffset = intoTimescale(sample.timestamp - sample.decodeTimestamp, trackData.timescale);
      const durationInTimescale = intoTimescale(sample.duration, trackData.timescale);
      if (trackData.lastTimescaleUnits !== null) {
        assert(trackData.lastSample);
        const timescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
        const delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
        assert(delta >= 0);
        trackData.lastTimescaleUnits += delta;
        trackData.lastSample.timescaleUnitsToNextSample = delta;
        if (!this.isFragmented) {
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
        trackData.lastTimescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
        if (!this.isFragmented) {
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
    assert(trackData.lastSample);
    assert(trackData.lastTimescaleUnits !== null);
    if (nextSample !== void 0 && trackData.lastSample.timescaleUnitsToNextSample === 0) {
      assert(nextSample.type === "key");
      const timescaleUnits = intoTimescale(nextSample.timestamp, trackData.timescale, false);
      const delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
      trackData.lastSample.timescaleUnitsToNextSample = delta;
    }
  }
  async registerSample(trackData, sample) {
    if (sample.type === "key") {
      this.processTimestamps(trackData, sample);
    }
    trackData.timestampProcessingQueue.push(sample);
    if (this.isFragmented) {
      trackData.sampleQueue.push(sample);
      await this.interleaveSamples();
    } else if (this.fastStart === "reserve") {
      await this.registerSampleFastStartReserve(trackData, sample);
    } else {
      await this.addSampleToTrack(trackData, sample);
    }
  }
  async addSampleToTrack(trackData, sample) {
    if (!this.isFragmented) {
      trackData.samples.push(sample);
      if (this.fastStart === "reserve") {
        const maximumPacketCount = trackData.track.metadata.maximumPacketCount;
        assert(maximumPacketCount !== void 0);
        if (trackData.samples.length > maximumPacketCount) {
          throw new Error(
            `Track #${trackData.track.id} has already reached the maximum packet count (${maximumPacketCount}). Either add less packets or increase the maximum packet count.`
          );
        }
      }
    }
    let beginNewChunk = false;
    if (!trackData.currentChunk) {
      beginNewChunk = true;
    } else {
      trackData.currentChunk.startTimestamp = Math.min(
        trackData.currentChunk.startTimestamp,
        sample.timestamp
      );
      const currentChunkDuration = sample.timestamp - trackData.currentChunk.startTimestamp;
      if (this.isFragmented) {
        const keyFrameQueuedEverywhere = this.trackDatas.every((otherTrackData) => {
          if (trackData === otherTrackData) {
            return sample.type === "key";
          }
          const firstQueuedSample = otherTrackData.sampleQueue[0];
          if (firstQueuedSample) {
            return firstQueuedSample.type === "key";
          }
          return otherTrackData.track.source._closed;
        });
        if (currentChunkDuration >= this.minimumFragmentDuration && keyFrameQueuedEverywhere && sample.timestamp > this.maxWrittenTimestamp) {
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
    if (this.isFragmented) {
      this.maxWrittenTimestamp = Math.max(this.maxWrittenTimestamp, sample.timestamp);
    }
  }
  async finalizeCurrentChunk(trackData) {
    assert(!this.isFragmented);
    if (!trackData.currentChunk) return;
    trackData.finalizedChunks.push(trackData.currentChunk);
    this.finalizedChunks.push(trackData.currentChunk);
    let sampleCount = trackData.currentChunk.samples.length;
    if (trackData.type === "audio" && trackData.info.requiresPcmTransformation) {
      sampleCount = trackData.currentChunk.samples.reduce((acc, sample) => acc + intoTimescale(sample.duration, trackData.timescale), 0);
    }
    if (trackData.compactlyCodedChunkTable.length === 0 || last(trackData.compactlyCodedChunkTable).samplesPerChunk !== sampleCount) {
      trackData.compactlyCodedChunkTable.push({
        firstChunk: trackData.finalizedChunks.length,
        // 1-indexed
        samplesPerChunk: sampleCount
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
  async interleaveSamples(isFinalCall = false) {
    assert(this.isFragmented);
    if (!isFinalCall && !this.allTracksAreKnown()) {
      return;
    }
    outer:
      while (true) {
        let trackWithMinTimestamp = null;
        let minTimestamp = Infinity;
        for (const trackData of this.trackDatas) {
          if (!isFinalCall && trackData.sampleQueue.length === 0 && !trackData.track.source._closed) {
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
    assert(this.isFragmented);
    const fragmentNumber = this.nextFragmentNumber++;
    if (fragmentNumber === 1) {
      if (this.format._options.onMoov) {
        this.writer.startTrackingWrites();
      }
      const movieBox = moov(this);
      this.boxWriter.writeBox(movieBox);
      if (this.format._options.onMoov) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMoov(data, start);
      }
    }
    const tracksInFragment = this.trackDatas.filter((x) => x.currentChunk);
    const moofBox = moof(fragmentNumber, tracksInFragment);
    const moofOffset = this.writer.getPos();
    const mdatStartPos = moofOffset + this.boxWriter.measureBox(moofBox);
    let currentPos = mdatStartPos + MIN_BOX_HEADER_SIZE;
    let fragmentStartTimestamp = Infinity;
    for (const trackData of tracksInFragment) {
      trackData.currentChunk.offset = currentPos;
      trackData.currentChunk.moofOffset = moofOffset;
      for (const sample of trackData.currentChunk.samples) {
        currentPos += sample.size;
      }
      fragmentStartTimestamp = Math.min(fragmentStartTimestamp, trackData.currentChunk.startTimestamp);
    }
    const mdatSize = currentPos - mdatStartPos;
    const needsLargeMdatSize = mdatSize >= 2 ** 32;
    if (needsLargeMdatSize) {
      for (const trackData of tracksInFragment) {
        trackData.currentChunk.offset += MAX_BOX_HEADER_SIZE - MIN_BOX_HEADER_SIZE;
      }
    }
    if (this.format._options.onMoof) {
      this.writer.startTrackingWrites();
    }
    const newMoofBox = moof(fragmentNumber, tracksInFragment);
    this.boxWriter.writeBox(newMoofBox);
    if (this.format._options.onMoof) {
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onMoof(data, start, fragmentStartTimestamp);
    }
    assert(this.writer.getPos() === mdatStartPos);
    if (this.format._options.onMdat) {
      this.writer.startTrackingWrites();
    }
    const mdatBox = mdat(needsLargeMdatSize);
    mdatBox.size = mdatSize;
    this.boxWriter.writeBox(mdatBox);
    this.writer.seek(mdatStartPos + (needsLargeMdatSize ? MAX_BOX_HEADER_SIZE : MIN_BOX_HEADER_SIZE));
    for (const trackData of tracksInFragment) {
      for (const sample of trackData.currentChunk.samples) {
        this.writer.write(sample.data);
        sample.data = null;
      }
    }
    if (this.format._options.onMdat) {
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onMdat(data, start);
    }
    for (const trackData of tracksInFragment) {
      trackData.finalizedChunks.push(trackData.currentChunk);
      this.finalizedChunks.push(trackData.currentChunk);
      trackData.currentChunk = null;
    }
    if (flushWriter) {
      await this.writer.flush();
    }
  }
  async registerSampleFastStartReserve(trackData, sample) {
    if (this.allTracksAreKnown()) {
      if (!this.mdat) {
        const moovBox = moov(this);
        const moovSize = this.boxWriter.measureBox(moovBox);
        const reservedSize = moovSize + this.computeSampleTableSizeUpperBound() + 4096;
        assert(this.ftypSize !== null);
        this.writer.seek(this.ftypSize + reservedSize);
        if (this.format._options.onMdat) {
          this.writer.startTrackingWrites();
        }
        this.mdat = mdat(true);
        this.boxWriter.writeBox(this.mdat);
        for (const trackData2 of this.trackDatas) {
          for (const sample2 of trackData2.sampleQueue) {
            await this.addSampleToTrack(trackData2, sample2);
          }
          trackData2.sampleQueue.length = 0;
        }
      }
      await this.addSampleToTrack(trackData, sample);
    } else {
      trackData.sampleQueue.push(sample);
    }
  }
  computeSampleTableSizeUpperBound() {
    assert(this.fastStart === "reserve");
    let upperBound = 0;
    for (const trackData of this.trackDatas) {
      const n = trackData.track.metadata.maximumPacketCount;
      assert(n !== void 0);
      upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += (4 + 4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += 8 * n;
    }
    return upperBound;
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
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    if (this.isFragmented) {
      await this.interleaveSamples();
    }
    release();
  }
  /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
  async finalize() {
    const release = await this.mutex.acquire();
    this.allTracksKnown.resolve();
    for (const trackData of this.trackDatas) {
      if (trackData.type === "subtitle" && trackData.track.source._codec === "webvtt") {
        await this.processWebVTTCues(trackData, Infinity);
      }
    }
    if (this.isFragmented) {
      await this.interleaveSamples(true);
      for (const trackData of this.trackDatas) {
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
      this.mdat = mdat(false);
      let mdatSize;
      for (let i = 0; i < 2; i++) {
        const movieBox2 = moov(this);
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
      if (this.format._options.onMoov) {
        this.writer.startTrackingWrites();
      }
      const movieBox = moov(this);
      this.boxWriter.writeBox(movieBox);
      if (this.format._options.onMoov) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMoov(data, start);
      }
      if (this.format._options.onMdat) {
        this.writer.startTrackingWrites();
      }
      this.mdat.size = mdatSize;
      this.boxWriter.writeBox(this.mdat);
      for (const chunk of this.finalizedChunks) {
        for (const sample of chunk.samples) {
          assert(sample.data);
          this.writer.write(sample.data);
          sample.data = null;
        }
      }
      if (this.format._options.onMdat) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMdat(data, start);
      }
    } else if (this.isFragmented) {
      const startPos = this.writer.getPos();
      const mfraBox = mfra(this.trackDatas);
      this.boxWriter.writeBox(mfraBox);
      const mfraBoxSize = this.writer.getPos() - startPos;
      this.writer.seek(this.writer.getPos() - 4);
      this.boxWriter.writeU32(mfraBoxSize);
    } else {
      assert(this.mdat);
      const mdatPos = this.boxWriter.offsets.get(this.mdat);
      assert(mdatPos !== void 0);
      const mdatSize = this.writer.getPos() - mdatPos;
      this.mdat.size = mdatSize;
      this.mdat.largeSize = mdatSize >= 2 ** 32;
      this.boxWriter.patchBox(this.mdat);
      if (this.format._options.onMdat) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMdat(data, start);
      }
      const movieBox = moov(this);
      if (this.fastStart === "reserve") {
        assert(this.ftypSize !== null);
        this.writer.seek(this.ftypSize);
        if (this.format._options.onMoov) {
          this.writer.startTrackingWrites();
        }
        this.boxWriter.writeBox(movieBox);
        const remainingSpace = this.boxWriter.offsets.get(this.mdat) - this.writer.getPos();
        this.boxWriter.writeBox(free(remainingSpace));
      } else {
        if (this.format._options.onMoov) {
          this.writer.startTrackingWrites();
        }
        this.boxWriter.writeBox(movieBox);
      }
      if (this.format._options.onMoov) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMoov(data, start);
      }
    }
    release();
  }
};

// src/matroska/matroska-muxer.ts
init_subtitles();
var MIN_CLUSTER_TIMESTAMP_MS = -(2 ** 15);
var MAX_CLUSTER_TIMESTAMP_MS = 2 ** 15 - 1;
var APP_NAME = "Mediabunny";
var SEGMENT_SIZE_BYTES = 6;
var CLUSTER_SIZE_BYTES = 5;
var TRACK_TYPE_MAP = {
  video: 1,
  audio: 2,
  subtitle: 17
};
var MatroskaMuxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.trackDatas = [];
    this.allTracksKnown = promiseWithResolvers();
    this.segment = null;
    this.segmentInfo = null;
    this.seekHead = null;
    this.tracksElement = null;
    this.tagsElement = null;
    this.attachmentsElement = null;
    this.segmentDuration = null;
    this.cues = null;
    this.currentCluster = null;
    this.currentClusterStartMsTimestamp = null;
    this.currentClusterMaxMsTimestamp = null;
    this.trackDatasInCurrentCluster = /* @__PURE__ */ new Map();
    this.duration = 0;
    this.writer = output._writer;
    this.format = format;
    this.ebmlWriter = new EBMLWriter(this.writer);
    if (this.format._options.appendOnly) {
      this.writer.ensureMonotonicity = true;
    }
  }
  async start() {
    const release = await this.mutex.acquire();
    this.writeEBMLHeader();
    this.createSegmentInfo();
    this.createCues();
    await this.writer.flush();
    release();
  }
  writeEBMLHeader() {
    if (this.format._options.onEbmlHeader) {
      this.writer.startTrackingWrites();
    }
    const ebmlHeader = { id: 440786851 /* EBML */, data: [
      { id: 17030 /* EBMLVersion */, data: 1 },
      { id: 17143 /* EBMLReadVersion */, data: 1 },
      { id: 17138 /* EBMLMaxIDLength */, data: 4 },
      { id: 17139 /* EBMLMaxSizeLength */, data: 8 },
      { id: 17026 /* DocType */, data: this.format instanceof WebMOutputFormat ? "webm" : "matroska" },
      { id: 17031 /* DocTypeVersion */, data: 2 },
      { id: 17029 /* DocTypeReadVersion */, data: 2 }
    ] };
    this.ebmlWriter.writeEBML(ebmlHeader);
    if (this.format._options.onEbmlHeader) {
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onEbmlHeader(data, start);
    }
  }
  /**
   * Creates a SeekHead element which is positioned near the start of the file and allows the media player to seek to
   * relevant sections more easily. Since we don't know the positions of those sections yet, we'll set them later.
   */
  maybeCreateSeekHead(writeOffsets) {
    if (this.format._options.appendOnly) {
      return;
    }
    const kaxCues = new Uint8Array([28, 83, 187, 107]);
    const kaxInfo = new Uint8Array([21, 73, 169, 102]);
    const kaxTracks = new Uint8Array([22, 84, 174, 107]);
    const kaxAttachments = new Uint8Array([25, 65, 164, 105]);
    const kaxTags = new Uint8Array([18, 84, 195, 103]);
    const seekHead = { id: 290298740 /* SeekHead */, data: [
      { id: 19899 /* Seek */, data: [
        { id: 21419 /* SeekID */, data: kaxCues },
        {
          id: 21420 /* SeekPosition */,
          size: 5,
          data: writeOffsets ? this.ebmlWriter.offsets.get(this.cues) - this.segmentDataOffset : 0
        }
      ] },
      { id: 19899 /* Seek */, data: [
        { id: 21419 /* SeekID */, data: kaxInfo },
        {
          id: 21420 /* SeekPosition */,
          size: 5,
          data: writeOffsets ? this.ebmlWriter.offsets.get(this.segmentInfo) - this.segmentDataOffset : 0
        }
      ] },
      { id: 19899 /* Seek */, data: [
        { id: 21419 /* SeekID */, data: kaxTracks },
        {
          id: 21420 /* SeekPosition */,
          size: 5,
          data: writeOffsets ? this.ebmlWriter.offsets.get(this.tracksElement) - this.segmentDataOffset : 0
        }
      ] },
      this.attachmentsElement ? { id: 19899 /* Seek */, data: [
        { id: 21419 /* SeekID */, data: kaxAttachments },
        {
          id: 21420 /* SeekPosition */,
          size: 5,
          data: writeOffsets ? this.ebmlWriter.offsets.get(this.attachmentsElement) - this.segmentDataOffset : 0
        }
      ] } : null,
      this.tagsElement ? { id: 19899 /* Seek */, data: [
        { id: 21419 /* SeekID */, data: kaxTags },
        {
          id: 21420 /* SeekPosition */,
          size: 5,
          data: writeOffsets ? this.ebmlWriter.offsets.get(this.tagsElement) - this.segmentDataOffset : 0
        }
      ] } : null
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
      !this.format._options.appendOnly ? segmentDuration : null
    ] };
    this.segmentInfo = segmentInfo;
  }
  createTracks() {
    const tracksElement = { id: 374648427 /* Tracks */, data: [] };
    this.tracksElement = tracksElement;
    for (const trackData of this.trackDatas) {
      const codecId = CODEC_STRING_MAP[trackData.track.source._codec];
      assert(codecId);
      let seekPreRollNs = 0;
      if (trackData.type === "audio" && trackData.track.source._codec === "opus") {
        seekPreRollNs = 1e6 * 80;
        const description = trackData.info.decoderConfig.description;
        if (description) {
          const bytes2 = toUint8Array(description);
          const header = parseOpusIdentificationHeader(bytes2);
          seekPreRollNs = Math.round(1e9 * (header.preSkip / OPUS_SAMPLE_RATE));
        }
      }
      tracksElement.data.push({ id: 174 /* TrackEntry */, data: [
        { id: 215 /* TrackNumber */, data: trackData.track.id },
        { id: 29637 /* TrackUID */, data: trackData.track.id },
        { id: 131 /* TrackType */, data: TRACK_TYPE_MAP[trackData.type] },
        { id: 156 /* FlagLacing */, data: 0 },
        { id: 2274716 /* Language */, data: trackData.track.metadata.languageCode ?? UNDETERMINED_LANGUAGE },
        { id: 134 /* CodecID */, data: codecId },
        { id: 22186 /* CodecDelay */, data: 0 },
        { id: 22203 /* SeekPreRoll */, data: seekPreRollNs },
        trackData.track.metadata.name !== void 0 ? { id: 21358 /* Name */, data: new EBMLUnicodeString(trackData.track.metadata.name) } : null,
        trackData.type === "video" ? this.videoSpecificTrackInfo(trackData) : null,
        trackData.type === "audio" ? this.audioSpecificTrackInfo(trackData) : null,
        trackData.type === "subtitle" ? this.subtitleSpecificTrackInfo(trackData) : null
      ] });
    }
  }
  videoSpecificTrackInfo(trackData) {
    const { frameRate, rotation } = trackData.track.metadata;
    const elements = [
      trackData.info.decoderConfig.description ? {
        id: 25506 /* CodecPrivate */,
        data: toUint8Array(trackData.info.decoderConfig.description)
      } : null,
      frameRate ? {
        id: 2352003 /* DefaultDuration */,
        data: 1e9 / frameRate
      } : null
    ];
    const flippedRotation = rotation ? normalizeRotation(-rotation) : 0;
    const colorSpace = trackData.info.decoderConfig.colorSpace;
    const videoElement = { id: 224 /* Video */, data: [
      { id: 176 /* PixelWidth */, data: trackData.info.width },
      { id: 186 /* PixelHeight */, data: trackData.info.height },
      trackData.info.alphaMode ? { id: 21440 /* AlphaMode */, data: 1 } : null,
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
      } : null,
      flippedRotation ? {
        id: 30320 /* Projection */,
        data: [
          {
            id: 30321 /* ProjectionType */,
            data: 0
            // rectangular
          },
          {
            id: 30325 /* ProjectionPoseRoll */,
            data: new EBMLFloat32((flippedRotation + 180) % 360 - 180)
            // [0, 270] -> [-180, 90]
          }
        ]
      } : null
    ] };
    elements.push(videoElement);
    return elements;
  }
  audioSpecificTrackInfo(trackData) {
    const pcmInfo = PCM_AUDIO_CODECS.includes(trackData.track.source._codec) ? parsePcmCodec(trackData.track.source._codec) : null;
    return [
      trackData.info.decoderConfig.description ? {
        id: 25506 /* CodecPrivate */,
        data: toUint8Array(trackData.info.decoderConfig.description)
      } : null,
      { id: 225 /* Audio */, data: [
        { id: 181 /* SamplingFrequency */, data: new EBMLFloat32(trackData.info.sampleRate) },
        { id: 159 /* Channels */, data: trackData.info.numberOfChannels },
        pcmInfo ? { id: 25188 /* BitDepth */, data: 8 * pcmInfo.sampleSize } : null
      ] }
    ];
  }
  subtitleSpecificTrackInfo(trackData) {
    return [
      { id: 25506 /* CodecPrivate */, data: textEncoder.encode(trackData.info.config.description) }
    ];
  }
  maybeCreateTags() {
    const simpleTags = [];
    const addSimpleTag = (key, value) => {
      simpleTags.push({ id: 26568 /* SimpleTag */, data: [
        { id: 17827 /* TagName */, data: new EBMLUnicodeString(key) },
        typeof value === "string" ? { id: 17543 /* TagString */, data: new EBMLUnicodeString(value) } : { id: 17541 /* TagBinary */, data: value }
      ] });
    };
    const metadataTags = this.output._metadataTags;
    const writtenTags = /* @__PURE__ */ new Set();
    for (const { key, value } of keyValueIterator(metadataTags)) {
      switch (key) {
        case "title":
          {
            addSimpleTag("TITLE", value);
            writtenTags.add("TITLE");
          }
          ;
          break;
        case "description":
          {
            addSimpleTag("DESCRIPTION", value);
            writtenTags.add("DESCRIPTION");
          }
          ;
          break;
        case "artist":
          {
            addSimpleTag("ARTIST", value);
            writtenTags.add("ARTIST");
          }
          ;
          break;
        case "album":
          {
            addSimpleTag("ALBUM", value);
            writtenTags.add("ALBUM");
          }
          ;
          break;
        case "albumArtist":
          {
            addSimpleTag("ALBUM_ARTIST", value);
            writtenTags.add("ALBUM_ARTIST");
          }
          ;
          break;
        case "genre":
          {
            addSimpleTag("GENRE", value);
            writtenTags.add("GENRE");
          }
          ;
          break;
        case "comment":
          {
            addSimpleTag("COMMENT", value);
            writtenTags.add("COMMENT");
          }
          ;
          break;
        case "lyrics":
          {
            addSimpleTag("LYRICS", value);
            writtenTags.add("LYRICS");
          }
          ;
          break;
        case "date":
          {
            addSimpleTag("DATE", value.toISOString().slice(0, 10));
            writtenTags.add("DATE");
          }
          ;
          break;
        case "trackNumber":
          {
            const string = metadataTags.tracksTotal !== void 0 ? `${value}/${metadataTags.tracksTotal}` : value.toString();
            addSimpleTag("PART_NUMBER", string);
            writtenTags.add("PART_NUMBER");
          }
          ;
          break;
        case "discNumber":
          {
            const string = metadataTags.discsTotal !== void 0 ? `${value}/${metadataTags.discsTotal}` : value.toString();
            addSimpleTag("DISC", string);
            writtenTags.add("DISC");
          }
          ;
          break;
        case "tracksTotal":
        case "discsTotal":
          {
          }
          ;
          break;
        case "images":
        case "raw":
          {
          }
          ;
          break;
        default:
          assertNever(key);
      }
    }
    if (metadataTags.raw) {
      for (const key in metadataTags.raw) {
        const value = metadataTags.raw[key];
        if (value == null || writtenTags.has(key)) {
          continue;
        }
        if (typeof value === "string" || value instanceof Uint8Array) {
          addSimpleTag(key, value);
        }
      }
    }
    if (simpleTags.length === 0) {
      return;
    }
    this.tagsElement = {
      id: 307544935 /* Tags */,
      data: [{ id: 29555 /* Tag */, data: [
        { id: 25536 /* Targets */, data: [
          { id: 26826 /* TargetTypeValue */, data: 50 },
          { id: 25546 /* TargetType */, data: "MOVIE" }
        ] },
        ...simpleTags
      ] }]
    };
  }
  maybeCreateAttachments() {
    const metadataTags = this.output._metadataTags;
    const elements = [];
    const existingFileUids = /* @__PURE__ */ new Set();
    const images = metadataTags.images ?? [];
    for (const image of images) {
      let imageName = image.name;
      if (imageName === void 0) {
        const baseName = image.kind === "coverFront" ? "cover" : image.kind === "coverBack" ? "back" : "image";
        imageName = baseName + (imageMimeTypeToExtension(image.mimeType) ?? "");
      }
      let fileUid;
      while (true) {
        fileUid = 0n;
        for (let i = 0; i < 8; i++) {
          fileUid <<= 8n;
          fileUid |= BigInt(Math.floor(Math.random() * 256));
        }
        if (fileUid !== 0n && !existingFileUids.has(fileUid)) {
          break;
        }
      }
      existingFileUids.add(fileUid);
      elements.push({
        id: 24999 /* AttachedFile */,
        data: [
          image.description !== void 0 ? { id: 18046 /* FileDescription */, data: new EBMLUnicodeString(image.description) } : null,
          { id: 18030 /* FileName */, data: new EBMLUnicodeString(imageName) },
          { id: 18016 /* FileMediaType */, data: image.mimeType },
          { id: 18012 /* FileData */, data: image.data },
          { id: 18094 /* FileUID */, data: fileUid }
        ]
      });
    }
    for (const [key, value] of Object.entries(metadataTags.raw ?? {})) {
      if (!(value instanceof AttachedFile)) {
        continue;
      }
      const keyIsNumeric = /^\d+$/.test(key);
      if (!keyIsNumeric) {
        continue;
      }
      if (images.find((x) => x.mimeType === value.mimeType && uint8ArraysAreEqual(x.data, value.data))) {
        continue;
      }
      elements.push({
        id: 24999 /* AttachedFile */,
        data: [
          value.description !== void 0 ? { id: 18046 /* FileDescription */, data: new EBMLUnicodeString(value.description) } : null,
          { id: 18030 /* FileName */, data: new EBMLUnicodeString(value.name ?? "") },
          { id: 18016 /* FileMediaType */, data: value.mimeType ?? "" },
          { id: 18012 /* FileData */, data: value.data },
          { id: 18094 /* FileUID */, data: BigInt(key) }
        ]
      });
    }
    if (elements.length === 0) {
      return;
    }
    this.attachmentsElement = { id: 423732329 /* Attachments */, data: elements };
  }
  createSegment() {
    this.createTracks();
    this.maybeCreateTags();
    this.maybeCreateAttachments();
    this.maybeCreateSeekHead(false);
    const segment = {
      id: 408125543 /* Segment */,
      size: this.format._options.appendOnly ? -1 : SEGMENT_SIZE_BYTES,
      data: [
        this.seekHead,
        // null if append-only
        this.segmentInfo,
        this.tracksElement,
        // Matroska spec says put this at the end of the file, but I think placing it before the first cluster
        // makes more sense, and FFmpeg agrees (argumentum ad ffmpegum fallacy)
        this.attachmentsElement,
        this.tagsElement
      ]
    };
    this.segment = segment;
    if (this.format._options.onSegmentHeader) {
      this.writer.startTrackingWrites();
    }
    this.ebmlWriter.writeEBML(segment);
    if (this.format._options.onSegmentHeader) {
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onSegmentHeader(data, start);
    }
  }
  createCues() {
    this.cues = { id: 475249515 /* Cues */, data: [] };
  }
  get segmentDataOffset() {
    assert(this.segment);
    return this.ebmlWriter.dataOffsets.get(this.segment);
  }
  allTracksAreKnown() {
    for (const track of this.output._tracks) {
      if (!track.source._closed && !this.trackDatas.some((x) => x.track === track)) {
        return false;
      }
    }
    return true;
  }
  async getMimeType() {
    await this.allTracksKnown.promise;
    const codecStrings = this.trackDatas.map((trackData) => {
      if (trackData.type === "video") {
        return trackData.info.decoderConfig.codec;
      } else if (trackData.type === "audio") {
        return trackData.info.decoderConfig.codec;
      } else {
        const map = {
          webvtt: "S_TEXT/WEBVTT",
          tx3g: "S_TEXT/UTF8",
          // Matroska doesn't have tx3g, convert to SRT
          ttml: "S_TEXT/WEBVTT",
          // Matroska doesn't have TTML, convert to WebVTT
          srt: "S_TEXT/UTF8",
          ass: "S_TEXT/ASS",
          ssa: "S_TEXT/SSA"
        };
        return map[trackData.track.source._codec];
      }
    });
    return buildMatroskaMimeType({
      isWebM: this.format instanceof WebMOutputFormat,
      hasVideo: this.trackDatas.some((x) => x.type === "video"),
      hasAudio: this.trackDatas.some((x) => x.type === "audio"),
      codecStrings
    });
  }
  getVideoTrackData(track, packet, meta) {
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
        decoderConfig: meta.decoderConfig,
        alphaMode: !!packet.sideData.alpha
        // The first packet determines if this track has alpha or not
      },
      chunkQueue: [],
      lastWrittenMsTimestamp: null
    };
    if (track.source._codec === "vp9") {
      newTrackData.info.decoderConfig = {
        ...newTrackData.info.decoderConfig,
        description: new Uint8Array(
          generateVp9CodecConfigurationFromCodecString(newTrackData.info.decoderConfig.codec)
        )
      };
    } else if (track.source._codec === "av1") {
      newTrackData.info.decoderConfig = {
        ...newTrackData.info.decoderConfig,
        description: new Uint8Array(
          generateAv1CodecConfigurationFromCodecString(newTrackData.info.decoderConfig.codec)
        )
      };
    }
    this.trackDatas.push(newTrackData);
    this.trackDatas.sort((a, b) => a.track.id - b.track.id);
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
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
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
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
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    return newTrackData;
  }
  async addEncodedVideoPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getVideoTrackData(track, packet, meta);
      const isKeyFrame = packet.type === "key";
      let timestamp = this.validateAndNormalizeTimestamp(trackData.track, packet.timestamp, isKeyFrame);
      let duration = packet.duration;
      if (track.metadata.frameRate !== void 0) {
        timestamp = roundToMultiple(timestamp, 1 / track.metadata.frameRate);
        duration = roundToMultiple(duration, 1 / track.metadata.frameRate);
      }
      const additions = trackData.info.alphaMode ? packet.sideData.alpha ?? null : null;
      const videoChunk = this.createInternalChunk(packet.data, timestamp, duration, packet.type, additions);
      if (track.source._codec === "vp9") this.fixVP9ColorSpace(trackData, videoChunk);
      trackData.chunkQueue.push(videoChunk);
      await this.interleaveChunks();
    } finally {
      release();
    }
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getAudioTrackData(track, meta);
      const isKeyFrame = packet.type === "key";
      const timestamp = this.validateAndNormalizeTimestamp(trackData.track, packet.timestamp, isKeyFrame);
      const audioChunk = this.createInternalChunk(packet.data, timestamp, packet.duration, packet.type);
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
      const timestamp = this.validateAndNormalizeTimestamp(trackData.track, cue.timestamp, true);
      let bodyText = cue.text;
      const timestampMs = Math.round(timestamp * 1e3);
      if (track.source._codec === "ass" || track.source._codec === "ssa") {
        bodyText = convertDialogueLineToMkvFormat(bodyText);
      } else {
        inlineTimestampRegex.lastIndex = 0;
        bodyText = bodyText.replace(inlineTimestampRegex, (match) => {
          const time = parseSubtitleTimestamp(match.slice(1, -1));
          const offsetTime = time - timestampMs;
          return `<${formatSubtitleTimestamp(offsetTime)}>`;
        });
      }
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
  async interleaveChunks(isFinalCall = false) {
    if (!isFinalCall && !this.allTracksAreKnown()) {
      return;
    }
    outer:
      while (true) {
        let trackWithMinTimestamp = null;
        let minTimestamp = Infinity;
        for (const trackData of this.trackDatas) {
          if (!isFinalCall && trackData.chunkQueue.length === 0 && !trackData.track.source._closed) {
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
    if (!isFinalCall) {
      await this.writer.flush();
    }
  }
  /**
   * Due to [a bug in Chromium](https://bugs.chromium.org/p/chromium/issues/detail?id=1377842), VP9 streams often
  	 * lack color space information. This method patches in that information.
   */
  fixVP9ColorSpace(trackData, chunk) {
    if (chunk.type !== "key") return;
    if (!trackData.info.decoderConfig.colorSpace || !trackData.info.decoderConfig.colorSpace.matrix) return;
    const bitstream = new Bitstream(chunk.data);
    bitstream.skipBits(2);
    const profileLowBit = bitstream.readBits(1);
    const profileHighBit = bitstream.readBits(1);
    const profile = (profileHighBit << 1) + profileLowBit;
    if (profile === 3) bitstream.skipBits(1);
    const showExistingFrame = bitstream.readBits(1);
    if (showExistingFrame) return;
    const frameType = bitstream.readBits(1);
    if (frameType !== 0) return;
    bitstream.skipBits(2);
    const syncCode = bitstream.readBits(24);
    if (syncCode !== 4817730) return;
    if (profile >= 2) bitstream.skipBits(1);
    const colorSpaceID = {
      rgb: 7,
      bt709: 2,
      bt470bg: 1,
      smpte170m: 3
    }[trackData.info.decoderConfig.colorSpace.matrix];
    writeBits(chunk.data, bitstream.pos, bitstream.pos + 3, colorSpaceID);
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
      this.createSegment();
    }
    const msTimestamp = Math.round(1e3 * chunk.timestamp);
    const keyFrameQueuedEverywhere = this.trackDatas.every((otherTrackData) => {
      if (trackData === otherTrackData) {
        return chunk.type === "key";
      }
      const firstQueuedSample = otherTrackData.chunkQueue[0];
      if (firstQueuedSample) {
        return firstQueuedSample.type === "key";
      }
      return otherTrackData.track.source._closed;
    });
    let shouldCreateNewCluster = false;
    if (!this.currentCluster) {
      shouldCreateNewCluster = true;
    } else {
      assert(this.currentClusterStartMsTimestamp !== null);
      assert(this.currentClusterMaxMsTimestamp !== null);
      const relativeTimestamp2 = msTimestamp - this.currentClusterStartMsTimestamp;
      shouldCreateNewCluster = keyFrameQueuedEverywhere && msTimestamp > this.currentClusterMaxMsTimestamp && relativeTimestamp2 >= 1e3 * (this.format._options.minimumClusterDuration ?? 1) || relativeTimestamp2 > MAX_CLUSTER_TIMESTAMP_MS;
    }
    if (shouldCreateNewCluster) {
      this.createNewCluster(msTimestamp);
    }
    const relativeTimestamp = msTimestamp - this.currentClusterStartMsTimestamp;
    if (relativeTimestamp < MIN_CLUSTER_TIMESTAMP_MS) {
      return;
    }
    const prelude = new Uint8Array(4);
    const view2 = new DataView(prelude.buffer);
    view2.setUint8(0, 128 | trackData.track.id);
    view2.setInt16(1, relativeTimestamp, false);
    const msDuration = Math.round(1e3 * chunk.duration);
    if (!chunk.additions) {
      view2.setUint8(3, Number(chunk.type === "key") << 7);
      const simpleBlock = { id: 163 /* SimpleBlock */, data: [
        prelude,
        chunk.data
      ] };
      this.ebmlWriter.writeEBML(simpleBlock);
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
            { id: 238 /* BlockAddID */, data: 1 },
            // Some players expect BlockAddID to come first
            { id: 165 /* BlockAdditional */, data: chunk.additions }
          ] }
        ] } : null,
        msDuration > 0 ? { id: 155 /* BlockDuration */, data: msDuration } : null
      ] };
      this.ebmlWriter.writeEBML(blockGroup);
    }
    this.duration = Math.max(this.duration, msTimestamp + msDuration);
    trackData.lastWrittenMsTimestamp = msTimestamp;
    if (!this.trackDatasInCurrentCluster.has(trackData)) {
      this.trackDatasInCurrentCluster.set(trackData, {
        firstMsTimestamp: msTimestamp
      });
    }
    this.currentClusterMaxMsTimestamp = Math.max(this.currentClusterMaxMsTimestamp, msTimestamp);
  }
  /** Creates a new Cluster element to contain media chunks. */
  createNewCluster(msTimestamp) {
    if (this.currentCluster) {
      this.finalizeCurrentCluster();
    }
    if (this.format._options.onCluster) {
      this.writer.startTrackingWrites();
    }
    this.currentCluster = {
      id: 524531317 /* Cluster */,
      size: this.format._options.appendOnly ? -1 : CLUSTER_SIZE_BYTES,
      data: [
        { id: 231 /* Timestamp */, data: msTimestamp }
      ]
    };
    this.ebmlWriter.writeEBML(this.currentCluster);
    this.currentClusterStartMsTimestamp = msTimestamp;
    this.currentClusterMaxMsTimestamp = msTimestamp;
    this.trackDatasInCurrentCluster.clear();
  }
  finalizeCurrentCluster() {
    assert(this.currentCluster);
    if (!this.format._options.appendOnly) {
      const clusterSize = this.writer.getPos() - this.ebmlWriter.dataOffsets.get(this.currentCluster);
      const endPos = this.writer.getPos();
      this.writer.seek(this.ebmlWriter.offsets.get(this.currentCluster) + 4);
      this.ebmlWriter.writeVarInt(clusterSize, CLUSTER_SIZE_BYTES);
      this.writer.seek(endPos);
    }
    if (this.format._options.onCluster) {
      assert(this.currentClusterStartMsTimestamp !== null);
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onCluster(data, start, this.currentClusterStartMsTimestamp / 1e3);
    }
    const clusterOffsetFromSegment = this.ebmlWriter.offsets.get(this.currentCluster) - this.segmentDataOffset;
    const groupedByTimestamp = /* @__PURE__ */ new Map();
    for (const [trackData, { firstMsTimestamp }] of this.trackDatasInCurrentCluster) {
      if (!groupedByTimestamp.has(firstMsTimestamp)) {
        groupedByTimestamp.set(firstMsTimestamp, []);
      }
      groupedByTimestamp.get(firstMsTimestamp).push(trackData);
    }
    const groupedAndSortedByTimestamp = [...groupedByTimestamp.entries()].sort((a, b) => a[0] - b[0]);
    for (const [msTimestamp, trackDatas] of groupedAndSortedByTimestamp) {
      assert(this.cues);
      this.cues.data.push({ id: 187 /* CuePoint */, data: [
        { id: 179 /* CueTime */, data: msTimestamp },
        // Create CueTrackPositions for each track that starts at this timestamp
        ...trackDatas.map((trackData) => {
          return { id: 183 /* CueTrackPositions */, data: [
            { id: 247 /* CueTrack */, data: trackData.track.id },
            { id: 241 /* CueClusterPosition */, data: clusterOffsetFromSegment }
          ] };
        })
      ] });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async onTrackClose() {
    const release = await this.mutex.acquire();
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    await this.interleaveChunks();
    release();
  }
  /** Finalizes the file, making it ready for use. Must be called after all media chunks have been added. */
  async finalize() {
    const release = await this.mutex.acquire();
    this.allTracksKnown.resolve();
    if (!this.segment) {
      this.createSegment();
    }
    await this.interleaveChunks(true);
    if (this.currentCluster) {
      this.finalizeCurrentCluster();
    }
    assert(this.cues);
    this.ebmlWriter.writeEBML(this.cues);
    if (!this.format._options.appendOnly) {
      const endPos = this.writer.getPos();
      const segmentSize = this.writer.getPos() - this.segmentDataOffset;
      this.writer.seek(this.ebmlWriter.offsets.get(this.segment) + 4);
      this.ebmlWriter.writeVarInt(segmentSize, SEGMENT_SIZE_BYTES);
      this.segmentDuration.data = new EBMLFloat64(this.duration);
      this.writer.seek(this.ebmlWriter.offsets.get(this.segmentDuration));
      this.ebmlWriter.writeEBML(this.segmentDuration);
      assert(this.seekHead);
      this.writer.seek(this.ebmlWriter.offsets.get(this.seekHead));
      this.maybeCreateSeekHead(true);
      this.ebmlWriter.writeEBML(this.seekHead);
      this.writer.seek(endPos);
    }
    release();
  }
};

// src/mp3/mp3-writer.ts
var Mp3Writer = class {
  constructor(writer) {
    this.writer = writer;
    this.helper = new Uint8Array(8);
    this.helperView = new DataView(this.helper.buffer);
  }
  writeU32(value) {
    this.helperView.setUint32(0, value, false);
    this.writer.write(this.helper.subarray(0, 4));
  }
  writeXingFrame(data) {
    const startPos = this.writer.getPos();
    const firstByte = 255;
    const secondByte = 224 | data.mpegVersionId << 3 | data.layer << 1;
    let lowSamplingFrequency;
    if (data.mpegVersionId & 2) {
      lowSamplingFrequency = data.mpegVersionId & 1 ? 0 : 1;
    } else {
      lowSamplingFrequency = 1;
    }
    const padding = 0;
    const neededBytes = 155;
    let bitrateIndex = -1;
    const bitrateOffset = lowSamplingFrequency * 16 * 4 + data.layer * 16;
    for (let i = 0; i < 16; i++) {
      const kbr = KILOBIT_RATES[bitrateOffset + i];
      const size = computeMp3FrameSize(lowSamplingFrequency, data.layer, 1e3 * kbr, data.sampleRate, padding);
      if (size >= neededBytes) {
        bitrateIndex = i;
        break;
      }
    }
    if (bitrateIndex === -1) {
      throw new Error("No suitable bitrate found.");
    }
    const thirdByte = bitrateIndex << 4 | data.frequencyIndex << 2 | padding << 1;
    const fourthByte = data.channel << 6 | data.modeExtension << 4 | data.copyright << 3 | data.original << 2 | data.emphasis;
    this.helper[0] = firstByte;
    this.helper[1] = secondByte;
    this.helper[2] = thirdByte;
    this.helper[3] = fourthByte;
    this.writer.write(this.helper.subarray(0, 4));
    const xingOffset = getXingOffset(data.mpegVersionId, data.channel);
    this.writer.seek(startPos + xingOffset);
    this.writeU32(XING);
    let flags = 0;
    if (data.frameCount !== null) {
      flags |= 1;
    }
    if (data.fileSize !== null) {
      flags |= 2;
    }
    if (data.toc !== null) {
      flags |= 4;
    }
    this.writeU32(flags);
    this.writeU32(data.frameCount ?? 0);
    this.writeU32(data.fileSize ?? 0);
    this.writer.write(data.toc ?? new Uint8Array(100));
    const kilobitRate = KILOBIT_RATES[bitrateOffset + bitrateIndex];
    const frameSize = computeMp3FrameSize(
      lowSamplingFrequency,
      data.layer,
      1e3 * kilobitRate,
      data.sampleRate,
      padding
    );
    this.writer.seek(startPos + frameSize);
  }
};

// src/mp3/mp3-muxer.ts
var Mp3Muxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.xingFrameData = null;
    this.frameCount = 0;
    this.framePositions = [];
    this.xingFramePos = null;
    this.format = format;
    this.writer = output._writer;
    this.mp3Writer = new Mp3Writer(output._writer);
  }
  async start() {
    if (!metadataTagsAreEmpty(this.output._metadataTags)) {
      const id3Writer = new Id3V2Writer(this.writer);
      id3Writer.writeId3V2Tag(this.output._metadataTags);
    }
  }
  async getMimeType() {
    return "audio/mpeg";
  }
  async addEncodedVideoPacket() {
    throw new Error("MP3 does not support video.");
  }
  async addEncodedAudioPacket(track, packet) {
    const release = await this.mutex.acquire();
    try {
      const writeXingHeader = this.format._options.xingHeader !== false;
      if (!this.xingFrameData && writeXingHeader) {
        const view2 = toDataView(packet.data);
        if (view2.byteLength < 4) {
          throw new Error("Invalid MP3 header in sample.");
        }
        const word = view2.getUint32(0, false);
        const header = readFrameHeader(word, null).header;
        if (!header) {
          throw new Error("Invalid MP3 header in sample.");
        }
        const xingOffset = getXingOffset(header.mpegVersionId, header.channel);
        if (view2.byteLength >= xingOffset + 4) {
          const word2 = view2.getUint32(xingOffset, false);
          const isXing = word2 === XING || word2 === INFO;
          if (isXing) {
            return;
          }
        }
        this.xingFrameData = {
          mpegVersionId: header.mpegVersionId,
          layer: header.layer,
          frequencyIndex: header.frequencyIndex,
          sampleRate: header.sampleRate,
          channel: header.channel,
          modeExtension: header.modeExtension,
          copyright: header.copyright,
          original: header.original,
          emphasis: header.emphasis,
          frameCount: null,
          fileSize: null,
          toc: null
        };
        this.xingFramePos = this.writer.getPos();
        this.mp3Writer.writeXingFrame(this.xingFrameData);
        this.frameCount++;
      }
      this.validateAndNormalizeTimestamp(track, packet.timestamp, packet.type === "key");
      this.writer.write(packet.data);
      this.frameCount++;
      await this.writer.flush();
      if (writeXingHeader) {
        this.framePositions.push(this.writer.getPos());
      }
    } finally {
      release();
    }
  }
  async addSubtitleCue() {
    throw new Error("MP3 does not support subtitles.");
  }
  async finalize() {
    if (!this.xingFrameData || this.xingFramePos === null) {
      return;
    }
    const release = await this.mutex.acquire();
    const endPos = this.writer.getPos();
    this.writer.seek(this.xingFramePos);
    const toc = new Uint8Array(100);
    for (let i = 0; i < 100; i++) {
      const index = Math.floor(this.framePositions.length * (i / 100));
      assert(index !== -1 && index < this.framePositions.length);
      const byteOffset = this.framePositions[index];
      toc[i] = 256 * (byteOffset / endPos);
    }
    this.xingFrameData.frameCount = this.frameCount;
    this.xingFrameData.fileSize = endPos;
    this.xingFrameData.toc = toc;
    if (this.format._options.onXingFrame) {
      this.writer.startTrackingWrites();
    }
    this.mp3Writer.writeXingFrame(this.xingFrameData);
    if (this.format._options.onXingFrame) {
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onXingFrame(data, start);
    }
    this.writer.seek(endPos);
    release();
  }
};

// src/ogg/ogg-muxer.ts
var PAGE_SIZE_TARGET = 8192;
var OggMuxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.trackDatas = [];
    this.bosPagesWritten = false;
    this.allTracksKnown = promiseWithResolvers();
    this.pageBytes = new Uint8Array(MAX_PAGE_SIZE);
    this.pageView = new DataView(this.pageBytes.buffer);
    this.format = format;
    this.writer = output._writer;
    this.writer.ensureMonotonicity = true;
  }
  async start() {
  }
  async getMimeType() {
    await this.allTracksKnown.promise;
    return buildOggMimeType({
      codecStrings: this.trackDatas.map((x) => x.codecInfo.codec)
    });
  }
  addEncodedVideoPacket() {
    throw new Error("Video tracks are not supported.");
  }
  getTrackData(track, meta) {
    const existingTrackData = this.trackDatas.find((td) => td.track === track);
    if (existingTrackData) {
      return existingTrackData;
    }
    let serialNumber;
    do {
      serialNumber = Math.floor(2 ** 32 * Math.random());
    } while (this.trackDatas.some((td) => td.serialNumber === serialNumber));
    assert(track.source._codec === "vorbis" || track.source._codec === "opus");
    validateAudioChunkMetadata(meta);
    assert(meta);
    assert(meta.decoderConfig);
    const newTrackData = {
      track,
      serialNumber,
      internalSampleRate: track.source._codec === "opus" ? OPUS_SAMPLE_RATE : meta.decoderConfig.sampleRate,
      codecInfo: {
        codec: track.source._codec,
        vorbisInfo: null,
        opusInfo: null
      },
      vorbisLastBlocksize: null,
      packetQueue: [],
      currentTimestampInSamples: 0,
      pagesWritten: 0,
      currentGranulePosition: 0,
      currentLacingValues: [],
      currentPageData: [],
      currentPageSize: 27,
      currentPageStartsWithFreshPacket: true
    };
    this.queueHeaderPackets(newTrackData, meta);
    this.trackDatas.push(newTrackData);
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    return newTrackData;
  }
  queueHeaderPackets(trackData, meta) {
    assert(meta.decoderConfig);
    if (trackData.track.source._codec === "vorbis") {
      assert(meta.decoderConfig.description);
      const bytes2 = toUint8Array(meta.decoderConfig.description);
      if (bytes2[0] !== 2) {
        throw new TypeError("First byte of Vorbis decoder description must be 2.");
      }
      let pos = 1;
      const readPacketLength = () => {
        let length = 0;
        while (true) {
          const value = bytes2[pos++];
          if (value === void 0) {
            throw new TypeError("Vorbis decoder description is too short.");
          }
          length += value;
          if (value < 255) {
            return length;
          }
        }
      };
      const identificationHeaderLength = readPacketLength();
      const commentHeaderLength = readPacketLength();
      const setupHeaderLength = bytes2.length - pos;
      if (setupHeaderLength <= 0) {
        throw new TypeError("Vorbis decoder description is too short.");
      }
      const identificationHeader = bytes2.subarray(pos, pos += identificationHeaderLength);
      pos += commentHeaderLength;
      const setupHeader = bytes2.subarray(pos);
      const commentHeaderHeader = new Uint8Array(7);
      commentHeaderHeader[0] = 3;
      commentHeaderHeader[1] = 118;
      commentHeaderHeader[2] = 111;
      commentHeaderHeader[3] = 114;
      commentHeaderHeader[4] = 98;
      commentHeaderHeader[5] = 105;
      commentHeaderHeader[6] = 115;
      const commentHeader = createVorbisComments(commentHeaderHeader, this.output._metadataTags, true);
      trackData.packetQueue.push({
        data: identificationHeader,
        endGranulePosition: 0,
        timestamp: 0,
        forcePageFlush: true
      }, {
        data: commentHeader,
        endGranulePosition: 0,
        timestamp: 0,
        forcePageFlush: false
      }, {
        data: setupHeader,
        endGranulePosition: 0,
        timestamp: 0,
        forcePageFlush: true
        // The last header packet must flush the page
      });
      const view2 = toDataView(identificationHeader);
      const blockSizeByte = view2.getUint8(28);
      trackData.codecInfo.vorbisInfo = {
        blocksizes: [
          1 << (blockSizeByte & 15),
          1 << (blockSizeByte >> 4)
        ],
        modeBlockflags: parseModesFromVorbisSetupPacket(setupHeader).modeBlockflags
      };
    } else if (trackData.track.source._codec === "opus") {
      if (!meta.decoderConfig.description) {
        throw new TypeError("For Ogg, Opus decoder description is required.");
      }
      const identificationHeader = toUint8Array(meta.decoderConfig.description);
      const commentHeaderHeader = new Uint8Array(8);
      const commentHeaderHeaderView = toDataView(commentHeaderHeader);
      commentHeaderHeaderView.setUint32(0, 1332770163, false);
      commentHeaderHeaderView.setUint32(4, 1415669619, false);
      const commentHeader = createVorbisComments(commentHeaderHeader, this.output._metadataTags, true);
      trackData.packetQueue.push({
        data: identificationHeader,
        endGranulePosition: 0,
        timestamp: 0,
        forcePageFlush: true
      }, {
        data: commentHeader,
        endGranulePosition: 0,
        timestamp: 0,
        forcePageFlush: true
        // The last header packet must flush the page
      });
      trackData.codecInfo.opusInfo = {
        preSkip: parseOpusIdentificationHeader(identificationHeader).preSkip
      };
    }
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      const trackData = this.getTrackData(track, meta);
      this.validateAndNormalizeTimestamp(trackData.track, packet.timestamp, packet.type === "key");
      const currentTimestampInSamples = trackData.currentTimestampInSamples;
      const { durationInSamples, vorbisBlockSize } = extractSampleMetadata(
        packet.data,
        trackData.codecInfo,
        trackData.vorbisLastBlocksize
      );
      trackData.currentTimestampInSamples += durationInSamples;
      trackData.vorbisLastBlocksize = vorbisBlockSize;
      trackData.packetQueue.push({
        data: packet.data,
        endGranulePosition: trackData.currentTimestampInSamples,
        timestamp: currentTimestampInSamples / trackData.internalSampleRate,
        forcePageFlush: false
      });
      await this.interleavePages();
    } finally {
      release();
    }
  }
  addSubtitleCue() {
    throw new Error("Subtitle tracks are not supported.");
  }
  allTracksAreKnown() {
    for (const track of this.output._tracks) {
      if (!track.source._closed && !this.trackDatas.some((x) => x.track === track)) {
        return false;
      }
    }
    return true;
  }
  async interleavePages(isFinalCall = false) {
    if (!this.bosPagesWritten) {
      if (!this.allTracksAreKnown()) {
        return;
      }
      for (const trackData of this.trackDatas) {
        while (trackData.packetQueue.length > 0) {
          const packet = trackData.packetQueue.shift();
          this.writePacket(trackData, packet, false);
          if (packet.forcePageFlush) {
            break;
          }
        }
      }
      this.bosPagesWritten = true;
    }
    outer:
      while (true) {
        let trackWithMinTimestamp = null;
        let minTimestamp = Infinity;
        for (const trackData of this.trackDatas) {
          if (!isFinalCall && trackData.packetQueue.length <= 1 && !trackData.track.source._closed) {
            break outer;
          }
          if (trackData.packetQueue.length > 0 && trackData.packetQueue[0].timestamp < minTimestamp) {
            trackWithMinTimestamp = trackData;
            minTimestamp = trackData.packetQueue[0].timestamp;
          }
        }
        if (!trackWithMinTimestamp) {
          break;
        }
        const packet = trackWithMinTimestamp.packetQueue.shift();
        const isFinalPacket = trackWithMinTimestamp.packetQueue.length === 0;
        this.writePacket(trackWithMinTimestamp, packet, isFinalPacket);
      }
    if (!isFinalCall) {
      await this.writer.flush();
    }
  }
  writePacket(trackData, packet, isFinalPacket) {
    let remainingLength = packet.data.length;
    let dataStartOffset = 0;
    let dataOffset = 0;
    while (true) {
      if (trackData.currentLacingValues.length === 0 && dataStartOffset > 0) {
        trackData.currentPageStartsWithFreshPacket = false;
      }
      const segmentSize = Math.min(255, remainingLength);
      trackData.currentLacingValues.push(segmentSize);
      trackData.currentPageSize++;
      dataOffset += segmentSize;
      const segmentIsLastOfPacket = remainingLength < 255;
      if (trackData.currentLacingValues.length === 255) {
        const slice2 = packet.data.subarray(dataStartOffset, dataOffset);
        dataStartOffset = dataOffset;
        trackData.currentPageData.push(slice2);
        trackData.currentPageSize += slice2.length;
        this.writePage(trackData, isFinalPacket && segmentIsLastOfPacket);
        if (segmentIsLastOfPacket) {
          return;
        }
      }
      if (segmentIsLastOfPacket) {
        break;
      }
      remainingLength -= 255;
    }
    const slice = packet.data.subarray(dataStartOffset);
    trackData.currentPageData.push(slice);
    trackData.currentPageSize += slice.length;
    trackData.currentGranulePosition = packet.endGranulePosition;
    if (trackData.currentPageSize >= PAGE_SIZE_TARGET || packet.forcePageFlush) {
      this.writePage(trackData, isFinalPacket);
    }
  }
  writePage(trackData, isEos) {
    this.pageView.setUint32(0, OGGS, true);
    this.pageView.setUint8(4, 0);
    let headerType = 0;
    if (!trackData.currentPageStartsWithFreshPacket) {
      headerType |= 1;
    }
    if (trackData.pagesWritten === 0) {
      headerType |= 2;
    }
    if (isEos) {
      headerType |= 4;
    }
    this.pageView.setUint8(5, headerType);
    const granulePosition = trackData.currentLacingValues.every((x) => x === 255) ? -1 : trackData.currentGranulePosition;
    setInt64(this.pageView, 6, granulePosition, true);
    this.pageView.setUint32(14, trackData.serialNumber, true);
    this.pageView.setUint32(18, trackData.pagesWritten, true);
    this.pageView.setUint32(22, 0, true);
    this.pageView.setUint8(26, trackData.currentLacingValues.length);
    this.pageBytes.set(trackData.currentLacingValues, 27);
    let pos = 27 + trackData.currentLacingValues.length;
    for (const data of trackData.currentPageData) {
      this.pageBytes.set(data, pos);
      pos += data.length;
    }
    const slice = this.pageBytes.subarray(0, pos);
    const crc = computeOggPageCrc(slice);
    this.pageView.setUint32(22, crc, true);
    trackData.pagesWritten++;
    trackData.currentLacingValues.length = 0;
    trackData.currentPageData.length = 0;
    trackData.currentPageSize = 27;
    trackData.currentPageStartsWithFreshPacket = true;
    if (this.format._options.onPage) {
      this.writer.startTrackingWrites();
    }
    this.writer.write(slice);
    if (this.format._options.onPage) {
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onPage(data, start, trackData.track.source);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async onTrackClose() {
    const release = await this.mutex.acquire();
    if (this.allTracksAreKnown()) {
      this.allTracksKnown.resolve();
    }
    await this.interleavePages();
    release();
  }
  async finalize() {
    const release = await this.mutex.acquire();
    this.allTracksKnown.resolve();
    await this.interleavePages(true);
    for (const trackData of this.trackDatas) {
      if (trackData.currentLacingValues.length > 0) {
        this.writePage(trackData, true);
      }
    }
    release();
  }
};

// src/wave/riff-writer.ts
var RiffWriter = class {
  constructor(writer) {
    this.writer = writer;
    this.helper = new Uint8Array(8);
    this.helperView = new DataView(this.helper.buffer);
  }
  writeU16(value) {
    this.helperView.setUint16(0, value, true);
    this.writer.write(this.helper.subarray(0, 2));
  }
  writeU32(value) {
    this.helperView.setUint32(0, value, true);
    this.writer.write(this.helper.subarray(0, 4));
  }
  writeU64(value) {
    this.helperView.setUint32(0, value, true);
    this.helperView.setUint32(4, Math.floor(value / 2 ** 32), true);
    this.writer.write(this.helper);
  }
  writeAscii(text) {
    this.writer.write(new TextEncoder().encode(text));
  }
};

// src/wave/wave-muxer.ts
var WaveMuxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.headerWritten = false;
    this.dataSize = 0;
    this.sampleRate = null;
    this.sampleCount = 0;
    this.riffSizePos = null;
    this.dataSizePos = null;
    this.ds64RiffSizePos = null;
    this.ds64DataSizePos = null;
    this.ds64SampleCountPos = null;
    this.format = format;
    this.writer = output._writer;
    this.riffWriter = new RiffWriter(output._writer);
    this.isRf64 = !!format._options.large;
  }
  async start() {
  }
  async getMimeType() {
    return "audio/wav";
  }
  async addEncodedVideoPacket() {
    throw new Error("WAVE does not support video.");
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    try {
      if (!this.headerWritten) {
        validateAudioChunkMetadata(meta);
        assert(meta);
        assert(meta.decoderConfig);
        this.writeHeader(track, meta.decoderConfig);
        this.sampleRate = meta.decoderConfig.sampleRate;
        this.headerWritten = true;
      }
      this.validateAndNormalizeTimestamp(track, packet.timestamp, packet.type === "key");
      if (!this.isRf64 && this.writer.getPos() + packet.data.byteLength >= 2 ** 32) {
        throw new Error(
          "Adding more audio data would exceed the maximum RIFF size of 4 GiB. To write larger files, use RF64 by setting `large: true` in the WavOutputFormatOptions."
        );
      }
      this.writer.write(packet.data);
      this.dataSize += packet.data.byteLength;
      this.sampleCount += Math.round(packet.duration * this.sampleRate);
      await this.writer.flush();
    } finally {
      release();
    }
  }
  async addSubtitleCue() {
    throw new Error("WAVE does not support subtitles.");
  }
  writeHeader(track, config) {
    if (this.format._options.onHeader) {
      this.writer.startTrackingWrites();
    }
    let format;
    const codec = track.source._codec;
    const pcmInfo = parsePcmCodec(codec);
    if (pcmInfo.dataType === "ulaw") {
      format = 7 /* MULAW */;
    } else if (pcmInfo.dataType === "alaw") {
      format = 6 /* ALAW */;
    } else if (pcmInfo.dataType === "float") {
      format = 3 /* IEEE_FLOAT */;
    } else {
      format = 1 /* PCM */;
    }
    const channels = config.numberOfChannels;
    const sampleRate = config.sampleRate;
    const blockSize = pcmInfo.sampleSize * channels;
    this.riffWriter.writeAscii(this.isRf64 ? "RF64" : "RIFF");
    if (this.isRf64) {
      this.riffWriter.writeU32(4294967295);
    } else {
      this.riffSizePos = this.writer.getPos();
      this.riffWriter.writeU32(0);
    }
    this.riffWriter.writeAscii("WAVE");
    if (this.isRf64) {
      this.riffWriter.writeAscii("ds64");
      this.riffWriter.writeU32(28);
      this.ds64RiffSizePos = this.writer.getPos();
      this.riffWriter.writeU64(0);
      this.ds64DataSizePos = this.writer.getPos();
      this.riffWriter.writeU64(0);
      this.ds64SampleCountPos = this.writer.getPos();
      this.riffWriter.writeU64(0);
      this.riffWriter.writeU32(0);
    }
    this.riffWriter.writeAscii("fmt ");
    this.riffWriter.writeU32(16);
    this.riffWriter.writeU16(format);
    this.riffWriter.writeU16(channels);
    this.riffWriter.writeU32(sampleRate);
    this.riffWriter.writeU32(sampleRate * blockSize);
    this.riffWriter.writeU16(blockSize);
    this.riffWriter.writeU16(8 * pcmInfo.sampleSize);
    if (!metadataTagsAreEmpty(this.output._metadataTags)) {
      const metadataFormat = this.format._options.metadataFormat ?? "info";
      if (metadataFormat === "info") {
        this.writeInfoChunk(this.output._metadataTags);
      } else if (metadataFormat === "id3") {
        this.writeId3Chunk(this.output._metadataTags);
      } else {
        assertNever(metadataFormat);
      }
    }
    this.riffWriter.writeAscii("data");
    if (this.isRf64) {
      this.riffWriter.writeU32(4294967295);
    } else {
      this.dataSizePos = this.writer.getPos();
      this.riffWriter.writeU32(0);
    }
    if (this.format._options.onHeader) {
      const { data, start } = this.writer.stopTrackingWrites();
      this.format._options.onHeader(data, start);
    }
  }
  writeInfoChunk(metadata) {
    const startPos = this.writer.getPos();
    this.riffWriter.writeAscii("LIST");
    this.riffWriter.writeU32(0);
    this.riffWriter.writeAscii("INFO");
    const writtenTags = /* @__PURE__ */ new Set();
    const writeInfoTag = (tag, value) => {
      if (!isIso88591Compatible(value)) {
        console.warn(`Didn't write tag '${tag}' because '${value}' is not ISO 8859-1-compatible.`);
        return;
      }
      const size = value.length + 1;
      const bytes2 = new Uint8Array(size);
      for (let i = 0; i < value.length; i++) {
        bytes2[i] = value.charCodeAt(i);
      }
      this.riffWriter.writeAscii(tag);
      this.riffWriter.writeU32(size);
      this.writer.write(bytes2);
      if (size & 1) {
        this.writer.write(new Uint8Array(1));
      }
      writtenTags.add(tag);
    };
    for (const { key, value } of keyValueIterator(metadata)) {
      switch (key) {
        case "title":
          {
            writeInfoTag("INAM", value);
            writtenTags.add("INAM");
          }
          ;
          break;
        case "artist":
          {
            writeInfoTag("IART", value);
            writtenTags.add("IART");
          }
          ;
          break;
        case "album":
          {
            writeInfoTag("IPRD", value);
            writtenTags.add("IPRD");
          }
          ;
          break;
        case "trackNumber":
          {
            const string = metadata.tracksTotal !== void 0 ? `${value}/${metadata.tracksTotal}` : value.toString();
            writeInfoTag("ITRK", string);
            writtenTags.add("ITRK");
          }
          ;
          break;
        case "genre":
          {
            writeInfoTag("IGNR", value);
            writtenTags.add("IGNR");
          }
          ;
          break;
        case "date":
          {
            writeInfoTag("ICRD", value.toISOString().slice(0, 10));
            writtenTags.add("ICRD");
          }
          ;
          break;
        case "comment":
          {
            writeInfoTag("ICMT", value);
            writtenTags.add("ICMT");
          }
          ;
          break;
        case "albumArtist":
        case "discNumber":
        case "tracksTotal":
        case "discsTotal":
        case "description":
        case "lyrics":
        case "images":
          {
          }
          ;
          break;
        case "raw":
          {
          }
          ;
          break;
        default:
          assertNever(key);
      }
    }
    if (metadata.raw) {
      for (const key in metadata.raw) {
        const value = metadata.raw[key];
        if (value == null || key.length !== 4 || writtenTags.has(key)) {
          continue;
        }
        if (typeof value === "string") {
          writeInfoTag(key, value);
        }
      }
    }
    const endPos = this.writer.getPos();
    const chunkSize = endPos - startPos - 8;
    this.writer.seek(startPos + 4);
    this.riffWriter.writeU32(chunkSize);
    this.writer.seek(endPos);
    if (chunkSize & 1) {
      this.writer.write(new Uint8Array(1));
    }
  }
  writeId3Chunk(metadata) {
    const startPos = this.writer.getPos();
    this.riffWriter.writeAscii("ID3 ");
    this.riffWriter.writeU32(0);
    const id3Writer = new Id3V2Writer(this.writer);
    const id3TagSize = id3Writer.writeId3V2Tag(metadata);
    const endPos = this.writer.getPos();
    this.writer.seek(startPos + 4);
    this.riffWriter.writeU32(id3TagSize);
    this.writer.seek(endPos);
    if (id3TagSize & 1) {
      this.writer.write(new Uint8Array(1));
    }
  }
  async finalize() {
    const release = await this.mutex.acquire();
    const endPos = this.writer.getPos();
    if (this.isRf64) {
      assert(this.ds64RiffSizePos !== null);
      this.writer.seek(this.ds64RiffSizePos);
      this.riffWriter.writeU64(endPos - 8);
      assert(this.ds64DataSizePos !== null);
      this.writer.seek(this.ds64DataSizePos);
      this.riffWriter.writeU64(this.dataSize);
      assert(this.ds64SampleCountPos !== null);
      this.writer.seek(this.ds64SampleCountPos);
      this.riffWriter.writeU64(this.sampleCount);
    } else {
      assert(this.riffSizePos !== null);
      this.writer.seek(this.riffSizePos);
      this.riffWriter.writeU32(endPos - 8);
      assert(this.dataSizePos !== null);
      this.writer.seek(this.dataSizePos);
      this.riffWriter.writeU32(this.dataSize);
    }
    this.writer.seek(endPos);
    release();
  }
};

// src/avi/riff-writer.ts
var RIFFWriter = class {
  // Big-endian variant
  constructor(writer, isRIFX = false) {
    this.isRIFX = false;
    this.writer = writer;
    this.isRIFX = isRIFX;
  }
  writeString(str) {
    this.writer.write(textEncoder.encode(str));
  }
  writeFourCC(fourcc) {
    const buffer = new Uint8Array(4);
    for (let i = 0; i < 4 && i < fourcc.length; i++) {
      buffer[i] = fourcc.charCodeAt(i);
    }
    this.writer.write(buffer);
  }
  writeUint32(value) {
    const buffer = new ArrayBuffer(4);
    const view2 = new DataView(buffer);
    view2.setUint32(0, value, !this.isRIFX);
    this.writer.write(new Uint8Array(buffer));
  }
  writeUint16(value) {
    const buffer = new ArrayBuffer(2);
    const view2 = new DataView(buffer);
    view2.setUint16(0, value, !this.isRIFX);
    this.writer.write(new Uint8Array(buffer));
  }
  writeInt32(value) {
    const buffer = new ArrayBuffer(4);
    const view2 = new DataView(buffer);
    view2.setInt32(0, value, !this.isRIFX);
    this.writer.write(new Uint8Array(buffer));
  }
  writeInt16(value) {
    const buffer = new ArrayBuffer(2);
    const view2 = new DataView(buffer);
    view2.setInt16(0, value, !this.isRIFX);
    this.writer.write(new Uint8Array(buffer));
  }
  writeBytes(data) {
    this.writer.write(data);
  }
  writePadding() {
    if (this.writer.getPos() % 2 !== 0) {
      this.writer.write(new Uint8Array(1));
    }
  }
  startList(fourcc) {
    this.writeFourCC("LIST");
    const sizePos = this.writer.getPos();
    this.writeUint32(0);
    this.writeFourCC(fourcc);
    return sizePos;
  }
  endList(sizePos) {
    const currentPos = this.writer.getPos();
    const size = currentPos - sizePos - 8;
    this.writer.seek(sizePos);
    this.writeUint32(size);
    this.writer.seek(currentPos);
  }
  startChunk(fourcc) {
    this.writeFourCC(fourcc);
    const sizePos = this.writer.getPos();
    this.writeUint32(0);
    return sizePos;
  }
  endChunk(sizePos) {
    const currentPos = this.writer.getPos();
    const size = currentPos - sizePos - 4;
    this.writer.seek(sizePos);
    this.writeUint32(size);
    this.writer.seek(currentPos);
    this.writePadding();
  }
};

// src/avi/avi-muxer.ts
var AVIMuxer = class extends Muxer {
  constructor(output, format) {
    super(output);
    this.trackDatas = [];
    this.allTracksKnown = promiseWithResolvers();
    this.fileStartPos = 0;
    this.hdrlListSizePos = 0;
    this.moviListSizePos = 0;
    this.moviDataStart = 0;
    this.mainHeaderPos = 0;
    this.streamHeaderPositions = [];
    this.index = [];
    this.totalFrames = 0;
    this.maxBytesPerSec = 0;
    this.duration = 0;
    this.headerFinalized = false;
    this.writer = output._writer;
    this.format = format;
    this.riffWriter = new RIFFWriter(this.writer);
    if (this.format._options.large) {
    }
  }
  async start() {
    const release = await this.mutex.acquire();
    this.fileStartPos = this.writer.getPos();
    this.riffWriter.writeFourCC("RIFF");
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeFourCC("AVI ");
    this.hdrlListSizePos = this.riffWriter.startList("hdrl");
    this.writeMainHeader();
    await this.writer.flush();
    release();
  }
  writeMainHeader() {
    this.riffWriter.writeFourCC("avih");
    this.riffWriter.writeUint32(56);
    this.mainHeaderPos = this.writer.getPos();
    this.riffWriter.writeUint32(41667);
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeUint32(16);
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeUint32(0);
    this.writer.write(new Uint8Array(16));
  }
  async finalizeHeader() {
    if (this.headerFinalized) return;
    this.allTracksKnown.resolve();
    for (let i = 0; i < this.trackDatas.length; i++) {
      this.writeStreamList(this.trackDatas[i], i);
    }
    this.riffWriter.endList(this.hdrlListSizePos);
    this.moviListSizePos = this.riffWriter.startList("movi");
    this.moviDataStart = this.writer.getPos();
    this.headerFinalized = true;
  }
  writeStreamList(trackData, index) {
    if (!trackData) return;
    const strlSizePos = this.riffWriter.startList("strl");
    this.riffWriter.writeFourCC("strh");
    this.riffWriter.writeUint32(56);
    this.streamHeaderPositions[index] = this.writer.getPos();
    if (trackData.type === "video") {
      const videoTrackData = trackData;
      this.riffWriter.writeFourCC("vids");
      this.riffWriter.writeFourCC(videoTrackData.info.fourcc);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint16(0);
      this.riffWriter.writeUint16(0);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(1e3);
      this.riffWriter.writeUint32(Math.round(videoTrackData.info.frameRate * 1e3));
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(1e4);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint16(0);
      this.riffWriter.writeUint16(0);
      this.riffWriter.writeUint16(videoTrackData.info.width);
      this.riffWriter.writeUint16(videoTrackData.info.height);
    } else if (trackData.type === "audio") {
      const audioTrackData = trackData;
      const bytesPerSample = audioTrackData.info.bitsPerSample / 8 * audioTrackData.info.numberOfChannels;
      this.riffWriter.writeFourCC("auds");
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint16(0);
      this.riffWriter.writeUint16(0);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(1);
      this.riffWriter.writeUint32(audioTrackData.info.sampleRate);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(4294967295);
      this.riffWriter.writeUint32(bytesPerSample);
      this.riffWriter.writeUint16(0);
      this.riffWriter.writeUint16(0);
      this.riffWriter.writeUint16(0);
      this.riffWriter.writeUint16(0);
    }
    this.riffWriter.writeFourCC("strf");
    if (trackData.type === "video") {
      const videoTrackData = trackData;
      this.riffWriter.writeUint32(40);
      this.riffWriter.writeUint32(40);
      this.riffWriter.writeInt32(videoTrackData.info.width);
      this.riffWriter.writeInt32(videoTrackData.info.height);
      this.riffWriter.writeUint16(1);
      this.riffWriter.writeUint16(24);
      this.riffWriter.writeFourCC(videoTrackData.info.fourcc);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeInt32(0);
      this.riffWriter.writeInt32(0);
      this.riffWriter.writeUint32(0);
      this.riffWriter.writeUint32(0);
    } else if (trackData.type === "audio") {
      const audioTrackData = trackData;
      const blockAlign = audioTrackData.info.numberOfChannels * (audioTrackData.info.bitsPerSample / 8);
      this.riffWriter.writeUint32(16);
      this.riffWriter.writeUint16(audioTrackData.info.formatTag);
      this.riffWriter.writeUint16(audioTrackData.info.numberOfChannels);
      this.riffWriter.writeUint32(audioTrackData.info.sampleRate);
      this.riffWriter.writeUint32(audioTrackData.info.sampleRate * blockAlign);
      this.riffWriter.writeUint16(blockAlign);
      this.riffWriter.writeUint16(audioTrackData.info.bitsPerSample);
    }
    this.riffWriter.endList(strlSizePos);
  }
  async getMimeType() {
    return "video/x-msvideo";
  }
  getVideoTrackData(track) {
    for (const trackData of this.trackDatas) {
      if (trackData.track === track) {
        return trackData;
      }
    }
    return null;
  }
  getAudioTrackData(track) {
    for (const trackData of this.trackDatas) {
      if (trackData.track === track) {
        return trackData;
      }
    }
    return null;
  }
  async addEncodedVideoPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    let trackData = this.getVideoTrackData(track);
    if (!trackData) {
      const fourcc = aviVideoCodecToFourcc(track.source._codec);
      if (!fourcc) {
        throw new Error(`Unsupported video codec for AVI: ${track.source._codec}`);
      }
      validateVideoChunkMetadata(meta);
      trackData = {
        track,
        type: "video",
        info: {
          width: meta.decoderConfig.codedWidth || 640,
          height: meta.decoderConfig.codedHeight || 480,
          frameRate: 30,
          fourcc,
          decoderConfig: meta.decoderConfig
        },
        chunkQueue: [],
        frameCount: 0,
        sampleCount: 0,
        maxChunkSize: 0,
        lastTimestamp: 0
      };
      this.trackDatas.push(trackData);
    }
    if (!this.headerFinalized) {
      await this.finalizeHeader();
    }
    const streamIndex = this.trackDatas.indexOf(trackData);
    const chunkId = makeStreamChunkId(streamIndex, "dc");
    const offset = this.writer.getPos() - this.moviDataStart;
    this.riffWriter.writeFourCC(chunkId);
    this.riffWriter.writeUint32(packet.data.length);
    this.writer.write(packet.data);
    this.riffWriter.writePadding();
    this.index.push({
      ckid: chunkId,
      flags: packet.type === "key" ? AVIIF_KEYFRAME : 0,
      offset,
      size: packet.data.length
    });
    trackData.frameCount++;
    trackData.lastTimestamp = packet.timestamp;
    trackData.maxChunkSize = Math.max(trackData.maxChunkSize, packet.data.length);
    this.totalFrames = Math.max(this.totalFrames, trackData.frameCount);
    this.duration = Math.max(this.duration, packet.timestamp);
    release();
  }
  async addEncodedAudioPacket(track, packet, meta) {
    const release = await this.mutex.acquire();
    let trackData = this.getAudioTrackData(track);
    if (!trackData) {
      const formatTag = aviAudioCodecToFormatTag(track.source._codec);
      if (formatTag === null) {
        throw new Error(`Unsupported audio codec for AVI: ${track.source._codec}`);
      }
      validateAudioChunkMetadata(meta);
      trackData = {
        track,
        type: "audio",
        info: {
          numberOfChannels: meta.decoderConfig.numberOfChannels || 2,
          sampleRate: meta.decoderConfig.sampleRate || 48e3,
          bitsPerSample: 16,
          // Default, could be derived from codec
          formatTag,
          decoderConfig: meta.decoderConfig
        },
        chunkQueue: [],
        frameCount: 0,
        sampleCount: 0,
        maxChunkSize: 0,
        lastTimestamp: 0
      };
      this.trackDatas.push(trackData);
    }
    if (!this.headerFinalized) {
      await this.finalizeHeader();
    }
    const streamIndex = this.trackDatas.indexOf(trackData);
    const chunkId = makeStreamChunkId(streamIndex, "wb");
    const offset = this.writer.getPos() - this.moviDataStart;
    this.riffWriter.writeFourCC(chunkId);
    this.riffWriter.writeUint32(packet.data.length);
    this.writer.write(packet.data);
    this.riffWriter.writePadding();
    this.index.push({
      ckid: chunkId,
      flags: 0,
      offset,
      size: packet.data.length
    });
    const bytesPerSample = trackData.info.bitsPerSample / 8 * trackData.info.numberOfChannels;
    trackData.sampleCount += Math.floor(packet.data.length / bytesPerSample);
    trackData.lastTimestamp = packet.timestamp;
    trackData.maxChunkSize = Math.max(trackData.maxChunkSize, packet.data.length);
    this.duration = Math.max(this.duration, packet.timestamp);
    release();
  }
  async addSubtitleCue(track, cue, meta) {
    throw new Error("AVI format does not support subtitle tracks");
  }
  async finalize() {
    const release = await this.mutex.acquire();
    if (!this.headerFinalized) {
      await this.finalizeHeader();
    }
    if (this.moviListSizePos) {
      this.riffWriter.endList(this.moviListSizePos);
    }
    if (this.index.length > 0) {
      const idxSizePos = this.riffWriter.startChunk("idx1");
      for (const entry of this.index) {
        this.riffWriter.writeFourCC(entry.ckid);
        this.riffWriter.writeUint32(entry.flags);
        this.riffWriter.writeUint32(entry.offset);
        this.riffWriter.writeUint32(entry.size);
      }
      this.riffWriter.endChunk(idxSizePos);
    }
    const endPos = this.writer.getPos();
    this.writer.seek(this.fileStartPos + 4);
    this.riffWriter.writeUint32(endPos - this.fileStartPos - 8);
    this.updateMainHeader();
    this.updateStreamHeaders();
    this.writer.seek(endPos);
    await this.writer.flush();
    release();
  }
  updateMainHeader() {
    this.writer.seek(this.mainHeaderPos);
    let microSecPerFrame = 41667;
    let width = 0;
    let height = 0;
    let suggestedBufferSize = 0;
    for (const trackData of this.trackDatas) {
      if (trackData.type === "video") {
        const videoTrackData = trackData;
        width = Math.max(width, videoTrackData.info.width);
        height = Math.max(height, videoTrackData.info.height);
        if (videoTrackData.info.frameRate > 0) {
          microSecPerFrame = Math.round(1e6 / videoTrackData.info.frameRate);
        }
      }
      suggestedBufferSize = Math.max(suggestedBufferSize, trackData.maxChunkSize);
    }
    this.riffWriter.writeUint32(microSecPerFrame);
    this.riffWriter.writeUint32(this.maxBytesPerSec);
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeUint32(16);
    this.riffWriter.writeUint32(this.totalFrames);
    this.riffWriter.writeUint32(0);
    this.riffWriter.writeUint32(this.trackDatas.length);
    this.riffWriter.writeUint32(suggestedBufferSize);
    this.riffWriter.writeUint32(width);
    this.riffWriter.writeUint32(height);
  }
  updateStreamHeaders() {
    for (let i = 0; i < this.trackDatas.length; i++) {
      const trackData = this.trackDatas[i];
      if (!trackData) continue;
      const pos = this.streamHeaderPositions[i];
      if (!pos) continue;
      this.writer.seek(pos + 28);
      if (trackData.type === "video") {
        this.riffWriter.writeUint32(trackData.frameCount);
      } else if (trackData.type === "audio") {
        this.riffWriter.writeUint32(trackData.sampleCount);
      }
      this.writer.seek(pos + 32);
      this.riffWriter.writeUint32(trackData.maxChunkSize);
    }
  }
};

// src/output-format.ts
var OutputFormat = class {
  /** Returns a list of video codecs that this output format can contain. */
  getSupportedVideoCodecs() {
    return this.getSupportedCodecs().filter((codec) => VIDEO_CODECS.includes(codec));
  }
  /** Returns a list of audio codecs that this output format can contain. */
  getSupportedAudioCodecs() {
    return this.getSupportedCodecs().filter((codec) => AUDIO_CODECS.includes(codec));
  }
  /** Returns a list of subtitle codecs that this output format can contain. */
  getSupportedSubtitleCodecs() {
    return this.getSupportedCodecs().filter((codec) => SUBTITLE_CODECS.includes(codec));
  }
  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _codecUnsupportedHint(codec) {
    return "";
  }
};
var IsobmffOutputFormat2 = class extends OutputFormat {
  /** Internal constructor. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.fastStart !== void 0 && ![false, "in-memory", "reserve", "fragmented"].includes(options.fastStart)) {
      throw new TypeError(
        "options.fastStart, when provided, must be false, 'in-memory', 'reserve', or 'fragmented'."
      );
    }
    if (options.minimumFragmentDuration !== void 0 && (!Number.isFinite(options.minimumFragmentDuration) || options.minimumFragmentDuration < 0)) {
      throw new TypeError("options.minimumFragmentDuration, when provided, must be a non-negative number.");
    }
    if (options.onFtyp !== void 0 && typeof options.onFtyp !== "function") {
      throw new TypeError("options.onFtyp, when provided, must be a function.");
    }
    if (options.onMoov !== void 0 && typeof options.onMoov !== "function") {
      throw new TypeError("options.onMoov, when provided, must be a function.");
    }
    if (options.onMdat !== void 0 && typeof options.onMdat !== "function") {
      throw new TypeError("options.onMdat, when provided, must be a function.");
    }
    if (options.onMoof !== void 0 && typeof options.onMoof !== "function") {
      throw new TypeError("options.onMoof, when provided, must be a function.");
    }
    if (options.metadataFormat !== void 0 && !["mdir", "mdta", "udta", "auto"].includes(options.metadataFormat)) {
      throw new TypeError(
        "options.metadataFormat, when provided, must be either 'auto', 'mdir', 'mdta', or 'udta'."
      );
    }
    super();
    this._options = options;
  }
  getSupportedTrackCounts() {
    return {
      video: { min: 0, max: Infinity },
      audio: { min: 0, max: Infinity },
      subtitle: { min: 0, max: Infinity },
      total: { min: 1, max: 2 ** 32 - 1 }
      // Have fun reaching this one
    };
  }
  get supportsVideoRotationMetadata() {
    return true;
  }
  /** @internal */
  _createMuxer(output) {
    return new IsobmffMuxer2(output, this);
  }
};
var Mp4OutputFormat = class extends IsobmffOutputFormat2 {
  /** Creates a new {@link Mp4OutputFormat} configured with the specified `options`. */
  constructor(options) {
    super(options);
  }
  /** @internal */
  get _name() {
    return "MP4";
  }
  get fileExtension() {
    return ".mp4";
  }
  get mimeType() {
    return "video/mp4";
  }
  getSupportedCodecs() {
    return [
      ...VIDEO_CODECS,
      ...NON_PCM_AUDIO_CODECS,
      // These are supported via ISO/IEC 23003-5
      "pcm-s16",
      "pcm-s16be",
      "pcm-s24",
      "pcm-s24be",
      "pcm-s32",
      "pcm-s32be",
      "pcm-f32",
      "pcm-f32be",
      "pcm-f64",
      "pcm-f64be",
      // Only WebVTT subtitles are supported in MP4
      "webvtt"
    ];
  }
  /** @internal */
  _codecUnsupportedHint(codec) {
    if (new MovOutputFormat().getSupportedCodecs().includes(codec)) {
      return " Switching to MOV will grant support for this codec.";
    }
    return "";
  }
};
var MovOutputFormat = class extends IsobmffOutputFormat2 {
  /** Creates a new {@link MovOutputFormat} configured with the specified `options`. */
  constructor(options) {
    super(options);
  }
  /** @internal */
  get _name() {
    return "MOV";
  }
  get fileExtension() {
    return ".mov";
  }
  get mimeType() {
    return "video/quicktime";
  }
  getSupportedCodecs() {
    return [
      ...VIDEO_CODECS,
      ...AUDIO_CODECS,
      // Only WebVTT subtitles are supported in MOV
      "webvtt"
    ];
  }
  /** @internal */
  _codecUnsupportedHint(codec) {
    if (new Mp4OutputFormat().getSupportedCodecs().includes(codec)) {
      return " Switching to MP4 will grant support for this codec.";
    }
    return "";
  }
};
var MkvOutputFormat2 = class extends OutputFormat {
  /** Creates a new {@link MkvOutputFormat} configured with the specified `options`. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.appendOnly !== void 0 && typeof options.appendOnly !== "boolean") {
      throw new TypeError("options.appendOnly, when provided, must be a boolean.");
    }
    if (options.minimumClusterDuration !== void 0 && (!Number.isFinite(options.minimumClusterDuration) || options.minimumClusterDuration < 0)) {
      throw new TypeError("options.minimumClusterDuration, when provided, must be a non-negative number.");
    }
    if (options.onEbmlHeader !== void 0 && typeof options.onEbmlHeader !== "function") {
      throw new TypeError("options.onEbmlHeader, when provided, must be a function.");
    }
    if (options.onSegmentHeader !== void 0 && typeof options.onSegmentHeader !== "function") {
      throw new TypeError("options.onHeader, when provided, must be a function.");
    }
    if (options.onCluster !== void 0 && typeof options.onCluster !== "function") {
      throw new TypeError("options.onCluster, when provided, must be a function.");
    }
    super();
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new MatroskaMuxer(output, this);
  }
  /** @internal */
  get _name() {
    return "Matroska";
  }
  getSupportedTrackCounts() {
    return {
      video: { min: 0, max: Infinity },
      audio: { min: 0, max: Infinity },
      subtitle: { min: 0, max: Infinity },
      total: { min: 1, max: 127 }
    };
  }
  get fileExtension() {
    return ".mkv";
  }
  get mimeType() {
    return "video/x-matroska";
  }
  getSupportedCodecs() {
    return [
      ...VIDEO_CODECS,
      ...NON_PCM_AUDIO_CODECS,
      ...PCM_AUDIO_CODECS.filter((codec) => !["pcm-s8", "pcm-f32be", "pcm-f64be", "ulaw", "alaw"].includes(codec)),
      ...SUBTITLE_CODECS
    ];
  }
  get supportsVideoRotationMetadata() {
    return false;
  }
};
var WebMOutputFormat = class extends MkvOutputFormat2 {
  /** Creates a new {@link WebMOutputFormat} configured with the specified `options`. */
  constructor(options) {
    super(options);
  }
  getSupportedCodecs() {
    return [
      ...VIDEO_CODECS.filter((codec) => ["vp8", "vp9", "av1"].includes(codec)),
      ...AUDIO_CODECS.filter((codec) => ["opus", "vorbis"].includes(codec)),
      ...SUBTITLE_CODECS
    ];
  }
  /** @internal */
  get _name() {
    return "WebM";
  }
  get fileExtension() {
    return ".webm";
  }
  get mimeType() {
    return "video/webm";
  }
  /** @internal */
  _codecUnsupportedHint(codec) {
    if (new MkvOutputFormat2().getSupportedCodecs().includes(codec)) {
      return " Switching to MKV will grant support for this codec.";
    }
    return "";
  }
};
var Mp3OutputFormat = class extends OutputFormat {
  /** Creates a new {@link Mp3OutputFormat} configured with the specified `options`. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.xingHeader !== void 0 && typeof options.xingHeader !== "boolean") {
      throw new TypeError("options.xingHeader, when provided, must be a boolean.");
    }
    if (options.onXingFrame !== void 0 && typeof options.onXingFrame !== "function") {
      throw new TypeError("options.onXingFrame, when provided, must be a function.");
    }
    super();
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new Mp3Muxer(output, this);
  }
  /** @internal */
  get _name() {
    return "MP3";
  }
  getSupportedTrackCounts() {
    return {
      video: { min: 0, max: 0 },
      audio: { min: 1, max: 1 },
      subtitle: { min: 0, max: 0 },
      total: { min: 1, max: 1 }
    };
  }
  get fileExtension() {
    return ".mp3";
  }
  get mimeType() {
    return "audio/mpeg";
  }
  getSupportedCodecs() {
    return ["mp3"];
  }
  get supportsVideoRotationMetadata() {
    return false;
  }
};
var WavOutputFormat = class extends OutputFormat {
  /** Creates a new {@link WavOutputFormat} configured with the specified `options`. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.large !== void 0 && typeof options.large !== "boolean") {
      throw new TypeError("options.large, when provided, must be a boolean.");
    }
    if (options.metadataFormat !== void 0 && !["info", "id3"].includes(options.metadataFormat)) {
      throw new TypeError("options.metadataFormat, when provided, must be either 'info' or 'id3'.");
    }
    if (options.onHeader !== void 0 && typeof options.onHeader !== "function") {
      throw new TypeError("options.onHeader, when provided, must be a function.");
    }
    super();
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new WaveMuxer(output, this);
  }
  /** @internal */
  get _name() {
    return "WAVE";
  }
  getSupportedTrackCounts() {
    return {
      video: { min: 0, max: 0 },
      audio: { min: 1, max: 1 },
      subtitle: { min: 0, max: 0 },
      total: { min: 1, max: 1 }
    };
  }
  get fileExtension() {
    return ".wav";
  }
  get mimeType() {
    return "audio/wav";
  }
  getSupportedCodecs() {
    return [
      ...PCM_AUDIO_CODECS.filter(
        (codec) => ["pcm-s16", "pcm-s24", "pcm-s32", "pcm-f32", "pcm-u8", "ulaw", "alaw"].includes(codec)
      )
    ];
  }
  get supportsVideoRotationMetadata() {
    return false;
  }
};
var OggOutputFormat = class extends OutputFormat {
  /** Creates a new {@link OggOutputFormat} configured with the specified `options`. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.onPage !== void 0 && typeof options.onPage !== "function") {
      throw new TypeError("options.onPage, when provided, must be a function.");
    }
    super();
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new OggMuxer(output, this);
  }
  /** @internal */
  get _name() {
    return "Ogg";
  }
  getSupportedTrackCounts() {
    return {
      video: { min: 0, max: 0 },
      audio: { min: 0, max: Infinity },
      subtitle: { min: 0, max: 0 },
      total: { min: 1, max: 2 ** 32 }
    };
  }
  get fileExtension() {
    return ".ogg";
  }
  get mimeType() {
    return "application/ogg";
  }
  getSupportedCodecs() {
    return [
      ...AUDIO_CODECS.filter((codec) => ["vorbis", "opus"].includes(codec))
    ];
  }
  get supportsVideoRotationMetadata() {
    return false;
  }
};
var AdtsOutputFormat = class extends OutputFormat {
  /** Creates a new {@link AdtsOutputFormat} configured with the specified `options`. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.onFrame !== void 0 && typeof options.onFrame !== "function") {
      throw new TypeError("options.onFrame, when provided, must be a function.");
    }
    super();
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new AdtsMuxer(output, this);
  }
  /** @internal */
  get _name() {
    return "ADTS";
  }
  getSupportedTrackCounts() {
    return {
      video: { min: 0, max: 0 },
      audio: { min: 1, max: 1 },
      subtitle: { min: 0, max: 0 },
      total: { min: 1, max: 1 }
    };
  }
  get fileExtension() {
    return ".aac";
  }
  get mimeType() {
    return "audio/aac";
  }
  getSupportedCodecs() {
    return ["aac"];
  }
  get supportsVideoRotationMetadata() {
    return false;
  }
};
var AviOutputFormat = class extends OutputFormat {
  /** Creates a new {@link AviOutputFormat} configured with the specified `options`. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.large !== void 0 && typeof options.large !== "boolean") {
      throw new TypeError("options.large, when provided, must be a boolean.");
    }
    if (options.onHeader !== void 0 && typeof options.onHeader !== "function") {
      throw new TypeError("options.onHeader, when provided, must be a function.");
    }
    if (options.onIndex !== void 0 && typeof options.onIndex !== "function") {
      throw new TypeError("options.onIndex, when provided, must be a function.");
    }
    super();
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new AVIMuxer(output, this);
  }
  /** @internal */
  get _name() {
    return "AVI";
  }
  getSupportedTrackCounts() {
    return {
      video: { min: 0, max: Infinity },
      audio: { min: 0, max: Infinity },
      subtitle: { min: 0, max: 0 },
      total: { min: 1, max: 2 ** 32 - 1 }
    };
  }
  get fileExtension() {
    return ".avi";
  }
  get mimeType() {
    return "video/x-msvideo";
  }
  getSupportedCodecs() {
    return [
      ...VIDEO_CODECS.filter((codec) => ["avc", "hevc", "vp8", "vp9", "av1", "mpeg4"].includes(codec)),
      ...AUDIO_CODECS.filter(
        (codec) => ["mp3", "aac", "vorbis", "flac", "ac3", "pcm-s16", "pcm-s24", "pcm-s32", "pcm-f32", "pcm-u8", "ulaw", "alaw"].includes(codec)
      )
    ];
  }
  get supportsVideoRotationMetadata() {
    return false;
  }
};
var FlacOutputFormat = class extends OutputFormat {
  /** Creates a new {@link FlacOutputFormat} configured with the specified `options`. */
  constructor(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    super();
    this._options = options;
  }
  /** @internal */
  _createMuxer(output) {
    return new FlacMuxer(output, this);
  }
  /** @internal */
  get _name() {
    return "FLAC";
  }
  getSupportedTrackCounts() {
    return {
      video: { min: 0, max: 0 },
      audio: { min: 1, max: 1 },
      subtitle: { min: 0, max: 0 },
      total: { min: 1, max: 1 }
    };
  }
  get fileExtension() {
    return ".flac";
  }
  get mimeType() {
    return "audio/flac";
  }
  getSupportedCodecs() {
    return ["flac"];
  }
  get supportsVideoRotationMetadata() {
    return false;
  }
};

// src/media-source.ts
init_subtitles();

// src/encode.ts
var validateVideoEncodingConfig = (config) => {
  if (!config || typeof config !== "object") {
    throw new TypeError("Encoding config must be an object.");
  }
  if (!VIDEO_CODECS.includes(config.codec)) {
    throw new TypeError(`Invalid video codec '${config.codec}'. Must be one of: ${VIDEO_CODECS.join(", ")}.`);
  }
  if (!(config.bitrate instanceof Quality) && (!Number.isInteger(config.bitrate) || config.bitrate <= 0)) {
    throw new TypeError("config.bitrate must be a positive integer or a quality.");
  }
  if (config.keyFrameInterval !== void 0 && (!Number.isFinite(config.keyFrameInterval) || config.keyFrameInterval < 0)) {
    throw new TypeError("config.keyFrameInterval, when provided, must be a non-negative number.");
  }
  if (config.sizeChangeBehavior !== void 0 && !["deny", "passThrough", "fill", "contain", "cover"].includes(config.sizeChangeBehavior)) {
    throw new TypeError(
      "config.sizeChangeBehavior, when provided, must be 'deny', 'passThrough', 'fill', 'contain' or 'cover'."
    );
  }
  if (config.onEncodedPacket !== void 0 && typeof config.onEncodedPacket !== "function") {
    throw new TypeError("config.onEncodedChunk, when provided, must be a function.");
  }
  if (config.onEncoderConfig !== void 0 && typeof config.onEncoderConfig !== "function") {
    throw new TypeError("config.onEncoderConfig, when provided, must be a function.");
  }
  validateVideoEncodingAdditionalOptions(config.codec, config);
};
var validateVideoEncodingAdditionalOptions = (codec, options) => {
  if (!options || typeof options !== "object") {
    throw new TypeError("Encoding options must be an object.");
  }
  if (options.alpha !== void 0 && !["discard", "keep"].includes(options.alpha)) {
    throw new TypeError("options.alpha, when provided, must be 'discard' or 'keep'.");
  }
  if (options.bitrateMode !== void 0 && !["constant", "variable"].includes(options.bitrateMode)) {
    throw new TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
  }
  if (options.latencyMode !== void 0 && !["quality", "realtime"].includes(options.latencyMode)) {
    throw new TypeError("latencyMode, when provided, must be 'quality' or 'realtime'.");
  }
  if (options.fullCodecString !== void 0 && typeof options.fullCodecString !== "string") {
    throw new TypeError("fullCodecString, when provided, must be a string.");
  }
  if (options.fullCodecString !== void 0 && inferCodecFromCodecString(options.fullCodecString) !== codec) {
    throw new TypeError(
      `fullCodecString, when provided, must be a string that matches the specified codec (${codec}).`
    );
  }
  if (options.hardwareAcceleration !== void 0 && !["no-preference", "prefer-hardware", "prefer-software"].includes(options.hardwareAcceleration)) {
    throw new TypeError(
      "hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'."
    );
  }
  if (options.scalabilityMode !== void 0 && typeof options.scalabilityMode !== "string") {
    throw new TypeError("scalabilityMode, when provided, must be a string.");
  }
  if (options.contentHint !== void 0 && typeof options.contentHint !== "string") {
    throw new TypeError("contentHint, when provided, must be a string.");
  }
};
var buildVideoEncoderConfig = (options) => {
  const resolvedBitrate = options.bitrate instanceof Quality ? options.bitrate._toVideoBitrate(options.codec, options.width, options.height) : options.bitrate;
  return {
    codec: options.fullCodecString ?? buildVideoCodecString(
      options.codec,
      options.width,
      options.height,
      resolvedBitrate
    ),
    width: options.width,
    height: options.height,
    bitrate: resolvedBitrate,
    bitrateMode: options.bitrateMode,
    alpha: options.alpha ?? "discard",
    framerate: options.framerate,
    latencyMode: options.latencyMode,
    hardwareAcceleration: options.hardwareAcceleration,
    scalabilityMode: options.scalabilityMode,
    contentHint: options.contentHint,
    ...getVideoEncoderConfigExtension(options.codec)
  };
};
var validateAudioEncodingConfig = (config) => {
  if (!config || typeof config !== "object") {
    throw new TypeError("Encoding config must be an object.");
  }
  if (!AUDIO_CODECS.includes(config.codec)) {
    throw new TypeError(`Invalid audio codec '${config.codec}'. Must be one of: ${AUDIO_CODECS.join(", ")}.`);
  }
  if (config.bitrate === void 0 && (!PCM_AUDIO_CODECS.includes(config.codec) || config.codec === "flac")) {
    throw new TypeError("config.bitrate must be provided for compressed audio codecs.");
  }
  if (config.bitrate !== void 0 && !(config.bitrate instanceof Quality) && (!Number.isInteger(config.bitrate) || config.bitrate <= 0)) {
    throw new TypeError("config.bitrate, when provided, must be a positive integer or a quality.");
  }
  if (config.onEncodedPacket !== void 0 && typeof config.onEncodedPacket !== "function") {
    throw new TypeError("config.onEncodedChunk, when provided, must be a function.");
  }
  if (config.onEncoderConfig !== void 0 && typeof config.onEncoderConfig !== "function") {
    throw new TypeError("config.onEncoderConfig, when provided, must be a function.");
  }
  validateAudioEncodingAdditionalOptions(config.codec, config);
};
var validateAudioEncodingAdditionalOptions = (codec, options) => {
  if (!options || typeof options !== "object") {
    throw new TypeError("Encoding options must be an object.");
  }
  if (options.bitrateMode !== void 0 && !["constant", "variable"].includes(options.bitrateMode)) {
    throw new TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
  }
  if (options.fullCodecString !== void 0 && typeof options.fullCodecString !== "string") {
    throw new TypeError("fullCodecString, when provided, must be a string.");
  }
  if (options.fullCodecString !== void 0 && inferCodecFromCodecString(options.fullCodecString) !== codec) {
    throw new TypeError(
      `fullCodecString, when provided, must be a string that matches the specified codec (${codec}).`
    );
  }
};
var buildAudioEncoderConfig = (options) => {
  const resolvedBitrate = options.bitrate instanceof Quality ? options.bitrate._toAudioBitrate(options.codec) : options.bitrate;
  return {
    codec: options.fullCodecString ?? buildAudioCodecString(
      options.codec,
      options.numberOfChannels,
      options.sampleRate
    ),
    numberOfChannels: options.numberOfChannels,
    sampleRate: options.sampleRate,
    bitrate: resolvedBitrate,
    bitrateMode: options.bitrateMode,
    ...getAudioEncoderConfigExtension(options.codec)
  };
};
var Quality = class {
  /** @internal */
  constructor(factor) {
    this._factor = factor;
  }
  /** @internal */
  _toVideoBitrate(codec, width, height) {
    const pixels = width * height;
    const codecEfficiencyFactors = {
      avc: 1,
      // H.264/AVC (baseline)
      hevc: 0.6,
      // H.265/HEVC (~40% more efficient than AVC)
      vp9: 0.6,
      // Similar to HEVC
      av1: 0.4,
      // ~60% more efficient than AVC
      vp8: 1.2,
      // Slightly less efficient than AVC
      mpeg4: 1.5
      // Less efficient than AVC
    };
    const referencePixels = 1920 * 1080;
    const referenceBitrate = 3e6;
    const scaleFactor = Math.pow(pixels / referencePixels, 0.95);
    const baseBitrate = referenceBitrate * scaleFactor;
    const codecAdjustedBitrate = baseBitrate * codecEfficiencyFactors[codec];
    const finalBitrate = codecAdjustedBitrate * this._factor;
    return Math.ceil(finalBitrate / 1e3) * 1e3;
  }
  /** @internal */
  _toAudioBitrate(codec) {
    if (PCM_AUDIO_CODECS.includes(codec) || codec === "flac") {
      return void 0;
    }
    const baseRates = {
      aac: 128e3,
      // 128kbps base for AAC
      opus: 64e3,
      // 64kbps base for Opus
      mp3: 16e4,
      // 160kbps base for MP3
      vorbis: 64e3,
      // 64kbps base for Vorbis
      ac3: 64e4,
      // 640kbps base for AC-3 (Dolby Digital)
      eac3: 256e3
      // 256kbps base for E-AC-3 (Dolby Digital Plus)
    };
    const baseBitrate = baseRates[codec];
    if (!baseBitrate) {
      throw new Error(`Unhandled codec: ${codec}`);
    }
    let finalBitrate = baseBitrate * this._factor;
    if (codec === "aac") {
      const validRates = [96e3, 128e3, 16e4, 192e3];
      finalBitrate = validRates.reduce(
        (prev, curr) => Math.abs(curr - finalBitrate) < Math.abs(prev - finalBitrate) ? curr : prev
      );
    } else if (codec === "opus" || codec === "vorbis") {
      finalBitrate = Math.max(6e3, finalBitrate);
    } else if (codec === "mp3") {
      const validRates = [
        8e3,
        16e3,
        24e3,
        32e3,
        4e4,
        48e3,
        64e3,
        8e4,
        96e3,
        112e3,
        128e3,
        16e4,
        192e3,
        224e3,
        256e3,
        32e4
      ];
      finalBitrate = validRates.reduce(
        (prev, curr) => Math.abs(curr - finalBitrate) < Math.abs(prev - finalBitrate) ? curr : prev
      );
    }
    return Math.round(finalBitrate / 1e3) * 1e3;
  }
};
var QUALITY_VERY_LOW = new Quality(0.3);
var QUALITY_LOW = new Quality(0.6);
var QUALITY_MEDIUM = new Quality(1);
var QUALITY_HIGH = new Quality(2);
var QUALITY_VERY_HIGH = new Quality(4);
var canEncode = (codec) => {
  if (VIDEO_CODECS.includes(codec)) {
    return canEncodeVideo(codec);
  } else if (AUDIO_CODECS.includes(codec)) {
    return canEncodeAudio(codec);
  } else if (SUBTITLE_CODECS.includes(codec)) {
    return canEncodeSubtitles(codec);
  }
  throw new TypeError(`Unknown codec '${codec}'.`);
};
var canEncodeVideo = async (codec, options = {}) => {
  const {
    width = 1280,
    height = 720,
    bitrate = 1e6,
    ...restOptions
  } = options;
  if (!VIDEO_CODECS.includes(codec)) {
    return false;
  }
  if (!Number.isInteger(width) || width <= 0) {
    throw new TypeError("width must be a positive integer.");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new TypeError("height must be a positive integer.");
  }
  if (!(bitrate instanceof Quality) && (!Number.isInteger(bitrate) || bitrate <= 0)) {
    throw new TypeError("bitrate must be a positive integer or a quality.");
  }
  validateVideoEncodingAdditionalOptions(codec, restOptions);
  let encoderConfig = null;
  if (customVideoEncoders.length > 0) {
    encoderConfig ??= buildVideoEncoderConfig({
      codec,
      width,
      height,
      bitrate,
      framerate: void 0,
      ...restOptions
    });
    if (customVideoEncoders.some((x) => x.supports(codec, encoderConfig))) {
      return true;
    }
  }
  if (typeof VideoEncoder === "undefined") {
    return false;
  }
  const hasOddDimension = width % 2 === 1 || height % 2 === 1;
  if (hasOddDimension && (codec === "avc" || codec === "hevc")) {
    return false;
  }
  encoderConfig ??= buildVideoEncoderConfig({
    codec,
    width,
    height,
    bitrate,
    framerate: void 0,
    ...restOptions,
    alpha: "discard"
    // Since we handle alpha ourselves
  });
  const support = await VideoEncoder.isConfigSupported(encoderConfig);
  return support.supported === true;
};
var canEncodeAudio = async (codec, options = {}) => {
  const {
    numberOfChannels = 2,
    sampleRate = 48e3,
    bitrate = 128e3,
    ...restOptions
  } = options;
  if (!AUDIO_CODECS.includes(codec)) {
    return false;
  }
  if (!Number.isInteger(numberOfChannels) || numberOfChannels <= 0) {
    throw new TypeError("numberOfChannels must be a positive integer.");
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new TypeError("sampleRate must be a positive integer.");
  }
  if (!(bitrate instanceof Quality) && (!Number.isInteger(bitrate) || bitrate <= 0)) {
    throw new TypeError("bitrate must be a positive integer.");
  }
  validateAudioEncodingAdditionalOptions(codec, restOptions);
  let encoderConfig = null;
  if (customAudioEncoders.length > 0) {
    encoderConfig ??= buildAudioEncoderConfig({
      codec,
      numberOfChannels,
      sampleRate,
      bitrate,
      ...restOptions
    });
    if (customAudioEncoders.some((x) => x.supports(codec, encoderConfig))) {
      return true;
    }
  }
  if (PCM_AUDIO_CODECS.includes(codec)) {
    return true;
  }
  if (typeof AudioEncoder === "undefined") {
    return false;
  }
  encoderConfig ??= buildAudioEncoderConfig({
    codec,
    numberOfChannels,
    sampleRate,
    bitrate,
    ...restOptions
  });
  const support = await AudioEncoder.isConfigSupported(encoderConfig);
  return support.supported === true;
};
var canEncodeSubtitles = async (codec) => {
  if (!SUBTITLE_CODECS.includes(codec)) {
    return false;
  }
  return true;
};
var getEncodableCodecs = async () => {
  const [videoCodecs, audioCodecs, subtitleCodecs] = await Promise.all([
    getEncodableVideoCodecs(),
    getEncodableAudioCodecs(),
    getEncodableSubtitleCodecs()
  ]);
  return [...videoCodecs, ...audioCodecs, ...subtitleCodecs];
};
var getEncodableVideoCodecs = async (checkedCodecs = VIDEO_CODECS, options) => {
  const bools = await Promise.all(checkedCodecs.map((codec) => canEncodeVideo(codec, options)));
  return checkedCodecs.filter((_, i) => bools[i]);
};
var getEncodableAudioCodecs = async (checkedCodecs = AUDIO_CODECS, options) => {
  const bools = await Promise.all(checkedCodecs.map((codec) => canEncodeAudio(codec, options)));
  return checkedCodecs.filter((_, i) => bools[i]);
};
var getEncodableSubtitleCodecs = async (checkedCodecs = SUBTITLE_CODECS) => {
  const bools = await Promise.all(checkedCodecs.map(canEncodeSubtitles));
  return checkedCodecs.filter((_, i) => bools[i]);
};
var getFirstEncodableVideoCodec = async (checkedCodecs, options) => {
  for (const codec of checkedCodecs) {
    if (await canEncodeVideo(codec, options)) {
      return codec;
    }
  }
  return null;
};
var getFirstEncodableAudioCodec = async (checkedCodecs, options) => {
  for (const codec of checkedCodecs) {
    if (await canEncodeAudio(codec, options)) {
      return codec;
    }
  }
  return null;
};
var getFirstEncodableSubtitleCodec = async (checkedCodecs) => {
  for (const codec of checkedCodecs) {
    if (await canEncodeSubtitles(codec)) {
      return codec;
    }
  }
  return null;
};

// src/media-source.ts
var MediaSource = class {
  constructor() {
    /** @internal */
    this._connectedTrack = null;
    /** @internal */
    this._closingPromise = null;
    /** @internal */
    this._closed = false;
    /**
     * @internal
     * A time offset in seconds that is added to all timestamps generated by this source.
     */
    this._timestampOffset = 0;
  }
  /** @internal */
  _ensureValidAdd() {
    if (!this._connectedTrack) {
      throw new Error("Source is not connected to an output track.");
    }
    if (this._connectedTrack.output.state === "canceled") {
      throw new Error("Output has been canceled.");
    }
    if (this._connectedTrack.output.state === "finalizing" || this._connectedTrack.output.state === "finalized") {
      throw new Error("Output has been finalized.");
    }
    if (this._connectedTrack.output.state === "pending") {
      throw new Error("Output has not started.");
    }
    if (this._closed) {
      throw new Error("Source is closed.");
    }
  }
  /** @internal */
  async _start() {
  }
  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _flushAndClose(forceClose) {
  }
  /**
   * Closes this source. This prevents future samples from being added and signals to the output file that no further
   * samples will come in for this track. Calling `.close()` is optional but recommended after adding the
   * last sample - for improved performance and reduced memory usage.
   */
  close() {
    if (this._closingPromise) {
      return;
    }
    const connectedTrack = this._connectedTrack;
    if (!connectedTrack) {
      throw new Error("Cannot call close without connecting the source to an output track.");
    }
    if (connectedTrack.output.state === "pending") {
      throw new Error("Cannot call close before output has been started.");
    }
    this._closingPromise = (async () => {
      await this._flushAndClose(false);
      this._closed = true;
      if (connectedTrack.output.state === "finalizing" || connectedTrack.output.state === "finalized") {
        return;
      }
      connectedTrack.output._muxer.onTrackClose(connectedTrack);
    })();
  }
  /** @internal */
  async _flushOrWaitForOngoingClose(forceClose) {
    if (this._closingPromise) {
      return this._closingPromise;
    } else {
      return this._flushAndClose(forceClose);
    }
  }
};
var VideoSource = class extends MediaSource {
  /** Internal constructor. */
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
var EncodedVideoPacketSource = class extends VideoSource {
  /** Creates a new {@link EncodedVideoPacketSource} whose packets are encoded using `codec`. */
  constructor(codec) {
    super(codec);
  }
  /**
   * Adds an encoded packet to the output video track. Packets must be added in *decode order*, while a packet's
   * timestamp must be its *presentation timestamp*. B-frames are handled automatically.
   *
   * @param meta - Additional metadata from the encoder. You should pass this for the first call, including a valid
   * decoder config.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(packet, meta) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (packet.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be added.");
    }
    if (meta !== void 0 && (!meta || typeof meta !== "object")) {
      throw new TypeError("meta, when provided, must be an object.");
    }
    this._ensureValidAdd();
    return this._connectedTrack.output._muxer.addEncodedVideoPacket(this._connectedTrack, packet, meta);
  }
};
var VideoEncoderWrapper = class {
  constructor(source, encodingConfig) {
    this.source = source;
    this.encodingConfig = encodingConfig;
    this.ensureEncoderPromise = null;
    this.encoderInitialized = false;
    this.encoder = null;
    this.muxer = null;
    this.lastMultipleOfKeyFrameInterval = -1;
    this.codedWidth = null;
    this.codedHeight = null;
    this.resizeCanvas = null;
    this.customEncoder = null;
    this.customEncoderCallSerializer = new CallSerializer();
    this.customEncoderQueueSize = 0;
    // Alpha stuff
    this.alphaEncoder = null;
    this.splitter = null;
    this.splitterCreationFailed = false;
    this.alphaFrameQueue = [];
    /**
     * Encoders typically throw their errors "out of band", meaning asynchronously in some other execution context.
     * However, we want to surface these errors to the user within the normal control flow, so they don't go uncaught.
     * So, we keep track of the encoder error and throw it as soon as we get the chance.
     */
    this.error = null;
    this.errorNeedsNewStack = true;
  }
  async add(videoSample, shouldClose, encodeOptions) {
    try {
      this.checkForEncoderError();
      this.source._ensureValidAdd();
      if (this.codedWidth !== null && this.codedHeight !== null) {
        if (videoSample.codedWidth !== this.codedWidth || videoSample.codedHeight !== this.codedHeight) {
          const sizeChangeBehavior = this.encodingConfig.sizeChangeBehavior ?? "deny";
          if (sizeChangeBehavior === "passThrough") {
          } else if (sizeChangeBehavior === "deny") {
            throw new Error(
              `Video sample size must remain constant. Expected ${this.codedWidth}x${this.codedHeight}, got ${videoSample.codedWidth}x${videoSample.codedHeight}. To allow the sample size to change over time, set \`sizeChangeBehavior\` to a value other than 'strict' in the encoding options.`
            );
          } else {
            let canvasIsNew = false;
            if (!this.resizeCanvas) {
              if (typeof document !== "undefined") {
                this.resizeCanvas = document.createElement("canvas");
                this.resizeCanvas.width = this.codedWidth;
                this.resizeCanvas.height = this.codedHeight;
              } else {
                this.resizeCanvas = new OffscreenCanvas(this.codedWidth, this.codedHeight);
              }
              canvasIsNew = true;
            }
            const context = this.resizeCanvas.getContext("2d", {
              alpha: isFirefox()
              // Firefox has VideoFrame glitches with opaque canvases
            });
            assert(context);
            if (!canvasIsNew) {
              if (isFirefox()) {
                context.fillStyle = "black";
                context.fillRect(0, 0, this.codedWidth, this.codedHeight);
              } else {
                context.clearRect(0, 0, this.codedWidth, this.codedHeight);
              }
            }
            videoSample.drawWithFit(context, { fit: sizeChangeBehavior });
            if (shouldClose) {
              videoSample.close();
            }
            videoSample = new VideoSample(this.resizeCanvas, {
              timestamp: videoSample.timestamp,
              duration: videoSample.duration,
              rotation: videoSample.rotation
            });
            shouldClose = true;
          }
        }
      } else {
        this.codedWidth = videoSample.codedWidth;
        this.codedHeight = videoSample.codedHeight;
      }
      if (!this.encoderInitialized) {
        if (!this.ensureEncoderPromise) {
          this.ensureEncoder(videoSample);
        }
        if (!this.encoderInitialized) {
          await this.ensureEncoderPromise;
        }
      }
      assert(this.encoderInitialized);
      const keyFrameInterval = this.encodingConfig.keyFrameInterval ?? 5;
      const multipleOfKeyFrameInterval = Math.floor(videoSample.timestamp / keyFrameInterval);
      const finalEncodeOptions = {
        ...encodeOptions,
        keyFrame: encodeOptions?.keyFrame || keyFrameInterval === 0 || multipleOfKeyFrameInterval !== this.lastMultipleOfKeyFrameInterval
      };
      this.lastMultipleOfKeyFrameInterval = multipleOfKeyFrameInterval;
      if (this.customEncoder) {
        this.customEncoderQueueSize++;
        const clonedSample = videoSample.clone();
        const promise = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(clonedSample, finalEncodeOptions)).then(() => this.customEncoderQueueSize--).catch((error) => this.error ??= error).finally(() => {
          clonedSample.close();
        });
        if (this.customEncoderQueueSize >= 4) {
          await promise;
        }
      } else {
        assert(this.encoder);
        const videoFrame = videoSample.toVideoFrame();
        if (!this.alphaEncoder) {
          this.encoder.encode(videoFrame, finalEncodeOptions);
          videoFrame.close();
        } else {
          const frameDefinitelyHasNoAlpha = !!videoFrame.format && !videoFrame.format.includes("A");
          if (frameDefinitelyHasNoAlpha || this.splitterCreationFailed) {
            this.alphaFrameQueue.push(null);
            this.encoder.encode(videoFrame, finalEncodeOptions);
            videoFrame.close();
          } else {
            const width = videoFrame.displayWidth;
            const height = videoFrame.displayHeight;
            if (!this.splitter) {
              try {
                this.splitter = new ColorAlphaSplitter(width, height);
              } catch (error) {
                console.error("Due to an error, only color data will be encoded.", error);
                this.splitterCreationFailed = true;
                this.alphaFrameQueue.push(null);
                this.encoder.encode(videoFrame, finalEncodeOptions);
                videoFrame.close();
              }
            }
            if (this.splitter) {
              const colorFrame = this.splitter.extractColor(videoFrame);
              const alphaFrame = this.splitter.extractAlpha(videoFrame);
              this.alphaFrameQueue.push(alphaFrame);
              this.encoder.encode(colorFrame, finalEncodeOptions);
              colorFrame.close();
              videoFrame.close();
            }
          }
        }
        if (shouldClose) {
          videoSample.close();
        }
        if (this.encoder.encodeQueueSize >= 4) {
          await new Promise((resolve) => this.encoder.addEventListener("dequeue", resolve, { once: true }));
        }
      }
      await this.muxer.mutex.currentPromise;
    } finally {
      if (shouldClose) {
        videoSample.close();
      }
    }
  }
  ensureEncoder(videoSample) {
    const encoderError = new Error();
    this.ensureEncoderPromise = (async () => {
      const encoderConfig = buildVideoEncoderConfig({
        width: videoSample.codedWidth,
        height: videoSample.codedHeight,
        ...this.encodingConfig,
        framerate: this.source._connectedTrack?.metadata.frameRate
      });
      this.encodingConfig.onEncoderConfig?.(encoderConfig);
      const MatchingCustomEncoder = customVideoEncoders.find((x) => x.supports(
        this.encodingConfig.codec,
        encoderConfig
      ));
      if (MatchingCustomEncoder) {
        this.customEncoder = new MatchingCustomEncoder();
        this.customEncoder.codec = this.encodingConfig.codec;
        this.customEncoder.config = encoderConfig;
        this.customEncoder.onPacket = (packet, meta) => {
          if (!(packet instanceof EncodedPacket)) {
            throw new TypeError("The first argument passed to onPacket must be an EncodedPacket.");
          }
          if (meta !== void 0 && (!meta || typeof meta !== "object")) {
            throw new TypeError("The second argument passed to onPacket must be an object or undefined.");
          }
          this.encodingConfig.onEncodedPacket?.(packet, meta);
          void this.muxer.addEncodedVideoPacket(this.source._connectedTrack, packet, meta).catch((error) => {
            this.error ??= error;
            this.errorNeedsNewStack = false;
          });
        };
        await this.customEncoder.init();
      } else {
        if (typeof VideoEncoder === "undefined") {
          throw new Error("VideoEncoder is not supported by this browser.");
        }
        encoderConfig.alpha = "discard";
        if (this.encodingConfig.alpha === "keep") {
          encoderConfig.latencyMode = "quality";
        }
        const hasOddDimension = encoderConfig.width % 2 === 1 || encoderConfig.height % 2 === 1;
        if (hasOddDimension && (this.encodingConfig.codec === "avc" || this.encodingConfig.codec === "hevc")) {
          throw new Error(
            `The dimensions ${encoderConfig.width}x${encoderConfig.height} are not supported for codec '${this.encodingConfig.codec}'; both width and height must be even numbers. Make sure to round your dimensions to the nearest even number.`
          );
        }
        const support = await VideoEncoder.isConfigSupported(encoderConfig);
        if (!support.supported) {
          throw new Error(
            `This specific encoder configuration (${encoderConfig.codec}, ${encoderConfig.bitrate} bps, ${encoderConfig.width}x${encoderConfig.height}, hardware acceleration: ${encoderConfig.hardwareAcceleration ?? "no-preference"}) is not supported by this browser. Consider using another codec or changing your video parameters.`
          );
        }
        const colorChunkQueue = [];
        const nullAlphaChunkQueue = [];
        let encodedAlphaChunkCount = 0;
        let alphaEncoderQueue = 0;
        const addPacket = (colorChunk, alphaChunk, meta) => {
          const sideData = {};
          if (alphaChunk) {
            const alphaData = new Uint8Array(alphaChunk.byteLength);
            alphaChunk.copyTo(alphaData);
            sideData.alpha = alphaData;
          }
          const packet = EncodedPacket.fromEncodedChunk(colorChunk, sideData);
          this.encodingConfig.onEncodedPacket?.(packet, meta);
          void this.muxer.addEncodedVideoPacket(this.source._connectedTrack, packet, meta).catch((error) => {
            this.error ??= error;
            this.errorNeedsNewStack = false;
          });
        };
        this.encoder = new VideoEncoder({
          output: (chunk, meta) => {
            if (!this.alphaEncoder) {
              addPacket(chunk, null, meta);
              return;
            }
            const alphaFrame = this.alphaFrameQueue.shift();
            assert(alphaFrame !== void 0);
            if (alphaFrame) {
              this.alphaEncoder.encode(alphaFrame, {
                // Crucial: The alpha frame is forced to be a key frame whenever the color frame
                // also is. Without this, playback can glitch and even crash in some browsers.
                // This is the reason why the two encoders are wired in series and not in parallel.
                keyFrame: chunk.type === "key"
              });
              alphaEncoderQueue++;
              alphaFrame.close();
              colorChunkQueue.push({ chunk, meta });
            } else {
              if (alphaEncoderQueue === 0) {
                addPacket(chunk, null, meta);
              } else {
                nullAlphaChunkQueue.push(encodedAlphaChunkCount + alphaEncoderQueue);
                colorChunkQueue.push({ chunk, meta });
              }
            }
          },
          error: (error) => {
            error.stack = encoderError.stack;
            this.error ??= error;
          }
        });
        this.encoder.configure(encoderConfig);
        if (this.encodingConfig.alpha === "keep") {
          this.alphaEncoder = new VideoEncoder({
            // We ignore the alpha chunk's metadata
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            output: (chunk, meta) => {
              alphaEncoderQueue--;
              const colorChunk = colorChunkQueue.shift();
              assert(colorChunk !== void 0);
              addPacket(colorChunk.chunk, chunk, colorChunk.meta);
              encodedAlphaChunkCount++;
              while (nullAlphaChunkQueue.length > 0 && nullAlphaChunkQueue[0] === encodedAlphaChunkCount) {
                nullAlphaChunkQueue.shift();
                const colorChunk2 = colorChunkQueue.shift();
                assert(colorChunk2 !== void 0);
                addPacket(colorChunk2.chunk, null, colorChunk2.meta);
              }
            },
            error: (error) => {
              error.stack = encoderError.stack;
              this.error ??= error;
            }
          });
          this.alphaEncoder.configure(encoderConfig);
        }
      }
      assert(this.source._connectedTrack);
      this.muxer = this.source._connectedTrack.output._muxer;
      this.encoderInitialized = true;
    })();
  }
  async flushAndClose(forceClose) {
    if (!forceClose) this.checkForEncoderError();
    if (this.customEncoder) {
      if (!forceClose) {
        void this.customEncoderCallSerializer.call(() => this.customEncoder.flush());
      }
      await this.customEncoderCallSerializer.call(() => this.customEncoder.close());
    } else if (this.encoder) {
      if (!forceClose) {
        await this.encoder.flush();
        await this.alphaEncoder?.flush();
      }
      if (this.encoder.state !== "closed") {
        this.encoder.close();
      }
      if (this.alphaEncoder && this.alphaEncoder.state !== "closed") {
        this.alphaEncoder.close();
      }
      this.alphaFrameQueue.forEach((x) => x?.close());
      this.splitter?.close();
    }
    if (!forceClose) this.checkForEncoderError();
  }
  getQueueSize() {
    if (this.customEncoder) {
      return this.customEncoderQueueSize;
    } else {
      return this.encoder?.encodeQueueSize ?? 0;
    }
  }
  checkForEncoderError() {
    if (this.error) {
      if (this.errorNeedsNewStack) {
        this.error.stack = new Error().stack;
      }
      throw this.error;
    }
  }
};
var ColorAlphaSplitter = class {
  constructor(initialWidth, initialHeight) {
    this.lastFrame = null;
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(initialWidth, initialHeight);
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.width = initialWidth;
      this.canvas.height = initialHeight;
    }
    const gl = this.canvas.getContext("webgl2", {
      alpha: true
      // Needed due to the YUV thing we do for alpha
    });
    if (!gl) {
      throw new Error("Couldn't acquire WebGL 2 context.");
    }
    this.gl = gl;
    this.colorProgram = this.createColorProgram();
    this.alphaProgram = this.createAlphaProgram();
    this.vao = this.createVAO();
    this.sourceTexture = this.createTexture();
    this.alphaResolutionLocation = this.gl.getUniformLocation(this.alphaProgram, "u_resolution");
    this.gl.useProgram(this.colorProgram);
    this.gl.uniform1i(this.gl.getUniformLocation(this.colorProgram, "u_sourceTexture"), 0);
    this.gl.useProgram(this.alphaProgram);
    this.gl.uniform1i(this.gl.getUniformLocation(this.alphaProgram, "u_sourceTexture"), 0);
  }
  createVertexShader() {
    return this.createShader(this.gl.VERTEX_SHADER, `#version 300 es
			in vec2 a_position;
			in vec2 a_texCoord;
			out vec2 v_texCoord;
			
			void main() {
				gl_Position = vec4(a_position, 0.0, 1.0);
				v_texCoord = a_texCoord;
			}
		`);
  }
  createColorProgram() {
    const vertexShader = this.createVertexShader();
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, `#version 300 es
			precision highp float;
			
			uniform sampler2D u_sourceTexture;
			in vec2 v_texCoord;
			out vec4 fragColor;
			
			void main() {
				vec4 source = texture(u_sourceTexture, v_texCoord);
				fragColor = vec4(source.rgb, 1.0);
			}
		`);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    return program;
  }
  createAlphaProgram() {
    const vertexShader = this.createVertexShader();
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, `#version 300 es
			precision highp float;
			
			uniform sampler2D u_sourceTexture;
			uniform vec2 u_resolution; // The width and height of the canvas
			in vec2 v_texCoord;
			out vec4 fragColor;

			// This function determines the value for a single byte in the YUV stream
			float getByteValue(float byteOffset) {
				float width = u_resolution.x;
				float height = u_resolution.y;

				float yPlaneSize = width * height;

				if (byteOffset < yPlaneSize) {
					// This byte is in the luma plane. Find the corresponding pixel coordinates to sample from
					float y = floor(byteOffset / width);
					float x = mod(byteOffset, width);
					
					// Add 0.5 to sample the center of the texel
					vec2 sampleCoord = (vec2(x, y) + 0.5) / u_resolution;
					
					// The luma value is the alpha from the source texture
					return texture(u_sourceTexture, sampleCoord).a;
				} else {
					// Write a fixed value for chroma and beyond
					return 128.0 / 255.0;
				}
			}
			
			void main() {
				// Each fragment writes 4 bytes (R, G, B, A)
				float pixelIndex = floor(gl_FragCoord.y) * u_resolution.x + floor(gl_FragCoord.x);
				float baseByteOffset = pixelIndex * 4.0;

				vec4 result;
				for (int i = 0; i < 4; i++) {
					float currentByteOffset = baseByteOffset + float(i);
					result[i] = getByteValue(currentByteOffset);
				}
				
				fragColor = result;
			}
		`);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    return program;
  }
  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", this.gl.getShaderInfoLog(shader));
    }
    return shader;
  }
  createVAO() {
    const vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(vao);
    const vertices = new Float32Array([
      -1,
      -1,
      0,
      1,
      1,
      -1,
      1,
      1,
      -1,
      1,
      0,
      0,
      1,
      1,
      1,
      0
    ]);
    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    const positionLocation = this.gl.getAttribLocation(this.colorProgram, "a_position");
    const texCoordLocation = this.gl.getAttribLocation(this.colorProgram, "a_texCoord");
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(texCoordLocation);
    this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 16, 8);
    return vao;
  }
  createTexture() {
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    return texture;
  }
  updateTexture(sourceFrame) {
    if (this.lastFrame === sourceFrame) {
      return;
    }
    if (sourceFrame.displayWidth !== this.canvas.width || sourceFrame.displayHeight !== this.canvas.height) {
      this.canvas.width = sourceFrame.displayWidth;
      this.canvas.height = sourceFrame.displayHeight;
    }
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, sourceFrame);
    this.lastFrame = sourceFrame;
  }
  extractColor(sourceFrame) {
    this.updateTexture(sourceFrame);
    this.gl.useProgram(this.colorProgram);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    return new VideoFrame(this.canvas, {
      timestamp: sourceFrame.timestamp,
      duration: sourceFrame.duration ?? void 0,
      alpha: "discard"
    });
  }
  extractAlpha(sourceFrame) {
    this.updateTexture(sourceFrame);
    this.gl.useProgram(this.alphaProgram);
    this.gl.uniform2f(this.alphaResolutionLocation, this.canvas.width, this.canvas.height);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    const { width, height } = this.canvas;
    const chromaSamples = Math.ceil(width / 2) * Math.ceil(height / 2);
    const yuvSize = width * height + chromaSamples * 2;
    const requiredHeight = Math.ceil(yuvSize / (width * 4));
    let yuv = new Uint8Array(4 * width * requiredHeight);
    this.gl.readPixels(0, 0, width, requiredHeight, this.gl.RGBA, this.gl.UNSIGNED_BYTE, yuv);
    yuv = yuv.subarray(0, yuvSize);
    assert(yuv[width * height] === 128);
    assert(yuv[yuv.length - 1] === 128);
    const init = {
      format: "I420",
      codedWidth: width,
      codedHeight: height,
      timestamp: sourceFrame.timestamp,
      duration: sourceFrame.duration ?? void 0,
      transfer: [yuv.buffer]
    };
    return new VideoFrame(yuv, init);
  }
  close() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
  }
};
var VideoSampleSource = class extends VideoSource {
  /**
   * Creates a new {@link VideoSampleSource} whose samples are encoded according to the specified
   * {@link VideoEncodingConfig}.
   */
  constructor(encodingConfig) {
    validateVideoEncodingConfig(encodingConfig);
    super(encodingConfig.codec);
    this._encoder = new VideoEncoderWrapper(this, encodingConfig);
  }
  /**
   * Encodes a video sample (frame) and then adds it to the output.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(videoSample, encodeOptions) {
    if (!(videoSample instanceof VideoSample)) {
      throw new TypeError("videoSample must be a VideoSample.");
    }
    return this._encoder.add(videoSample, false, encodeOptions);
  }
  /** @internal */
  _flushAndClose(forceClose) {
    return this._encoder.flushAndClose(forceClose);
  }
};
var CanvasSource = class extends VideoSource {
  /**
   * Creates a new {@link CanvasSource} from a canvas element or `OffscreenCanvas` whose samples are encoded
   * according to the specified {@link VideoEncodingConfig}.
   */
  constructor(canvas, encodingConfig) {
    if (!(typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) && !(typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas)) {
      throw new TypeError("canvas must be an HTMLCanvasElement or OffscreenCanvas.");
    }
    validateVideoEncodingConfig(encodingConfig);
    super(encodingConfig.codec);
    this._encoder = new VideoEncoderWrapper(this, encodingConfig);
    this._canvas = canvas;
  }
  /**
   * Captures the current canvas state as a video sample (frame), encodes it and adds it to the output.
   *
   * @param timestamp - The timestamp of the sample, in seconds.
   * @param duration - The duration of the sample, in seconds.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(timestamp, duration = 0, encodeOptions) {
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new TypeError("timestamp must be a non-negative number.");
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("duration must be a non-negative number.");
    }
    const sample = new VideoSample(this._canvas, { timestamp, duration });
    return this._encoder.add(sample, true, encodeOptions);
  }
  /** @internal */
  _flushAndClose(forceClose) {
    return this._encoder.flushAndClose(forceClose);
  }
};
var MediaStreamVideoTrackSource = class extends VideoSource {
  /**
   * Creates a new {@link MediaStreamVideoTrackSource} from a
   * [`MediaStreamVideoTrack`](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack), which will pull
   * video samples from the stream in real time and encode them according to {@link VideoEncodingConfig}.
   */
  constructor(track, encodingConfig) {
    if (!(track instanceof MediaStreamTrack) || track.kind !== "video") {
      throw new TypeError("track must be a video MediaStreamTrack.");
    }
    validateVideoEncodingConfig(encodingConfig);
    encodingConfig = {
      ...encodingConfig,
      latencyMode: "realtime"
    };
    super(encodingConfig.codec);
    /** @internal */
    this._abortController = null;
    /** @internal */
    this._workerTrackId = null;
    /** @internal */
    this._workerListener = null;
    /** @internal */
    this._promiseWithResolvers = promiseWithResolvers();
    /** @internal */
    this._errorPromiseAccessed = false;
    this._encoder = new VideoEncoderWrapper(this, encodingConfig);
    this._track = track;
  }
  /** A promise that rejects upon any error within this source. This promise never resolves. */
  get errorPromise() {
    this._errorPromiseAccessed = true;
    return this._promiseWithResolvers.promise;
  }
  /** @internal */
  async _start() {
    if (!this._errorPromiseAccessed) {
      console.warn(
        "Make sure not to ignore the `errorPromise` field on MediaStreamVideoTrackSource, so that any internal errors get bubbled up properly."
      );
    }
    this._abortController = new AbortController();
    let firstVideoFrameTimestamp = null;
    let errored = false;
    const onVideoFrame = (videoFrame) => {
      if (errored) {
        videoFrame.close();
        return;
      }
      if (firstVideoFrameTimestamp === null) {
        firstVideoFrameTimestamp = videoFrame.timestamp / 1e6;
        const muxer = this._connectedTrack.output._muxer;
        if (muxer.firstMediaStreamTimestamp === null) {
          muxer.firstMediaStreamTimestamp = performance.now() / 1e3;
          this._timestampOffset = -firstVideoFrameTimestamp;
        } else {
          this._timestampOffset = performance.now() / 1e3 - muxer.firstMediaStreamTimestamp - firstVideoFrameTimestamp;
        }
      }
      if (this._encoder.getQueueSize() >= 4) {
        videoFrame.close();
        return;
      }
      void this._encoder.add(new VideoSample(videoFrame), true).catch((error) => {
        errored = true;
        this._abortController?.abort();
        this._promiseWithResolvers.reject(error);
        if (this._workerTrackId !== null) {
          sendMessageToMediaStreamTrackProcessorWorker({
            type: "stopTrack",
            trackId: this._workerTrackId
          });
        }
      });
    };
    if (typeof MediaStreamTrackProcessor !== "undefined") {
      const processor = new MediaStreamTrackProcessor({ track: this._track });
      const consumer = new WritableStream({ write: onVideoFrame });
      processor.readable.pipeTo(consumer, {
        signal: this._abortController.signal
      }).catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        this._promiseWithResolvers.reject(error);
      });
    } else {
      const supportedInWorker = await mediaStreamTrackProcessorIsSupportedInWorker();
      if (supportedInWorker) {
        this._workerTrackId = nextMediaStreamTrackProcessorWorkerId++;
        sendMessageToMediaStreamTrackProcessorWorker({
          type: "videoTrack",
          trackId: this._workerTrackId,
          track: this._track
        }, [this._track]);
        this._workerListener = (event) => {
          const message = event.data;
          if (message.type === "videoFrame" && message.trackId === this._workerTrackId) {
            onVideoFrame(message.videoFrame);
          } else if (message.type === "error" && message.trackId === this._workerTrackId) {
            this._promiseWithResolvers.reject(message.error);
          }
        };
        mediaStreamTrackProcessorWorker.addEventListener("message", this._workerListener);
      } else {
        throw new Error("MediaStreamTrackProcessor is required but not supported by this browser.");
      }
    }
  }
  /** @internal */
  async _flushAndClose(forceClose) {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    if (this._workerTrackId !== null) {
      assert(this._workerListener);
      sendMessageToMediaStreamTrackProcessorWorker({
        type: "stopTrack",
        trackId: this._workerTrackId
      });
      await new Promise((resolve) => {
        const listener = (event) => {
          const message = event.data;
          if (message.type === "trackStopped" && message.trackId === this._workerTrackId) {
            assert(this._workerListener);
            mediaStreamTrackProcessorWorker.removeEventListener("message", this._workerListener);
            mediaStreamTrackProcessorWorker.removeEventListener("message", listener);
            resolve();
          }
        };
        mediaStreamTrackProcessorWorker.addEventListener("message", listener);
      });
    }
    await this._encoder.flushAndClose(forceClose);
  }
};
var AudioSource = class extends MediaSource {
  /** Internal constructor. */
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
var EncodedAudioPacketSource = class extends AudioSource {
  /** Creates a new {@link EncodedAudioPacketSource} whose packets are encoded using `codec`. */
  constructor(codec) {
    super(codec);
  }
  /**
   * Adds an encoded packet to the output audio track. Packets must be added in *decode order*.
   *
   * @param meta - Additional metadata from the encoder. You should pass this for the first call, including a valid
   * decoder config.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(packet, meta) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (packet.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be added.");
    }
    if (meta !== void 0 && (!meta || typeof meta !== "object")) {
      throw new TypeError("meta, when provided, must be an object.");
    }
    this._ensureValidAdd();
    return this._connectedTrack.output._muxer.addEncodedAudioPacket(this._connectedTrack, packet, meta);
  }
};
var AudioEncoderWrapper = class {
  constructor(source, encodingConfig) {
    this.source = source;
    this.encodingConfig = encodingConfig;
    this.ensureEncoderPromise = null;
    this.encoderInitialized = false;
    this.encoder = null;
    this.muxer = null;
    this.lastNumberOfChannels = null;
    this.lastSampleRate = null;
    this.isPcmEncoder = false;
    this.outputSampleSize = null;
    this.writeOutputValue = null;
    this.customEncoder = null;
    this.customEncoderCallSerializer = new CallSerializer();
    this.customEncoderQueueSize = 0;
    /**
     * Encoders typically throw their errors "out of band", meaning asynchronously in some other execution context.
     * However, we want to surface these errors to the user within the normal control flow, so they don't go uncaught.
     * So, we keep track of the encoder error and throw it as soon as we get the chance.
     */
    this.error = null;
    this.errorNeedsNewStack = true;
  }
  async add(audioSample, shouldClose) {
    try {
      this.checkForEncoderError();
      this.source._ensureValidAdd();
      if (this.lastNumberOfChannels !== null && this.lastSampleRate !== null) {
        if (audioSample.numberOfChannels !== this.lastNumberOfChannels || audioSample.sampleRate !== this.lastSampleRate) {
          throw new Error(
            `Audio parameters must remain constant. Expected ${this.lastNumberOfChannels} channels at ${this.lastSampleRate} Hz, got ${audioSample.numberOfChannels} channels at ${audioSample.sampleRate} Hz.`
          );
        }
      } else {
        this.lastNumberOfChannels = audioSample.numberOfChannels;
        this.lastSampleRate = audioSample.sampleRate;
      }
      if (!this.encoderInitialized) {
        if (!this.ensureEncoderPromise) {
          this.ensureEncoder(audioSample);
        }
        if (!this.encoderInitialized) {
          await this.ensureEncoderPromise;
        }
      }
      assert(this.encoderInitialized);
      if (this.customEncoder) {
        this.customEncoderQueueSize++;
        const clonedSample = audioSample.clone();
        const promise = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(clonedSample)).then(() => this.customEncoderQueueSize--).catch((error) => this.error ??= error).finally(() => {
          clonedSample.close();
        });
        if (this.customEncoderQueueSize >= 4) {
          await promise;
        }
        await this.muxer.mutex.currentPromise;
      } else if (this.isPcmEncoder) {
        await this.doPcmEncoding(audioSample, shouldClose);
      } else {
        assert(this.encoder);
        const audioData = audioSample.toAudioData();
        this.encoder.encode(audioData);
        audioData.close();
        if (shouldClose) {
          audioSample.close();
        }
        if (this.encoder.encodeQueueSize >= 4) {
          await new Promise((resolve) => this.encoder.addEventListener("dequeue", resolve, { once: true }));
        }
        await this.muxer.mutex.currentPromise;
      }
    } finally {
      if (shouldClose) {
        audioSample.close();
      }
    }
  }
  async doPcmEncoding(audioSample, shouldClose) {
    assert(this.outputSampleSize);
    assert(this.writeOutputValue);
    const { numberOfChannels, numberOfFrames, sampleRate, timestamp } = audioSample;
    const CHUNK_SIZE = 2048;
    const outputs = [];
    for (let frame = 0; frame < numberOfFrames; frame += CHUNK_SIZE) {
      const frameCount = Math.min(CHUNK_SIZE, audioSample.numberOfFrames - frame);
      const outputSize = frameCount * numberOfChannels * this.outputSampleSize;
      const outputBuffer = new ArrayBuffer(outputSize);
      const outputView = new DataView(outputBuffer);
      outputs.push({ frameCount, view: outputView });
    }
    const allocationSize = audioSample.allocationSize({ planeIndex: 0, format: "f32-planar" });
    const floats = new Float32Array(allocationSize / Float32Array.BYTES_PER_ELEMENT);
    for (let i = 0; i < numberOfChannels; i++) {
      audioSample.copyTo(floats, { planeIndex: i, format: "f32-planar" });
      for (let j = 0; j < outputs.length; j++) {
        const { frameCount, view: view2 } = outputs[j];
        for (let k = 0; k < frameCount; k++) {
          this.writeOutputValue(
            view2,
            (k * numberOfChannels + i) * this.outputSampleSize,
            floats[j * CHUNK_SIZE + k]
          );
        }
      }
    }
    if (shouldClose) {
      audioSample.close();
    }
    const meta = {
      decoderConfig: {
        codec: this.encodingConfig.codec,
        numberOfChannels,
        sampleRate
      }
    };
    for (let i = 0; i < outputs.length; i++) {
      const { frameCount, view: view2 } = outputs[i];
      const outputBuffer = view2.buffer;
      const startFrame = i * CHUNK_SIZE;
      const packet = new EncodedPacket(
        new Uint8Array(outputBuffer),
        "key",
        timestamp + startFrame / sampleRate,
        frameCount / sampleRate
      );
      this.encodingConfig.onEncodedPacket?.(packet, meta);
      await this.muxer.addEncodedAudioPacket(this.source._connectedTrack, packet, meta);
    }
  }
  ensureEncoder(audioSample) {
    const encoderError = new Error();
    this.ensureEncoderPromise = (async () => {
      const { numberOfChannels, sampleRate } = audioSample;
      const encoderConfig = buildAudioEncoderConfig({
        numberOfChannels,
        sampleRate,
        ...this.encodingConfig
      });
      this.encodingConfig.onEncoderConfig?.(encoderConfig);
      const MatchingCustomEncoder = customAudioEncoders.find((x) => x.supports(
        this.encodingConfig.codec,
        encoderConfig
      ));
      if (MatchingCustomEncoder) {
        this.customEncoder = new MatchingCustomEncoder();
        this.customEncoder.codec = this.encodingConfig.codec;
        this.customEncoder.config = encoderConfig;
        this.customEncoder.onPacket = (packet, meta) => {
          if (!(packet instanceof EncodedPacket)) {
            throw new TypeError("The first argument passed to onPacket must be an EncodedPacket.");
          }
          if (meta !== void 0 && (!meta || typeof meta !== "object")) {
            throw new TypeError("The second argument passed to onPacket must be an object or undefined.");
          }
          this.encodingConfig.onEncodedPacket?.(packet, meta);
          void this.muxer.addEncodedAudioPacket(this.source._connectedTrack, packet, meta).catch((error) => {
            this.error ??= error;
            this.errorNeedsNewStack = false;
          });
        };
        await this.customEncoder.init();
      } else if (PCM_AUDIO_CODECS.includes(this.encodingConfig.codec)) {
        this.initPcmEncoder();
      } else {
        if (typeof AudioEncoder === "undefined") {
          throw new Error("AudioEncoder is not supported by this browser.");
        }
        const support = await AudioEncoder.isConfigSupported(encoderConfig);
        if (!support.supported) {
          throw new Error(
            `This specific encoder configuration (${encoderConfig.codec}, ${encoderConfig.bitrate} bps, ${encoderConfig.numberOfChannels} channels, ${encoderConfig.sampleRate} Hz) is not supported by this browser. Consider using another codec or changing your audio parameters.`
          );
        }
        this.encoder = new AudioEncoder({
          output: (chunk, meta) => {
            const packet = EncodedPacket.fromEncodedChunk(chunk);
            this.encodingConfig.onEncodedPacket?.(packet, meta);
            void this.muxer.addEncodedAudioPacket(this.source._connectedTrack, packet, meta).catch((error) => {
              this.error ??= error;
              this.errorNeedsNewStack = false;
            });
          },
          error: (error) => {
            error.stack = encoderError.stack;
            this.error ??= error;
          }
        });
        this.encoder.configure(encoderConfig);
      }
      assert(this.source._connectedTrack);
      this.muxer = this.source._connectedTrack.output._muxer;
      this.encoderInitialized = true;
    })();
  }
  initPcmEncoder() {
    this.isPcmEncoder = true;
    const codec = this.encodingConfig.codec;
    const { dataType, sampleSize, littleEndian } = parsePcmCodec(codec);
    this.outputSampleSize = sampleSize;
    switch (sampleSize) {
      case 1:
        {
          if (dataType === "unsigned") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setUint8(byteOffset, clamp((value + 1) * 127.5, 0, 255));
          } else if (dataType === "signed") {
            this.writeOutputValue = (view2, byteOffset, value) => {
              view2.setInt8(byteOffset, clamp(Math.round(value * 128), -128, 127));
            };
          } else if (dataType === "ulaw") {
            this.writeOutputValue = (view2, byteOffset, value) => {
              const int16 = clamp(Math.floor(value * 32767), -32768, 32767);
              view2.setUint8(byteOffset, toUlaw(int16));
            };
          } else if (dataType === "alaw") {
            this.writeOutputValue = (view2, byteOffset, value) => {
              const int16 = clamp(Math.floor(value * 32767), -32768, 32767);
              view2.setUint8(byteOffset, toAlaw(int16));
            };
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 2:
        {
          if (dataType === "unsigned") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setUint16(byteOffset, clamp((value + 1) * 32767.5, 0, 65535), littleEndian);
          } else if (dataType === "signed") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setInt16(byteOffset, clamp(Math.round(value * 32767), -32768, 32767), littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 3:
        {
          if (dataType === "unsigned") {
            this.writeOutputValue = (view2, byteOffset, value) => setUint24(view2, byteOffset, clamp((value + 1) * 83886075e-1, 0, 16777215), littleEndian);
          } else if (dataType === "signed") {
            this.writeOutputValue = (view2, byteOffset, value) => setInt24(
              view2,
              byteOffset,
              clamp(Math.round(value * 8388607), -8388608, 8388607),
              littleEndian
            );
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 4:
        {
          if (dataType === "unsigned") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setUint32(byteOffset, clamp((value + 1) * 21474836475e-1, 0, 4294967295), littleEndian);
          } else if (dataType === "signed") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setInt32(
              byteOffset,
              clamp(Math.round(value * 2147483647), -2147483648, 2147483647),
              littleEndian
            );
          } else if (dataType === "float") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setFloat32(byteOffset, value, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      case 8:
        {
          if (dataType === "float") {
            this.writeOutputValue = (view2, byteOffset, value) => view2.setFloat64(byteOffset, value, littleEndian);
          } else {
            assert(false);
          }
        }
        ;
        break;
      default:
        {
          assertNever(sampleSize);
          assert(false);
        }
        ;
    }
  }
  async flushAndClose(forceClose) {
    if (!forceClose) this.checkForEncoderError();
    if (this.customEncoder) {
      if (!forceClose) {
        void this.customEncoderCallSerializer.call(() => this.customEncoder.flush());
      }
      await this.customEncoderCallSerializer.call(() => this.customEncoder.close());
    } else if (this.encoder) {
      if (!forceClose) {
        await this.encoder.flush();
      }
      if (this.encoder.state !== "closed") {
        this.encoder.close();
      }
    }
    if (!forceClose) this.checkForEncoderError();
  }
  getQueueSize() {
    if (this.customEncoder) {
      return this.customEncoderQueueSize;
    } else if (this.isPcmEncoder) {
      return 0;
    } else {
      return this.encoder?.encodeQueueSize ?? 0;
    }
  }
  checkForEncoderError() {
    if (this.error) {
      if (this.errorNeedsNewStack) {
        this.error.stack = new Error().stack;
      }
      throw this.error;
    }
  }
};
var AudioSampleSource = class extends AudioSource {
  /**
   * Creates a new {@link AudioSampleSource} whose samples are encoded according to the specified
   * {@link AudioEncodingConfig}.
   */
  constructor(encodingConfig) {
    validateAudioEncodingConfig(encodingConfig);
    super(encodingConfig.codec);
    this._encoder = new AudioEncoderWrapper(this, encodingConfig);
  }
  /**
   * Encodes an audio sample and then adds it to the output.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(audioSample) {
    if (!(audioSample instanceof AudioSample)) {
      throw new TypeError("audioSample must be an AudioSample.");
    }
    return this._encoder.add(audioSample, false);
  }
  /** @internal */
  _flushAndClose(forceClose) {
    return this._encoder.flushAndClose(forceClose);
  }
};
var AudioBufferSource = class extends AudioSource {
  /**
   * Creates a new {@link AudioBufferSource} whose `AudioBuffer` instances are encoded according to the specified
   * {@link AudioEncodingConfig}.
   */
  constructor(encodingConfig) {
    validateAudioEncodingConfig(encodingConfig);
    super(encodingConfig.codec);
    /** @internal */
    this._accumulatedTime = 0;
    this._encoder = new AudioEncoderWrapper(this, encodingConfig);
  }
  /**
   * Converts an AudioBuffer to audio samples, encodes them and adds them to the output. The first AudioBuffer will
   * be played at timestamp 0, and any subsequent AudioBuffer will have a timestamp equal to the total duration of
   * all previous AudioBuffers.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  async add(audioBuffer) {
    if (!(audioBuffer instanceof AudioBuffer)) {
      throw new TypeError("audioBuffer must be an AudioBuffer.");
    }
    const iterator = AudioSample._fromAudioBuffer(audioBuffer, this._accumulatedTime);
    this._accumulatedTime += audioBuffer.duration;
    for (const audioSample of iterator) {
      await this._encoder.add(audioSample, true);
    }
  }
  /** @internal */
  _flushAndClose(forceClose) {
    return this._encoder.flushAndClose(forceClose);
  }
};
var MediaStreamAudioTrackSource = class extends AudioSource {
  /**
   * Creates a new {@link MediaStreamAudioTrackSource} from a `MediaStreamAudioTrack`, which will pull audio samples
   * from the stream in real time and encode them according to {@link AudioEncodingConfig}.
   */
  constructor(track, encodingConfig) {
    if (!(track instanceof MediaStreamTrack) || track.kind !== "audio") {
      throw new TypeError("track must be an audio MediaStreamTrack.");
    }
    validateAudioEncodingConfig(encodingConfig);
    super(encodingConfig.codec);
    /** @internal */
    this._abortController = null;
    /** @internal */
    this._audioContext = null;
    /** @internal */
    this._scriptProcessorNode = null;
    // Deprecated but goated
    /** @internal */
    this._promiseWithResolvers = promiseWithResolvers();
    /** @internal */
    this._errorPromiseAccessed = false;
    this._encoder = new AudioEncoderWrapper(this, encodingConfig);
    this._track = track;
  }
  /** A promise that rejects upon any error within this source. This promise never resolves. */
  get errorPromise() {
    this._errorPromiseAccessed = true;
    return this._promiseWithResolvers.promise;
  }
  /** @internal */
  async _start() {
    if (!this._errorPromiseAccessed) {
      console.warn(
        "Make sure not to ignore the `errorPromise` field on MediaStreamVideoTrackSource, so that any internal errors get bubbled up properly."
      );
    }
    this._abortController = new AbortController();
    if (typeof MediaStreamTrackProcessor !== "undefined") {
      let firstAudioDataTimestamp = null;
      const processor = new MediaStreamTrackProcessor({ track: this._track });
      const consumer = new WritableStream({
        write: (audioData) => {
          if (firstAudioDataTimestamp === null) {
            firstAudioDataTimestamp = audioData.timestamp / 1e6;
            const muxer = this._connectedTrack.output._muxer;
            if (muxer.firstMediaStreamTimestamp === null) {
              muxer.firstMediaStreamTimestamp = performance.now() / 1e3;
              this._timestampOffset = -firstAudioDataTimestamp;
            } else {
              this._timestampOffset = performance.now() / 1e3 - muxer.firstMediaStreamTimestamp - firstAudioDataTimestamp;
            }
          }
          if (this._encoder.getQueueSize() >= 4) {
            audioData.close();
            return;
          }
          void this._encoder.add(new AudioSample(audioData), true).catch((error) => {
            this._abortController?.abort();
            this._promiseWithResolvers.reject(error);
          });
        }
      });
      processor.readable.pipeTo(consumer, {
        signal: this._abortController.signal
      }).catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        this._promiseWithResolvers.reject(error);
      });
    } else {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this._audioContext = new AudioContext({ sampleRate: this._track.getSettings().sampleRate });
      const sourceNode = this._audioContext.createMediaStreamSource(new MediaStream([this._track]));
      this._scriptProcessorNode = this._audioContext.createScriptProcessor(4096);
      if (this._audioContext.state === "suspended") {
        await this._audioContext.resume();
      }
      sourceNode.connect(this._scriptProcessorNode);
      this._scriptProcessorNode.connect(this._audioContext.destination);
      let audioReceived = false;
      let totalDuration = 0;
      this._scriptProcessorNode.onaudioprocess = (event) => {
        const iterator = AudioSample._fromAudioBuffer(event.inputBuffer, totalDuration);
        totalDuration += event.inputBuffer.duration;
        for (const audioSample of iterator) {
          if (!audioReceived) {
            audioReceived = true;
            const muxer = this._connectedTrack.output._muxer;
            if (muxer.firstMediaStreamTimestamp === null) {
              muxer.firstMediaStreamTimestamp = performance.now() / 1e3;
            } else {
              this._timestampOffset = performance.now() / 1e3 - muxer.firstMediaStreamTimestamp;
            }
          }
          if (this._encoder.getQueueSize() >= 4) {
            audioSample.close();
            continue;
          }
          void this._encoder.add(audioSample, true).catch((error) => {
            void this._audioContext.suspend();
            this._promiseWithResolvers.reject(error);
          });
        }
      };
    }
  }
  /** @internal */
  async _flushAndClose(forceClose) {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    if (this._audioContext) {
      assert(this._scriptProcessorNode);
      this._scriptProcessorNode.disconnect();
      await this._audioContext.suspend();
    }
    await this._encoder.flushAndClose(forceClose);
  }
};
var mediaStreamTrackProcessorWorkerCode = () => {
  const sendMessage = (message, transfer) => {
    if (transfer) {
      self.postMessage(message, { transfer });
    } else {
      self.postMessage(message);
    }
  };
  sendMessage({
    type: "support",
    supported: typeof MediaStreamTrackProcessor !== "undefined"
  });
  const abortControllers = /* @__PURE__ */ new Map();
  const stoppedTracks = /* @__PURE__ */ new Set();
  self.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "videoTrack":
        {
          const processor = new MediaStreamTrackProcessor({ track: message.track });
          const consumer = new WritableStream({
            write: (videoFrame) => {
              if (stoppedTracks.has(message.trackId)) {
                videoFrame.close();
                return;
              }
              sendMessage({
                type: "videoFrame",
                trackId: message.trackId,
                videoFrame
              }, [videoFrame]);
            }
          });
          const abortController = new AbortController();
          abortControllers.set(message.trackId, abortController);
          processor.readable.pipeTo(consumer, {
            signal: abortController.signal
          }).catch((error) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            sendMessage({
              type: "error",
              trackId: message.trackId,
              error
            });
          });
        }
        ;
        break;
      case "stopTrack":
        {
          const abortController = abortControllers.get(message.trackId);
          if (abortController) {
            abortController.abort();
            abortControllers.delete(message.trackId);
          }
          stoppedTracks.add(message.trackId);
          sendMessage({
            type: "trackStopped",
            trackId: message.trackId
          });
        }
        ;
        break;
      default:
        assertNever(message);
    }
  });
};
var nextMediaStreamTrackProcessorWorkerId = 0;
var mediaStreamTrackProcessorWorker = null;
var initMediaStreamTrackProcessorWorker = () => {
  const blob = new Blob(
    [`(${mediaStreamTrackProcessorWorkerCode.toString()})()`],
    { type: "application/javascript" }
  );
  const url2 = URL.createObjectURL(blob);
  mediaStreamTrackProcessorWorker = new Worker(url2);
};
var mediaStreamTrackProcessorIsSupportedInWorkerCache = null;
var mediaStreamTrackProcessorIsSupportedInWorker = async () => {
  if (mediaStreamTrackProcessorIsSupportedInWorkerCache !== null) {
    return mediaStreamTrackProcessorIsSupportedInWorkerCache;
  }
  if (!mediaStreamTrackProcessorWorker) {
    initMediaStreamTrackProcessorWorker();
  }
  return new Promise((resolve) => {
    assert(mediaStreamTrackProcessorWorker);
    const listener = (event) => {
      const message = event.data;
      if (message.type === "support") {
        mediaStreamTrackProcessorIsSupportedInWorkerCache = message.supported;
        mediaStreamTrackProcessorWorker.removeEventListener("message", listener);
        resolve(message.supported);
      }
    };
    mediaStreamTrackProcessorWorker.addEventListener("message", listener);
  });
};
var sendMessageToMediaStreamTrackProcessorWorker = (message, transfer) => {
  assert(mediaStreamTrackProcessorWorker);
  if (transfer) {
    mediaStreamTrackProcessorWorker.postMessage(message, transfer);
  } else {
    mediaStreamTrackProcessorWorker.postMessage(message);
  }
};
var SubtitleSource = class extends MediaSource {
  /** Internal constructor. */
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
  /** Creates a new {@link TextSubtitleSource} where added text chunks are in the specified `codec`. */
  constructor(codec) {
    super(codec);
    /** @internal */
    this._error = null;
    this._parser = new SubtitleParser({
      codec,
      output: (cue, metadata) => {
        void this._connectedTrack?.output._muxer.addSubtitleCue(this._connectedTrack, cue, metadata).catch((error) => {
          this._error ??= error;
        });
      }
    });
  }
  /**
   * Parses the subtitle text according to the specified codec and adds it to the output track. You don't have to
   * add the entire subtitle file at once here; you can provide it in chunks.
   *
   * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
   * to respect writer and encoder backpressure.
   */
  add(text) {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string.");
    }
    this._checkForError();
    this._ensureValidAdd();
    this._parser.parse(text);
    return this._connectedTrack.output._muxer.mutex.currentPromise;
  }
  /** @internal */
  _checkForError() {
    if (this._error) {
      throw this._error;
    }
  }
  /** @internal */
  async _flushAndClose(forceClose) {
    if (!forceClose) {
      this._checkForError();
    }
  }
};

// src/output.ts
var ALL_TRACK_TYPES = ["video", "audio", "subtitle"];
var validateBaseTrackMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object") {
    throw new TypeError("metadata must be an object.");
  }
  if (metadata.languageCode !== void 0 && !isIso639Dash2LanguageCode(metadata.languageCode)) {
    throw new TypeError("metadata.languageCode, when provided, must be a three-letter, ISO 639-2/T language code.");
  }
  if (metadata.name !== void 0 && typeof metadata.name !== "string") {
    throw new TypeError("metadata.name, when provided, must be a string.");
  }
  if (metadata.maximumPacketCount !== void 0 && (!Number.isInteger(metadata.maximumPacketCount) || metadata.maximumPacketCount < 0)) {
    throw new TypeError("metadata.maximumPacketCount, when provided, must be a non-negative integer.");
  }
};
var Output = class {
  /**
   * Creates a new instance of {@link Output} which can then be used to create a new media file according to the
   * specified {@link OutputOptions}.
   */
  constructor(options) {
    /** The current state of the output. */
    this.state = "pending";
    /** @internal */
    this._tracks = [];
    /** @internal */
    this._startPromise = null;
    /** @internal */
    this._cancelPromise = null;
    /** @internal */
    this._finalizePromise = null;
    /** @internal */
    this._mutex = new AsyncMutex();
    /** @internal */
    this._metadataTags = {};
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
    this.format = options.format;
    this.target = options.target;
    this._writer = options.target._createWriter();
    this._muxer = options.format._createMuxer(this);
  }
  /** Adds a video track to the output with the given source. Can only be called before the output is started. */
  addVideoTrack(source, metadata = {}) {
    if (!(source instanceof VideoSource)) {
      throw new TypeError("source must be a VideoSource.");
    }
    validateBaseTrackMetadata(metadata);
    if (metadata.rotation !== void 0 && ![0, 90, 180, 270].includes(metadata.rotation)) {
      throw new TypeError(`Invalid video rotation: ${metadata.rotation}. Has to be 0, 90, 180 or 270.`);
    }
    if (!this.format.supportsVideoRotationMetadata && metadata.rotation) {
      throw new Error(`${this.format._name} does not support video rotation metadata.`);
    }
    if (metadata.frameRate !== void 0 && (!Number.isFinite(metadata.frameRate) || metadata.frameRate <= 0)) {
      throw new TypeError(
        `Invalid video frame rate: ${metadata.frameRate}. Must be a positive number.`
      );
    }
    this._addTrack("video", source, metadata);
  }
  /** Adds an audio track to the output with the given source. Can only be called before the output is started. */
  addAudioTrack(source, metadata = {}) {
    if (!(source instanceof AudioSource)) {
      throw new TypeError("source must be an AudioSource.");
    }
    validateBaseTrackMetadata(metadata);
    this._addTrack("audio", source, metadata);
  }
  /** Adds a subtitle track to the output with the given source. Can only be called before the output is started. */
  addSubtitleTrack(source, metadata = {}) {
    if (!(source instanceof SubtitleSource)) {
      throw new TypeError("source must be a SubtitleSource.");
    }
    validateBaseTrackMetadata(metadata);
    this._addTrack("subtitle", source, metadata);
  }
  /**
   * Sets descriptive metadata tags about the media file, such as title, author, date, or cover art. When called
   * multiple times, only the metadata from the last call will be used.
   *
   * Can only be called before the output is started.
   */
  setMetadataTags(tags) {
    validateMetadataTags(tags);
    if (this.state !== "pending") {
      throw new Error("Cannot set metadata tags after output has been started or canceled.");
    }
    this._metadataTags = tags;
  }
  /** @internal */
  _addTrack(type, source, metadata) {
    if (this.state !== "pending") {
      throw new Error("Cannot add track after output has been started or canceled.");
    }
    if (source._connectedTrack) {
      throw new Error("Source is already used for a track.");
    }
    const supportedTrackCounts = this.format.getSupportedTrackCounts();
    const presentTracksOfThisType = this._tracks.reduce(
      (count, track2) => count + (track2.type === type ? 1 : 0),
      0
    );
    const maxCount = supportedTrackCounts[type].max;
    if (presentTracksOfThisType === maxCount) {
      throw new Error(
        maxCount === 0 ? `${this.format._name} does not support ${type} tracks.` : `${this.format._name} does not support more than ${maxCount} ${type} track${maxCount === 1 ? "" : "s"}.`
      );
    }
    const maxTotalCount = supportedTrackCounts.total.max;
    if (this._tracks.length === maxTotalCount) {
      throw new Error(
        `${this.format._name} does not support more than ${maxTotalCount} tracks${maxTotalCount === 1 ? "" : "s"} in total.`
      );
    }
    const track = {
      id: this._tracks.length + 1,
      output: this,
      type,
      source,
      metadata
    };
    if (track.type === "video") {
      const supportedVideoCodecs = this.format.getSupportedVideoCodecs();
      if (supportedVideoCodecs.length === 0) {
        throw new Error(
          `${this.format._name} does not support video tracks.` + this.format._codecUnsupportedHint(track.source._codec)
        );
      } else if (!supportedVideoCodecs.includes(track.source._codec)) {
        throw new Error(
          `Codec '${track.source._codec}' cannot be contained within ${this.format._name}. Supported video codecs are: ${supportedVideoCodecs.map((codec) => `'${codec}'`).join(", ")}.` + this.format._codecUnsupportedHint(track.source._codec)
        );
      }
    } else if (track.type === "audio") {
      const supportedAudioCodecs = this.format.getSupportedAudioCodecs();
      if (supportedAudioCodecs.length === 0) {
        throw new Error(
          `${this.format._name} does not support audio tracks.` + this.format._codecUnsupportedHint(track.source._codec)
        );
      } else if (!supportedAudioCodecs.includes(track.source._codec)) {
        throw new Error(
          `Codec '${track.source._codec}' cannot be contained within ${this.format._name}. Supported audio codecs are: ${supportedAudioCodecs.map((codec) => `'${codec}'`).join(", ")}.` + this.format._codecUnsupportedHint(track.source._codec)
        );
      }
    } else if (track.type === "subtitle") {
      const supportedSubtitleCodecs = this.format.getSupportedSubtitleCodecs();
      if (supportedSubtitleCodecs.length === 0) {
        throw new Error(
          `${this.format._name} does not support subtitle tracks.` + this.format._codecUnsupportedHint(track.source._codec)
        );
      } else if (!supportedSubtitleCodecs.includes(track.source._codec)) {
        throw new Error(
          `Codec '${track.source._codec}' cannot be contained within ${this.format._name}. Supported subtitle codecs are: ${supportedSubtitleCodecs.map((codec) => `'${codec}'`).join(", ")}.` + this.format._codecUnsupportedHint(track.source._codec)
        );
      }
    }
    this._tracks.push(track);
    source._connectedTrack = track;
  }
  /**
   * Starts the creation of the output file. This method should be called after all tracks have been added. Only after
   * the output has started can media samples be added to the tracks.
   *
   * @returns A promise that resolves when the output has successfully started and is ready to receive media samples.
   */
  async start() {
    const supportedTrackCounts = this.format.getSupportedTrackCounts();
    for (const trackType of ALL_TRACK_TYPES) {
      const presentTracksOfThisType = this._tracks.reduce(
        (count, track) => count + (track.type === trackType ? 1 : 0),
        0
      );
      const minCount = supportedTrackCounts[trackType].min;
      if (presentTracksOfThisType < minCount) {
        throw new Error(
          minCount === supportedTrackCounts[trackType].max ? `${this.format._name} requires exactly ${minCount} ${trackType} track${minCount === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${minCount} ${trackType} track${minCount === 1 ? "" : "s"}.`
        );
      }
    }
    const totalMinCount = supportedTrackCounts.total.min;
    if (this._tracks.length < totalMinCount) {
      throw new Error(
        totalMinCount === supportedTrackCounts.total.max ? `${this.format._name} requires exactly ${totalMinCount} track${totalMinCount === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${totalMinCount} track${totalMinCount === 1 ? "" : "s"}.`
      );
    }
    if (this.state === "canceled") {
      throw new Error("Output has been canceled.");
    }
    if (this._startPromise) {
      console.warn("Output has already been started.");
      return this._startPromise;
    }
    return this._startPromise = (async () => {
      this.state = "started";
      this._writer.start();
      const release = await this._mutex.acquire();
      await this._muxer.start();
      const promises = this._tracks.map((track) => track.source._start());
      await Promise.all(promises);
      release();
    })();
  }
  /**
   * Resolves with the full MIME type of the output file, including track codecs.
   *
   * The returned promise will resolve only once the precise codec strings of all tracks are known.
   */
  getMimeType() {
    return this._muxer.getMimeType();
  }
  /**
   * Cancels the creation of the output file, releasing internal resources like encoders and preventing further
   * samples from being added.
   *
   * @returns A promise that resolves once all internal resources have been released.
   */
  async cancel() {
    if (this._cancelPromise) {
      console.warn("Output has already been canceled.");
      return this._cancelPromise;
    } else if (this.state === "finalizing" || this.state === "finalized") {
      console.warn("Output has already been finalized.");
      return;
    }
    return this._cancelPromise = (async () => {
      this.state = "canceled";
      const release = await this._mutex.acquire();
      const promises = this._tracks.map((x) => x.source._flushOrWaitForOngoingClose(true));
      await Promise.all(promises);
      await this._writer.close();
      release();
    })();
  }
  /**
   * Finalizes the output file. This method must be called after all media samples across all tracks have been added.
   * Once the Promise returned by this method completes, the output file is ready.
   */
  async finalize() {
    if (this.state === "pending") {
      throw new Error("Cannot finalize before starting.");
    }
    if (this.state === "canceled") {
      throw new Error("Cannot finalize after canceling.");
    }
    if (this._finalizePromise) {
      console.warn("Output has already been finalized.");
      return this._finalizePromise;
    }
    return this._finalizePromise = (async () => {
      this.state = "finalizing";
      const release = await this._mutex.acquire();
      const promises = this._tracks.map((x) => x.source._flushOrWaitForOngoingClose(false));
      await Promise.all(promises);
      await this._muxer.finalize();
      await this._writer.flush();
      await this._writer.finalize();
      this.state = "finalized";
      release();
    })();
  }
};

// src/conversion.ts
init_subtitles();
var validateVideoOptions = (videoOptions) => {
  if (videoOptions !== void 0 && (!videoOptions || typeof videoOptions !== "object")) {
    throw new TypeError("options.video, when provided, must be an object.");
  }
  if (videoOptions?.discard !== void 0 && typeof videoOptions.discard !== "boolean") {
    throw new TypeError("options.video.discard, when provided, must be a boolean.");
  }
  if (videoOptions?.forceTranscode !== void 0 && typeof videoOptions.forceTranscode !== "boolean") {
    throw new TypeError("options.video.forceTranscode, when provided, must be a boolean.");
  }
  if (videoOptions?.codec !== void 0 && !VIDEO_CODECS.includes(videoOptions.codec)) {
    throw new TypeError(
      `options.video.codec, when provided, must be one of: ${VIDEO_CODECS.join(", ")}.`
    );
  }
  if (videoOptions?.bitrate !== void 0 && !(videoOptions.bitrate instanceof Quality) && (!Number.isInteger(videoOptions.bitrate) || videoOptions.bitrate <= 0)) {
    throw new TypeError("options.video.bitrate, when provided, must be a positive integer or a quality.");
  }
  if (videoOptions?.width !== void 0 && (!Number.isInteger(videoOptions.width) || videoOptions.width <= 0)) {
    throw new TypeError("options.video.width, when provided, must be a positive integer.");
  }
  if (videoOptions?.height !== void 0 && (!Number.isInteger(videoOptions.height) || videoOptions.height <= 0)) {
    throw new TypeError("options.video.height, when provided, must be a positive integer.");
  }
  if (videoOptions?.fit !== void 0 && !["fill", "contain", "cover"].includes(videoOptions.fit)) {
    throw new TypeError("options.video.fit, when provided, must be one of 'fill', 'contain', or 'cover'.");
  }
  if (videoOptions?.width !== void 0 && videoOptions.height !== void 0 && videoOptions.fit === void 0) {
    throw new TypeError(
      "When both options.video.width and options.video.height are provided, options.video.fit must also be provided."
    );
  }
  if (videoOptions?.rotate !== void 0 && ![0, 90, 180, 270].includes(videoOptions.rotate)) {
    throw new TypeError("options.video.rotate, when provided, must be 0, 90, 180 or 270.");
  }
  if (videoOptions?.crop !== void 0) {
    validateCropRectangle(videoOptions.crop, "options.video.");
  }
  if (videoOptions?.frameRate !== void 0 && (!Number.isFinite(videoOptions.frameRate) || videoOptions.frameRate <= 0)) {
    throw new TypeError("options.video.frameRate, when provided, must be a finite positive number.");
  }
  if (videoOptions?.alpha !== void 0 && !["discard", "keep"].includes(videoOptions.alpha)) {
    throw new TypeError("options.video.alpha, when provided, must be either 'discard' or 'keep'.");
  }
  if (videoOptions?.keyFrameInterval !== void 0 && (!Number.isFinite(videoOptions.keyFrameInterval) || videoOptions.keyFrameInterval < 0)) {
    throw new TypeError("config.keyFrameInterval, when provided, must be a non-negative number.");
  }
};
var validateAudioOptions = (audioOptions) => {
  if (audioOptions !== void 0 && (!audioOptions || typeof audioOptions !== "object")) {
    throw new TypeError("options.audio, when provided, must be an object.");
  }
  if (audioOptions?.discard !== void 0 && typeof audioOptions.discard !== "boolean") {
    throw new TypeError("options.audio.discard, when provided, must be a boolean.");
  }
  if (audioOptions?.forceTranscode !== void 0 && typeof audioOptions.forceTranscode !== "boolean") {
    throw new TypeError("options.audio.forceTranscode, when provided, must be a boolean.");
  }
  if (audioOptions?.codec !== void 0 && !AUDIO_CODECS.includes(audioOptions.codec)) {
    throw new TypeError(
      `options.audio.codec, when provided, must be one of: ${AUDIO_CODECS.join(", ")}.`
    );
  }
  if (audioOptions?.bitrate !== void 0 && !(audioOptions.bitrate instanceof Quality) && (!Number.isInteger(audioOptions.bitrate) || audioOptions.bitrate <= 0)) {
    throw new TypeError("options.audio.bitrate, when provided, must be a positive integer or a quality.");
  }
  if (audioOptions?.numberOfChannels !== void 0 && (!Number.isInteger(audioOptions.numberOfChannels) || audioOptions.numberOfChannels <= 0)) {
    throw new TypeError("options.audio.numberOfChannels, when provided, must be a positive integer.");
  }
  if (audioOptions?.sampleRate !== void 0 && (!Number.isInteger(audioOptions.sampleRate) || audioOptions.sampleRate <= 0)) {
    throw new TypeError("options.audio.sampleRate, when provided, must be a positive integer.");
  }
};
var validateSubtitleOptions = (subtitleOptions) => {
  if (subtitleOptions !== void 0 && (!subtitleOptions || typeof subtitleOptions !== "object")) {
    throw new TypeError("options.subtitle, when provided, must be an object.");
  }
  if (subtitleOptions?.discard !== void 0 && typeof subtitleOptions.discard !== "boolean") {
    throw new TypeError("options.subtitle.discard, when provided, must be a boolean.");
  }
  if (subtitleOptions?.codec !== void 0 && !SUBTITLE_CODECS.includes(subtitleOptions.codec)) {
    throw new TypeError(
      `options.subtitle.codec, when provided, must be one of: ${SUBTITLE_CODECS.join(", ")}.`
    );
  }
};
var FALLBACK_NUMBER_OF_CHANNELS = 2;
var FALLBACK_SAMPLE_RATE = 48e3;
var Conversion = class _Conversion {
  /** Creates a new Conversion instance (duh). */
  constructor(options) {
    /** @internal */
    this._addedCounts = {
      video: 0,
      audio: 0,
      subtitle: 0
    };
    /** @internal */
    this._totalTrackCount = 0;
    /** @internal */
    this._trackPromises = [];
    /** @internal */
    this._executed = false;
    /** @internal */
    this._synchronizer = new TrackSynchronizer();
    /** @internal */
    this._totalDuration = null;
    /** @internal */
    this._maxTimestamps = /* @__PURE__ */ new Map();
    // Track ID -> timestamp
    /** @internal */
    this._canceled = false;
    /** @internal */
    this._externalSubtitleSources = [];
    /**
     * A callback that is fired whenever the conversion progresses. Returns a number between 0 and 1, indicating the
     * completion of the conversion. Note that a progress of 1 doesn't necessarily mean the conversion is complete;
     * the conversion is complete once `execute()` resolves.
     *
     * In order for progress to be computed, this property must be set before `execute` is called.
     */
    this.onProgress = void 0;
    /** @internal */
    this._computeProgress = false;
    /** @internal */
    this._lastProgress = 0;
    /**
     * Whether this conversion, as it has been configured, is valid and can be executed. If this field is `false`, check
     * the `discardedTracks` field for reasons.
     */
    this.isValid = false;
    /** The list of tracks that are included in the output file. */
    this.utilizedTracks = [];
    /** The list of tracks from the input file that have been discarded, alongside the discard reason. */
    this.discardedTracks = [];
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!(options.input instanceof Input)) {
      throw new TypeError("options.input must be an Input.");
    }
    if (!(options.output instanceof Output)) {
      throw new TypeError("options.output must be an Output.");
    }
    if (options.output._tracks.length > 0 || Object.keys(options.output._metadataTags).length > 0 || options.output.state !== "pending") {
      throw new TypeError("options.output must be fresh: no tracks or metadata tags added and not started.");
    }
    if (typeof options.video !== "function") {
      validateVideoOptions(options.video);
    }
    if (typeof options.audio !== "function") {
      validateAudioOptions(options.audio);
    }
    if (typeof options.subtitle !== "function") {
      validateSubtitleOptions(options.subtitle);
    }
    if (options.trim !== void 0 && (!options.trim || typeof options.trim !== "object")) {
      throw new TypeError("options.trim, when provided, must be an object.");
    }
    if (options.trim?.start !== void 0 && (!Number.isFinite(options.trim.start) || options.trim.start < 0)) {
      throw new TypeError("options.trim.start, when provided, must be a non-negative number.");
    }
    if (options.trim?.end !== void 0 && (!Number.isFinite(options.trim.end) || options.trim.end < 0)) {
      throw new TypeError("options.trim.end, when provided, must be a non-negative number.");
    }
    if (options.trim?.start !== void 0 && options.trim.end !== void 0 && options.trim.start >= options.trim.end) {
      throw new TypeError("options.trim.start must be less than options.trim.end.");
    }
    if (options.tags !== void 0 && (typeof options.tags !== "object" || !options.tags) && typeof options.tags !== "function") {
      throw new TypeError("options.tags, when provided, must be an object or a function.");
    }
    if (typeof options.tags === "object") {
      validateMetadataTags(options.tags);
    }
    if (options.showWarnings !== void 0 && typeof options.showWarnings !== "boolean") {
      throw new TypeError("options.showWarnings, when provided, must be a boolean.");
    }
    this._options = options;
    this.input = options.input;
    this.output = options.output;
    this._startTimestamp = options.trim?.start ?? 0;
    this._endTimestamp = options.trim?.end ?? Infinity;
    const { promise: started, resolve: start } = promiseWithResolvers();
    this._started = started;
    this._start = start;
  }
  /** Initializes a new conversion process without starting the conversion. */
  static async init(options) {
    const conversion = new _Conversion(options);
    await conversion._init();
    return conversion;
  }
  /** @internal */
  async _init() {
    const inputTracks = await this.input.getTracks();
    const outputTrackCounts = this.output.format.getSupportedTrackCounts();
    let nVideo = 1;
    let nAudio = 1;
    let nSubtitle = 1;
    for (const track of inputTracks) {
      let trackOptions = void 0;
      if (track.isVideoTrack()) {
        if (this._options.video) {
          if (typeof this._options.video === "function") {
            trackOptions = await this._options.video(track, nVideo);
            validateVideoOptions(trackOptions);
            nVideo++;
          } else {
            trackOptions = this._options.video;
          }
        }
      } else if (track.isAudioTrack()) {
        if (this._options.audio) {
          if (typeof this._options.audio === "function") {
            trackOptions = await this._options.audio(track, nAudio);
            validateAudioOptions(trackOptions);
            nAudio++;
          } else {
            trackOptions = this._options.audio;
          }
        }
      } else if (track.isSubtitleTrack()) {
        if (this._options.subtitle) {
          if (typeof this._options.subtitle === "function") {
            trackOptions = await this._options.subtitle(track, nSubtitle);
            validateSubtitleOptions(trackOptions);
            nSubtitle++;
          } else {
            trackOptions = this._options.subtitle;
          }
        }
      } else {
        assert(false);
      }
      if (trackOptions?.discard) {
        this.discardedTracks.push({
          track,
          reason: "discarded_by_user"
        });
        continue;
      }
      if (this._totalTrackCount === outputTrackCounts.total.max) {
        this.discardedTracks.push({
          track,
          reason: "max_track_count_reached"
        });
        continue;
      }
      if (this._addedCounts[track.type] === outputTrackCounts[track.type].max) {
        this.discardedTracks.push({
          track,
          reason: "max_track_count_of_type_reached"
        });
        continue;
      }
      if (track.isVideoTrack()) {
        await this._processVideoTrack(track, trackOptions ?? {});
      } else if (track.isAudioTrack()) {
        await this._processAudioTrack(track, trackOptions ?? {});
      } else if (track.isSubtitleTrack()) {
        await this._processSubtitleTrack(track, trackOptions ?? {});
      }
    }
    const inputTags = await this.input.getMetadataTags();
    let outputTags;
    if (this._options.tags) {
      const result = typeof this._options.tags === "function" ? await this._options.tags(inputTags) : this._options.tags;
      validateMetadataTags(result);
      outputTags = result;
    } else {
      outputTags = inputTags;
    }
    const inputAndOutputFormatMatch = (await this.input.getFormat()).mimeType === this.output.format.mimeType;
    const rawTagsAreUnchanged = inputTags.raw === outputTags.raw;
    if (inputTags.raw && rawTagsAreUnchanged && !inputAndOutputFormatMatch) {
      delete outputTags.raw;
    }
    this.output.setMetadataTags(outputTags);
    this.isValid = this._totalTrackCount >= outputTrackCounts.total.min && this._addedCounts.video >= outputTrackCounts.video.min && this._addedCounts.audio >= outputTrackCounts.audio.min && this._addedCounts.subtitle >= outputTrackCounts.subtitle.min;
    if (this._options.showWarnings ?? true) {
      const warnElements = [];
      const unintentionallyDiscardedTracks = this.discardedTracks.filter((x) => x.reason !== "discarded_by_user");
      if (unintentionallyDiscardedTracks.length > 0) {
        warnElements.push(
          "Some tracks had to be discarded from the conversion:",
          unintentionallyDiscardedTracks
        );
      }
      if (!this.isValid) {
        warnElements.push("\n\n" + this._getInvalidityExplanation().join(""));
      }
      if (warnElements.length > 0) {
        console.warn(...warnElements);
      }
    }
  }
  /** @internal */
  _getInvalidityExplanation() {
    const elements = [];
    if (this.discardedTracks.length === 0) {
      elements.push(
        "Due to missing tracks, this conversion cannot be executed."
      );
    } else {
      const encodabilityIsTheProblem = this.discardedTracks.every(
        (x) => x.reason === "discarded_by_user" || x.reason === "no_encodable_target_codec"
      );
      elements.push(
        "Due to discarded tracks, this conversion cannot be executed."
      );
      if (encodabilityIsTheProblem) {
        const codecs = this.discardedTracks.flatMap((x) => {
          if (x.reason === "discarded_by_user") return [];
          if (x.track.type === "video") {
            return this.output.format.getSupportedVideoCodecs();
          } else if (x.track.type === "audio") {
            return this.output.format.getSupportedAudioCodecs();
          } else {
            return this.output.format.getSupportedSubtitleCodecs();
          }
        });
        if (codecs.length === 1) {
          elements.push(
            `
Tracks were discarded because your environment is not able to encode '${codecs[0]}'.`
          );
        } else {
          elements.push(
            `
Tracks were discarded because your environment is not able to encode any of the following codecs: ${codecs.map((x) => `'${x}'`).join(", ")}.`
          );
        }
        if (codecs.includes("mp3")) {
          elements.push(
            `
The @mediabunny/mp3-encoder extension package provides support for encoding MP3.`
          );
        }
        if (codecs.includes("mpeg4")) {
          elements.push(
            `
The @mediabunny/mpeg4 extension package provides support for encoding and decoding MPEG-4 Part 2.`
          );
        }
        if (codecs.includes("ac3") || codecs.includes("eac3")) {
          elements.push(
            `
The @mediabunny/eac3 extension package provides support for encoding and decoding AC-3 and E-AC-3.`
          );
        }
      } else {
        elements.push("\nCheck the discardedTracks field for more info.");
      }
    }
    return elements;
  }
  /**
   * Adds an external subtitle track to the output. This can be called after `init()` but before `execute()`.
   * This is useful for adding subtitle tracks from separate files that are not part of the input video.
   *
   * @param source - The subtitle source to add
   * @param metadata - Optional metadata for the subtitle track
   * @param contentProvider - Optional async function that will be called after the output starts to add content to the subtitle source
   */
  addExternalSubtitleTrack(source, metadata = {}, contentProvider) {
    if (this._executed) {
      throw new Error("Cannot add subtitle tracks after conversion has been executed.");
    }
    if (this.output.state !== "pending") {
      throw new Error("Cannot add subtitle tracks after output has been started.");
    }
    const outputTrackCounts = this.output.format.getSupportedTrackCounts();
    const currentSubtitleCount = this._addedCounts.subtitle + this._externalSubtitleSources.length;
    if (currentSubtitleCount >= outputTrackCounts.subtitle.max) {
      throw new Error(
        `Cannot add more subtitle tracks. Maximum of ${outputTrackCounts.subtitle.max} subtitle track(s) allowed.`
      );
    }
    const totalTrackCount = this._totalTrackCount + this._externalSubtitleSources.length + 1;
    if (totalTrackCount > outputTrackCounts.total.max) {
      throw new Error(
        `Cannot add more tracks. Maximum of ${outputTrackCounts.total.max} total track(s) allowed.`
      );
    }
    this._externalSubtitleSources.push({ source, metadata, contentProvider });
    this.isValid = this._totalTrackCount + this._externalSubtitleSources.length >= outputTrackCounts.total.min && this._addedCounts.video >= outputTrackCounts.video.min && this._addedCounts.audio >= outputTrackCounts.audio.min && this._addedCounts.subtitle + this._externalSubtitleSources.length >= outputTrackCounts.subtitle.min;
  }
  /**
   * Executes the conversion process. Resolves once conversion is complete.
   *
   * Will throw if `isValid` is `false`.
   */
  async execute() {
    if (!this.isValid) {
      throw new Error(
        "Cannot execute this conversion because its output configuration is invalid. Make sure to always check the isValid field before executing a conversion.\n" + this._getInvalidityExplanation().join("")
      );
    }
    if (this._executed) {
      throw new Error("Conversion cannot be executed twice.");
    }
    this._executed = true;
    if (this.onProgress) {
      this._computeProgress = true;
      this._totalDuration = Math.min(
        await this.input.computeDuration() - this._startTimestamp,
        this._endTimestamp - this._startTimestamp
      );
      for (const track of this.utilizedTracks) {
        this._maxTimestamps.set(track.id, 0);
      }
      this.onProgress?.(0);
    }
    for (const { source, metadata } of this._externalSubtitleSources) {
      this.output.addSubtitleTrack(source, metadata);
    }
    await this.output.start();
    this._start();
    const contentProviderPromises = this._externalSubtitleSources.filter((s) => s.contentProvider).map((s) => s.contentProvider());
    if (contentProviderPromises.length > 0) {
      this._trackPromises.push(...contentProviderPromises);
    }
    try {
      await Promise.all(this._trackPromises);
    } catch (error) {
      if (!this._canceled) {
        void this.cancel();
      }
      throw error;
    }
    if (this._canceled) {
      await new Promise(() => {
      });
    }
    await this.output.finalize();
    if (this._computeProgress) {
      this.onProgress?.(1);
    }
  }
  /** Cancels the conversion process. Does nothing if the conversion is already complete. */
  async cancel() {
    if (this.output.state === "finalizing" || this.output.state === "finalized") {
      return;
    }
    if (this._canceled) {
      console.warn("Conversion already canceled.");
      return;
    }
    this._canceled = true;
    await this.output.cancel();
  }
  /** @internal */
  async _processVideoTrack(track, trackOptions) {
    const sourceCodec = track.codec;
    if (!sourceCodec) {
      this.discardedTracks.push({
        track,
        reason: "unknown_source_codec"
      });
      return;
    }
    let videoSource;
    const totalRotation = normalizeRotation(track.rotation + (trackOptions.rotate ?? 0));
    const outputSupportsRotation = this.output.format.supportsVideoRotationMetadata;
    const [rotatedWidth, rotatedHeight] = totalRotation % 180 === 0 ? [track.codedWidth, track.codedHeight] : [track.codedHeight, track.codedWidth];
    const crop = trackOptions.crop;
    if (crop) {
      clampCropRectangle(crop, rotatedWidth, rotatedHeight);
    }
    const [originalWidth, originalHeight] = crop ? [crop.width, crop.height] : [rotatedWidth, rotatedHeight];
    let width = originalWidth;
    let height = originalHeight;
    const aspectRatio = width / height;
    const ceilToMultipleOfTwo = (value) => Math.ceil(value / 2) * 2;
    if (trackOptions.width !== void 0 && trackOptions.height === void 0) {
      width = ceilToMultipleOfTwo(trackOptions.width);
      height = ceilToMultipleOfTwo(Math.round(width / aspectRatio));
    } else if (trackOptions.width === void 0 && trackOptions.height !== void 0) {
      height = ceilToMultipleOfTwo(trackOptions.height);
      width = ceilToMultipleOfTwo(Math.round(height * aspectRatio));
    } else if (trackOptions.width !== void 0 && trackOptions.height !== void 0) {
      width = ceilToMultipleOfTwo(trackOptions.width);
      height = ceilToMultipleOfTwo(trackOptions.height);
    }
    const firstTimestamp = await track.getFirstTimestamp();
    const needsTranscode = !!trackOptions.forceTranscode || this._startTimestamp > 0 || firstTimestamp < 0 || !!trackOptions.frameRate || trackOptions.keyFrameInterval !== void 0;
    let needsRerender = width !== originalWidth || height !== originalHeight || totalRotation !== 0 && !outputSupportsRotation || !!crop;
    const alpha = trackOptions.alpha ?? "discard";
    let videoCodecs = this.output.format.getSupportedVideoCodecs();
    if (!needsTranscode && !trackOptions.bitrate && !needsRerender && videoCodecs.includes(sourceCodec) && (!trackOptions.codec || trackOptions.codec === sourceCodec)) {
      const source = new EncodedVideoPacketSource(sourceCodec);
      videoSource = source;
      this._trackPromises.push((async () => {
        await this._started;
        const sink = new EncodedPacketSink(track);
        const decoderConfig = await track.getDecoderConfig();
        const meta = { decoderConfig: decoderConfig ?? void 0 };
        const endPacket = Number.isFinite(this._endTimestamp) ? await sink.getPacket(this._endTimestamp, { metadataOnly: true }) ?? void 0 : void 0;
        for await (const packet of sink.packets(void 0, endPacket, { verifyKeyPackets: true })) {
          if (this._synchronizer.shouldWait(track.id, packet.timestamp)) {
            await this._synchronizer.wait(packet.timestamp);
          }
          if (this._canceled) {
            return;
          }
          if (alpha === "discard") {
            delete packet.sideData.alpha;
            delete packet.sideData.alphaByteLength;
          }
          await source.add(packet, meta);
          this._reportProgress(track.id, packet.timestamp + packet.duration);
        }
        source.close();
        this._synchronizer.closeTrack(track.id);
      })());
    } else {
      const canDecode = await track.canDecode();
      if (!canDecode) {
        this.discardedTracks.push({
          track,
          reason: "undecodable_source_codec"
        });
        return;
      }
      if (trackOptions.codec) {
        videoCodecs = videoCodecs.filter((codec) => codec === trackOptions.codec);
      }
      const bitrate = trackOptions.bitrate ?? QUALITY_HIGH;
      const encodableCodec = await getFirstEncodableVideoCodec(videoCodecs, { width, height, bitrate });
      if (!encodableCodec) {
        this.discardedTracks.push({
          track,
          reason: "no_encodable_target_codec"
        });
        return;
      }
      const encodingConfig = {
        codec: encodableCodec,
        bitrate,
        keyFrameInterval: trackOptions.keyFrameInterval,
        sizeChangeBehavior: trackOptions.fit ?? "passThrough",
        alpha,
        onEncodedPacket: (sample) => this._reportProgress(track.id, sample.timestamp + sample.duration)
      };
      const source = new VideoSampleSource(encodingConfig);
      videoSource = source;
      if (!needsRerender) {
        const tempOutput = new Output({
          format: new Mp4OutputFormat(),
          // Supports all video codecs
          target: new NullTarget()
        });
        const tempSource = new VideoSampleSource(encodingConfig);
        tempOutput.addVideoTrack(tempSource);
        await tempOutput.start();
        const sink = new VideoSampleSink(track);
        const firstSample = await sink.getSample(firstTimestamp);
        if (firstSample) {
          try {
            await tempSource.add(firstSample);
            firstSample.close();
            await tempOutput.finalize();
          } catch (error) {
            console.info("Error when probing encoder support. Falling back to rerender path.", error);
            needsRerender = true;
            void tempOutput.cancel();
          }
        } else {
          await tempOutput.cancel();
        }
      }
      if (needsRerender) {
        this._trackPromises.push((async () => {
          await this._started;
          const sink = new CanvasSink(track, {
            width,
            height,
            fit: trackOptions.fit ?? "fill",
            rotation: totalRotation,
            // Bake the rotation into the output
            crop: trackOptions.crop,
            poolSize: 1,
            alpha: alpha === "keep"
          });
          const iterator = sink.canvases(this._startTimestamp, this._endTimestamp);
          const frameRate = trackOptions.frameRate;
          let lastCanvas = null;
          let lastCanvasTimestamp = null;
          let lastCanvasEndTimestamp = null;
          const padFrames = async (until) => {
            assert(lastCanvas);
            assert(frameRate !== void 0);
            const frameDifference = Math.round((until - lastCanvasTimestamp) * frameRate);
            for (let i = 1; i < frameDifference; i++) {
              const sample = new VideoSample(lastCanvas, {
                timestamp: lastCanvasTimestamp + i / frameRate,
                duration: 1 / frameRate
              });
              await source.add(sample);
            }
          };
          for await (const { canvas, timestamp, duration } of iterator) {
            if (this._synchronizer.shouldWait(track.id, timestamp)) {
              await this._synchronizer.wait(timestamp);
            }
            if (this._canceled) {
              return;
            }
            let adjustedSampleTimestamp = Math.max(timestamp - this._startTimestamp, 0);
            lastCanvasEndTimestamp = adjustedSampleTimestamp + duration;
            if (frameRate !== void 0) {
              const alignedTimestamp = Math.floor(adjustedSampleTimestamp * frameRate) / frameRate;
              if (lastCanvas !== null) {
                if (alignedTimestamp <= lastCanvasTimestamp) {
                  lastCanvas = canvas;
                  lastCanvasTimestamp = alignedTimestamp;
                  continue;
                } else {
                  await padFrames(alignedTimestamp);
                }
              }
              adjustedSampleTimestamp = alignedTimestamp;
            }
            const sample = new VideoSample(canvas, {
              timestamp: adjustedSampleTimestamp,
              duration: frameRate !== void 0 ? 1 / frameRate : duration
            });
            await source.add(sample);
            if (frameRate !== void 0) {
              lastCanvas = canvas;
              lastCanvasTimestamp = adjustedSampleTimestamp;
            } else {
              sample.close();
            }
          }
          if (lastCanvas) {
            assert(lastCanvasEndTimestamp !== null);
            assert(frameRate !== void 0);
            await padFrames(Math.floor(lastCanvasEndTimestamp * frameRate) / frameRate);
          }
          source.close();
          this._synchronizer.closeTrack(track.id);
        })());
      } else {
        this._trackPromises.push((async () => {
          await this._started;
          const sink = new VideoSampleSink(track);
          const frameRate = trackOptions.frameRate;
          let lastSample = null;
          let lastSampleTimestamp = null;
          let lastSampleEndTimestamp = null;
          const padFrames = async (until) => {
            assert(lastSample);
            assert(frameRate !== void 0);
            const frameDifference = Math.round((until - lastSampleTimestamp) * frameRate);
            for (let i = 1; i < frameDifference; i++) {
              lastSample.setTimestamp(lastSampleTimestamp + i / frameRate);
              lastSample.setDuration(1 / frameRate);
              await source.add(lastSample);
            }
            lastSample.close();
          };
          for await (const sample of sink.samples(this._startTimestamp, this._endTimestamp)) {
            if (this._synchronizer.shouldWait(track.id, sample.timestamp)) {
              await this._synchronizer.wait(sample.timestamp);
            }
            if (this._canceled) {
              lastSample?.close();
              return;
            }
            let adjustedSampleTimestamp = Math.max(sample.timestamp - this._startTimestamp, 0);
            lastSampleEndTimestamp = adjustedSampleTimestamp + sample.duration;
            if (frameRate !== void 0) {
              const alignedTimestamp = Math.floor(adjustedSampleTimestamp * frameRate) / frameRate;
              if (lastSample !== null) {
                if (alignedTimestamp <= lastSampleTimestamp) {
                  lastSample.close();
                  lastSample = sample;
                  lastSampleTimestamp = alignedTimestamp;
                  continue;
                } else {
                  await padFrames(alignedTimestamp);
                }
              }
              adjustedSampleTimestamp = alignedTimestamp;
              sample.setDuration(1 / frameRate);
            }
            sample.setTimestamp(adjustedSampleTimestamp);
            await source.add(sample);
            if (frameRate !== void 0) {
              lastSample = sample;
              lastSampleTimestamp = adjustedSampleTimestamp;
            } else {
              sample.close();
            }
          }
          if (lastSample) {
            assert(lastSampleEndTimestamp !== null);
            assert(frameRate !== void 0);
            await padFrames(Math.floor(lastSampleEndTimestamp * frameRate) / frameRate);
          }
          source.close();
          this._synchronizer.closeTrack(track.id);
        })());
      }
    }
    this.output.addVideoTrack(videoSource, {
      frameRate: trackOptions.frameRate,
      // TEMP: This condition can be removed when all demuxers properly homogenize to BCP47 in v2
      languageCode: isIso639Dash2LanguageCode(track.languageCode) ? track.languageCode : void 0,
      name: track.name ?? void 0,
      rotation: needsRerender ? 0 : totalRotation
      // Rerendering will bake the rotation into the output
    });
    this._addedCounts.video++;
    this._totalTrackCount++;
    this.utilizedTracks.push(track);
  }
  /** @internal */
  async _processAudioTrack(track, trackOptions) {
    const sourceCodec = track.codec;
    if (!sourceCodec) {
      this.discardedTracks.push({
        track,
        reason: "unknown_source_codec"
      });
      return;
    }
    let audioSource;
    const originalNumberOfChannels = track.numberOfChannels;
    const originalSampleRate = track.sampleRate;
    const firstTimestamp = await track.getFirstTimestamp();
    let numberOfChannels = trackOptions.numberOfChannels ?? originalNumberOfChannels;
    let sampleRate = trackOptions.sampleRate ?? originalSampleRate;
    let needsResample = numberOfChannels !== originalNumberOfChannels || sampleRate !== originalSampleRate || this._startTimestamp > 0 || firstTimestamp < 0;
    let audioCodecs = this.output.format.getSupportedAudioCodecs();
    if (!trackOptions.forceTranscode && !trackOptions.bitrate && !needsResample && audioCodecs.includes(sourceCodec) && (!trackOptions.codec || trackOptions.codec === sourceCodec)) {
      const source = new EncodedAudioPacketSource(sourceCodec);
      audioSource = source;
      this._trackPromises.push((async () => {
        await this._started;
        const sink = new EncodedPacketSink(track);
        const decoderConfig = await track.getDecoderConfig();
        const meta = { decoderConfig: decoderConfig ?? void 0 };
        const endPacket = Number.isFinite(this._endTimestamp) ? await sink.getPacket(this._endTimestamp, { metadataOnly: true }) ?? void 0 : void 0;
        for await (const packet of sink.packets(void 0, endPacket)) {
          if (this._synchronizer.shouldWait(track.id, packet.timestamp)) {
            await this._synchronizer.wait(packet.timestamp);
          }
          if (this._canceled) {
            return;
          }
          await source.add(packet, meta);
          this._reportProgress(track.id, packet.timestamp + packet.duration);
        }
        source.close();
        this._synchronizer.closeTrack(track.id);
      })());
    } else {
      const canDecode = await track.canDecode();
      if (!canDecode) {
        this.discardedTracks.push({
          track,
          reason: "undecodable_source_codec"
        });
        return;
      }
      let codecOfChoice = null;
      if (trackOptions.codec) {
        audioCodecs = audioCodecs.filter((codec) => codec === trackOptions.codec);
      }
      const bitrate = trackOptions.bitrate ?? QUALITY_HIGH;
      const encodableCodecs = await getEncodableAudioCodecs(audioCodecs, {
        numberOfChannels,
        sampleRate,
        bitrate
      });
      if (!encodableCodecs.some((codec) => NON_PCM_AUDIO_CODECS.includes(codec)) && audioCodecs.some((codec) => NON_PCM_AUDIO_CODECS.includes(codec)) && (numberOfChannels !== FALLBACK_NUMBER_OF_CHANNELS || sampleRate !== FALLBACK_SAMPLE_RATE)) {
        const encodableCodecsWithDefaultParams = await getEncodableAudioCodecs(audioCodecs, {
          numberOfChannels: FALLBACK_NUMBER_OF_CHANNELS,
          sampleRate: FALLBACK_SAMPLE_RATE,
          bitrate
        });
        const nonPcmCodec = encodableCodecsWithDefaultParams.find((codec) => NON_PCM_AUDIO_CODECS.includes(codec));
        if (nonPcmCodec) {
          needsResample = true;
          codecOfChoice = nonPcmCodec;
          numberOfChannels = FALLBACK_NUMBER_OF_CHANNELS;
          sampleRate = FALLBACK_SAMPLE_RATE;
        }
      } else {
        codecOfChoice = encodableCodecs[0] ?? null;
      }
      if (codecOfChoice === null) {
        this.discardedTracks.push({
          track,
          reason: "no_encodable_target_codec"
        });
        return;
      }
      if (needsResample) {
        audioSource = this._resampleAudio(track, codecOfChoice, numberOfChannels, sampleRate, bitrate);
      } else {
        const source = new AudioSampleSource({
          codec: codecOfChoice,
          bitrate,
          onEncodedPacket: (packet) => this._reportProgress(track.id, packet.timestamp + packet.duration)
        });
        audioSource = source;
        this._trackPromises.push((async () => {
          await this._started;
          const sink = new AudioSampleSink(track);
          for await (const sample of sink.samples(void 0, this._endTimestamp)) {
            if (this._synchronizer.shouldWait(track.id, sample.timestamp)) {
              await this._synchronizer.wait(sample.timestamp);
            }
            if (this._canceled) {
              return;
            }
            await source.add(sample);
            sample.close();
          }
          source.close();
          this._synchronizer.closeTrack(track.id);
        })());
      }
    }
    this.output.addAudioTrack(audioSource, {
      // TEMP: This condition can be removed when all demuxers properly homogenize to BCP47 in v2
      languageCode: isIso639Dash2LanguageCode(track.languageCode) ? track.languageCode : void 0,
      name: track.name ?? void 0
    });
    this._addedCounts.audio++;
    this._totalTrackCount++;
    this.utilizedTracks.push(track);
  }
  /** @internal */
  async _processSubtitleTrack(track, trackOptions) {
    const sourceCodec = track.codec;
    if (!sourceCodec) {
      this.discardedTracks.push({
        track,
        reason: "unknown_source_codec"
      });
      return;
    }
    let targetCodec = trackOptions.codec ?? sourceCodec;
    const supportedCodecs = this.output.format.getSupportedSubtitleCodecs();
    if (!supportedCodecs.includes(targetCodec)) {
      if (!trackOptions.codec && supportedCodecs.includes(sourceCodec)) {
        targetCodec = sourceCodec;
      } else {
        this.discardedTracks.push({
          track,
          reason: "no_encodable_target_codec"
        });
        return;
      }
    }
    const subtitleSource = new TextSubtitleSource(targetCodec);
    this._trackPromises.push((async () => {
      await this._started;
      let subtitleText;
      if (this._startTimestamp === 0 && !Number.isFinite(this._endTimestamp) && targetCodec === sourceCodec) {
        subtitleText = await track.exportToText();
      } else {
        const cues = [];
        for await (const cue of track.getCues()) {
          const cueEndTime = cue.timestamp + cue.duration;
          if (this._startTimestamp > 0 || Number.isFinite(this._endTimestamp)) {
            if (cueEndTime <= this._startTimestamp || cue.timestamp >= this._endTimestamp) {
              continue;
            }
            const adjustedTimestamp = Math.max(cue.timestamp - this._startTimestamp, 0);
            const adjustedEndTime = Math.min(cueEndTime - this._startTimestamp, this._endTimestamp - this._startTimestamp);
            cues.push({
              ...cue,
              timestamp: adjustedTimestamp,
              duration: adjustedEndTime - adjustedTimestamp
            });
          } else {
            cues.push(cue);
          }
          if (this._canceled) {
            return;
          }
        }
        if (targetCodec === "srt") {
          subtitleText = formatCuesToSrt(cues);
        } else if (targetCodec === "webvtt") {
          subtitleText = formatCuesToWebVTT(cues);
        } else if (targetCodec === "ass" || targetCodec === "ssa") {
          let header = "";
          if (sourceCodec === "ass" || sourceCodec === "ssa") {
            const fullText = await track.exportToText();
            const eventsIndex = fullText.indexOf("[Events]");
            if (eventsIndex !== -1) {
              const formatMatch = fullText.substring(eventsIndex).match(/Format:[^\n]+\n/);
              if (formatMatch) {
                header = fullText.substring(0, eventsIndex + formatMatch.index + formatMatch[0].length);
              }
            }
          }
          subtitleText = formatCuesToAss(cues, header);
        } else {
          subtitleText = await track.exportToText(targetCodec);
        }
      }
      await subtitleSource.add(subtitleText);
      subtitleSource.close();
    })());
    this.output.addSubtitleTrack(subtitleSource, {
      languageCode: isIso639Dash2LanguageCode(track.languageCode) ? track.languageCode : void 0,
      name: track.name ?? void 0
    });
    this._addedCounts.subtitle++;
    this._totalTrackCount++;
    this.utilizedTracks.push(track);
  }
  /** @internal */
  _resampleAudio(track, codec, targetNumberOfChannels, targetSampleRate, bitrate) {
    const source = new AudioSampleSource({
      codec,
      bitrate,
      onEncodedPacket: (packet) => this._reportProgress(track.id, packet.timestamp + packet.duration)
    });
    this._trackPromises.push((async () => {
      await this._started;
      const resampler = new AudioResampler({
        targetNumberOfChannels,
        targetSampleRate,
        startTime: this._startTimestamp,
        endTime: this._endTimestamp,
        onSample: (sample) => source.add(sample)
      });
      const sink = new AudioSampleSink(track);
      const iterator = sink.samples(this._startTimestamp, this._endTimestamp);
      for await (const sample of iterator) {
        if (this._synchronizer.shouldWait(track.id, sample.timestamp)) {
          await this._synchronizer.wait(sample.timestamp);
        }
        if (this._canceled) {
          return;
        }
        await resampler.add(sample);
      }
      await resampler.finalize();
      source.close();
      this._synchronizer.closeTrack(track.id);
    })());
    return source;
  }
  /** @internal */
  _reportProgress(trackId, endTimestamp) {
    if (!this._computeProgress) {
      return;
    }
    assert(this._totalDuration !== null);
    this._maxTimestamps.set(
      trackId,
      Math.max(endTimestamp, this._maxTimestamps.get(trackId))
    );
    const minTimestamp = Math.min(...this._maxTimestamps.values());
    const newProgress = clamp(minTimestamp / this._totalDuration, 0, 1);
    if (newProgress !== this._lastProgress) {
      this._lastProgress = newProgress;
      this.onProgress?.(newProgress);
    }
  }
};
var MAX_TIMESTAMP_GAP = 5;
var TrackSynchronizer = class {
  constructor() {
    this.maxTimestamps = /* @__PURE__ */ new Map();
    // Track ID -> timestamp
    this.resolvers = [];
  }
  computeMinAndMaybeResolve() {
    let newMin = Infinity;
    for (const [, timestamp] of this.maxTimestamps) {
      newMin = Math.min(newMin, timestamp);
    }
    for (let i = 0; i < this.resolvers.length; i++) {
      const entry = this.resolvers[i];
      if (entry.timestamp - newMin < MAX_TIMESTAMP_GAP) {
        entry.resolve();
        this.resolvers.splice(i, 1);
        i--;
      }
    }
    return newMin;
  }
  shouldWait(trackId, timestamp) {
    this.maxTimestamps.set(trackId, Math.max(timestamp, this.maxTimestamps.get(trackId) ?? -Infinity));
    const newMin = this.computeMinAndMaybeResolve();
    return timestamp - newMin >= MAX_TIMESTAMP_GAP;
  }
  wait(timestamp) {
    const { promise, resolve } = promiseWithResolvers();
    this.resolvers.push({
      timestamp,
      resolve
    });
    return promise;
  }
  closeTrack(trackId) {
    this.maxTimestamps.delete(trackId);
    this.computeMinAndMaybeResolve();
  }
};
var AudioResampler = class {
  constructor(options) {
    this.sourceSampleRate = null;
    this.sourceNumberOfChannels = null;
    this.targetSampleRate = options.targetSampleRate;
    this.targetNumberOfChannels = options.targetNumberOfChannels;
    this.startTime = options.startTime;
    this.endTime = options.endTime;
    this.onSample = options.onSample;
    this.bufferSizeInFrames = Math.floor(this.targetSampleRate * 5);
    this.bufferSizeInSamples = this.bufferSizeInFrames * this.targetNumberOfChannels;
    this.outputBuffer = new Float32Array(this.bufferSizeInSamples);
    this.bufferStartFrame = 0;
    this.maxWrittenFrame = -1;
  }
  /**
   * Sets up the channel mixer to handle up/downmixing in the case where input and output channel counts don't match.
   */
  doChannelMixerSetup() {
    assert(this.sourceNumberOfChannels !== null);
    const sourceNum = this.sourceNumberOfChannels;
    const targetNum = this.targetNumberOfChannels;
    if (sourceNum === 1 && targetNum === 2) {
      this.channelMixer = (sourceData, sourceFrameIndex) => {
        return sourceData[sourceFrameIndex * sourceNum];
      };
    } else if (sourceNum === 1 && targetNum === 4) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return sourceData[sourceFrameIndex * sourceNum] * +(targetChannelIndex < 2);
      };
    } else if (sourceNum === 1 && targetNum === 6) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return sourceData[sourceFrameIndex * sourceNum] * +(targetChannelIndex === 2);
      };
    } else if (sourceNum === 2 && targetNum === 1) {
      this.channelMixer = (sourceData, sourceFrameIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return 0.5 * (sourceData[baseIdx] + sourceData[baseIdx + 1]);
      };
    } else if (sourceNum === 2 && targetNum === 4) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return sourceData[sourceFrameIndex * sourceNum + targetChannelIndex] * +(targetChannelIndex < 2);
      };
    } else if (sourceNum === 2 && targetNum === 6) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return sourceData[sourceFrameIndex * sourceNum + targetChannelIndex] * +(targetChannelIndex < 2);
      };
    } else if (sourceNum === 4 && targetNum === 1) {
      this.channelMixer = (sourceData, sourceFrameIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return 0.25 * (sourceData[baseIdx] + sourceData[baseIdx + 1] + sourceData[baseIdx + 2] + sourceData[baseIdx + 3]);
      };
    } else if (sourceNum === 4 && targetNum === 2) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return 0.5 * (sourceData[baseIdx + targetChannelIndex] + sourceData[baseIdx + targetChannelIndex + 2]);
      };
    } else if (sourceNum === 4 && targetNum === 6) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        if (targetChannelIndex < 2) return sourceData[baseIdx + targetChannelIndex];
        if (targetChannelIndex === 2 || targetChannelIndex === 3) return 0;
        return sourceData[baseIdx + targetChannelIndex - 2];
      };
    } else if (sourceNum === 6 && targetNum === 1) {
      this.channelMixer = (sourceData, sourceFrameIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return Math.SQRT1_2 * (sourceData[baseIdx] + sourceData[baseIdx + 1]) + sourceData[baseIdx + 2] + 0.5 * (sourceData[baseIdx + 4] + sourceData[baseIdx + 5]);
      };
    } else if (sourceNum === 6 && targetNum === 2) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        return sourceData[baseIdx + targetChannelIndex] + Math.SQRT1_2 * (sourceData[baseIdx + 2] + sourceData[baseIdx + targetChannelIndex + 4]);
      };
    } else if (sourceNum === 6 && targetNum === 4) {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        const baseIdx = sourceFrameIndex * sourceNum;
        if (targetChannelIndex < 2) {
          return sourceData[baseIdx + targetChannelIndex] + Math.SQRT1_2 * sourceData[baseIdx + 2];
        }
        return sourceData[baseIdx + targetChannelIndex + 2];
      };
    } else {
      this.channelMixer = (sourceData, sourceFrameIndex, targetChannelIndex) => {
        return targetChannelIndex < sourceNum ? sourceData[sourceFrameIndex * sourceNum + targetChannelIndex] : 0;
      };
    }
  }
  ensureTempBufferSize(requiredSamples) {
    let length = this.tempSourceBuffer.length;
    while (length < requiredSamples) {
      length *= 2;
    }
    if (length !== this.tempSourceBuffer.length) {
      const newBuffer = new Float32Array(length);
      newBuffer.set(this.tempSourceBuffer);
      this.tempSourceBuffer = newBuffer;
    }
  }
  async add(audioSample) {
    if (this.sourceSampleRate === null) {
      this.sourceSampleRate = audioSample.sampleRate;
      this.sourceNumberOfChannels = audioSample.numberOfChannels;
      this.tempSourceBuffer = new Float32Array(this.sourceSampleRate * this.sourceNumberOfChannels);
      this.doChannelMixerSetup();
    }
    const requiredSamples = audioSample.numberOfFrames * audioSample.numberOfChannels;
    this.ensureTempBufferSize(requiredSamples);
    const sourceDataSize = audioSample.allocationSize({ planeIndex: 0, format: "f32" });
    const sourceView = new Float32Array(this.tempSourceBuffer.buffer, 0, sourceDataSize / 4);
    audioSample.copyTo(sourceView, { planeIndex: 0, format: "f32" });
    const inputStartTime = audioSample.timestamp - this.startTime;
    const inputDuration = audioSample.numberOfFrames / this.sourceSampleRate;
    const inputEndTime = Math.min(inputStartTime + inputDuration, this.endTime - this.startTime);
    const outputStartFrame = Math.floor(inputStartTime * this.targetSampleRate);
    const outputEndFrame = Math.ceil(inputEndTime * this.targetSampleRate);
    for (let outputFrame = outputStartFrame; outputFrame < outputEndFrame; outputFrame++) {
      if (outputFrame < this.bufferStartFrame) {
        continue;
      }
      while (outputFrame >= this.bufferStartFrame + this.bufferSizeInFrames) {
        await this.finalizeCurrentBuffer();
        this.bufferStartFrame += this.bufferSizeInFrames;
      }
      const bufferFrameIndex = outputFrame - this.bufferStartFrame;
      assert(bufferFrameIndex < this.bufferSizeInFrames);
      const outputTime = outputFrame / this.targetSampleRate;
      const inputTime = outputTime - inputStartTime;
      const sourcePosition = inputTime * this.sourceSampleRate;
      const sourceLowerFrame = Math.floor(sourcePosition);
      const sourceUpperFrame = Math.ceil(sourcePosition);
      const fraction = sourcePosition - sourceLowerFrame;
      for (let targetChannel = 0; targetChannel < this.targetNumberOfChannels; targetChannel++) {
        let lowerSample = 0;
        let upperSample = 0;
        if (sourceLowerFrame >= 0 && sourceLowerFrame < audioSample.numberOfFrames) {
          lowerSample = this.channelMixer(sourceView, sourceLowerFrame, targetChannel);
        }
        if (sourceUpperFrame >= 0 && sourceUpperFrame < audioSample.numberOfFrames) {
          upperSample = this.channelMixer(sourceView, sourceUpperFrame, targetChannel);
        }
        const outputSample = lowerSample + fraction * (upperSample - lowerSample);
        const outputIndex = bufferFrameIndex * this.targetNumberOfChannels + targetChannel;
        this.outputBuffer[outputIndex] += outputSample;
      }
      this.maxWrittenFrame = Math.max(this.maxWrittenFrame, bufferFrameIndex);
    }
  }
  async finalizeCurrentBuffer() {
    if (this.maxWrittenFrame < 0) {
      return;
    }
    const samplesWritten = (this.maxWrittenFrame + 1) * this.targetNumberOfChannels;
    const outputData = new Float32Array(samplesWritten);
    outputData.set(this.outputBuffer.subarray(0, samplesWritten));
    const timestampSeconds = this.bufferStartFrame / this.targetSampleRate;
    const audioSample = new AudioSample({
      format: "f32",
      sampleRate: this.targetSampleRate,
      numberOfChannels: this.targetNumberOfChannels,
      timestamp: timestampSeconds,
      data: outputData
    });
    await this.onSample(audioSample);
    this.outputBuffer.fill(0);
    this.maxWrittenFrame = -1;
  }
  finalize() {
    return this.finalizeCurrentBuffer();
  }
};

// src/index.ts
init_subtitles();
export {
  ADTS,
  ALL_FORMATS,
  ALL_TRACK_TYPES,
  AUDIO_CODECS,
  AVI,
  AdtsInputFormat,
  AdtsOutputFormat,
  AttachedFile,
  AudioBufferSink,
  AudioBufferSource,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  AudioSource,
  AviInputFormat,
  AviOutputFormat,
  BaseMediaSampleSink,
  BlobSource,
  BufferSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Conversion,
  CustomAudioDecoder,
  CustomAudioEncoder,
  CustomVideoDecoder,
  CustomVideoEncoder,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  FLAC,
  FilePathSource,
  FilePathTarget,
  FlacInputFormat,
  FlacOutputFormat,
  Input,
  InputAudioTrack,
  InputDisposedError,
  InputFormat,
  InputSubtitleTrack,
  InputTrack,
  InputVideoTrack,
  IsobmffInputFormat,
  IsobmffOutputFormat2 as IsobmffOutputFormat,
  MATROSKA,
  MP3,
  MP4,
  MatroskaInputFormat,
  MediaSource,
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  MkvOutputFormat2 as MkvOutputFormat,
  MovOutputFormat,
  Mp3InputFormat,
  Mp3OutputFormat,
  Mp4InputFormat,
  Mp4OutputFormat,
  NON_PCM_AUDIO_CODECS,
  NullTarget,
  OGG,
  OggInputFormat,
  OggOutputFormat,
  Output,
  OutputFormat,
  PCM_AUDIO_CODECS,
  QTFF,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  QUALITY_VERY_LOW,
  Quality,
  QuickTimeInputFormat,
  ReadableStreamSource,
  RichImageData,
  SUBTITLE_CODECS,
  Source,
  StreamSource,
  StreamTarget,
  SubtitleSource,
  Target,
  TextSubtitleSource,
  UrlSource,
  VIDEO_CODECS,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  VideoSource,
  WAVE,
  WEBM,
  WavOutputFormat,
  WaveInputFormat,
  WebMInputFormat,
  WebMOutputFormat,
  canEncode,
  canEncodeAudio,
  canEncodeSubtitles,
  canEncodeVideo,
  formatAssTimestamp,
  formatCuesToAss,
  formatCuesToSrt,
  formatCuesToWebVTT,
  formatSrtTimestamp,
  getEncodableAudioCodecs,
  getEncodableCodecs,
  getEncodableSubtitleCodecs,
  getEncodableVideoCodecs,
  getFirstEncodableAudioCodec,
  getFirstEncodableSubtitleCodec,
  getFirstEncodableVideoCodec,
  parseAssTimestamp,
  parseSrtTimestamp,
  registerDecoder,
  registerEncoder,
  splitAssIntoCues,
  splitSrtIntoCues
};
