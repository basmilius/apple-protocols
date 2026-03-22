export {
    v4 as uuid
} from 'uuid';

export {
    AirPlayFeatureFlags,
    describeFlags,
    getPairingRequirement,
    getProtocolVersion,
    hasFeatureFlag,
    isPasswordRequired,
    isRemoteControlSupported,
    parseFeatures,
    type AirPlayFeatureFlagName,
    type PairingRequirement
} from './airplayFeatures';

export {
    JsonStorage,
    MemoryStorage,
    Storage,
    type ProtocolType,
    type StorageData,
    type StoredDevice
} from './storage';

export {
    Discovery
} from './discovery';

export {
    multicast as mdnsMulticast,
    unicast as mdnsUnicast,
    type MdnsService
} from './mdns';

export {
    prompt,
    waitFor
} from './cli';

export {
    Connection,
    EncryptionAwareConnection,
    EncryptionState
} from './connection';

export {
    Context
} from './context';

export {
    AIRPLAY_SERVICE,
    AIRPLAY_TRANSIENT_PIN,
    COMPANION_LINK_SERVICE,
    HTTP_TIMEOUT,
    RAOP_SERVICE
} from './const';

export {
    type AccessoryCredentials,
    type AccessoryKeys,
    AccessoryPair,
    AccessoryVerify
} from './pairing';

export {
    type Logger,
    type Reporter,
    reporter
} from './reporter';

export {
    ENCRYPTION
} from './symbols';

export {
    ConnectionRecovery,
    type ConnectionRecoveryOptions
} from './recovery';

export {
    TimingServer
} from './timing';

export {
    generateActiveRemoteId,
    generateSessionId,
    generateDacpId,
    getLocalIP,
    getMacAddress,
    randomInt32,
    randomInt64,
    uint16ToBE,
    uint53ToLE
} from './utils';

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
    AppleProtocolError,
    AuthenticationError,
    CommandError,
    ConnectionClosedError,
    ConnectionError,
    ConnectionTimeoutError,
    CredentialsError,
    DiscoveryError,
    EncryptionError,
    InvalidResponseError,
    PairingError,
    SetupError,
    TimeoutError
} from './errors';

export type {
    AudioSource
} from './audioSource';

export type {
    CombinedDiscoveryResult,
    ConnectionState,
    DiscoveryResult,
    EventMap
} from './types';
