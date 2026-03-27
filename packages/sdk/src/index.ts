// --- Devices ---
export { AbstractDevice, AppleTV, type AppleTVOptions, HomePod, HomePodMini } from './device';

// --- Controllers ---
export {
    AccountsController,
    AppsController,
    ArtworkController,
    KeyboardController,
    MediaController,
    MultiroomController,
    PlaybackController,
    PowerController,
    RemoteController,
    StateController,
    SystemController,
    VolumeController
} from './controller';

// --- Pairing ---
export { PairingSession, type PairingOptions, type PairingResult } from './pairing';

// --- Internals (for advanced/diagnostics use) ---
export {
    AirPlayArtwork,
    AirPlayClient,
    AirPlayManager,
    AirPlayPlayer,
    AirPlayRemote,
    AirPlayState,
    AirPlayVolume,
    CompanionLinkManager,
    CompanionLinkState,
    AIRPLAY_PROTOCOL,
    COMPANION_LINK_PROTOCOL
} from './internal';

// --- Discovery ---
export { discover, createDevice, type DiscoveredDevice } from './discover';

// --- Configuration ---
export { configure, type SdkConfig } from './configure';

// --- Types ---
export type {
    AccessoryCredentials,
    AppleTVEventMap,
    ArtworkResult,
    AttentionState,
    ConnectOptions,
    DeviceEventMap,
    DeviceOptions,
    DeviceType,
    DiscoveryResult,
    MediaCapabilities,
    RecoveryOptions,
    StateEventMap,
    TextInputState
} from './types';

export { SendCommandError } from './types';

// --- Re-exports from protocol packages ---
export { Proto } from '@basmilius/apple-airplay';
export { TimingServer } from '@basmilius/apple-common';
