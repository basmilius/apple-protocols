/** Hex and base64 in, hex out: the currency every playground tool trades in. */

const HEX = /^[0-9a-f]*$/i;

/**
 * Reads a byte string the way a user pasted it. Hex may carry spaces, colons, newlines and an `0x`
 * prefix; anything that is not hex is read as base64, which is how `storage.json` prints a key.
 */
export function parseBytes(value: unknown, field: string): Buffer {
    const text = String(value ?? '').trim();

    if (text.length === 0) {
        return Buffer.alloc(0);
    }

    const cleaned = text.replace(/^0x/i, '').replace(/[\s:,-]/g, '');

    if (HEX.test(cleaned) && cleaned.length % 2 === 0) {
        return Buffer.from(cleaned, 'hex');
    }

    const decoded = Buffer.from(text, 'base64');

    if (decoded.length === 0) {
        throw new Error(`'${field}' is neither hex nor base64.`);
    }

    return decoded;
}

/** The same, but a plain string input is taken literally as UTF-8. */
export function parseBytesOrText(value: unknown, field: string, asText: boolean): Buffer {
    if (asText) {
        return Buffer.from(String(value ?? ''), 'utf8');
    }

    return parseBytes(value, field);
}

export function toHex(value: Buffer | Uint8Array | ArrayBuffer): string {
    if (value instanceof ArrayBuffer) {
        return Buffer.from(value).toString('hex');
    }

    return Buffer.from(value).toString('hex');
}

export function readString(args: Readonly<Record<string, unknown>>, field: string, fallback = ''): string {
    const value = args[field];
    return value === undefined || value === null ? fallback : String(value);
}

export function readNumber(args: Readonly<Record<string, unknown>>, field: string, fallback = 0): number {
    const value = args[field];

    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        throw new Error(`'${field}' is not a number.`);
    }

    return parsed;
}

export function readBoolean(args: Readonly<Record<string, unknown>>, field: string, fallback = false): boolean {
    const value = args[field];

    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    return value === true || value === 'true';
}

/**
 * Reads a JSON argument. The tools that encode take their value this way, so `1` and `"1"` stay
 * apart, which is exactly the distinction OPack and plist encode differently.
 */
export function readJson(args: Readonly<Record<string, unknown>>, field: string): unknown {
    const text = readString(args, field).trim();

    if (text.length === 0) {
        throw new Error(`'${field}' is empty.`);
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`'${field}' is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** The index of the first byte that differs, or -1 when the two are equal. */
export function firstDifference(left: Buffer, right: Buffer): number {
    const shortest = Math.min(left.length, right.length);

    for (let i = 0; i < shortest; i += 1) {
        if (left[i] !== right[i]) {
            return i;
        }
    }

    return left.length === right.length ? -1 : shortest;
}
