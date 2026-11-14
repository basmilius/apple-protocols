/// <reference types="node" preserve="true" />
export {
    Discovery
} from './discovery';

export {
    multicast as mdnsMulticast,
    unicast as mdnsUnicast,
    type MdnsService
} from './mdns';

export {
    type AdvertisedService,
    MdnsResponder
} from './responder';

export type {
    DiscoveryResult
} from './types';
