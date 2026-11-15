/**
 * IEEE 1588 PTP timestamp represented as seconds + nanoseconds since the
 * Unix epoch. Apple gPTP follows PTPv2 and uses the Unix epoch (not the
 * PTP epoch) in its `preciseOriginTimestamp` fields.
 */
export type PtpTimestamp = {
    readonly seconds: bigint;
    readonly nanoseconds: number;
};

/**
 * Captures the current wall-clock time as a {@link PtpTimestamp}.
 *
 * Uses {@link Date.now}, not the monotonic {@link process.hrtime.bigint},
 * because PTP timestamps are anchored to the Unix epoch, as with {@link NTP.now}.
 */
export function ptpNow(): PtpTimestamp {
    const nowMs = BigInt(Date.now());
    const seconds = nowMs / 1000n;
    const nanoseconds = Number((nowMs - seconds * 1000n) * 1_000_000n);

    return {
        seconds,
        nanoseconds
    };
}

/**
 * Encodes a {@link PtpTimestamp} into the 10-byte PTP wire format:
 * 48-bit seconds (big-endian) followed by 32-bit nanoseconds (big-endian).
 */
export function encodeTimestamp(ts: PtpTimestamp): Buffer {
    const buf = Buffer.alloc(10);
    const high = Number((ts.seconds >> 32n) & 0xFFFFn);
    const low = Number(ts.seconds & 0xFFFFFFFFn);

    buf.writeUInt16BE(high, 0);
    buf.writeUInt32BE(low, 2);
    buf.writeUInt32BE(ts.nanoseconds, 6);

    return buf;
}

/**
 * Decodes a 10-byte PTP timestamp from the buffer at the given offset.
 */
export function decodeTimestamp(buf: Buffer, offset: number): PtpTimestamp {
    const high = BigInt(buf.readUInt16BE(offset));
    const low = BigInt(buf.readUInt32BE(offset + 2));
    const nanoseconds = buf.readUInt32BE(offset + 6);

    return {
        seconds: (high << 32n) | low,
        nanoseconds
    };
}
