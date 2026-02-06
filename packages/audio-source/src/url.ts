import { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';
import { decode, isMp3File, isOggFile, isWavFile } from './decoder';

export default class Url extends AudioSource {
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

    static async fromUrl(url: string): Promise<Url> {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let pcmBuffer: Buffer;

        if (isMp3File(buffer) || isOggFile(buffer) || isWavFile(buffer)) {
            pcmBuffer = await decode(buffer);
        } else {
            throw new Error('Unsupported audio format. Please use WAV or MP3.');
        }

        const duration = pcmBuffer.length / (DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL) / DEFAULT_SAMPLE_RATE;

        return new Url(pcmBuffer, duration);
    }
}
