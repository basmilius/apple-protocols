import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305';

/**
 * Error thrown when ChaCha20-Poly1305 decryption fails due to an
 * authentication tag mismatch, indicating the ciphertext was tampered
 * with or the wrong key/nonce was used.
 */
export class DecryptionError extends Error {
    constructor(message: string = 'Decryption failed: authentication tag mismatch') {
        super(message);
        this.name = 'DecryptionError';
    }
}

/** Length in bytes of the Poly1305 authentication tag appended to ciphertext. */
export const CHACHA20_AUTH_TAG_LENGTH = 16;

/** Required nonce length in bytes for ChaCha20-Poly1305. Shorter nonces are zero-padded. */
export const CHACHA20_NONCE_LENGTH = 12;

/**
 * Decrypts a ChaCha20-Poly1305 sealed message and verifies its authentication tag.
 *
 * @param key - 256-bit encryption key.
 * @param nonce - Nonce (up to 12 bytes; shorter nonces are left-padded with zeros).
 * @param aad - Additional authenticated data, or null if none.
 * @param ciphertext - The encrypted payload (without the auth tag).
 * @param authTag - The 16-byte Poly1305 authentication tag.
 * @returns The decrypted plaintext.
 * @throws DecryptionError if the authentication tag does not match.
 */
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

/**
 * Encrypts a plaintext message using ChaCha20-Poly1305 authenticated encryption.
 *
 * @param key - 256-bit encryption key.
 * @param nonce - Nonce (up to 12 bytes; shorter nonces are left-padded with zeros).
 * @param aad - Additional authenticated data, or null if none.
 * @param plaintext - The data to encrypt.
 * @returns The ciphertext and its Poly1305 authentication tag.
 */
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

/**
 * Pads a nonce to the required 12-byte length by prepending zero bytes.
 * If the nonce is already 12 bytes or longer, it is returned unchanged.
 *
 * @param nonce - The nonce to pad.
 * @returns A nonce buffer of at least 12 bytes.
 */
export function padNonce(nonce: Buffer): Buffer {
    if (nonce.length >= CHACHA20_NONCE_LENGTH) {
        return nonce;
    }

    return Buffer.concat([
        Buffer.alloc(CHACHA20_NONCE_LENGTH - nonce.length, 0),
        nonce
    ]);
}

/**
 * Result of a ChaCha20-Poly1305 encryption operation containing
 * the ciphertext and its authentication tag as separate buffers.
 */
export type EncryptedData = {
    /** The encrypted payload. */
    readonly ciphertext: Buffer;
    /** The 16-byte Poly1305 authentication tag for integrity verification. */
    readonly authTag: Buffer;
};
