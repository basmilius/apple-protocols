import { stripANSI } from 'bun';
import { formatWithOptions } from 'node:util';

export type LogEntry = {
    time: string;
    category: string;
    message: string;
    level: 'log' | 'error' | 'warn' | 'info' | 'debug';
};

type LogListener = (entry: LogEntry) => void;

const MAX_BUFFER_SIZE = 500;

const buffer: LogEntry[] = [];
const listeners = new Set<LogListener>();

let installed = false;

const reporterPattern = /^\[([a-z-]+)] /;

function createEntry(level: LogEntry['level'], args: unknown[]): LogEntry {
    const formatted = stripANSI(formatWithOptions({depth: 8}, ...args));
    const time = new Date().toLocaleTimeString('nl-NL', {hour12: false});

    let category: string = level;
    let message = formatted;

    const match = message.match(reporterPattern);

    if (match) {
        category = match[1];
        message = message.slice(match[0].length);
    }

    return {time, category, message, level};
}

function push(entry: LogEntry): void {
    buffer.push(entry);

    if (buffer.length > MAX_BUFFER_SIZE) {
        buffer.shift();
    }

    for (const listener of listeners) {
        listener(entry);
    }
}

export function installLogBridge(): void {
    if (installed) {
        return;
    }

    installed = true;

    const originalLog = console.log.bind(console);
    const originalDebug = console.debug.bind(console);
    const originalInfo = console.info.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);

    console.log = (...args: unknown[]) => {
        push(createEntry('log', args));
        originalLog(...args);
    };

    console.debug = (...args: unknown[]) => {
        push(createEntry('debug', args));
        originalDebug(...args);
    };

    console.info = (...args: unknown[]) => {
        push(createEntry('info', args));
        originalInfo(...args);
    };

    console.warn = (...args: unknown[]) => {
        push(createEntry('warn', args));
        originalWarn(...args);
    };

    console.error = (...args: unknown[]) => {
        push(createEntry('error', args));
        originalError(...args);
    };
}

export function getLogBuffer(): LogEntry[] {
    return [...buffer];
}

export function addLogListener(listener: LogListener): void {
    listeners.add(listener);
}

export function removeLogListener(listener: LogListener): void {
    listeners.delete(listener);
}
