import { AIRPLAY_SERVICE } from '@corewire/airplay';
import { COMPANION_LINK_SERVICE } from '@corewire/companion-link';
import { ConnectionClosedError, type Logger } from '@corewire/core';
import { Discovery, type MdnsService, mdnsUnicast } from '@corewire/core/discovery';
import type { DeviceTarget } from '../types';

/** Ports knocked on to wake a sleeping Apple TV or HomePod; 7000 is AirPlay, 3689 is DAAP. */
export const WAKE_PORTS: readonly number[] = [7000, 3689, 49152, 32498];

/** Seconds the unicast query waits for answers; it finishes early once the service answered. */
const UNICAST_TIMEOUT = 5;

/** Milliseconds the `resolve` option gets before the attempt goes on with the last known address. */
const RESOLVE_TIMEOUT = 15_000;

export type ResolveFunction = (last: DeviceTarget, signal: AbortSignal) => Promise<DeviceTarget | null>;

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
    readonly #resolve?: ResolveFunction;
    #companionLink?: CompanionLinkRecord;
    #target: DeviceTarget;

    constructor(target: DeviceTarget, logger: Logger, resolve?: ResolveFunction) {
        this.#logger = logger;
        this.#resolve = resolve;
        this.#target = target;
    }

    /**
     * Looks up the current AirPlay address and port of the device.
     *
     * @throws {ConnectionClosedError} When the signal aborts while the `resolve` option runs.
     */
    async refreshAirPlay(signal: AbortSignal): Promise<void> {
        const answer = (await this.#unicast(AIRPLAY_SERVICE))[0];

        if (answer) {
            this.#target = {...this.#target, port: answer.port, txt: answer.properties};

            return;
        }

        const found = this.#resolve ? await this.#consumerResolve(signal) : await this.#multicast();

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

    /**
     * The consumer's lookup, bounded by {@link RESOLVE_TIMEOUT} and the attempt: a lookup that
     * hangs neither freezes the retries nor blocks a disconnect.
     */
    async #consumerResolve(signal: AbortSignal): Promise<DeviceTarget | null> {
        const bounded = AbortSignal.any([signal, AbortSignal.timeout(RESOLVE_TIMEOUT)]);
        let onAbort: () => void;

        const aborted = new Promise<never>((_, reject) => {
            onAbort = () => reject(bounded.reason);
            bounded.addEventListener('abort', onAbort, {once: true});
        });

        try {
            return await Promise.race([this.#resolve(this.#target, bounded), aborted]);
        } catch (err) {
            if (signal.aborted) {
                throw new ConnectionClosedError('AirPlay setup was interrupted.');
            }

            this.#logger.warn('[device]', bounded.aborted ? `The resolve option did not answer within ${RESOLVE_TIMEOUT} ms.` : 'The resolve option failed.', err);

            return null;
        } finally {
            bounded.removeEventListener('abort', onAbort);
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
