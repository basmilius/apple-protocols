import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, type AudioSource } from '@basmilius/apple-common';

/**
 * Abstract base class for audio sources backed by an in-memory PCM buffer.
 * Provides shared implementations of {@link readFrames}, {@link reset},
 * {@link start}, and {@link stop} so that subclasses only need to supply
 * the buffer, duration, and (optionally) the frame size.
 */
export default abstract class BufferAudioSource implements AudioSource {
    /** Total duration of the audio in seconds. */
    readonly duration: number;

    /** Pre-decoded signed 16-bit big-endian PCM buffer. */
    readonly #buffer: Buffer;

    /** Size of a single audio frame in bytes. */
    readonly #frameSize: number;

    /** Current read position in the PCM buffer. */
    #offset: number = 0;

    /**
     * @param buffer - Pre-decoded PCM audio data.
     * @param duration - Total duration of the audio in seconds.
     * @param frameSize - Size of a single audio frame in bytes. Defaults to
     *   {@link AUDIO_CHANNELS} × {@link AUDIO_BYTES_PER_CHANNEL}.
     */
    constructor(buffer: Buffer, duration: number, frameSize: number = AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL) {
        this.#buffer = buffer;
        this.#frameSize = frameSize;
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
}
