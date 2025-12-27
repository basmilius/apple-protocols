export type { default as CompanionLinkApi } from './api';
export type { default as CompanionLinkPairing } from './pairing';
export type { default as CompanionLinkVerify } from './verify';

export type {
    HidCommandKey,
    MediaControlCommandKey
} from './const';

export type {
    AttentionState,
    ButtonPressType,
    LaunchableApp,
    UserAccount
} from './types';

export {
    HidCommand,
    MediaControlCommand
} from './const';

export {
    convertAttentionState
} from './utils';

export { default as CompanionLink } from './protocol';
