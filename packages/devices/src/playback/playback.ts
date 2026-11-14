import type { MediaRemote } from '@corewire/airplay/mrp';
import { UnavailableError } from '../errors';
import { REPEAT_TO_PROTO, SHUFFLE_TO_PROTO } from '../nowPlaying/snapshot';
import type { RepeatMode, ShuffleMode } from '../types';

/**
 * Playback commands for the now-playing app, sent as MRP SEND_COMMAND.
 *
 * @throws {SendCommandError} When the device reports a send error.
 */
export class PlaybackControl {
    readonly #remote: () => MediaRemote | undefined;

    constructor(remote: () => MediaRemote | undefined) {
        this.#remote = remote;
    }

    async play(): Promise<void> {
        await this.#commands().play();
    }

    async pause(): Promise<void> {
        await this.#commands().pause();
    }

    async togglePlayPause(): Promise<void> {
        await this.#commands().togglePlayPause();
    }

    async stop(): Promise<void> {
        await this.#commands().stop();
    }

    async next(): Promise<void> {
        await this.#commands().nextTrack();
    }

    async previous(): Promise<void> {
        await this.#commands().previousTrack();
    }

    async skipForward(seconds: number = 15): Promise<void> {
        await this.#commands().skipForward(seconds);
    }

    async skipBackward(seconds: number = 15): Promise<void> {
        await this.#commands().skipBackward(seconds);
    }

    /** @param seconds - Position from the start. */
    async seek(seconds: number): Promise<void> {
        await this.#commands().seekToPosition(seconds);
    }

    async setRepeat(mode: RepeatMode): Promise<void> {
        await this.#commands().setRepeatMode(REPEAT_TO_PROTO[mode]);
    }

    async setShuffle(mode: ShuffleMode): Promise<void> {
        await this.#commands().setShuffleMode(SHUFFLE_TO_PROTO[mode]);
    }

    /** @param rate - 1 is normal speed. */
    async setRate(rate: number): Promise<void> {
        await this.#commands().changePlaybackRate(rate);
    }

    #commands(): MediaRemote['commands'] {
        const remote = this.#remote();

        if (!remote) {
            throw new UnavailableError('playback', 'disconnected');
        }

        return remote.commands;
    }
}
