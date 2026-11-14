import type { DataChannel } from '../channels/data';
import * as Messages from './messages';
import type * as Proto from './proto';
import type { MediaRemoteState } from './state';

/**
 * Requests for the playback queue. The receiver answers with a SET_STATE carrying the queue, so
 * the result lands in the state; these only wait for the reply.
 */
export class PlaybackQueue {
    readonly #channel: DataChannel;
    readonly #state: MediaRemoteState;

    constructor(channel: DataChannel, state: MediaRemoteState) {
        this.#channel = channel;
        this.#state = state;
    }

    /** Requests the first `length` items of the queue. */
    async request(length: number, artworkWidth?: number, artworkHeight?: number): Promise<void> {
        await this.#channel.exchange(Messages.playbackQueueRequest(0, length, artworkWidth, artworkHeight));
    }

    /**
     * Requests extra assets of the current item, such as artwork formats or lyrics, and returns
     * the item once they arrived.
     *
     * @returns Null without a current item, or when the track changed while waiting.
     * @throws {Error} When the receiver answers with an error code.
     */
    async requestAssets(options: Partial<Messages.PlaybackQueueAssetOptions> = {}, width: number = 600, height: number = -1): Promise<Proto.ContentItem | null> {
        const player = this.#state.nowPlayingClient?.activePlayer;
        const identifier = player?.currentItem?.identifier;

        if (!identifier) {
            return null;
        }

        // TVMusic returns sparse metadata for identifier-only requests; request the current queue window.
        const response = await this.#channel.exchange(Messages.playbackQueueRequest(0, 1, width, height, {
            ...options,
            playerPath: player.playbackQueue?.resolvedPlayerPath
        }));

        if (response.errorCode) {
            throw new Error(`Content item request failed: ${response.errorDescription || response.errorCode}`);
        }

        if (this.#state.nowPlayingClient?.activePlayer !== player || player.currentItem?.identifier !== identifier) {
            return null;
        }

        return player.currentItem;
    }
}
