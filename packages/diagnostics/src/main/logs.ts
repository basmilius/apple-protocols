import { inspect } from 'node:util';
import { reporter, type ReporterEntry } from '@basmilius/apple-sdk';
import type { LogEntry } from '@shared/contract';
import { serializeAll } from './serialize';
import { Ring } from './ring';

const CAPACITY = 5000;

/** The ANSI a `Logger` label carries; the renderer paints its own colors. */
const ANSI = /\u001b\[\d+m/g;

/** Collects protocol logs through the reporter sink, retaining device IDs for filtering. */
export class LogBuffer {
    readonly #ring = new Ring<LogEntry>(CAPACITY, entry => entry.id);
    readonly #listeners = new Set<(entry: LogEntry) => void>();

    #next = 1;

    constructor() {
        this.onReport = this.onReport.bind(this);
    }

    get entries(): readonly LogEntry[] {
        return this.#ring.entries;
    }

    get stats(): Ring<LogEntry>['stats'] {
        return this.#ring.stats;
    }

    /** Sends every group to the buffer and leaves the console output as it was. */
    install(): void {
        reporter.setSink(this.onReport);
    }

    onListener(listener: (entry: LogEntry) => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    clear(): void {
        this.#ring.clear();
    }

    onReport(entry: ReporterEntry): void {
        const args = serializeAll(entry.args);
        const record: LogEntry = {
            id: this.#next,
            group: entry.group,
            deviceId: entry.deviceId,
            message: format(args).slice(0, 8192),
            args: args.filter(argument => typeof argument !== 'string'),
            timestamp: entry.timestamp
        };

        this.#next += 1;
        this.#ring.push(record);

        for (const listener of this.#listeners) {
            listener(record);
        }
    }
}

function format(args: readonly unknown[]): string {
    return args
        .map(argument => (typeof argument === 'string' ? argument : inspect(argument, {depth: 3, breakLength: 160, colors: false, maxArrayLength: 50, maxStringLength: 8192})))
        .join(' ')
        .replace(ANSI, '');
}
