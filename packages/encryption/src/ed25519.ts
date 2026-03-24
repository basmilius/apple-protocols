import * as ed25519 from '@stablelib/ed25519';
import type { KeyPair } from './types';

/**
 * Generates a new Ed25519 key pair for digital signature operations.
 *
 * @returns A key pair with a public key and secret key.
 */
export function generateKeyPair(): KeyPair {
    return ed25519.generateKeyPair();
}

/**
 * Creates an Ed25519 digital signature for a message.
 *
 * @param message - The data to sign.
 * @param secretKey - The signer's secret (private) key.
 * @returns The 64-byte Ed25519 signature.
 */
export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
    return ed25519.sign(secretKey, message);
}

/**
 * Verifies an Ed25519 digital signature against a message and public key.
 *
 * @param message - The original signed data.
 * @param signature - The 64-byte Ed25519 signature to verify.
 * @param publicKey - The signer's public key.
 * @returns True if the signature is valid, false otherwise.
 */
export function verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    return ed25519.verify(publicKey, message, signature);
}
