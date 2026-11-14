import type { Channel } from './channel';
import * as Messages from './messages';
import type { LaunchableApp } from './types';

/** The apps on the device: listing, launching, opening a URL and the top shelf. */
export class Apps {
    readonly #channel: Channel;

    constructor(channel: Channel) {
        this.#channel = channel;
    }

    async list(): Promise<LaunchableApp[]> {
        const reply = await this.#channel.exchange(Messages.fetchLaunchableApps());

        return Object.entries(reply._c as Record<string, string>).map(([bundleId, name]) => ({bundleId, name}));
    }

    async launch(bundleId: string): Promise<void> {
        await this.#channel.exchange(Messages.launchApp(bundleId));
    }

    /** Opens a URL; the device picks the app through universal links or the URL scheme. */
    async openUrl(url: string): Promise<void> {
        await this.#channel.exchange(Messages.launchUrl(url));
    }

    /** The top shelf items the device shows now, as the raw reply. */
    async topShelf(): Promise<any> {
        return await this.#channel.exchange(Messages.fetchCurrentTopShelfItems());
    }
}
