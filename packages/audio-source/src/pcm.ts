import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';

/**
 * Audio source for raw signed 16-bit big-endian PCM data. Serves
 * the provided buffer directly without any decoding or conversion.
 */
export default class Pcm implements AudioSource {
    /** Total duration of the audio in seconds, computed from the buffer size and sample rate. */
    readonly duration: number;

    /** Raw PCM audio data buffer. */
    readonly #buffer: Buffer;

    /** Size of a single audio frame in bytes. */
    readonly #frameSize: number;

    /** Current read position in the PCM buffer. */
    #offset: number = 0;

    /**
     * Creates a raw PCM audio source.
     *
     * @param pcmBuffer - Signed 16-bit big-endian interleaved PCM data.
     * @param sampleRate - Sample rate of the PCM data in Hz.
     */
    constructor(pcmBuffer: Buffer, sampleRate: number = DEFAULT_SAMPLE_RATE) {
        this.#buffer = pcmBuffer;
        this.#frameSize = DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL;
        this.duration = pcmBuffer.length / this.#frameSize / sampleRate;
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
