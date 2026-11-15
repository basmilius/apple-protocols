import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';

/**
 * Builds the 32-byte header of a DataStream `sync`/`comm` frame.
 *
 * - [0..3] frame size, header and payload, as uint32 BE
 * - [4..7] `sync`
 * - [8..15] reserved, zero
 * - [16..19] `comm`
 * - [20..27] sequence number as uint64 BE
 * - [28..31] reserved, zero
 *
 * @param totalSize - Frame size including this header.
 */
export function buildHeader(totalSize: number, seqno: bigint): Buffer {
    const buf = Buffer.allocUnsafe(32);

    buf.writeUInt32BE(totalSize, 0);
    buf.write('sync', 4, 'ascii');
    buf.fill(0, 8, 16);
    buf.write('comm', 16, 'ascii');
    buf.writeBigUInt64BE(seqno, 20);
    buf.writeUInt32BE(0, 28);

    return buf;
}

/**
 * Builds the 32-byte DataStream `rply` frame that acknowledges a frame. It has
 * no payload and echoes the sequence number of the acknowledged frame.
 */
export function buildReply(seqno: bigint): Buffer {
    const header = Buffer.allocUnsafe(32);

    header.writeUInt32BE(32, 0); // size = header only, no payload
    header.write('rply', 4, 'ascii');
    header.fill(0, 8, 16);
    header.fill(0, 16, 20); // command = 4 zero bytes
    header.writeBigUInt64BE(seqno, 20);
    header.writeUInt32BE(0, 28);

    return header;
}

/**
 * Reads the sequence number of a DataStream frame header.
 *
 * @param header - At least 28 bytes of the frame header.
 * @throws Error if the header is too short.
 */
export function parseHeaderSeqno(header: Buffer): bigint {
    if (header.length < 28) {
        throw new Error('Header too short');
    }

    return header.readBigUInt64BE(20);
}

/**
 * Finds the MAC address of the first external IPv4 interface.
 *
 * @returns Uppercase and colon-separated, or `00:00:00:00:00:00` when there is none.
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

/** A cryptographically random unsigned 32-bit integer. */
export function randomInt32(): number {
    return randomBytes(4).readUInt32BE(0);
}

/** A cryptographically random unsigned 64-bit integer. */
export function randomInt64(): bigint {
    return randomBytes(8).readBigUint64LE(0);
}

/** A 16-bit unsigned integer as two big-endian bytes. */
export function uint16ToBE(value: number): Buffer {
    const buffer = Buffer.allocUnsafe(2);

    buffer.writeUInt16BE(value, 0);

    return buffer;
}
