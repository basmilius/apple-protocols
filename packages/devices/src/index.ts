export type { AppleMusicLyricsOptions } from './internal/apple-music-lyrics';
/// <reference types="node" preserve="true" />
export type { AnimatedArtworkResult } from './internal/airplay-artwork';
export type { LyricsResult } from './controller/media';
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
export { discover, discoverAll, createDevice, type CombinedDiscoveryResult, type DiscoveredDevice, type DiscoverOptions, mdnsUnicast, WAKE_PORTS } from './discover';
export { DeviceFamily, DeviceModel, getDeviceFamily, getDeviceModelName, isAirPort, isAppleTV, isHomePod, lookupDeviceModel } from './deviceModel';

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
export { AIRPLAY_SERVICE, type AudioSource, Proto, TimingServer } from '@corewire/airplay';
export { RAOP_SERVICE } from '@corewire/airplay/raop';
export { COMPANION_LINK_SERVICE } from '@corewire/companion-link';
export { type DebugGroup, reporter, type ReporterEntry, type ReporterSink, type ReporterSinkOptions, type TrafficDirection, type TrafficEntry, type TrafficProtocol, type TrafficSink } from '@corewire/core';
export { mdnsMulticast, type MdnsService } from '@corewire/core/discovery';
export { JsonStorage, MemoryStorage, type ProtocolType, Storage } from '@corewire/core/storage';
export { ConnectionRecovery } from '@corewire/core/transport';
