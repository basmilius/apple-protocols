import tweetnacl from 'tweetnacl';
import type { KeyPair } from './types';

export function generateKeyPair(): KeyPair {
    const keyPair = tweetnacl.box.keyPair();

    return {
        publicKey: keyPair.publicKey,
        secretKey: keyPair.secretKey
    };
}

export function generateSharedSecKey(priKey: Uint8Array, pubKey: Uint8Array): Uint8Array {
    return tweetnacl.scalarMult(priKey, pubKey);
}
