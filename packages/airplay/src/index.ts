/// <reference types="node" preserve="true" />
export {
    AirPlaySession,
    connect
} from './session';

export {
    pair,
    PinPairing
} from './pairing';

export type {
    AirPlayTarget,
    ConnectOptions,
    PairOptions,
    PlayUrlOptions,
    RemoteControl,
    RemoteControlOptions,
    SessionCloseReason,
    StreamAudioOptions
} from './types';

export {
    ControlChannel
} from './channels/control';

export {
    DataChannel,
    type DataChannelEventMap
} from './channels/data';

export {
    EventChannel,
    type EventChannelEventMap
} from './channels/event';

export {
    type PlaybackInfo,
    UrlPlayback
} from './playback/playback';

export type {
    PlayQueueCommand,
    PlayQueueState
} from './playback/playQueue';

export {
    AudioPlayback
} from './audio/playback';

export {
    AudioMultiplexer
} from './audio/multiplexer';

export {
    AudioStream,
    type AudioStreamOptions,
    type AudioStreamStats,
    type AudioStreamTarget
} from './audio/stream';

export {
    LatencyManager
} from './audio/latency';

export type {
    AudioSource
} from './audio/source';

export {
    AudioSourceSession
} from './audio/sourceSession';

export {
    AirPlayFeatureFlags,
    describeFlags,
    getPairingRequirement,
    getProtocolVersion,
    hasFeatureFlag,
    isPasswordRequired,
    isRemoteControlSupported,
    SENDER_FEATURES_AUDIO,
    SENDER_FEATURES_REMOTE_CONTROL,
    type AirPlayFeatureFlagName,
    type PairingRequirement
} from './airplayFeatures';

export {
    AUDIO_BYTES_PER_CHANNEL,
    AUDIO_CHANNELS,
    AUDIO_FRAMES_PER_PACKET,
    AUDIO_SAMPLE_RATE
} from './const';

export {
    AIRPLAY_SERVICE,
    type AirPlayDiscoveryResult,
    discover,
    toTarget,
    withFeatures
} from './discovery';

export {
    parseFeatures
} from './features';

export {
    generateActiveRemoteId,
    generateDacpId,
    generateSessionId
} from './identifiers';

export {
    PtpMaster,
    selectTimingStrategy,
    TimingServer,
    type TimingStrategy
} from './timing';
