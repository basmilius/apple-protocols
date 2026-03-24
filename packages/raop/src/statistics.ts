/**
 * Tracks real-time streaming statistics to detect when audio packet
 * sending falls behind wall-clock time. Uses high-resolution monotonic
 * timers to compare actual frames sent against expected frame count.
 */
export default class Statistics {
    /** Audio sample rate in Hz, used to compute expected frame counts. */
    readonly sampleRate: number;
    /** High-resolution monotonic timestamp (nanoseconds) captured at construction. */
    readonly startTimeNs: bigint;
    /** Millisecond timestamp marking the start of the current reporting interval. */
    intervalTime: number;
    /** Total number of audio frames sent since streaming began. */
    totalFrames: number = 0;
    /** Number of audio frames sent within the current reporting interval. */
    intervalFrames: number = 0;

    /**
     * Creates a new Statistics tracker, capturing the current time as baseline.
     *
     * @param sampleRate - Audio sample rate in Hz (e.g. 44100).
     */
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.startTimeNs = process.hrtime.bigint();
        this.intervalTime = performance.now();
    }

    /**
     * Computes how many audio frames should have been sent by now,
     * based on elapsed wall-clock time since streaming started.
     */
    get expectedFrameCount(): number {
        const elapsedNs = Number(process.hrtime.bigint() - this.startTimeNs);

        return Math.floor(elapsedNs / (1e9 / this.sampleRate));
    }

    /**
     * Number of frames the sender is lagging behind real-time.
     * A positive value means packets need to be sent faster.
     */
    get framesBehind(): number {
        return this.expectedFrameCount - this.totalFrames;
    }

    /**
     * Whether the current interval has accumulated at least one second
     * worth of frames, indicating it is time to log and reset.
     */
    get intervalCompleted(): boolean {
        return this.intervalFrames >= this.sampleRate;
    }

    /**
     * Records that additional audio frames have been sent.
     *
     * @param sentFrames - Number of frames just sent.
     */
    tick(sentFrames: number): void {
        this.totalFrames += sentFrames;
        this.intervalFrames += sentFrames;
    }

    /**
     * Completes the current reporting interval, resetting the interval
     * frame counter and returning timing information for logging.
     *
     * @returns A tuple of [elapsed seconds, frames sent] for the completed interval.
     */
    newInterval(): [number, number] {
        const endTime = performance.now();
        const diff = (endTime - this.intervalTime) / 1000;
        this.intervalTime = endTime;

        const frames = this.intervalFrames;
        this.intervalFrames = 0;

        return [diff, frames];
    }
}
