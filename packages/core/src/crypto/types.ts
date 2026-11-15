/** An Ed25519 key pair for signing, or a Curve25519 key pair for key exchange. */
export type KeyPair = {
    readonly publicKey: Uint8Array;
    readonly secretKey: Uint8Array;
};
