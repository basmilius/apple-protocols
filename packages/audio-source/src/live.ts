import type { AudioSource } from '@corewire/airplay';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from './const';

/** In seconds of audio. */
const DEFAULT_BUFFER_DURATION = 2;

export type LiveSourceOptions = {
    /** Capacity of the ring buffer in seconds of audio; 2 when omitted. */
    readonly bufferDuration?: number;
};

/** Live PCM ring buffer. Drops the oldest data when producers outpace the consumer. */
export class LiveSource implements AudioSource {
    /** Always Infinity. */
    readonly duration: number = Infinity;

    /** Bytes per frame. */
    readonly #frameSize: number;

    readonly #buffer: Buffer;

    /** In bytes. */
    readonly #capacity: number;

    #readPos: number = 0;
    #writePos: number = 0;
    #available: number = 0;
    #ended: boolean = false;
    #started: boolean = false;

    /** Resolves the one consumer that waits for data. */
    #pendingResolve: ((value: Buffer | null) => void) | null = null;

    /** Bytes the waiting consumer asked for. */
    #pendingBytes: number = 0;

    constructor(options: LiveSourceOptions = {}) {
        const bufferDuration = options.bufferDuration ?? DEFAULT_BUFFER_DURATION;

        if (!Number.isFinite(bufferDuration) || bufferDuration <= 0 || bufferDuration * AUDIO_SAMPLE_RATE < 1) {
            throw new RangeError('Live buffer duration must hold at least one audio frame.');
        }

        this.#frameSize = AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL;
        this.#capacity = Math.floor(bufferDuration * AUDIO_SAMPLE_RATE) * this.#frameSize;
        this.#buffer = Buffer.alloc(this.#capacity);
    }

    /** Bytes ready to read. */
    get available(): number {
        return this.#available;
    }

    /** In bytes. */
    get capacity(): number {
        return this.#capacity;
    }

    /** True after {@link end} or {@link stop}, until {@link reset}. */
    get ended(): boolean {
        return this.#ended;
    }

    /**
     * Writes PCM into the ring buffer and drops the oldest data when it is full.
     *
     * @returns Bytes written; 0 after {@link end}, at most the capacity.
     */
    write(data: Buffer): number {
        if (data.length % this.#frameSize !== 0) {
            throw new RangeError('Live PCM writes must contain complete stereo frames.');
        }

        if (this.#ended) {
            return 0;
        }

        const length = Math.min(data.length, this.#capacity);
        const source = length < data.length
            ? data.subarray(data.length - length)
            : data;

        const free = this.#capacity - this.#available;

        if (length > free) {
            const drop = length - free;
            this.#readPos = (this.#readPos + drop) % this.#capacity;
            this.#available -= drop;
        }

        const firstChunk = Math.min(length, this.#capacity - this.#writePos);

        source.copy(this.#buffer, this.#writePos, 0, firstChunk);

        if (firstChunk < length) {
            source.copy(this.#buffer, 0, firstChunk, length);
        }

        this.#writePos = (this.#writePos + length) % this.#capacity;
        this.#available += length;

        this.#tryFulfillPending();

        return length;
    }

    /** Marks the end of the stream; later writes are ignored and the waiting read gets what is left. */
    end(): void {
        this.#ended = true;

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
     * Reads `count` frames and waits until they are written or the stream ends.
     * Only one read may wait at a time.
     *
     * @returns Null once the stream has ended and the buffer is empty.
     */
    async readFrames(count: number): Promise<Buffer | null> {
        if (!Number.isSafeInteger(count) || count <= 0 || count * this.#frameSize > this.#capacity) {
            throw new RangeError('Frame count must be positive and fit in the Live buffer.');
        }

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

        if (this.#pendingResolve) {
            throw new Error('Only one concurrent readFrames() call is supported on Live sources.');
        }

        return new Promise((resolve) => {
            this.#pendingResolve = resolve;
            this.#pendingBytes = bytesNeeded;
        });
    }

    /** Empties the buffer and accepts writes again after {@link end}. A waiting read gets null. */
    async reset(): Promise<void> {
        this.#pendingResolve?.(null);
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

    /** Ends the stream, see {@link end}. */
    async stop(): Promise<void> {
        this.#started = false;
        this.end();
    }

    /** Copies `bytes` out of the ring buffer, across the wrap point when needed. */
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
