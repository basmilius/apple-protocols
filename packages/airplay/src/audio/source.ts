/**
 * Interleaved 44100 Hz stereo PCM, signed 16-bit big-endian, with complete frames.
 * Stream owners start the source once and stop it on completion, cancellation or failure.
 */
export interface AudioSource {
    /** Total duration in seconds. */
    get duration(): number;

    /**
     * Reads up to `count` frames.
     *
     * @returns The PCM data, or null once the source is exhausted.
     */
    readFrames(count: number): Promise<Buffer | null>;

    /** Rewinds the source so it can be read again. */
    reset(): Promise<void>;

    /** Starts the underlying decoders or streams. */
    start(): Promise<void>;

    /** Stops the source and releases its resources. */
    stop(): Promise<void>;
}
