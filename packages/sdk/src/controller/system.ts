import type { CompanionLinkManager } from '../internal/companion-link-manager';

/**
 * System controller for Apple TV devices.
 * Provides access to captions, appearance, Siri, and Up Next queue.
 */
export class SystemController {
    readonly #companionLink: CompanionLinkManager;

    constructor(companionLink: CompanionLinkManager) {
        this.#companionLink = companionLink;
    }

    /** Toggles closed captions on the device. */
    async toggleCaptions(): Promise<void> {
        await this.#companionLink.toggleCaptions();
    }

    /**
     * Sets the system appearance.
     *
     * @param mode - 'light' or 'dark'.
     */
    async setAppearance(mode: 'light' | 'dark'): Promise<void> {
        await this.#companionLink.toggleSystemAppearance(mode === 'light');
    }

    /**
     * Enables or disables the "Reduce Loud Sounds" setting.
     */
    async setReduceLoudSounds(enabled: boolean): Promise<void> {
        await this.#companionLink.toggleReduceLoudSounds(enabled);
    }

    /**
     * Enables or disables Find My mode.
     */
    async setFindingMode(enabled: boolean): Promise<void> {
        await this.#companionLink.toggleFindingMode(enabled);
    }

    /** Starts a Siri session. */
    async siriStart(): Promise<void> {
        await this.#companionLink.siriStart();
    }

    /** Stops the active Siri session. */
    async siriStop(): Promise<void> {
        await this.#companionLink.siriStop();
    }

    /**
     * Fetches the Up Next queue.
     *
     * @param paginationToken - Optional token for paginated results.
     */
    async fetchUpNext(paginationToken?: string): Promise<any> {
        return await this.#companionLink.fetchUpNext(paginationToken);
    }

    /**
     * Adds an item to the Up Next queue.
     */
    async addToUpNext(identifier: string, kind: string): Promise<void> {
        await this.#companionLink.addToUpNext(identifier, kind);
    }

    /**
     * Removes an item from the Up Next queue.
     */
    async removeFromUpNext(identifier: string, kind: string): Promise<void> {
        await this.#companionLink.removeFromUpNext(identifier, kind);
    }
}
