type Packed = Uint8Array;
type ObjectList = Packed[];

class SizedInt extends Number {
    size: number;

    constructor(value: number, size: number) {
        super(value);
        this.size = size;
    }
}

const _SIZED_INT_TYPES: Record<number, typeof SizedInt> = {};

export function sizedInt(value: number, size: number): SizedInt {
    return new SizedInt(value, size);
}

class OPACKFloat {
    value: number;

    constructor(value: number) {
        this.value = value;
    }
}

export function float(value: number) {
    return new OPACKFloat(value);
}

class OPACKInt {
    value: number;

    constructor(value: number) {
        this.value = value;
    }
}

export function int(value: number) {
    return new OPACKInt(value);
}

function concat(arr: Uint8Array[]): Uint8Array {
    const total = arr.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arr) {
        out.set(a, off);
        off += a.length;
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

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
}

export function encode(data: any): Uint8Array {
    return _pack(data, []);
}

function _pack(data: any, objectList: ObjectList): Uint8Array {
    let packed: Uint8Array | null = null;

    if (data === null || data === undefined) packed = u8(0x04);
    else if (typeof data === 'boolean') packed = u8(data ? 0x01 : 0x02);
    else if (data instanceof OPACKFloat) {
        const buf = new ArrayBuffer(8);
        new DataView(buf).setFloat64(0, data.value, true);
        packed = concat([u8(0x36), new Uint8Array(buf)]);
    } else if (data instanceof OPACKInt) {
        const val = data.value;
        if (val < 0x28) packed = u8(0x08 + val);
        else if (val <= 0xff) packed = concatUint8Arrays([u8(0x30), uintToLEBytes(val, 1)]);
        else if (val <= 0xffff) packed = concatUint8Arrays([u8(0x31), uintToLEBytes(val, 2)]);
        else if (val <= 0xffffffff) packed = concatUint8Arrays([u8(0x32), uintToLEBytes(val, 4)]);
        else packed = concatUint8Arrays([u8(0x33), uintToLEBytes(val, 8)]);
    } else if (typeof data === 'number') {
        if (!Number.isInteger(data)) {
            const buf = new ArrayBuffer(8);
            new DataView(buf).setFloat64(0, data, true);
            packed = concat([u8(0x36), new Uint8Array(buf)]);
        } else {
            if (data < 0x28) packed = u8(0x08 + data);
            else if (data <= 0xff) packed = concat([u8(0x30), uintToLEBytes(data, 1)]);
            else if (data <= 0xffff) packed = concat([u8(0x31), uintToLEBytes(data, 2)]);
            else if (data <= 0xffffffff) packed = concat([u8(0x32), uintToLEBytes(data, 4)]);
            else packed = concat([u8(0x33), uintToLEBytes(data, 8)]);
        }
    } else if (data instanceof SizedInt) {
        packed = concat([u8(0x30 + Math.log2(data.size)), uintToLEBytes(data.valueOf(), data.size)]);
    } else if (typeof data === 'string') {
        const b = new TextEncoder().encode(data);
        const len = b.length;
        if (len <= 0x20) packed = concat([u8(0x40 + len), b]);
        else if (len <= 0xff) packed = concat([u8(0x61), uintToLEBytes(len, 1), b]);
        else if (len <= 0xffff) packed = concat([u8(0x62), uintToLEBytes(len, 2), b]);
        else if (len <= 0xffffff) packed = concat([u8(0x63), uintToLEBytes(len, 3), b]);
        else packed = concat([u8(0x64), uintToLEBytes(len, 4), b]);
    } else if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const len = bytes.length;
        if (len <= 0x20) packed = concat([u8(0x70 + len), bytes]);
        else if (len <= 0xff) packed = concat([u8(0x91), uintToLEBytes(len, 1), bytes]);
        else if (len <= 0xffff) packed = concat([u8(0x92), uintToLEBytes(len, 2), bytes]);
        else packed = concat([u8(0x93), uintToLEBytes(len, 4), bytes]);
    } else if (Array.isArray(data)) {
        const body = concat(data.map(d => _pack(d, objectList)));
        const len = data.length;
        if (len <= 0x0f) {
            packed = concat([u8(0xd0 + len), body]);
            if (len >= 0x0f) packed = concat([packed, u8(0x03)]);
        } else packed = concat([u8(0xdf), body, u8(0x03)]);
    } else if (typeof data === 'object') {
        const keys = Object.keys(data);
        const len = keys.length;
        const pairs: Uint8Array[] = [];
        for (const k of keys) {
            pairs.push(_pack(k, objectList));
            pairs.push(_pack((data as any)[k], objectList));
        }
        let header: Uint8Array;
        if (len <= 0x0f) {
            header = u8(0xE0 + len);
        } else {
            header = u8(0xEF);
        }
        packed = concatUint8Arrays([header, concatUint8Arrays(pairs)]);
        // terminator
        if (len >= 0x0f || objectList.some(v => v === packed)) {
            packed = concatUint8Arrays([packed, u8(0x81)]);
        }
    } else throw new TypeError(typeof data + '');

    // Object reuse
    const idx = objectList.findIndex(v => v.length === packed!.length && v.every((x, i) => x === packed![i]));
    if (idx >= 0) {
        if (idx < 0x21) packed = u8(0xA0 + idx);
        else if (idx <= 0xff) packed = concat([u8(0xC1), uintToLEBytes(idx, 1)]);
        else if (idx <= 0xffff) packed = concat([u8(0xC2), uintToLEBytes(idx, 2)]);
        else if (idx <= 0xffffffff) packed = concat([u8(0xC3), uintToLEBytes(idx, 4)]);
        else packed = concat([u8(0xC4), uintToLEBytes(idx, 8)]);
    } else if (packed!.length > 1) objectList.push(packed!);

    return packed!;
}

/* UNPACK */
export function decode(data: Uint8Array): [any, Uint8Array] {
    return _unpack(data, []);
}

function ensureAvailable(buf: Uint8Array, need: number) {
    if (buf.length < need) throw new TypeError(`Not enough data: need ${need} bytes, have ${buf.length}`);
}

function readLittleEndian(buf: Uint8Array, offset: number, len: number) {
    ensureAvailable(buf.subarray(offset), len);
    let v = 0n;
    for (let i = len - 1; i >= 0; i--) v = (v << 8n) | BigInt(buf[offset + i]);
    return Number(v);
}

function _unpack(data: Uint8Array, objectList: any[]): [any, Uint8Array] {
    if (data.length === 0) throw new TypeError('No data to unpack');
    const tag = data[0];
    let addToObjectList = true;
    let value: any;
    let rest: Uint8Array;

    // simple tokens
    if (tag === 0x01) { value = true; rest = data.subarray(1); }
    else if (tag === 0x02) { value = false; rest = data.subarray(1); }
    else if (tag === 0x04) { value = null; rest = data.subarray(1); }
    else if (tag === 0x05) {
        value = data.subarray(1, 17);
        rest = data.subarray(17);
    }
    else if (tag === 0x06) {
        value = readLittleEndian(data, 1, 8);
        rest = data.subarray(9);
    }
    else if (tag >= 0x08 && tag <= 0x2f) {
        value = tag - 8;
        rest = data.subarray(1);
    }
    else if (tag === 0x35) {
        const view = new DataView(data.buffer, data.byteOffset + 1, 4);
        value = view.getFloat32(0, true);
        rest = data.subarray(5);
    }
    else if (tag === 0x36) {
        const view = new DataView(data.buffer, data.byteOffset + 1, 8);
        value = view.getFloat64(0, true);
        rest = data.subarray(9);
    }
    else if ((tag & 0xF0) === 0x30) {
        const noOfBytes = 2 ** (tag & 0xF);
        const val = readLittleEndian(data, 1, noOfBytes);
        value = sizedInt(val, noOfBytes);
        rest = data.subarray(1 + noOfBytes);
    }
    else if (tag >= 0x40 && tag <= 0x60) {
        const length = tag - 0x40;
        value = new TextDecoder().decode(data.subarray(1, 1 + length));
        rest = data.subarray(1 + length);
    }
    else if (tag >= 0x61 && tag <= 0x64) {
        const lenBytes = tag & 0xF;
        const length = readLittleEndian(data, 1, lenBytes);
        value = new TextDecoder().decode(data.subarray(1 + lenBytes, 1 + lenBytes + length));
        rest = data.subarray(1 + lenBytes + length);
    }
    else if (tag >= 0x70 && tag <= 0x90) {
        const length = tag - 0x70;
        value = data.subarray(1, 1 + length);
        rest = data.subarray(1 + length);
    }
    else if (tag >= 0x91 && tag <= 0x94) {
        const noOfBytes = 1 << ((tag & 0xF) - 1);
        const length = readLittleEndian(data, 1, noOfBytes);
        const start = 1 + noOfBytes;
        value = data.subarray(start, start + length);
        rest = data.subarray(start + length);
    }
    else if ((tag & 0xF0) === 0xD0) {
        const count = tag & 0xF;
        let ptr = data.subarray(1);
        const arr: any[] = [];
        if (count === 0xF) {
            while (ptr[0] !== 0x03) {
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
    }
    else if ((tag & 0xE0) === 0xE0) {
        const count = tag & 0xF;
        let ptr = data.subarray(1);
        const obj: Record<string, any> = {};
        if (count === 0xF) {
            while (ptr[0] !== 0x03) {
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
    }
    else if (tag >= 0xA0 && tag <= 0xC0) {
        const idx = tag - 0xA0;
        if (idx >= objectList.length) throw new TypeError(`Reference index ${idx} out of range`);
        value = objectList[idx];
        rest = data.subarray(1);
        addToObjectList = false;
    }
    else if (tag >= 0xC1 && tag <= 0xC4) {
        const len = tag - 0xC0;
        const uid = readLittleEndian(data, 1, len);
        if (uid >= objectList.length) throw new TypeError(`UID ${uid} out of range`);
        value = objectList[uid];
        rest = data.subarray(1 + len);
        addToObjectList = false;
    }
    else {
        throw new TypeError(`Unknown tag 0x${tag.toString(16)}`);
    }

    if (addToObjectList) objectList.push(value);
    return [value, rest];
}
