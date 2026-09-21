/// <reference types="node" preserve="true" />
export { Protocol } from './protocol';
export { Stream } from './stream';
export { Pairing, Verify } from './pairing';

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

export * as CompanionLinkMessage from './messages';

export {
    HidTouchPhase,
    TouchPhase
} from './types';

export type {
    AttentionState,
    ButtonPressType,
    HidTouchPhaseValue,
    LaunchableApp,
    SwipeDirection,
    TextInputState,
    TouchPhaseValue,
    UserAccount
} from './types';
