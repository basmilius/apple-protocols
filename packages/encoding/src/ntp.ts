const EPOCH = 0x83AA7E80n;

export function now(): bigint {
    const now = ns() / 1000n;
    const seconds = now / 1_000_000n;
    const frac = now - seconds * 1_000_000n;

    return ((seconds + EPOCH) << 32n) | ((frac << 32n) / 1_000_000n);
}

export function ns(): bigint {
    return process.hrtime.bigint();
}

export function parts(ntp: bigint): [number, number] {
    return [
        Number(ntp >> 32n),
        Number(ntp & 0xFFFFFFFFn)
    ];
}

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

export function encode(fields: PacketFields): Buffer {
    const buffer = Buffer.alloc(32);

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

export type PacketFields = {
    proto: number;
    type: number;
    seqno: number;
    padding: number;
    reftime_sec: number;
    reftime_frac: number;
    recvtime_sec: number;
    recvtime_frac: number;
    sendtime_sec: number;
    sendtime_frac: number;
};
