import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';
import { decode, isOgg } from './decoder';

/**
 * Audio source for OGG Vorbis data. Decodes OGG to signed 16-bit
 * big-endian PCM using a WASM-based decoder and serves the resulting buffer.
 */
export default class Ogg implements AudioSource {
    /** Total duration of the audio in seconds. */
    readonly duration: number;

    /** Pre-decoded signed 16-bit big-endian PCM buffer. */
    readonly #buffer: Buffer;

    /** Size of a single audio frame in bytes. */
    readonly #frameSize: number;

    /** Current read position in the PCM buffer. */
    #offset: number = 0;

    /**
     * Creates an OGG audio source from a pre-decoded PCM buffer.
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
     * Creates an Ogg audio source from a raw OGG Vorbis buffer by
     * decoding it to signed 16-bit big-endian PCM.
     *
     * @param oggBuffer - Raw OGG Vorbis data to decode.
     * @returns A new Ogg audio source with the decoded PCM data.
     * @throws Error if the buffer does not contain valid OGG data.
     */
    static async fromBuffer(oggBuffer: Buffer): Promise<Ogg> {
        if (!isOgg(oggBuffer)) {
            throw new Error('Invalid OGG file');
        }

        const pcmBuffer = await decode(oggBuffer);
        const duration = pcmBuffer.length / (DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL) / DEFAULT_SAMPLE_RATE;

        return new Ogg(pcmBuffer, duration);
    }

    /**
     * Fetches an OGG file from a URL and decodes it to PCM.
     *
     * @param url - URL pointing to an OGG Vorbis file.
     * @returns A new Ogg audio source with the decoded PCM data.
     * @throws Error if the fetched data is not valid OGG.
     */
    static async fromUrl(url: string): Promise<Ogg> {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();

        return Ogg.fromBuffer(Buffer.from(arrayBuffer));
    }
}
