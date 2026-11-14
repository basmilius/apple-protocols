import { AIRPLAY_SERVICE, withFeatures } from '@corewire/airplay';
import { RAOP_SERVICE } from '@corewire/airplay/raop';
import { COMPANION_LINK_SERVICE } from '@corewire/companion-link';
import { Discovery, type DiscoveryResult } from '@corewire/core/discovery';
import type { DeviceTarget } from '@corewire/devices';
import type { DeviceType } from '@shared/contract';

/**
 * A discovered device with the raw discovery result of every service. Diagnostics shows those
 * results and pairs from them, which the public `discover()` of devices no longer returns.
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
    };
};

/** All services of one host, merged by device id. */
export type CombinedDiscoveryResult = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    airplay?: DiscoveryResult;
    companionLink?: DiscoveryResult;
    raop?: DiscoveryResult;
};

/** The model identifier from the TXT record; Apple services advertise it as `model` or `am`. */
export function modelOf(result: DiscoveryResult): string {
    return result.txt.model ?? result.txt.am ?? '';
}

function deviceTypeOf(modelName: string): DeviceType {
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

/** The target a device is constructed with: the AirPlay service, else the bare address. */
export function targetOf(device: DiscoveredDevice): DeviceTarget {
    const airplay = device.services.airplay;

    return airplay
        ? {address: airplay.address, port: airplay.service.port, txt: airplay.txt, id: airplay.id}
        : {address: device.address, id: device.id};
}

/** Scans AirPlay and Companion Link and merges the results by address. */
export async function discoverDevices(useCache: boolean): Promise<DiscoveredDevice[]> {
    const results = await Discovery.findServices([AIRPLAY_SERVICE, COMPANION_LINK_SERVICE], useCache);
    const byAddress = new Map<string, DiscoveredDevice>();

    for (const result of results.get(AIRPLAY_SERVICE).map(withFeatures)) {
        byAddress.set(result.address, {
            id: result.id,
            name: result.fqdn,
            address: result.address,
            modelName: modelOf(result),
            deviceType: deviceTypeOf(modelOf(result)),
            services: {airplay: result}
        });
    }

    for (const result of results.get(COMPANION_LINK_SERVICE)) {
        const existing = byAddress.get(result.address);

        byAddress.set(result.address, existing
            ? {...existing, services: {...existing.services, companionLink: result}}
            : {
                id: result.id,
                name: result.fqdn,
                address: result.address,
                modelName: modelOf(result),
                deviceType: deviceTypeOf(modelOf(result)),
                services: {companionLink: result}
            });
    }

    return [...byAddress.values()];
}

/** Scans AirPlay, Companion Link and RAOP at once, skipping the cache, and merges them by device id. */
export async function discoverAllDevices(): Promise<CombinedDiscoveryResult[]> {
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
