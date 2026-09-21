import { inspect } from 'node:util';
import { reporter, type ReporterEntry } from '@basmilius/apple-sdk';
import type { LogEntry } from '@shared/contract';
import { serializeAll } from './serialize';

const CAPACITY = 5000;

/** The ANSI a `Logger` label carries; the renderer paints its own colors. */
const ANSI = /\u001b\[\d+m/g;

/**
 * The reporter sink and the buffer behind it. Every `Logger` call in the protocol packages lands
 * here with the device it came from, which is what lets the console filter by device without any
 * console patching.
 */
export class LogBuffer {
    readonly #entries: LogEntry[] = [];
    readonly #listeners = new Set<(entry: LogEntry) => void>();

    #next = 1;

    constructor() {
        this.onReport = this.onReport.bind(this);
    }

    get entries(): readonly LogEntry[] {
        return this.#entries;
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
        this.#entries.length = 0;
    }

    onReport(entry: ReporterEntry): void {
        const record: LogEntry = {
            id: this.#next,
            group: entry.group,
            deviceId: entry.deviceId,
            message: format(entry.args),
            args: serializeAll(entry.args.filter(argument => typeof argument !== 'string')),
            timestamp: entry.timestamp
        };

        this.#next += 1;
        this.#entries.push(record);

        if (this.#entries.length > CAPACITY) {
            this.#entries.splice(0, this.#entries.length - CAPACITY);
        }

        for (const listener of this.#listeners) {
            listener(record);
        }
    }
}

function format(args: readonly unknown[]): string {
    return args
        .map(argument => (typeof argument === 'string' ? argument : inspect(argument, {depth: 3, breakLength: 160, colors: false})))
        .join(' ')
        .replace(ANSI, '');
}
