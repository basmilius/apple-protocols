import { TLV8PairingError } from '../errors';

// The codec plus the HAP constants, so pairing code and the `TLV8` namespace of the encoding entry share one name.
export { decode, decodeEntries, encode } from '../encoding/tlv8';

/**
 * TLV8 pairing flags used during HAP pair-setup and pair-verify.
 * Sent as part of the TLV8 Flags (0x13) value.
 */
export const Flags = {
    TransientPairing: 0x10
} as const;

/**
 * TLV8 error codes returned by the accessory during pairing.
 * Included in the Error (0x07) TLV value.
 */
export const ErrorCode = {
    Unknown: 0x01,
    Authentication: 0x02,
    BackOff: 0x03,
    MaxPeers: 0x04,
    MaxTries: 0x05,
    Unavailable: 0x06,
    Busy: 0x07
} as const;

/**
 * HAP pairing method identifiers. Sent in the Method (0x00) TLV value
 * to indicate which pairing operation is being performed.
 */
export const Method = {
    PairSetup: 0x00,
    PairSetupWithAuth: 0x01,
    PairVerify: 0x02,
    AddPairing: 0x03,
    RemovePairing: 0x04,
    ListPairing: 0x05
} as const;

/**
 * HAP pairing state machine steps (M1 through M6).
 * Each state corresponds to a message in the SRP pair-setup or pair-verify flow.
 */
export const State = {
    M1: 0x01,
    M2: 0x02,
    M3: 0x03,
    M4: 0x04,
    M5: 0x05,
    M6: 0x06
} as const;

/**
 * TLV8 type identifiers for the fields exchanged during HAP pairing.
 * Each value is the type byte that precedes the length and data in a TLV8 entry.
 */
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

/** Throws the {@link TLV8PairingError} for the error or back-off in a decoded pairing response. */
export function bail(data: Map<number, Buffer>): never {
    if (data.has(Value.BackOff)) {
        const buffer = data.get(Value.BackOff);
        const time = buffer.readUintLE(0, buffer.length);

        throw new TLV8PairingError(`Device is busy, try again in ${time} seconds.`, ErrorCode.BackOff);
    }

    if (data.has(Value.Error)) {
        const code = data.get(Value.Error).readUint8();
        const errorCodeEntries = Object.entries(ErrorCode) as [string, number][];
        const errorCode = errorCodeEntries.find(([, value]) => value === code);

        if (!errorCode) {
            throw new TLV8PairingError(`Device returned an unknown error code: ${code}`, code);
        }

        throw new TLV8PairingError(`Device returned an error code: ${errorCode[0]}`, code);
    }

    throw new TLV8PairingError('Invalid response');
}
