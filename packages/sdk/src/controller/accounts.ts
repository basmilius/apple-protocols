import type { UserAccount } from '@basmilius/apple-companion-link';
import type { CompanionLinkManager } from '../internal';

/**
 * User account controller for Apple TV devices.
 * Provides user account listing and switching.
 */
export class AccountsController {
    readonly #companionLink: CompanionLinkManager;

    constructor(companionLink: CompanionLinkManager) {
        this.#companionLink = companionLink;
    }

    /**
     * Returns the list of user accounts configured on the device.
     */
    async list(): Promise<UserAccount[]> {
        return await this.#companionLink.getUserAccounts();
    }

    /**
     * Switches to a different user account.
     *
     * @param accountId - The account ID to switch to.
     */
    async switch(accountId: string): Promise<void> {
        await this.#companionLink.switchUserAccount(accountId);
    }
}
