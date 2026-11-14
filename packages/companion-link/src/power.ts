import type { Channel } from './channel';
import type { Hid } from './hid';
import * as Messages from './messages';
import type { CompanionLinkState } from './state';
import type { AttentionState } from './types';
import { convertAttentionState } from './utils';

/**
 * Attention state and the power buttons. The state follows the `SystemStatus` and `TVSystemStatus`
 * events; its `attentionStateChanged` event reports a change.
 */
export class Power {
    /** The attention state the device reported last. */
    get attentionState(): AttentionState {
        return this.#state.attentionState;
    }

    readonly #channel: Channel;
    readonly #hid: Hid;
    readonly #state: CompanionLinkState;

    constructor(channel: Channel, hid: Hid, state: CompanionLinkState) {
        this.#channel = channel;
        this.#hid = hid;
        this.#state = state;
    }

    /** Asks the device for its attention state; the state is left as it is. */
    async fetch(): Promise<AttentionState> {
        const reply = await this.#channel.exchange(Messages.fetchAttentionState());

        return convertAttentionState(reply._c.state);
    }

    async isAwake(): Promise<boolean> {
        return await this.fetch() === 'awake';
    }

    /** Presses the Wake button. */
    async wake(): Promise<void> {
        await this.#hid.press('Wake', 'SingleTap');
    }

    /** Presses the Sleep button. */
    async sleep(): Promise<void> {
        await this.#hid.press('Sleep', 'SingleTap');
    }
}
