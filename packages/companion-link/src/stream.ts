import { randomInt } from 'node:crypto';
import { ConnectionClosedError, type Context, EncryptionAwareConnection, EncryptionState, TimeoutError } from '@basmilius/apple-common';
import { OPack } from '@basmilius/apple-encoding';
import { Chacha20 } from '@basmilius/apple-encryption';
import { FrameType, MessageType, OPackFrameTypes, PairingFrameTypes } from './frame';

const HEADER_SIZE = 4;
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
const PAIRING_QUEUE_IDENTIFIER = -1;
const DEFAULT_EXCHANGE_TIMEOUT = 10000;

type QueueEntry = [resolve: Function, reject: Function, timer: NodeJS.Timeout];

export default class Stream extends EncryptionAwareConnection<Record<string, [unknown]>> {
    get #encryptionState(): EncryptionState {
        return this._encryption;
    }

    readonly #queue: Map<number, QueueEntry> = new Map();
    #buffer: Buffer = Buffer.alloc(0);
    #xid: number;

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.debug(true);

        this.#xid = randomInt(0, 2 ** 16);

        this.on('close', this.#onClose.bind(this));
        this.on('data', this.#onData.bind(this));
        this.on('error', this.#onError.bind(this));
    }

    async disconnect(): Promise<void> {
        this.#cleanup();
        await super.disconnect();
    }

    async exchange(type: number, obj: Record<string, unknown>, timeout: number = DEFAULT_EXCHANGE_TIMEOUT): Promise<[number, unknown]> {
        const _x = this.#xid;
        const isPairing = PairingFrameTypes.includes(type);
        const queueKey = isPairing ? PAIRING_QUEUE_IDENTIFIER : _x;

        return new Promise<[number, unknown]>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#queue.delete(queueKey);
                reject(new TimeoutError(`Exchange timed out for type ${type}`));
            }, timeout);

            this.#queue.set(queueKey, [
                (value: [number, unknown]) => { clearTimeout(timer); resolve(value); },
                (err: Error) => { clearTimeout(timer); reject(err); },
                timer
            ]);

            this.sendOPack(type, obj);
        });
    }

    send(type: number, payload: Buffer): void {
        const encrypt = this.isEncrypted && type !== FrameType.NoOp;
        let payloadLength = payload.byteLength;

        if (encrypt) {
            payloadLength += Chacha20.CHACHA20_AUTH_TAG_LENGTH;
        }

        const header = Buffer.allocUnsafe(4);
        header.writeUint8(type, 0);
        header.writeUintBE(payloadLength, 1, 3);

        let data: Buffer;

        if (encrypt) {
            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(this.#encryptionState.writeCount++), 0);

            const encrypted = Chacha20.encrypt(this.#encryptionState.writeKey, nonce, header, payload);
            data = Buffer.concat([header, encrypted.ciphertext, encrypted.authTag]);
        } else {
            data = Buffer.concat([header, payload]);
        }

        this.context.logger.raw('[companion-link]', 'Sending data frame', this.isEncrypted, type);

        this.write(data);
    }

    sendOPack(type: number, obj: Record<string, unknown>): void {
        const _x = this.#xid++;
        obj._x ??= OPack.sizedInteger(_x, 8);

        this.context.logger.raw('[companion-link]', 'Sending opack frame', type, this.isEncrypted, obj);

        this.send(type, Buffer.from(OPack.encode(obj)));
    }

    #cleanup(): void {
        this.#buffer = Buffer.alloc(0);

        const error = new ConnectionClosedError('Stream cleanup.');

        for (const [, reject, timer] of this.#queue.values()) {
            clearTimeout(timer);
            reject(error);
        }

        this.#queue.clear();
    }

    #onClose(): void {
        this.#cleanup();
    }

    async #onData(data: Buffer): Promise<void> {
        this.#buffer = Buffer.concat([this.#buffer, data]);

        if (this.#buffer.byteLength > MAX_BUFFER_SIZE) {
            this.context.logger.error('[companion-link]', `Buffer exceeded max size (${this.#buffer.byteLength} bytes), resetting connection.`);
            this.#buffer = Buffer.alloc(0);
            this.emit('error', new Error('Buffer overflow: exceeded maximum buffer size'));
            return;
        }

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

                const payload = frame.subarray(HEADER_SIZE);
                this.#handle(header, payload);
            }
        } catch (err) {
            this.context.logger.error('[companion-link]', '#onData()', err);
            this.emit('error', err);
        }
    }

    #onError(err: Error): void {
        for (const [, reject, timer] of this.#queue.values()) {
            clearTimeout(timer);
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

        return Buffer.concat([header, decrypted]);
    }

    #handle(header: Buffer, payload: Buffer): void {
        const type = header.readInt8();

        if (!OPackFrameTypes.includes(type)) {
            this.context.logger.warn('[companion-link]', 'Packet not handled, no opack frame.');
            return;
        }

        payload = OPack.decode(payload);

        this.context.logger.raw('[companion-link]', 'Decoded OPACK', {header, payload});

        // Match responses to pending exchanges by _x.
        // Only match if this is actually a Response (_t: 3), not a server Event (_t: 1)
        // that happens to share the same _x value.
        if ('_x' in payload && payload['_t'] === MessageType.Response) {
            const _x = Number(payload['_x']);

            if (this.#queue.has(_x)) {
                const [resolve] = this.#queue.get(_x)!;
                resolve([header, payload]);
                this.#queue.delete(_x);
                return;
            }
        }

        // Pairing responses have no _x.
        if (this.#queue.has(PAIRING_QUEUE_IDENTIFIER)) {
            const [resolve] = this.#queue.get(PAIRING_QUEUE_IDENTIFIER)!;
            resolve([header, payload]);
            this.#queue.delete(PAIRING_QUEUE_IDENTIFIER);
            return;
        }

        // Everything else is an unsolicited message (event).
        if ('_i' in payload) {
            this.emit(payload['_i'] as string, payload['_c']);
        } else {
            this.context.logger.warn('[companion-link]', 'Unhandled message', payload);
        }
    }
}
