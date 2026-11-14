import { hkdfSync } from 'node:crypto';

/** Configuration options for HKDF key derivation. */
export type HKDFOptions = {
    /** The hash algorithm to use (e.g. 'sha512'). */
    readonly hash: string;
    /** The input key material (e.g. a shared secret from Diffie-Hellman). */
    readonly key: Buffer;
    /** The desired length of the derived key in bytes. */
    readonly length: number;
    /** Optional salt value for the extract step (can be zero-length). */
    readonly salt: Buffer;
    /** Context and application-specific info string for the expand step. */
    readonly info: Buffer;
};

/** HKDF key derivation as defined in RFC 5869. */
export function derive(options: HKDFOptions): Buffer {
    return Buffer.from(hkdfSync(options.hash, options.key, options.salt, options.info, options.length));
}

/**
 * Derives 32-byte read and write keys with HKDF-SHA512. Salt and info strings depend on the protocol and stream.
 *
 * @param sharedSecret - Pair-verify or pair-setup shared secret.
 * @param salt - Protocol-specific salt, such as `Control-Salt`.
 * @param readInfo - Info string for the decrypt key.
 * @param writeInfo - Info string for the encrypt key.
 */
export function deriveEncryptionKeys(sharedSecret: Buffer, salt: string, readInfo: string, writeInfo: string): {readKey: Buffer; writeKey: Buffer} {
    const saltBuffer = Buffer.from(salt);

    const readKey = derive({
        hash: 'sha512',
        key: sharedSecret,
        length: 32,
        salt: saltBuffer,
        info: Buffer.from(readInfo)
    });

    const writeKey = derive({
        hash: 'sha512',
        key: sharedSecret,
        length: 32,
        salt: saltBuffer,
        info: Buffer.from(writeInfo)
    });

    return {readKey, writeKey};
}
