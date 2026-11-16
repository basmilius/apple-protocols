import { ChaCha20 } from '@apple-protocols/core/crypto';
import { buildNonce, type EncryptionState } from '@apple-protocols/core/transport';

/** Frames we send carry at most this much plaintext. */
const FRAME_LENGTH = 1024;

function nonce(counter: number): Buffer {
    return buildNonce(counter, 'counter-at-4');
}

/**
 * Decrypts the complete frames at the start of `data`: `[2-byte LE length] [ciphertext] [16-byte
 * auth tag]`, where the length is the AAD. Callers keep the unconsumed ciphertext tail for the
 * next read.
 *
 * @throws If a frame has length zero, or a frame fails authentication.
 */
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

        const plaintext = ChaCha20.decrypt(state.readKey, nonce(state.readCount), data.subarray(offset, offset + 2), data.subarray(offset + 2, end - 16), data.subarray(end - 16, end));
        state.readCount++;
        output.push(plaintext);
        offset = end;
    }

    return {data: Buffer.concat(output), consumed: offset};
}

/** Encrypts `data` in frames of at most 1024 bytes, each with its 2-byte LE length as AAD. */
export function chacha20Encrypt(state: EncryptionState, data: Buffer): Buffer {
    const result: Buffer[] = [];

    for (let offset = 0; offset < data.length;) {
        const frame = data.subarray(offset, offset + FRAME_LENGTH);
        offset += frame.length;

        const leLength = Buffer.allocUnsafe(2);
        leLength.writeUInt16LE(frame.length, 0);

        const encrypted = ChaCha20.encrypt(state.writeKey, nonce(state.writeCount++), leLength, frame);

        result.push(leLength, encrypted.ciphertext, encrypted.authTag);
    }

    return Buffer.concat(result);
}
