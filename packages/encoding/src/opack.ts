type Packed = Uint8Array;
type ObjectList = Packed[];

type UnpackResult = {
    readonly value: any;
    readonly offset: number;
};

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

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

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
    const result = _unpackAt(data, 0, []);
    return result.value;
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

function readLittleEndian(buf: Uint8Array, offset: number, len: number) {
    if (len === 1) {
        return buf[offset];
    } else if (len === 2) {
        return buf[offset] | (buf[offset + 1] << 8);
    } else if (len === 4) {
        return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | ((buf[offset + 3] << 24) >>> 0);
    } else {
        let v = 0n;
        for (let i = len - 1; i >= 0; i--) {
            v = (v << 8n) | BigInt(buf[offset + i]);
        }
        return Number(v);
    }
}

function _pack(data: any, objectList: ObjectList): Uint8Array {
    let packed: Uint8Array | null = null;

    if (data === null || data === undefined) {
        packed = u8(TAG.NULL);
    } else if (typeof data === 'boolean') {
        packed = u8(data ? TAG.TRUE : TAG.FALSE);
    } else if (data instanceof Float) {
        packed = new Uint8Array(9);
        packed[0] = TAG.FLOAT64;
        new DataView(packed.buffer, packed.byteOffset + 1, 8).setFloat64(0, data.value, true);
    } else if (data instanceof Integer) {
        const val = data.value;

        if (val <= TAG.INT_INLINE_MAX_VALUE) {
            packed = u8(TAG.INT_BASE + val);
        } else if (val <= 0xFF) {
            packed = new Uint8Array(2);
            packed[0] = TAG.INT_1BYTE;
            packed[1] = val;
        } else if (val <= 0xFFFF) {
            packed = new Uint8Array(3);
            packed[0] = TAG.INT_2BYTE;
            packed[1] = val & 0xFF;
            packed[2] = (val >> 8) & 0xFF;
        } else if (val <= 0xFFFFFFFF) {
            packed = new Uint8Array(5);
            packed[0] = TAG.INT_4BYTE;
            packed[1] = val & 0xFF;
            packed[2] = (val >> 8) & 0xFF;
            packed[3] = (val >> 16) & 0xFF;
            packed[4] = (val >> 24) & 0xFF;
        } else {
            packed = new Uint8Array(9);
            packed[0] = TAG.INT_8BYTE;
            packed.set(uintToLEBytes(val, 8), 1);
        }
    } else if (typeof data === 'number') {
        if (!Number.isInteger(data)) {
            packed = new Uint8Array(9);
            packed[0] = TAG.FLOAT64;
            new DataView(packed.buffer, packed.byteOffset + 1, 8).setFloat64(0, data, true);
        } else {
            if (data <= TAG.INT_INLINE_MAX_VALUE) {
                packed = u8(TAG.INT_BASE + data);
            } else if (data <= 0xFF) {
                packed = new Uint8Array(2);
                packed[0] = TAG.INT_1BYTE;
                packed[1] = data;
            } else if (data <= 0xFFFF) {
                packed = new Uint8Array(3);
                packed[0] = TAG.INT_2BYTE;
                packed[1] = data & 0xFF;
                packed[2] = (data >> 8) & 0xFF;
            } else if (data <= 0xFFFFFFFF) {
                packed = new Uint8Array(5);
                packed[0] = TAG.INT_4BYTE;
                packed[1] = data & 0xFF;
                packed[2] = (data >> 8) & 0xFF;
                packed[3] = (data >> 16) & 0xFF;
                packed[4] = (data >> 24) & 0xFF;
            } else {
                packed = new Uint8Array(9);
                packed[0] = TAG.INT_8BYTE;
                packed.set(uintToLEBytes(data, 8), 1);
            }
        }
    } else if (data instanceof SizedInteger) {
        const byteSize = data.size;
        packed = new Uint8Array(byteSize + 1);
        packed[0] = TAG.INT_1BYTE + (31 - Math.clz32(byteSize));

        if (byteSize === 1) {
            packed[1] = data.valueOf();
        } else if (byteSize === 2) {
            const val = data.valueOf();
            packed[1] = val & 0xFF;
            packed[2] = (val >> 8) & 0xFF;
        } else if (byteSize === 4) {
            const val = data.valueOf();
            packed[1] = val & 0xFF;
            packed[2] = (val >> 8) & 0xFF;
            packed[3] = (val >> 16) & 0xFF;
            packed[4] = (val >> 24) & 0xFF;
        } else {
            packed.set(uintToLEBytes(data.valueOf(), 8), 1);
        }
    } else if (typeof data === 'string') {
        const b = textEncoder.encode(data);
        const len = b.length;

        if (len <= 0x20) {
            packed = new Uint8Array(1 + len);
            packed[0] = TAG.STR_BASE + len;
            packed.set(b, 1);
        } else if (len <= 0xFF) {
            packed = new Uint8Array(2 + len);
            packed[0] = TAG.STR_1BYTE_LEN;
            packed[1] = len;
            packed.set(b, 2);
        } else if (len <= 0xFFFF) {
            packed = new Uint8Array(3 + len);
            packed[0] = TAG.STR_2BYTE_LEN;
            packed[1] = len & 0xFF;
            packed[2] = (len >> 8) & 0xFF;
            packed.set(b, 3);
        } else if (len <= 0xFFFFFF) {
            packed = new Uint8Array(4 + len);
            packed[0] = TAG.STR_3BYTE_LEN;
            packed[1] = len & 0xFF;
            packed[2] = (len >> 8) & 0xFF;
            packed[3] = (len >> 16) & 0xFF;
            packed.set(b, 4);
        } else {
            packed = new Uint8Array(5 + len);
            packed[0] = TAG.STR_4BYTE_LEN;
            packed[1] = len & 0xFF;
            packed[2] = (len >> 8) & 0xFF;
            packed[3] = (len >> 16) & 0xFF;
            packed[4] = (len >> 24) & 0xFF;
            packed.set(b, 5);
        }
    } else if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const len = bytes.length;

        if (len <= 0x20) {
            packed = new Uint8Array(1 + len);
            packed[0] = TAG.BYTES_BASE + len;
            packed.set(bytes, 1);
        } else if (len <= 0xFF) {
            packed = new Uint8Array(2 + len);
            packed[0] = TAG.BYTES_1BYTE_LEN;
            packed[1] = len;
            packed.set(bytes, 2);
        } else if (len <= 0xFFFF) {
            packed = new Uint8Array(3 + len);
            packed[0] = TAG.BYTES_2BYTE_LEN;
            packed[1] = len & 0xFF;
            packed[2] = (len >> 8) & 0xFF;
            packed.set(bytes, 3);
        } else {
            packed = new Uint8Array(5 + len);
            packed[0] = TAG.BYTES_4BYTE_LEN;
            packed[1] = len & 0xFF;
            packed[2] = (len >> 8) & 0xFF;
            packed[3] = (len >> 16) & 0xFF;
            packed[4] = (len >> 24) & 0xFF;
            packed.set(bytes, 5);
        }
    } else if (Array.isArray(data)) {
        const parts = data.map(d => _pack(d, objectList));
        const bodyLen = parts.reduce((sum, p) => sum + p.length, 0);
        const len = data.length;

        if (len < 0x0F) {
            packed = new Uint8Array(1 + bodyLen);
            packed[0] = TAG.ARRAY_BASE + len;
            let pos = 1;
            for (const part of parts) {
                packed.set(part, pos);
                pos += part.length;
            }
        } else {
            packed = new Uint8Array(2 + bodyLen);
            packed[0] = TAG.ARRAY_VARIABLE;
            let pos = 1;
            for (const part of parts) {
                packed.set(part, pos);
                pos += part.length;
            }
            packed[pos] = TAG.TERMINATOR;
        }
    } else if (typeof data === 'object') {
        const keys = Object.keys(data);
        const len = keys.length;
        const parts: Uint8Array[] = [];
        let bodyLen = 0;

        for (const k of keys) {
            const keyPacked = _pack(k, objectList);
            const valPacked = _pack((data as any)[k], objectList);
            parts.push(keyPacked, valPacked);
            bodyLen += keyPacked.length + valPacked.length;
        }

        const needsTerminator = len >= 0x0F;
        packed = new Uint8Array(1 + bodyLen + (needsTerminator ? 1 : 0));
        packed[0] = len <= 0x0F ? TAG.DICT_BASE + len : TAG.DICT_VARIABLE;

        let pos = 1;
        for (const part of parts) {
            packed.set(part, pos);
            pos += part.length;
        }

        if (needsTerminator) {
            packed[pos] = TAG.DICT_TERMINATOR;
        }
    } else {
        throw new TypeError(typeof data + '');
    }

    const idx = objectList.findIndex(v => v.length === packed!.length && v.every((x, i) => x === packed![i]));

    if (idx >= 0) {
        if (idx < 0x21) {
            packed = u8(TAG.REF_BASE + idx);
        } else if (idx <= 0xFF) {
            packed = new Uint8Array(2);
            packed[0] = TAG.REF_1BYTE;
            packed[1] = idx;
        } else if (idx <= 0xFFFF) {
            packed = new Uint8Array(3);
            packed[0] = TAG.REF_2BYTE;
            packed[1] = idx & 0xFF;
            packed[2] = (idx >> 8) & 0xFF;
        } else if (idx <= 0xFFFFFFFF) {
            packed = new Uint8Array(5);
            packed[0] = TAG.REF_4BYTE;
            packed[1] = idx & 0xFF;
            packed[2] = (idx >> 8) & 0xFF;
            packed[3] = (idx >> 16) & 0xFF;
            packed[4] = (idx >> 24) & 0xFF;
        } else {
            packed = new Uint8Array(9);
            packed[0] = TAG.REF_8BYTE;
            packed.set(uintToLEBytes(idx, 8), 1);
        }
    } else if (packed!.length > 1) {
        objectList.push(packed!);
    }

    return packed!;
}

function _unpackAt(data: Uint8Array, offset: number, objectList: any[]): UnpackResult {
    if (offset >= data.length) throw new TypeError('No data to unpack');

    const tag = data[offset];
    let addToObjectList = true;
    let value: any;
    let newOffset: number;

    // simple tokens
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
        value = data.subarray(offset + 1, offset + 17);
        newOffset = offset + 17;
    } else if (tag === TAG.TIMESTAMP) {
        value = readLittleEndian(data, offset + 1, 8);
        newOffset = offset + 9;
    } else if (tag >= TAG.INT_BASE && tag <= TAG.INT_MAX_INLINE) {
        value = tag - TAG.INT_BASE;
        newOffset = offset + 1;
    } else if (tag === TAG.FLOAT32) {
        const view = new DataView(data.buffer, data.byteOffset + offset + 1, 4);
        value = view.getFloat32(0, true);
        newOffset = offset + 5;
    } else if (tag === TAG.FLOAT64) {
        const view = new DataView(data.buffer, data.byteOffset + offset + 1, 8);
        value = view.getFloat64(0, true);
        newOffset = offset + 9;
    } else if ((tag & 0xF0) === TAG.INT_1BYTE) {
        const noOfBytes = 1 << (tag & 0xF);
        const val = readLittleEndian(data, offset + 1, noOfBytes);
        value = sizedInteger(val, noOfBytes);
        newOffset = offset + 1 + noOfBytes;
    } else if (tag >= TAG.STR_BASE && tag <= TAG.STR_MAX_INLINE) {
        const length = tag - TAG.STR_BASE;
        value = textDecoder.decode(data.subarray(offset + 1, offset + 1 + length));
        newOffset = offset + 1 + length;
    } else if (tag >= TAG.STR_1BYTE_LEN && tag <= TAG.STR_4BYTE_LEN) {
        const lenBytes = tag & 0xF;
        const length = readLittleEndian(data, offset + 1, lenBytes);
        const start = offset + 1 + lenBytes;
        value = textDecoder.decode(data.subarray(start, start + length));
        newOffset = start + length;
    } else if (tag >= TAG.BYTES_BASE && tag <= TAG.BYTES_MAX_INLINE) {
        const length = tag - TAG.BYTES_BASE;
        value = data.subarray(offset + 1, offset + 1 + length);
        newOffset = offset + 1 + length;
    } else if (tag >= TAG.BYTES_1BYTE_LEN && tag <= TAG.BYTES_4BYTE_LEN) {
        const noOfBytes = 1 << ((tag & 0xF) - 1);
        const length = readLittleEndian(data, offset + 1, noOfBytes);
        const start = offset + 1 + noOfBytes;
        value = data.subarray(start, start + length);
        newOffset = start + length;
    } else if ((tag & 0xF0) === TAG.ARRAY_BASE) {
        const count = tag & 0xF;
        let pos = offset + 1;

        if (count === 0xF) {
            const arr: any[] = [];
            while (data[pos] !== TAG.TERMINATOR) {
                const result = _unpackAt(data, pos, objectList);
                arr.push(result.value);
                pos = result.offset;
            }
            pos++;
            value = arr;
        } else {
            const arr = new Array(count);
            for (let i = 0; i < count; i++) {
                const result = _unpackAt(data, pos, objectList);
                arr[i] = result.value;
                pos = result.offset;
            }
            value = arr;
        }

        newOffset = pos;
        addToObjectList = false;
    } else if ((tag & 0xF0) === TAG.DICT_BASE) {
        const count = tag & 0xF;
        const obj: Record<string, any> = {};
        let pos = offset + 1;

        if (count === 0xF) {
            while (data[pos] !== TAG.TERMINATOR) {
                const keyResult = _unpackAt(data, pos, objectList);
                const valResult = _unpackAt(data, keyResult.offset, objectList);
                obj[keyResult.value] = valResult.value;
                pos = valResult.offset;
            }
            pos++; // skip terminator
        } else {
            for (let i = 0; i < count; i++) {
                const keyResult = _unpackAt(data, pos, objectList);
                const valResult = _unpackAt(data, keyResult.offset, objectList);
                obj[keyResult.value] = valResult.value;
                pos = valResult.offset;
            }
        }

        value = obj;
        newOffset = pos;
        addToObjectList = false;
    } else if (tag >= TAG.REF_BASE && tag <= TAG.REF_MAX_INLINE) {
        const idx = tag - TAG.REF_BASE;

        if (idx >= objectList.length) {
            throw new TypeError(`Reference index ${idx} out of range`);
        }

        value = objectList[idx];
        newOffset = offset + 1;
        addToObjectList = false;
    } else if (tag >= TAG.REF_1BYTE && tag <= TAG.REF_8BYTE) {
        const len = tag - TAG.REF_MAX_INLINE;
        const uid = readLittleEndian(data, offset + 1, len);

        if (uid >= objectList.length) {
            throw new TypeError(`UID ${uid} out of range`);
        }

        value = objectList[uid];
        newOffset = offset + 1 + len;
        addToObjectList = false;
    } else {
        throw new TypeError(`Unknown tag 0x${tag.toString(16)}`);
    }

    if (addToObjectList) {
        objectList.push(value);
    }

    return {value, offset: newOffset};
}
