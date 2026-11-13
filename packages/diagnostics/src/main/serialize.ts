import type { SerializedError } from '@shared/contract';

/** Deep enough for a protobuf message with a nested content item, short of a runaway graph. */
const MAX_DEPTH = 10;

/** A single array or record longer than this is cut; a playback queue can hold thousands of items. */
const MAX_ENTRIES = 500;

const CUT = '[cut]';
const MAX_BYTES = 16 * 1024;
const MAX_CHARACTERS = 64 * 1024;
type Budget = {characters: number; nodes: number};

/**
 * Turns anything the SDK hands back into something `structuredClone` can carry over IPC.
 * Everything that leaves main goes through here: call results, event payloads and log arguments.
 *
 * - `bigint` becomes a decimal string, since the structured clone of a bigint is fine but JSON is not
 * - `Uint8Array` and `Buffer` become `{ $bytes: hex, length }`
 * - `Map` and `Set` become arrays
 * - a class instance becomes a plain object, its prototype getters included
 * - a cycle, an overlong list and anything past {@link MAX_DEPTH} become a marker string
 */
export function serialize(value: unknown): unknown {
    return walk(value, 0, new WeakSet<object>(), {characters: MAX_CHARACTERS, nodes: 5000});
}

export function serializeAll(values: readonly unknown[]): unknown[] {
    return walk([...values], 0, new WeakSet<object>(), {characters: MAX_CHARACTERS, nodes: 5000}) as unknown[];
}

export function serializeError(error: unknown): SerializedError {
    if (error instanceof Error) {
        return {name: error.name, message: error.message.slice(0, 8192), stack: error.stack?.slice(0, 8192) ?? null};
    }

    return {name: 'Error', message: String(error).slice(0, 8192), stack: null};
}

function walk(value: unknown, depth: number, seen: WeakSet<object>, budget: Budget): unknown {
    if (--budget.nodes < 0 || budget.characters <= 0) {
        return CUT;
    }
    if (value === null || value === undefined) {
        return value ?? null;
    }

    switch (typeof value) {
        case 'bigint':
            return text(value.toString(), budget);

        case 'function':
            return text(`[function ${value.name || 'anonymous'}]`, budget);

        case 'symbol':
            return text(value.toString(), budget);

        case 'boolean':
        case 'number':
            return value;
        case 'string':
            return text(value, budget);
    }

    const object = value as object;

    if (seen.has(object)) {
        return '[cycle]';
    }

    if (depth >= MAX_DEPTH) {
        return CUT;
    }

    if (object instanceof Date) {
        return object.toISOString();
    }

    if (object instanceof Error) {
        return serializeError(object);
    }

    if (object instanceof ArrayBuffer) {
        return bytesOf(new Uint8Array(object), budget);
    }

    if (ArrayBuffer.isView(object)) {
        return bytesOf(new Uint8Array(object.buffer, object.byteOffset, object.byteLength), budget);
    }

    seen.add(object);

    try {
        if (Array.isArray(object)) {
            return list(object, depth, seen, budget);
        }

        if (object instanceof Map || object instanceof Set) {
            const kept: unknown[] = [];
            for (const entry of object) {
                if (kept.length >= MAX_ENTRIES || budget.nodes <= 0 || budget.characters <= 0) {
                    kept.push(CUT);
                    break;
                }
                kept.push(object instanceof Map
                    ? {key: walk(entry[0], depth + 1, seen, budget), value: walk(entry[1], depth + 1, seen, budget)}
                    : walk(entry, depth + 1, seen, budget));
            }
            return kept;
        }

        return record(object, depth, seen, budget);
    } finally {
        seen.delete(object);
    }
}

function text(value: string, budget: Budget): string {
    const length = Math.min(value.length, 8192, budget.characters);
    budget.characters -= length;
    return length < value.length ? value.slice(0, length) + CUT : value;
}

function bytesOf(bytes: Uint8Array, budget: Budget): {$bytes: string; length: number; truncated?: boolean} {
    const length = Math.min(bytes.byteLength, MAX_BYTES, Math.floor(budget.characters / 2));
    budget.characters -= length * 2;
    return {$bytes: Buffer.from(bytes.subarray(0, length)).toString('hex'), length: bytes.byteLength, ...(length < bytes.byteLength ? {truncated: true} : {})};
}

function list(values: readonly unknown[], depth: number, seen: WeakSet<object>, budget: Budget, deeper = true): unknown[] {
    const kept = values.slice(0, MAX_ENTRIES).map(entry => (deeper ? walk(entry, depth + 1, seen, budget) : entry));
    return values.length > MAX_ENTRIES ? [...kept, `${CUT} ${values.length - MAX_ENTRIES} more`] : kept;
}

function record(object: object, depth: number, seen: WeakSet<object>, budget: Budget): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    let count = 0;

    for (const key of Object.keys(object)) {
        if (count === MAX_ENTRIES || budget.nodes <= 0 || budget.characters <= 0) {
            result[CUT] = 'more keys';
            break;
        }

        const name = text(key, budget);
        Object.defineProperty(result, name, {enumerable: true, configurable: true, value: walk((object as Record<string, unknown>)[key], depth + 1, seen, budget)});
        count += 1;
    }

    for (const [key, read] of getters(object)) {
        if (budget.nodes <= 0 || budget.characters <= 0) {
            break;
        }
        if (key in result) {
            continue;
        }

        try {
            Object.defineProperty(result, text(key, budget), {enumerable: true, configurable: true, value: walk(read.call(object), depth + 1, seen, budget)});
        } catch (error) {
            Object.defineProperty(result, text(key, budget), {enumerable: true, configurable: true, value: text(`[getter threw: ${error instanceof Error ? error.message : String(error)}]`, budget)});
        }
    }

    return result;
}

/** Include prototype getters because SDK instances expose most readable state through them. */
function getters(object: object): [string, () => unknown][] {
    const found: [string, () => unknown][] = [];
    let prototype = Object.getPrototypeOf(object);

    while (prototype !== null && prototype !== Object.prototype) {
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
            if (typeof descriptor.get === 'function' && !found.some(([name]) => name === key)) {
                found.push([key, descriptor.get]);
            }
        }

        prototype = Object.getPrototypeOf(prototype);
    }

    return found;
}
