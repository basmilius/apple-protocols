/**
 * Represents a cryptographic key pair consisting of a public key and a secret key.
 * Used by both Ed25519 (signing) and Curve25519 (key exchange) operations.
 */
export type KeyPair = {
    /** The public key component, safe to share with other parties. */
    readonly publicKey: Uint8Array;
    /** The secret (private) key component, must be kept confidential. */
    readonly secretKey: Uint8Array;
};
