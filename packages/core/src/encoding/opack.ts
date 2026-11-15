/** The values written in full so far, indexed by a hash of their bytes, that later values refer back to. */
type ObjectList = {values: Uint8Array[]; index: Map<number, number[]>};

/** A value unpacked from an OPack buffer. */
type UnpackResult = {
    readonly value: any;

    /** The offset of the first byte after this value. */
    readonly offset: number;
};

/** A value packed into its bytes. */
type PackResult = {
    readonly packed: Uint8Array;

    /** Whether the value joins the object list, so a repeat of it becomes a reference. */
    readonly shareable: boolean;
};

/**
 * The OPack tag bytes. A tag holds the type of the value that follows, and for small
 * values also its inline length.
 */
const TAG = {
    TRUE: 0x01,
    FALSE: 0x02,
    TERMINATOR: 0x03,
    NULL: 0x04,
    UUID: 0x05,
    DATE: 0x06,
    INT_BASE: 0x08,
    INT_INLINE_MIN: 0x07,
    INT_INLINE_MAX: 0x2F,
    INT_SIZED: 0x30,
    INT_SIZED_MAX: 0x34,
    FLOAT32: 0x35,
    FLOAT64: 0x36,
    STR_BASE: 0x40,
    STR_MAX_INLINE: 0x60,
    STR_SIZED: 0x61,
    STR_SIZED_MAX: 0x64,
    STR_NUL_TERMINATED: 0x6F,
    BYTES_BASE: 0x70,
    BYTES_MAX_INLINE: 0x90,
    BYTES_SIZED: 0x91,
    BYTES_SIZED_MAX: 0x94,
    BYTES_CHUNKED: 0x9F,
    REF_BASE: 0xA0,
    REF_MAX_INLINE: 0xC0,
    REF_SIZED: 0xC1,
    REF_SIZED_MAX: 0xC4,
    ARRAY_BASE: 0xD0,
    ARRAY_VARIABLE: 0xDF,
    DICT_BASE: 0xE0,
    DICT_VARIABLE: 0xEF
} as const;

/** The widths in bytes of the sized integers 0x30 to 0x34. */
const INT_WIDTHS = [1, 2, 4, 8, 16];

/** The widths in bytes of the length of the sized strings 0x61 to 0x64 and bytes 0x91 to 0x94. */
const LENGTH_WIDTHS = [1, 2, 4, 8];

/** The widths in bytes of the index of the sized references 0xC1 to 0xC4. */
const REF_WIDTHS = [1, 2, 3, 4];

/** The deepest a value may sit in nested arrays and dictionaries; devices reject anything deeper. */
const MAX_DEPTH = 32;

/** Dates travel as seconds since 2001-01-01 UTC; this is that moment in milliseconds since 1970. */
const DATE_EPOCH_MS = 978307200000;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/**
 * A number that OPack encodes as FLOAT64. A plain number with an integer value
 * would encode as an OPack integer.
 */
class Float {
    get value(): number {
        return this.#value;
    }

    readonly #value: number;

    constructor(value: number) {
        this.#value = value;
    }
}

/**
 * A number that OPack encodes as an integer in the smallest width that holds it.
 */
class Integer {
    get value(): number | bigint {
        return this.#value;
    }

    readonly #value: number | bigint;

    constructor(value: number | bigint) {
        this.#value = value;
    }
}

/**
 * A signed integer with a fixed width on the wire. The decoder returns one for every sized
 * integer, so encoding it again writes the same width.
 */
class SizedInteger {
    /** The width of the integer on the wire in bytes: 1, 2, 4, 8 or 16. */
    get size(): number {
        return this.#size;
    }

    /** The value; a bigint when it lies outside the safe integer range of a number. */
    get value(): number | bigint {
        return this.#value;
    }

    readonly #size: number;
    readonly #value: number | bigint;

    constructor(value: number | bigint, size: number) {
        this.#size = size;
        this.#value = value;
    }

    /**
     * Returns the value, so the integer works in arithmetic and comparisons.
     */
    valueOf(): number | bigint {
        return this.#value;
    }
}

/**
 * Wraps a number so OPack encodes it as FLOAT64, also when it is a whole number.
 */
export function float(value: number): Float {
    return new Float(value);
}

/**
 * Wraps an integer so OPack encodes it as an integer in the smallest width that holds it.
 *
 * @throws RangeError if the value is not an integer.
 */
export function int(value: number | bigint): Integer {
    if (typeof value === 'number' && !Number.isInteger(value)) {
        throw new RangeError(`OPack integer ${value} is not an integer`);
    }

    return new Integer(value);
}

/**
 * Wraps an integer so OPack encodes it with a fixed width.
 *
 * @param size - The width in bytes: 1, 2, 4, 8 or 16. The value must fit as a signed integer.
 * @throws RangeError if the width is not one of these or the value does not fit in it.
 */
export function sizedInteger(value: number | bigint, size: number): SizedInteger {
    if (!INT_WIDTHS.includes(size)) {
        throw new RangeError(`OPack integer width ${size} is not 1, 2, 4, 8 or 16`);
    }

    if (typeof value === 'number' && !Number.isInteger(value)) {
        throw new RangeError(`OPack integer ${value} is not an integer`);
    }

    if (!fitsSigned(BigInt(value), size)) {
        throw new RangeError(`OPack integer ${value} does not fit in ${size} bytes`);
    }

    return new SizedInteger(value, size);
}

/**
 * Decodes OPack bytes into a value. Inline integers come back as numbers, sized integers as
 * {@link sizedInteger} values, dates as `Date`, UUIDs and byte strings as `Uint8Array`.
 *
 * @throws TypeError if the buffer ends early, nests deeper than 32 containers, refers to a
 * value that does not exist or holds a tag OPack does not define.
 */
export function decode(data: Uint8Array): any {
    const result = _unpackAt(data, 0, [], 0);

    return result.value;
}

/**
 * Encodes a value as OPack. It takes null, booleans, numbers, bigints, strings, bytes, dates,
 * arrays, plain objects and the wrappers {@link float}, {@link int} and {@link sizedInteger}.
 * A repeated string, byte string of two bytes or more, number outside -1 to 39 or date becomes
 * a reference to its first occurrence; arrays and objects are always written in full.
 *
 * @throws TypeError if the value has an unsupported type or nests deeper than 32 containers.
 * @throws RangeError if an integer does not fit in 128 bits or a date is invalid.
 */
export function encode(data: any): Uint8Array {
    return _pack(data, {values: [], index: new Map()}, 0);
}

/**
 * Joins byte arrays into one.
 */
function concat(arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((sum, array) => sum + array.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;

    for (const array of arrays) {
        out.set(array, offset);
        offset += array.length;
    }

    return out;
}

/**
 * Returns a byte array that holds one byte.
 */
function u8(byte: number): Uint8Array {
    return Uint8Array.of(byte);
}

/**
 * Writes an integer as `byteLen` little-endian bytes, in two's complement when negative.
 */
function intToLEBytes(value: number | bigint, byteLen: number): Uint8Array {
    const out = new Uint8Array(byteLen);
    let remaining = BigInt(value);

    for (let i = 0; i < byteLen; i++) {
        out[i] = Number(remaining & 0xFFn);
        remaining >>= 8n;
    }

    return out;
}

/**
 * Whether a value fits in `size` bytes as a signed integer.
 */
function fitsSigned(value: bigint, size: number): boolean {
    const limit = 1n << BigInt(size * 8 - 1);

    return value >= -limit && value < limit;
}

/**
 * Whether an integer has an inline tag (-1 to 39). Such integers never join the object list,
 * also when they are written in a fixed width.
 */
function isInlineInteger(value: number | bigint): boolean {
    return value >= -1 && value <= 39;
}

/**
 * Returns an integer as a number when that is exact, otherwise as a bigint.
 */
function toInteger(value: bigint): number | bigint {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
}

/**
 * Checks that `length` bytes from `offset` lie within the buffer.
 *
 * @throws TypeError if they run past the end.
 */
function ensureAvailable(data: Uint8Array, offset: number, length: number): void {
    if (length < 0 || offset + length > data.length) {
        throw new TypeError('Truncated OPack value');
    }
}

/**
 * Whether the byte at `offset` ends a container or chunked byte string.
 *
 * @throws TypeError if the buffer ends before it.
 */
function isTerminator(data: Uint8Array, offset: number): boolean {
    ensureAvailable(data, offset, 1);

    return data[offset] === TAG.TERMINATOR;
}

/**
 * Reads a little-endian unsigned length or index of `width` bytes.
 *
 * @throws TypeError if it runs past the end of the buffer or exceeds the safe integer range.
 */
function readUnsigned(data: Uint8Array, offset: number, width: number): number {
    ensureAvailable(data, offset, width);

    let value = 0n;

    for (let i = width - 1; i >= 0; i--) {
        value = (value << 8n) | BigInt(data[offset + i]);
    }

    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new TypeError('OPack length out of range');
    }

    return Number(value);
}

/**
 * Reads a little-endian signed integer of `width` bytes.
 */
function readSigned(data: Uint8Array, offset: number, width: number): bigint {
    ensureAvailable(data, offset, width);

    let value = 0n;

    for (let i = width - 1; i >= 0; i--) {
        value = (value << 8n) | BigInt(data[offset + i]);
    }

    return BigInt.asIntN(width * 8, value);
}

/**
 * Packs an integer in the smallest width that holds it.
 *
 * @throws RangeError if it does not fit in 128 bits.
 */
function packInteger(value: bigint): Uint8Array {
    if (isInlineInteger(value)) {
        return u8(TAG.INT_BASE + Number(value));
    }

    const size = INT_WIDTHS.find(width => fitsSigned(value, width));

    if (size === undefined) {
        throw new RangeError(`OPack integer ${value} does not fit in 128 bits`);
    }

    return packSizedInteger(value, size);
}

/**
 * Packs an integer in a fixed width.
 */
function packSizedInteger(value: number | bigint, size: number): Uint8Array {
    return concat([u8(TAG.INT_SIZED + INT_WIDTHS.indexOf(size)), intToLEBytes(value, size)]);
}

/**
 * Packs a string or byte string: inline up to 32 bytes, otherwise with a length of 1, 2, 4 or
 * 8 bytes after the first sized tag.
 */
function packWithLength(inlineBase: number, sizedBase: number, payload: Uint8Array): Uint8Array {
    const length = payload.length;

    if (length <= 0x20) {
        return concat([u8(inlineBase + length), payload]);
    }

    const widthIndex = length <= 0xFF ? 0 : length <= 0xFFFF ? 1 : length <= 0xFFFFFFFF ? 2 : 3;
    const width = LENGTH_WIDTHS[widthIndex];

    return concat([u8(sizedBase + widthIndex), intToLEBytes(length, width), payload]);
}

/**
 * Packs a reference to the value at `index` in the object list.
 *
 * @throws RangeError if the index does not fit in 4 bytes.
 */
function packReference(index: number): Uint8Array {
    if (index <= TAG.REF_MAX_INLINE - TAG.REF_BASE) {
        return u8(TAG.REF_BASE + index);
    }

    const widthIndex = REF_WIDTHS.findIndex(width => index < 2 ** (width * 8));

    if (widthIndex < 0) {
        throw new RangeError(`OPack reference index ${index} does not fit in 4 bytes`);
    }

    return concat([u8(TAG.REF_SIZED + widthIndex), intToLEBytes(index, REF_WIDTHS[widthIndex])]);
}

/**
 * Packs the items of an array or the keys and values of a dictionary behind their tag. Up to
 * 14 entries the tag holds the count, from 15 a terminator ends the list.
 */
function packContainer(base: number, variable: number, count: number, parts: Uint8Array[]): Uint8Array {
    if (count < 0x0F) {
        return concat([u8(base + count), ...parts]);
    }

    return concat([u8(variable), ...parts, u8(TAG.TERMINATOR)]);
}

/**
 * Packs a value and its children, without looking at the object list for the value itself.
 *
 * @throws TypeError if the value has an unsupported type or nests too deep.
 * @throws RangeError if an integer does not fit in 128 bits or a date is invalid.
 */
function _packValue(data: any, objectList: ObjectList, depth: number): PackResult {
    if (data === null || data === undefined) {
        return {packed: u8(TAG.NULL), shareable: false};
    }

    if (typeof data === 'boolean') {
        return {packed: u8(data ? TAG.TRUE : TAG.FALSE), shareable: false};
    }

    if (data instanceof Float || (typeof data === 'number' && !Number.isInteger(data))) {
        const packed = new Uint8Array(9);
        packed[0] = TAG.FLOAT64;
        new DataView(packed.buffer).setFloat64(1, data instanceof Float ? data.value : data, true);

        return {packed, shareable: true};
    }

    if (typeof data === 'number') {
        const value = BigInt(data);

        // A negative number keeps the 8-byte form devices have always received from us; they read it signed.
        const packed = value < 0n && fitsSigned(value, 8) ? packSizedInteger(value, 8) : packInteger(value);

        return {packed, shareable: !isInlineInteger(value)};
    }

    if (typeof data === 'bigint' || data instanceof Integer) {
        const value = BigInt(data instanceof Integer ? data.value : data);

        return {packed: packInteger(value), shareable: !isInlineInteger(value)};
    }

    if (data instanceof SizedInteger) {
        return {packed: packSizedInteger(data.value, data.size), shareable: !isInlineInteger(data.value)};
    }

    if (typeof data === 'string') {
        const packed = packWithLength(TAG.STR_BASE, TAG.STR_SIZED, textEncoder.encode(data));

        return {packed, shareable: packed.length > 1};
    }

    if (data instanceof Uint8Array) {
        return {packed: packWithLength(TAG.BYTES_BASE, TAG.BYTES_SIZED, data), shareable: data.length >= 2};
    }

    if (data instanceof Date) {
        const time = data.getTime();

        if (Number.isNaN(time)) {
            throw new RangeError('OPack cannot encode an invalid date');
        }

        const packed = new Uint8Array(9);
        packed[0] = TAG.DATE;
        new DataView(packed.buffer).setFloat64(1, (time - DATE_EPOCH_MS) / 1000, true);

        return {packed, shareable: true};
    }

    if (Array.isArray(data)) {
        const parts = data.map(item => _pack(item, objectList, depth + 1));

        return {packed: packContainer(TAG.ARRAY_BASE, TAG.ARRAY_VARIABLE, data.length, parts), shareable: false};
    }

    if (typeof data === 'object') {
        const keys = Object.keys(data);
        const parts: Uint8Array[] = [];

        for (const key of keys) {
            parts.push(_pack(key, objectList, depth + 1), _pack(data[key], objectList, depth + 1));
        }

        return {packed: packContainer(TAG.DICT_BASE, TAG.DICT_VARIABLE, keys.length, parts), shareable: false};
    }

    throw new TypeError(`OPack cannot encode a value of type ${typeof data}`);
}

/**
 * Packs a value and its children. A shareable value already in the object list becomes a
 * reference to it; the first occurrence joins the list.
 *
 * @throws TypeError if the value has an unsupported type or nests too deep.
 * @throws RangeError if an integer does not fit in 128 bits or a date is invalid.
 */
function _pack(data: any, objectList: ObjectList, depth: number): Uint8Array {
    if (depth > MAX_DEPTH) {
        throw new TypeError(`OPack nesting deeper than ${MAX_DEPTH} containers`);
    }

    const {packed, shareable} = _packValue(data, objectList, depth);

    if (!shareable) {
        return packed;
    }

    let hash = 2166136261;

    for (const byte of packed) {
        hash = Math.imul(hash ^ byte, 16777619);
    }

    const candidates = objectList.index.get(hash);

    const existing = candidates?.find(index => {
        const value = objectList.values[index];

        return value.length === packed.length && value.every((byte, offset) => byte === packed[offset]);
    });

    if (existing !== undefined) {
        return packReference(existing);
    }

    const index = objectList.values.length;
    objectList.values.push(packed);

    if (candidates) {
        candidates.push(index);
    } else {
        objectList.index.set(hash, [index]);
    }

    return packed;
}

/**
 * Unpacks the items of a byte string in chunks (0x9F), which ends at a terminator.
 *
 * @throws TypeError if a chunk is not a byte string or the terminator is missing.
 */
function _unpackChunks(data: Uint8Array, offset: number): UnpackResult {
    const chunks: Uint8Array[] = [];
    let pos = offset;

    while (!isTerminator(data, pos)) {
        const tag = data[pos];
        let length: number;
        let start: number;

        if (tag >= TAG.BYTES_BASE && tag <= TAG.BYTES_MAX_INLINE) {
            length = tag - TAG.BYTES_BASE;
            start = pos + 1;
        } else if (tag >= TAG.BYTES_SIZED && tag <= TAG.BYTES_SIZED_MAX) {
            const width = LENGTH_WIDTHS[tag - TAG.BYTES_SIZED];
            length = readUnsigned(data, pos + 1, width);
            start = pos + 1 + width;
        } else {
            throw new TypeError(`Invalid OPack data chunk 0x${tag.toString(16)}`);
        }

        ensureAvailable(data, start, length);
        chunks.push(data.subarray(start, start + length));
        pos = start + length;
    }

    return {value: concat(chunks), offset: pos + 1};
}

/**
 * Unpacks the OPack value at `offset`. Strings, byte strings of two bytes or more, numbers
 * outside -1 to 39, dates and UUIDs join the object list in the order they appear, so later
 * references can point to them. Arrays, dictionaries and references never join it.
 *
 * @throws TypeError if the buffer ends early, nests too deep, refers to a value that does not
 * exist or holds a tag OPack does not define.
 */
function _unpackAt(data: Uint8Array, offset: number, objectList: any[], depth: number): UnpackResult {
    if (depth > MAX_DEPTH) {
        throw new TypeError(`OPack nesting deeper than ${MAX_DEPTH} containers`);
    }

    ensureAvailable(data, offset, 1);

    const tag = data[offset];
    let shareable = false;
    let value: any;
    let newOffset: number;

    if (tag === TAG.TRUE) {
        value = true;
        newOffset = offset + 1;
    } else if (tag === TAG.FALSE) {
        value = false;
        newOffset = offset + 1;
    } else if (tag === TAG.NULL) {
        value = null;
        newOffset = offset + 1;
    } else if (tag === TAG.UUID) {
        ensureAvailable(data, offset + 1, 16);
        value = data.subarray(offset + 1, offset + 17);
        newOffset = offset + 17;
        shareable = true;
    } else if (tag === TAG.DATE) {
        ensureAvailable(data, offset + 1, 8);
        const seconds = new DataView(data.buffer, data.byteOffset + offset + 1, 8).getFloat64(0, true);
        value = new Date(DATE_EPOCH_MS + seconds * 1000);
        newOffset = offset + 9;
        shareable = true;
    } else if (tag >= TAG.INT_INLINE_MIN && tag <= TAG.INT_INLINE_MAX) {
        value = tag - TAG.INT_BASE;
        newOffset = offset + 1;
    } else if (tag >= TAG.INT_SIZED && tag <= TAG.INT_SIZED_MAX) {
        const size = INT_WIDTHS[tag - TAG.INT_SIZED];
        const integer = readSigned(data, offset + 1, size);
        value = sizedInteger(toInteger(integer), size);
        newOffset = offset + 1 + size;
        shareable = !isInlineInteger(integer);
    } else if (tag === TAG.FLOAT32) {
        ensureAvailable(data, offset + 1, 4);
        value = new DataView(data.buffer, data.byteOffset + offset + 1, 4).getFloat32(0, true);
        newOffset = offset + 5;
        shareable = true;
    } else if (tag === TAG.FLOAT64) {
        ensureAvailable(data, offset + 1, 8);
        value = new DataView(data.buffer, data.byteOffset + offset + 1, 8).getFloat64(0, true);
        newOffset = offset + 9;
        shareable = true;
    } else if (tag >= TAG.STR_BASE && tag <= TAG.STR_MAX_INLINE) {
        const length = tag - TAG.STR_BASE;
        ensureAvailable(data, offset + 1, length);
        value = textDecoder.decode(data.subarray(offset + 1, offset + 1 + length));
        newOffset = offset + 1 + length;
        shareable = length > 0;
    } else if (tag >= TAG.STR_SIZED && tag <= TAG.STR_SIZED_MAX) {
        const width = LENGTH_WIDTHS[tag - TAG.STR_SIZED];
        const length = readUnsigned(data, offset + 1, width);
        const start = offset + 1 + width;
        ensureAvailable(data, start, length);
        value = textDecoder.decode(data.subarray(start, start + length));
        newOffset = start + length;
        shareable = length > 0;
    } else if (tag === TAG.STR_NUL_TERMINATED) {
        const end = data.indexOf(0, offset + 1);

        if (end < 0) {
            throw new TypeError('Truncated OPack value');
        }

        value = textDecoder.decode(data.subarray(offset + 1, end));
        newOffset = end + 1;
        shareable = end > offset + 1;
    } else if (tag >= TAG.BYTES_BASE && tag <= TAG.BYTES_MAX_INLINE) {
        const length = tag - TAG.BYTES_BASE;
        ensureAvailable(data, offset + 1, length);
        value = data.subarray(offset + 1, offset + 1 + length);
        newOffset = offset + 1 + length;
        shareable = length >= 2;
    } else if (tag >= TAG.BYTES_SIZED && tag <= TAG.BYTES_SIZED_MAX) {
        const width = LENGTH_WIDTHS[tag - TAG.BYTES_SIZED];
        const length = readUnsigned(data, offset + 1, width);
        const start = offset + 1 + width;
        ensureAvailable(data, start, length);
        value = data.subarray(start, start + length);
        newOffset = start + length;
        shareable = length >= 2;
    } else if (tag === TAG.BYTES_CHUNKED) {
        const result = _unpackChunks(data, offset + 1);
        value = result.value;
        newOffset = result.offset;
        shareable = value.length >= 2;
    } else if (tag >= TAG.REF_BASE && tag <= TAG.REF_SIZED_MAX) {
        const inline = tag <= TAG.REF_MAX_INLINE;
        const width = inline ? 0 : REF_WIDTHS[tag - TAG.REF_SIZED];
        const index = inline ? tag - TAG.REF_BASE : readUnsigned(data, offset + 1, width);

        if (index >= objectList.length) {
            throw new TypeError(`OPack reference index ${index} out of range`);
        }

        value = objectList[index];
        newOffset = offset + 1 + width;
    } else if ((tag & 0xF0) === TAG.ARRAY_BASE) {
        const items: any[] = [];
        let pos = offset + 1;

        if (tag === TAG.ARRAY_VARIABLE) {
            while (!isTerminator(data, pos)) {
                const result = _unpackAt(data, pos, objectList, depth + 1);
                items.push(result.value);
                pos = result.offset;
            }

            pos++;
        } else {
            for (let i = 0; i < (tag & 0x0F); i++) {
                const result = _unpackAt(data, pos, objectList, depth + 1);
                items.push(result.value);
                pos = result.offset;
            }
        }

        value = items;
        newOffset = pos;
    } else if ((tag & 0xF0) === TAG.DICT_BASE) {
        const dictionary: Record<string, any> = {};
        let pos = offset + 1;

        const unpackEntry = (): void => {
            const keyResult = _unpackAt(data, pos, objectList, depth + 1);
            const valueResult = _unpackAt(data, keyResult.offset, objectList, depth + 1);
            Object.defineProperty(dictionary, keyResult.value, {value: valueResult.value, enumerable: true, configurable: true, writable: true});
            pos = valueResult.offset;
        };

        if (tag === TAG.DICT_VARIABLE) {
            while (!isTerminator(data, pos)) {
                unpackEntry();
            }

            pos++;
        } else {
            for (let i = 0; i < (tag & 0x0F); i++) {
                unpackEntry();
            }
        }

        value = dictionary;
        newOffset = pos;
    } else {
        throw new TypeError(`Unsupported OPack tag 0x${tag.toString(16)}`);
    }

    if (shareable) {
        objectList.push(value);
    }

    return {value, offset: newOffset};
}
