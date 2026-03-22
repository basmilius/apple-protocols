import { readFile } from 'node:fs/promises';
import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';
import { decode, isMp3, isOgg, isWav } from './decoder';

export default class File implements AudioSource {
    readonly duration: number;
    readonly #buffer: Buffer;
    readonly #frameSize: number;
    #offset: number = 0;

    constructor(buffer: Buffer, duration: number) {
        this.#buffer = buffer;
        this.#frameSize = DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL;
        this.duration = duration;
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

    static async fromPath(filePath: string): Promise<File> {
        const raw = await readFile(filePath);
        const buffer = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);

        const pcmBuffer = (isMp3(buffer) || isOgg(buffer) || isWav(buffer))
            ? await decode(buffer)
            : buffer;

        const duration = pcmBuffer.length / (DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL) / DEFAULT_SAMPLE_RATE;

        return new File(pcmBuffer, duration);
    }
}
