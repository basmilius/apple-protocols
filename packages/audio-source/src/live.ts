import type { AudioSource } from '@basmilius/apple-common';
import { DEFAULT_BYTES_PER_CHANNEL, DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from './const';

const DEFAULT_BUFFER_DURATION = 2;

export default class Live implements AudioSource {
    readonly duration: number = Infinity;
    readonly #frameSize: number;

    // Ring buffer
    readonly #buffer: Buffer;
    readonly #capacity: number;
    #readPos: number = 0;
    #writePos: number = 0;
    #available: number = 0;

    // State
    #ended: boolean = false;
    #started: boolean = false;

    // Consumer waiting for data
    #pendingResolve: ((value: Buffer | null) => void) | null = null;
    #pendingBytes: number = 0;

    /**
     * Creates a live audio source with a ring buffer.
     *
     * @param bufferDuration Buffer capacity in seconds of audio.
     */
    constructor(bufferDuration: number = DEFAULT_BUFFER_DURATION) {
        this.#frameSize = DEFAULT_CHANNELS * DEFAULT_BYTES_PER_CHANNEL;
        this.#capacity = Math.floor(bufferDuration * DEFAULT_SAMPLE_RATE) * this.#frameSize;
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
     * Write PCM data into the ring buffer. If the buffer is full,
     * oldest data is dropped to make room.
     *
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

        // Wait for data from producer.
        return new Promise((resolve) => {
            this.#pendingResolve = resolve;
            this.#pendingBytes = bytesNeeded;
        });
    }

    async reset(): Promise<void> {
        this.#readPos = 0;
        this.#writePos = 0;
        this.#available = 0;
        this.#ended = false;
        this.#pendingResolve = null;
        this.#pendingBytes = 0;
    }

    async start(): Promise<void> {
        this.#started = true;
    }

    async stop(): Promise<void> {
        this.#started = false;
        this.end();
    }

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
