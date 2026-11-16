import { EventEmitter } from 'node:events';
import type { MediaRemote } from '@apple-protocols/airplay/mrp';
import type { CompanionLinkState } from '@apple-protocols/companion-link';
import { UnavailableError } from '../errors';
import type { PowerState } from '../types';

export type PowerEventMap = {
    change: [state: PowerState];
};

/**
 * Power of an Apple TV. The state comes from Companion Link and `change` fires on every report,
 * including the one each Companion Link connect fetches, so a consumer can resync then. Waking and
 * sleeping are AirPlay HID keys.
 */
export interface PowerControl extends EventEmitter<PowerEventMap> {
    /** The last reported state; `unknown` before Companion Link reported one. */
    readonly state: PowerState;

    wake(): Promise<void>;
    sleep(): Promise<void>;
}

export class PowerController extends EventEmitter<PowerEventMap> implements PowerControl {
    /** The last reported state; `unknown` before Companion Link reported one. */
    get state(): PowerState {
        return this.#state;
    }

    readonly #remote: () => MediaRemote | undefined;
    #state: PowerState = 'unknown';

    constructor(companionLinkState: CompanionLinkState, remote: () => MediaRemote | undefined) {
        super();

        this.#remote = remote;

        companionLinkState.on('attentionStateChanged', state => {
            this.#state = state;
            this.emit('change', state);
        });
    }

    /** Sets the state back to `unknown` once a disconnect closed the sessions, as for a new device. */
    reset(): void {
        this.#state = 'unknown';
    }

    async wake(): Promise<void> {
        await this.#hid().wake();
    }

    async sleep(): Promise<void> {
        await this.#hid().suspend();
    }

    #hid(): MediaRemote['hid'] {
        const remote = this.#remote();

        if (!remote) {
            throw new UnavailableError('power', 'disconnected');
        }

        return remote.hid;
    }
}
