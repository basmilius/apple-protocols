import type { DescExtension } from '@bufbuild/protobuf';
import { CommandError } from '@corewire/core';
import type { DataChannel } from '../channels/data';
import * as Messages from './messages';
import * as Proto from './proto';

/** The receiver refused a SendCommand. */
export class SendCommandError extends CommandError {
    readonly sendError: Proto.SendError_Enum;
    readonly handlerReturnStatus: Proto.HandlerReturnStatus_Enum;

    constructor(sendError: Proto.SendError_Enum, handlerReturnStatus: Proto.HandlerReturnStatus_Enum) {
        super(`SendCommand failed: sendError=${Proto.SendError_Enum[sendError]}, handlerReturnStatus=${Proto.HandlerReturnStatus_Enum[handlerReturnStatus]}`);
        this.name = 'SendCommandError';
        this.sendError = sendError;
        this.handlerReturnStatus = handlerReturnStatus;
    }
}

/**
 * Playback commands to the now-playing app, each a SEND_COMMAND exchange. A result with a send
 * error throws {@link SendCommandError}; a reply without a result counts as success.
 */
export class Commands {
    readonly #channel: DataChannel;

    constructor(channel: DataChannel) {
        this.#channel = channel;
    }

    /** @throws {SendCommandError} When the receiver reports a send error. */
    async send(command: Proto.Command, options?: Proto.CommandOptions): Promise<Proto.SendCommandResultMessage | undefined> {
        return await this.#exchange(Messages.sendCommand(command, options));
    }

    async play(): Promise<void> {
        await this.send(Proto.Command.Play);
    }

    async pause(): Promise<void> {
        await this.send(Proto.Command.Pause);
    }

    async togglePlayPause(): Promise<void> {
        await this.send(Proto.Command.TogglePlayPause);
    }

    async stop(): Promise<void> {
        await this.send(Proto.Command.Stop);
    }

    async nextTrack(): Promise<void> {
        await this.send(Proto.Command.NextTrack);
    }

    async previousTrack(): Promise<void> {
        await this.send(Proto.Command.PreviousTrack);
    }

    /** @param interval - Seconds. */
    async skipForward(interval: number = 15): Promise<void> {
        await this.#exchange(Messages.sendCommandWithSkipInterval(Proto.Command.SkipForward, interval));
    }

    /** @param interval - Seconds. */
    async skipBackward(interval: number = 15): Promise<void> {
        await this.#exchange(Messages.sendCommandWithSkipInterval(Proto.Command.SkipBackward, interval));
    }

    /** @param position - Seconds from the start. */
    async seekToPosition(position: number): Promise<void> {
        await this.#exchange(Messages.sendCommandWithPlaybackPosition(Proto.Command.SeekToPlaybackPosition, position));
    }

    async setShuffleMode(mode: Proto.ShuffleMode_Enum): Promise<void> {
        await this.#exchange(Messages.sendCommandWithShuffleMode(Proto.Command.ChangeShuffleMode, mode));
    }

    async setRepeatMode(mode: Proto.RepeatMode_Enum): Promise<void> {
        await this.#exchange(Messages.sendCommandWithRepeatMode(Proto.Command.ChangeRepeatMode, mode));
    }

    /** @param rate - 1 is normal speed. */
    async changePlaybackRate(rate: number): Promise<void> {
        await this.#exchange(Messages.sendCommandWithPlaybackRate(Proto.Command.ChangePlaybackRate, rate));
    }

    async advanceShuffleMode(): Promise<void> {
        await this.send(Proto.Command.AdvanceShuffleMode);
    }

    async advanceRepeatMode(): Promise<void> {
        await this.send(Proto.Command.AdvanceRepeatMode);
    }

    async beginFastForward(): Promise<void> {
        await this.send(Proto.Command.BeginFastForward);
    }

    async endFastForward(): Promise<void> {
        await this.send(Proto.Command.EndFastForward);
    }

    async beginRewind(): Promise<void> {
        await this.send(Proto.Command.BeginRewind);
    }

    async endRewind(): Promise<void> {
        await this.send(Proto.Command.EndRewind);
    }

    async nextChapter(): Promise<void> {
        await this.send(Proto.Command.NextChapter);
    }

    async previousChapter(): Promise<void> {
        await this.send(Proto.Command.PreviousChapter);
    }

    async likeTrack(): Promise<void> {
        await this.send(Proto.Command.LikeTrack);
    }

    async dislikeTrack(): Promise<void> {
        await this.send(Proto.Command.DislikeTrack);
    }

    async bookmarkTrack(): Promise<void> {
        await this.send(Proto.Command.BookmarkTrack);
    }

    async addNowPlayingItemToLibrary(): Promise<void> {
        await this.send(Proto.Command.AddNowPlayingItemToLibrary);
    }

    /**
     * Sets a sleep timer. It goes out as an option on a Pause command.
     *
     * @param seconds - Timer duration; 0 cancels a running timer.
     * @param stopMode - 0 stops playback, 1 pauses, 2 waits for the end of the track, 3 for the end of the queue.
     */
    async setSleepTimer(seconds: number, stopMode: number = 0): Promise<void> {
        await this.#exchange(Messages.sendCommandWithSleepTimer(seconds, stopMode));
    }

    async #exchange(message: [Proto.ProtocolMessage, DescExtension]): Promise<Proto.SendCommandResultMessage | undefined> {
        const response = await this.#channel.exchange(message);
        let result: Proto.SendCommandResultMessage | undefined;

        try {
            result = Messages.getExtension(response, Proto.sendCommandResultMessage);
        } catch {
            return undefined;
        }

        if (!result) {
            return undefined;
        }

        if (result.sendError !== Proto.SendError_Enum.NoError) {
            throw new SendCommandError(result.sendError, result.handlerReturnStatus);
        }

        return result;
    }
}
