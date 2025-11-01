export const Flags = {
    TransientPairing: 0x10
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
        throw new Error(`Device returned an error code: ${data.get(Value.Error).readUint8()}`);
    }

    console.error(data);

    throw new Error('Invalid response');
}

export function encode(entries: [number, number | Buffer][]): Buffer {
    const chunks: number[] = [];

    for (const [type, valueRaw] of entries) {
        let value: Buffer;

        if (typeof valueRaw === 'number') {
            value = Buffer.from([valueRaw]);
        } else {
            value = valueRaw;
        }

        let offset = 0;

        do {
            const len = Math.min(value.length - offset, 255);
            chunks.push(type, len);

            if (len > 0) {
                for (let i = 0; i < len; i++) {
                    chunks.push(value[offset + i]);
                }
            }

            offset += len;
        } while (offset < value.length);
    }

    return Buffer.from(chunks);
}

export function decode(buf: Buffer): Map<number, Buffer> {
    const map = new Map<number, Buffer>();
    let i = 0;

    while (i < buf.length) {
        const type = buf[i++];
        const len = buf[i++];

        const value = (new Uint8Array(buf)).slice(i, i + len);
        i += len;

        const existing = map.get(type);
        if (existing) {
            map.set(type, Buffer.concat([existing, value]));
        } else {
            map.set(type, Buffer.from(value));
        }
    }

    return map;
}
