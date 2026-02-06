import { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';
import { decode, isMp3File } from './decoder';

export default class Mp3 extends AudioSource {
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

    static async fromBuffer(mp3Buffer: Buffer): Promise<Mp3> {
        if (!isMp3File(mp3Buffer)) {
            throw new Error('Invalid MP3 file');
        }

        const pcmBuffer = await decode(mp3Buffer);
        const duration = pcmBuffer.length / (DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL) / DEFAULT_SAMPLE_RATE;

        return new Mp3(pcmBuffer, duration);
    }

    static async fromUrl(url: string): Promise<Mp3> {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();

        return Mp3.fromBuffer(Buffer.from(arrayBuffer));
    }
}
