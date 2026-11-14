import type { DataChannel } from '../channels/data';
import * as Messages from './messages';
import type { MediaRemoteState } from './state';

/** The output context of the receiver: which devices play along, and per-device audio settings. */
export class OutputDevices {
    readonly #channel: DataChannel;
    readonly #state: MediaRemoteState;

    constructor(channel: DataChannel, state: MediaRemoteState) {
        this.#channel = channel;
        this.#state = state;
    }

    /** Adds devices to the output context. */
    async add(deviceUIDs: string[]): Promise<void> {
        await this.#channel.exchange(Messages.modifyOutputContext(deviceUIDs));
    }

    /** Removes devices from the output context. */
    async remove(deviceUIDs: string[]): Promise<void> {
        await this.#channel.exchange(Messages.modifyOutputContext([], deviceUIDs));
    }

    /** Replaces the output context with these devices. */
    async set(deviceUIDs: string[]): Promise<void> {
        await this.#channel.exchange(Messages.modifyOutputContext([], [], deviceUIDs));
    }

    /**
     * Turns conversation detection of the active output device on or off (HomePod).
     *
     * @throws {Error} When no output device is active.
     */
    async setConversationDetectionEnabled(enabled: boolean): Promise<void> {
        const outputDeviceUID = this.#state.outputDeviceUID;

        if (!outputDeviceUID) {
            throw new Error('No output device active.');
        }

        this.#channel.send(Messages.setConversationDetectionEnabled(enabled, outputDeviceUID));
    }

    /** Sets the listening mode of the active output device (HomePod), e.g. `Default`, `Vivid`, `LateNight`. Does nothing without one. */
    async setListeningMode(mode: string): Promise<void> {
        const outputDeviceUID = this.#state.outputDeviceUID;

        if (outputDeviceUID) {
            this.#channel.send(Messages.setListeningMode(mode, outputDeviceUID));
        }
    }
}
