import type { AirPlaySession, TimingServer } from '@corewire/airplay';
import type { MediaRemote } from '@corewire/airplay/mrp';
import type { CompanionLinkSession } from '@corewire/companion-link';
import type { DeviceFamily, DeviceModel } from './deviceModel';

export type { AudioSource } from '@corewire/airplay';

/** Where a device is. Only the address is required. */
export type DeviceTarget = {
    readonly address: string;

    /** AirPlay RTSP port; 7000 when omitted. */
    readonly port?: number;

    /** The AirPlay TXT record, when known. Supplies the model and the MAC (`deviceid`) for re-resolving. */
    readonly txt?: Readonly<Record<string, string>>;

    /** The mDNS host id, e.g. `Woonkamer-TV.local`. Tags the logs; the address when omitted. */
    readonly id?: string;
};

export type LogLevel = 'debug' | 'error' | 'info' | 'net' | 'raw' | 'warn';

export type LogEntry = {
    readonly level: LogLevel;
    readonly device: string;
    readonly message: string;
    readonly args: readonly unknown[];
    readonly timestamp: number;
};

/** Overrides of the identity this client presents to the device. */
export type ClientIdentity = Partial<{
    /**
     * The name this client presents, `CoreWire` when omitted: the name the Apple TV lists after a
     * PIN pairing, and the name in the AirPlay SETUP, URL playback, MRP device info and Companion
     * Link system info.
     */
    readonly name: string;
    readonly model: string;
    readonly osName: string;
    readonly osVersion: string;
    readonly osBuildVersion: string;
    readonly sourceVersion: string;
}>;

export type DeviceOptions = {
    /** Receives the log entries of this device at {@link logLevels}. The global reporter in core still gets them too. */
    log?(entry: LogEntry): void;

    /** Default `['error', 'warn']`. */
    readonly logLevels?: readonly LogLevel[];

    /**
     * NTP timing server announced in every SETUP. Omitted: a server shared by all devices, started at the
     * first connect of a device that uses it. `false`: SETUP announces no timing.
     */
    readonly timing?: TimingServer | false;

    /**
     * Looks the device up before a recovery attempt when the unicast query at the last address found nothing.
     * A device with this option never scans with multicast; the consumer owns discovery. The signal
     * aborts after 15 seconds or when the attempt is cancelled; the attempt then goes on with the
     * last known address, or stops.
     */
    resolve?(last: DeviceTarget, signal: AbortSignal): Promise<DeviceTarget | null>;

    readonly identity?: ClientIdentity;
};

export type DeviceState = 'disconnected' | 'connecting' | 'connected' | 'degraded' | 'recovering' | 'offline';

export type StatusReason =
    | 'requested'
    | 'established'
    | 'remote'
    | 'timeout'
    | 'error'
    | 'failed'
    | 'scheduled';

export type LinkState = 'off' | 'connecting' | 'connected' | 'waiting';

export type RetryPhase = 'quick' | 'slow' | 'rare';

export type ProtocolStatus = {
    readonly state: LinkState;

    /** The number of the retry that is scheduled or running since the protocol was last connected; 0 for the first connect. */
    readonly attempt: number;

    /** Null unless the protocol waits for, or runs, a retry. */
    readonly phase: RetryPhase | null;

    /** Epoch milliseconds of the next attempt, or null when none is scheduled. */
    readonly nextAttemptAt: number | null;

    /** The last failure or close error; null once connected. */
    readonly error: Error | null;
};

export type Status = {
    readonly state: DeviceState;
    readonly reason: StatusReason;
    readonly error: Error | null;
    readonly airplay: ProtocolStatus;

    /** Apple TV only. */
    readonly companionLink?: ProtocolStatus;
};

export type Capability = 'remote' | 'nowPlaying' | 'playback' | 'volume' | 'artwork' | 'multiroom' | 'streamAudio' | 'playUrl';
export type HomePodCapability = Capability;
export type AppleTVCapability = Capability | 'text' | 'power' | 'apps' | 'accounts' | 'system' | 'touch';

/** The protocol sessions in use now; a field is undefined while its protocol is down. */
export type DeviceSessions = {
    readonly airplay?: AirPlaySession;
    readonly mediaRemote?: MediaRemote;
    readonly companionLink?: CompanionLinkSession;
};

export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'interrupted' | 'seeking' | 'unknown';
export type RepeatMode = 'off' | 'one' | 'all';
export type ShuffleMode = 'off' | 'albums' | 'songs';
export type MediaKind = 'audio' | 'video' | 'unknown';

export type NowPlayingSeries = {
    readonly name: string;
    readonly season: number;
    readonly episode: number;
    readonly episodeTitle: string;
};

export type NowPlaying = {
    readonly app: {readonly bundleId: string; readonly name: string};
    readonly player: string;
    readonly state: PlaybackState;
    readonly title: string;
    readonly artist: string;

    /** The `trackArtistName` of the item metadata, for apps that leave `artist` empty. */
    readonly trackArtist: string;

    readonly album: string;
    readonly genre: string;

    /** Seconds; 0 when unknown. */
    readonly duration: number;

    readonly rate: number;
    readonly repeat: RepeatMode;
    readonly shuffle: ShuffleMode;
    readonly kind: MediaKind;
    readonly series: NowPlayingSeries | null;
    readonly contentRating: string;
    readonly contentIdentifier: string;
    readonly artworkId: string | null;

    /** The iTunes Store album id; null when absent or 0. */
    readonly storeAlbumId: string | null;

    /** The Apple Music song id for lyrics; null when absent. */
    readonly lyricsId: string | null;

    readonly isAlwaysLive: boolean;
    readonly isAdvertisement: boolean;
};

export type NowPlayingCommand =
    | 'play'
    | 'pause'
    | 'togglePlayPause'
    | 'stop'
    | 'next'
    | 'previous'
    | 'skipForward'
    | 'skipBackward'
    | 'seek'
    | 'repeat'
    | 'shuffle'
    | 'rate';

export type Lyrics = {
    readonly identifier: string;
    readonly text: string | null;
    readonly available: boolean | null;
    readonly url: string | null;
    readonly catalogId: string | null;
};

/** Absolute and Both map to `absolute`. */
export type VolumeMode = 'absolute' | 'relative' | 'none';

export type VolumeState = {
    /** 0 to 1; 0 until the device reports. */
    readonly level: number;

    readonly muted: boolean;
    readonly available: boolean;
    readonly mode: VolumeMode;
};

/** A speaker or TV in the multi-room group. */
export type OutputDevice = {
    /** Identifies the device in the multiroom calls. */
    readonly uid: string;

    readonly name: string;

    /** The model identifier, e.g. `AudioAccessory5,1`; empty when unknown. */
    readonly model: string;

    readonly groupId: string | null;

    /** Whether this is the device the session runs on. */
    readonly isLocal: boolean;

    readonly isGroupLeader: boolean;
    readonly hasVolumeControl: boolean;
};

export type RemoteKey =
    | 'up'
    | 'down'
    | 'left'
    | 'right'
    | 'select'
    | 'menu'
    | 'home'
    | 'playPause'
    | 'volumeUp'
    | 'volumeDown'
    | 'mute'
    | 'channelUp'
    | 'channelDown'
    | 'wake'
    | 'suspend'
    | 'topMenu'
    | 'play'
    | 'pause'
    | 'stop'
    | 'next'
    | 'previous'
    | 'siri'
    | 'screensaver'
    | 'guide'
    | 'pageUp'
    | 'pageDown'
    | 'info'
    | 'captions'
    | 'power'
    | 'back'
    | 'exit'
    | 'skipForward'
    | 'skipBackward';

export type PressMode = 'tap' | 'double' | 'hold';

export type PressOptions = {
    readonly mode?: PressMode;

    /** How long a hold lasts; 500 over Companion Link and 1000 over AirPlay when omitted. */
    readonly holdMs?: number;
};

export type PowerState = 'unknown' | 'asleep' | 'screensaver' | 'awake' | 'idle';

export type TextState = {
    readonly active: boolean;
    readonly text: string;
    readonly secure: boolean;
    readonly keyboardType: number;
    readonly autocorrection: boolean;
    readonly autocapitalization: boolean;
};

export type App = {
    readonly bundleId: string;
    readonly name: string;
};

export type Account = {
    readonly id: string;
    readonly name: string;
};

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export type Artwork = {
    readonly url: string | null;
    readonly data: Uint8Array | null;

    /** For example `image/jpeg`. */
    readonly mimeType: string;

    /** The artwork identifier of the item, for change detection. */
    readonly identifier: string | null;

    /** In pixels; 0 when unknown. */
    readonly width: number;
    readonly height: number;
};

export type AnimatedArtwork = {
    readonly format: string;
    readonly url: string | null;
    readonly source?: 'device' | 'apple-music';
};

export type PlayUrlOptions = {
    /** Start position in seconds; 0 when omitted. */
    readonly position?: number;

    readonly signal?: AbortSignal;
};

export type StreamAudioOptions = {
    /** 0 to 1, sent as `20 * log10(volume)` dB, -144 for 0. -20 dB when omitted. */
    readonly volume?: number;

    readonly signal?: AbortSignal;
};

export type ServiceRecord = {
    readonly name: string;
    readonly port: number;
    readonly txt: Readonly<Record<string, string>>;
};

export type DiscoveredDevice = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    readonly model: DeviceModel;
    readonly modelName: string;
    readonly family: DeviceFamily;

    /** The TXT `deviceid`, normalized to `AA:BB:CC:DD:EE:FF`. */
    readonly mac: string | null;

    /** The AirPlay target to construct a device with. */
    readonly target: DeviceTarget;

    readonly services: {
        readonly airplay?: ServiceRecord;
        readonly companionLink?: ServiceRecord;
        readonly raop?: ServiceRecord;
    };
};
