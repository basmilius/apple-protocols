import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';
import { decode, isMp3, isOgg, isWav } from './decoder';

/**
 * Audio source that fetches audio from a URL, automatically detecting
 * and decoding MP3, OGG, and WAV formats. Unknown formats are treated
 * as raw PCM data.
 */
export default class Url implements AudioSource {
    /** Total duration of the audio in seconds. */
    readonly duration: number;

    /** Pre-decoded signed 16-bit big-endian PCM buffer. */
    readonly #buffer: Buffer;

    /** Size of a single audio frame in bytes. */
    readonly #frameSize: number;

    /** Current read position in the PCM buffer. */
    #offset: number = 0;

    /**
     * Creates a URL audio source from a pre-decoded PCM buffer.
     * Use {@link fromUrl} to create instances with automatic fetching and decoding.
     *
     * @param buffer - Pre-decoded PCM audio data.
     * @param duration - Total duration of the audio in seconds.
     */
    constructor(buffer: Buffer, duration: number) {
        this.#buffer = buffer;
        this.#frameSize = DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL;
        this.duration = duration;
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

    /**
     * Fetches audio from a URL, automatically detecting and decoding
     * MP3, OGG, and WAV formats. Data that does not match any known
     * format is treated as raw PCM.
     *
     * @param url - URL pointing to an audio file.
     * @returns A new Url audio source with the decoded PCM data.
     */
    static async fromUrl(url: string): Promise<Url> {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const pcmBuffer = (isMp3(buffer) || isOgg(buffer) || isWav(buffer))
            ? await decode(buffer)
            : buffer;

        const duration = pcmBuffer.length / (DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL) / DEFAULT_SAMPLE_RATE;

        return new Url(pcmBuffer, duration);
    }
}
