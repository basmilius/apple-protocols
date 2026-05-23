import { reporter } from '@basmilius/apple-common';
import type { LogEntry, LogGroup, LogLevel } from '@shared/snapshots';

const MAX_BUFFER_SIZE = 2000;
const ANSI_PATTERN = /\[\d+m/g;
const CATEGORY_PATTERN = /^\[([^\]]+)]/;

type Listener = (entry: LogEntry) => void;

const CONSOLE_LEVELS: LogLevel[] = ['log', 'error', 'warn', 'info', 'debug'];

function stripAnsi(value: string): string {
    return value.replace(ANSI_PATTERN, '');
}

function formatValue(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }

    if (value instanceof Error) {
        return value.stack ?? value.message;
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function extractCategory(parts: string[]): {category: string; message: string} {
    let category = 'app';
    const cleaned: string[] = [];

    for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const stripped = stripAnsi(part).trim();
        const match = CATEGORY_PATTERN.exec(stripped);

        if (match && i < 2) {
            category = match[1];
            continue;
        }

        cleaned.push(stripped || part);
    }

    return {category, message: cleaned.join(' ').trim()};
}

export class LogCollector {
    readonly #entries: LogEntry[] = [];
    readonly #listeners = new Set<Listener>();
    #originalConsole: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {};
    #installed = false;

    install(): void {
        if (this.#installed) {
            return;
        }

        for (const level of CONSOLE_LEVELS) {
            const handle = console as unknown as Record<string, (...args: unknown[]) => void>;
            const original = handle[level];
            this.#originalConsole[level] = original;

            handle[level] = (...args: unknown[]) => {
                original.apply(console, args);

                const parts = args.map(formatValue);
                const {category, message} = extractCategory(parts);

                this.#push({
                    time: new Date().toISOString(),
                    category,
                    message,
                    level
                });
            };
        }

        this.#installed = true;
    }

    uninstall(): void {
        const handle = console as unknown as Record<string, unknown>;

        for (const [level, original] of Object.entries(this.#originalConsole)) {
            if (original) {
                handle[level] = original;
            }
        }

        this.#originalConsole = {};
        this.#installed = false;
    }

    addListener(listener: Listener): () => void {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    snapshot(): LogEntry[] {
        return [...this.#entries];
    }

    clear(): void {
        this.#entries.length = 0;
    }

    setGroups(groups: LogGroup[]): void {
        const all: LogGroup[] = ['debug', 'error', 'info', 'net', 'raw', 'warn'];

        for (const group of all) {
            if (groups.includes(group)) {
                reporter.enable(group);
            } else {
                reporter.disable(group);
            }
        }
    }

    #push(entry: LogEntry): void {
        this.#entries.push(entry);

        if (this.#entries.length > MAX_BUFFER_SIZE) {
            this.#entries.splice(0, this.#entries.length - MAX_BUFFER_SIZE);
        }

        for (const listener of this.#listeners) {
            listener(entry);
        }
    }
}
