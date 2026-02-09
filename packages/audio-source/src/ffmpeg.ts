import { type ChildProcess, spawn } from 'node:child_process';
import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE, FFMPEG_FRAMES_PER_PACKET } from './const';
import { isLiveStreamingUrl } from './streamDetection';

export default class Ffmpeg implements AudioSource {
    readonly duration: number;
    readonly #frameSize: number;
    readonly #filePath: string;
    readonly #sampleRate: number;
    readonly #channels: number;

    #ffmpeg: ChildProcess | null = null;
    #buffer: Buffer = Buffer.alloc(0);
    #ended: boolean = false;
    #resolveQueue: Array<(value: Buffer | null) => void> = [];

    constructor(filePath: string, duration: number, sampleRate: number = DEFAULT_SAMPLE_RATE, channels: number = DEFAULT_CHANNELS, bytesPerChannel: number = DEFAULT_BYTES_PER_CHANNEL) {
        if (isLiveStreamingUrl(filePath)) {
            throw new Error('Live streaming URLs are not currently supported. Please use a local file or non-streaming URL.');
        }

        this.#filePath = filePath;
        this.duration = duration;
        this.#sampleRate = sampleRate;
        this.#channels = channels;
        this.#frameSize = channels * bytesPerChannel;
    }

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

    async reset(): Promise<void> {
    }

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
