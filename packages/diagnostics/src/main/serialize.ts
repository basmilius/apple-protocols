import type { SerializedError } from '@shared/contract';

/** Deep enough for a protobuf message with a nested content item, short of a runaway graph. */
const MAX_DEPTH = 10;

/** A single array or record longer than this is cut; a playback queue can hold thousands of items. */
const MAX_ENTRIES = 500;

const CUT = '[cut]';

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
    return walk(value, 0, new WeakSet<object>());
}

export function serializeAll(values: readonly unknown[]): unknown[] {
    return values.map(value => serialize(value));
}

export function serializeError(error: unknown): SerializedError {
    if (error instanceof Error) {
        return {name: error.name, message: error.message, stack: error.stack ?? null};
    }

    return {name: 'Error', message: String(error), stack: null};
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (value === null || value === undefined) {
        return value ?? null;
    }

    switch (typeof value) {
        case 'bigint':
            return value.toString();

        case 'function':
            return `[function ${value.name || 'anonymous'}]`;

        case 'symbol':
            return value.toString();

        case 'boolean':
        case 'number':
        case 'string':
            return value;
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
        return bytesOf(new Uint8Array(object));
    }

    if (ArrayBuffer.isView(object)) {
        return bytesOf(new Uint8Array(object.buffer, object.byteOffset, object.byteLength));
    }

    seen.add(object);

    try {
        if (Array.isArray(object)) {
            return list(object, depth, seen);
        }

        if (object instanceof Map) {
            return list(
                Array.from(object.entries()).map(([key, entry]) => ({key: walk(key, depth + 1, seen), value: walk(entry, depth + 1, seen)})),
                depth,
                seen,
                false
            );
        }

        if (object instanceof Set) {
            return list(Array.from(object.values()), depth, seen);
        }

        return record(object, depth, seen);
    } finally {
        seen.delete(object);
    }
}

function bytesOf(bytes: Uint8Array): { $bytes: string; length: number } {
    return {$bytes: Buffer.from(bytes).toString('hex'), length: bytes.byteLength};
}

function list(values: readonly unknown[], depth: number, seen: WeakSet<object>, deeper = true): unknown[] {
    const kept = values.slice(0, MAX_ENTRIES).map(entry => (deeper ? walk(entry, depth + 1, seen) : entry));
    return values.length > MAX_ENTRIES ? [...kept, `${CUT} ${values.length - MAX_ENTRIES} more`] : kept;
}

function record(object: object, depth: number, seen: WeakSet<object>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    let count = 0;

    for (const key of Object.keys(object)) {
        if (count === MAX_ENTRIES) {
            result[CUT] = 'more keys';
            break;
        }

        result[key] = walk((object as Record<string, unknown>)[key], depth + 1, seen);
        count += 1;
    }

    for (const [key, read] of getters(object)) {
        if (key in result) {
            continue;
        }

        try {
            result[key] = walk(read.call(object), depth + 1, seen);
        } catch (error) {
            result[key] = `[getter threw: ${error instanceof Error ? error.message : String(error)}]`;
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
