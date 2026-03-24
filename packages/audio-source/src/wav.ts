import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';
import { decode, isWav } from './decoder';

/**
 * Audio source for WAV data. Decodes WAV (including WAVE_FORMAT_EXTENSIBLE)
 * to signed 16-bit big-endian PCM and serves the resulting buffer.
 */
export default class Wav implements AudioSource {
    /** Total duration of the audio in seconds. */
    readonly duration: number;

    /** Pre-decoded signed 16-bit big-endian PCM buffer. */
    readonly #buffer: Buffer;

    /** Size of a single audio frame in bytes. */
    readonly #frameSize: number;

    /** Current read position in the PCM buffer. */
    #offset: number = 0;

    /**
     * Creates a WAV audio source from a pre-decoded PCM buffer.
     * Use {@link fromBuffer} or {@link fromUrl} to create instances
     * with automatic decoding.
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
     * Creates a Wav audio source from a raw WAV buffer by decoding
     * it to signed 16-bit big-endian PCM.
     *
     * @param wavBuffer - Raw WAV data to decode.
     * @returns A new Wav audio source with the decoded PCM data.
     * @throws Error if the buffer does not contain valid WAV data.
     */
    static async fromBuffer(wavBuffer: Buffer): Promise<Wav> {
        if (!isWav(wavBuffer)) {
            throw new Error('Invalid WAV file');
        }

        const pcmBuffer = await decode(wavBuffer);
        const duration = pcmBuffer.length / (DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL) / DEFAULT_SAMPLE_RATE;

        return new Wav(pcmBuffer, duration);
    }

    /**
     * Fetches a WAV file from a URL and decodes it to PCM.
     *
     * @param url - URL pointing to a WAV file.
     * @returns A new Wav audio source with the decoded PCM data.
     */
    static async fromUrl(url: string): Promise<Wav> {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return Wav.fromBuffer(Buffer.from(arrayBuffer));
    }
}
