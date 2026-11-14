import { AIRPLAY_SERVICE, withFeatures } from '@corewire/airplay';
import { RAOP_SERVICE } from '@corewire/airplay/raop';
import { COMPANION_LINK_SERVICE } from '@corewire/companion-link';
import { Discovery, type MdnsService, mdnsUnicast as unicast } from '@corewire/core/discovery';
import { AppleTV, HomePod, HomePodMini } from './device';
import type { DeviceType, DiscoveryResult } from './types';

/** Ports knocked on to wake a sleeping Apple TV or HomePod; 7000 is AirPlay, 3689 is DAAP. */
export const WAKE_PORTS: readonly number[] = [7000, 3689, 49152, 32498];

/** All services of one host, merged by device id. */
export type CombinedDiscoveryResult = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    airplay?: DiscoveryResult;
    companionLink?: DiscoveryResult;
    raop?: DiscoveryResult;
};

/** Unicast DNS-SD that first wakes the hosts on {@link WAKE_PORTS}. */
export function mdnsUnicast(hosts: string[], services: string[], timeout: number = 4, wakePorts: readonly number[] = WAKE_PORTS): Promise<MdnsService[]> {
    return unicast(hosts, services, timeout, wakePorts);
}

/** Scans for AirPlay, Companion Link and RAOP at once, skipping the cache, and merges the services per device id. */
export async function discoverAll(): Promise<CombinedDiscoveryResult[]> {
    const results = await Discovery.findServices([AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE], false);
    const devices = new Map<string, CombinedDiscoveryResult>();

    const add = (service: 'airplay' | 'companionLink' | 'raop', result: DiscoveryResult): void => {
        let device = devices.get(result.id);

        if (!device) {
            device = {id: result.id, name: result.fqdn, address: result.address};
            devices.set(result.id, device);
        }

        device[service] = result;
    };

    for (const result of results.get(AIRPLAY_SERVICE)) {
        add('airplay', withFeatures(result));
    }

    for (const result of results.get(COMPANION_LINK_SERVICE)) {
        add('companionLink', result);
    }

    for (const result of results.get(RAOP_SERVICE)) {
        add('raop', result);
    }

    return [...devices.values()];
}

/**
 * A discovered Apple device with its services and metadata.
 */
export type DiscoveredDevice = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    readonly modelName: string;
    readonly deviceType: DeviceType;
    readonly services: {
        readonly airplay?: DiscoveryResult;
        readonly companionLink?: DiscoveryResult;
        readonly raop?: DiscoveryResult;
    };
};

/**
 * Options for {@link discover}.
 */
export type DiscoverOptions = {
    /**
     * Reuse the results of an earlier scan when they are still fresh. Set to
     * false to force a new mDNS query. Default: true.
     */
    readonly useCache?: boolean;
};

/**
 * Discovers Apple devices on the local network via mDNS.
 * Returns device descriptors that can be passed to createDevice().
 */
export async function discover(options: DiscoverOptions = {}): Promise<DiscoveredDevice[]> {
    const useCache = options.useCache ?? true;
    const results = await Discovery.findServices([AIRPLAY_SERVICE, COMPANION_LINK_SERVICE], useCache);
    const airplayResults = results.get(AIRPLAY_SERVICE)!.map(withFeatures);
    const companionLinkResults = results.get(COMPANION_LINK_SERVICE)!;

    const byAddress = new Map<string, DiscoveredDevice>();

    for (const result of airplayResults) {
        byAddress.set(result.address, {
            id: result.id,
            name: result.familyName ?? result.fqdn,
            address: result.address,
            modelName: result.modelName,
            deviceType: detectDeviceType(result.modelName),
            services: {airplay: result}
        });
    }

    for (const result of companionLinkResults) {
        const existing = byAddress.get(result.address);

        if (existing) {
            byAddress.set(result.address, {
                ...existing,
                services: {...existing.services, companionLink: result}
            });
        } else {
            byAddress.set(result.address, {
                id: result.id,
                name: result.familyName ?? result.fqdn,
                address: result.address,
                modelName: result.modelName,
                deviceType: detectDeviceType(result.modelName),
                services: {companionLink: result}
            });
        }
    }

    return Array.from(byAddress.values());
}

/**
 * Creates a typed device instance from a discovery result.
 * Automatically selects AppleTV, HomePod, or HomePodMini based on the model.
 */
export function createDevice(discovered: DiscoveredDevice): AppleTV | HomePod | HomePodMini {
    switch (discovered.deviceType) {
        case 'appletv':
            return new AppleTV({
                airplay: discovered.services.airplay,
                companionLink: discovered.services.companionLink
            });

        case 'homepod-mini':
            return new HomePodMini({
                airplay: discovered.services.airplay
            });

        case 'homepod':
        default:
            return new HomePod({
                airplay: discovered.services.airplay
            });
    }
}

/**
 * Detects the device type from the model name string.
 */
function detectDeviceType(modelName: string): DeviceType {
    if (!modelName) {
        return 'unknown';
    }

    if (/^AppleTV/i.test(modelName)) {
        return 'appletv';
    }

    if (/AudioAccessory[56]/i.test(modelName)) {
        return 'homepod-mini';
    }

    if (/AudioAccessory/i.test(modelName)) {
        return 'homepod';
    }

    return 'unknown';
}
