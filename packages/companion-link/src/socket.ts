import { randomInt } from 'node:crypto';
import { Chacha20, ENCRYPTION, EncryptionAwareConnection, reporter } from '@basmilius/apple-common';
import { OPack } from '@basmilius/apple-encoding';
import { OPackFrameTypes, PairFrameTypes } from './messages';

const HEADER_BYTES = 4;

export default class CompanionLinkSocket extends EncryptionAwareConnection<Record<string, [unknown]>> {
    get #encryption() {
        return this[ENCRYPTION];
    }

    readonly #queue: Record<number, Function> = {};
    #buffer: Buffer = Buffer.alloc(0);
    #xid: number;

    constructor(address: string, port: number) {
        super(address, port);

        this.#xid = randomInt(0, 2 ** 16);

        this.onData = this.onData.bind(this);
        this.on('data', this.onData);
    }

    async exchange(type: number, obj: Record<string, unknown>): Promise<[number, unknown]> {
        const _x = this.#xid;

        return new Promise<[number, number]>((resolve, reject) => {
            if (PairFrameTypes.includes(type)) {
                this.#queue[-1] = resolve;
            } else {
                this.#queue[_x] = resolve;
            }

            this.send(type, obj).catch(reject);
        });
    }

    async send(type: number, obj: Record<string, unknown>): Promise<void> {
        const _x = this.#xid++;
        obj._x ??= OPack.sizedInt(_x, 8);

        let payload = Buffer.from(OPack.encode(obj));
        let payloadLength = payload.byteLength;

        if (this.isEncrypted && payloadLength > 0) {
            payloadLength += Chacha20.CHACHA20_AUTH_TAG_LENGTH;
        }

        const header = Buffer.allocUnsafe(4);
        header.writeUint8(type, 0);
        header.writeUintBE(payloadLength, 1, 3);

        let data: Buffer;

        if (this.isEncrypted) {
            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(this.#encryption.writeCount++), 0);

            const encrypted = Chacha20.encrypt(this.#encryption.writeKey, nonce, header, payload);
            data = Buffer.concat([header, encrypted.ciphertext, encrypted.authTag]);
        } else {
            data = Buffer.concat([header, payload]);
        }

        reporter.raw('Sending data frame...', this.isEncrypted, Buffer.from(data).toString('hex'), obj);

        return await this.write(data);
    }

    async onData(buffer: Buffer): Promise<void> {
        reporter.raw('Received data frame', buffer.toString('hex'));

        this.#buffer = Buffer.concat([this.#buffer, buffer]);

        while (this.#buffer.byteLength >= HEADER_BYTES) {
            const header = this.#buffer.subarray(0, HEADER_BYTES);
            const payloadLength = header.readUintBE(1, 3);
            const totalLength = HEADER_BYTES + payloadLength;

            if (this.#buffer.byteLength < totalLength) {
                reporter.warn(`Not enough data yet, waiting on the next frame.. needed=${totalLength} available=${this.#buffer.byteLength} receivedLength=${buffer.byteLength}`);
                return;
            }

            reporter.raw(`Frame found length=${totalLength} availableLength=${this.#buffer.byteLength} receivedLength=${buffer.byteLength}`);

            const frame = Buffer.from(this.#buffer.subarray(0, totalLength));
            this.#buffer = this.#buffer.subarray(totalLength);

            reporter.raw(`Handle frame, ${this.#buffer.byteLength} bytes left...`);

            const data = await this.#decrypt(frame);
            let payload = data.subarray(4, totalLength);

            await this.#handle(header, payload);
        }
    }

    async #decrypt(data: Buffer): Promise<Buffer> {
        if (!this.isEncrypted) {
            return data;
        }

        const header = data.subarray(0, 4);
        const payloadLength = header.readUintBE(1, 3);

        const payload = data.subarray(4, 4 + payloadLength);
        const authTag = payload.subarray(payload.byteLength - 16);
        const ciphertext = payload.subarray(0, payload.byteLength - 16);

        const nonce = Buffer.alloc(12);
        nonce.writeBigUint64LE(BigInt(this.#encryption.readCount++), 0);

        const decrypted = Chacha20.decrypt(this.#encryption.readKey, nonce, header, ciphertext, authTag);

        return Buffer.concat([header, decrypted, authTag]);
    }

    async #handle(header: Buffer, payload: Buffer): Promise<void> {
        const type = header.readInt8();

        if (!OPackFrameTypes.includes(type)) {
            reporter.warn('Packet not handled, no opack frame.');
            return;
        }

        payload = OPack.decode(payload);

        reporter.raw('Decoded OPACK', {header, payload});

        if ('_x' in payload) {
            const _x = (payload as any)._x;

            if (_x in this.#queue) {
                const resolve = this.#queue[_x] ?? null;
                resolve?.([header, payload]);

                delete this.#queue[_x];
            } else if ('_i' in payload) {
                this.emit(payload['_i'] as string, payload['_c']);
            } else {
                // probably an event
                const content = payload['_c'];
                const keys = Object.keys(content).map(k => k.substring(0, -3));

                for (const key of keys) {
                    this.emit(key, content[key]);
                }
            }
        } else if (this.#queue[-1]) {
            const _x = -1;
            const resolve = this.#queue[_x] ?? null;
            resolve?.([header, payload]);

            delete this.#queue[_x];
        } else {
            reporter.warn('No handler for message', [header, payload]);
        }
    }
}
