import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import { SOCKET_TIMEOUT } from './const';
import type { Context } from './context';
import { ENCRYPTION } from './symbols';
import type { ConnectionState, EventMap } from './types';

const NOOP_PROMISE_HANDLER = {
    resolve: () => {
    },
    reject: (_: Error) => {
    }
} as const;

type ConnectionEventMap = {
    close: [hadError: boolean];
    connect: [];
    data: [data: Buffer];
    end: [];
    error: [err: Error];
    timeout: [];
};

type Bindings = {
    onClose: (hadError: boolean) => Promise<void>;
    onConnect: () => Promise<void>;
    onData: (data: Buffer) => Promise<void>;
    onEnd: () => Promise<void>;
    onError: (err: Error) => Promise<void>;
    onTimeout: () => Promise<void>;
};

export class Connection<TEventMap extends EventMap> extends EventEmitter<ConnectionEventMap | TEventMap> {
    get address(): string {
        return this.#address;
    }

    get context(): Context {
        return this.#context;
    }

    get port(): number {
        return this.#port;
    }

    get isConnected(): boolean {
        return this.#state === 'connected';
    }

    get state(): ConnectionState {
        if (this.#state === 'closing' || this.#state === 'failed') {
            return this.#state;
        }

        if (!this.#socket) {
            return 'disconnected';
        }

        switch (this.#socket.readyState) {
            case 'opening':
                return 'connecting';

            case 'open':
                return 'connected';

            default:
                return this.#state;
        }
    }

    readonly #address: string;
    readonly #port: number;
    readonly #bindings: Bindings;
    readonly #context: Context;
    #debug: boolean = false;
    #retryAttempt: number = 0;
    #retryAttempts: number = 3;
    #retryEnabled: boolean = true;
    #retryInterval: number = 3000;
    #retryTimeout?: NodeJS.Timeout;
    #socket?: Socket;
    #state: ConnectionState;

    #connectPromise?: {
        resolve: () => void;
        reject: (err: Error) => void;
    };

    constructor(context: Context, address: string, port: number) {
        super();

        this.#address = address;
        this.#port = port;
        this.#context = context;

        this.#bindings = {
            onClose: this.#onClose.bind(this),
            onConnect: this.#onConnect.bind(this),
            onData: this.#onData.bind(this),
            onEnd: this.#onEnd.bind(this),
            onError: this.#onError.bind(this),
            onTimeout: this.#onTimeout.bind(this)
        };

        this.#state = 'disconnected';
    }

    async connect(): Promise<void> {
        if (this.#state === 'connected') {
            return;
        }

        if (this.#state === 'connecting') {
            throw new Error('A connection is already being established.');
        }

        this.#retryEnabled = true;
        this.#retryAttempt = 0;

        return this.#attemptConnect();
    }

    async destroy(): Promise<void> {
        this.#socket?.destroy();
    }

    async disconnect(): Promise<void> {
        if (this.#retryTimeout) {
            clearTimeout(this.#retryTimeout);
            this.#retryTimeout = undefined;
        }

        this.#retryEnabled = false;

        if (!this.#socket || this.#state === 'disconnected') {
            return;
        }

        return new Promise(resolve => {
            this.#state = 'closing';
            this.#socket.once('close', () => {
                this.#cleanup();
                resolve();
            });
            this.#socket.end();
        });
    }

    debug(enabled: boolean): this {
        this.#debug = enabled;

        return this;
    }

    retry(attempts: number, interval: number = 3000): this {
        this.#retryAttempts = attempts;
        this.#retryInterval = interval;

        return this;
    }

    async write(data: Buffer | Uint8Array): Promise<void> {
        if (!this.#socket || this.state !== 'connected' || !this.#socket.writable) {
            this.emit('error', new Error('Cannot write to a disconnected connection.'));
            return;
        }

        return new Promise((resolve, reject) => {
            this.#socket.write(data, err => err ? reject(err) : resolve());
        });
    }

    async #attemptConnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.#state = 'connecting';
            this.#connectPromise = {resolve, reject};

            this.#socket = new Socket();
            this.#socket.setTimeout(SOCKET_TIMEOUT);

            this.#socket.on('close', this.#bindings.onClose);
            this.#socket.on('connect', this.#bindings.onConnect);
            this.#socket.on('data', this.#bindings.onData);
            this.#socket.on('end', this.#bindings.onEnd);
            this.#socket.on('error', this.#bindings.onError);
            this.#socket.on('timeout', this.#bindings.onTimeout);

            this.#context.logger.net(`Connecting to ${this.#address}:${this.#port}...`);

            this.#socket.connect({
                host: this.#address,
                port: this.#port,
                keepAlive: true
            });
        });
    }

    #cleanup(): void {
        if (this.#retryTimeout) {
            clearTimeout(this.#retryTimeout);
            this.#retryTimeout = undefined;
        }

        if (this.#socket) {
            this.#socket.removeAllListeners();
            this.#socket.destroy();
            this.#socket = undefined;
        }

        this.#state = 'disconnected';
        this.#connectPromise = undefined;
    }

    #scheduleRetry(err: Error): void {
        if (!this.#retryEnabled || this.#retryAttempt >= this.#retryAttempts) {
            this.#state = 'failed';
            this.#connectPromise?.reject(err);
            this.#connectPromise = undefined;
            return;
        }

        this.#retryAttempt++;
        this.#context.logger.net(`Retry attempt ${this.#retryAttempt} / ${this.#retryAttempts} in ${this.#retryInterval}ms...`);

        const {resolve, reject} = this.#connectPromise ?? NOOP_PROMISE_HANDLER;
        this.#cleanup();

        this.#retryTimeout = setTimeout(async () => {
            this.#retryTimeout = undefined;

            try {
                // Re-assign the stored handlers
                this.#connectPromise = {resolve, reject};
                await this.#attemptConnect();
                resolve();
            } catch (retryErr) {
                // Error handling is done in #onError/#onTimeout
            }
        }, this.#retryInterval);
    }

    #onClose(hadError: boolean): void {
        const wasConnected = this.#state === 'connected';

        if (this.#state !== 'closing') {
            this.#state = 'disconnected';
            this.#context.logger.net(`Connection closed (${hadError ? 'with error' : 'normally'}).`);
        }

        this.emit('close', hadError);

        if (wasConnected && this.#retryEnabled && hadError) {
            this.#scheduleRetry(new Error('Connection closed unexpectedly.'));
        }
    }

    #onConnect(): void {
        this.#state = 'connected';
        this.#retryAttempt = 0;

        this.#socket.setKeepAlive(true, 10000);
        this.#socket.setTimeout(0);

        this.emit('connect');
        this.#connectPromise?.resolve();
        this.#connectPromise = undefined;
    }

    #onData(data: Buffer): void {
        if (this.#debug) {
            const cutoff = Math.min(data.byteLength, 64);
            this.#context.logger.debug(`Received ${data.byteLength} bytes of data.`);
            this.#context.logger.debug(`hex=${data.subarray(0, cutoff).toString('hex')}`);
            this.#context.logger.debug(`ascii=${data.toString('ascii').replace(/[^\x20-\x7E]/g, '.').substring(0, cutoff)}`);
        }

        this.emit('data', data);
    }

    #onEnd(): void {
        this.emit('end');
    }

    #onError(err: Error): void {
        this.#context.logger.error(`Connection error: ${err.message}`);

        if (this.listenerCount('error') > 0) {
            this.emit('error', err);
        } else {
            this.#context.logger.warn('No error handler registered. This is likely a bug.', this.constructor.name, '#onError');
        }

        if (this.#state === 'connecting') {
            this.#scheduleRetry(err);
        } else {
            this.#state = 'failed';
        }
    }

    #onTimeout(): void {
        this.#context.logger.error('Connection timed out.');

        const err = new Error('Connection timed out.');

        this.emit('timeout');

        if (this.#state === 'connecting') {
            this.#scheduleRetry(err);
        } else {
            this.#state = 'failed';
            this.#socket?.destroy();
        }
    }
}

export class EncryptionAwareConnection<TEventMap extends EventMap> extends Connection<TEventMap> {
    get isEncrypted(): boolean {
        return !!this[ENCRYPTION];
    }

    [ENCRYPTION]?: EncryptionState;

    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this[ENCRYPTION] = new EncryptionState(readKey, writeKey);
    }
}

export class EncryptionState {
    readKey: Buffer;
    readCount: number;
    writeKey: Buffer;
    writeCount: number;

    constructor(readKey: Buffer, writeKey: Buffer) {
        this.readCount = 0;
        this.readKey = readKey;
        this.writeCount = 0;
        this.writeKey = writeKey;
    }
}
