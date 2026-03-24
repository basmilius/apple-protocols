/**
 * NTP epoch offset: the number of seconds between the NTP epoch (1900-01-01)
 * and the Unix epoch (1970-01-01).
 */
const EPOCH = 0x83AA7E80n;

/**
 * Returns the current wall-clock time as a 64-bit NTP timestamp.
 * The upper 32 bits are whole seconds since the NTP epoch (1900-01-01),
 * and the lower 32 bits are the fractional second.
 *
 * Uses `Date.now()` (wall-clock) rather than a monotone clock because Apple
 * devices expect NTP timestamps anchored to real time.
 *
 * @returns The current time as a 64-bit NTP timestamp.
 */
export function now(): bigint {
    const nowMs = BigInt(Date.now());
    const seconds = nowMs / 1000n;
    const frac = nowMs - seconds * 1000n;

    return ((seconds + EPOCH) << 32n) | ((frac << 32n) / 1000n);
}

/**
 * Splits a 64-bit NTP timestamp into its seconds and fractional parts.
 *
 * @param ntp - A 64-bit NTP timestamp (upper 32 bits = seconds, lower 32 bits = fraction).
 * @returns A tuple of [seconds, fraction] as 32-bit unsigned integers.
 */
export function parts(ntp: bigint): [number, number] {
    return [
        Number(ntp >> 32n),
        Number(ntp & 0xFFFFFFFFn)
    ];
}

/**
 * Decodes an NTP timing packet from a buffer into its constituent fields.
 * Expects at least 24 bytes; the send timestamp fields (bytes 24-31) default
 * to 0 if the buffer is shorter than 32 bytes.
 *
 * @param buffer - The raw NTP packet buffer (minimum 24 bytes).
 * @returns The decoded packet fields.
 * @throws RangeError if the buffer is shorter than 24 bytes.
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

/**
 * Encodes NTP timing packet fields into a 32-byte buffer.
 *
 * @param fields - The packet fields to encode.
 * @returns A 32-byte buffer containing the encoded NTP packet.
 */
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

/** Fields of an NTP timing packet used for clock synchronization with Apple devices. */
export type PacketFields = {
    /** Protocol identifier byte. */
    readonly proto: number;
    /** Packet type (e.g. request or response). */
    readonly type: number;
    /** Sequence number for correlating requests and responses. */
    readonly seqno: number;
    /** Padding field (typically zero). */
    readonly padding: number;
    /** Reference timestamp, seconds part. */
    readonly reftime_sec: number;
    /** Reference timestamp, fractional part. */
    readonly reftime_frac: number;
    /** Receive timestamp, seconds part. */
    readonly recvtime_sec: number;
    /** Receive timestamp, fractional part. */
    readonly recvtime_frac: number;
    /** Send timestamp, seconds part. */
    readonly sendtime_sec: number;
    /** Send timestamp, fractional part. */
    readonly sendtime_frac: number;
};
