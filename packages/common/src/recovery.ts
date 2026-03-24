import { EventEmitter } from 'node:events';

/** Events emitted by {@link ConnectionRecovery}. */
type EventMap = {
    recovering: [attempt: number];
    recovered: [];
    failed: [errors: Error[]];
};

/** Configuration options for {@link ConnectionRecovery}. */
export type ConnectionRecoveryOptions = {
    /** Maximum number of recovery attempts before giving up. Defaults to 3. */
    maxAttempts?: number;
    /** Base delay in milliseconds for the first retry. Defaults to 1000. */
    baseDelay?: number;
    /** Maximum delay in milliseconds when using exponential backoff. Defaults to 30000. */
    maxDelay?: number;
    /** Whether to use exponential backoff (delay doubles each attempt). Defaults to true. */
    useExponentialBackoff?: boolean;
    /** If set to a positive value, periodically calls onReconnect at this interval (ms). Defaults to 0 (disabled). */
    reconnectInterval?: number;
    /** Callback that performs the actual reconnection. Called during recovery and scheduled reconnects. */
    onReconnect: () => Promise<void>;
};

/**
 * Manages automatic connection recovery with exponential backoff.
 *
 * When an unexpected disconnect occurs, this class schedules retry attempts
 * with configurable delay (exponential backoff by default: base=1s, max=30s).
 * Emits 'recovering', 'recovered', and 'failed' events for monitoring.
 *
 * Optionally supports a periodic reconnect interval for proactive
 * connection health checks (failures are silent; unexpected disconnects
 * trigger the full recovery flow).
 */
export class ConnectionRecovery extends EventEmitter<EventMap> {
    readonly #options: Required<Omit<ConnectionRecoveryOptions, 'onReconnect'>> & { onReconnect: () => Promise<void> };
    #attempt: number = 0;
    #errors: Error[] = [];
    #isRecovering: boolean = false;
    #isScheduledReconnecting: boolean = false;
    #retryTimeout?: NodeJS.Timeout;
    #reconnectInterval?: NodeJS.Timeout;
    #disposed: boolean = false;

    /**
     * @param options - Recovery configuration including the reconnect callback.
     */
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

    /** Whether a recovery attempt is currently in progress. */
    get isRecovering(): boolean {
        return this.#isRecovering;
    }

    /** The current retry attempt number (0 when not recovering). */
    get attempt(): number {
        return this.#attempt;
    }

    /**
     * Called when a disconnect is detected. Only triggers recovery for
     * unexpected disconnects; intentional disconnects are ignored.
     *
     * @param unexpected - Whether the disconnect was unexpected (e.g. socket error).
     */
    handleDisconnect(unexpected: boolean): void {
        if (this.#disposed || !unexpected) {
            return;
        }

        this.#stopReconnectInterval();
        this.#recover();
    }

    /** Resets the recovery state and restarts the periodic reconnect interval if configured. */
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

    /** Permanently disposes this recovery instance, cancelling all timers and removing listeners. */
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

    /**
     * Initiates a recovery attempt. If max attempts are reached, emits 'failed'
     * with all collected errors. Otherwise, schedules a delayed reconnect.
     */
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

    /**
     * Calculates the delay before the next retry attempt.
     * Uses exponential backoff (base * 2^(attempt-1)) capped at maxDelay,
     * or a flat baseDelay if exponential backoff is disabled.
     *
     * @returns The delay in milliseconds.
     */
    #calculateDelay(): number {
        if (!this.#options.useExponentialBackoff) {
            return this.#options.baseDelay;
        }

        const delay = this.#options.baseDelay * Math.pow(2, this.#attempt - 1);

        return Math.min(delay, this.#options.maxDelay);
    }

    /**
     * Starts the periodic reconnect interval. Silently calls onReconnect at the
     * configured interval; failures do not trigger recovery (that happens via handleDisconnect).
     */
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

    /** Stops the periodic reconnect interval timer. */
    #stopReconnectInterval(): void {
        if (this.#reconnectInterval) {
            clearInterval(this.#reconnectInterval);
            this.#reconnectInterval = undefined;
        }
    }
}
