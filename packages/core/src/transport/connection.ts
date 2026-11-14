import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import { SOCKET_TIMEOUT } from '../const';
import { ConnectionClosedError, ConnectionError, ConnectionTimeoutError } from '../errors';
import type { EventMap } from '../types';
import type { Context } from './context';
import type { CloseReason, ConnectionState } from './types';

type ConnectionEventMap = {
    closed: [reason: CloseReason, error?: Error];
    connect: [];
    data: [data: Buffer];
    error: [error: Error];
};

/**
 * One TCP socket to a device, with keep-alive and no-delay. Subclasses extend the event map with
 * protocol events.
 *
 * A connection connects once and ends once. Every way it ends, `disconnect()` and `destroy()`
 * included, emits `closed` with the reason and aborts {@link signal}. Reconnecting takes a new
 * connection, because a fresh socket carries no pairing and no encryption keys. `error` reports
 * problems that do not end the connection by themselves, such as a write after the socket closed.
 */
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

    /** Local IP address of the socket, or '0.0.0.0' when not connected. */
    get localAddress(): string {
        return this.#socket?.localAddress ?? '0.0.0.0';
    }

    get state(): ConnectionState {
        return this.#state;
    }

    /** Aborts with a {@link ConnectionClosedError} when the connection ends. */
    get signal(): AbortSignal {
        return this.#controller.signal;
    }

    readonly #address: string;
    readonly #port: number;
    readonly #context: Context;
    readonly #controller: AbortController = new AbortController();
    #connectPromise?: {
        resolve: () => void;
        reject: (error: Error) => void;
    };
    #debug: boolean = false;
    #socket?: Socket;
    #state: ConnectionState = 'disconnected';

    constructor(context: Context, address: string, port: number) {
        super();

        this.#address = address;
        this.#port = port;
        this.#context = context;
    }

    /**
     * Opens the socket. Returns at once when already connected.
     *
     * @throws {ConnectionTimeoutError} If the socket does not open within the socket timeout.
     * @throws {ConnectionError} If the socket cannot open, or the connection is busy or has ended.
     */
    async connect(): Promise<void> {
        if (this.#state === 'connected') {
            return;
        }

        if (this.signal.aborted) {
            throw new ConnectionClosedError('This connection has ended, create a new one.');
        }

        if (this.#state !== 'disconnected') {
            throw new ConnectionError('A connection is already being established.');
        }

        this.#state = 'connecting';

        const connected = new Promise<void>((resolve, reject) => {
            this.#connectPromise = {resolve, reject};
        });

        const socket = new Socket();
        this.#socket = socket;

        socket.setNoDelay(true);
        socket.setTimeout(SOCKET_TIMEOUT);

        socket.on('close', () => this.#onClose());
        socket.on('connect', () => this.#onConnect());
        socket.on('data', (data: Buffer) => this.#onData(data));
        socket.on('error', (error: Error) => this.#onError(error));
        socket.on('timeout', () => this.#onTimeout());

        this.#context.logger.net(`Connecting to ${this.#address}:${this.#port}...`);

        socket.connect({
            host: this.#address,
            port: this.#port
        });

        return connected;
    }

    /**
     * Ends the connection right away without a graceful shutdown. Passing an error ends it with
     * reason `error`, for a subclass that cannot continue after a broken frame.
     */
    destroy(error?: Error): void {
        if (this.#state === 'disconnected' && !this.#socket) {
            return;
        }

        this.#end(error ? 'error' : 'local', error);
    }

    /** Ends the socket gracefully and resolves once it is closed. */
    async disconnect(): Promise<void> {
        const socket = this.#socket;

        if (!socket || this.signal.aborted) {
            return;
        }

        if (socket.connecting || socket.destroyed) {
            this.#end('local');

            return;
        }

        const closed = new Promise<void>(resolve => this.signal.addEventListener('abort', () => resolve(), {once: true}));

        if (this.#state !== 'closing') {
            this.#state = 'closing';
            socket.end();
        }

        await closed;
    }

    /** Toggles hex and ASCII dumps of incoming data. */
    debug(enabled: boolean): this {
        this.#debug = enabled;

        return this;
    }

    /** Writes to the socket, or emits `error` when the socket is not writable. */
    write(data: Buffer | Uint8Array): void {
        if (!this.#socket || this.#state !== 'connected' || !this.#socket.writable) {
            this.#reportError(new ConnectionClosedError('Cannot write to a disconnected connection.'));

            return;
        }

        this.#socket.write(data, error => {
            // A write that fails because the socket broke is reported by `closed` already.
            if (!error || this.signal.aborted) {
                return;
            }

            this.#context.logger.error('Failed to write data to socket.');
            this.#reportError(error);
        });
    }

    /** The single exit: closes the socket, settles a pending connect, aborts the signal and emits `closed`. */
    #end(reason: CloseReason, error?: Error): void {
        if (this.signal.aborted) {
            return;
        }

        const socket = this.#socket;
        this.#socket = undefined;
        this.#state = reason === 'error' || reason === 'timeout' ? 'failed' : 'disconnected';

        if (socket) {
            socket.removeAllListeners();
            socket.on('error', () => {
            });
            socket.destroy();
        }

        this.#context.logger.net(`Connection closed (${reason}${error ? `: ${error.message}` : ''}).`);

        this.#controller.abort(new ConnectionClosedError(`Connection closed (${reason}).`));

        if (this.#connectPromise) {
            this.#connectPromise.reject(error ?? new ConnectionClosedError('Connection closed before it was established.'));
            this.#connectPromise = undefined;
        }

        this.#emitInternal('closed', reason, error);
    }

    #onClose(): void {
        this.#end(this.#state === 'closing' ? 'local' : 'remote');
    }

    #onConnect(): void {
        this.#state = 'connected';

        this.#socket.setKeepAlive(true, 10000);
        this.#socket.setTimeout(0);

        const pending = this.#connectPromise;
        this.#connectPromise = undefined;

        this.#emitInternal('connect');
        pending?.resolve();
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

    #onError(error: Error): void {
        this.#context.logger.error(`Connection error: ${error.message}`);

        if (this.#state === 'connecting') {
            this.#end('error', new ConnectionError(`Cannot connect to ${this.#address}:${this.#port}: ${error.message}`));

            return;
        }

        this.#end('error', error);
    }

    /** Only fires while connecting; the idle timeout is switched off once the socket opens. */
    #onTimeout(): void {
        this.#context.logger.error('Connection timed out.');
        this.#end('timeout', new ConnectionTimeoutError());
    }

    /** Emits `error` when someone listens, because an unhandled `error` event would throw. */
    #reportError(error: Error): void {
        if (this.listenerCount('error') > 0) {
            this.#emitInternal('error', error);
        } else {
            this.#context.logger.warn('No error handler registered.', this.constructor.name, error.message);
        }
    }

    /** The merged event map makes the inherited emit signature too broad to call directly. */
    #emitInternal<K extends keyof ConnectionEventMap>(event: K, ...args: ConnectionEventMap[K]): boolean {
        return (this.emit as (...args: unknown[]) => boolean)(event, ...args);
    }
}
