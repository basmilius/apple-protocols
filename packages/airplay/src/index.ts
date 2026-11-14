/// <reference types="node" preserve="true" />
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

export type { AudioSource } from './audioSource';
export { AudioSourceSession } from './audioSourceSession';

export { AudioMultiplexer } from './audioMultiplexer';
export { AudioStream, type AudioStreamOptions, type AudioStreamStats } from './audioStream';
export { ControlStream } from './controlStream';
export { DataStream } from './dataStream';
export { EventStream, type EventStreamEventMap } from './eventStream';
export { LatencyManager } from './latencyManager';
export { Pairing, Verify } from './pairing';
export { type PlayQueueCommand, type PlayQueueState } from './playQueue';
export { Protocol, type PlaybackInfo } from './protocol';
export { parseMessages } from './utils';

export * as DataStreamMessage from './dataStreamMessages';
export * as Proto from './proto';
