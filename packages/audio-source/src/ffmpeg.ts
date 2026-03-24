import { type ChildProcess, spawn } from 'node:child_process';
import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE, FFMPEG_FRAMES_PER_PACKET } from './const';

/**
 * Audio source that decodes any file format supported by FFmpeg into
 * signed 16-bit big-endian PCM by spawning an `ffmpeg` child process.
 * Requires FFmpeg to be installed and available on the system PATH.
 */
export default class Ffmpeg implements AudioSource {
    /** Total duration of the audio in seconds. */
    readonly duration: number;

    /** Size of a single audio frame in bytes (channels * bytesPerChannel). */
    readonly #frameSize: number;

    /** Absolute or relative path to the input audio file. */
    readonly #filePath: string;

    /** Target sample rate for the PCM output. */
    readonly #sampleRate: number;

    /** Target number of audio channels for the PCM output. */
    readonly #channels: number;

    /** The spawned FFmpeg child process, or null when not running. */
    #ffmpeg: ChildProcess | null = null;

    /** Accumulation buffer for PCM data received from FFmpeg stdout. */
    #buffer: Buffer = Buffer.alloc(0);

    /** Whether the FFmpeg process has finished outputting data. */
    #ended: boolean = false;

    /** Queue of pending consumers waiting for PCM data. */
    #resolveQueue: Array<(value: Buffer | null) => void> = [];

    /**
     * Creates an FFmpeg-based audio source.
     *
     * @param filePath - Path to the audio file to decode.
     * @param duration - Total duration of the audio in seconds.
     * @param sampleRate - Target sample rate in Hz.
     * @param channels - Target number of audio channels.
     * @param bytesPerChannel - Number of bytes per sample per channel.
     */
    constructor(filePath: string, duration: number, sampleRate: number = DEFAULT_SAMPLE_RATE, channels: number = DEFAULT_CHANNELS, bytesPerChannel: number = DEFAULT_BYTES_PER_CHANNEL) {
        this.#filePath = filePath;
        this.duration = duration;
        this.#sampleRate = sampleRate;
        this.#channels = channels;
        this.#frameSize = channels * bytesPerChannel;
    }

    /**
     * Spawns the FFmpeg process and begins decoding the audio file
     * into signed 16-bit big-endian PCM streamed to stdout.
     */
    async start(): Promise<void> {
        this.#ffmpeg = spawn('ffmpeg', [
            '-i', this.#filePath,
            '-f', 's16be',
            '-acodec', 'pcm_s16be',
            '-ar', String(this.#sampleRate),
            '-ac', String(this.#channels),
            '-'
        ], {
            stdio: ['ignore', 'pipe', 'ignore']
        });

        this.#ffmpeg.stdout!.on('data', (chunk: Buffer) => {
            this.#buffer = Buffer.concat([this.#buffer, chunk]);
            this.#processQueue();
        });

        this.#ffmpeg.stdout!.on('end', () => {
            this.#ended = true;
            this.#processQueue();
        });

        this.#ffmpeg.on('error', (err) => {
            console.error('ffmpeg error:', err);
            this.#ended = true;
            this.#processQueue();
        });
    }

    /**
     * Resets the audio source. No-op for FFmpeg sources since the
     * child process cannot be rewound; call {@link stop} and {@link start} instead.
     */
    async reset(): Promise<void> {
    }

    /**
     * Stops the FFmpeg process and cleans up all resources. Resolves
     * any pending read promises with null.
     */
    async stop(): Promise<void> {
        if (!this.#ffmpeg) {
            return;
        }

        while (this.#resolveQueue.length > 0) {
            this.#resolveQueue.shift()!(null);
        }

        this.#ffmpeg.stdout?.removeAllListeners();
        this.#ffmpeg.removeAllListeners();

        this.#ffmpeg.kill();
        this.#ffmpeg = null;
    }

    /**
     * Reads the specified number of audio frames from the decoded PCM buffer.
     * Blocks until enough data is available or the stream ends.
     *
     * @param count - Number of audio frames to read.
     * @returns A buffer containing the requested PCM data, or null if the stream has ended.
     */
    async readFrames(count: number): Promise<Buffer | null> {
        const bytesNeeded = count * this.#frameSize;

        if (this.#buffer.length >= bytesNeeded) {
            const chunk = this.#buffer.subarray(0, bytesNeeded);
            this.#buffer = this.#buffer.subarray(bytesNeeded);
            return chunk;
        }

        if (this.#ended) {
            if (this.#buffer.length > 0) {
                const chunk = this.#buffer;
                this.#buffer = Buffer.alloc(0);
                return chunk;
            }
            return null;
        }

        return new Promise((resolve) => {
            this.#resolveQueue.push(resolve);
        });
    }

    /**
     * Fulfills pending read promises from the resolve queue whenever
     * enough PCM data has accumulated in the buffer or the stream has ended.
     */
    #processQueue(): void {
        while (this.#resolveQueue.length > 0) {
            const bytesNeeded = FFMPEG_FRAMES_PER_PACKET * this.#frameSize;

            if (this.#buffer.length >= bytesNeeded) {
                const chunk = this.#buffer.subarray(0, bytesNeeded);
                this.#buffer = this.#buffer.subarray(bytesNeeded);
                this.#resolveQueue.shift()!(chunk);
            } else if (this.#ended) {
                if (this.#buffer.length > 0) {
                    const chunk = this.#buffer;
                    this.#buffer = Buffer.alloc(0);
                    this.#resolveQueue.shift()!(chunk);
                } else {
                    this.#resolveQueue.shift()!(null);
                }
            } else {
                break;
            }
        }
    }
}
