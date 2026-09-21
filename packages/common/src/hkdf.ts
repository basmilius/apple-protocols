import { hkdf } from '@basmilius/apple-encryption';

/**
 * Derives 32-byte read and write keys with HKDF-SHA512. Salt and info strings depend on the protocol and stream.
 *
 * @param sharedSecret - Pair-verify or pair-setup shared secret.
 * @param salt - Protocol-specific salt, such as `Control-Salt`.
 * @param readInfo - Info string for the decrypt key.
 * @param writeInfo - Info string for the encrypt key.
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
