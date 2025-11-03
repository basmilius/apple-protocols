import { debug, HTTP_TIMEOUT } from '@basmilius/apple-common';
import type { RTSPMethod } from './types';
import { makeHttpHeader, makeHttpResponse } from './utils';
import AirPlayStream from './stream';

export default class AirPlayRTSP extends AirPlayStream {
    #buffer: Buffer = Buffer.alloc(0);
    #cseq: number = 0;
    #requesting: boolean = false;
    #reject: Function;
    #resolve: Function;

    async get(path: string, headers: HeadersInit = {}): Promise<Response> {
        return await this.#request('GET', path, null, headers);
    }

    async post(path: string, body: Buffer | string | null = null, headers: HeadersInit = {}): Promise<Response> {
        return await this.#request('POST', path, body, headers);
    }

    async record(path: string, headers: HeadersInit = {}): Promise<Response> {
        return await this.#request('RECORD', path, null, headers);
    }

    async setup(path: string, body: Buffer | string | null = null, headers: HeadersInit = {}): Promise<Response> {
        return await this.#request('SETUP', path, body, headers);
    }

    async onClose(): Promise<void> {
        await super.onClose();
        await this.#handle(undefined, new Error('Connection closed.'));
    }

    async onData(buffer: Buffer): Promise<void> {
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

    async onError(err: Error): Promise<void> {
        await super.onError(err);
        await this.#handle(undefined, err);
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

    async #request(method: RTSPMethod, path: string, body: Buffer | string | null, headers: HeadersInit): Promise<Response> {
        if (this.#requesting) {
            throw new Error('Another request is currently being made.');
        }

        this.#requesting = true;

        let data: Buffer;

        if (body) {
            headers['Content-Length'] = Buffer.byteLength(body).toString();

            data = Buffer.concat([
                Buffer.from(makeHttpHeader(method, path, headers, this.#cseq++)),
                Buffer.from(body)
            ]);
        } else {
            headers['Content-Length'] = '0';

            data = Buffer.from(makeHttpHeader(method, path, headers, this.#cseq++));
        }

        debug(method, path);

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

            timer = setTimeout(() => reject(new Error('Request timed out')), HTTP_TIMEOUT);

            this.socket.write(data);
        });
    }
}
