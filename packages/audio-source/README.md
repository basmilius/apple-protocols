# @corewire/audio-source

Audio sources for AirPlay streaming, each delivering 44100 Hz 16-bit stereo PCM. There are decoders for files and URLs (MP3, OGG Vorbis, WAV, FLAC, QOA), raw PCM, FFmpeg, a sine wave and a live ring buffer.

Part of [CoreWire](https://corewire.dev).

## Install

```sh
npm install @corewire/audio-source@next
```

Requires Node.js 18.17 or later (20.3 or later on the 20 line). `FfmpegSource` needs `ffmpeg` on the PATH.

## Example

```ts
import { UrlSource } from '@corewire/audio-source';
import { HomePod } from '@corewire/devices';

const pod = new HomePod({address: '192.168.1.20'});
await pod.connect();

const source = await UrlSource.fromUrl('https://example.com/chime.mp3');
const playback = await pod.media.streamAudio(source, {volume: 0.3});

await playback.ended;
await pod.disconnect();
```

## License

MIT
