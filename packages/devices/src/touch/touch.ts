import type { CompanionLinkSession } from '@corewire/companion-link';
import { requireSession } from '../errors';
import type { SwipeDirection } from '../types';

/**
 * The touch surface of an Apple TV, over Companion Link. AirPlay has no touch: tvOS drops the MRP
 * session on a virtual touch event.
 */
export interface TouchControl {
    /** Selects what has focus; held when `holdMs` is given. */
    tap(holdMs?: number): Promise<void>;

    /**
     * Swipes across the touch surface.
     *
     * @param durationMs - The length of the swipe in milliseconds, 200 when omitted.
     */
    swipe(direction: SwipeDirection, durationMs?: number): Promise<void>;
}

export class TouchController implements TouchControl {
    readonly #companionLink: () => CompanionLinkSession | undefined;

    constructor(companionLink: () => CompanionLinkSession | undefined) {
        this.#companionLink = companionLink;
    }

    /** Selects what has focus; held when `holdMs` is given. */
    async tap(holdMs?: number): Promise<void> {
        await requireSession(this.#companionLink(), 'touch').touch.tap(holdMs);
    }

    /**
     * Swipes across the touch surface.
     *
     * @param durationMs - The length of the swipe in milliseconds, 200 when omitted.
     */
    async swipe(direction: SwipeDirection, durationMs?: number): Promise<void> {
        await requireSession(this.#companionLink(), 'touch').touch.swipe(direction, durationMs);
    }
}
