import { type DataStream, DataStreamMessage, Proto, type Protocol } from '@basmilius/apple-airplay';
import { CommandError, waitFor } from '@basmilius/apple-common';
import { PROTOCOL } from './const';
import type Device from './device';

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

export default class {
    get #dataStream(): DataStream {
        return this.#protocol.dataStream;
    }

    get #protocol(): Protocol {
        return this.#device[PROTOCOL];
    }

    readonly #device: Device;

    constructor(device: Device) {
        this.#device = device;
    }

    // HID navigation

    async up(): Promise<void> {
        await this.pressAndRelease(1, 0x8C);
    }

    async down(): Promise<void> {
        await this.pressAndRelease(1, 0x8D);
    }

    async left(): Promise<void> {
        await this.pressAndRelease(1, 0x8B);
    }

    async right(): Promise<void> {
        await this.pressAndRelease(1, 0x8A);
    }

    async menu(): Promise<void> {
        await this.pressAndRelease(1, 0x86);
    }

    async select(): Promise<void> {
        await this.pressAndRelease(1, 0x89);
    }

    async home(): Promise<void> {
        await this.pressAndRelease(12, 0x40);
    }

    async suspend(): Promise<void> {
        await this.pressAndRelease(1, 0x82);
    }

    async wake(): Promise<void> {
        await this.pressAndRelease(1, 0x83);
    }

    // HID media

    async play(): Promise<void> {
        await this.pressAndRelease(12, 0xB0);
    }

    async pause(): Promise<void> {
        await this.pressAndRelease(12, 0xB1);
    }

    async playPause(): Promise<void> {
        if (this.#device.state.nowPlayingClient?.isPlaying) {
            await this.pause();
        } else {
            await this.play();
        }
    }

    async stop(): Promise<void> {
        await this.pressAndRelease(12, 0xB7);
    }

    async next(): Promise<void> {
        await this.pressAndRelease(12, 0xB5);
    }

    async previous(): Promise<void> {
        await this.pressAndRelease(12, 0xB6);
    }

    async volumeUp(): Promise<void> {
        await this.pressAndRelease(12, 0xE9);
    }

    async volumeDown(): Promise<void> {
        await this.pressAndRelease(12, 0xEA);
    }

    async mute(): Promise<void> {
        await this.pressAndRelease(12, 0xE2);
    }

    async topMenu(): Promise<void> {
        await this.pressAndRelease(12, 0x60);
    }

    async channelUp(): Promise<void> {
        await this.pressAndRelease(12, 0x9C);
    }

    async channelDown(): Promise<void> {
        await this.pressAndRelease(12, 0x9D);
    }

    // SendCommand-based controls

    async commandPlay(): Promise<void> {
        await this.#sendCommand(Proto.Command.Play);
    }

    async commandPause(): Promise<void> {
        await this.#sendCommand(Proto.Command.Pause);
    }

    async commandTogglePlayPause(): Promise<void> {
        await this.#sendCommand(Proto.Command.TogglePlayPause);
    }

    async commandStop(): Promise<void> {
        await this.#sendCommand(Proto.Command.Stop);
    }

    async commandNextTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.NextTrack);
    }

    async commandPreviousTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.PreviousTrack);
    }

    async commandSkipForward(interval: number = 15): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithSkipInterval(Proto.Command.SkipForward, interval));
    }

    async commandSkipBackward(interval: number = 15): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithSkipInterval(Proto.Command.SkipBackward, interval));
    }

    async commandSeekToPosition(position: number): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithPlaybackPosition(Proto.Command.SeekToPlaybackPosition, position));
    }

    async commandSetShuffleMode(mode: Proto.ShuffleMode_Enum): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithShuffleMode(Proto.Command.ChangeShuffleMode, mode));
    }

    async commandSetRepeatMode(mode: Proto.RepeatMode_Enum): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithRepeatMode(Proto.Command.ChangeRepeatMode, mode));
    }

    async commandChangePlaybackRate(rate: number): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithPlaybackRate(Proto.Command.ChangePlaybackRate, rate));
    }

    async commandAdvanceShuffleMode(): Promise<void> {
        await this.#sendCommand(Proto.Command.AdvanceShuffleMode);
    }

    async commandAdvanceRepeatMode(): Promise<void> {
        await this.#sendCommand(Proto.Command.AdvanceRepeatMode);
    }

    async commandBeginFastForward(): Promise<void> {
        await this.#sendCommand(Proto.Command.BeginFastForward);
    }

    async commandEndFastForward(): Promise<void> {
        await this.#sendCommand(Proto.Command.EndFastForward);
    }

    async commandBeginRewind(): Promise<void> {
        await this.#sendCommand(Proto.Command.BeginRewind);
    }

    async commandEndRewind(): Promise<void> {
        await this.#sendCommand(Proto.Command.EndRewind);
    }

    async commandNextChapter(): Promise<void> {
        await this.#sendCommand(Proto.Command.NextChapter);
    }

    async commandPreviousChapter(): Promise<void> {
        await this.#sendCommand(Proto.Command.PreviousChapter);
    }

    async commandLikeTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.LikeTrack);
    }

    async commandDislikeTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.DislikeTrack);
    }

    async commandBookmarkTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.BookmarkTrack);
    }

    async commandAddNowPlayingItemToLibrary(): Promise<void> {
        await this.#sendCommand(Proto.Command.AddNowPlayingItemToLibrary);
    }

    // Keyboard/text input

    async textSet(text: string): Promise<void> {
        await this.#dataStream.send(DataStreamMessage.textInput(text, Proto.ActionType_Enum.Set));
    }

    async textAppend(text: string): Promise<void> {
        await this.#dataStream.send(DataStreamMessage.textInput(text, Proto.ActionType_Enum.Insert));
    }

    async textClear(): Promise<void> {
        await this.#dataStream.send(DataStreamMessage.textInput('', Proto.ActionType_Enum.ClearAction));
    }

    async getKeyboardSession(): Promise<void> {
        await this.#dataStream.send(DataStreamMessage.getKeyboardSession());
    }

    // Touch/gesture input

    async tap(x: number, y: number, finger: number = 1): Promise<void> {
        await this.#sendTouch(x, y, 1, finger); // Began
        await waitFor(50);
        await this.#sendTouch(x, y, 4, finger); // Ended
    }

    async swipeUp(duration: number = 200): Promise<void> {
        await this.#swipe(200, 400, 200, 100, duration);
    }

    async swipeDown(duration: number = 200): Promise<void> {
        await this.#swipe(200, 100, 200, 400, duration);
    }

    async swipeLeft(duration: number = 200): Promise<void> {
        await this.#swipe(400, 200, 100, 200, duration);
    }

    async swipeRight(duration: number = 200): Promise<void> {
        await this.#swipe(100, 200, 400, 200, duration);
    }

    // HID primitives

    async doublePress(usePage: number, usage: number): Promise<void> {
        await this.pressAndRelease(usePage, usage);
        await waitFor(150);
        await this.pressAndRelease(usePage, usage);
    }

    async longPress(usePage: number, usage: number, duration: number = 1000): Promise<void> {
        await this.#dataStream.exchange(DataStreamMessage.sendHIDEvent(usePage, usage, true));
        await waitFor(duration);
        await this.#dataStream.exchange(DataStreamMessage.sendHIDEvent(usePage, usage, false));
    }

    async pressAndRelease(usePage: number, usage: number): Promise<void> {
        await this.#dataStream.exchange(DataStreamMessage.sendHIDEvent(usePage, usage, true));
        await waitFor(25);
        await this.#dataStream.exchange(DataStreamMessage.sendHIDEvent(usePage, usage, false));
    }

    // Private helpers

    async #sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Promise<Proto.SendCommandResultMessage | undefined> {
        const response = await this.#dataStream.exchange(DataStreamMessage.sendCommand(command, options));
        return this.#checkCommandResult(response);
    }

    async #sendCommandRaw(message: Parameters<DataStream['exchange']>[0]): Promise<Proto.SendCommandResultMessage | undefined> {
        const response = await this.#dataStream.exchange(message);
        return this.#checkCommandResult(response);
    }

    #checkCommandResult(response: Proto.ProtocolMessage): Proto.SendCommandResultMessage | undefined {
        let result: Proto.SendCommandResultMessage | undefined;

        try {
            result = DataStreamMessage.getExtension(response, Proto.sendCommandResultMessage);
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

    async #sendTouch(x: number, y: number, phase: number, finger: number): Promise<void> {
        await this.#dataStream.exchange(DataStreamMessage.sendVirtualTouchEvent(x, y, phase, finger));
    }

    async #swipe(startX: number, startY: number, endX: number, endY: number, duration: number): Promise<void> {
        const steps = Math.max(4, Math.floor(duration / 50));
        const deltaX = (endX - startX) / steps;
        const deltaY = (endY - startY) / steps;
        const stepDuration = duration / steps;

        await this.#sendTouch(startX, startY, 1, 1); // Began

        for (let i = 1; i < steps; i++) {
            await waitFor(stepDuration);
            await this.#sendTouch(
                Math.round(startX + deltaX * i),
                Math.round(startY + deltaY * i),
                2, // Moved
                1
            );
        }

        await waitFor(stepDuration);
        await this.#sendTouch(endX, endY, 4, 1); // Ended
    }
}
