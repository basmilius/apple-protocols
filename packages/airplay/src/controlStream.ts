import { type Context, HTTP_TIMEOUT } from '@basmilius/apple-common';
import { RTSP } from '@basmilius/apple-encoding';
import { generateActiveRemoteId, generateDacpId, generateSessionId } from './utils';
import BaseStream from './baseStream';

export default class ControlStream extends BaseStream {
    get activeRemoteId(): string {
        return this.#activeRemoteId;
    }

    get dacpId(): string {
        return this.#dacpId;
    }

    get sessionId(): string {
        return this.#sessionId;
    }

    readonly #activeRemoteId: string;
    readonly #dacpId: string;
    readonly #sessionId: string;
    #buffer: Buffer = Buffer.alloc(0);
    #cseq: number = 0;
    #requesting: boolean = false;
    #requestTimer?: NodeJS.Timeout;
    #reject?: (reason: Error) => void;
    #resolve?: (response: Response) => void;

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#activeRemoteId = generateActiveRemoteId();
        this.#dacpId = generateDacpId();
        this.#sessionId = generateSessionId();

        this.on('close', this.#onClose.bind(this));
        this.on('data', this.#onData.bind(this));
        this.on('error', this.#onError.bind(this));
        this.on('timeout', this.#onTimeout.bind(this));
    }

    async disconnect(): Promise<void> {
        this.#cleanup();
        await super.disconnect();
    }

    async flush(uri: string, headers: Record<string, string>): Promise<Response> {
        return await this.#request('FLUSH', uri, null, headers);
    }

    async get(path: string, headers: HeadersInit = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.#request('GET', path, null, headers, timeout);
    }

    async post(path: string, body: Buffer | string | null = null, headers: HeadersInit = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.#request('POST', path, body, headers, timeout);
    }

    async record(path: string, headers: HeadersInit = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.#request('RECORD', path, null, headers, timeout);
    }

    async setup(path: string, body: Buffer | string | null = null, headers: HeadersInit = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.#request('SETUP', path, body, headers, timeout);
    }

    async setParameter(parameter: string, value: string): Promise<Response> {
        return await this.#request('SET_PARAMETER', `/${this.sessionId}`, `${parameter}: ${value}\r\n`, {
            'Content-Type': 'text/parameters'
        });
    }

    async teardown(path: string, headers: HeadersInit = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.#request('TEARDOWN', path, null, headers, timeout);
    }

    #cleanup(): void {
        if (this.#requestTimer) {
            clearTimeout(this.#requestTimer);
            this.#requestTimer = undefined;
        }

        this.#buffer = Buffer.alloc(0);
        this.#reject = undefined;
        this.#resolve = undefined;
        this.#requesting = false;
    }

    #handle(data: Response, err?: Error): void {
        if (this.#requestTimer) {
            clearTimeout(this.#requestTimer);
            this.#requestTimer = undefined;
        }

        if (err) {
            this.#reject?.(err);
        } else {
            this.#resolve?.(data);
        }

        this.#reject = undefined;
        this.#resolve = undefined;
        this.#requesting = false;
    }

    #request(method: RTSP.Method, path: string, body: Buffer | string | null, headers: HeadersInit, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        if (this.#requesting) {
            return Promise.reject(new Error('Another request is currently being made.'));
        }

        this.#requesting = true;

        const cseq = this.#cseq++;
        let data: Buffer;

        if (body) {
            headers['Content-Length'] = Buffer.byteLength(body);

            data = Buffer.concat([
                Buffer.from(RTSP.makeHeader(method, path, headers, cseq, this.#activeRemoteId, this.#dacpId, this.#sessionId)),
                Buffer.from(body)
            ]);
        } else {
            headers['Content-Length'] = 0;

            data = Buffer.from(RTSP.makeHeader(method, path, headers, cseq, this.#activeRemoteId, this.#dacpId, this.#sessionId));
        }

        this.context.logger.net('[control]', method, path, `cseq = ${cseq}`);

        if (this.isEncrypted) {
            data = this.encrypt(data);
        }

        return new Promise((resolve, reject) => {
            this.#reject = reject;
            this.#resolve = resolve;

            this.#requestTimer = setTimeout(() => this.#handle(undefined, new Error('Request timed out')), timeout);

            this.write(data);
        });
    }

    #onClose(): void {
        this.#cleanup();
        this.#handle(undefined, new Error('Connection closed.'));
        this.context.logger.net('[control]', '#onClose()');
    }

    #onData(data: Buffer): void {
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
                const result = RTSP.makeResponse(this.#buffer);

                if (result === null) {
                    return;
                }

                this.#buffer = this.#buffer.subarray(result.responseLength);
                this.#handle(result.response, undefined);
            }
        } catch (err) {
            this.context.logger.error('[control]', '#onData()', err);
            this.emit('error', err);
        }
    }

    #onError(err: Error): void {
        this.#handle(undefined, err);
        this.context.logger.error('[control]', '#onError()', err);
    }

    #onTimeout(): void {
        this.#handle(undefined, new Error('Request timed out.'));
        this.context.logger.net('[control]', '#onTimeout()');
    }
}
