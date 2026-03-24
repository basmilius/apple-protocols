import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';

/**
 * Audio source that generates a pure sine wave tone. Useful for
 * testing and diagnostics. The generated signal includes a short
 * fade-in and fade-out envelope (50ms) to avoid click artifacts.
 */
export default class SineWave implements AudioSource {
    /** Total duration of the sine wave in seconds. */
    readonly duration: number;

    /** Pre-generated signed 16-bit big-endian PCM buffer. */
    readonly #buffer: Buffer;

    /** Size of a single audio frame in bytes. */
    readonly #frameSize: number;

    /** Current read position in the PCM buffer. */
    #offset: number = 0;

    /**
     * Creates a sine wave audio source with the specified parameters.
     *
     * @param durationSeconds - Duration of the tone in seconds.
     * @param frequency - Frequency of the sine wave in Hz (default 440 Hz / A4).
     * @param sampleRate - Sample rate in Hz.
     * @param channels - Number of audio channels.
     * @param bytesPerChannel - Number of bytes per sample per channel.
     */
    constructor(durationSeconds: number, frequency: number = 440, sampleRate: number = DEFAULT_SAMPLE_RATE, channels: number = DEFAULT_CHANNELS, bytesPerChannel: number = DEFAULT_BYTES_PER_CHANNEL) {
        this.duration = durationSeconds;
        this.#frameSize = channels * bytesPerChannel;
        this.#buffer = this.#generateSineWave(sampleRate, channels, bytesPerChannel, durationSeconds, frequency);
    }

    /**
     * Generates a signed 16-bit big-endian PCM buffer containing a
     * sine wave with a fade-in/fade-out envelope to prevent clicks.
     *
     * @param sampleRate - Sample rate in Hz.
     * @param channels - Number of audio channels.
     * @param bytesPerChannel - Number of bytes per sample per channel.
     * @param durationSeconds - Duration of the tone in seconds.
     * @param frequency - Frequency of the sine wave in Hz.
     * @returns A buffer containing the generated PCM data.
     */
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

    /**
     * Reads the specified number of audio frames from the PCM buffer.
     *
     * @param count - Number of audio frames to read.
     * @returns A buffer containing the requested PCM data, or null if the end has been reached.
     */
    async readFrames(count: number): Promise<Buffer | null> {
        if (this.#offset >= this.#buffer.length) {
            return null;
        }

        const bytesToRead = count * this.#frameSize;
        const chunk = this.#buffer.subarray(this.#offset, this.#offset + bytesToRead);
        this.#offset += bytesToRead;

        return chunk.length > 0 ? chunk : null;
    }

    /**
     * Resets the read position to the beginning of the buffer.
     */
    async reset(): Promise<void> {
        this.#offset = 0;
    }

    /**
     * Starts the audio source. No-op for buffer-based sources.
     */
    async start(): Promise<void> {
    }

    /**
     * Stops the audio source. No-op for buffer-based sources.
     */
    async stop(): Promise<void> {
    }
}
