import { type DataStream, DataStreamMessage, Proto, type Protocol } from '@basmilius/apple-airplay';
import { CommandError, waitFor } from '@basmilius/apple-common';
import type { AirPlayManager } from './airplay-manager';
import { PROTOCOL } from './const';

/**
 * Error thrown when a SendCommand request fails on the Apple TV side.
 * Contains the specific send error and handler return status for diagnostics.
 */
export class SendCommandError extends CommandError {
    /**
     * The send error reported by the Apple TV.
     */
    readonly sendError: Proto.SendError_Enum;
    /**
     * The handler return status reported by the Apple TV.
     */
    readonly handlerReturnStatus: Proto.HandlerReturnStatus_Enum;

    /**
     * Creates a new SendCommandError.
     *
     * @param sendError - The send error code from the Apple TV.
     * @param handlerReturnStatus - The handler return status from the Apple TV.
     */
    constructor(sendError: Proto.SendError_Enum, handlerReturnStatus: Proto.HandlerReturnStatus_Enum) {
        super(`SendCommand failed: sendError=${Proto.SendError_Enum[sendError]}, handlerReturnStatus=${Proto.HandlerReturnStatus_Enum[handlerReturnStatus]}`);
        this.name = 'SendCommandError';
        this.sendError = sendError;
        this.handlerReturnStatus = handlerReturnStatus;
    }
}

/**
 * Remote control for an AirPlay device.
 * Provides HID-based navigation and media keys (USB usage pages: Generic Desktop 0x01
 * and Consumer 0x0c), SendCommand-based media controls, keyboard/text input,
 * and touch/gesture simulation.
 */
export class AirPlayRemote {
    /**
     * @returns The DataStream for sending HID events and commands.
     */
    get #dataStream(): DataStream {
        return this.#protocol.dataStream;
    }

    /**
     * @returns The underlying AirPlay Protocol instance.
     */
    get #protocol(): Protocol {
        return this.#device[PROTOCOL];
    }

    readonly #device: AirPlayManager;

    /**
     * Creates a new Remote controller.
     *
     * @param device - The AirPlay device to control.
     */
    constructor(device: AirPlayManager) {
        this.#device = device;
    }

    // HID navigation

    /**
     * Sends an Up navigation key press (Generic Desktop, usage 0x8C).
     */
    async up(): Promise<void> {
        await this.pressAndRelease(1, 0x8C);
    }

    /**
     * Sends a Down navigation key press (Generic Desktop, usage 0x8D).
     */
    async down(): Promise<void> {
        await this.pressAndRelease(1, 0x8D);
    }

    /**
     * Sends a Left navigation key press (Generic Desktop, usage 0x8B).
     */
    async left(): Promise<void> {
        await this.pressAndRelease(1, 0x8B);
    }

    /**
     * Sends a Right navigation key press (Generic Desktop, usage 0x8A).
     */
    async right(): Promise<void> {
        await this.pressAndRelease(1, 0x8A);
    }

    /**
     * Sends a Menu key press (Generic Desktop, usage 0x86).
     */
    async menu(): Promise<void> {
        await this.pressAndRelease(1, 0x86);
    }

    /**
     * Sends a Select/Enter key press (Generic Desktop, usage 0x89).
     */
    async select(): Promise<void> {
        await this.pressAndRelease(1, 0x89);
    }

    /**
     * Sends a Home button press (Consumer, usage 0x40).
     */
    async home(): Promise<void> {
        await this.pressAndRelease(12, 0x40);
    }

    /**
     * Sends a Suspend/Sleep key press to put the device to sleep (Generic Desktop, usage 0x82).
     */
    async suspend(): Promise<void> {
        await this.pressAndRelease(1, 0x82);
    }

    /**
     * Sends a Wake key press to wake the device (Generic Desktop, usage 0x83).
     */
    async wake(): Promise<void> {
        await this.pressAndRelease(1, 0x83);
    }

    // HID media

    /**
     * Sends a Play key press (Consumer, usage 0xB0).
     */
    async play(): Promise<void> {
        await this.pressAndRelease(12, 0xB0);
    }

    /**
     * Sends a Pause key press (Consumer, usage 0xB1).
     */
    async pause(): Promise<void> {
        await this.pressAndRelease(12, 0xB1);
    }

    /**
     * Toggles play/pause based on the current playback state.
     */
    async playPause(): Promise<void> {
        if (this.#device.state.nowPlayingClient?.isPlaying) {
            await this.pause();
        } else {
            await this.play();
        }
    }

    /**
     * Sends a Stop key press (Consumer, usage 0xB7).
     */
    async stop(): Promise<void> {
        await this.pressAndRelease(12, 0xB7);
    }

    /**
     * Sends a Next Track key press (Consumer, usage 0xB5).
     */
    async next(): Promise<void> {
        await this.pressAndRelease(12, 0xB5);
    }

    /**
     * Sends a Previous Track key press (Consumer, usage 0xB6).
     */
    async previous(): Promise<void> {
        await this.pressAndRelease(12, 0xB6);
    }

    /**
     * Sends a Volume Up key press (Consumer, usage 0xE9).
     */
    async volumeUp(): Promise<void> {
        await this.pressAndRelease(12, 0xE9);
    }

    /**
     * Sends a Volume Down key press (Consumer, usage 0xEA).
     */
    async volumeDown(): Promise<void> {
        await this.pressAndRelease(12, 0xEA);
    }

    /**
     * Sends a Mute key press (Consumer, usage 0xE2).
     */
    async mute(): Promise<void> {
        await this.pressAndRelease(12, 0xE2);
    }

    /**
     * Sends a Top Menu key press (Consumer, usage 0x60).
     */
    async topMenu(): Promise<void> {
        await this.pressAndRelease(12, 0x60);
    }

    /**
     * Sends a Channel Up key press (Consumer, usage 0x9C).
     */
    async channelUp(): Promise<void> {
        await this.pressAndRelease(12, 0x9C);
    }

    /**
     * Sends a Channel Down key press (Consumer, usage 0x9D).
     */
    async channelDown(): Promise<void> {
        await this.pressAndRelease(12, 0x9D);
    }

    // SendCommand-based controls

    /**
     * Sends a Play command via the MRP SendCommand protocol.
     */
    async commandPlay(): Promise<void> {
        await this.#sendCommand(Proto.Command.Play);
    }

    /**
     * Sends a Pause command via the MRP SendCommand protocol.
     */
    async commandPause(): Promise<void> {
        await this.#sendCommand(Proto.Command.Pause);
    }

    /**
     * Sends a TogglePlayPause command via the MRP SendCommand protocol.
     */
    async commandTogglePlayPause(): Promise<void> {
        await this.#sendCommand(Proto.Command.TogglePlayPause);
    }

    /**
     * Sends a Stop command via the MRP SendCommand protocol.
     */
    async commandStop(): Promise<void> {
        await this.#sendCommand(Proto.Command.Stop);
    }

    /**
     * Sends a NextTrack command via the MRP SendCommand protocol.
     */
    async commandNextTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.NextTrack);
    }

    /**
     * Sends a PreviousTrack command via the MRP SendCommand protocol.
     */
    async commandPreviousTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.PreviousTrack);
    }

    /**
     * Sends a SkipForward command with a configurable interval.
     *
     * @param interval - Seconds to skip forward (defaults to 15).
     */
    async commandSkipForward(interval: number = 15): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithSkipInterval(Proto.Command.SkipForward, interval));
    }

    /**
     * Sends a SkipBackward command with a configurable interval.
     *
     * @param interval - Seconds to skip backward (defaults to 15).
     */
    async commandSkipBackward(interval: number = 15): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithSkipInterval(Proto.Command.SkipBackward, interval));
    }

    /**
     * Seeks to an absolute playback position.
     *
     * @param position - The target position in seconds.
     */
    async commandSeekToPosition(position: number): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithPlaybackPosition(Proto.Command.SeekToPlaybackPosition, position));
    }

    /**
     * Sets the shuffle mode.
     *
     * @param mode - The desired shuffle mode.
     */
    async commandSetShuffleMode(mode: Proto.ShuffleMode_Enum): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithShuffleMode(Proto.Command.ChangeShuffleMode, mode));
    }

    /**
     * Sets the repeat mode.
     *
     * @param mode - The desired repeat mode.
     */
    async commandSetRepeatMode(mode: Proto.RepeatMode_Enum): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithRepeatMode(Proto.Command.ChangeRepeatMode, mode));
    }

    /**
     * Changes the playback rate (speed).
     *
     * @param rate - The desired playback rate (e.g. 1.0 for normal, 2.0 for double speed).
     */
    async commandChangePlaybackRate(rate: number): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithPlaybackRate(Proto.Command.ChangePlaybackRate, rate));
    }

    /**
     * Cycles the shuffle mode to the next value.
     */
    async commandAdvanceShuffleMode(): Promise<void> {
        await this.#sendCommand(Proto.Command.AdvanceShuffleMode);
    }

    /**
     * Cycles the repeat mode to the next value.
     */
    async commandAdvanceRepeatMode(): Promise<void> {
        await this.#sendCommand(Proto.Command.AdvanceRepeatMode);
    }

    /**
     * Begins fast-forwarding playback.
     */
    async commandBeginFastForward(): Promise<void> {
        await this.#sendCommand(Proto.Command.BeginFastForward);
    }

    /**
     * Ends fast-forwarding playback.
     */
    async commandEndFastForward(): Promise<void> {
        await this.#sendCommand(Proto.Command.EndFastForward);
    }

    /**
     * Begins rewinding playback.
     */
    async commandBeginRewind(): Promise<void> {
        await this.#sendCommand(Proto.Command.BeginRewind);
    }

    /**
     * Ends rewinding playback.
     */
    async commandEndRewind(): Promise<void> {
        await this.#sendCommand(Proto.Command.EndRewind);
    }

    /**
     * Skips to the next chapter.
     */
    async commandNextChapter(): Promise<void> {
        await this.#sendCommand(Proto.Command.NextChapter);
    }

    /**
     * Skips to the previous chapter.
     */
    async commandPreviousChapter(): Promise<void> {
        await this.#sendCommand(Proto.Command.PreviousChapter);
    }

    /**
     * Marks the current track as liked.
     */
    async commandLikeTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.LikeTrack);
    }

    /**
     * Marks the current track as disliked.
     */
    async commandDislikeTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.DislikeTrack);
    }

    /**
     * Bookmarks the current track.
     */
    async commandBookmarkTrack(): Promise<void> {
        await this.#sendCommand(Proto.Command.BookmarkTrack);
    }

    /**
     * Adds the currently playing item to the user's library.
     */
    async commandAddNowPlayingItemToLibrary(): Promise<void> {
        await this.#sendCommand(Proto.Command.AddNowPlayingItemToLibrary);
    }

    /**
     * Sets a sleep timer that will stop playback after the specified duration.
     * The timer works by attaching sleep timer options to a Pause command.
     *
     * @param seconds - Timer duration in seconds. Use 0 to cancel an active timer.
     * @param stopMode - Stop mode: 0 = stop playback, 1 = pause, 2 = end of track, 3 = end of queue.
     */
    async commandSetSleepTimer(seconds: number, stopMode: number = 0): Promise<void> {
        await this.#sendCommandRaw(DataStreamMessage.sendCommandWithSleepTimer(seconds, stopMode));
    }

    // Keyboard/text input

    /**
     * Sets the text input field to the given text, replacing any existing content.
     *
     * @param text - The text to set.
     */
    async textSet(text: string): Promise<void> {
        await this.#dataStream.send(DataStreamMessage.textInput(text, Proto.ActionType_Enum.Set));
    }

    /**
     * Appends text to the current text input field content.
     *
     * @param text - The text to append.
     */
    async textAppend(text: string): Promise<void> {
        await this.#dataStream.send(DataStreamMessage.textInput(text, Proto.ActionType_Enum.Insert));
    }

    /**
     * Clears the text input field.
     */
    async textClear(): Promise<void> {
        await this.#dataStream.send(DataStreamMessage.textInput('', Proto.ActionType_Enum.ClearAction));
    }

    /**
     * Requests the current keyboard session state from the Apple TV.
     */
    async getKeyboardSession(): Promise<void> {
        await this.#dataStream.send(DataStreamMessage.getKeyboardSession());
    }

    // Touch/gesture input

    /**
     * Simulates a tap at the given coordinates.
     *
     * @param x - Horizontal position in the virtual touch area.
     * @param y - Vertical position in the virtual touch area.
     * @param finger - Finger index for multi-touch (defaults to 1).
     */
    async tap(x: number, y: number, finger: number = 1): Promise<void> {
        await this.#sendTouch(x, y, 1, finger); // Began
        await waitFor(50);
        await this.#sendTouch(x, y, 4, finger); // Ended
    }

    /**
     * Simulates an upward swipe gesture.
     *
     * @param duration - Swipe duration in milliseconds (defaults to 200).
     */
    async swipeUp(duration: number = 200): Promise<void> {
        await this.#swipe(200, 400, 200, 100, duration);
    }

    /**
     * Simulates a downward swipe gesture.
     *
     * @param duration - Swipe duration in milliseconds (defaults to 200).
     */
    async swipeDown(duration: number = 200): Promise<void> {
        await this.#swipe(200, 100, 200, 400, duration);
    }

    /**
     * Simulates a leftward swipe gesture.
     *
     * @param duration - Swipe duration in milliseconds (defaults to 200).
     */
    async swipeLeft(duration: number = 200): Promise<void> {
        await this.#swipe(400, 200, 100, 200, duration);
    }

    /**
     * Simulates a rightward swipe gesture.
     *
     * @param duration - Swipe duration in milliseconds (defaults to 200).
     */
    async swipeRight(duration: number = 200): Promise<void> {
        await this.#swipe(100, 200, 400, 200, duration);
    }

    // HID primitives

    /**
     * Sends a double press of a HID key (two press-and-release cycles with a 150ms gap).
     *
     * @param usePage - USB HID usage page (1 = Generic Desktop, 12 = Consumer).
     * @param usage - USB HID usage code.
     */
    async doublePress(usePage: number, usage: number): Promise<void> {
        await this.pressAndRelease(usePage, usage);
        await waitFor(150);
        await this.pressAndRelease(usePage, usage);
    }

    /**
     * Sends a long press of a HID key (hold for a configurable duration).
     *
     * @param usePage - USB HID usage page (1 = Generic Desktop, 12 = Consumer).
     * @param usage - USB HID usage code.
     * @param duration - Hold duration in milliseconds (defaults to 1000).
     */
    async longPress(usePage: number, usage: number, duration: number = 1000): Promise<void> {
        await this.#dataStream.exchange(DataStreamMessage.sendHIDEvent(usePage, usage, true));
        await waitFor(duration);
        await this.#dataStream.exchange(DataStreamMessage.sendHIDEvent(usePage, usage, false));
    }

    /**
     * Sends a single press-and-release of a HID key with a 25ms hold.
     *
     * @param usePage - USB HID usage page (1 = Generic Desktop, 12 = Consumer).
     * @param usage - USB HID usage code.
     */
    async pressAndRelease(usePage: number, usage: number): Promise<void> {
        await this.#dataStream.exchange(DataStreamMessage.sendHIDEvent(usePage, usage, true));
        await waitFor(25);
        await this.#dataStream.exchange(DataStreamMessage.sendHIDEvent(usePage, usage, false));
    }

    // Private helpers

    /**
     * Sends a SendCommand request and checks the result.
     *
     * @param command - The command to send.
     * @param options - Optional command options.
     * @returns The command result message, or undefined if no result was returned.
     * @throws SendCommandError when the Apple TV reports a send error.
     */
    async #sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Promise<Proto.SendCommandResultMessage | undefined> {
        const response = await this.#dataStream.exchange(DataStreamMessage.sendCommand(command, options));
        return this.#checkCommandResult(response);
    }

    /**
     * Sends a pre-built command message and checks the result.
     *
     * @param message - The pre-built DataStream message to send.
     * @returns The command result message, or undefined if no result was returned.
     * @throws SendCommandError when the Apple TV reports a send error.
     */
    async #sendCommandRaw(message: Parameters<DataStream['exchange']>[0]): Promise<Proto.SendCommandResultMessage | undefined> {
        const response = await this.#dataStream.exchange(message);
        return this.#checkCommandResult(response);
    }

    /**
     * Validates the response from a SendCommand request and throws on error.
     *
     * @param response - The protocol message response.
     * @returns The decoded result, or undefined if the response has no result extension.
     * @throws SendCommandError when the result indicates a send error.
     */
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

    /**
     * Sends a virtual touch event at the given coordinates.
     *
     * @param x - Horizontal position.
     * @param y - Vertical position.
     * @param phase - Touch phase (1 = Began, 2 = Moved, 4 = Ended).
     * @param finger - Finger index for multi-touch.
     */
    async #sendTouch(x: number, y: number, phase: number, finger: number): Promise<void> {
        await this.#dataStream.exchange(DataStreamMessage.sendVirtualTouchEvent(x, y, phase, finger));
    }

    /**
     * Performs a swipe gesture by interpolating touch events between start and end coordinates.
     *
     * @param startX - Starting horizontal position.
     * @param startY - Starting vertical position.
     * @param endX - Ending horizontal position.
     * @param endY - Ending vertical position.
     * @param duration - Total swipe duration in milliseconds.
     */
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
