import { AIRPLAY_SERVICE } from '@corewire/airplay';
import { RAOP_SERVICE } from '@corewire/airplay/raop';
import { COMPANION_LINK_SERVICE } from '@corewire/companion-link';
import { type DiscoverOptions, Discovery, type DiscoveryResult } from '@corewire/core/discovery';
import { AppleTV, type AppleTVOptions, HomePod } from '../device';
import { DeviceFamily, getDeviceFamily, lookupDeviceModel } from '../deviceModel';
import { macOf } from '../lifecycle/resolve';
import type { DiscoveredDevice, ServiceRecord } from '../types';

type Services = {
    airplay?: DiscoveryResult;
    companionLink?: DiscoveryResult;
    raop?: DiscoveryResult;
};

/** The family from the model table, or from the identifier for a model the table does not know yet. */
function familyOf(modelName: string): DeviceFamily {
    const family = getDeviceFamily(lookupDeviceModel(modelName));

    if (family !== DeviceFamily.Unknown) {
        return family;
    }

    if (/^AppleTV/i.test(modelName)) {
        return DeviceFamily.AppleTV;
    }

    if (/AudioAccessory/i.test(modelName)) {
        return DeviceFamily.HomePod;
    }

    return DeviceFamily.Unknown;
}

function recordOf(result: DiscoveryResult | undefined): ServiceRecord | undefined {
    return result ? {name: result.fqdn, port: result.service.port, txt: result.txt} : undefined;
}

function describe(address: string, services: Services): DiscoveredDevice {
    const primary = services.airplay ?? services.companionLink ?? services.raop;
    const modelName = services.airplay?.txt.model ?? primary.txt.model ?? primary.txt.am ?? '';

    return {
        id: primary.id,
        name: primary.fqdn,
        address,
        model: lookupDeviceModel(modelName),
        modelName,
        family: familyOf(modelName),
        mac: macOf(services.airplay?.txt ?? primary.txt),
        target: {address, port: services.airplay?.service.port, txt: services.airplay?.txt, id: primary.id},
        services: {
            airplay: recordOf(services.airplay),
            companionLink: recordOf(services.companionLink),
            raop: recordOf(services.raop)
        }
    };
}

/** One multicast scan for AirPlay, Companion Link and RAOP; the services of one host merge by address. */
export async function discover(options: DiscoverOptions = {}): Promise<DiscoveredDevice[]> {
    const results = await Discovery.findServices([AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE], options.useCache ?? true);
    const hosts = new Map<string, Services>();

    const add = (kind: keyof Services, result: DiscoveryResult): void => {
        const services = hosts.get(result.address) ?? {};

        services[kind] ??= result;
        hosts.set(result.address, services);
    };

    for (const result of results.get(AIRPLAY_SERVICE) ?? []) {
        add('airplay', result);
    }

    for (const result of results.get(COMPANION_LINK_SERVICE) ?? []) {
        add('companionLink', result);
    }

    for (const result of results.get(RAOP_SERVICE) ?? []) {
        add('raop', result);
    }

    return [...hosts].map(([address, services]) => describe(address, services));
}

/** An AppleTV for the Apple TV family, a HomePod for every other receiver. */
export function createDevice(found: DiscoveredDevice, options: AppleTVOptions = {}): AppleTV | HomePod {
    if (found.family === DeviceFamily.AppleTV) {
        return new AppleTV(found.target, options);
    }

    return new HomePod(found.target, options);
}
