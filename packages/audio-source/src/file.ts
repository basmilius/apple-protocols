import { readFile } from 'node:fs/promises';
import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';
import { decode, isMp3, isOgg, isWav } from './decoder';

/**
 * Audio source that reads from a pre-decoded PCM buffer loaded from a file.
 * Supports automatic detection and decoding of MP3, OGG, and WAV formats
 * via the {@link fromPath} factory method.
 */
export default class File implements AudioSource {
    /** Total duration of the audio in seconds. */
    readonly duration: number;

    /** Pre-decoded signed 16-bit big-endian PCM buffer. */
    readonly #buffer: Buffer;

    /** Size of a single audio frame in bytes. */
    readonly #frameSize: number;

    /** Current read position in the PCM buffer. */
    #offset: number = 0;

    /**
     * Creates a File audio source from a pre-decoded PCM buffer.
     *
     * @param buffer - PCM audio data buffer.
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
     * Resets the read position to the beginning of the buffer,
     * allowing the audio to be read again from the start.
     */
    async reset(): Promise<void> {
        this.#offset = 0;
    }

    /**
     * Starts the audio source. No-op for file-based sources since
     * all data is already loaded in memory.
     */
    async start(): Promise<void> {
    }

    /**
     * Stops the audio source. No-op for file-based sources.
     */
    async stop(): Promise<void> {
    }

    /**
     * Loads an audio file from disk, automatically detecting and decoding
     * MP3, OGG, and WAV formats to signed 16-bit big-endian PCM. Files
     * that don't match any known format are treated as raw PCM.
     *
     * @param filePath - Absolute or relative path to the audio file.
     * @returns A new File audio source with the decoded PCM data.
     */
    static async fromPath(filePath: string): Promise<File> {
        const raw = await readFile(filePath);
        const buffer = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);

        const pcmBuffer = (isMp3(buffer) || isOgg(buffer) || isWav(buffer))
            ? await decode(buffer)
            : buffer;

        const duration = pcmBuffer.length / (DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL) / DEFAULT_SAMPLE_RATE;

        return new File(pcmBuffer, duration);
    }
}
