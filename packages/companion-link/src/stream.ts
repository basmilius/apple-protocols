import { randomInt } from 'node:crypto';
import { type Context, ENCRYPTION, EncryptionAwareConnection, EncryptionState } from '@basmilius/apple-common';
import { OPack } from '@basmilius/apple-encoding';
import { Chacha20 } from '@basmilius/apple-encryption';
import { OPackFrameTypes, PairFrameTypes } from './frame';

const HEADER_SIZE = 4;
const PAIRING_QUEUE_IDENTIFIER = -1;
const MAX_BUFFER_SIZE = 1024 * 1024 * 5; // 5 MB max buffer size

export default class Stream extends EncryptionAwareConnection<Record<string, [unknown]>> {
    get #encryptionState(): EncryptionState {
        return this[ENCRYPTION];
    }

    readonly #queue: Map<number, [Function, Function]> = new Map();
    #buffer: Buffer = Buffer.alloc(0);
    #xid: number;

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#xid = randomInt(0, 2 ** 16);

        this.on('close', this.#onClose.bind(this));
        this.on('data', this.#onData.bind(this));
        this.on('error', this.#onError.bind(this));
    }

    async exchange(type: number, obj: Record<string, unknown>): Promise<[number, unknown]> {
        const _x = this.#xid;

        return new Promise<[number, number]>((resolve, reject) => {
            if (PairFrameTypes.includes(type)) {
                this.#queue.set(PAIRING_QUEUE_IDENTIFIER, [resolve, reject]);
            } else {
                this.#queue.set(_x, [resolve, reject]);
            }

            this.send(type, obj).catch(reject);
        });
    }

    async send(type: number, obj: Record<string, unknown>): Promise<void> {
        const _x = this.#xid++;
        obj._x ??= OPack.sizedInteger(_x, 8);

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
            nonce.writeBigUInt64LE(BigInt(this.#encryptionState.writeCount++), 0);

            const encrypted = Chacha20.encrypt(this.#encryptionState.writeKey, nonce, header, payload);
            data = Buffer.concat([header, encrypted.ciphertext, encrypted.authTag]);
        } else {
            data = Buffer.concat([header, payload]);
        }

        this.context.logger.raw('[companion-link]', 'Sending data frame', this.isEncrypted, Buffer.from(data).toString('hex'), obj);

        try {
            return await this.write(data);
        } catch (err) {
            this.context.logger.error('[companion-link]', 'Error in Companion Link send()', err);
            this.emit('error', err);
        }
    }

    #onClose(): void {
        const error = new Error('Connection closed while waiting for response');

        for (const [, reject] of this.#queue.values()) {
            reject(error);
        }

        this.#queue.clear();
    }

    async #onData(data: Buffer): Promise<void> {
        // Check for potential buffer overflow before concatenation
        if (this.#buffer.byteLength + data.byteLength > MAX_BUFFER_SIZE) {
            const error = new Error(`Buffer size exceeded maximum limit of ${MAX_BUFFER_SIZE} bytes`);
            this.context.logger.error('[companion-link]', 'Buffer overflow detected', error);
            this.emit('error', error);
            return;
        }

        this.#buffer = Buffer.concat([this.#buffer, data]);

        try {
            while (this.#buffer.byteLength >= HEADER_SIZE) {
                const header = this.#buffer.subarray(0, HEADER_SIZE);
                const payloadLength = header.readUintBE(1, 3);
                const totalLength = HEADER_SIZE + payloadLength;

                if (this.#buffer.byteLength < totalLength) {
                    this.context.logger.warn('[companion-link]', `Data packet is too short needed=${totalLength} available=${this.#buffer.byteLength} receivedLength=${data.byteLength}`);
                    return;
                }

                this.context.logger.raw('[companion-link]', `Received frame length=${totalLength} availableLength=${this.#buffer.byteLength} receivedLength=${data.byteLength}`);

                let frame: Buffer = Buffer.from(this.#buffer.subarray(0, totalLength));
                this.#buffer = this.#buffer.subarray(totalLength);

                this.context.logger.raw('[companion-link]', `Handle frame, ${this.#buffer.byteLength} bytes left...`);

                if (this.isEncrypted) {
                    frame = this.#decrypt(frame);
                }

                const payload = frame.subarray(HEADER_SIZE, totalLength);
                this.#handle(header, payload);
            }
        } catch (err) {
            this.context.logger.error('[companion-link]', '#onData()', err);
            this.emit('error', err);
        }
    }

    #onError(err: Error): void {
        for (const [, reject] of this.#queue.values()) {
            reject(err);
        }

        this.#queue.clear();
    }

    #decrypt(data: Buffer): Buffer {
        const header = data.subarray(0, 4);
        const payloadLength = header.readUintBE(1, 3);

        const payload = data.subarray(4, 4 + payloadLength);
        const authTag = payload.subarray(payload.byteLength - 16);
        const ciphertext = payload.subarray(0, payload.byteLength - 16);

        const nonce = Buffer.alloc(12);
        nonce.writeBigUint64LE(BigInt(this.#encryptionState.readCount++), 0);

        const decrypted = Chacha20.decrypt(this.#encryptionState.readKey, nonce, header, ciphertext, authTag);

        return Buffer.concat([header, decrypted, authTag]);
    }

    #handle(header: Buffer, payload: Buffer): void {
        const type = header.readInt8();

        if (!OPackFrameTypes.includes(type)) {
            this.context.logger.warn('[companion-link]', 'Packet not handled, no opack frame.');
            return;
        }

        payload = OPack.decode(payload);

        this.context.logger.raw('[companion-link]', 'Decoded OPACK', {header, payload});

        if ('_x' in payload) {
            const _x = Number(payload['_x']);

            if (this.#queue.has(_x)) {
                const [resolve] = this.#queue.get(_x);
                resolve([header, payload]);

                this.#queue.delete(_x);
            } else if ('_i' in payload) {
                this.emit(payload['_i'] as string, payload['_c']);
            } else {
                // probably an event
                const content = payload['_c'];
                const keys = Object.keys(content).map(k => k.slice(0, -3));

                for (const key of keys) {
                    this.emit(key, content[key]);
                }
            }
        } else if (this.#queue.has(PAIRING_QUEUE_IDENTIFIER)) {
            const [resolve] = this.#queue.get(PAIRING_QUEUE_IDENTIFIER);
            resolve([header, payload]);

            this.#queue.delete(PAIRING_QUEUE_IDENTIFIER);
        } else {
            this.context.logger.warn('[companion-link]', 'No handler for message', [header, payload]);
        }
    }
}
