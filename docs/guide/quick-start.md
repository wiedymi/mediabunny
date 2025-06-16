# Quick start

This page is a collection of short code snippets to showcase the most common operations you may use this library for.

## Reading file metadata

```ts
import { Input, ALL_FORMATS, BlobSource } from 'mediabunny';

const input = new Input({
	formats: ALL_FORMATS,
	source: new BlobSource(file), // Assuming a File instance
});

const duration = await input.computeDuration(); // in seconds

const videoTrack = await input.getPrimaryVideoTrack();
if (videoTrack) {
	const width = videoTrack.displayWidth;
	const height = videoTrack.displayHeight;
	const rotation = videoTrack.rotation; // in degrees clockwise
}

const audioTrack = await input.getPrimaryAudioTrack();
if (audioTrack) {
	const numberOfChannels = audioTrack.numberOfChannels;
	const sampleRate = audioTrack.sampleRate; // in Hz
}
```

## Reading media data