import * as x25519 from '@stablelib/x25519';
import type { KeyPair } from './types';

export function generateKeyPair(): KeyPair {
    return x25519.generateKeyPair();
}

export function generateSharedSecKey(priKey: Uint8Array, pubKey: Uint8Array): Uint8Array {
    return x25519.sharedKey(priKey, pubKey);
}
