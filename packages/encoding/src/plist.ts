/**
 * Binary plist parsing and serialization.
 * Apple's binary plist format is used extensively in AirPlay, RAOP, and pairing protocols.
 */
export { serialize } from '@plist/binary.serialize';

export type PlistValue =
    | null
    | string
    | number
    | bigint
    | boolean
    | ArrayBuffer
    | Date
    | PlistDictionary
    | PlistValue[];

export type PlistDictionary = { [key: string]: PlistValue };

const HEADER = 'bplist00';
const TRAILER_SIZE = 32;
const MAX_OBJECT_COUNT = 32768;
const MAX_DEPTH = 256;

/** Milliseconds between the Unix epoch and the Cocoa epoch (2001-01-01 GMT). */
const COCOA_EPOCH = 978307200000;

const UTF8 = new TextDecoder('utf-8');
const UTF16_BE = new TextDecoder('utf-16be');

/**
 * Parses a binary plist.
 *
 * Integers of 1, 2 and 4 bytes are unsigned, as in CFBinaryPList.c; only 8-byte integers
 * carry a sign. `@plist/binary.parse` reads all of them as signed, which turned 200 into -56
 * and 44100 into -21436. An 8-byte integer comes back as a `bigint`.
 *
 * @throws Error when the buffer is not a well-formed binary plist.
 */
export function parse(buffer: ArrayBuffer): PlistValue {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    if (bytes.byteLength < HEADER.length + TRAILER_SIZE || UTF8.decode(bytes.subarray(0, HEADER.length)) !== HEADER) {
        throw new Error(`Invalid binary plist. Expected '${HEADER}' at offset 0.`);
    }

    const trailer = bytes.byteLength - TRAILER_SIZE;
    const offsetSize = view.getUint8(trailer + 6);
    const refSize = view.getUint8(trailer + 7);
    const objectCount = Number(view.getBigUint64(trailer + 8));
    const topObject = Number(view.getBigUint64(trailer + 16));
    const offsetTable = Number(view.getBigUint64(trailer + 24));

    if (objectCount > MAX_OBJECT_COUNT) {
        throw new Error('Binary plist has too many objects.');
    }

    const readUInt = (offset: number, size: number): number => {
        if (offset < 0 || offset + size > bytes.byteLength) {
            throw new Error('Binary plist points outside the buffer.');
        }

        let value = 0;

        for (let i = 0; i < size; i++) {
            value = value * 256 + bytes[offset + i];
        }

        return value;
    };

    /** Reads a count that is either the low nibble or, for 0xF, an integer object that follows. */
    const readCount = (offset: number, info: number): [count: number, start: number] => {
        if (info !== 0xF) {
            return [info, offset + 1];
        }

        const size = 1 << (view.getUint8(offset + 1) & 0x0F);

        return [readUInt(offset + 2, size), offset + 2 + size];
    };

    const readInteger = (offset: number, size: number): number | bigint => {
        if (size === 8) {
            return view.getBigInt64(offset, false);
        }

        if (size === 16) {
            return view.getBigUint64(offset + 8, false);
        }

        return readUInt(offset, size);
    };

    const readReal = (offset: number, size: number): number => {
        if (size === 4) {
            return view.getFloat32(offset, false);
        }

        if (size === 8) {
            return view.getFloat64(offset, false);
        }

        throw new Error(`Invalid real length: ${size}`);
    };

    const readObject = (index: number, depth: number): PlistValue => {
        if (index >= objectCount || depth > MAX_DEPTH) {
            throw new Error('Binary plist has an invalid object reference.');
        }

        const offset = readUInt(offsetTable + index * offsetSize, offsetSize);
        const marker = readUInt(offset, 1);
        const type = marker >> 4;
        const info = marker & 0x0F;

        switch (type) {
            case 0x0:
                if (info === 0x8 || info === 0x9) {
                    return info === 0x9;
                }

                if (info === 0x0 || info === 0xF) {
                    return null;
                }

                throw new Error(`Unhandled simple type 0x${info.toString(16)}`);

            case 0x1:
                return readInteger(offset + 1, 1 << info);

            case 0x2:
                return readReal(offset + 1, 1 << info);

            case 0x3:
                return new Date(COCOA_EPOCH + 1000 * view.getFloat64(offset + 1, false));

            case 0x4: {
                const [length, start] = readCount(offset, info);
                readUInt(start + length, 0);

                return buffer.slice(start, start + length);
            }

            case 0x5: {
                const [length, start] = readCount(offset, info);
                readUInt(start + length, 0);

                return UTF8.decode(bytes.subarray(start, start + length));
            }

            case 0x6: {
                const [length, start] = readCount(offset, info);
                readUInt(start + length * 2, 0);

                return UTF16_BE.decode(bytes.subarray(start, start + length * 2));
            }

            case 0x8:
                return {CF$UID: readUInt(offset + 1, info + 1)};

            case 0xA: {
                const [length, start] = readCount(offset, info);
                const items: PlistValue[] = [];

                for (let i = 0; i < length; i++) {
                    items.push(readObject(readUInt(start + i * refSize, refSize), depth + 1));
                }

                return items;
            }

            case 0xD: {
                const [length, start] = readCount(offset, info);
                const dictionary: PlistDictionary = {};

                for (let i = 0; i < length; i++) {
                    const key = readObject(readUInt(start + i * refSize, refSize), depth + 1);

                    if (typeof key !== 'string') {
                        throw new Error('Invalid key type.');
                    }

                    if (key === '__proto__') {
                        throw new Error('Attempted prototype pollution');
                    }

                    dictionary[key] = readObject(readUInt(start + (length + i) * refSize, refSize), depth + 1);
                }

                return dictionary;
            }

            default:
                throw new Error(`Unhandled type 0x${type.toString(16)}`);
        }
    };

    return readObject(topObject, 0);
}
