import tweetnacl from 'tweetnacl';
import type { KeyPair } from './types';

export function generateKeyPair(): KeyPair {
    const keyPair = tweetnacl.sign.keyPair();

    return {
        publicKey: keyPair.publicKey,
        secretKey: keyPair.secretKey
    };
}

export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
    return tweetnacl.sign.detached(message, secretKey);
}

export function verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    return tweetnacl.sign.detached.verify(message, signature, publicKey);
}
