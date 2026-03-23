import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import { SOCKET_TIMEOUT } from './const';
import type { Context } from './context';
import { ConnectionClosedError, ConnectionError, ConnectionTimeoutError } from './errors';
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

export class Connection<TEventMap extends EventMap = {}> extends EventEmitter<ConnectionEventMap & TEventMap> {
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

    get localAddress(): string {
        return this.#socket?.localAddress ?? '0.0.0.0';
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
    readonly #context: Context;
    readonly #emitInternal = <K extends keyof ConnectionEventMap>(event: K, ...args: ConnectionEventMap[K]) =>
        (this.emit as (...a: any[]) => boolean)(event, ...args);
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

        this.#state = 'disconnected';
    }

    async connect(): Promise<void> {
        if (this.#state === 'connected') {
            return;
        }

        if (this.#state === 'connecting') {
            throw new ConnectionError('A connection is already being established.');
        }

        this.#retryEnabled = true;
        this.#retryAttempt = 0;

        return this.#attemptConnect();
    }

    destroy(): void {
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

    write(data: Buffer | Uint8Array): void {
        if (!this.#socket || this.state !== 'connected' || !this.#socket.writable) {
            this.#emitInternal('error', new ConnectionClosedError('Cannot write to a disconnected connection.'));
            return;
        }

        this.#socket.write(data, err => {
            if (!err) {
                return;
            }

            this.#context.logger.error('Failed to write data to socket.');
            this.#emitInternal('error', err);
        });
    }

    async #attemptConnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.#state = 'connecting';
            this.#connectPromise = {resolve, reject};

            this.#socket?.removeAllListeners();
            this.#socket = undefined;

            this.#socket = new Socket();
            this.#socket.setNoDelay(true);
            this.#socket.setTimeout(SOCKET_TIMEOUT);

            this.#socket.on('close', this.#onClose.bind(this));
            this.#socket.on('connect', this.#onConnect.bind(this));
            this.#socket.on('data', this.#onData.bind(this));
            this.#socket.on('end', this.#onEnd.bind(this));
            this.#socket.on('error', this.#onError.bind(this));
            this.#socket.on('timeout', this.#onTimeout.bind(this));

            this.#context.logger.net(`Connecting to ${this.#address}:${this.#port}...`);

            this.#socket.connect({
                host: this.#address,
                port: this.#port
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

        if (this.#retryTimeout) {
            clearTimeout(this.#retryTimeout);
            this.#retryTimeout = undefined;
        }

        this.#retryAttempt++;
        this.#context.logger.net(`Retry attempt ${this.#retryAttempt} / ${this.#retryAttempts} in ${this.#retryInterval}ms...`);

        const {resolve, reject} = this.#connectPromise ?? NOOP_PROMISE_HANDLER;
        this.#cleanup();

        this.#retryTimeout = setTimeout(async () => {
            this.#retryTimeout = undefined;

            try {
                // Re-assign the stored handlers so that when retries
                // are exhausted, the original promise gets rejected.
                this.#connectPromise = {resolve, reject};
                await this.#attemptConnect();
                resolve();
            } catch (retryErr) {
                // Propagate to the original connect() promise.
                // Without this, the caller's await connect() hangs
                // forever when all retry attempts are exhausted.
                reject(retryErr instanceof Error ? retryErr : new ConnectionError(String(retryErr)));
            }
        }, this.#retryInterval);
    }

    #onClose(hadError: boolean): void {
        const wasConnected = this.#state === 'connected';

        if (this.#state !== 'closing') {
            this.#state = 'disconnected';
            this.#context.logger.net(`Connection closed (${hadError ? 'with error' : 'normally'}).`);
        }

        this.#emitInternal('close', hadError);

        if (wasConnected && this.#retryEnabled && hadError) {
            this.#scheduleRetry(new ConnectionClosedError());
        }
    }

    #onConnect(): void {
        this.#state = 'connected';
        this.#retryAttempt = 0;

        this.#socket.setKeepAlive(true, 10000);
        this.#socket.setTimeout(0);

        this.#emitInternal('connect');
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

        this.#emitInternal('data', data);
    }

    #onEnd(): void {
        this.#emitInternal('end');
    }

    #onError(err: Error): void {
        this.#context.logger.error(`Connection error: ${err.message}`);

        if (this.listenerCount('error') > 0) {
            this.#emitInternal('error', err);
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

        const err = new ConnectionTimeoutError();

        this.#emitInternal('timeout');

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
        return !!this._encryption;
    }

    _encryption?: EncryptionState;

    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this._encryption = new EncryptionState(readKey, writeKey);
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
