export default class Statistics {
    readonly sampleRate: number;
    readonly startTimeNs: bigint;
    intervalTime: number;
    totalFrames: number = 0;
    intervalFrames: number = 0;

    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.startTimeNs = process.hrtime.bigint();
        this.intervalTime = performance.now();
    }

    get expectedFrameCount(): number {
        const elapsedNs = Number(process.hrtime.bigint() - this.startTimeNs);

        return Math.floor(elapsedNs / (1e9 / this.sampleRate));
    }

    get framesBehind(): number {
        return this.expectedFrameCount - this.totalFrames;
    }

    get intervalCompleted(): boolean {
        return this.intervalFrames >= this.sampleRate;
    }

    tick(sentFrames: number): void {
        this.totalFrames += sentFrames;
        this.intervalFrames += sentFrames;
    }

    newInterval(): [number, number] {
        const endTime = performance.now();
        const diff = (endTime - this.intervalTime) / 1000;
        this.intervalTime = endTime;

        const frames = this.intervalFrames;
        this.intervalFrames = 0;

        return [diff, frames];
    }
}
