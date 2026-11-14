/// <reference types="node" preserve="true" />
export {
    CompanionLinkSession,
    connect,
    SetupClosedError
} from './session';

export {
    pair,
    PinPairing
} from './pairing';

export {
    COMPANION_LINK_SERVICE,
    discover,
    type DiscoverOptions,
    toTarget
} from './discovery';

export type {
    AttentionState,
    ButtonPressType,
    CompanionLinkTarget,
    ConnectOptions,
    HidTouchPhaseValue,
    LaunchableApp,
    MediaCapabilities,
    PairOptions,
    SessionCloseReason,
    SwipeDirection,
    TextInputState,
    TouchPhaseValue,
    UserAccount
} from './types';

export {
    HidTouchPhase,
    TouchPhase
} from './types';

export {
    CompanionLinkState,
    type CompanionLinkStateEventMap
} from './state';

export {
    Accounts
} from './accounts';

export {
    Apps
} from './apps';

export {
    Hid
} from './hid';

export {
    Interests
} from './interests';

export {
    Media
} from './media';

export {
    Power
} from './power';

export {
    System
} from './system';

export {
    Text
} from './text';

export {
    Touch
} from './touch';

export {
    Channel,
    type EventListener,
    type Reply
} from './channel';

export {
    Stream,
    type StreamEventMap
} from './stream';

export {
    HidCommand,
    MediaControlCommand,
    MediaControlFlag,
    type HidCommandKey,
    type MediaControlCommandKey
} from './const';

export {
    FrameType,
    MessageType,
    OPackFrameTypes,
    PairingFrameTypes
} from './frame';

export {
    convertAttentionState
} from './utils';

export * as Messages from './messages';
