import { EventEmitter } from 'node:events';

type EventMap = {
    recovering: [attempt: number];
    recovered: [];
    failed: [errors: Error[]];
};

export type ConnectionRecoveryOptions = {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    useExponentialBackoff?: boolean;
    reconnectInterval?: number;
    onReconnect: () => Promise<void>;
};

export class ConnectionRecovery extends EventEmitter<EventMap> {
    readonly #options: Required<Omit<ConnectionRecoveryOptions, 'onReconnect'>> & { onReconnect: () => Promise<void> };
    #attempt: number = 0;
    #errors: Error[] = [];
    #isRecovering: boolean = false;
    #isScheduledReconnecting: boolean = false;
    #retryTimeout?: NodeJS.Timeout;
    #reconnectInterval?: NodeJS.Timeout;
    #disposed: boolean = false;

    constructor(options: ConnectionRecoveryOptions) {
        super();

        this.#options = {
            maxAttempts: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            useExponentialBackoff: true,
            reconnectInterval: 0,
            ...options
        };

        if (this.#options.reconnectInterval > 0) {
            this.#startReconnectInterval();
        }
    }

    get isRecovering(): boolean {
        return this.#isRecovering;
    }

    get attempt(): number {
        return this.#attempt;
    }

    handleDisconnect(unexpected: boolean): void {
        if (this.#disposed || !unexpected) {
            return;
        }

        this.#stopReconnectInterval();
        this.#recover();
    }

    reset(): void {
        this.#attempt = 0;
        this.#errors = [];
        this.#isRecovering = false;

        if (this.#retryTimeout) {
            clearTimeout(this.#retryTimeout);
            this.#retryTimeout = undefined;
        }

        if (this.#options.reconnectInterval > 0) {
            this.#startReconnectInterval();
        }
    }

    dispose(): void {
        this.#disposed = true;
        this.#isRecovering = false;
        this.#isScheduledReconnecting = false;

        if (this.#retryTimeout) {
            clearTimeout(this.#retryTimeout);
            this.#retryTimeout = undefined;
        }

        this.#stopReconnectInterval();
        this.removeAllListeners();
    }

    #recover(): void {
        if (this.#isRecovering || this.#disposed) {
            return;
        }

        if (this.#attempt >= this.#options.maxAttempts) {
            this.emit('failed', this.#errors);
            return;
        }

        this.#isRecovering = true;
        this.#attempt++;

        this.emit('recovering', this.#attempt);

        const delay = this.#calculateDelay();

        this.#retryTimeout = setTimeout(async () => {
            this.#retryTimeout = undefined;

            try {
                await this.#options.onReconnect();
                this.#isRecovering = false;
                this.#attempt = 0;
                this.#errors = [];
                this.emit('recovered');

                if (this.#options.reconnectInterval > 0) {
                    this.#startReconnectInterval();
                }
            } catch (err) {
                this.#isRecovering = false;
                this.#errors.push(err instanceof Error ? err : new Error(String(err)));
                this.#recover();
            }
        }, delay);
    }

    #calculateDelay(): number {
        if (!this.#options.useExponentialBackoff) {
            return this.#options.baseDelay;
        }

        const delay = this.#options.baseDelay * Math.pow(2, this.#attempt - 1);

        return Math.min(delay, this.#options.maxDelay);
    }

    #startReconnectInterval(): void {
        this.#stopReconnectInterval();

        this.#reconnectInterval = setInterval(async () => {
            if (this.#isRecovering || this.#disposed || this.#isScheduledReconnecting) {
                return;
            }

            this.#isScheduledReconnecting = true;

            try {
                await this.#options.onReconnect();
            } catch (_) {
                // Scheduled reconnect failures are silent; unexpected
                // disconnects will trigger recovery via handleDisconnect.
            } finally {
                this.#isScheduledReconnecting = false;
            }
        }, this.#options.reconnectInterval);
    }

    #stopReconnectInterval(): void {
        if (this.#reconnectInterval) {
            clearInterval(this.#reconnectInterval);
            this.#reconnectInterval = undefined;
        }
    }
}
