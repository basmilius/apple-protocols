import * as ed25519 from '@stablelib/ed25519';
import type { KeyPair } from './types';

/**
 * Generates a new Ed25519 key pair for digital signature operations.
 */
export function generateKeyPair(): KeyPair {
    return ed25519.generateKeyPair();
}

/** Signs a message with an Ed25519 secret key and returns the 64-byte signature. */
export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
    return ed25519.sign(secretKey, message);
}

/** Checks a 64-byte Ed25519 signature over a message against the signer's public key. */
export function verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    return ed25519.verify(publicKey, message, signature);
}
