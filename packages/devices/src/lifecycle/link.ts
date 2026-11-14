import { EventEmitter } from 'node:events';
import { ConnectionClosedError } from '@corewire/core';
import type { CloseReason } from '@corewire/core/transport';
import type { LinkState, ProtocolStatus, RetryPhase, StatusReason } from '../types';
import { nextRetry, type Schedule } from './schedule';

export type LinkOptions<T> = {
    readonly schedule: Schedule;

    /** Resolves the device and connects; `first` is true for the attempt that {@link Link.start} runs. */
    open(signal: AbortSignal, first: boolean): Promise<T>;

    /** Calls `onClosed` once when the session ends, also when it already ended. */
    watch(session: T, onClosed: (reason: CloseReason, error?: Error) => void): void;

    close(session: T): Promise<void>;
};

type EventMap = {
    change: [reason: StatusReason];
};

/**
 * Keeps one protocol connected: connects, watches the session, and after a drop or a failed attempt
 * retries on its {@link Schedule} until {@link stop}. Every session it opens lives once.
 */
export class Link<T> extends EventEmitter<EventMap> {
    /** Whether a session was established since the last {@link start}. */
    get hasConnected(): boolean {
        return this.#hasConnected;
    }

    get session(): T | undefined {
        return this.#session;
    }

    get state(): LinkState {
        return this.#state;
    }

    get status(): ProtocolStatus {
        return {
            state: this.#state,
            attempt: this.#attempt,
            phase: this.#phase,
            nextAttemptAt: this.#nextAttemptAt,
            error: this.#error
        };
    }

    readonly #options: LinkOptions<T>;
    #abort?: AbortController;
    #attempt: number = 0;
    #error: Error | null = null;
    #hasConnected: boolean = false;
    #nextAttemptAt: number | null = null;
    #phase: RetryPhase | null = null;
    #retries: number = 0;
    #session?: T;
    #state: LinkState = 'off';
    #timer?: NodeJS.Timeout;

    constructor(options: LinkOptions<T>) {
        super();

        this.#options = options;
    }

    /** Runs the first attempt now. Does nothing unless the link is off. */
    start(): void {
        if (this.#state !== 'off') {
            return;
        }

        this.#attempt = 0;
        this.#error = null;
        this.#hasConnected = false;
        this.#phase = null;
        this.#retries = 0;

        this.#run('requested', true);
    }

    /** Cancels the schedule and any attempt in flight, then closes the session. */
    async stop(): Promise<void> {
        const session = this.#session;
        const wasOff = this.#state === 'off';

        clearTimeout(this.#timer);
        this.#timer = undefined;
        this.#abort?.abort(new ConnectionClosedError('The device was disconnected.'));
        this.#abort = undefined;
        this.#session = undefined;
        this.#state = 'off';
        this.#phase = null;
        this.#nextAttemptAt = null;

        if (!wasOff) {
            this.emit('change', 'requested');
        }

        if (session) {
            await this.#options.close(session).catch(() => undefined);
        }
    }

    #run(reason: StatusReason, first: boolean): void {
        const abort = new AbortController();

        this.#abort = abort;
        this.#timer = undefined;
        this.#nextAttemptAt = null;
        this.#state = 'connecting';
        this.emit('change', reason);

        this.#options.open(abort.signal, first).then(
            session => this.#opened(abort, session),
            error => this.#failed(abort, error)
        );
    }

    #opened(abort: AbortController, session: T): void {
        if (this.#abort !== abort) {
            void this.#options.close(session).catch(() => undefined);

            return;
        }

        this.#abort = undefined;
        this.#session = session;
        this.#state = 'connected';
        this.#attempt = 0;
        this.#error = null;
        this.#hasConnected = true;
        this.#phase = null;
        this.#retries = 0;
        this.emit('change', 'established');

        this.#options.watch(session, (reason, error) => this.#closed(session, reason, error));
    }

    #failed(abort: AbortController, error: unknown): void {
        if (this.#abort !== abort) {
            return;
        }

        this.#abort = undefined;
        this.#error = error instanceof Error ? error : new Error(String(error));
        this.#schedule('failed');
    }

    /** A close this link did not ask for; its own closes clear the session first. */
    #closed(session: T, reason: CloseReason, error?: Error): void {
        if (this.#session !== session) {
            return;
        }

        this.#session = undefined;
        this.#error = error ?? new ConnectionClosedError(`The session closed (${reason}).`);
        this.#retries = 0;
        this.#schedule(reason === 'local' ? 'error' : reason);
    }

    #schedule(reason: StatusReason): void {
        const retry = nextRetry(this.#options.schedule, this.#retries);

        this.#retries++;
        this.#attempt = this.#retries;
        this.#phase = retry.phase;
        this.#nextAttemptAt = Date.now() + retry.delay;
        this.#state = 'waiting';
        this.#timer = setTimeout(() => this.#run('scheduled', false), retry.delay);
        this.emit('change', reason);
    }
}
