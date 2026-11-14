/// <reference types="node" preserve="true" />
export {
    HTTP_TIMEOUT,
    SOCKET_TIMEOUT
} from './const';

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
    PlaybackError,
    SetupError,
    TimeoutError
} from './errors';

export {
    type DebugGroup,
    Logger,
    type Reporter,
    type ReporterEntry,
    type ReporterSink,
    type ReporterSinkOptions,
    type TrafficDirection,
    type TrafficEntry,
    type TrafficProtocol,
    type TrafficSink,
    reporter
} from './reporter';

export {
    getLocalIP,
    getMacAddress,
    randomInt32,
    randomInt64,
    uint16ToBE,
    uint53ToLE,
    waitFor
} from './utils';

export type {
    EventMap
} from './types';
