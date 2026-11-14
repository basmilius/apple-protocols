# URLs and audio streams

`device.media` plays audio and video that do not come from an app on the device. There are two ways, and they work differently:

- `playUrl()` hands the device a URL. The device fetches and plays it itself; your process only starts and watches playback.
- `streamAudio()` streams PCM audio from your process to the device over RTP. Your process decodes the audio and sends every packet.

Each runs on an AirPlay connection of its own, so remote control and now playing stay untouched. Starting a new one of a kind stops the previous one of that kind.

## Playing a URL

```ts
const playback = await tv.media.playUrl('https://example.com/stream.m3u8', {position: 30});

await playback.ended;
```

`playUrl(url, options?)` resolves once playback started. `position` is the start position in seconds; `signal` cancels the setup or ends the playback.

Only devices that play URLs themselves can do this. `supports('playUrl')` tells you. On a HomePod, `playUrl()` throws `UnavailableError` with reason `unsupported` before it opens a connection. A device that refuses the URL rejects with a `PlaybackError`.

## Streaming audio

Install `@corewire/audio-source` for ready sources, or write your own [`AudioSource`](#your-own-source).

```ts
import { Url } from '@corewire/audio-source';
import { HomePod } from '@corewire/devices';

const pod = new HomePod({address: '192.168.1.30'});
await pod.connect();

const source = await Url.fromUrl('https://example.com/song.mp3');
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

For a URL, `ended` starts watching the device on its first read. A consumer that never reads it sends nothing extra.

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

`@corewire/audio-source` decodes to the format AirPlay streams: 44100 Hz, stereo, signed 16-bit big-endian PCM.

| Source | Creates from |
| --- | --- |
| `Url.fromUrl(url, options?)` | A URL; detects MP3, OGG Vorbis, FLAC, WAV and QOA |
| `File.fromPath(path)` | A file; MP3, OGG and WAV, raw PCM otherwise |
| `Mp3`, `Ogg`, `Wav` | `fromBuffer(buffer)` or `fromUrl(url)` |
| `new Pcm(buffer, sampleRate?)` | Raw signed 16-bit big-endian stereo PCM, resampled to 44100 Hz when needed |
| `new Ffmpeg(path, duration)` | Anything `ffmpeg` reads; decodes while it streams. Needs `ffmpeg` on the `PATH` |
| `new Live(bufferDuration?)` | PCM you `write()` while the stream runs, such as a microphone or a mixer |
| `new SineWave(seconds, frequency?)` | A test tone, 440 Hz by default |

The decoded sources load the whole file into memory before streaming starts. Use `Ffmpeg` or `Live` for long or endless audio.

### Live input

```ts
import { Live } from '@corewire/audio-source';

const live = new Live(2);
const playback = await pod.media.streamAudio(live, {volume: 0.3});

declare function onPcm(listener: (chunk: Buffer) => void): void;

onPcm(chunk => live.write(chunk));

// Later: no more data.
live.end();
await playback.ended;
```

`Live` is a ring buffer that holds `bufferDuration` seconds (2 by default). When you write faster than the stream reads, it drops the oldest data.

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
