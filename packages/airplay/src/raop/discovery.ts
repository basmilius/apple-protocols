import { type DiscoverOptions, Discovery, type DiscoveryResult } from '@corewire/core/discovery';
import type { RaopTarget } from './types';

export const RAOP_SERVICE = '_raop._tcp.local';

/** Finds the RAOP (AirPlay 1 audio) receivers on the local network. */
export async function discover(options: DiscoverOptions = {}): Promise<DiscoveryResult[]> {
    return await new Discovery(RAOP_SERVICE).find(options.useCache ?? true);
}

/** The connect target for a discovered receiver. */
export function toTarget(result: DiscoveryResult): RaopTarget {
    return {
        address: result.address,
        port: result.service.port,
        id: result.id,
        txt: result.txt
    };
}
