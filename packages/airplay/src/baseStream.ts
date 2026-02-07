import { ENCRYPTION, EncryptionAwareConnection, type EncryptionState, type EventMap } from '@basmilius/apple-common';
import { Chacha20 } from '@basmilius/apple-encryption';
import { nonce } from './utils';

type DefaultEventMap = {
    close: [];
    connect: [];
    error: [Error];
    timeout: [];
};

export default class BaseStream<TEventMap extends EventMap = {}> extends EncryptionAwareConnection<DefaultEventMap & TEventMap> {
    get #encryptionState(): EncryptionState {
        return this[ENCRYPTION];
    }

    decrypt(data: Buffer): Buffer | false {
        const result: Buffer[] = [];
        let offset = 0;
        let readCount = this.#encryptionState.readCount ?? 0;

        while (offset < data.length) {
            if (offset + 2 > data.length) {
                this.context.logger.warn('Expected frame length to be within buffer bounds.');
                return false;
            }

            const frameLength = data.readUInt16LE(offset);
            offset += 2;

            const end = offset + frameLength + 16;

            if (end > data.length) {
                this.context.logger.warn(`Truncated frame end=${end} length=${data.length}`);
                return false;
            }

            const ciphertext = data.subarray(offset, offset + frameLength);
            const authTag = data.subarray(offset + frameLength, end);
            offset = end;

            const plaintext = Chacha20.decrypt(
                this.#encryptionState.readKey,
                nonce(readCount++),
                Buffer.from(Uint16Array.of(frameLength).buffer.slice(0, 2)), // same AAD = leLength
                ciphertext,
                authTag
            );

            result.push(plaintext);
        }

        this.#encryptionState.readCount = readCount;

        return Buffer.concat(result);
    }

    encrypt(data: Buffer): Buffer {
        const FRAME_LENGTH = 1024;
        const result: Buffer[] = [];

        for (let offset = 0; offset < data.length;) {
            const frame = data.subarray(offset, offset + FRAME_LENGTH);
            offset += frame.length;

            const leLength = Buffer.allocUnsafe(2);
            leLength.writeUInt16LE(frame.length, 0);

            const encrypted = Chacha20.encrypt(
                this.#encryptionState.writeKey,
                nonce(this.#encryptionState.writeCount++),
                leLength,
                frame
            );

            result.push(leLength, encrypted.ciphertext, encrypted.authTag);
        }

        return Buffer.concat(result);
    }
}
