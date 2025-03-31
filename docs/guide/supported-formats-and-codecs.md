# Supported formats & codecs
 
## Container formats

Mediakit supports many commonly used media container formats, all of which are supported bidirectionally (reading & writing):

- ISOBMFF-based formats (.mp4, .m4v, .m4a, ...)
- QuickTime File Format (.mov)
- Matroska (.mkv)
- WebM (.webm)
- Ogg (.ogg)
- MP3 (.mp3)
- WAVE (.wav)

## Codecs

Mediakit supports a wide range of video, audio, and subtitle codecs. More specifically, it supports all codecs specified by the WebCodecs API and a few additional PCM codecs out of the box.

The availability of the codecs provided by the WebCodecs API depends on the browser and cannot be guaranteed by this library. Mediakit provides [special utility functions](#querying-codec-encodability) to check which codecs are able to be encoded. You can also specify [custom coders](./custom-coders) to provide your own encoder/decoder implementation if the browser doesn't support the codec natively.

### Video codecs

- `'avc'` - Advanced Video Coding (AVC) / H.264
- `'hevc'` - High Efficiency Video Coding (HEVC) / H.265
- `'vp8'` - VP8
- `'vp9'` - VP9
- `'av1'` - AOMedia Video 1 (AV1)

### Audio codecs

- `'aac'` - Advanced Audio Coding (AAC)
- `'opus'` - Opus
- `'mp3'` - MP3
- `'vorbis'` - Vorbis
- `'flac'` - Free Lossless Audio Codec (FLAC)
- `'pcm-u8'` - 8-bit unsigned PCM
- `'pcm-s8'` - 8-bit signed PCM
- `'pcm-s16'` - 16-bit little-endian signed PCM
- `'pcm-s16be'` - 16-bit big-endian signed PCM
- `'pcm-s24'` - 24-bit little-endian signed PCM
- `'pcm-s24be'` - 24-bit big-endian signed PCM
- `'pcm-s32'` - 32-bit little-endian signed PCM
- `'pcm-s32be'` - 32-bit big-endian signed PCM
- `'pcm-f32'` - 32-bit little-endian float PCM
- `'pcm-f32be'` - 32-bit big-endian float PCM
- `'ulaw'` - μ-law PCM
- `'alaw'` - A-law PCM

### Subtitle codecs

- `'webvtt'` - WebVTT

## Compatibility table

Not all codecs can be used with all containers. The following table specifies the supported codec-container combinations:

|                | .mp4[^1] | .mov  | .mkv  | .webm[^2] | .ogg  | .mp3  | .wav  |
|:--------------:|:--------:|:-----:|:-----:|:---------:|:-----:|:-----:|:-----:|
| `'avc'`        |    ✓     |   ✓   |   ✓   |           |       |       |       |
| `'hevc'`       |    ✓     |   ✓   |   ✓   |           |       |       |       |
| `'vp8'`        |    ✓     |   ✓   |   ✓   |     ✓     |       |       |       |
| `'vp9'`        |    ✓     |   ✓   |   ✓   |     ✓     |       |       |       |
| `'av1'`        |    ✓     |   ✓   |   ✓   |     ✓     |       |       |       |
| `'aac'`        |    ✓     |   ✓   |   ✓   |           |       |       |       |
| `'opus'`       |    ✓     |   ✓   |   ✓   |     ✓     |   ✓   |       |       |
| `'mp3'`        |    ✓     |   ✓   |   ✓   |           |       |   ✓   |       |
| `'vorbis'`     |    ✓     |   ✓   |   ✓   |     ✓     |   ✓   |       |       |
| `'flac'`       |    ✓     |   ✓   |   ✓   |           |       |       |       |
| `'pcm-u8'`     |          |   ✓   |   ✓   |           |       |       |   ✓   |
| `'pcm-s8'`     |          |   ✓   |       |           |       |       |       |
| `'pcm-s16'`    |          |   ✓   |   ✓   |           |       |       |   ✓   |
| `'pcm-s16be'`  |          |   ✓   |   ✓   |           |       |       |       |
| `'pcm-s24'`    |          |   ✓   |   ✓   |           |       |       |   ✓   |
| `'pcm-s24be'`  |          |   ✓   |   ✓   |           |       |       |       |
| `'pcm-s32'`    |          |   ✓   |   ✓   |           |       |       |   ✓   |
| `'pcm-s32be'`  |          |   ✓   |   ✓   |           |       |       |       |
| `'pcm-f32'`    |          |   ✓   |   ✓   |           |       |       |   ✓   |
| `'pcm-f32be'`  |          |   ✓   |       |           |       |       |       |
| `'ulaw'`       |          |   ✓   |       |           |       |       |   ✓   |
| `'alaw'`       |          |   ✓   |       |           |       |       |   ✓   |
| `'webvtt'`[^3] |   (✓)    |       |  (✓)  |    (✓)    |       |       |       |


[^1]: PCM audio codecs are not supported by MP4. If somebody were to include PCM audio in an MP4 anyway, this library would still be able to read it.
[^2]: WebM only supports a small subset of the codecs supported by Matroska. However, this library can technically read all codecs from a WebM that are supported by Matroska.
[^3]: WebVTT can only be written, not read.

## Querying codec encodability

Mediakit provides utility functions that you can use to check if the browser can encode a given codec. Additionally, you
can check if a codec is encodable with a specific _configuration_.

`canEncode` is a general-purpose function that can be called with all codecs and tests encodability using commonly used configurations:
```ts
import { canEncode } from 'mediakit';

canEncode('avc'); // => Promise<boolean>
canEncode('opus'); // => Promise<boolean>
```
Video codecs are checked using 1280x720 @1Mbps, while audio codecs are checked using 2 channels, 48 kHz @128kbps.

You can also check encodability using specific configurations:
```ts
import { canEncodeVideo, canEncodeAudio } from 'mediakit';

canEncodeVideo('hevc', {
	width: 1920, height: 1080, bitrate: 1e7
}); // => Promise<boolean>

canEncodeAudio('aac', {
	numberOfChannels: 1, sampleRate: 44100, bitrate: 192e3
}); // => Promise<boolean>
```

In addition, you can use the following functions which check encodability for multiple codecs at once and return a list of
supported codecs:
```ts
import {
	getEncodableCodecs,
	getEncodableVideoCodecs,
	getEncodableAudioCodecs,
	getEncodableSubtitleCodecs,
} from 'mediakit';

getEncodableCodecs(); // Promise<MediaCodec[]>
getEncodableVideoCodecs(); // Promise<VideoCodec[]>
getEncodableAudioCodecs(); // Promise<AudioCodec[]>
getEncodableSubtitleCodecs(); // Promise<SubtitleCodec[]>
```

These functions also accept optional configuration options:
```ts
import { getEncodableVideoCodecs } from 'mediakit';

// Checks only which of AVC, HEVC and VP8 can be encoded at 1280x720 @10Mbps:
getEncodableVideoCodecs(
	['avc', 'hevc', 'vp8'],
	{ width: 1920, height: 1080, bitrate: 1e7 },
); // => Promise<VideoCodec[]>
```

## Querying codec decodability

TODO link to input track