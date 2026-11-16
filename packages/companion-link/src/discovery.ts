import { type DiscoverOptions, Discovery, type DiscoveryResult } from '@apple-protocols/core/discovery';
import type { CompanionLinkTarget } from './types';

export const COMPANION_LINK_SERVICE = '_companion-link._tcp.local';

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
