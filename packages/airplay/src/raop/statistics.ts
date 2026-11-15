/**
 * Compares the frames sent against the frames due by the monotonic clock,
 * to detect when sending falls behind real time.
 */
export class Statistics {
    /** Sample rate in Hz. */
    readonly sampleRate: number;

    /** Monotonic start time in nanoseconds. */
    readonly startTimeNs: bigint;

    /** Start of the current reporting interval, in milliseconds. */
    intervalTime: number;

    /** Frames sent since streaming began. */
    totalFrames: number = 0;

    /** Frames sent in the current reporting interval. */
    intervalFrames: number = 0;

    /** @param sampleRate - Sample rate in Hz. */
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.startTimeNs = process.hrtime.bigint();
        this.intervalTime = performance.now();
    }

    /** Number of frames due by now since streaming started. */
    get expectedFrameCount(): number {
        const elapsedNs = Number(process.hrtime.bigint() - this.startTimeNs);

        return Math.floor(elapsedNs / (1e9 / this.sampleRate));
    }

    /** Number of frames the sender lags behind real time; positive means send faster. */
    get framesBehind(): number {
        return this.expectedFrameCount - this.totalFrames;
    }

    /** True once the interval holds a second of frames, time to log and reset. */
    get intervalCompleted(): boolean {
        return this.intervalFrames >= this.sampleRate;
    }

    tick(sentFrames: number): void {
        this.totalFrames += sentFrames;
        this.intervalFrames += sentFrames;
    }

    /**
     * Ends the current reporting interval and resets its frame counter.
     *
     * @returns Elapsed seconds and frames sent in the interval that ended.
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
