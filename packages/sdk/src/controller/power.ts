import type { AttentionState } from '@basmilius/apple-companion-link';
import type { AirPlayManager, CompanionLinkManager } from '../internal';

/**
 * Power management controller for Apple TV devices.
 * Provides power on/off and attention state queries.
 */
export class PowerController {
    readonly #airplay: AirPlayManager;
    readonly #companionLink: CompanionLinkManager;

    constructor(airplay: AirPlayManager, companionLink: CompanionLinkManager) {
        this.#airplay = airplay;
        this.#companionLink = companionLink;
    }

    /**
     * Turns on the device (sends wake HID key).
     */
    async on(): Promise<void> {
        await this.#airplay.remote.wake();
    }

    /**
     * Turns off the device (sends suspend HID key).
     */
    async off(): Promise<void> {
        await this.#airplay.remote.suspend();
    }

    /**
     * Gets the current attention state of the device.
     *
     * @returns The attention state ('active', 'idle', 'screensaver', etc.).
     */
    async getState(): Promise<AttentionState> {
        return await this.#companionLink.getAttentionState();
    }
}
