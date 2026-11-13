import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { PerformanceStatus, RetentionStats } from '@shared/contract';

/** One shared sampler keeps split panels from resetting each other's measurement window. */
export class RuntimeMetrics {
    readonly #histogram = monitorEventLoopDelay({resolution: 10});
    readonly #retention: () => Record<string, RetentionStats>;
    #utilization = performance.eventLoopUtilization();
    #sample = {p95Ms: 0, p99Ms: 0, maxMs: 0, utilization: 0};
    #peakMs = 0;
    #sampledAt = Date.now();
    #startedAt = Date.now();

    constructor(retention: () => Record<string, RetentionStats>) {
        this.#retention = retention;
        this.#histogram.enable();
        setInterval(() => this.#sampleWindow(), 1000).unref();
    }

    status(): PerformanceStatus {
        const memory = process.memoryUsage();
        return {sampledAt: this.#sampledAt, startedAt: this.#startedAt, eventLoop: {...this.#sample, peakMs: this.#peakMs}, memory: {rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external, arrayBuffers: memory.arrayBuffers}, retention: this.#retention()};
    }

    reset(): PerformanceStatus {
        this.#histogram.reset();
        this.#utilization = performance.eventLoopUtilization();
        this.#peakMs = 0;
        this.#sample = {p95Ms: 0, p99Ms: 0, maxMs: 0, utilization: 0};
        this.#sampledAt = this.#startedAt = Date.now();
        return this.status();
    }

    #sampleWindow(): void {
        const current = performance.eventLoopUtilization();
        const delta = performance.eventLoopUtilization(current, this.#utilization);
        this.#utilization = current;
        this.#sample = {p95Ms: this.#histogram.percentile(95) / 1e6, p99Ms: this.#histogram.percentile(99) / 1e6, maxMs: this.#histogram.max / 1e6, utilization: delta.utilization};
        this.#peakMs = Math.max(this.#peakMs, this.#sample.maxMs);
        this.#sampledAt = Date.now();
        this.#histogram.reset();
    }
}
