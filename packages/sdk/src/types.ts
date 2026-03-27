import type { Proto } from '@basmilius/apple-airplay';
import type { AttentionState, TextInputState } from '@basmilius/apple-companion-link';
import type { AirPlayClient } from './internal/airplay-client';
import type { AirPlayPlayer } from './internal/airplay-player';

/**
 * Device type identifier used in discovery results.
 */
export type DeviceType = 'appletv' | 'homepod' | 'homepod-mini' | 'unknown';

/**
 * Device-level events shared by all device types.
 */
export type DeviceEventMap = {
    connected: [];
    disconnected: [unexpected: boolean];
    recovering: [attempt: number];
    recoveryFailed: [];
};

/**
 * Additional events emitted by Apple TV devices.
 */
export type AppleTVEventMap = DeviceEventMap & {
    power: [state: AttentionState];
    textInput: [state: TextInputState];
};

/**
 * Events emitted by the state controller.
 */
export type StateEventMap = {
    nowPlayingChanged: [client: AirPlayClient | null, player: AirPlayPlayer | null];
    playbackStateChanged: [client: AirPlayClient, player: AirPlayPlayer, oldState: Proto.PlaybackState_Enum, newState: Proto.PlaybackState_Enum];
    volumeChanged: [volume: number];
    volumeMutedChanged: [muted: boolean];
    artworkChanged: [client: AirPlayClient, player: AirPlayPlayer];
    activeAppChanged: [bundleIdentifier: string | null, displayName: string | null];
    supportedCommandsChanged: [client: AirPlayClient, player: AirPlayPlayer, commands: Proto.CommandInfo[]];
    clusterChanged: [clusterId: string | null, isLeader: boolean];
};

/**
 * Connection recovery options.
 */
export type RecoveryOptions = {
    /** Maximum number of reconnection attempts. Default: 3. */
    readonly maxAttempts?: number;
    /** Base delay in milliseconds for exponential backoff. Default: 1000. */
    readonly baseDelay?: number;
    /** Interval in milliseconds between periodic reconnection attempts. 0 = disabled. Default: 900000 (15 min). */
    readonly reconnectInterval?: number;
};

/**
 * Options passed to device.connect().
 */
export type ConnectOptions = {
    /** Connection recovery configuration. Set to false to disable recovery. */
    readonly recovery?: RecoveryOptions | false;
};

/**
 * Device construction options.
 */
export type DeviceOptions = {
    /** IP address of the device. */
    readonly address?: string;
    /** Pre-discovered AirPlay service result. */
    readonly airplay?: import('@basmilius/apple-common').DiscoveryResult;
    /** Pre-discovered Companion Link service result (Apple TV only). */
    readonly companionLink?: import('@basmilius/apple-common').DiscoveryResult;
    /** Custom device identity to present during pairing. */
    readonly identity?: Partial<import('@basmilius/apple-common').DeviceIdentity>;
    /** Timing server for multi-room / audio streaming. */
    readonly timingServer?: import('@basmilius/apple-common').TimingServer;
};

export type {
    AttentionState,
    TextInputState
} from '@basmilius/apple-companion-link';

export type {
    AccessoryCredentials,
    DiscoveryResult,
    TimingServer
} from '@basmilius/apple-common';

export type {
    AirPlayClient,
    AirPlayPlayer
};

export { type ArtworkResult } from './internal/airplay-artwork';
export { type MediaCapabilities } from './internal/companion-link-state';
export { SendCommandError } from './internal/airplay-remote';
