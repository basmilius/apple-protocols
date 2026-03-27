import type { AirPlayManager } from '../internal/airplay-manager';

/**
 * Text input controller for Apple TV devices.
 * Provides keyboard control when a text field is active on the device.
 */
export class KeyboardController {
    readonly #airplay: AirPlayManager;

    constructor(airplay: AirPlayManager) {
        this.#airplay = airplay;
    }

    /**
     * Sets the text input field to the given text, replacing any existing content.
     */
    async type(text: string): Promise<void> {
        await this.#airplay.remote.textSet(text);
    }

    /**
     * Appends text to the current text input field content.
     */
    async append(text: string): Promise<void> {
        await this.#airplay.remote.textAppend(text);
    }

    /**
     * Clears the text input field.
     */
    async clear(): Promise<void> {
        await this.#airplay.remote.textClear();
    }

    /**
     * Fetches the current keyboard session state.
     */
    async getSession(): Promise<any> {
        return await this.#airplay.remote.getKeyboardSession();
    }
}
