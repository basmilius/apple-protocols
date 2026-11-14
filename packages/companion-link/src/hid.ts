import { waitFor } from '@corewire/core';
import type { Channel } from './channel';
import { HidCommand, type HidCommandKey } from './const';
import * as Messages from './messages';
import type { ButtonPressType } from './types';

/** Remote buttons as HID commands, and the experimental game controller. */
export class Hid {
    readonly #channel: Channel;

    constructor(channel: Channel) {
        this.#channel = channel;
    }

    /** Sends one button edge: down, or up when `down` is false. */
    async command(command: HidCommandKey, down: boolean = false): Promise<void> {
        await this.#channel.exchange(Messages.hidCommand(HidCommand[command], down));
    }

    /**
     * A full press: down and up for a single tap, that twice without a pause for a double tap,
     * and for a hold the release after `holdDelayMs`.
     */
    async press(command: HidCommandKey, type: ButtonPressType = 'SingleTap', holdDelayMs: number = 500): Promise<void> {
        switch (type) {
            case 'DoubleTap':
                await this.command(command, true);
                await this.command(command, false);
                await this.command(command, true);
                await this.command(command, false);
                break;

            case 'Hold':
                await this.command(command, true);
                await waitFor(holdDelayMs);
                await this.command(command, false);
                break;

            case 'SingleTap':
                await this.command(command, true);
                await this.command(command, false);
                break;
        }
    }

    async gameControllerStart(): Promise<void> {
        await this.#channel.exchange(Messages.gameControllerStart());
    }

    async gameControllerStop(): Promise<void> {
        await this.#channel.exchange(Messages.gameControllerStop());
    }

    /** One stick position (-1 to 1 per axis) and the button state. */
    sendGameControllerEvent(x: number, y: number, isDown: boolean): void {
        this.#channel.send(Messages.gameControllerEvent(x, y, isDown));
    }
}
