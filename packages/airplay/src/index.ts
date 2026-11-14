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
    RemoteControlChannels,
    RemoteControlOptions,
    SessionCloseReason,
    StreamAudioOptions
} from './types';

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

export type {
    AudioStreamStats
} from './audio/stream';

export type {
    AudioSource
} from './audio/source';

export {
    AirPlayFeatureFlags,
    describeFlags,
    getPairingRequirement,
    getProtocolVersion,
    hasFeatureFlag,
    isPasswordRequired,
    isRemoteControlSupported,
    type AirPlayFeatureFlagName,
    type PairingRequirement
} from './airplayFeatures';

export {
    AUDIO_BYTES_PER_CHANNEL,
    AUDIO_CHANNELS,
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
    TimingServer
} from './timing';
