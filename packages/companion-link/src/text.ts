import { RTI } from '@corewire/core/encoding';
import type { Channel } from './channel';
import * as Messages from './messages';
import type { CompanionLinkState } from './state';
import type { TextInputState } from './types';

/**
 * Remote text input into the focused field. Operations run one at a time; each one starts the
 * text input session anew for the keyboard session UUID. An operation queued before the field
 * changed, stopped or the session ended fails instead of typing into the wrong field.
 */
export class Text {
    /** The text input session the device reported last. */
    get state(): TextInputState {
        return this.#state.textInputState;
    }

    readonly #channel: Channel;
    readonly #state: CompanionLinkState;
    #generation: number = 0;
    #queue: Promise<unknown> = Promise.resolve();
    #session?: string;

    constructor(channel: Channel, state: CompanionLinkState) {
        this.#channel = channel;
        this.#state = state;

        channel.listen('_tiStarted', content => this.#onStarted(content));
        channel.listen('_tiStopped', () => this.#onStopped());
        channel.signal.addEventListener('abort', () => this.#generation++, {once: true});
    }

    /** Replaces the text of the field. */
    async set(text: string): Promise<void> {
        await this.command(text, true);
    }

    async append(text: string): Promise<void> {
        await this.command(text, false);
    }

    async clear(): Promise<void> {
        await this.command('', true);
    }

    /**
     * Clears the field when asked, then inserts the text when there is any.
     *
     * @throws {Error} When no field has focus, or the field changed before the operation ran.
     */
    command(text: string, clearPreviousInput: boolean): Promise<string | null> {
        const generation = this.#generation;
        const operation = this.#queue.then(async () => {
            if (generation !== this.#generation) {
                throw new Error('Text input session changed.');
            }

            const reply = await this.start();

            if (generation !== this.#generation) {
                throw new Error('Text input session changed; retry with the active field.');
            }

            const data = reply?._c?._tiD;

            if (!data) {
                throw new Error('No active text input session.');
            }

            const session = RTI.decodeSession(data);

            if (clearPreviousInput) {
                this.#channel.send(Messages.tiChange(Buffer.from(RTI.encodeOperation(session.uuid, '', true))));
            }

            if (text) {
                this.#channel.send(Messages.tiChange(Buffer.from(RTI.encodeOperation(session.uuid, text, false))));
            }

            return text;
        });

        this.#queue = operation.catch(() => {});

        return operation;
    }

    /** Starts the text input session; the reply carries the keyboard session in `_c._tiD`. */
    async start(): Promise<Record<string, any>> {
        return await this.#channel.exchange(Messages.tiStart());
    }

    async stop(): Promise<void> {
        await this.#channel.exchange(Messages.tiStop());
    }

    /** A field with another keyboard session UUID is another field. */
    #onStarted(content: unknown): void {
        try {
            const uuid = Buffer.from(RTI.decodeSession((content as {_tiD?: Uint8Array})?._tiD).uuid).toString('hex');

            if (this.#session && this.#session !== uuid) {
                this.#generation++;
            }

            this.#session = uuid;
        } catch {
            this.#generation++;
            this.#session = undefined;
        }
    }

    #onStopped(): void {
        this.#generation++;
        this.#session = undefined;
    }
}
