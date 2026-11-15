/** Seconds between the NTP epoch (1900-01-01) and the Unix epoch (1970-01-01). */
const EPOCH = 0x83AA7E80n;

/**
 * Returns the wall-clock time as a 64-bit NTP timestamp: whole seconds since 1900 in the upper
 * 32 bits, the fraction in the lower 32 bits.
 *
 * It reads `Date.now()` instead of a monotonic clock, because Apple devices expect NTP
 * timestamps anchored to real time.
 */
export function now(): bigint {
    const nowMs = BigInt(Date.now());
    const seconds = nowMs / 1000n;
    const frac = nowMs - seconds * 1000n;

    return ((seconds + EPOCH) << 32n) | ((frac << 32n) / 1000n);
}

/** Splits a 64-bit NTP timestamp into `[seconds, fraction]`, both 32-bit unsigned integers. */
export function parts(ntp: bigint): [number, number] {
    return [
        Number(ntp >> 32n),
        Number(ntp & 0xFFFFFFFFn)
    ];
}

/**
 * Decodes an NTP timing packet. The send timestamp (bytes 24 to 31) reads as 0 when the packet
 * stops before it.
 *
 * @throws {RangeError} When the packet is shorter than 24 bytes.
 */
export function decode(buffer: Buffer): PacketFields {
    if (buffer.length < 24) {
        throw new RangeError(`NTP packet too small: expected at least 24 bytes, got ${buffer.length}`);
    }

    return {
        proto: buffer.readUInt8(0),
        type: buffer.readUInt8(1),
        seqno: buffer.readUInt16BE(2),
        padding: buffer.readUInt32BE(4),
        reftime_sec: buffer.readUInt32BE(8),
        reftime_frac: buffer.readUInt32BE(12),
        recvtime_sec: buffer.readUInt32BE(16),
        recvtime_frac: buffer.readUInt32BE(20),
        sendtime_sec: buffer.length >= 28 ? buffer.readUInt32BE(24) : 0,
        sendtime_frac: buffer.length >= 32 ? buffer.readUInt32BE(28) : 0
    };
}

/** Encodes a 32-byte NTP timing packet. */
export function encode(fields: PacketFields): Buffer {
    const buffer = Buffer.allocUnsafe(32);

    buffer.writeUInt8(fields.proto, 0);
    buffer.writeUInt8(fields.type, 1);
    buffer.writeUInt16BE(fields.seqno, 2);
    buffer.writeUInt32BE(fields.padding, 4);
    buffer.writeUInt32BE(fields.reftime_sec, 8);
    buffer.writeUInt32BE(fields.reftime_frac, 12);
    buffer.writeUInt32BE(fields.recvtime_sec, 16);
    buffer.writeUInt32BE(fields.recvtime_frac, 20);
    buffer.writeUInt32BE(fields.sendtime_sec, 24);
    buffer.writeUInt32BE(fields.sendtime_frac, 28);

    return buffer;
}

/**
 * The fields of an AirPlay NTP timing packet. Each timestamp is split into whole seconds since
 * 1900 (`_sec`) and a 32-bit fraction (`_frac`).
 */
export type PacketFields = {
    readonly proto: number;
    readonly type: number;
    readonly seqno: number;
    readonly padding: number;
    readonly reftime_sec: number;
    readonly reftime_frac: number;
    readonly recvtime_sec: number;
    readonly recvtime_frac: number;
    readonly sendtime_sec: number;
    readonly sendtime_frac: number;
};
