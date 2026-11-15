/**
 * Encodes `[type, value]` entries; a number value is a single byte. A value longer than 255 bytes
 * becomes consecutive fragments of the same type, as TLV8 requires.
 */
export function encode(entries: [number, number | Buffer | Uint8Array][]): Buffer {
    let totalSize = 0;

    for (const [, valueRaw] of entries) {
        const len = typeof valueRaw === 'number' ? 1 : valueRaw.length;
        const chunks = Math.max(1, Math.ceil(len / 255));
        totalSize += chunks * 2 + len;
    }

    const result = Buffer.allocUnsafe(totalSize);
    let pos = 0;

    for (const [type, valueRaw] of entries) {
        let value: Buffer | Uint8Array;
        let valueLen: number;

        if (typeof valueRaw === 'number') {
            value = Buffer.allocUnsafe(1);
            value[0] = valueRaw;
            valueLen = 1;
        } else {
            value = valueRaw;
            valueLen = value.length;
        }

        let offset = 0;

        do {
            const len = Math.min(valueLen - offset, 255);
            result[pos++] = type;
            result[pos++] = len;

            if (len > 0) {
                if (value instanceof Buffer) {
                    value.copy(result, pos, offset, offset + len);
                } else {
                    result.set(value.subarray(offset, offset + len), pos);
                }

                pos += len;
            }

            offset += len;
        } while (offset < valueLen);
    }

    return result;
}

/**
 * Decodes a TLV8 buffer into a map from type to value, for messages that hold each type once,
 * such as pairing messages. Adjacent entries of the same type are concatenated, which reassembles
 * fragmented values. When a type appears again after another type, the first value wins.
 *
 * @throws {RangeError} When an entry is truncated.
 */
export function decode(buf: Buffer): Map<number, Buffer> {
    const map = new Map<number, Buffer>();

    for (const [type, value] of decodeEntries(buf)) {
        if (!map.has(type)) {
            map.set(type, value);
        }
    }

    return map;
}

/**
 * Decodes a TLV8 buffer into its `[type, value]` entries in order, for lists in which a type
 * repeats. Adjacent entries of the same type are concatenated into one value, which reassembles
 * fragmented values; a separator entry between two items keeps them apart.
 *
 * @throws {RangeError} When an entry is truncated.
 */
export function decodeEntries(buf: Buffer): [number, Buffer][] {
    const entries: [number, Buffer][] = [];
    let i = 0;

    while (i < buf.length) {
        if (buf.length - i < 2) {
            throw new RangeError('Truncated TLV8 header');
        }

        const type = buf[i++];
        const len = buf[i++];

        if (len > buf.length - i) {
            throw new RangeError('Truncated TLV8 value');
        }

        const value = buf.subarray(i, i + len) as Buffer;
        const last = entries.at(-1);

        if (last && last[0] === type) {
            last[1] = Buffer.concat([last[1], value]);
        } else {
            entries.push([type, value]);
        }

        i += len;
    }

    return entries;
}
