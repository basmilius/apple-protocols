import * as x25519 from '@stablelib/x25519';
import type { KeyPair } from './types';

/**
 * Generates a new Curve25519 key pair for Diffie-Hellman key exchange.
 */
export function generateKeyPair(): KeyPair {
    return x25519.generateKeyPair();
}

/**
 * Derives a Curve25519 shared secret.
 *
 * @param priKey - Local private key.
 * @param pubKey - Remote public key.
 * @returns 32-byte shared secret.
 */
export function generateSharedSecKey(priKey: Uint8Array, pubKey: Uint8Array): Uint8Array {
    return x25519.sharedKey(priKey, pubKey);
}
