import { createWriteStream, type WriteStream } from 'node:fs';
import type { Context } from '@corewire/core/transport';

export type TapDirection = 'controller->device' | 'device->controller';

/** Deep enough for a nested now-playing message, short of a runaway graph. */
const MAX_DEPTH = 16;

/**
 * Hands every relayed plaintext message to the traffic tap of the app as protocol `proxy`, under
 * the logger id of its context, and appends it to an optional JSONL capture. Controller to device
 * is `out`, device to controller `in`. OPack numeric wrappers are unwrapped, so they do not show
 * up as empty objects.
 */
export class ProxyTap {
    readonly #context: Context;
    readonly #label: string;
    readonly #file?: WriteStream;
    readonly #counts: Record<TapDirection, number> = {'controller->device': 0, 'device->controller': 0};

    /**
     * @param label - Prefixes each summary, e.g. `companion-link`.
     * @param capturePath - JSONL file that messages are appended to.
     */
    constructor(context: Context, label: string, capturePath?: string) {
        this.#context = context;
        this.#label = label;

        if (capturePath) {
            this.#file = createWriteStream(capturePath, {flags: 'a', mode: 0o600});
            this.#file.on('error', error => this.#context.logger.warn('[proxy]', 'Could not write the capture file.', error.message));
        }
    }

    /** Messages relayed so far, per direction. */
    get counts(): Readonly<Record<TapDirection, number>> {
        return this.#counts;
    }

    /**
     * @param frameType - The frame type byte on the wire, 0 where the protocol has none.
     * @param raw - The plaintext frame.
     * @param at - Epoch milliseconds.
     */
    record(direction: TapDirection, frameType: number, message: unknown, raw: Buffer, at: number): void {
        const normalized = normalize(message, 0);
        const arrow = direction === 'controller->device' ? '→' : '←';

        this.#counts[direction] += 1;
        this.#context.logger.traffic('proxy', direction === 'controller->device' ? 'out' : 'in', `${this.#label} ${arrow} ${describe(normalized, frameType)}`, normalized, raw);

        if (this.#file && !this.#file.destroyed) {
            this.#file.write(`${JSON.stringify({at, direction, frameType, message: normalized, raw: raw.toString('hex')}, jsonValue)}\n`);
        }
    }

    close(): void {
        this.#file?.end();
    }
}

/** One line for an OPack message, an RTSP request or response, or a batch of MRP messages. */
function describe(message: unknown, frameType: number): string {
    if (Array.isArray(message)) {
        return `${message.length} messages`;
    }

    if (message === null || typeof message !== 'object') {
        return `type=${frameType}`;
    }

    const record = message as Record<string, unknown>;

    if (typeof record.method === 'string') {
        return `${record.method} ${String(record.path ?? '')}`;
    }

    if (typeof record.status === 'number') {
        return `${record.status} ${String(record.statusText ?? '')}`;
    }

    const identifier = typeof record._i === 'string' ? record._i : '?';
    const type = record._t === 1 ? 'event' : record._t === 2 ? 'request' : record._t === 3 ? 'response' : '?';
    const correlation = record._x !== undefined && record._x !== null ? ` #${String(record._x)}` : '';

    return `${identifier} (${type}${correlation})`;
}

/** Unwraps OPack numbers such as SizedInteger, which return their primitive from `valueOf()`. Bytes stay bytes. */
function normalize(value: unknown, depth: number): unknown {
    if (value === null || typeof value !== 'object' || value instanceof Uint8Array || value instanceof Date || depth >= MAX_DEPTH) {
        return value;
    }

    const primitive = (value as {valueOf?(): unknown}).valueOf?.();

    if (primitive !== value && (typeof primitive === 'number' || typeof primitive === 'string' || typeof primitive === 'boolean' || typeof primitive === 'bigint')) {
        return primitive;
    }

    if (Array.isArray(value)) {
        return value.map(entry => normalize(entry, depth + 1));
    }

    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        result[key] = normalize(entry, depth + 1);
    }

    return result;
}

/** Bytes as hex and bigints as strings, as the capture file has always written them. */
function jsonValue(this: Record<string, unknown>, key: string, value: unknown): unknown {
    const original = this[key];

    if (original instanceof Uint8Array) {
        return {'@bytes': Buffer.from(original).toString('hex')};
    }

    return typeof value === 'bigint' ? value.toString() : value;
}
