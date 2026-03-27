import { hkdf } from '@basmilius/apple-encryption';

/**
 * Derives a pair of ChaCha20 encryption keys (read + write) from a shared secret
 * using HKDF-SHA512 with direction-specific info strings.
 *
 * This is a shared helper used across AirPlay, Companion Link, and RAOP pairing
 * flows to eliminate repeated HKDF boilerplate. The salt and info strings vary
 * per protocol and stream type.
 *
 * @param sharedSecret - The shared secret from a pair-verify or pair-setup flow.
 * @param salt - HKDF salt string (protocol-specific, e.g. 'Control-Salt').
 * @param readInfo - HKDF info string for the read (decrypt) key.
 * @param writeInfo - HKDF info string for the write (encrypt) key.
 * @returns An object with `readKey` and `writeKey` as 32-byte Buffers.
 */
export function deriveEncryptionKeys(sharedSecret: Buffer, salt: string, readInfo: string, writeInfo: string): { readKey: Buffer; writeKey: Buffer } {
    const saltBuffer = Buffer.from(salt);

    const readKey = hkdf({
        hash: 'sha512',
        key: sharedSecret,
        length: 32,
        salt: saltBuffer,
        info: Buffer.from(readInfo)
    });

    const writeKey = hkdf({
        hash: 'sha512',
        key: sharedSecret,
        length: 32,
        salt: saltBuffer,
        info: Buffer.from(writeInfo)
    });

    return {readKey, writeKey};
}
