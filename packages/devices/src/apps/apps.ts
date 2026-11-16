import type { CompanionLinkSession } from '@apple-protocols/companion-link';
import { requireSession } from '../errors';
import type { App } from '../types';

/** The apps of an Apple TV, over Companion Link. */
export interface AppsControl {
    list(): Promise<App[]>;
    launch(bundleId: string): Promise<void>;

    /** Opens a universal link or an app URL scheme. */
    openUrl(url: string): Promise<void>;
}

export class AppsController implements AppsControl {
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
