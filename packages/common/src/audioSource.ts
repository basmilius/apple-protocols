/**
 * Interleaved 44100 Hz stereo PCM, signed 16-bit big-endian, with complete frames.
 * Stream owners start the source once and stop it on completion, cancellation or failure.
 */
export interface AudioSource {
    /** Total duration of the audio source in seconds. */
    get duration(): number;

    /**
     * Reads the specified number of audio frames from the source.
     *
     * @param count - The number of frames to read.
     * @returns A buffer containing the audio data, or null if the source is exhausted.
     */
    readFrames(count: number): Promise<Buffer | null>;

    /** Resets the source to the beginning, allowing it to be read again. */
    reset(): Promise<void>;

    /** Starts the audio source, initializing any underlying decoders or streams. */
    start(): Promise<void>;

    /** Stops the audio source and releases any underlying resources. */
    stop(): Promise<void>;
}
