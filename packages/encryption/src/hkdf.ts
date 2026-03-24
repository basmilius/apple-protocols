import { hkdfSync } from 'node:crypto';

/**
 * Derives a cryptographic key using HKDF (HMAC-based Key Derivation Function)
 * as defined in RFC 5869. Used throughout the protocol stack to derive
 * encryption and authentication keys from shared secrets.
 *
 * @param options - The HKDF parameters including hash algorithm, input key material, salt, info, and desired output length.
 * @returns The derived key material as a Buffer.
 */
export default function (options: HKDFOptions): Buffer {
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
