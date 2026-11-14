/// <reference types="node" preserve="true" />
export {
    AIRPLAY_SERVICE,
    COMPANION_LINK_SERVICE,
    RAOP_SERVICE
} from './const';

export {
    DeviceModel,
    DeviceType,
    getDeviceModelName,
    getDeviceType,
    isAirPort,
    isAppleTV,
    isHomePod,
    lookupDeviceModel
} from './deviceModel';

export {
    Discovery
} from './discovery';

export {
    parseFeatures
} from './features';

export {
    multicast as mdnsMulticast,
    unicast as mdnsUnicast,
    type MdnsService
} from './mdns';

export type {
    CombinedDiscoveryResult,
    DiscoveryResult
} from './types';
