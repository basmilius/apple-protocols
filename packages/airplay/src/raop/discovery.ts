import { type DiscoverOptions, Discovery, type DiscoveryResult } from '@corewire/core/discovery';

export const RAOP_SERVICE = '_raop._tcp.local';

/** Finds the RAOP (AirPlay 1 audio) receivers on the local network. */
export async function discover(options: DiscoverOptions = {}): Promise<DiscoveryResult[]> {
    return await new Discovery(RAOP_SERVICE).find(options.useCache ?? true);
}
