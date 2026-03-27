// --- Devices ---
export { AppleTV, type AppleTVOptions } from './device/apple-tv';
export { HomePod } from './device/homepod';
export { HomePodMini } from './device/homepod-mini';
export { AbstractDevice } from './device/device';

// --- Controllers ---
export { RemoteController } from './controller/remote';
export { PlaybackController } from './controller/playback';
export { StateController } from './controller/state';
export { VolumeController } from './controller/volume';
export { ArtworkController } from './controller/artwork';
export { MediaController } from './controller/media';
export { AppsController } from './controller/apps';
export { KeyboardController } from './controller/keyboard';
export { PowerController } from './controller/power';
export { MultiroomController } from './controller/multiroom';
export { SystemController } from './controller/system';

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

// --- Re-export commonly needed protocol types ---
export { Proto } from '@basmilius/apple-airplay';
