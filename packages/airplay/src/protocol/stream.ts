import { Socket } from 'node:net';
import { BaseSocket, debug, decryptChacha20, encryptChacha20 } from '@basmilius/apple-common';

export default class AirPlayStream<TEventMap extends Record<string, any>> extends BaseSocket<TEventMap> {
    get isConnected(): boolean {
        return this.#socket.readyState === 'open';
    }

    get isEncrypted(): boolean {
        return !!this.#readKey && !!this.#writeKey;
    }

    get socket(): Socket {
        return this.#socket;
    }

    get readKey(): Buffer {
        return this.#readKey;
    }

    get writeKey(): Buffer {
        return this.#writeKey;
    }

    readonly #socket: Socket;
    #buffer: Buffer = Buffer.alloc(0);
    #readCount: number;
    #readKey?: Buffer;
    #writeCount: number;
    #writeKey?: Buffer;

    constructor(address: string, port: number) {
        super(address, port);

        this.onClose = this.onClose.bind(this);
        this.onConnect = this.onConnect.bind(this);
        this.onData = this.onData.bind(this);
        this.onEnd = this.onEnd.bind(this);
        this.onError = this.onError.bind(this);

        this.#socket = new Socket();
        this.#socket.on('close', this.onClose);
        this.#socket.on('connect', this.onConnect);
        this.#socket.on('data', this.onData);
        this.#socket.on('end', this.onEnd);
        this.#socket.on('error', this.onError);
    }

    async connect(): Promise<void> {
        debug(`Connecting to ${this.address}:${this.port}...`);

        return await new Promise(resolve => {
            this.#socket.connect({
                host: this.address,
                port: this.port,
                keepAlive: true
            }, resolve);
        });
    }

    async disconnect(): Promise<void> {
        this.#socket.destroy();
    }

    async enableEncryption(readKey: Buffer, writeKey: Buffer): Promise<void> {
        this.#readKey = readKey;
        this.#writeKey = writeKey;
        this.#readCount = 0;
        this.#writeCount = 0;
    }

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
            nonce.writeBigUInt64LE(BigInt(this.#readCount++), 4);

            const plaintext = decryptChacha20(
                this.#readKey,
                nonce,
                aad,
                ciphertext,
                authTag
            );

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
            nonce.writeBigUInt64LE(BigInt(this.#writeCount++), 4);

            const encrypted = encryptChacha20(
                this.#writeKey,
                nonce,
                leLength,
                data.subarray(offset, offset + length)
            );

            offset += length;
            result = Buffer.concat([result, leLength, encrypted.ciphertext, encrypted.authTag]);
        }

        return result;
    }

    async onClose(): Promise<void> {
        await super.onClose();

        debug(`Connection closed from ${this.address}:${this.port}`);
    }

    async onConnect(): Promise<void> {
        await super.onConnect();

        debug(`Connected to ${this.address}:${this.port}`);
    }

    async onData(buffer: Buffer): Promise<void> {
        debug('Data frame received', buffer.toString());
    }

    async onEnd(): Promise<void> {
        debug('Connection ended');
    }

    async onError(err: Error): Promise<void> {
        await super.onError(err);

        debug('Error received', err);
    }
}
