import type { Context } from '@basmilius/apple-common';
import { Plist, RTSP } from '@basmilius/apple-encoding';
import { hkdf } from '@basmilius/apple-encryption';
import BaseStream from './baseStream';

export default class EventStream extends BaseStream {
    #buffer: Buffer = Buffer.alloc(0);

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.on('close', this.#onClose.bind(this));
        this.on('data', this.#onData.bind(this));
    }

    async disconnect(): Promise<void> {
        this.#cleanup();
        await super.disconnect();
    }

    async respond(response: Response): Promise<void> {
        const body = Buffer.from(await response.arrayBuffer());

        const header = [];
        header.push(`RTSP/1.0 ${response.status} ${response.statusText}`);

        for (const [name, value] of Object.entries(response.headers)) {
            header.push(`${name}: ${value}`);
        }

        if (body.byteLength > 0) {
            header.push(`Content-Length: ${body.byteLength}`);
        } else {
            header.push('Content-Length: 0');
        }

        header.push('');
        header.push('');

        const headers = header.join('\r\n');
        let data: Buffer;

        if (response.body) {
            data = Buffer.concat([
                Buffer.from(headers),
                body
            ]);
        } else {
            data = Buffer.from(headers);
        }

        if (this.isEncrypted) {
            data = this.encrypt(data);
        }

        await this.write(data);
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
    }

    async #handle(method: RTSP.Method, path: string, headers: HeadersInit, body: Buffer): Promise<void> {
        const key = `${method} ${path}`;

        switch (key) {
            case 'POST /command':
                const data = Plist.parse(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as any) as any;

                this.context.logger.info('[event]', 'Received event stream request.', data);

                const response = new Response(null, {
                    status: 200,
                    statusText: 'OK',
                    headers: {
                        'Audio-Latency': '0',
                        'CSeq': (headers['CSeq'] ?? 0).toString()
                    }
                });

                await this.respond(response);
                break;

            default:
                this.context.logger.warn('[event]', 'No handler for url', key);
                break;
        }
    }

    #onClose(): void {
        this.#cleanup();
    }

    async #onData(data: Buffer): Promise<void> {
        try {
            this.#buffer = Buffer.concat([this.#buffer, data]);

            if (this.isEncrypted) {
                const decrypted = this.decrypt(this.#buffer);

                if (!decrypted) {
                    return;
                }

                this.#buffer = decrypted;
            }

            while (this.#buffer.byteLength > 0) {
                const result = RTSP.makeRequest(this.#buffer);

                if (result === null) {
                    return;
                }

                this.#buffer = this.#buffer.subarray(result.requestLength);
                await this.#handle(result.method, result.path, result.headers, result.body);
            }
        } catch (err) {
            this.context.logger.error('[event]', '#onData()', err);
            this.emit('error', err);
        }
    }
}
