import { CommandError, ConnectionClosedError, TimeoutError } from '@apple-protocols/core';
import { RTI } from '@apple-protocols/core/encoding';
import type { DataChannel } from '../channels/data';
import * as Messages from './messages';
import type * as Proto from './proto';

/** How long the receiver gets to hand out an RTI text session, in milliseconds. */
const TEXT_SESSION_TIMEOUT = 5000;

type TextSession = {
    readonly session: RTI.TextInputSession;
    readonly version: bigint;
};

/**
 * Text input over MRP. Every operation asks the receiver for its current RTI text session first,
 * then sends the edit for that session. Operations run one at a time, in call order.
 */
export class Keyboard {
    readonly #channel: DataChannel;
    #queue: Promise<unknown> = Promise.resolve();

    constructor(channel: DataChannel) {
        this.#channel = channel;
    }

    /** Replaces the text in the focused field. */
    async set(text: string): Promise<void> {
        await this.#enqueue(text, true);
    }

    async append(text: string): Promise<void> {
        await this.#enqueue(text, false);
    }

    async clear(): Promise<void> {
        await this.#enqueue('', true);
    }

    /** Asks for the keyboard session; the answer arrives as a KEYBOARD message on the state. */
    async getSession(): Promise<void> {
        this.#channel.send(Messages.getKeyboardSession());
    }

    #enqueue(text: string, clear: boolean): Promise<void> {
        const operation = this.#queue.then(async () => {
            if (!this.#channel.isConnected) {
                throw new ConnectionClosedError();
            }

            const {session, version} = await this.#requestSession();

            if (!this.#channel.isConnected) {
                throw new ConnectionClosedError();
            }

            if (clear) {
                this.#channel.send(Messages.remoteTextInput(new Uint8Array(RTI.encodeOperation(session.uuid, '', true)), version));
            }

            if (text) {
                this.#channel.send(Messages.remoteTextInput(new Uint8Array(RTI.encodeOperation(session.uuid, text, false)), version));
            }
        });

        this.#queue = operation.catch(() => {});

        return operation;
    }

    #requestSession(): Promise<TextSession> {
        const channel = this.#channel;

        return new Promise((resolve, reject) => {
            const cleanup = (): void => {
                clearTimeout(timer);
                channel.off('remoteTextInput', onSession);
                channel.off('closed', onClose);
                channel.off('error', onError);
            };

            const onError = (error: Error): void => {
                cleanup();
                reject(error);
            };

            const onClose = (): void => onError(new ConnectionClosedError());

            const onSession = (message: Proto.RemoteTextInputMessage): void => {
                try {
                    if (!message.data?.byteLength) {
                        throw new CommandError('No active AirPlay text input session.');
                    }

                    if (message.version !== 1n) {
                        throw new CommandError('Unsupported AirPlay text input version.');
                    }

                    const session = RTI.decodeSession(message.data);

                    cleanup();
                    resolve({session, version: message.version});
                } catch (error) {
                    onError(error instanceof Error ? error : new Error(String(error)));
                }
            };

            const timer = setTimeout(() => onError(new TimeoutError('AirPlay did not provide an RTI text session.')), TEXT_SESSION_TIMEOUT);

            channel.on('remoteTextInput', onSession);
            channel.on('closed', onClose);
            channel.on('error', onError);

            try {
                channel.send(Messages.getRemoteTextInputSession());
            } catch (error) {
                onError(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }
}
