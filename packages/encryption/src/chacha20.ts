import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305';

export class DecryptionError extends Error {
    constructor(message: string = 'Decryption failed: authentication tag mismatch') {
        super(message);
        this.name = 'DecryptionError';
    }
}

export const CHACHA20_AUTH_TAG_LENGTH = 16;
export const CHACHA20_NONCE_LENGTH = 12;

export function decrypt(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer {
    nonce = padNonce(nonce);

    const chacha = new ChaCha20Poly1305(key);
    const sealed = Buffer.concat([ciphertext, authTag]);
    const plaintext = chacha.open(nonce, sealed, aad ?? undefined);

    if (!plaintext) {
        throw new DecryptionError();
    }

    return Buffer.from(plaintext);
}

export function encrypt(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData {
    nonce = padNonce(nonce);

    const chacha = new ChaCha20Poly1305(key);
    const sealed = chacha.seal(nonce, plaintext, aad ?? undefined);
    const ciphertext = Buffer.from(sealed.subarray(0, sealed.length - CHACHA20_AUTH_TAG_LENGTH));
    const authTag = Buffer.from(sealed.subarray(sealed.length - CHACHA20_AUTH_TAG_LENGTH));

    return {
        ciphertext,
        authTag
    };
}

export function padNonce(nonce: Buffer): Buffer {
    if (nonce.length >= CHACHA20_NONCE_LENGTH) {
        return nonce;
    }

    return Buffer.concat([
        Buffer.alloc(CHACHA20_NONCE_LENGTH - nonce.length, 0),
        nonce
    ]);
}

export type EncryptedData = {
    readonly ciphertext: Buffer;
    readonly authTag: Buffer;
};
