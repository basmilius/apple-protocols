/// <reference types="node" preserve="true" />
export {
    AppleProtocolError,
    AuthenticationError,
    CommandError,
    ConnectionClosedError,
    ConnectionError,
    ConnectionTimeoutError,
    CredentialsError,
    DecryptionError,
    DiscoveryError,
    EncryptionError,
    InvalidResponseError,
    PairingError,
    PlaybackError,
    SetupError,
    TimeoutError,
    TLV8PairingError
} from './errors';

export {
    type DebugGroup,
    Logger,
    type LogSink,
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
    waitFor
} from './utils';

export type {
    EventMap
} from './types';
