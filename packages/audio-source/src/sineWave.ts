import { AudioSource } from "@basmilius/apple-common";
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';

export default class SineWave extends AudioSource {
    readonly duration: number;
    readonly #buffer: Buffer;
    readonly #frameSize: number;
    #offset: number = 0;

    constructor(durationSeconds: number, frequency: number = 440, sampleRate: number = DEFAULT_SAMPLE_RATE, channels: number = DEFAULT_CHANNELS, bytesPerChannel: number = DEFAULT_BYTES_PER_CHANNEL) {
        super();

        this.duration = durationSeconds;
        this.#frameSize = channels * bytesPerChannel;
        this.#buffer = this.#generateSineWave(sampleRate, channels, bytesPerChannel, durationSeconds, frequency);
    }

    #generateSineWave(sampleRate: number, channels: number, bytesPerChannel: number, durationSeconds: number, frequency: number): Buffer {
        const totalSamples = sampleRate * durationSeconds;
        const buffer = Buffer.alloc(totalSamples * channels * bytesPerChannel);

        const fadeSamples = Math.floor(sampleRate * 0.05);

        for (let i = 0; i < totalSamples; i++) {
            const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate);

            let envelope = 1.0;

            if (i < fadeSamples) {
                envelope = i / fadeSamples;
            } else if (i >= totalSamples - fadeSamples) {
                envelope = (totalSamples - i) / fadeSamples;
            }

            const value = Math.round(sample * envelope * 0x7FFF);

            for (let ch = 0; ch < channels; ch++) {
                const offset = (i * channels + ch) * bytesPerChannel;
                buffer.writeInt16BE(value, offset);
            }
        }

        return buffer;
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
}
