import { HTTP_TIMEOUT, reporter } from '@basmilius/apple-common';
import type { RTSPMethod } from './types';
import { makeHttpHeader, makeHttpResponse } from './utils';
import Stream from './stream';

type Bindings = {
    onClose: () => void;
    onData: (buffer: Buffer) => void;
    onError: (err: Error) => void;
    onTimeout: () => void;
};

export default class AirPlayRTSP extends Stream<{}> {
    get activeRemote(): string {
        return this.#activeRemote;
    }

    get dacpId(): string {
        return this.#dacpId;
    }

    get sessionId(): string {
        return this.#sessionId;
    }

    readonly #activeRemote: string;
    readonly #bindings: Bindings;
    readonly #dacpId: string;
    readonly #sessionId: string;
    #buffer: Buffer = Buffer.alloc(0);
    #cseq: number = 0;
    #requesting: boolean = false;
    #reject: Function;
    #resolve: Function;

    constructor(address: string, port: number) {
        super(address, port);

        this.#activeRemote = Math.floor(Math.random() * 2 ** 32).toString(10);
        this.#dacpId = Math.floor(Math.random() * 2 ** 64).toString(16).toUpperCase();
        this.#sessionId = Math.floor(Math.random() * 2 ** 32).toString(10);

        this.#bindings = {
            onClose: this.#onClose.bind(this),
            onData: this.#onData.bind(this),
            onError: this.#onError.bind(this),
            onTimeout: this.#onTimeout.bind(this)
        };

        this.on('close', this.#bindings.onClose);
        this.on('data', this.#bindings.onData);
        this.on('error', this.#bindings.onError);
        this.on('timeout', this.#bindings.onTimeout);

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

    async #handle(data: unknown, err?: Error): Promise<void> {
        if (err) {
            this.#reject?.(err);
        } else {
            this.#resolve?.(data);
        }

        this.#reject = undefined;
        this.#resolve = undefined;
        this.#requesting = false;
    }

    async #request(method: RTSPMethod, path: string, body: Buffer | string | null, headers: HeadersInit, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        if (!this.isConnected) {
            return Promise.reject(new Error('Accessory not connected.'));
        }

        if (this.#requesting) {
            return Promise.reject(new Error('Another request is currently being made.'));
        }

        this.#requesting = true;

        headers['Active-Remote'] = this.activeRemote;
        headers['Client-Instance'] = this.dacpId;
        headers['DACP-ID'] = this.dacpId;

        const cseq = this.#cseq++;
        let data: Buffer;

        if (body) {
            headers['Content-Length'] = Buffer.byteLength(body).toString();

            data = Buffer.concat([
                Buffer.from(makeHttpHeader(method, path, headers, cseq)),
                Buffer.from(body)
            ]);
        } else {
            headers['Content-Length'] = '0';

            data = Buffer.from(makeHttpHeader(method, path, headers, cseq));
        }

        reporter.net('[rtsp]', method, path, `cseq = ${cseq}`);

        if (this.isEncrypted) {
            data = await this.encrypt(data);
        }

        return new Promise(async (resolve, reject) => {
            let timer: any;

            this.#reject = (reason: Error): void => {
                reject(reason);
                clearTimeout(timer);
            };

            this.#resolve = (response: Response): void => {
                resolve(response);
                clearTimeout(timer);
            };

            timer = setTimeout(() => reject(new Error('Request timed out')), timeout);

            await this.write(data);
        });
    }

    async #onClose(): Promise<void> {
        await this.#handle(undefined, new Error('Connection closed.'));
    }

    async #onData(buffer: Buffer): Promise<void> {
        this.#buffer = Buffer.concat([this.#buffer, buffer]);

        if (this.isEncrypted) {
            this.#buffer = await this.decrypt(this.#buffer);
        }

        while (this.#buffer.byteLength > 0) {
            const result = makeHttpResponse(this.#buffer);

            if (result === null) {
                return;
            }

            this.#buffer = this.#buffer.subarray(result.responseLength);

            await this.#handle(result.response, undefined);
        }
    }

    async #onError(err: Error): Promise<void> {
        await this.#handle(undefined, err);
    }

    async #onTimeout(): Promise<void> {
        await this.#handle(undefined, new Error('Request timed out.'));
    }
}
