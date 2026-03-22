import * as ed25519 from '@stablelib/ed25519';
import type { KeyPair } from './types';

export function generateKeyPair(): KeyPair {
    return ed25519.generateKeyPair();
}

export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
    return ed25519.sign(secretKey, message);
}

export function verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    return ed25519.verify(publicKey, message, signature);
}
