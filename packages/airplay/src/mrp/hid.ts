import { waitFor } from '@apple-protocols/core';
import type { DataChannel } from '../channels/data';
import * as Messages from './messages';
import type { MediaRemoteState } from './state';

/** USB HID usage page of the navigation keys. */
const GENERIC_DESKTOP = 1;

/** USB HID usage page of the media keys. */
const CONSUMER = 12;

/**
 * Keys as USB HID events: Generic Desktop (0x01) for navigation, Consumer (0x0c) for media.
 *
 * Every event goes out with `send()`: the receiver never replies to a HID event, so waiting for one
 * would time out on key-down and key-up would never be sent. Touch is not here: tvOS drops the
 * session on a virtual touch event over MRP.
 */
export class Hid {
    readonly #channel: DataChannel;
    readonly #state: MediaRemoteState;

    constructor(channel: DataChannel, state: MediaRemoteState) {
        this.#channel = channel;
        this.#state = state;
    }

    async up(): Promise<void> {
        await this.press(GENERIC_DESKTOP, 0x8C);
    }

    async down(): Promise<void> {
        await this.press(GENERIC_DESKTOP, 0x8D);
    }

    async left(): Promise<void> {
        await this.press(GENERIC_DESKTOP, 0x8B);
    }

    async right(): Promise<void> {
        await this.press(GENERIC_DESKTOP, 0x8A);
    }

    async menu(): Promise<void> {
        await this.press(GENERIC_DESKTOP, 0x86);
    }

    async select(): Promise<void> {
        await this.press(GENERIC_DESKTOP, 0x89);
    }

    async home(): Promise<void> {
        await this.press(CONSUMER, 0x40);
    }

    async suspend(): Promise<void> {
        await this.press(GENERIC_DESKTOP, 0x82);
    }

    async wake(): Promise<void> {
        await this.press(GENERIC_DESKTOP, 0x83);
    }

    async play(): Promise<void> {
        await this.press(CONSUMER, 0xB0);
    }

    async pause(): Promise<void> {
        await this.press(CONSUMER, 0xB1);
    }

    /** Pause when the now-playing client plays, play otherwise. */
    async playPause(): Promise<void> {
        if (this.#state.nowPlayingClient?.isPlaying) {
            await this.pause();
        } else {
            await this.play();
        }
    }

    async stop(): Promise<void> {
        await this.press(CONSUMER, 0xB7);
    }

    async next(): Promise<void> {
        await this.press(CONSUMER, 0xB5);
    }

    async previous(): Promise<void> {
        await this.press(CONSUMER, 0xB6);
    }

    async volumeUp(): Promise<void> {
        await this.press(CONSUMER, 0xE9);
    }

    async volumeDown(): Promise<void> {
        await this.press(CONSUMER, 0xEA);
    }

    async mute(): Promise<void> {
        await this.press(CONSUMER, 0xE2);
    }

    async topMenu(): Promise<void> {
        await this.press(CONSUMER, 0x60);
    }

    async channelUp(): Promise<void> {
        await this.press(CONSUMER, 0x9C);
    }

    async channelDown(): Promise<void> {
        await this.press(CONSUMER, 0x9D);
    }

    /** Two presses 150 ms apart. */
    async doublePress(usePage: number, usage: number): Promise<void> {
        await this.press(usePage, usage);
        await waitFor(150);
        await this.press(usePage, usage);
    }

    /**
     * Holds a key down.
     *
     * @param duration - Hold time in milliseconds.
     */
    async longPress(usePage: number, usage: number, duration: number = 1000): Promise<void> {
        this.#channel.send(Messages.sendHIDEvent(usePage, usage, true));
        await waitFor(duration);
        this.#channel.send(Messages.sendHIDEvent(usePage, usage, false));
    }

    /** Key-down, 25 ms, key-up. */
    async press(usePage: number, usage: number): Promise<void> {
        this.#channel.send(Messages.sendHIDEvent(usePage, usage, true));
        await waitFor(25);
        this.#channel.send(Messages.sendHIDEvent(usePage, usage, false));
    }
}
