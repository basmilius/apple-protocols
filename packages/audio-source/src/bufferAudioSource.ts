import type { AudioSource } from '@apple-protocols/airplay';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS } from './const';

/** PCM-buffer source with shared reading and lifecycle methods. Subclasses supply the buffer, duration and optional frame size. */
export abstract class BufferAudioSource implements AudioSource {
    /** The length of the audio in seconds. */
    readonly duration: number;

    /** The decoded audio as signed 16-bit big-endian PCM. */
    readonly #buffer: Buffer;

    /** The size of one frame in bytes. */
    readonly #frameSize: number;

    #offset: number = 0;

    /**
     * @param buffer - The decoded audio as PCM.
     * @param duration - The length of the audio in seconds.
     * @param frameSize - The size of one frame in bytes; {@link AUDIO_CHANNELS} × {@link AUDIO_BYTES_PER_CHANNEL} when omitted.
     */
    constructor(buffer: Buffer, duration: number, frameSize: number = AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL) {
        if (!Number.isSafeInteger(frameSize) || frameSize <= 0 || buffer.length % frameSize !== 0 || !Number.isFinite(duration) || duration < 0) {
            throw new RangeError('Invalid PCM buffer format or duration.');
        }

        this.#buffer = buffer;
        this.#frameSize = frameSize;
        this.duration = duration;
    }

    /** Reads up to `count` frames; null at the end of the buffer. */
    async readFrames(count: number): Promise<Buffer | null> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new RangeError('Frame count must be a positive integer.');
        }

        if (this.#offset >= this.#buffer.length) {
            return null;
        }

        const bytesToRead = count * this.#frameSize;
        const chunk = this.#buffer.subarray(this.#offset, this.#offset + bytesToRead);
        this.#offset += bytesToRead;

        return chunk.length > 0 ? chunk : null;
    }

    /** Reads from the start again. */
    async reset(): Promise<void> {
        this.#offset = 0;
    }

    /** Does nothing; the buffer is ready. */
    async start(): Promise<void> {
    }

    /** Does nothing; the buffer holds no resources. */
    async stop(): Promise<void> {
    }
}
