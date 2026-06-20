import { createWriteStream, type WriteStream } from 'node:fs';

/** The direction a relayed message travelled through the proxy. */
export type TapDirection = 'controller->device' | 'device->controller';

/**
 * Records the plaintext messages that flow through the proxy. Each captured message is printed to the
 * console (colour-coded by direction) and, optionally, appended as a line of JSON to a capture file for
 * later analysis against the `.proto`/message definitions.
 *
 * Decoded OPack values are normalized before logging: multi-byte integers come back from the decoder as
 * `SizedInteger` wrappers (to preserve byte width for faithful re-encoding) which would otherwise serialize
 * to `{}`, so they are unwrapped to their numeric value here. The raw decrypted bytes are also recorded as
 * hex so the capture always carries ground truth.
 */
export class ProxyTap {
    /** ANSI colour for controller→device traffic (cyan). */
    static readonly #OUTBOUND = '\x1b[36m';
    /** ANSI colour for device→controller traffic (magenta). */
    static readonly #INBOUND = '\x1b[35m';
    /** ANSI reset. */
    static readonly #RESET = '\x1b[0m';
    /** ANSI dim. */
    static readonly #DIM = '\x1b[90m';

    readonly #protocol: string;
    readonly #file?: WriteStream;

    /**
     * @param protocol - The protocol label shown in log lines (e.g. "companion-link").
     * @param capturePath - Optional path to a JSONL file that captured messages are appended to.
     */
    constructor(protocol: string, capturePath?: string) {
        this.#protocol = protocol;

        if (capturePath) {
            this.#file = createWriteStream(capturePath, {flags: 'a'});
        }
    }

    /**
     * Records a single relayed message.
     *
     * @param direction - Which way the message travelled.
     * @param frameType - The wire frame type byte.
     * @param message - The decoded OPack message.
     * @param raw - The raw decrypted frame payload (recorded as hex ground truth).
     * @param at - Capture timestamp in epoch milliseconds.
     */
    record(direction: TapDirection, frameType: number, message: unknown, raw: Buffer, at: number): void {
        const normalized = normalize(message);
        const colour = direction === 'controller->device' ? ProxyTap.#OUTBOUND : ProxyTap.#INBOUND;
        const arrow = direction === 'controller->device' ? '→' : '←';

        console.log(`${ProxyTap.#DIM}${this.#protocol}${ProxyTap.#RESET} ${colour}${arrow}${ProxyTap.#RESET} type=${frameType} ${describeMessage(normalized)}`);
        console.dir(normalized, {depth: 8, colors: true});

        this.#file?.write(`${JSON.stringify({at, direction, frameType, message: normalized, raw: raw.toString('hex')})}\n`);
    }

    /** Closes the capture file, if any. */
    close(): void {
        this.#file?.end();
    }
}

/**
 * Produces a short one-line description of an OPack message for the console header.
 *
 * @param message - The normalized message.
 * @returns A short label like `_systemInfo (request #42)`.
 */
function describeMessage(message: unknown): string {
    if (message === null || typeof message !== 'object') {
        return String(message);
    }

    const record = message as Record<string, unknown>;
    const identifier = typeof record._i === 'string' ? record._i : '?';
    const type = record._t === 1 ? 'event' : record._t === 2 ? 'request' : record._t === 3 ? 'response' : '?';
    const correlation = record._x !== undefined && record._x !== null ? ` #${String(record._x)}` : '';

    return `${identifier} (${type}${correlation})`;
}

/**
 * Recursively normalizes a decoded OPack value into something JSON- and console-friendly: numeric wrapper
 * objects (e.g. SizedInteger) are unwrapped to their primitive value, byte arrays become hex, BigInts
 * become strings, and Dates become ISO strings. Plain objects and arrays are walked recursively.
 *
 * @param value - The value to normalize.
 * @returns The normalized value.
 */
function normalize(value: unknown): unknown {
    if (value === null || value === undefined) {
        return null;
    }

    if (value instanceof Uint8Array) {
        return {'@bytes': Buffer.from(value).toString('hex')};
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === 'object') {
        // Unwrap numeric wrapper types (SizedInteger/Integer/Float) whose valueOf() yields a primitive.
        const primitive = (value as {valueOf?: () => unknown}).valueOf?.();

        if (primitive !== value && (typeof primitive === 'number' || typeof primitive === 'string' || typeof primitive === 'boolean')) {
            return primitive;
        }

        if (Array.isArray(value)) {
            return value.map(normalize);
        }

        const out: Record<string, unknown> = {};

        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            out[key] = normalize(entry);
        }

        return out;
    }

    return value;
}
