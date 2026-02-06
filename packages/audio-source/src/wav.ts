import { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';
import { decode, isWavFile } from './decoder';

export default class Wav extends AudioSource {
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

    static async fromBuffer(wavBuffer: Buffer): Promise<Wav> {
        if (!isWavFile(wavBuffer)) {
            throw new Error('Invalid WAV file');
        }

        const pcmBuffer = await decode(wavBuffer);
        const duration = pcmBuffer.length / (DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL) / DEFAULT_SAMPLE_RATE;

        return new Wav(pcmBuffer, duration);
    }

    static async fromUrl(url: string): Promise<Wav> {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return Wav.fromBuffer(Buffer.from(arrayBuffer));
    }
}
