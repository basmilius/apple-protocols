import { type DiscoverOptions, Discovery, type DiscoveryResult } from '@corewire/core/discovery';
import { parseFeatures } from './features';
import type { AirPlayTarget } from './types';

export const AIRPLAY_SERVICE = '_airplay._tcp.local';

/** An AirPlay service with the feature mask from its TXT record, when that parses. */
export type AirPlayDiscoveryResult = DiscoveryResult & {
    readonly features?: bigint;
};

/** Finds the AirPlay receivers on the local network. */
export async function discover(options: DiscoverOptions = {}): Promise<AirPlayDiscoveryResult[]> {
    const results = await new Discovery(AIRPLAY_SERVICE).find(options.useCache ?? true);

    return results.map(withFeatures);
}

/** The connect target for a discovered receiver. */
export function toTarget(result: DiscoveryResult): AirPlayTarget {
    const {features} = withFeatures(result);

    return {
        address: result.address,
        port: result.service.port,
        id: result.id,
        txt: result.txt,
        features
    };
}

/** Adds the parsed feature mask of the `features` (or `ft`) TXT value. */
export function withFeatures(result: DiscoveryResult): AirPlayDiscoveryResult {
    const features = result.txt.features ?? result.txt.ft;

    if (!features) {
        return result;
    }

    try {
        return {...result, features: parseFeatures(features)};
    } catch {
        return result;
    }
}
