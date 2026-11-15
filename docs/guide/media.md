# URLs and audio streams

`device.media` plays audio and video that do not come from an app on the device. It has two methods that work differently:

- `playUrl()` hands the device a URL. The device fetches and plays it. Your process only starts and watches playback.
- `streamAudio()` streams PCM audio from your process to the device over RTP. Your process decodes the audio and sends every packet.

Each runs on its own AirPlay connection, so remote control and now playing stay untouched. A new URL playback stops the previous one, and a new audio stream stops the previous stream.

## Playing a URL

```ts
const playback = await tv.media.playUrl('https://example.com/stream.m3u8', {position: 30});

await playback.ended;
```

`playUrl(url, options?)` resolves once playback started. `position` is the start position in seconds. `signal` cancels the setup or ends the playback.

Only devices that play URLs themselves can do this. `supports('playUrl')` tells you. On a HomePod, `playUrl()` throws `UnavailableError` with reason `unsupported` before it opens a connection. A device that refuses the URL rejects with a `PlaybackError`.

## Streaming audio

Install `@corewire/audio-source` for ready sources, or write your own [`AudioSource`](#your-own-source).

```ts
import { UrlSource } from '@corewire/audio-source';
import { HomePod } from '@corewire/devices';

const pod = new HomePod({address: '192.168.1.30'});
await pod.connect();

const source = await UrlSource.fromUrl('https://example.com/song.mp3');
const playback = await pod.media.streamAudio(source, {volume: 0.4});

await playback.ended;
```

`streamAudio(source, options?)` resolves once the stream is set up. `volume` is 0 to 1, like device volume, and becomes the stream volume in decibels (`20 * log10(volume)`, -144 for 0). Without it the stream starts at -20 dB. `signal` cancels the setup or ends the stream.

The stream volume belongs to that stream. `device.volume` stays the volume of the device.

## MediaPlayback

Both methods resolve a `MediaPlayback`:

| Member | Meaning |
| --- | --- |
| `kind` | `url` or `audio` |
| `ended` | Settles when playback ended: the source ran out, the URL finished, `stop()` was called, or the AirPlay session of the device ended |
| `stop()` | Stops playback and closes its connection |

For a URL, `ended` starts watching the device on its first read. A consumer that never reads it sends nothing extra. `MediaPlayback` is an interface, so `instanceof` does not work on it. Check `kind` instead.

```ts
const playback = await tv.media.playUrl('https://example.com/movie.mp4');

setTimeout(() => playback.stop(), 60_000);

try {
    await playback.ended;
} catch (error) {
    console.warn('playback ended with an error', error);
}
```

## Audio sources

`@corewire/audio-source` decodes to the format AirPlay streams: 44100 Hz, stereo, signed 16-bit big-endian PCM. Every class name ends in `Source`.

| Source | Creates from |
| --- | --- |
| `UrlSource.fromUrl(url, options?)` | A URL; detects MP3, OGG Vorbis, FLAC, WAV and QOA |
| `FileSource.fromPath(path)` | A file; MP3, OGG and WAV, raw PCM otherwise |
| `Mp3Source`, `OggSource`, `WavSource` | `fromBuffer(data)` or `fromUrl(url, options?)` |
| `new PcmSource(pcm, {sampleRate?})` | Raw signed 16-bit big-endian stereo PCM, resampled to 44100 Hz when needed |
| `new FfmpegSource({path, duration})` | Anything `ffmpeg` reads; decodes while it streams. Needs `ffmpeg` on the `PATH` |
| `new LiveSource({bufferDuration?})` | PCM you `write()` while the stream runs, such as a microphone or a mixer |
| `new SineWaveSource({duration, frequency?})` | A test tone, 440 Hz by default |

Every `fromUrl()` takes the download limits of `FetchOptions`: `signal`, `maxBytes` (64 MiB by default) and `timeoutMs` (30 seconds by default). `UrlSource` also takes `format: 'pcm'` for raw PCM.

The decoded sources load the whole file into memory before streaming starts. Use `FfmpegSource` or `LiveSource` for long or endless audio. Decoding runs in a worker thread. When the worker file (`decode-worker.mjs`) cannot load, it runs on the calling thread instead.

### Live input

```ts
import { LiveSource } from '@corewire/audio-source';

const live = new LiveSource({bufferDuration: 2});
const playback = await pod.media.streamAudio(live, {volume: 0.3});

declare function onPcm(listener: (chunk: Buffer) => void): void;

onPcm(chunk => live.write(chunk));

// Later: no more data.
live.end();
await playback.ended;
```

`LiveSource` is a ring buffer that holds `bufferDuration` seconds (2 by default). When you write faster than the stream reads, it drops the oldest data.

### Your own source

An `AudioSource` produces interleaved 44100 Hz stereo PCM, signed 16-bit big-endian, in complete frames:

```ts
import type { AudioSource } from '@corewire/devices';

class Silence implements AudioSource {
    readonly duration = 5;

    #frames = 0;

    async start(): Promise<void> {}

    async stop(): Promise<void> {}

    async reset(): Promise<void> {
        this.#frames = 0;
    }

    async readFrames(count: number): Promise<Buffer | null> {
        if (this.#frames >= 44100 * this.duration) {
            return null;
        }

        this.#frames += count;

        return Buffer.alloc(count * 4);
    }
}
```

`readFrames()` returns null when the source ran out. The stream calls `start()` once and `stop()` when it ends, fails or is cancelled.
