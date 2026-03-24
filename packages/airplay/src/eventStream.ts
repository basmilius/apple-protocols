import type { Context } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { hkdf } from '@basmilius/apple-encryption';
import { buildResponse, type Method, parseRequest } from '@basmilius/apple-rtsp';
import BaseStream from './baseStream';

export default class EventStream extends BaseStream {
    #buffer: Buffer = Buffer.alloc(0);
    #encryptedBuffer: Buffer = Buffer.alloc(0);

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.onStreamClose = this.onStreamClose.bind(this);
        this.onStreamData = this.onStreamData.bind(this);
        this.onStreamError = this.onStreamError.bind(this);

        this.on('close', this.onStreamClose);
        this.on('data', this.onStreamData);
        this.on('error', this.onStreamError);
    }

    async disconnect(): Promise<void> {
        this.#cleanup();
        await super.disconnect();
    }

    respond(status: number, statusText: string, headers?: Record<string, string | number>, body?: Buffer): void {
        let data = buildResponse({status, statusText, headers, body});

        if (this.isEncrypted) {
            data = this.encrypt(data);
        }

        this.write(data);
    }

    setup(sharedSecret: Buffer): void {
        const readKey = hkdf({
            hash: 'sha512',
            key: sharedSecret,
            length: 32,
            salt: Buffer.from('Events-Salt'),
            info: Buffer.from('Events-Read-Encryption-Key')
        });

        const writeKey = hkdf({
            hash: 'sha512',
            key: sharedSecret,
            length: 32,
            salt: Buffer.from('Events-Salt'),
            info: Buffer.from('Events-Write-Encryption-Key')
        });

        this.enableEncryption(writeKey, readKey);
    }

    #cleanup(): void {
        this.#buffer = Buffer.alloc(0);
        this.#encryptedBuffer = Buffer.alloc(0);
    }

    async #handle(method: Method, path: string, headers: Record<string, string>, body: Buffer): Promise<void> {
        const key = `${method} ${path}`;

        switch (key) {
            case 'POST /command':
                const data = Plist.parse(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as any) as any;

                this.context.logger.info('[event]', 'Received event stream request.', data);

                this.respond(200, 'OK', {
                    'Audio-Latency': 0,
                    'CSeq': headers['CSeq'] ?? 0
                });
                break;

            default:
                this.context.logger.warn('[event]', 'No handler for url', key);
                break;
        }
    }

    onStreamClose(): void {
        this.#cleanup();
    }

    onStreamError(err: Error): void {
        this.context.logger.error('[event]', 'onStreamError()', err);
    }

    async onStreamData(data: Buffer): Promise<void> {
        try {
            if (this.isEncrypted) {
                this.#encryptedBuffer = Buffer.concat([this.#encryptedBuffer, data]);

                const decrypted = this.decrypt(this.#encryptedBuffer);

                if (!decrypted) {
                    return;
                }

                this.#encryptedBuffer = Buffer.alloc(0);
                this.#buffer = Buffer.concat([this.#buffer, decrypted]);
            } else {
                this.#buffer = Buffer.concat([this.#buffer, data]);
            }

            while (this.#buffer.byteLength > 0) {
                const result = parseRequest(this.#buffer);

                if (result === null) {
                    return;
                }

                this.#buffer = this.#buffer.subarray(result.requestLength);
                await this.#handle(result.method, result.path, result.headers, result.body);
            }
        } catch (err) {
            this.context.logger.error('[event]', 'onStreamData()', err);
            this.emit('error', err);
        }
    }
}
