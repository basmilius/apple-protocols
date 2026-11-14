import { Discovery, type DiscoveryResult } from '@corewire/core/discovery';
import type { CompanionLinkTarget } from './types';

export const COMPANION_LINK_SERVICE = '_companion-link._tcp.local';

export type DiscoverOptions = {
    /** Reuse a scan that is less than 30 seconds old. Default: true. */
    readonly useCache?: boolean;
};

/** Finds the devices on the local network that accept Companion Link connections. */
export async function discover(options: DiscoverOptions = {}): Promise<DiscoveryResult[]> {
    return await new Discovery(COMPANION_LINK_SERVICE).find(options.useCache ?? true);
}

/** The target of a discovery result. Reads the address, the port, the id and the TXT record only. */
export function toTarget(result: DiscoveryResult): CompanionLinkTarget {
    return {
        address: result.address,
        port: result.service.port,
        id: result.id,
        txt: result.txt
    };
}
