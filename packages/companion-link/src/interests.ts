import type { Channel, EventListener } from './channel';
import * as Messages from './messages';

/** The events the device pushes once interest in them is registered, such as `_iMC` or `SystemStatus`. */
export class Interests {
    readonly #channel: Channel;

    constructor(channel: Channel) {
        this.#channel = channel;
    }

    /** Registers interest in the events, in one `_interest` event. */
    register(events: string[]): void {
        this.#channel.send(Messages.registerInterests(events));
    }

    /** Deregisters interest in the events; nothing when the socket is gone, so a teardown cannot fail on it. */
    deregister(events: string[]): void {
        if (!this.#channel.isConnected) {
            return;
        }

        this.#channel.send(Messages.deregisterInterests(events));
    }

    /** Listens to an event, until the session ends, and registers interest in it. */
    subscribe(event: string, listener: EventListener): void {
        this.#channel.listen(event, listener);
        this.register([event]);
    }

    /** Stops listening, when a listener is given, and deregisters interest in the event. */
    unsubscribe(event: string, listener?: EventListener): void {
        if (listener) {
            this.#channel.unlisten(event, listener);
        }

        this.deregister([event]);
    }
}
