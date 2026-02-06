import { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';
import { decode, isOggFile } from './decoder';

export default class Ogg extends AudioSource {
    readonly duration: number;
    readonly #buffer: Buffer;
    readonly #frameSize: number;
    #offset: number = 0;

    constructor(buffer: Buffer, duration: number) {
        super();

        this.#buffer = buffer;
        this.#frameSize = DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL;
        this.duration = duration;
    }

    async readframes(count: number): Promise<Buffer | null> {
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

    static async fromBuffer(oggBuffer: Buffer): Promise<Ogg> {
        if (!isOggFile(oggBuffer)) {
            throw new Error('Invalid OGG file');
        }

        const pcmBuffer = await decode(oggBuffer);
        const duration = pcmBuffer.length / (DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL) / DEFAULT_SAMPLE_RATE;

        return new Ogg(pcmBuffer, duration);
    }

    static async fromUrl(url: string): Promise<Ogg> {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();

        return Ogg.fromBuffer(Buffer.from(arrayBuffer));
    }
}
