import { Proto } from '@basmilius/apple-airplay';
import type { AirPlayManager } from '../internal/airplay-manager';

/**
 * Media playback controller for Apple devices.
 * Provides play/pause/next/seek and other media commands via SendCommand (MRP protocol).
 */
export class PlaybackController {
    readonly #airplay: AirPlayManager;

    constructor(airplay: AirPlayManager) {
        this.#airplay = airplay;
    }

    async play(): Promise<void> {
        await this.#airplay.remote.commandPlay();
    }

    async pause(): Promise<void> {
        await this.#airplay.remote.commandPause();
    }

    async playPause(): Promise<void> {
        await this.#airplay.remote.commandTogglePlayPause();
    }

    async stop(): Promise<void> {
        await this.#airplay.remote.commandStop();
    }

    async next(): Promise<void> {
        await this.#airplay.remote.commandNextTrack();
    }

    async previous(): Promise<void> {
        await this.#airplay.remote.commandPreviousTrack();
    }

    async skipForward(seconds: number = 15): Promise<void> {
        await this.#airplay.remote.commandSkipForward(seconds);
    }

    async skipBackward(seconds: number = 15): Promise<void> {
        await this.#airplay.remote.commandSkipBackward(seconds);
    }

    async seekTo(position: number): Promise<void> {
        await this.#airplay.remote.commandSeekToPosition(position);
    }

    async setShuffleMode(mode: Proto.ShuffleMode_Enum): Promise<void> {
        await this.#airplay.remote.commandSetShuffleMode(mode);
    }

    async setRepeatMode(mode: Proto.RepeatMode_Enum): Promise<void> {
        await this.#airplay.remote.commandSetRepeatMode(mode);
    }

    async advanceShuffleMode(): Promise<void> {
        await this.#airplay.remote.commandAdvanceShuffleMode();
    }

    async advanceRepeatMode(): Promise<void> {
        await this.#airplay.remote.commandAdvanceRepeatMode();
    }

    async setPlaybackRate(rate: number): Promise<void> {
        await this.#airplay.remote.commandChangePlaybackRate(rate);
    }

    async setSleepTimer(seconds: number, stopMode: number = 0): Promise<void> {
        await this.#airplay.remote.commandSetSleepTimer(seconds, stopMode);
    }

    async beginFastForward(): Promise<void> {
        await this.#airplay.remote.commandBeginFastForward();
    }

    async endFastForward(): Promise<void> {
        await this.#airplay.remote.commandEndFastForward();
    }

    async beginRewind(): Promise<void> {
        await this.#airplay.remote.commandBeginRewind();
    }

    async endRewind(): Promise<void> {
        await this.#airplay.remote.commandEndRewind();
    }

    async nextChapter(): Promise<void> {
        await this.#airplay.remote.commandNextChapter();
    }

    async previousChapter(): Promise<void> {
        await this.#airplay.remote.commandPreviousChapter();
    }

    async likeTrack(): Promise<void> {
        await this.#airplay.remote.commandLikeTrack();
    }

    async dislikeTrack(): Promise<void> {
        await this.#airplay.remote.commandDislikeTrack();
    }

    async bookmarkTrack(): Promise<void> {
        await this.#airplay.remote.commandBookmarkTrack();
    }

    async addToLibrary(): Promise<void> {
        await this.#airplay.remote.commandAddNowPlayingItemToLibrary();
    }

    /**
     * Requests the playback queue from the device (includes artwork and metadata).
     *
     * @param length - Maximum number of queue items to retrieve (default: 1).
     */
    async requestPlaybackQueue(length: number = 1): Promise<void> {
        await this.#airplay.requestPlaybackQueue(length);
    }

    /**
     * Checks whether a playback command is currently supported by the active media app.
     */
    isCommandSupported(command: Proto.Command): boolean {
        const client = this.#airplay.state.nowPlayingClient;
        return client?.isCommandSupported(command) ?? false;
    }
}
