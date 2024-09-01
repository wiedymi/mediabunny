abstract class Target {

}

class ArrayBufferTarget extends Target {

}

class StreamTarget extends Target {

}

type OutputOptions = {
    format: 'mp4' | 'webm' | 'mkv',
    target: Target
};

class Output {
    constructor(options: OutputOptions) {

    }

    addVideoTrack(source: VideoSource) {

    }

    addAudioTrack(source: AudioSource) {

    }

    start() {
        
    }

    async finalize() {

    }
}

abstract class InputSource {

}

type InputOptions = {
    source: InputSource
};

class Input {
    constructor(options: InputOptions) {

    }
}

abstract class VideoSource {

}

abstract class AudioSource {
    
}

type VideoCodecConfig = {
    codec: 'avc' | 'hevc' | 'vp8' | 'vp9' | 'av1',
    bitrate: number 
};

type AudioCodecConfig = {
    codec: 'aac' | 'opus' | 'vorbis',
    bitrate: number
};

class VideoFrameSource extends VideoSource {
    constructor(codecConfig: VideoCodecConfig) {
        super();
    }

    digest(videoFrame: VideoFrame) {
        
    }
}

class CanvasSource extends VideoSource {
    constructor(canvas: HTMLCanvasElement, codecConfig: VideoCodecConfig) {
        super();
    }

    digest(timestamp: number) {

    }
}

class MediaStreamTrackVideoSource extends VideoSource {
    constructor(track: MediaStreamTrack, codecConfig: VideoCodecConfig) {
        super();
    }
}

class AudioDataSource extends AudioSource {
    constructor(audioData: AudioData, codecConfig: AudioCodecConfig) {
        super();
    }
}

class AudioBufferSource extends AudioSource {
    constructor(audioBuffer: AudioBuffer, codecConfig: AudioCodecConfig) {
        super();
    }
}

class MediaStreamTrackAudioSource extends AudioSource {
    constructor(track: MediaStreamTrack, codecConfig: AudioCodecConfig) {
        super();
    }
}

let output = new Output({
    format: 'mp4',
    target: new ArrayBufferTarget()
});

let source = new CanvasSource(document.createElement('canvas'), {
    codec: 'avc',
    bitrate: 1e6
});

output.addVideoTrack(source);

output.start();

source.digest(0)
source.digest(1)
source.digest(2)
source.digest(3)

output.finalize()