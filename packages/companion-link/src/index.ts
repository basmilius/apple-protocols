export { default as Protocol } from './protocol';
export { default as Stream } from './stream';
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
    TouchPhase
} from './types';

export type {
    AttentionState,
    ButtonPressType,
    LaunchableApp,
    SwipeDirection,
    TextInputState,
    TouchPhaseValue,
    UserAccount
} from './types';
