import { Discovery, type DiscoveryResult } from '@corewire/core/discovery';
import { parseFeatures } from './features';

export const AIRPLAY_SERVICE = '_airplay._tcp.local';

/** An AirPlay service with the feature mask from its TXT record, when that parses. */
export type AirPlayDiscoveryResult = DiscoveryResult & {
    readonly features?: bigint;
};

export type DiscoverOptions = {
    /** Reuse a scan that is less than 30 seconds old. Default: true. */
    readonly useCache?: boolean;
};

/** Finds the AirPlay receivers on the local network. */
export async function discover(options: DiscoverOptions = {}): Promise<AirPlayDiscoveryResult[]> {
    const results = await new Discovery(AIRPLAY_SERVICE).find(options.useCache ?? true);

    return results.map(withFeatures);
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
