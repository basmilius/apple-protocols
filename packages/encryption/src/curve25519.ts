import * as x25519 from '@stablelib/x25519';
import type { KeyPair } from './types';

/**
 * Generates a new Curve25519 key pair for Diffie-Hellman key exchange.
 *
 * @returns A key pair with a public key and secret key.
 */
export function generateKeyPair(): KeyPair {
    return x25519.generateKeyPair();
}

/**
 * Computes a shared secret using Curve25519 Diffie-Hellman key exchange.
 * Both parties derive the same shared secret from their own private key
 * and the other party's public key.
 *
 * @param priKey - The local party's private (secret) key.
 * @param pubKey - The remote party's public key.
 * @returns The 32-byte shared secret.
 */
export function generateSharedSecKey(priKey: Uint8Array, pubKey: Uint8Array): Uint8Array {
    return x25519.sharedKey(priKey, pubKey);
}
