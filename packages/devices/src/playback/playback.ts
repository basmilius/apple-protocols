import { type MediaRemote, SendCommandError } from '@corewire/airplay/mrp';
import { CommandRefusedError, UnavailableError } from '../errors';
import { REPEAT_TO_PROTO, SHUFFLE_TO_PROTO } from '../nowPlaying/snapshot';
import type { RepeatMode, ShuffleMode } from '../types';

/**
 * Playback commands for the now-playing app, sent as MRP SEND_COMMAND.
 *
 * @throws {CommandRefusedError} When the device refuses the command.
 */
export interface PlaybackControl {
    play(): Promise<void>;
    pause(): Promise<void>;
    togglePlayPause(): Promise<void>;
    stop(): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;

    /** @param seconds - 15 when omitted. */
    skipForward(seconds?: number): Promise<void>;

    /** @param seconds - 15 when omitted. */
    skipBackward(seconds?: number): Promise<void>;

    /** @param seconds - Position from the start. */
    seek(seconds: number): Promise<void>;

    setRepeat(mode: RepeatMode): Promise<void>;
    setShuffle(mode: ShuffleMode): Promise<void>;

    /** @param rate - 1 is normal speed. */
    setRate(rate: number): Promise<void>;
}

export class PlaybackController implements PlaybackControl {
    readonly #remote: () => MediaRemote | undefined;

    constructor(remote: () => MediaRemote | undefined) {
        this.#remote = remote;
    }

    async play(): Promise<void> {
        await this.#send(commands => commands.play());
    }

    async pause(): Promise<void> {
        await this.#send(commands => commands.pause());
    }

    async togglePlayPause(): Promise<void> {
        await this.#send(commands => commands.togglePlayPause());
    }

    async stop(): Promise<void> {
        await this.#send(commands => commands.stop());
    }

    async next(): Promise<void> {
        await this.#send(commands => commands.nextTrack());
    }

    async previous(): Promise<void> {
        await this.#send(commands => commands.previousTrack());
    }

    async skipForward(seconds: number = 15): Promise<void> {
        await this.#send(commands => commands.skipForward(seconds));
    }

    async skipBackward(seconds: number = 15): Promise<void> {
        await this.#send(commands => commands.skipBackward(seconds));
    }

    async seek(seconds: number): Promise<void> {
        await this.#send(commands => commands.seekToPosition(seconds));
    }

    async setRepeat(mode: RepeatMode): Promise<void> {
        await this.#send(commands => commands.setRepeatMode(REPEAT_TO_PROTO[mode]));
    }

    async setShuffle(mode: ShuffleMode): Promise<void> {
        await this.#send(commands => commands.setShuffleMode(SHUFFLE_TO_PROTO[mode]));
    }

    async setRate(rate: number): Promise<void> {
        await this.#send(commands => commands.changePlaybackRate(rate));
    }

    /** Runs a command and turns a refusal into a {@link CommandRefusedError} with string reasons. */
    async #send(command: (commands: MediaRemote['commands']) => Promise<void>): Promise<void> {
        const remote = this.#remote();

        if (!remote) {
            throw new UnavailableError('playback', 'disconnected');
        }

        try {
            await command(remote.commands);
        } catch (err) {
            if (err instanceof SendCommandError) {
                throw CommandRefusedError.from(err);
            }

            throw err;
        }
    }
}
