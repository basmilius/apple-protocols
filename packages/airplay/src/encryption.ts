import { type EncryptionState } from '@basmilius/apple-common';
import { Chacha20 } from '@basmilius/apple-encryption';
import { nonce } from './utils';

/**
 * Decrypts AirPlay ChaCha20-Poly1305 encrypted data.
 *
 * The wire format consists of consecutive frames:
 * `[2-byte LE length] [ciphertext (length bytes)] [16-byte auth tag]`
 *
 * Each frame is decrypted with an incrementing nonce counter tracked in the
 * encryption state. The 2-byte length prefix doubles as the AAD for Poly1305
 * authentication.
 *
 * @param state - Shared encryption state containing keys and nonce counters.
 * @param data - Raw encrypted data from the TCP socket.
 * @returns Concatenated plaintext of all frames, or `false` if data is incomplete (partial frame delivery).
 */
export function chacha20Decrypt(state: EncryptionState, data: Buffer): Buffer | false {
    let offset = 0;
    while (offset < data.length) {
        if (offset + 2 > data.length) {
            return false;
        }
        const length = data.readUInt16LE(offset);
        if (length === 0) {
            throw new Error('Invalid encrypted frame length');
        }
        offset += length + 18;
        if (offset > data.length) {
            return false;
        }
    }
    return chacha20DecryptFrames(state, data).data;
}

/** Consumes complete frames once; callers retain only the unconsumed ciphertext tail. */
export function chacha20DecryptFrames(state: EncryptionState, data: Buffer): {data: Buffer; consumed: number} {
    const output: Buffer[] = [];
    let offset = 0;
    // Receive blocks can exceed the 1024-byte chunks we send.
    while (offset + 2 <= data.length) {
        const length = data.readUInt16LE(offset);
        if (length === 0) {
            throw new Error('Invalid encrypted frame length');
        }
        const end = offset + length + 18;
        if (end > data.length) {
            break;
        }
        const plaintext = Chacha20.decrypt(state.readKey, nonce(state.readCount), data.subarray(offset, offset + 2), data.subarray(offset + 2, end - 16), data.subarray(end - 16, end));
        state.readCount++;
        output.push(plaintext);
        offset = end;
    }
    return {data: Buffer.concat(output), consumed: offset};
}

/**
 * Encrypts data using AirPlay's ChaCha20-Poly1305 frame format.
 *
 * Splits the input into 1024-byte frames (last frame may be smaller).
 * Each frame is encrypted and output as:
 * `[2-byte LE length] [ciphertext] [16-byte auth tag]`
 *
 * The 2-byte length prefix is used as the AAD for Poly1305 authentication,
 * matching the decrypt side.
 *
 * @param state - Shared encryption state containing keys and nonce counters.
 * @param data - Plaintext data to encrypt.
 * @returns Encrypted buffer with all frames concatenated, ready for transmission.
 */
export function chacha20Encrypt(state: EncryptionState, data: Buffer): Buffer {
    const FRAME_LENGTH = 1024;
    const result: Buffer[] = [];

    for (let offset = 0; offset < data.length;) {
        const frame = data.subarray(offset, offset + FRAME_LENGTH);
        offset += frame.length;

        const leLength = Buffer.allocUnsafe(2);
        leLength.writeUInt16LE(frame.length, 0);

        const encrypted = Chacha20.encrypt(
            state.writeKey,
            nonce(state.writeCount++),
            leLength,
            frame
        );

        result.push(leLength, encrypted.ciphertext, encrypted.authTag);
    }

    return Buffer.concat(result);
}
