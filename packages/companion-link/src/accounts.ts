import type { Channel } from './channel';
import * as Messages from './messages';
import type { UserAccount } from './types';

/** User accounts on the device, and the experimental sign-in, TV provider and parental approval requests. */
export class Accounts {
    readonly #channel: Channel;

    constructor(channel: Channel) {
        this.#channel = channel;
    }

    async list(): Promise<UserAccount[]> {
        const reply = await this.#channel.exchange(Messages.fetchUserAccounts());

        return Object.entries(reply._c as Record<string, string>).map(([accountId, name]) => ({accountId, name}));
    }

    async switch(accountId: string): Promise<void> {
        await this.#channel.exchange(Messages.switchUserAccount(accountId));
    }

    /** Tells the device which iCloud account (alternate DSID) this controller is active on. */
    async switchActive(iCloudAltDSID: string): Promise<void> {
        await this.#channel.exchange(Messages.switchActiveUserAccount(iCloudAltDSID));
    }

    /** @param requestType `appleID`, `password` or `custom`. */
    async requestAppSignIn(bundleId: string, requestType: string = 'appleID'): Promise<object> {
        return await this.#channel.exchange(Messages.appSignInRequest(bundleId, requestType));
    }

    async requestTVProvider(providerUrl: string, providerName: string): Promise<object> {
        return await this.#channel.exchange(Messages.tvProviderRequest(providerUrl, providerName));
    }

    async requestRestrictedAccess(restrictionType: string): Promise<object> {
        return await this.#channel.exchange(Messages.restrictedAccessRequest(restrictionType));
    }
}
