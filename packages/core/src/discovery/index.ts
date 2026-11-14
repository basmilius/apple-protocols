/// <reference types="node" preserve="true" />
export {
    Discovery
} from './discovery';

export {
    multicast as mdnsMulticast,
    unicast as mdnsUnicast,
    type MdnsService
} from './mdns';

export type {
    DiscoveryResult
} from './types';
