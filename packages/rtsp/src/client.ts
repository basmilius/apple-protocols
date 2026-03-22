import { Connection, ConnectionClosedError, ConnectionTimeoutError, type Context, HTTP_TIMEOUT, InvalidResponseError, TimeoutError } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { type Method, parseResponse } from './encoding';

type PendingRequest = {
    resolve: (response: Response) => void;
    reject: (error: Error) => void;
};

export type ExchangeOptions = {
    contentType?: string;
    headers?: Record<string, string>;
    body?: Buffer | string | Record<string, unknown>;
    allowError?: boolean;
    protocol?: 'RTSP/1.0' | 'HTTP/1.1';
    timeout?: number;
};

const MAX_BUFFER_SIZE = 2 * 1024 * 1024; // 2MB

export default class RtspClient extends Connection<{}> {
    #buffer: Buffer = Buffer.alloc(0);
    #cseq: number = 0;
    #requests: Map<number, PendingRequest> = new Map();

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.on('close', this.#onClose.bind(this));
        this.on('data', this.#onData.bind(this));
        this.on('error', this.#onError.bind(this));
        this.on('timeout', this.#onTimeout.bind(this));
    }

    /**
     * Override to provide default headers for every request.
     */
    protected getDefaultHeaders(): Record<string, string | number> {
        return {};
    }

    /**
     * Override to transform incoming data before RTSP parsing (e.g. decryption).
     */
    protected transformIncoming(data: Buffer): Buffer | false {
        return data;
    }

    /**
     * Override to transform outgoing data after RTSP formatting (e.g. encryption).
     */
    protected transformOutgoing(data: Buffer): Buffer {
        return data;
    }

    protected async exchange(method: Method, path: string, options: ExchangeOptions = {}): Promise<Response> {
        const {
            contentType,
            headers: extraHeaders = {},
            allowError = false,
            protocol = 'RTSP/1.0',
            timeout = HTTP_TIMEOUT
        } = options;
        let {body} = options;

        const cseq = this.#cseq++;

        const headers: Record<string, string | number> = {
            'CSeq': cseq,
            ...this.getDefaultHeaders(),
            ...extraHeaders
        };

        let bodyBuffer: Buffer | undefined;

        if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
            bodyBuffer = Buffer.from(Plist.serialize(body as {}));
            headers['Content-Type'] = 'application/x-apple-binary-plist';
        } else if (body) {
            bodyBuffer = typeof body === 'string' ? Buffer.from(body) : body as Buffer;

            if (contentType) {
                headers['Content-Type'] = contentType;
            }
        } else if (contentType) {
            headers['Content-Type'] = contentType;
        }

        if (bodyBuffer) {
            headers['Content-Length'] = bodyBuffer.length;
        } else {
            headers['Content-Length'] = 0;
        }

        const headerLines = [
            `${method} ${path} ${protocol}`,
            ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
            '',
            ''
        ].join('\r\n');

        const raw = bodyBuffer
            ? Buffer.concat([Buffer.from(headerLines), bodyBuffer])
            : Buffer.from(headerLines);

        const data = this.transformOutgoing(Buffer.from(raw));

        this.context.logger.net('[rtsp]', method, path, `cseq=${cseq}`);

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#requests.delete(cseq);
                reject(new TimeoutError(`No response to CSeq ${cseq} (${path})`));
            }, timeout);

            this.#requests.set(cseq, {
                resolve: (response) => {
                    clearTimeout(timer);

                    if (!allowError && !response.ok) {
                        reject(new InvalidResponseError(`RTSP error: ${response.status} ${response.statusText}`));
                    } else {
                        resolve(response);
                    }
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                }
            });

            this.write(data);
        });
    }

    #onClose(): void {
        this.#buffer = Buffer.alloc(0);

        for (const [cseq, {reject}] of this.#requests) {
            reject(new ConnectionClosedError('Connection closed.'));
            this.#requests.delete(cseq);
        }

        this.context.logger.net('[rtsp]', '#onClose()');
    }

    #onData(data: Buffer): void {
        try {
            this.#buffer = Buffer.concat([this.#buffer, data]);

            if (this.#buffer.byteLength > MAX_BUFFER_SIZE) {
                this.context.logger.error('[rtsp]', `Buffer exceeded max size (${this.#buffer.byteLength} bytes), resetting.`);
                this.#buffer = Buffer.alloc(0);

                const err = new Error('Buffer overflow: exceeded maximum buffer size');

                for (const [cseq, {reject}] of this.#requests) {
                    reject(err);
                    this.#requests.delete(cseq);
                }

                this.emit('error', err);
                return;
            }

            const transformed = this.transformIncoming(this.#buffer);

            if (transformed === false) {
                return;
            }

            this.#buffer = transformed;

            while (this.#buffer.byteLength > 0) {
                const result = parseResponse(this.#buffer);

                if (result === null) {
                    return;
                }

                this.#buffer = this.#buffer.subarray(result.responseLength);

                const cseqHeader = result.response.headers.get('CSeq');
                const cseq = cseqHeader ? parseInt(cseqHeader, 10) : -1;

                if (this.#requests.has(cseq)) {
                    const {resolve} = this.#requests.get(cseq)!;
                    this.#requests.delete(cseq);
                    resolve(result.response);
                } else {
                    this.context.logger.warn('[rtsp]', `Unexpected response for CSeq ${cseq}`);
                }
            }
        } catch (err) {
            this.context.logger.error('[rtsp]', '#onData()', err);
            this.emit('error', err as Error);
        }
    }

    #onError(err: Error): void {
        for (const [cseq, {reject}] of this.#requests) {
            reject(err);
            this.#requests.delete(cseq);
        }

        this.context.logger.error('[rtsp]', '#onError()', err);
    }

    #onTimeout(): void {
        const err = new ConnectionTimeoutError();

        for (const [cseq, {reject}] of this.#requests) {
            reject(err);
            this.#requests.delete(cseq);
        }

        this.context.logger.net('[rtsp]', '#onTimeout()');
    }
}
