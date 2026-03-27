import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, type AudioSource } from '@basmilius/apple-common';

/** Default ring buffer duration in seconds of audio. */
const DEFAULT_BUFFER_DURATION = 2;

/**
 * Audio source for live/real-time PCM audio input using a ring buffer.
 * Producers write PCM data via {@link write}, and consumers read it
 * via {@link readFrames}. When the buffer is full, the oldest data
 * is silently dropped to make room for new data.
 */
export default class Live implements AudioSource {
    /** Duration is always Infinity for live sources. */
    readonly duration: number = Infinity;

    /** Size of a single audio frame in bytes. */
    readonly #frameSize: number;

    /** Fixed-size ring buffer for PCM data. */
    readonly #buffer: Buffer;

    /** Total capacity of the ring buffer in bytes. */
    readonly #capacity: number;

    /** Current read position in the ring buffer. */
    #readPos: number = 0;

    /** Current write position in the ring buffer. */
    #writePos: number = 0;

    /** Number of bytes currently available for reading. */
    #available: number = 0;

    /** Whether the source has been signaled as ended via {@link end}. */
    #ended: boolean = false;

    /** Whether the source has been started via {@link start}. */
    #started: boolean = false;

    /** Resolve function for a pending consumer waiting for data. */
    #pendingResolve: ((value: Buffer | null) => void) | null = null;

    /** Number of bytes the pending consumer is waiting for. */
    #pendingBytes: number = 0;

    /**
     * Creates a live audio source with a ring buffer.
     *
     * @param bufferDuration Buffer capacity in seconds of audio.
     */
    constructor(bufferDuration: number = DEFAULT_BUFFER_DURATION) {
        this.#frameSize = AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL;
        this.#capacity = Math.floor(bufferDuration * AUDIO_SAMPLE_RATE) * this.#frameSize;
        this.#buffer = Buffer.alloc(this.#capacity);
    }

    /**
     * The number of bytes available for reading.
     */
    get available(): number {
        return this.#available;
    }

    /**
     * The total capacity in bytes.
     */
    get capacity(): number {
        return this.#capacity;
    }

    /**
     * Whether the source has been ended.
     */
    get ended(): boolean {
        return this.#ended;
    }

    /**
     * Writes PCM data into the ring buffer. If the buffer is full,
     * the oldest data is dropped to make room for new data.
     *
     * @param data - PCM audio data to write into the ring buffer.
     * @returns The number of bytes actually written.
     */
    write(data: Buffer): number {
        if (this.#ended) {
            return 0;
        }

        const length = Math.min(data.length, this.#capacity);

        // If data exceeds capacity, only keep the most recent part.
        const source = length < data.length
            ? data.subarray(data.length - length)
            : data;

        // Drop oldest data if needed.
        const free = this.#capacity - this.#available;

        if (length > free) {
            const drop = length - free;
            this.#readPos = (this.#readPos + drop) % this.#capacity;
            this.#available -= drop;
        }

        // Write into ring buffer (may need to wrap).
        const firstChunk = Math.min(length, this.#capacity - this.#writePos);

        source.copy(this.#buffer, this.#writePos, 0, firstChunk);

        if (firstChunk < length) {
            source.copy(this.#buffer, 0, firstChunk, length);
        }

        this.#writePos = (this.#writePos + length) % this.#capacity;
        this.#available += length;

        // Wake up pending consumer.
        this.#tryFulfillPending();

        return length;
    }

    /**
     * Signal that no more data will be written.
     */
    end(): void {
        this.#ended = true;

        // Wake up pending consumer with whatever is left (or null).
        if (this.#pendingResolve) {
            if (this.#available > 0) {
                const bytes = Math.min(this.#pendingBytes, this.#available);
                this.#pendingResolve(this.#read(bytes));
            } else {
                this.#pendingResolve(null);
            }

            this.#pendingResolve = null;
            this.#pendingBytes = 0;
        }
    }

    /**
     * Reads the specified number of audio frames from the ring buffer.
     * Blocks until enough data is available, the stream ends, or data
     * is written by the producer.
     *
     * @param count - Number of audio frames to read.
     * @returns A buffer containing the requested PCM data, or null if the stream has ended.
     */
    async readFrames(count: number): Promise<Buffer | null> {
        const bytesNeeded = count * this.#frameSize;

        if (this.#available >= bytesNeeded) {
            return this.#read(bytesNeeded);
        }

        if (this.#ended) {
            if (this.#available > 0) {
                return this.#read(this.#available);
            }

            return null;
        }

        // Wait for data from producer. Only one consumer can wait at a time.
        if (this.#pendingResolve) {
            throw new Error('Only one concurrent readFrames() call is supported on Live sources.');
        }

        return new Promise((resolve) => {
            this.#pendingResolve = resolve;
            this.#pendingBytes = bytesNeeded;
        });
    }

    /**
     * Resets the ring buffer to its initial state, clearing all data
     * and re-enabling writes after an {@link end} call.
     */
    async reset(): Promise<void> {
        this.#readPos = 0;
        this.#writePos = 0;
        this.#available = 0;
        this.#ended = false;
        this.#pendingResolve = null;
        this.#pendingBytes = 0;
    }

    /**
     * Marks the live source as started, allowing data to flow.
     */
    async start(): Promise<void> {
        this.#started = true;
    }

    /**
     * Stops the live source and signals end-of-stream. Any pending
     * consumer will receive remaining data or null.
     */
    async stop(): Promise<void> {
        this.#started = false;
        this.end();
    }

    /**
     * Reads the specified number of bytes from the ring buffer,
     * handling wrap-around at the buffer boundary.
     *
     * @param bytes - Number of bytes to read.
     * @returns A new buffer containing the read data.
     */
    #read(bytes: number): Buffer {
        const result = Buffer.allocUnsafe(bytes);
        const firstChunk = Math.min(bytes, this.#capacity - this.#readPos);

        this.#buffer.copy(result, 0, this.#readPos, this.#readPos + firstChunk);

        if (firstChunk < bytes) {
            this.#buffer.copy(result, firstChunk, 0, bytes - firstChunk);
        }

        this.#readPos = (this.#readPos + bytes) % this.#capacity;
        this.#available -= bytes;

        return result;
    }

    /**
     * Attempts to fulfill a pending consumer's read request if enough
     * data has accumulated in the ring buffer.
     */
    #tryFulfillPending(): void {
        if (!this.#pendingResolve || this.#available < this.#pendingBytes) {
            return;
        }

        const resolve = this.#pendingResolve;
        const bytes = this.#pendingBytes;

        this.#pendingResolve = null;
        this.#pendingBytes = 0;

        resolve(this.#read(bytes));
    }
}
