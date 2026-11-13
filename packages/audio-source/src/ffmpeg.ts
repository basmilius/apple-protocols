import { type ChildProcess, spawn } from 'node:child_process';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, type AudioSource, PlaybackError } from '@basmilius/apple-common';

const FRAME_SIZE = AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL;
const BUFFER_LIMIT = AUDIO_SAMPLE_RATE * FRAME_SIZE;
const STDERR_LIMIT = 4096;

type Reader = {bytes: number; resolve: (value: Buffer | null) => void; reject: (error: Error) => void};

/** FFmpeg decodes to 44100 Hz signed 16-bit big-endian stereo PCM. Requires ffmpeg on PATH. */
export class Ffmpeg implements AudioSource {
    readonly duration: number;
    readonly #filePath: string;
    readonly #chunks: Buffer[] = [];
    readonly #readers: Reader[] = [];
    #offset = 0;
    #buffered = 0;
    #peakBuffered = 0;
    #ended = true;
    #failure?: PlaybackError;
    #stderr = '';
    #ffmpeg: ChildProcess | null = null;
    #stopping?: Promise<void>;

    constructor(filePath: string, duration: number, sampleRate: number = AUDIO_SAMPLE_RATE, channels: number = AUDIO_CHANNELS, bytesPerChannel: number = AUDIO_BYTES_PER_CHANNEL) {
        if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isSafeInteger(channels) || channels <= 0 || bytesPerChannel !== 2) {
            throw new RangeError('FFmpeg requires a positive sample rate and channel count, and 16-bit samples.');
        }
        if (!Number.isFinite(duration) || duration < 0) throw new RangeError('FFmpeg duration must be finite and non-negative.');
        this.#filePath = filePath;
        this.duration = duration;
    }

    get stats(): {bufferedBytes: number; peakBufferedBytes: number; bufferLimit: number; paused: boolean} {
        return {bufferedBytes: this.#buffered, peakBufferedBytes: this.#peakBuffered, bufferLimit: BUFFER_LIMIT, paused: this.#ffmpeg?.stdout?.isPaused() ?? false};
    }

    async start(): Promise<void> {
        if (this.#stopping) {
            await this.#stopping;
        }
        if (this.#ffmpeg) {
            return;
        }
        this.#clear();
        this.#ended = false;
        this.#failure = undefined;
        this.#stderr = '';
        this.#peakBuffered = 0;

        const child = spawn('ffmpeg', ['-nostdin', '-v', 'error', '-i', this.#filePath, '-f', 's16be', '-acodec', 'pcm_s16be', '-ar', String(AUDIO_SAMPLE_RATE), '-ac', String(AUDIO_CHANNELS), '-'], {stdio: ['ignore', 'pipe', 'pipe']});
        this.#ffmpeg = child;
        child.stderr!.on('data', chunk => {
            if (this.#ffmpeg === child) {
                this.#stderr = (this.#stderr + chunk.toString()).slice(-STDERR_LIMIT);
            }
        });
        child.stdout!.on('data', (chunk: Buffer) => {
            if (this.#ffmpeg !== child) {
                return;
            }
            this.#chunks.push(chunk);
            this.#buffered += chunk.length;
            this.#peakBuffered = Math.max(this.#peakBuffered, this.#buffered);
            this.#flush();
            if (this.#buffered >= BUFFER_LIMIT) {
                child.stdout!.pause();
            }
        });
        child.on('error', error => {
            if (this.#ffmpeg === child) {
                this.#fail(error.message);
            }
        });
        child.once('close', (code, signal) => {
            if (this.#ffmpeg !== child) {
                return;
            }
            this.#ffmpeg = null;
            this.#ended = true;
            if (code !== 0) {
                this.#fail(`FFmpeg exited with ${code ?? signal}: ${this.#stderr.trim()}`);
            } else if (this.#buffered % FRAME_SIZE !== 0) {
                this.#fail('FFmpeg returned an incomplete PCM frame.');
            } else {
                this.#flush();
            }
        });
        await new Promise<void>((resolve, reject) => {
            child.once('spawn', resolve);
            child.once('error', error => reject(new PlaybackError(`Cannot start FFmpeg: ${error.message}`)));
        });
    }

    /** Stops the current decoder; the next start decodes from the beginning. */
    async reset(): Promise<void> {
        await this.stop();
    }

    stop(): Promise<void> {
        if (this.#stopping) {
            return this.#stopping;
        }
        const child = this.#ffmpeg;
        this.#ffmpeg = null;
        this.#ended = true;
        this.#clear();
        for (const reader of this.#readers.splice(0)) {
            reader.resolve(null);
        }
        if (!child) {
            return Promise.resolve();
        }
        this.#stopping = new Promise<void>(resolve => {
            const timeout = setTimeout(() => child.kill('SIGKILL'), 2000);
            child.once('close', () => {clearTimeout(timeout); resolve();});
            child.stdout?.resume();
            child.kill();
        }).finally(() => {this.#stopping = undefined;});
        return this.#stopping;
    }

    /** Reads must fit the one-second producer buffer; failures reject rather than masquerading as EOF. */
    async readFrames(count: number): Promise<Buffer | null> {
        if (!Number.isSafeInteger(count) || count <= 0 || count * FRAME_SIZE > BUFFER_LIMIT) {
            throw new RangeError('FFmpeg frame count must be positive and fit the producer buffer.');
        }
        if (this.#failure) {
            throw this.#failure;
        }
        return new Promise((resolve, reject) => {
            this.#readers.push({bytes: count * FRAME_SIZE, resolve, reject});
            this.#flush();
        });
    }

    #flush(): void {
        while (this.#readers.length > 0) {
            const reader = this.#readers[0];
            if (this.#failure) {
                this.#readers.shift()!.reject(this.#failure);
            } else if (this.#buffered >= reader.bytes || this.#ended) {
                this.#readers.shift();
                const size = Math.min(reader.bytes, this.#buffered);
                reader.resolve(size === 0 ? null : this.#take(size));
            } else {
                break;
            }
        }
        if (this.#buffered < BUFFER_LIMIT / 2) {
            this.#ffmpeg?.stdout?.resume();
        }
    }

    #take(bytes: number): Buffer {
        const output = Buffer.allocUnsafe(bytes);
        let written = 0;
        while (written < bytes) {
            const chunk = this.#chunks[0];
            const size = Math.min(bytes - written, chunk.length - this.#offset);
            chunk.copy(output, written, this.#offset, this.#offset + size);
            this.#offset += size;
            written += size;
            if (this.#offset === chunk.length) {
                this.#chunks.shift();
                this.#offset = 0;
            }
        }
        this.#buffered -= bytes;
        return output;
    }

    #clear(): void {
        this.#chunks.length = 0;
        this.#offset = 0;
        this.#buffered = 0;
    }

    #fail(message: string): void {
        this.#failure = new PlaybackError(message);
        this.#ended = true;
        this.#clear();
        this.#flush();
    }
}
