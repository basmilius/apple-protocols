import { waitFor } from '@apple-protocols/core';
import type { Channel } from './channel';
import type { Hid } from './hid';
import * as Messages from './messages';
import { HidTouchPhase, type SwipeDirection } from './types';

/** The finger a gesture reports itself as; the HID touch stream is 1-based. */
const TOUCH_FINGER = 1;

/** Start and end point of a swipe in the 0 to 1000 touchpad space. */
const SWIPES: Record<SwipeDirection, readonly [startX: number, startY: number, endX: number, endY: number]> = {
    up: [500, 700, 500, 300],
    down: [500, 300, 500, 700],
    left: [700, 500, 300, 500],
    right: [300, 500, 700, 500]
};

/** The virtual touchpad. Coordinates run from 0 to 1000 on both axes. */
export class Touch {
    readonly #channel: Channel;
    readonly #hid: Hid;

    constructor(channel: Channel, hid: Hid) {
        this.#channel = channel;
        this.#hid = hid;
    }

    /**
     * Sends a `_touchC` event. Kept for protocol work: tvOS registers no handler for it, so
     * {@link sendHid} is what reaches the device.
     *
     * @param finger The finger index, 0-based.
     * @param phase A `TouchPhase` value.
     */
    send(finger: number, phase: number, x: number, y: number): void {
        this.#channel.send(Messages.touchEvent(finger, phase, x, y));
    }

    /**
     * Sends a `_hidT` event, the form the HID daemon of the Apple TV listens for.
     *
     * @param finger The finger index, 1-based.
     * @param phase A {@link HidTouchPhase} value.
     */
    sendHid(finger: number, phase: number, x: number, y: number): void {
        this.#channel.send(Messages.hidTouchEvent(finger, phase, x, y));
    }

    /**
     * Taps the touch surface, which selects whatever has focus. The HID touch device reports
     * contact and position only, so a touch that lands and lifts moves no focus and clicks
     * nothing; a real remote sends the Select button for a tap.
     *
     * @param holdMs How long to hold, in milliseconds. Omit for a plain tap.
     */
    async tap(holdMs?: number): Promise<void> {
        if (holdMs === undefined) {
            await this.#hid.press('Select', 'SingleTap');

            return;
        }

        await this.#hid.press('Select', 'Hold', holdMs);
    }

    /** Began, at least four Moved samples spread over `duration` milliseconds, then Ended at the end point. */
    async swipe(direction: SwipeDirection, duration: number = 200): Promise<void> {
        const [startX, startY, endX, endY] = SWIPES[direction];
        const steps = Math.max(4, Math.floor(duration / 50));
        const deltaX = (endX - startX) / steps;
        const deltaY = (endY - startY) / steps;
        const stepDuration = duration / steps;

        this.sendHid(TOUCH_FINGER, HidTouchPhase.Began, startX, startY);

        for (let i = 1; i <= steps; i++) {
            await waitFor(stepDuration);
            this.sendHid(TOUCH_FINGER, HidTouchPhase.Moved, Math.round(startX + deltaX * i), Math.round(startY + deltaY * i));
        }

        this.sendHid(TOUCH_FINGER, HidTouchPhase.Ended, endX, endY);
    }
}
