/// <reference types="node" preserve="true" />
export {
    AppleDevice,
    AppleTV,
    type AppleTVOptions,
    HomePod
} from './device';

export {
    Credentials
} from './credentials/credentials';

export {
    Pairing,
    type PairOptions
} from './pairing/pairing';

export {
    UnavailableError
} from './errors';

export {
    createDevice,
    discover
} from './discovery/discover';

export type {
    DiscoverOptions
} from '@corewire/core/discovery';

export {
    WAKE_PORTS
} from './lifecycle/resolve';

export {
    DeviceFamily,
    DeviceModel,
    getDeviceFamily,
    getDeviceModelName,
    isAirPort,
    isAppleTV,
    isHomePod,
    lookupDeviceModel
} from './deviceModel';

export type { AccountsControl } from './accounts/accounts';
export type { AppsControl } from './apps/apps';
export type { ArtworkControl } from './artwork/artwork';
export type { MediaControl, MediaPlayback } from './media/media';
export type { MultiroomControl } from './multiroom/multiroom';
export type { NowPlayingControl } from './nowPlaying/nowPlaying';
export type { PlaybackControl } from './playback/playback';
export type { PowerControl } from './power/power';
export type { RemoteControl } from './remote/remote';
export type { SystemControl } from './system/system';
export type { TextControl } from './text/text';
export type { TouchControl } from './touch/touch';
export type { VolumeControl } from './volume/volume';

export type {
    Account,
    AnimatedArtwork,
    App,
    AppleTVCapability,
    Artwork,
    AudioSource,
    Capability,
    ClientIdentity,
    DeviceOptions,
    DeviceSessions,
    DeviceState,
    DeviceTarget,
    DiscoveredDevice,
    HomePodCapability,
    LinkState,
    LogEntry,
    LogLevel,
    Lyrics,
    MediaKind,
    NowPlaying,
    NowPlayingCommand,
    NowPlayingSeries,
    PlaybackState,
    PlayUrlOptions,
    PowerState,
    PressMode,
    PressOptions,
    ProtocolStatus,
    RemoteKey,
    RepeatMode,
    RetryPhase,
    ServiceRecord,
    ShuffleMode,
    Status,
    StatusReason,
    StreamAudioOptions,
    SwipeDirection,
    TextState,
    VolumeMode,
    VolumeState
} from './types';
