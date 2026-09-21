import { createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * AES-128-CTR fallback for legacy HAP pairing. It has no authentication tag; the pairing flow relies on Ed25519 signatures in the TLV payload.
 *
 * @param key - 16-byte AES key.
 * @param iv - 16-byte initialization vector.
 */
export function encrypt(key: Buffer, iv: Buffer, plaintext: Buffer): Buffer {
    const cipher = createCipheriv('aes-128-ctr', key, iv);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

/**
 * Decrypts data using AES-128-CTR.
 *
 * @param key - 16-byte AES key.
 * @param iv - 16-byte initialization vector.
 */
export function decrypt(key: Buffer, iv: Buffer, ciphertext: Buffer): Buffer {
    const decipher = createDecipheriv('aes-128-ctr', key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
