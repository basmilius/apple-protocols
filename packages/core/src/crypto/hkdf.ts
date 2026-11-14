import { hkdfSync } from 'node:crypto';

/** HKDF key derivation as defined in RFC 5869. */
export function hkdf(options: HKDFOptions): Buffer {
    return Buffer.from(hkdfSync(options.hash, options.key, options.salt, options.info, options.length));
}

/**
 * Configuration options for HKDF key derivation.
 */
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
