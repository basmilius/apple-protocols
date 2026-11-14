import type { CompanionLinkSession } from '@corewire/companion-link';
import { requireSession } from '../errors';
import type { App } from '../types';

/** The apps of an Apple TV, over Companion Link. */
export class AppsControl {
    readonly #companionLink: () => CompanionLinkSession | undefined;

    constructor(companionLink: () => CompanionLinkSession | undefined) {
        this.#companionLink = companionLink;
    }

    async list(): Promise<App[]> {
        return await requireSession(this.#companionLink(), 'apps').apps.list();
    }

    async launch(bundleId: string): Promise<void> {
        await requireSession(this.#companionLink(), 'apps').apps.launch(bundleId);
    }

    /** Opens a universal link or an app URL scheme. */
    async openUrl(url: string): Promise<void> {
        await requireSession(this.#companionLink(), 'apps').apps.openUrl(url);
    }
}
