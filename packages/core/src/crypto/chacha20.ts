import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305';
import { DecryptionError } from '../errors';

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

/** Left-pads a nonce with zero bytes to 12 bytes. A nonce of 12 bytes or more comes back unchanged. */
export function padNonce(nonce: Buffer): Buffer {
    if (nonce.length >= CHACHA20_NONCE_LENGTH) {
        return nonce;
    }

    return Buffer.concat([
        Buffer.alloc(CHACHA20_NONCE_LENGTH - nonce.length, 0),
        nonce
    ]);
}

/** Output of {@link encrypt}, with the authentication tag split from the ciphertext. */
export type EncryptedData = {
    readonly ciphertext: Buffer;

    /** The 16-byte Poly1305 tag. */
    readonly authTag: Buffer;
};
