import { AIRPLAY_SERVICE } from '@corewire/airplay';
import { COMPANION_LINK_SERVICE } from '@corewire/companion-link';
import type { Logger } from '@corewire/core';
import { Discovery, type MdnsService, mdnsUnicast } from '@corewire/core/discovery';
import type { DeviceTarget } from '../types';

/** Ports knocked on to wake a sleeping Apple TV or HomePod; 7000 is AirPlay, 3689 is DAAP. */
export const WAKE_PORTS: readonly number[] = [7000, 3689, 49152, 32498];

/** Seconds the unicast query waits for answers; it finishes early once the service answered. */
const UNICAST_TIMEOUT = 5;

export type CompanionLinkRecord = {
    readonly port: number;
    readonly txt: Readonly<Record<string, string>>;
};

/** Normalizes a TXT `deviceid` or `mac` to `AA:BB:CC:DD:EE:FF`, or null when it is not a MAC. */
export function macOf(txt: Readonly<Record<string, string>> | undefined): string | null {
    const raw = txt?.deviceid ?? txt?.mac;

    if (!raw) {
        return null;
    }

    const clean = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase();

    if (clean.length !== 12) {
        return null;
    }

    return clean.match(/.{2}/g).join(':');
}

/**
 * Where the device is now. Before a retry it asks the last address with unicast DNS-SD, then the
 * consumer's `resolve`, or without one a multicast scan matched on MAC and id. When nobody answers
 * the last known address and port stay.
 */
export class Resolver {
    get companionLink(): CompanionLinkRecord | undefined {
        return this.#companionLink;
    }

    get target(): DeviceTarget {
        return this.#target;
    }

    readonly #logger: Logger;
    readonly #resolve?: (last: DeviceTarget) => Promise<DeviceTarget | null>;
    #companionLink?: CompanionLinkRecord;
    #target: DeviceTarget;

    constructor(target: DeviceTarget, logger: Logger, resolve?: (last: DeviceTarget) => Promise<DeviceTarget | null>) {
        this.#logger = logger;
        this.#resolve = resolve;
        this.#target = target;
    }

    async refreshAirPlay(): Promise<void> {
        const answer = (await this.#unicast(AIRPLAY_SERVICE))[0];

        if (answer) {
            this.#target = {...this.#target, port: answer.port, txt: answer.properties};

            return;
        }

        const found = this.#resolve ? await this.#consumerResolve() : await this.#multicast();

        if (found && found.address !== this.#target.address) {
            this.#logger.info('[device]', `Address changed from ${this.#target.address} to ${found.address}.`);
        }

        if (found) {
            this.#target = {...found, id: found.id ?? this.#target.id};
        }
    }

    async refreshCompanionLink(): Promise<void> {
        const answer = (await this.#unicast(COMPANION_LINK_SERVICE))[0];

        if (answer) {
            this.#companionLink = {port: answer.port, txt: answer.properties};
        }
    }

    async #consumerResolve(): Promise<DeviceTarget | null> {
        try {
            return await this.#resolve(this.#target);
        } catch (err) {
            this.#logger.warn('[device]', 'The resolve option failed.', err);

            return null;
        }
    }

    async #multicast(): Promise<DeviceTarget | null> {
        try {
            const results = await new Discovery(AIRPLAY_SERVICE).find(false);
            const mac = macOf(this.#target.txt);
            const match = (mac ? results.find(result => macOf(result.txt) === mac) : undefined)
                ?? results.find(result => result.id === this.#target.id);

            return match ? {address: match.address, port: match.service.port, txt: match.txt, id: match.id} : null;
        } catch (err) {
            this.#logger.warn('[device]', 'Multicast discovery failed.', err);

            return null;
        }
    }

    async #unicast(service: string): Promise<MdnsService[]> {
        const address = this.#target.address;

        try {
            const services = await mdnsUnicast([address], [service], UNICAST_TIMEOUT, WAKE_PORTS);

            return services.filter(found => found.address === address && found.type === service);
        } catch (err) {
            this.#logger.warn('[device]', `Unicast discovery of ${service} failed.`, err);

            return [];
        }
    }
}
