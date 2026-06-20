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

    /**
     * The controller's active iCloud account (alternate DSID) announced to the device during the session
     * handshake. Optional: set it before connecting to mimic a real iOS Remote; leave unset to skip it.
     */
    get active(): string | undefined {
        return this.#companionLink.activeUserAccount;
    }

    set active(iCloudAltDSID: string | undefined) {
        this.#companionLink.activeUserAccount = iCloudAltDSID;
    }

    /**
     * Announces the controller's active iCloud account to the device immediately, as a real iOS Remote
     * does during the handshake.
     *
     * @param iCloudAltDSID - The controller's active iCloud account identifier (alternate DSID).
     */
    async switchActive(iCloudAltDSID: string): Promise<void> {
        await this.#companionLink.switchActiveUserAccount(iCloudAltDSID);
    }
}
