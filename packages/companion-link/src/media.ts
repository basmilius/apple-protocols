import type { Channel } from './channel';
import { MediaControlCommand, type MediaControlCommandKey } from './const';
import * as Messages from './messages';
import type { CompanionLinkState } from './state';
import type { MediaCapabilities } from './types';

/**
 * Media control over `_mcc`, what the device reports about playback, and playing a media item.
 * The flags follow the `_iMC` events; the state reports a change.
 */
export class Media {
    get capabilities(): MediaCapabilities {
        return this.#state.mediaCapabilities;
    }

    /** The raw `_iMC` bitmask, see `MediaControlFlag`. */
    get flags(): number {
        return this.#state.mediaControlFlags;
    }

    get nowPlayingInfo(): Record<string, unknown> | null {
        return this.#state.nowPlayingInfo;
    }

    get supportedActions(): Record<string, unknown> | null {
        return this.#state.supportedActions;
    }

    get volumeAvailable(): boolean {
        return this.#state.volumeAvailable;
    }

    readonly #channel: Channel;
    readonly #state: CompanionLinkState;

    constructor(channel: Channel, state: CompanionLinkState) {
        this.#channel = channel;
        this.#state = state;
    }

    /** @param content Extra fields of the command, such as the volume for `SetVolume`. */
    async command(command: MediaControlCommandKey, content?: Record<string, unknown>): Promise<object> {
        return await this.#channel.exchange(Messages.mediaControlCommand(MediaControlCommand[command], content));
    }

    /** Skips forward, or backward for a negative number of seconds. */
    async skipBy(seconds: number): Promise<object> {
        return await this.#channel.exchange(Messages.mediaSkipBySeconds(seconds));
    }

    /** Asks for the media control status; the reply is not used. */
    async fetchControlStatus(): Promise<void> {
        await this.#channel.exchange(Messages.fetchMediaControlStatus());
    }

    /** The now playing information, as the raw reply. */
    async fetchNowPlayingInfo(): Promise<any> {
        return await this.#channel.exchange(Messages.fetchNowPlayingInfo());
    }

    /** Asks for the supported actions; the reply is not used. */
    async fetchSupportedActions(): Promise<void> {
        await this.#channel.exchange(Messages.fetchSupportedActions());
    }

    /** Plays a media item, described by the OPack dictionary the device expects. */
    async play(item: Record<string, unknown>): Promise<void> {
        await this.#channel.exchange(Messages.playMedia(item));
    }
}
