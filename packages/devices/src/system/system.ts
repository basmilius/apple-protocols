import type { CompanionLinkSession } from '@corewire/companion-link';
import { requireSession } from '../errors';

/** System settings and Siri of an Apple TV, over Companion Link. */
export class SystemControl {
    readonly #companionLink: () => CompanionLinkSession | undefined;

    constructor(companionLink: () => CompanionLinkSession | undefined) {
        this.#companionLink = companionLink;
    }

    async toggleCaptions(): Promise<void> {
        await this.#system().toggleCaptions();
    }

    async setAppearance(mode: 'light' | 'dark'): Promise<void> {
        await this.#system().setAppearance(mode === 'light');
    }

    async setReduceLoudSounds(enabled: boolean): Promise<void> {
        await this.#system().setReduceLoudSounds(enabled);
    }

    /** Find My mode. */
    async setFindingMode(enabled: boolean): Promise<void> {
        await this.#system().setFindingMode(enabled);
    }

    async startSiri(): Promise<void> {
        await this.#system().siriStart();
    }

    async stopSiri(): Promise<void> {
        await this.#system().siriStop();
    }

    #system(): CompanionLinkSession['system'] {
        return requireSession(this.#companionLink(), 'system').system;
    }
}
