import { randomBytes } from 'node:crypto';

export function randomInt32(): number {
    return randomBytes(4).readUInt32BE(0);
}

export function randomInt64(): bigint {
    return randomBytes(8).readBigUint64LE(0);
}

export function uint16ToBE(value: number): Buffer {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16BE(value, 0);

    return buffer;
}

export function uint53ToLE(value: number): Buffer {
    const [upper, lower] = splitUInt53(value);
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(lower, 0);
    buffer.writeUInt32LE(upper, 4);

    return buffer;
}

function splitUInt53(number: number): [number, number] {
    const MAX_UINT32 = 0x00000000FFFFFFFF;
    const MAX_INT53 = 0x001FFFFFFFFFFFFF;

    if (number <= -1 || number > MAX_INT53) {
        throw new Error('Number out of range.');
    }

    if (Math.floor(number) !== number) {
        throw new Error('Number is not an integer.');
    }

    let upper: number = 0;
    const signbit = number & 0xFFFFFFFF;
    const lower = signbit < 0 ? (number & 0x7FFFFFFF) + 0x80000000 : signbit;

    if (number > MAX_UINT32) {
        upper = (number - lower) / (MAX_UINT32 + 1);
    }

    return [upper, lower];
}
