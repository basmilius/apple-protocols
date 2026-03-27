// --- Devices ---
export { AppleTV, type AppleTVOptions } from './device/apple-tv';
export { HomePod } from './device/homepod';
export { HomePodMini } from './device/homepod-mini';
export { AbstractDevice } from './device/device';

// --- Controllers ---
export { AccountsController } from './controller/accounts';
export { AppsController } from './controller/apps';
export { ArtworkController } from './controller/artwork';
export { KeyboardController } from './controller/keyboard';
export { MediaController } from './controller/media';
export { MultiroomController } from './controller/multiroom';
export { PlaybackController } from './controller/playback';
export { PowerController } from './controller/power';
export { RemoteController } from './controller/remote';
export { StateController } from './controller/state';
export { SystemController } from './controller/system';
export { VolumeController } from './controller/volume';

// --- Pairing ---
export { PairingSession } from './pairing/pairing-session';
export type { PairingOptions, PairingResult } from './pairing/types';

// --- Discovery ---
export { discover, createDevice, type DiscoveredDevice } from './discover';

// --- Configuration ---
export { configure, type SdkConfig } from './configure';

// --- Types ---
export type {
    AccessoryCredentials,
    AirPlayClient,
    AirPlayPlayer,
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
    TextInputState,
    TimingServer
} from './types';

export { SendCommandError } from './types';

// --- Internals (for advanced/diagnostics use) ---
export { AirPlayManager } from './internal/airplay-manager';
export { AirPlayState } from './internal/airplay-state';
export { AirPlayRemote } from './internal/airplay-remote';
export { AirPlayVolume } from './internal/airplay-volume';
export { AirPlayArtwork } from './internal/airplay-artwork';
export { CompanionLinkManager } from './internal/companion-link-manager';
export { CompanionLinkState } from './internal/companion-link-state';
export { PROTOCOL as AIRPLAY_PROTOCOL, COMPANION_LINK_PROTOCOL } from './internal/const';

// --- Re-export commonly needed protocol types ---
export { Proto } from '@basmilius/apple-airplay';
