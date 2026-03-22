import { type EncryptionState } from '@basmilius/apple-common';
import { Chacha20 } from '@basmilius/apple-encryption';
import { nonce } from './utils';

export function chacha20Decrypt(state: EncryptionState, data: Buffer): Buffer | false {
    const result: Buffer[] = [];
    let offset = 0;
    let readCount = state.readCount ?? 0;

    while (offset < data.length) {
        if (offset + 2 > data.length) {
            return false;
        }

        const frameLength = data.readUInt16LE(offset);
        offset += 2;

        if (frameLength === 0 || frameLength > 65535) {
            return false;
        }

        const end = offset + frameLength + 16;

        if (end > data.length) {
            return false;
        }

        const ciphertext = data.subarray(offset, offset + frameLength);
        const authTag = data.subarray(offset + frameLength, end);
        offset = end;

        const plaintext = Chacha20.decrypt(
            state.readKey,
            nonce(readCount++),
            Buffer.from(Uint16Array.of(frameLength).buffer.slice(0, 2)),
            ciphertext,
            authTag
        );

        result.push(plaintext);
    }

    state.readCount = readCount;

    return Buffer.concat(result);
}

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
