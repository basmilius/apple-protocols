import { Discovery, type DiscoveryResult } from '@basmilius/apple-common';
import { AppleTV } from './device/apple-tv';
import { HomePod } from './device/homepod';
import { HomePodMini } from './device/homepod-mini';
import type { DeviceType } from './types';

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
 * Discovers Apple devices on the local network via mDNS.
 * Returns device descriptors that can be passed to createDevice().
 */
export async function discover(): Promise<DiscoveredDevice[]> {
    const airplayResults = await Discovery.airplay().find();
    const companionLinkResults = await Discovery.companionLink().find();

    // Group results by address.
    const byAddress = new Map<string, DiscoveredDevice>();

    for (const result of airplayResults) {
        byAddress.set(result.address, {
            id: result.id,
            name: result.familyName ?? result.fqdn,
            address: result.address,
            modelName: result.modelName,
            deviceType: detectDeviceType(result.modelName),
            services: { airplay: result }
        });
    }

    for (const result of companionLinkResults) {
        const existing = byAddress.get(result.address);

        if (existing) {
            byAddress.set(result.address, {
                ...existing,
                services: { ...existing.services, companionLink: result }
            });
        } else {
            byAddress.set(result.address, {
                id: result.id,
                name: result.familyName ?? result.fqdn,
                address: result.address,
                modelName: result.modelName,
                deviceType: detectDeviceType(result.modelName),
                services: { companionLink: result }
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
