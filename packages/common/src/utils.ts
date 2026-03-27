import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';

/**
 * Generates a random Active-Remote identifier for DACP (Digital Audio Control Protocol).
 * Used in RTSP headers to identify the remote controller.
 *
 * @returns A random 32-bit unsigned integer as a decimal string.
 */
export function generateActiveRemoteId(): string {
    return randomBytes(4).readUInt32BE(0).toString(10);
}

/**
 * Generates a random DACP-ID for identifying this controller in DACP sessions.
 *
 * @returns A random 64-bit integer as an uppercase hexadecimal string.
 */
export function generateDacpId(): string {
    return randomBytes(8).toString('hex').toUpperCase();
}

/**
 * Generates a random session identifier for RTSP and AirPlay sessions.
 *
 * @returns A random 32-bit unsigned integer as a decimal string.
 */
export function generateSessionId(): string {
    return randomBytes(4).readUInt32BE(0).toString(10);
}

/**
 * Finds the first non-internal IPv4 address on this machine.
 *
 * @returns The local IPv4 address, or null if none is found.
 */
export function getLocalIP(): string | null {
    const interfaces = networkInterfaces();

    for (const iface of Object.values(interfaces)) {
        if (!iface) {
            continue;
        }

        for (const net of iface) {
            if (net.internal || net.family !== 'IPv4') {
                continue;
            }

            if (net.address && net.address !== '127.0.0.1') {
                return net.address;
            }
        }
    }

    return null;
}

/**
 * Finds the first non-internal MAC address on this machine.
 *
 * @returns The MAC address in uppercase colon-separated format, or '00:00:00:00:00:00' if none is found.
 */
export function getMacAddress(): string {
    const interfaces = networkInterfaces();

    for (const iface of Object.values(interfaces)) {
        if (!iface) {
            continue;
        }

        for (const net of iface) {
            if (net.internal || net.family !== 'IPv4') {
                continue;
            }

            if (net.mac && net.mac !== '00:00:00:00:00:00') {
                return net.mac.toUpperCase();
            }
        }
    }

    return '00:00:00:00:00:00';
}

/**
 * Generates a cryptographically random 32-bit unsigned integer.
 *
 * @returns A random unsigned 32-bit integer.
 */
export function randomInt32(): number {
    return randomBytes(4).readUInt32BE(0);
}

/**
 * Generates a cryptographically random 64-bit unsigned integer.
 *
 * @returns A random unsigned 64-bit bigint.
 */
export function randomInt64(): bigint {
    return randomBytes(8).readBigUint64LE(0);
}

/**
 * Encodes a 16-bit unsigned integer into a big-endian buffer.
 *
 * @param value - The 16-bit unsigned integer to encode.
 * @returns A 2-byte buffer containing the value in big-endian byte order.
 */
export function uint16ToBE(value: number): Buffer {
    const buffer = Buffer.allocUnsafe(2);
    buffer.writeUInt16BE(value, 0);

    return buffer;
}

/**
 * Encodes a 53-bit unsigned integer into an 8-byte little-endian buffer.
 * Useful for encoding JavaScript-safe integers into 64-bit wire formats.
 *
 * @param value - The unsigned integer to encode (must be in range [0, 2^53-1]).
 * @returns An 8-byte buffer containing the value in little-endian byte order.
 * @throws If the value is out of range or not an integer.
 */
export function uint53ToLE(value: number): Buffer {
    const [upper, lower] = splitUInt53(value);
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeUInt32LE(lower, 0);
    buffer.writeUInt32LE(upper, 4);

    return buffer;
}

/**
 * Splits a 53-bit unsigned integer into upper and lower 32-bit halves.
 *
 * @param number - The integer to split (must be in range [0, 2^53-1]).
 * @returns A tuple of [upper32, lower32].
 * @throws If the number is out of range or not an integer.
 */
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
