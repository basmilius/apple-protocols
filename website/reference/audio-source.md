# @corewire/audio-source

```ts
import { File, Live, Url } from '@corewire/audio-source';
```

Every source implements `AudioSource` from `@corewire/airplay` and produces 44100 Hz stereo signed 16-bit big-endian PCM. See [URLs and audio streams](/guide/media#audio-sources).

| Export | Description |
| --- | --- |
| `abstract class BufferAudioSource` | A source over a decoded PCM buffer. `constructor(buffer: Buffer, duration: number, frameSize?: number)`; `readFrames()`, `reset()`, `start()`, `stop()` |
| `class Url extends BufferAudioSource` | `static fromUrl(url: string, options?: {format?: 'encoded' \| 'pcm'; signal?: AbortSignal; maxBytes?: number; timeoutMs?: number}): Promise<Url>`. Detects MP3, OGG Vorbis, FLAC, WAV and QOA; raw PCM needs `format: 'pcm'` |
| `class File extends BufferAudioSource` | `static fromPath(filePath: string): Promise<File>`. MP3, OGG and WAV; raw PCM otherwise |
| `class Mp3 extends BufferAudioSource` | `static fromBuffer(mp3Buffer: Buffer): Promise<Mp3>`, `static fromUrl(url: string): Promise<Mp3>` |
| `class Ogg extends BufferAudioSource` | `static fromBuffer(oggBuffer: Buffer): Promise<Ogg>`, `static fromUrl(url: string): Promise<Ogg>` |
| `class Wav extends BufferAudioSource` | `static fromBuffer(wavBuffer: Buffer): Promise<Wav>`, `static fromUrl(url: string): Promise<Wav>` |
| `class Pcm extends BufferAudioSource` | `constructor(pcmBuffer: Buffer, sampleRate = 44100)`; resamples to 44100 Hz when needed |
| `class SineWave extends BufferAudioSource` | `constructor(durationSeconds: number, frequency = 440, sampleRate = 44100, channels = 2, bytesPerChannel = 2)`; with a 50 ms fade in and out |
| `class Ffmpeg implements AudioSource` | `constructor(filePath: string, duration: number, sampleRate = 44100, channels = 2, bytesPerChannel = 2)`. Decodes with `ffmpeg` from the `PATH` while streaming; `stats` reports its buffer. `reset()` makes the next `start()` decode from the beginning |
| `class Live implements AudioSource` | `constructor(bufferDuration = 2)`. A ring buffer: `write(data: Buffer): number`, `end(): void`, `available`, `capacity`, `ended`. `duration` is `Infinity` |

## AudioSource

| Member | Description |
| --- | --- |
| `duration: number` | Seconds |
| `readFrames(count: number): Promise<Buffer \| null>` | Null when the source ran out |
| `reset(): Promise<void>` | Back to the start |
| `start(): Promise<void>` | Called once before the first read |
| `stop(): Promise<void>` | Called when the stream ends, fails or is cancelled |
