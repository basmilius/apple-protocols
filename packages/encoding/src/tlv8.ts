export const Flags = {
    TransientPairing: 0x10
} as const;

export const ErrorCode = {
    Unknown: 0x01,
    Authentication: 0x02,
    BackOff: 0x03,
    MaxPeers: 0x04,
    MaxTries: 0x05,
    Unavailable: 0x06,
    Busy: 0x07
} as const;

export const Method = {
    PairSetup: 0x00,
    PairSetupWithAuth: 0x01,
    PairVerify: 0x02,
    AddPairing: 0x03,
    RemovePairing: 0x04,
    ListPairing: 0x05
} as const;

export const State = {
    M1: 0x01,
    M2: 0x02,
    M3: 0x03,
    M4: 0x04,
    M5: 0x05,
    M6: 0x06
} as const;

export const Value = {
    Method: 0x00,
    Identifier: 0x01,
    Salt: 0x02,
    PublicKey: 0x03,
    Proof: 0x04,
    EncryptedData: 0x05,
    State: 0x06,
    Error: 0x07,
    BackOff: 0x08,
    Certificate: 0x09,
    Signature: 0x0A,
    Permissions: 0x0B,
    FragmentData: 0x0C,
    FragmentLast: 0x0D,

    Name: 0x11,
    Flags: 0x13
} as const;

export function bail(data: Map<number, Buffer>): never {
    if (data.has(Value.BackOff)) {
        const buffer = data.get(Value.BackOff);
        const time = buffer.readUintLE(0, buffer.length);

        throw new Error(`Device is busy, try again in ${time} seconds.`);
    }

    if (data.has(Value.Error)) {
        const errorCodeEntries = Object.entries(ErrorCode) as [string, number][];
        const errorCode = errorCodeEntries.find(([_, code]) => code === data.get(Value.Error).readUint8());

        if (!errorCode) {
            throw new Error(`Device returned an unknown error code: ${data.get(Value.Error).readUint8()}`);
        }

        throw new Error(`Device returned an error code: ${errorCode[0]}`);
    }

    throw new Error('Invalid response');
}

export function encode(entries: [number, number | Buffer | Uint8Array][]): Buffer {
    let totalSize = 0;
    for (const [, valueRaw] of entries) {
        const len = typeof valueRaw === 'number' ? 1 : valueRaw.length;
        const chunks = Math.max(1, Math.ceil(len / 255));
        totalSize += chunks * 2 + len;
    }

    const result = Buffer.allocUnsafe(totalSize);
    let pos = 0;

    for (const [type, valueRaw] of entries) {
        let value: Buffer | Uint8Array;
        let valueLen: number;

        if (typeof valueRaw === 'number') {
            value = Buffer.allocUnsafe(1);
            value[0] = valueRaw;
            valueLen = 1;
        } else {
            value = valueRaw;
            valueLen = value.length;
        }

        let offset = 0;

        do {
            const len = Math.min(valueLen - offset, 255);
            result[pos++] = type;
            result[pos++] = len;

            if (len > 0) {
                if (value instanceof Buffer) {
                    value.copy(result, pos, offset, offset + len);
                } else {
                    result.set(value.subarray(offset, offset + len), pos);
                }
                pos += len;
            }

            offset += len;
        } while (offset < valueLen);
    }

    return result;
}

export function decode(buf: Buffer): Map<number, Buffer> {
    const map = new Map<number, Buffer>();
    let i = 0;

    while (i < buf.length) {
        const type = buf[i++];
        const len = buf[i++];

        const existing = map.get(type);
        if (existing) {
            const newBuf = Buffer.allocUnsafe(existing.length + len);
            existing.copy(newBuf, 0);
            buf.copy(newBuf, existing.length, i, i + len);
            map.set(type, newBuf);
        } else {
            map.set(type, buf.subarray(i, i + len) as Buffer);
        }

        i += len;
    }

    return map;
}
