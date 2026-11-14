import type { Hid, MediaRemote } from '@corewire/airplay/mrp';
import type { CompanionLinkSession } from '@corewire/companion-link';
import { UnavailableError } from '../errors';
import type { PressOptions, RemoteKey } from '../types';
import { AIRPLAY_KEYS, COMPANION_LINK_KEYS } from './keys';

type AirPlayKey = keyof typeof AIRPLAY_KEYS & keyof Hid;

/**
 * Remote keys. A tap goes over AirPlay HID when AirPlay knows the key; a hold or a double press goes
 * over Companion Link when it is connected and knows the key. Either way falls back to the other
 * protocol. These are the paths the presses took before, so the bytes on the wire stay the same.
 */
export interface RemoteControl {
    /** @throws {UnavailableError} When no connected protocol knows the key. */
    press(key: RemoteKey, options?: PressOptions): Promise<void>;
}

export class RemoteController implements RemoteControl {
    readonly #companionLink: () => CompanionLinkSession | undefined;
    readonly #remote: () => MediaRemote | undefined;

    constructor(remote: () => MediaRemote | undefined, companionLink: () => CompanionLinkSession | undefined) {
        this.#companionLink = companionLink;
        this.#remote = remote;
    }

    /** @throws {UnavailableError} When no connected protocol knows the key. */
    async press(key: RemoteKey, options: PressOptions = {}): Promise<void> {
        const mode = options.mode ?? 'tap';
        const remote = AIRPLAY_KEYS[key] ? this.#remote() : undefined;
        const command = COMPANION_LINK_KEYS[key];
        const companionLink = command ? this.#companionLink() : undefined;

        if (mode === 'tap' && remote) {
            await remote.hid[key as AirPlayKey]();

            return;
        }

        if (companionLink) {
            const type = mode === 'hold' ? 'Hold' : mode === 'double' ? 'DoubleTap' : 'SingleTap';

            await companionLink.hid.press(command, type, options.holdMs);

            return;
        }

        if (!remote) {
            throw new UnavailableError('remote', 'disconnected', `No connected protocol can press '${key}'.`);
        }

        const [page, usage] = AIRPLAY_KEYS[key];

        if (mode === 'double') {
            await remote.hid.doublePress(page, usage);
        } else {
            await remote.hid.longPress(page, usage, options.holdMs);
        }
    }
}
