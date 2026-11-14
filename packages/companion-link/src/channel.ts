import { CommandError } from '@corewire/core';
import { FrameType } from './frame';
import type { OPackMessage } from './messages';
import type { Stream } from './stream';

/** A decoded reply; `_c` holds the content. */
export type Reply = Record<string, any>;

/** Receives the `_c` of an event. */
export type EventListener = (content: unknown) => void;

/**
 * What the groups of a session send with: encrypted requests that check the reply, events without
 * one, and the events the device sends. Listeners go when the session signal aborts.
 */
export class Channel {
    /** Aborts when the session ends. */
    get signal(): AbortSignal {
        return this.#signal;
    }

    /** Whether the socket can still carry a frame; false while the session closes. */
    get isConnected(): boolean {
        return this.#stream.isConnected;
    }

    readonly #listeners: Map<string, Set<EventListener>> = new Map();
    readonly #signal: AbortSignal;
    readonly #stream: Stream;

    constructor(stream: Stream, signal: AbortSignal) {
        this.#signal = signal;
        this.#stream = stream;

        if (signal.aborted) {
            return;
        }

        const onEvent = (name: string, content: unknown): void => this.#dispatch(name, content);

        stream.on('event', onEvent);
        signal.addEventListener('abort', () => {
            stream.off('event', onEvent);
            this.#listeners.clear();
        }, {once: true});
    }

    /**
     * Sends a request and resolves with its reply.
     *
     * @throws {CommandError} When the reply carries `_em` or a non-zero `_ec`.
     * @throws {TimeoutError} When no reply arrives in time.
     * @throws {ConnectionClosedError} When the session ends first.
     */
    async exchange(message: OPackMessage): Promise<Reply> {
        const [, response] = await this.#stream.exchange(FrameType.OPackEncrypted, message);
        const reply = objectOrFail(response);

        if (reply._em || (reply._ec !== undefined && Number(reply._ec) !== 0)) {
            const details = [reply._ed, reply._ec === undefined ? undefined : Number(reply._ec)]
                .filter(value => value !== undefined)
                .join(' ');

            throw new CommandError(`${message._i}: ${reply._em || 'Command failed'}${details ? ` (${details})` : ''}`);
        }

        return reply;
    }

    /**
     * Sends an event, which gets no reply.
     *
     * @throws {ConnectionClosedError} When the session has ended.
     */
    send(message: OPackMessage): void {
        this.#stream.sendOPack(FrameType.OPackEncrypted, message);
    }

    /** Calls the listener with the `_c` of every event with this name, until the session ends. */
    listen(name: string, listener: EventListener): void {
        if (this.#signal.aborted) {
            return;
        }

        let listeners = this.#listeners.get(name);

        if (!listeners) {
            listeners = new Set();
            this.#listeners.set(name, listeners);
        }

        listeners.add(listener);
    }

    unlisten(name: string, listener: EventListener): void {
        this.#listeners.get(name)?.delete(listener);
    }

    #dispatch(name: string, content: unknown): void {
        for (const listener of [...this.#listeners.get(name) ?? []]) {
            listener(content);
        }
    }
}

/** @throws {TypeError} When the value is not an object. */
export function objectOrFail<T = Reply>(value: unknown): T {
    if (value !== null && typeof value === 'object') {
        return value as T;
    }

    throw new TypeError('Expected an object.');
}
