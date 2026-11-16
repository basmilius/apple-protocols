# @apple-protocols/audio-source

```ts
import { FileSource, LiveSource, UrlSource } from '@apple-protocols/audio-source';
```

Every source implements `AudioSource` from `@apple-protocols/airplay` and produces 44100 Hz stereo signed 16-bit big-endian PCM. Every class name ends in `Source`, so none of them shadows a global such as `File` or `URL`. See [URLs and audio streams](/guide/media#audio-sources).

## Sources

| Export | Description |
| --- | --- |
| `abstract class BufferAudioSource` | A source over a decoded PCM buffer. `constructor(buffer: Buffer, duration: number, frameSize?: number)`; `readFrames()`, `reset()`, `start()`, `stop()` |
| `class UrlSource extends BufferAudioSource` | `static fromUrl(url: string, options?: UrlSourceOptions): Promise<UrlSource>`. Detects MP3, OGG Vorbis, FLAC, WAV and QOA; raw PCM needs `format: 'pcm'` |
| `class FileSource extends BufferAudioSource` | `static fromPath(path: string): Promise<FileSource>`. MP3, OGG and WAV; raw PCM otherwise |
| `class Mp3Source extends BufferAudioSource` | `static fromBuffer(data: Buffer): Promise<Mp3Source>`, `static fromUrl(url: string, options?: FetchOptions): Promise<Mp3Source>` |
| `class OggSource extends BufferAudioSource` | `static fromBuffer(data: Buffer): Promise<OggSource>`, `static fromUrl(url: string, options?: FetchOptions): Promise<OggSource>` |
| `class WavSource extends BufferAudioSource` | `static fromBuffer(data: Buffer): Promise<WavSource>`, `static fromUrl(url: string, options?: FetchOptions): Promise<WavSource>` |
| `class PcmSource extends BufferAudioSource` | `constructor(pcm: Buffer, options?: PcmSourceOptions)`; resamples to 44100 Hz when needed |
| `class SineWaveSource extends BufferAudioSource` | `constructor(options: SineWaveSourceOptions)`; a tone with a 50 ms fade in and out |
| `class FfmpegSource implements AudioSource` | `constructor(options: FfmpegSourceOptions)`. Decodes with `ffmpeg` from the `PATH` while streaming; `stats` reports its buffer (`bufferedBytes`, `peakBufferedBytes`, `bufferLimit`, `paused`). `reset()` makes the next `start()` decode from the beginning |
| `class LiveSource implements AudioSource` | `constructor(options?: LiveSourceOptions)`. A ring buffer: `write(data: Buffer): number`, `end(): void`, `available`, `capacity`, `ended`. `duration` is `Infinity` |

The classes with a factory have a private constructor. The decoders run in a worker thread (`decode-worker.mjs` in the package). When that file cannot load, decoding runs on the calling thread instead.

## Options

| Type | Definition |
| --- | --- |
| `FetchOptions` | `{signal?: AbortSignal; maxBytes?: number; timeoutMs?: number}`; `maxBytes` defaults to 64 MiB, `timeoutMs` to 30000 |
| `UrlSourceOptions` | `FetchOptions & {format?: 'encoded' \| 'pcm'}`; `encoded` when omitted |
| `PcmSourceOptions` | `{sampleRate?: number}`; 44100 when omitted |
| `SineWaveSourceOptions` | `{duration: number; frequency?: number; sampleRate?: number; channels?: number}`; seconds, 440 Hz, 44100 Hz and 2 channels when omitted |
| `FfmpegSourceOptions` | `{path: string; duration: number}`; the file and its length in seconds |
| `LiveSourceOptions` | `{bufferDuration?: number}`; seconds of audio the ring buffer holds, 2 when omitted |

## AudioSource

| Member | Description |
| --- | --- |
| `duration: number` | Seconds |
| `readFrames(count: number): Promise<Buffer \| null>` | Null when the source ran out |
| `reset(): Promise<void>` | Back to the start |
| `start(): Promise<void>` | Called once before the first read |
| `stop(): Promise<void>` | Called when the stream ends, fails or is cancelled |
