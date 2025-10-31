import { randomBytes } from 'node:crypto';
import { x25519 } from '@noble/curves/ed25519.js';

export function generateKeyPair(): KeyPair {
    const secretKey = randomBytes(32);
    const publicKey = x25519.getPublicKey(secretKey);

    return {
        publicKey,
        secretKey
    };
}

export function generateSharedSecKey(priKey: Uint8Array, pubKey: Uint8Array): Uint8Array {
    return x25519.getSharedSecret(priKey, pubKey);
}

interface KeyPair {
    readonly publicKey: Uint8Array;
    readonly secretKey: Uint8Array;
}
