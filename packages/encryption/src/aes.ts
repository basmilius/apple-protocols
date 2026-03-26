import { createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * Encrypts data using AES-128-CTR.
 *
 * Used as a fallback encryption mode for HAP pair-setup/pair-verify when the
 * accessory does not support ChaCha20-Poly1305. AES-CTR has no authentication
 * tag — integrity is ensured by the Ed25519 signature in the TLV payload.
 *
 * @param key - 16-byte AES key.
 * @param iv - 16-byte initialization vector.
 * @param plaintext - The data to encrypt.
 * @returns The encrypted ciphertext.
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
 * @param ciphertext - The data to decrypt.
 * @returns The decrypted plaintext.
 */
export function decrypt(key: Buffer, iv: Buffer, ciphertext: Buffer): Buffer {
    const decipher = createDecipheriv('aes-128-ctr', key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
