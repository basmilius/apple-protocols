import { Plist } from '@corewire/core/encoding';
import type { Channel } from './channel';
import * as Messages from './messages';

/** System settings, Siri and the Up Next queue. */
export class System {
    readonly #channel: Channel;

    constructor(channel: Channel) {
        this.#channel = channel;
    }

    async toggleCaptions(): Promise<void> {
        await this.#channel.exchange(Messages.toggleCaptions());
    }

    /** The caption settings, over `_mcc`. */
    async getCaptionSetting(): Promise<object> {
        return await this.#channel.exchange(Messages.mediaCaptionSettingGet());
    }

    async setCaptionSetting(enabled: boolean): Promise<object> {
        return await this.#channel.exchange(Messages.mediaCaptionSettingSet(enabled));
    }

    /** Light appearance when true, dark when false. */
    async setAppearance(light: boolean): Promise<void> {
        await this.#channel.exchange(Messages.toggleSystemAppearance(light));
    }

    async setReduceLoudSounds(enabled: boolean): Promise<void> {
        await this.#channel.exchange(Messages.toggleReduceLoudSounds(enabled));
    }

    async setFindingMode(enabled: boolean): Promise<void> {
        await this.#channel.exchange(Messages.toggleFindingMode(enabled));
    }

    /** Push-to-talk begin; see `supportsSiriPTT` on the session. */
    async siriStart(): Promise<void> {
        await this.#channel.exchange(Messages.siriStart());
    }

    async siriStop(): Promise<void> {
        await this.#channel.exchange(Messages.siriStop());
    }

    /** What the device knows about the paired Siri Remote, from the plist in the reply. */
    async siriRemoteInfo(): Promise<any> {
        const reply = await this.#channel.exchange(Messages.fetchSiriRemoteInfo());

        return Plist.parse(Buffer.from(reply._c.SiriRemoteInfoKey).buffer);
    }

    /** The Up Next queue, as the raw reply. */
    async fetchUpNext(paginationToken?: string): Promise<any> {
        return await this.#channel.exchange(Messages.fetchUpNext(paginationToken));
    }

    async addToUpNext(identifier: string, kind: string): Promise<void> {
        await this.#channel.exchange(Messages.addToUpNext(identifier, kind));
    }

    async removeFromUpNext(identifier: string, kind: string): Promise<void> {
        await this.#channel.exchange(Messages.removeFromUpNext(identifier, kind));
    }

    async markAsWatched(identifier: string, kind: string): Promise<void> {
        await this.#channel.exchange(Messages.markAsWatched(identifier, kind));
    }
}
