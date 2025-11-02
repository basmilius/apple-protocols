import { Socket } from 'node:net';
import { BaseSocket, debug, HTTP_TIMEOUT } from '@basmilius/apple-common';
import type { RTSPMethod } from './types';
import { makeHttpHeader, makeHttpResponse } from './utils';

export default class AirPlayRTSP extends BaseSocket {
    get isEncrypted(): boolean {
        return !!this.#readKey && !!this.#writeKey;
    }

    readonly #socket: Socket;
    readonly #queue: Record<number, Function> = {};
    #readCount: number;
    #readKey?: Buffer;
    #writeCount: number;
    #writeKey?: Buffer;
    #buffer: Buffer = Buffer.alloc(0);
    #cseq: number = 0;
    #requesting: boolean = false;
    #reject: Function;
    #resolve: Function;

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

    async get(path: string, headers: HeadersInit = {}): Promise<Response> {
        return await this.#request('GET', path, null, headers);
    }

    async post(path: string, body: Buffer | string | null = null, headers: HeadersInit = {}): Promise<Response> {
        return await this.#request('POST', path, body, headers);
    }

    async onClose(): Promise<void> {
        debug(`Connection closed from ${this.address}:${this.port}`);

        this.#handle(undefined, new Error('Connection closed.'));
    }

    async onConnect(): Promise<void> {
        debug(`Connected to ${this.address}:${this.port}`);
    }

    async onData(buffer: Buffer): Promise<void> {
        // debug('Received data frame', buffer.toString());

        this.#buffer = Buffer.concat([this.#buffer, buffer]);
        // this.#buffer = await this.#decrypt(this.#buffer);

        while (this.#buffer.byteLength > 0) {
            const result = makeHttpResponse(this.#buffer);

            if (result === null) {
                return;
            }

            this.#buffer = this.#buffer.subarray(result.responseLength);

            this.#handle(result.response, undefined);
        }
    }

    async onEnd(): Promise<void> {
        debug('Connection ended');
    }

    async onError(err: Error): Promise<void> {
        debug('Error received', err);

        this.#handle(undefined, err);
    }

    #handle(data: unknown, err?: Error): void {
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

        debug(method, path, {request: data.toString()});

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

            this.#socket.write(data);
        });
    }
}
