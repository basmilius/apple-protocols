import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import { SOCKET_TIMEOUT } from './const';
import type { Context } from './context';
import { ConnectionClosedError, ConnectionError, ConnectionTimeoutError } from './errors';
import type { ConnectionState, EventMap } from './types';

/** No-op promise handler used as a fallback when no connect promise is active. */
const NOOP_PROMISE_HANDLER = {
    resolve: () => {
    },
    reject: (_: Error) => {
    }
} as const;

/** Event map for the base Connection class socket events. */
type ConnectionEventMap = {
    close: [hadError: boolean];
    connect: [];
    data: [data: Buffer];
    end: [];
    error: [err: Error];
    timeout: [];
};

/**
 * TCP socket connection wrapper with built-in retry logic and typed events.
 *
 * Manages a single TCP socket to an Apple device, providing automatic reconnection
 * on failure (configurable attempts and interval), keep-alive, and no-delay settings.
 * Subclasses can extend the event map with protocol-specific events.
 *
 * Default retry behavior: 3 attempts with 3-second intervals between retries.
 */
export class Connection<TEventMap extends EventMap = {}> extends EventEmitter<ConnectionEventMap & TEventMap> {
    /** The remote IP address this connection targets. */
    get address(): string {
        return this.#address;
    }

    /** The shared context carrying device identity and logger. */
    get context(): Context {
        return this.#context;
    }

    /** The remote port this connection targets. */
    get port(): number {
        return this.#port;
    }

    /** Whether the connection is currently established and open. */
    get isConnected(): boolean {
        return this.#state === 'connected';
    }

    /** The local IP address of the socket, or '0.0.0.0' if not connected. */
    get localAddress(): string {
        return this.#socket?.localAddress ?? '0.0.0.0';
    }

    /** The current connection state, derived from both internal state and socket readyState. */
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

    /**
     * @param context - Shared context with device identity and logger.
     * @param address - The remote IP address to connect to.
     * @param port - The remote port to connect to.
     */
    constructor(context: Context, address: string, port: number) {
        super();

        this.#address = address;
        this.#port = port;
        this.#context = context;
        this.#state = 'disconnected';

        this.onClose = this.onClose.bind(this);
        this.onConnect = this.onConnect.bind(this);
        this.onData = this.onData.bind(this);
        this.onEnd = this.onEnd.bind(this);
        this.onError = this.onError.bind(this);
        this.onTimeout = this.onTimeout.bind(this);
    }

    /**
     * Establishes a TCP connection to the remote address. If already connected,
     * returns immediately. Enables retry logic for the duration of this connection.
     *
     * @throws {ConnectionError} If already connecting or all retry attempts are exhausted.
     */
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

    /** Immediately destroys the underlying socket without graceful shutdown. */
    destroy(): void {
        this.#socket?.destroy();
    }

    /**
     * Gracefully disconnects by ending the socket and waiting for the 'close' event.
     * Disables retry logic so the connection does not automatically reconnect.
     */
    async disconnect(): Promise<void> {
        if (this.#retryTimeout) {
            clearTimeout(this.#retryTimeout);
            this.#retryTimeout = undefined;
        }

        this.#retryEnabled = false;

        if (!this.#socket || this.#state === 'disconnected') {
            return;
        }

        // If socket is already destroyed/closed, just cleanup directly
        // to avoid hanging on a 'close' event that will never fire.
        if (this.#socket.destroyed || this.#socket.readyState === 'closed') {
            this.#cleanup();
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

    /**
     * Enables or disables debug logging for incoming data (hex + ASCII dumps).
     *
     * @param enabled - Whether to enable debug output.
     * @returns This connection instance for chaining.
     */
    debug(enabled: boolean): this {
        this.#debug = enabled;

        return this;
    }

    /**
     * Configures the retry behavior for connection attempts.
     *
     * @param attempts - Maximum number of retry attempts.
     * @param interval - Delay in milliseconds between retry attempts.
     * @returns This connection instance for chaining.
     */
    retry(attempts: number, interval: number = 3000): this {
        this.#retryAttempts = attempts;
        this.#retryInterval = interval;

        return this;
    }

    /**
     * Writes data to the underlying TCP socket.
     * Emits an error event if the socket is not writable.
     *
     * @param data - The data to send.
     */
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

    /**
     * Creates a new socket and attempts to connect. The returned promise resolves
     * on successful connect or rejects after all retries are exhausted.
     */
    async #attemptConnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.#state = 'connecting';
            this.#connectPromise = {resolve, reject};

            this.#socket?.removeAllListeners();
            this.#socket?.destroy();
            this.#socket = undefined;

            this.#socket = new Socket();
            this.#socket.setNoDelay(true);
            this.#socket.setTimeout(SOCKET_TIMEOUT);

            this.#socket.on('close', this.onClose);
            this.#socket.on('connect', this.onConnect);
            this.#socket.on('data', this.onData);
            this.#socket.on('end', this.onEnd);
            this.#socket.on('error', this.onError);
            this.#socket.on('timeout', this.onTimeout);

            this.#context.logger.net(`Connecting to ${this.#address}:${this.#port}...`);

            this.#socket.connect({
                host: this.#address,
                port: this.#port
            });
        });
    }

    /** Removes all socket listeners, destroys the socket, and resets connection state. */
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

    /**
     * Schedules a retry attempt after a failed connection. If all attempts are exhausted,
     * transitions to 'failed' state and rejects the original connect promise.
     *
     * @param err - The error that triggered the retry.
     */
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

    /**
     * Handles the socket 'close' event. If the connection was active and closed
     * unexpectedly with an error, triggers a retry.
     *
     * @param hadError - Whether the close was caused by an error.
     */
    onClose(hadError: boolean): void {
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

    /**
     * Handles successful TCP connection. Enables keep-alive (10s interval),
     * disables the connection timeout, resets retry counter, and resolves the connect promise.
     */
    onConnect(): void {
        this.#state = 'connected';
        this.#retryAttempt = 0;

        this.#socket.setKeepAlive(true, 10000);
        this.#socket.setTimeout(0);

        this.#emitInternal('connect');
        this.#connectPromise?.resolve();
        this.#connectPromise = undefined;
    }

    /**
     * Handles incoming data from the socket. When debug mode is enabled,
     * logs a hex and ASCII dump of the first 64 bytes.
     *
     * @param data - The received data buffer.
     */
    onData(data: Buffer): void {
        if (this.#debug) {
            const cutoff = Math.min(data.byteLength, 64);
            this.#context.logger.debug(`Received ${data.byteLength} bytes of data.`);
            this.#context.logger.debug(`hex=${data.subarray(0, cutoff).toString('hex')}`);
            this.#context.logger.debug(`ascii=${data.toString('ascii').replace(/[^\x20-\x7E]/g, '.').substring(0, cutoff)}`);
        }

        this.#emitInternal('data', data);
    }

    /** Handles the socket 'end' event (remote end sent FIN). */
    onEnd(): void {
        this.#emitInternal('end');
    }

    /**
     * Handles socket errors. If connecting, schedules a retry; otherwise marks
     * the connection as failed. Warns if no error listener is registered.
     *
     * @param err - The socket error.
     */
    onError(err: Error): void {
        this.#context.logger.error(`Connection error: ${err.message}`);

        if (this.listenerCount('error') > 0) {
            this.#emitInternal('error', err);
        } else {
            this.#context.logger.warn('No error handler registered. This is likely a bug.', this.constructor.name, 'onError');
        }

        if (this.#state === 'connecting') {
            this.#scheduleRetry(err);
        }
        // Don't set 'failed' here for connected state — let onClose handle retry.
        // Setting 'failed' before onClose fires would cause onClose to see
        // wasConnected=false, preventing the retry logic from triggering.
    }

    /**
     * Handles socket timeout. If connecting, schedules a retry;
     * otherwise destroys the socket and marks the connection as failed.
     */
    onTimeout(): void {
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

    /**
     * Type-safe internal emit that narrows the event to ConnectionEventMap keys.
     * Needed because the merged TEventMap makes the standard emit signature too broad.
     *
     * @param event - The event name to emit.
     * @param args - The event arguments.
     * @returns Whether any listeners were called.
     */
    #emitInternal<K extends keyof ConnectionEventMap>(event: K, ...args: ConnectionEventMap[K]): boolean {
        return (this.emit as (...a: any[]) => boolean)(event, ...args);
    }
}

/**
 * Connection subclass that adds optional ChaCha20-Poly1305 encryption.
 * Once encryption is enabled, subclasses use the {@link EncryptionState}
 * to encrypt outgoing data and decrypt incoming data with per-message nonce counters.
 */
export class EncryptionAwareConnection<TEventMap extends EventMap> extends Connection<TEventMap> {
    /** Whether encryption has been enabled on this connection. */
    get isEncrypted(): boolean {
        return !!this._encryption;
    }

    /** The current encryption state, or undefined if encryption is not enabled. */
    _encryption?: EncryptionState;

    /**
     * Enables ChaCha20-Poly1305 encryption for this connection.
     * After calling this, all subsequent data must be encrypted/decrypted
     * using the provided keys.
     *
     * @param readKey - The 32-byte key for decrypting incoming data.
     * @param writeKey - The 32-byte key for encrypting outgoing data.
     */
    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this._encryption = new EncryptionState(readKey, writeKey);
    }
}

/**
 * Holds the symmetric encryption keys and nonce counters for a single
 * encrypted connection. Each message increments the corresponding counter
 * to ensure unique nonces for ChaCha20-Poly1305.
 */
export class EncryptionState {
    static readonly NONCE_COUNTER_OVERFLOW_THRESHOLD = Number.MAX_SAFE_INTEGER - 1;

    /** The 32-byte key used to decrypt incoming data. */
    readKey: Buffer;
    /** Monotonically increasing counter used as part of the read nonce. */
    readCount: number;
    /** The 32-byte key used to encrypt outgoing data. */
    writeKey: Buffer;
    /** Monotonically increasing counter used as part of the write nonce. */
    writeCount: number;

    /**
     * @param readKey - The 32-byte decryption key.
     * @param writeKey - The 32-byte encryption key.
     */
    constructor(readKey: Buffer, writeKey: Buffer) {
        this.readCount = 0;
        this.readKey = readKey;
        this.writeCount = 0;
        this.writeKey = writeKey;
    }

    nextReadCounter(): bigint {
        const counter = this.readCount;
        this.readCount = this.#nextCounter(counter, 'read');

        return BigInt(counter);
    }

    nextWriteCounter(): bigint {
        const counter = this.writeCount;
        this.writeCount = this.#nextCounter(counter, 'write');

        return BigInt(counter);
    }

    #nextCounter(counter: number, direction: 'read' | 'write'): number {
        if (!Number.isSafeInteger(counter) || counter < 0) {
            throw new ConnectionError(`Invalid ${direction} nonce counter.`);
        }

        if (counter > EncryptionState.NONCE_COUNTER_OVERFLOW_THRESHOLD) {
            throw new ConnectionError(`Exceeded maximum safe ${direction} nonce counter; reconnect required.`);
        }

        return counter + 1;
    }
}
