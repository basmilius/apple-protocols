type Packed = Uint8Array;
type ObjectList = Packed[];

const TAG = {
    TRUE: 0x01,
    FALSE: 0x02,
    TERMINATOR: 0x03,
    NULL: 0x04,
    UUID: 0x05,
    TIMESTAMP: 0x06,
    INT_BASE: 0x08,
    INT_INLINE_MAX_VALUE: 0x27,
    INT_MAX_INLINE: 0x2F,
    INT_1BYTE: 0x30,
    INT_2BYTE: 0x31,
    INT_4BYTE: 0x32,
    INT_8BYTE: 0x33,
    FLOAT32: 0x35,
    FLOAT64: 0x36,
    STR_BASE: 0x40,
    STR_MAX_INLINE: 0x60,
    STR_1BYTE_LEN: 0x61,
    STR_2BYTE_LEN: 0x62,
    STR_3BYTE_LEN: 0x63,
    STR_4BYTE_LEN: 0x64,
    BYTES_BASE: 0x70,
    BYTES_MAX_INLINE: 0x90,
    BYTES_1BYTE_LEN: 0x91,
    BYTES_2BYTE_LEN: 0x92,
    BYTES_4BYTE_LEN: 0x93,
    REF_BASE: 0xA0,
    REF_MAX_INLINE: 0xC0,
    REF_1BYTE: 0xC1,
    REF_2BYTE: 0xC2,
    REF_4BYTE: 0xC3,
    REF_8BYTE: 0xC4,
    ARRAY_BASE: 0xD0,
    ARRAY_VARIABLE: 0xDF,
    DICT_BASE: 0xE0,
    DICT_VARIABLE: 0xEF,
    DICT_TERMINATOR: 0x81
} as const;

class Float {
    get value(): number {
        return this.#value;
    }

    readonly #value: number;

    constructor(value: number) {
        this.#value = value;
    }
}

class Integer {
    get value(): number {
        return this.#value;
    }

    readonly #value: number;

    constructor(value: number) {
        this.#value = value;
    }
}

class SizedInteger {
    get size(): number {
        return this.#size;
    }

    get value(): number {
        return this.#value;
    }

    readonly #size: number;
    readonly #value: number;

    constructor(value: number, size: number) {
        this.#size = size;
        this.#value = value;
    }

    valueOf(): number {
        return this.#value;
    }
}

export function float(value: number): Float {
    return new Float(value);
}

export function int(value: number): Integer {
    return new Integer(value);
}

export function sizedInteger(value: number, size: number): SizedInteger {
    return new SizedInteger(value, size);
}

export function decode(data: Uint8Array): any {
    const [value] = _unpack(data, []);
    return value;
}

export function encode(data: any): Uint8Array {
    return _pack(data, []);
}

function concat(arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;

    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }

    return out;
}

function u8(b: number) {
    return Uint8Array.of(b);
}

function uintToLEBytes(value: number | bigint, byteLen: number): Uint8Array {
    const out = new Uint8Array(byteLen);
    let v = BigInt(value);

    for (let i = 0; i < byteLen; i++) {
        out[i] = Number(v & 0xffn);
        v >>= 8n;
    }

    return out;
}

function ensureAvailable(buf: Uint8Array, need: number) {
    if (buf.length < need) {
        throw new TypeError(`Not enough data: need ${need} bytes, have ${buf.length}`);
    }
}

function readLittleEndian(buf: Uint8Array, offset: number, len: number) {
    ensureAvailable(buf.subarray(offset), len);

    let v = 0n;

    for (let i = len - 1; i >= 0; i--) {
        v = (v << 8n) | BigInt(buf[offset + i]);
    }

    return Number(v);
}

function _pack(data: any, objectList: ObjectList): Uint8Array {
    let packed: Uint8Array | null = null;

    if (data === null || data === undefined) {
        packed = u8(TAG.NULL);
    } else if (typeof data === 'boolean') {
        packed = u8(data ? TAG.TRUE : TAG.FALSE);
    } else if (data instanceof Float) {
        const buf = new ArrayBuffer(8);
        new DataView(buf).setFloat64(0, data.value, true);

        packed = concat([u8(TAG.FLOAT64), new Uint8Array(buf)]);
    } else if (data instanceof Integer) {
        const val = data.value;

        if (val <= TAG.INT_INLINE_MAX_VALUE) {
            packed = u8(TAG.INT_BASE + val);
        } else if (val <= 0xFF) {
            packed = concat([u8(TAG.INT_1BYTE), uintToLEBytes(val, 1)]);
        } else if (val <= 0xFFFF) {
            packed = concat([u8(TAG.INT_2BYTE), uintToLEBytes(val, 2)]);
        } else if (val <= 0xFFFFFFFF) {
            packed = concat([u8(TAG.INT_4BYTE), uintToLEBytes(val, 4)]);
        } else {
            packed = concat([u8(TAG.INT_8BYTE), uintToLEBytes(val, 8)]);
        }
    } else if (typeof data === 'number') {
        if (!Number.isInteger(data)) {
            const buf = new ArrayBuffer(8);
            new DataView(buf).setFloat64(0, data, true);

            packed = concat([u8(TAG.FLOAT64), new Uint8Array(buf)]);
        } else {
            if (data <= TAG.INT_INLINE_MAX_VALUE) {
                packed = u8(TAG.INT_BASE + data);
            } else if (data <= 0xFF) {
                packed = concat([u8(TAG.INT_1BYTE), uintToLEBytes(data, 1)]);
            } else if (data <= 0xFFFF) {
                packed = concat([u8(TAG.INT_2BYTE), uintToLEBytes(data, 2)]);
            } else if (data <= 0xFFFFFFFF) {
                packed = concat([u8(TAG.INT_4BYTE), uintToLEBytes(data, 4)]);
            } else {
                packed = concat([u8(TAG.INT_8BYTE), uintToLEBytes(data, 8)]);
            }
        }
    } else if (data instanceof SizedInteger) {
        packed = concat([u8(TAG.INT_1BYTE + Math.log2(data.size)), uintToLEBytes(data.valueOf(), data.size)]);
    } else if (typeof data === 'string') {
        const b = new TextEncoder().encode(data);
        const len = b.length;

        if (len <= 0x20) {
            packed = concat([u8(TAG.STR_BASE + len), b]);
        } else if (len <= 0xFF) {
            packed = concat([u8(TAG.STR_1BYTE_LEN), uintToLEBytes(len, 1), b]);
        } else if (len <= 0xFFFF) {
            packed = concat([u8(TAG.STR_2BYTE_LEN), uintToLEBytes(len, 2), b]);
        } else if (len <= 0xFFFFFF) {
            packed = concat([u8(TAG.STR_3BYTE_LEN), uintToLEBytes(len, 3), b]);
        } else {
            packed = concat([u8(TAG.STR_4BYTE_LEN), uintToLEBytes(len, 4), b]);
        }
    } else if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const len = bytes.length;

        if (len <= 0x20) {
            packed = concat([u8(TAG.BYTES_BASE + len), bytes]);
        } else if (len <= 0xFF) {
            packed = concat([u8(TAG.BYTES_1BYTE_LEN), uintToLEBytes(len, 1), bytes]);
        } else if (len <= 0xFFFF) {
            packed = concat([u8(TAG.BYTES_2BYTE_LEN), uintToLEBytes(len, 2), bytes]);
        } else {
            packed = concat([u8(TAG.BYTES_4BYTE_LEN), uintToLEBytes(len, 4), bytes]);
        }
    } else if (Array.isArray(data)) {
        const body = concat(data.map(d => _pack(d, objectList)));
        const len = data.length;

        if (len <= 0x0F) {
            packed = concat([u8(TAG.ARRAY_BASE + len), body]);

            if (len >= 0x0F) {
                packed = concat([packed, u8(TAG.TERMINATOR)]);
            }
        } else {
            packed = concat([u8(TAG.ARRAY_VARIABLE), body, u8(TAG.TERMINATOR)]);
        }
    } else if (typeof data === 'object') {
        const keys = Object.keys(data);
        const len = keys.length;
        const pairs: Uint8Array[] = [];

        for (const k of keys) {
            pairs.push(_pack(k, objectList));
            pairs.push(_pack((data as any)[k], objectList));
        }

        let header: Uint8Array;

        if (len <= 0x0F) {
            header = u8(TAG.DICT_BASE + len);
        } else {
            header = u8(TAG.DICT_VARIABLE);
        }

        packed = concat([header, concat(pairs)]);

        if (len >= 0x0F || objectList.some(v => v === packed)) {
            packed = concat([packed, u8(TAG.DICT_TERMINATOR)]);
        }
    } else {
        throw new TypeError(typeof data + '');
    }

    const idx = objectList.findIndex(v => v.length === packed!.length && v.every((x, i) => x === packed![i]));

    if (idx >= 0) {
        if (idx < 0x21) {
            packed = u8(TAG.REF_BASE + idx);
        } else if (idx <= 0xFF) {
            packed = concat([u8(TAG.REF_1BYTE), uintToLEBytes(idx, 1)]);
        } else if (idx <= 0xFFFF) {
            packed = concat([u8(TAG.REF_2BYTE), uintToLEBytes(idx, 2)]);
        } else if (idx <= 0xFFFFFFFF) {
            packed = concat([u8(TAG.REF_4BYTE), uintToLEBytes(idx, 4)]);
        } else {
            packed = concat([u8(TAG.REF_8BYTE), uintToLEBytes(idx, 8)]);
        }
    } else if (packed!.length > 1) {
        objectList.push(packed!);
    }

    return packed!;
}

function _unpack(data: Uint8Array, objectList: any[]): [any, Uint8Array] {
    if (data.length === 0) throw new TypeError('No data to unpack');
    const tag = data[0];
    let addToObjectList = true;
    let value: any;
    let rest: Uint8Array;

    // simple tokens
    if (tag === TAG.TRUE) {
        value = true;
        rest = data.subarray(1);
    } else if (tag === TAG.FALSE) {
        value = false;
        rest = data.subarray(1);
    } else if (tag === TAG.NULL) {
        value = null;
        rest = data.subarray(1);
    } else if (tag === TAG.UUID) {
        value = data.subarray(1, 17);
        rest = data.subarray(17);
    } else if (tag === TAG.TIMESTAMP) {
        value = readLittleEndian(data, 1, 8);
        rest = data.subarray(9);
    } else if (tag >= TAG.INT_BASE && tag <= TAG.INT_MAX_INLINE) {
        value = tag - TAG.INT_BASE;
        rest = data.subarray(1);
    } else if (tag === TAG.FLOAT32) {
        const view = new DataView(data.buffer, data.byteOffset + 1, 4);

        value = view.getFloat32(0, true);
        rest = data.subarray(5);
    } else if (tag === TAG.FLOAT64) {
        const view = new DataView(data.buffer, data.byteOffset + 1, 8);

        value = view.getFloat64(0, true);
        rest = data.subarray(9);
    } else if ((tag & 0xF0) === TAG.INT_1BYTE) {
        const noOfBytes = 2 ** (tag & 0xF);
        const val = readLittleEndian(data, 1, noOfBytes);

        value = sizedInteger(val, noOfBytes);
        rest = data.subarray(1 + noOfBytes);
    } else if (tag >= TAG.STR_BASE && tag <= TAG.STR_MAX_INLINE) {
        const length = tag - TAG.STR_BASE;
        value = new TextDecoder().decode(data.subarray(1, 1 + length));
        rest = data.subarray(1 + length);
    } else if (tag >= TAG.STR_1BYTE_LEN && tag <= TAG.STR_4BYTE_LEN) {
        const lenBytes = tag & 0xF;
        const length = readLittleEndian(data, 1, lenBytes);

        value = new TextDecoder().decode(data.subarray(1 + lenBytes, 1 + lenBytes + length));
        rest = data.subarray(1 + lenBytes + length);
    } else if (tag >= TAG.BYTES_BASE && tag <= TAG.BYTES_MAX_INLINE) {
        const length = tag - TAG.BYTES_BASE;

        value = data.subarray(1, 1 + length);
        rest = data.subarray(1 + length);
    } else if (tag >= TAG.BYTES_1BYTE_LEN && tag <= TAG.BYTES_4BYTE_LEN) {
        const noOfBytes = 1 << ((tag & 0xF) - 1);
        const length = readLittleEndian(data, 1, noOfBytes);
        const start = 1 + noOfBytes;

        value = data.subarray(start, start + length);
        rest = data.subarray(start + length);
    } else if ((tag & 0xF0) === TAG.ARRAY_BASE) {
        const count = tag & 0xF;
        let ptr = data.subarray(1);
        const arr: any[] = [];

        if (count === 0xF) {
            while (ptr[0] !== TAG.TERMINATOR) {
                const [v, r] = _unpack(ptr, objectList);
                arr.push(v);
                ptr = r;
            }

            ptr = ptr.subarray(1);
        } else {
            for (let i = 0; i < count; i++) {
                const [v, r] = _unpack(ptr, objectList);
                arr.push(v);
                ptr = r;
            }
        }

        value = arr;
        rest = ptr;
        addToObjectList = false;
    } else if ((tag & 0xF0) === TAG.DICT_BASE) {
        const count = tag & 0xF;
        const obj: Record<string, any> = {};
        let ptr = data.subarray(1);

        if (count === 0xF) {
            while (ptr[0] !== TAG.TERMINATOR) {
                const [k, r1] = _unpack(ptr, objectList);
                const [v, r2] = _unpack(r1, objectList);
                obj[k] = v;
                ptr = r2;
            }

            ptr = ptr.subarray(1);
        } else {
            for (let i = 0; i < count; i++) {
                const [k, r1] = _unpack(ptr, objectList);
                const [v, r2] = _unpack(r1, objectList);
                obj[k] = v;
                ptr = r2;
            }
        }
        value = obj;
        rest = ptr;
        addToObjectList = false;
    } else if (tag >= TAG.REF_BASE && tag <= TAG.REF_MAX_INLINE) {
        const idx = tag - TAG.REF_BASE;

        if (idx >= objectList.length) {
            throw new TypeError(`Reference index ${idx} out of range`);
        }

        value = objectList[idx];
        rest = data.subarray(1);
        addToObjectList = false;
    } else if (tag >= TAG.REF_1BYTE && tag <= TAG.REF_8BYTE) {
        const len = tag - TAG.REF_MAX_INLINE;
        const uid = readLittleEndian(data, 1, len);

        if (uid >= objectList.length) {
            throw new TypeError(`UID ${uid} out of range`);
        }

        value = objectList[uid];
        rest = data.subarray(1 + len);
        addToObjectList = false;
    } else {
        throw new TypeError(`Unknown tag 0x${tag.toString(16)}`);
    }

    if (addToObjectList) {
        objectList.push(value);
    }

    return [value, rest];
}
