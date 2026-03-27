import type { LaunchableApp, UserAccount } from '@basmilius/apple-companion-link';
import type { CompanionLinkManager } from '../internal/companion-link-manager';

/**
 * App management controller for Apple TV devices.
 * Provides app launching, URL opening, and user account management.
 */
export class AppsController {
    readonly #companionLink: CompanionLinkManager;

    constructor(companionLink: CompanionLinkManager) {
        this.#companionLink = companionLink;
    }

    /** Returns the list of apps that can be launched on the device. */
    async list(): Promise<LaunchableApp[]> {
        return await this.#companionLink.getLaunchableApps();
    }

    /**
     * Launches an app by its bundle identifier.
     *
     * @param bundleId - The bundle identifier (e.g. 'com.netflix.Netflix').
     */
    async launch(bundleId: string): Promise<void> {
        await this.#companionLink.launchApp(bundleId);
    }

    /**
     * Opens a URL on the device (universal link or app-specific URL scheme).
     *
     * @param url - The URL to open.
     */
    async openUrl(url: string): Promise<void> {
        await this.#companionLink.launchUrl(url);
    }

    /** Returns the list of user accounts configured on the device. */
    async getAccounts(): Promise<UserAccount[]> {
        return await this.#companionLink.getUserAccounts();
    }

    /**
     * Switches to a different user account.
     *
     * @param accountId - The account ID to switch to.
     */
    async switchAccount(accountId: string): Promise<void> {
        await this.#companionLink.switchUserAccount(accountId);
    }
}
