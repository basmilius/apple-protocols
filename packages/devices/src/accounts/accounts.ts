import type { CompanionLinkSession } from '@corewire/companion-link';
import { requireSession } from '../errors';
import type { Account } from '../types';

/** The user accounts of an Apple TV, over Companion Link. */
export class AccountsControl {
    readonly #companionLink: () => CompanionLinkSession | undefined;

    constructor(companionLink: () => CompanionLinkSession | undefined) {
        this.#companionLink = companionLink;
    }

    async list(): Promise<Account[]> {
        const accounts = await requireSession(this.#companionLink(), 'accounts').accounts.list();

        return accounts.map(account => ({id: account.accountId, name: account.name}));
    }

    async switch(id: string): Promise<void> {
        await requireSession(this.#companionLink(), 'accounts').accounts.switch(id);
    }
}
