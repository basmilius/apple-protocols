import { Chacha20, ENCRYPTION, EncryptionAwareConnection, EncryptionState } from '@basmilius/apple-common';

type EventMap = {
    close: [];
    connect: [];
    error: [Error];
    timeout: [];
};

export default class AirPlayStream<TEventMap extends Record<string, any>> extends EncryptionAwareConnection<EventMap & TEventMap> {
    get #encryption(): EncryptionState {
        return this[ENCRYPTION];
    }

    #buffer: Buffer = Buffer.alloc(0);

    async decrypt(data: Buffer): Promise<Buffer> {
        if (this.#buffer) {
            data = Buffer.concat([this.#buffer, data]);
            this.#buffer = undefined;
        }

        let result = Buffer.alloc(0);
        let offset = 0;

        while (offset + 2 <= data.length) {
            const length = data.readUInt16LE(offset);

            const totalChunkLength = 2 + length + 16;

            if (offset + totalChunkLength > data.length) {
                this.#buffer = data.subarray(offset);
                break;
            }

            const aad = data.subarray(offset, offset + 2);
            const ciphertext = data.subarray(offset + 2, offset + 2 + length);
            const authTag = data.subarray(offset + 2 + length, offset + 2 + length + 16);

            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(this.#encryption.readCount++), 4);

            const plaintext = Chacha20.decrypt(this.#encryption.readKey, nonce, aad, ciphertext, authTag);

            result = Buffer.concat([result, plaintext]);
            offset += totalChunkLength;
        }

        return result;
    }

    async encrypt(data: Buffer): Promise<Buffer> {
        const total = data.length;
        let result = Buffer.alloc(0);

        for (let offset = 0; offset < total;) {
            const length = Math.min(total - offset, 0x400);
            const leLength = Buffer.alloc(2);
            leLength.writeUInt16LE(length, 0);

            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(this.#encryption.writeCount++), 4);

            const encrypted = Chacha20.encrypt(this.#encryption.writeKey, nonce, leLength, data.subarray(offset, offset + length));

            offset += length;
            result = Buffer.concat([result, leLength, encrypted.ciphertext, encrypted.authTag]);
        }

        return result;
    }
}
