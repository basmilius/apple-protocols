import { hkdf, reporter } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import type { RTSPMethod } from './types';
import { makeHttpRequest } from './utils';
import Stream from './stream';

export default class AirPlayEventStream extends Stream<never> {
    #buffer: Buffer = Buffer.alloc(0);

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
            data = await this.encrypt(data);
        }

        this.socket.write(data);
    }

    async setup(sharedSecret: Buffer): Promise<void> {
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

        await this.enableEncryption(writeKey, readKey);
    }

    async onData(buffer: Buffer): Promise<void> {
        this.#buffer = Buffer.concat([this.#buffer, buffer]);

        if (this.isEncrypted) {
            this.#buffer = await this.decrypt(this.#buffer);
        }

        // reporter.raw('Event stream received data', this.#buffer.toString());

        while (this.#buffer.byteLength > 0) {
            const result = makeHttpRequest(this.#buffer);

            if (result === null) {
                return;
            }

            this.#buffer = this.#buffer.subarray(result.requestLength);

            await this.#handle(result.method, result.path, result.headers, result.body);
        }
    }

    async #handle(method: RTSPMethod, path: string, headers: Record<string, string>, body: Buffer): Promise<void> {
        const key = `${method} ${path}`;

        switch (key) {
            case 'POST /command':
                const data = Plist.parse(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as any) as any;

                reporter.info('Received event stream request.', data);

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
                reporter.warn('No handler for url', key);
                break;
        }
    }
}
