import type { AirPlayManager, CompanionLinkManager } from '../internal';

/**
 * Text input controller for Apple TV devices.
 * Provides keyboard control when a text field is active on the device.
 */
export class KeyboardController {
    readonly #airplay: AirPlayManager;

    readonly #companionLink?: CompanionLinkManager;

    constructor(airplay: AirPlayManager, companionLink?: CompanionLinkManager) {
        this.#airplay = airplay;
        this.#companionLink = companionLink;
    }

    /**
     * Sets the text input field to the given text, replacing any existing content.
     */
    async type(text: string): Promise<void> {
        if (this.#companionLink?.isConnected) {
            await this.#companionLink.textSet(text);
        } else {
            await this.#airplay.remote.textSet(text);
        }
    }

    /**
     * Appends text to the current text input field content.
     */
    async append(text: string): Promise<void> {
        if (this.#companionLink?.isConnected) {
            await this.#companionLink.textAppend(text);
        } else {
            await this.#airplay.remote.textAppend(text);
        }
    }

    /**
     * Clears the text input field.
     */
    async clear(): Promise<void> {
        if (this.#companionLink?.isConnected) {
            await this.#companionLink.textClear();
        } else {
            await this.#airplay.remote.textClear();
        }
    }

    /**
     * Fetches the current keyboard session state.
     */
    async getSession(): Promise<any> {
        if (this.#companionLink?.isConnected) return this.#companionLink.textInputState;
        return await this.#airplay.remote.getKeyboardSession();
    }
}
