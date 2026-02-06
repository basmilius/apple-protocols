import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';

export default class Pcm implements AudioSource {
    readonly duration: number;
    readonly #buffer: Buffer;
    readonly #frameSize: number;
    #offset: number = 0;

    constructor(pcmBuffer: Buffer, sampleRate: number = DEFAULT_SAMPLE_RATE) {
        this.#buffer = pcmBuffer;
        this.#frameSize = DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL;
        this.duration = pcmBuffer.length / this.#frameSize / sampleRate;
    }

    async readFrames(count: number): Promise<Buffer | null> {
        if (this.#offset >= this.#buffer.length) {
            return null;
        }

        const bytesToRead = count * this.#frameSize;
        const chunk = this.#buffer.subarray(this.#offset, this.#offset + bytesToRead);
        this.#offset += bytesToRead;

        return chunk.length > 0 ? chunk : null;
    }

    async reset(): Promise<void> {
        this.#offset = 0;
    }

    async start(): Promise<void> {
    }

    async stop(): Promise<void> {
    }
}
