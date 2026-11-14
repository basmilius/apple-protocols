/** The HAP pairing message a controller sends: M1, M3 or M5. */
export type PairingStep = 'm1' | 'm3' | 'm5';

/**
 * Carries one pairing message to the accessory and resolves with its reply. Pairing only knows
 * TLV8; the protocol knows the frame (an HTTP body, an OPack frame). Some protocols frame the
 * first message differently, hence the step.
 */
export type PairingTransport = (payload: Buffer, step: PairingStep) => Promise<Buffer>;

/** Long-term credentials from a PIN pair-setup, reused by every later pair-verify. */
export type AccessoryCredentials = {
    readonly accessoryIdentifier: string;
    readonly accessoryLongTermPublicKey: Buffer;

    /** This controller's pairing identifier (an uppercase UUID). */
    readonly pairingId: Buffer;

    /** This controller's Ed25519 key pair. */
    readonly publicKey: Buffer;
    readonly secretKey: Buffer;
};

/** Session keys from a transient pair-setup or a pair-verify. */
export type AccessoryKeys = {
    readonly pairingId: Buffer;

    /** Root key for the HKDF derivation of the channel keys. */
    readonly sharedSecret: Buffer;

    /** Empty after a bare pair-verify; the protocol derives its own channel keys from {@link sharedSecret}. */
    readonly accessoryToControllerKey: Buffer;
    readonly controllerToAccessoryKey: Buffer;
};

/** The persistent identity an accessory presents. Persist it, or paired controllers lose their pairing. */
export type AccessoryIdentity = {
    /** A MAC-like pairing identifier, e.g. "AA:BB:CC:DD:EE:FF". */
    readonly identifier: string;
    readonly publicKey: Buffer;
    readonly secretKey: Buffer;
};

/** A controller that completed pair-setup with the accessory. */
export type PairedController = {
    readonly identifier: string;
    readonly longTermPublicKey: Buffer;
};

/** Looks up a paired controller's long-term public key; undefined rejects the pair-verify. */
export type ControllerResolver = (pairingId: string) => Buffer | undefined;

/** Options shared by the controller and accessory sides. */
export type PairingOptions = {
    /** AES-128-CTR instead of ChaCha20-Poly1305 for the encrypted sub-TLVs, for legacy devices. */
    readonly useAes?: boolean;
};
