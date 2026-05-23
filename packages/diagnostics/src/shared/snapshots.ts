// ---------------------------------------------------------------------
// Device + connection
// ---------------------------------------------------------------------

export type DeviceType = 'appletv' | 'homepod' | 'homepod-mini' | 'other';
export type DeviceProtocol = 'airplay' | 'companionLink';
export type AttentionState = 'unknown' | 'asleep' | 'screensaver' | 'awake' | 'idle';

export type DeviceInfo = {
    id: string;
    name: string;
    model: string;
    address: string;
    port: number;
    type: DeviceType;
    protocols: DeviceProtocol[];
    paired: DeviceProtocol[];
};

// ---------------------------------------------------------------------
// Now playing / state snapshot
// ---------------------------------------------------------------------

export type PlaybackStateLabel = 'Unknown' | 'Stopped' | 'Playing' | 'Paused' | 'Interrupted' | 'Seeking';
export type ShuffleModeLabel = 'Unknown' | 'Off' | 'Albums' | 'Songs';
export type RepeatModeLabel = 'Unknown' | 'Off' | 'One' | 'All';
export type MediaTypeLabel = 'Unknown' | 'Audio' | 'Video';

export type ParticipantSnapshot = {
    identifier: string;
    displayName: string;
    type: 'Unknown' | 'AppleID' | 'DeviceLocal';
};

export type PlayerSnapshot = {
    identifier: string;
    displayName: string;
    isActive: boolean;
    isDefaultPlayer: boolean;
    playbackState: PlaybackStateLabel;
    title: string;
    artist: string;
    album: string;
    genre: string;
    seriesName: string;
    seasonNumber: number;
    episodeNumber: number;
    mediaType: MediaTypeLabel;
    contentIdentifier: string;
    shuffleMode: ShuffleModeLabel;
    repeatMode: RepeatModeLabel;
    playbackRate: number;
    duration: number;
    elapsedTime: number;
    supportedCommands: string[];
};

export type ClientSnapshot = {
    bundleIdentifier: string;
    displayName: string;
    isActive: boolean;
    playbackState: PlaybackStateLabel;
    title: string;
    artist: string;
    album: string;
    genre: string;
    mediaType: MediaTypeLabel;
    contentIdentifier: string;
    shuffleMode: ShuffleModeLabel;
    repeatMode: RepeatModeLabel;
    playbackRate: number;
    duration: number;
    elapsedTime: number;
    players: PlayerSnapshot[];
};

export type NowPlayingSnapshot = {
    title: string;
    artist: string;
    album: string;
    genre: string;
    duration: number;
    elapsedTime: number;
    playbackState: PlaybackStateLabel;
    artworkUrl: string | null;
    app: string | null;
    bundleIdentifier: string | null;
    mediaType: MediaTypeLabel;
    repeatMode: RepeatModeLabel;
    shuffleMode: ShuffleModeLabel;
    repeatSupported: boolean;
    shuffleSupported: boolean;
};

export type VolumeSnapshot = {
    level: number;
    available: boolean;
    muted: boolean;
};

export type StateSnapshot = {
    connected: boolean;
    device: DeviceInfo | null;
    airplay: {
        connected: boolean;
    };
    companionLink: {
        connected: boolean;
    } | null;
    power: {
        state: AttentionState;
    } | null;
    nowPlaying: NowPlayingSnapshot;
    volume: VolumeSnapshot;
    participants: ParticipantSnapshot[];
    clients: ClientSnapshot[];
};

export function emptyState(): StateSnapshot {
    return {
        connected: false,
        device: null,
        airplay: {connected: false},
        companionLink: null,
        power: null,
        nowPlaying: {
            title: '',
            artist: '',
            album: '',
            genre: '',
            duration: 0,
            elapsedTime: 0,
            playbackState: 'Unknown',
            artworkUrl: null,
            app: null,
            bundleIdentifier: null,
            mediaType: 'Unknown',
            repeatMode: 'Off',
            shuffleMode: 'Off',
            repeatSupported: false,
            shuffleSupported: false
        },
        volume: {level: 0, available: false, muted: false},
        participants: [],
        clients: []
    };
}

// ---------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------

export type PairingPhase =
    | 'idle'
    | 'starting'
    | 'awaiting-pin'
    | 'verifying'
    | 'success'
    | 'error';

export type PairingStartPayload = {
    deviceId: string;
    protocol: DeviceProtocol;
    deviceName: string;
};

export type PairingResult = {
    success: boolean;
    error?: string;
};

export type PairingUnpairedPayload = {
    deviceId: string;
    protocol: DeviceProtocol;
};

// ---------------------------------------------------------------------
// Apps / users
// ---------------------------------------------------------------------

export type AppInfo = {
    bundleId: string;
    name: string;
};

export type UserInfo = {
    accountId: string;
    name: string;
};

// ---------------------------------------------------------------------
// Media / multi-room
// ---------------------------------------------------------------------

export type MediaPlaybackKind = 'url' | 'file' | 'stream' | 'sine' | 'multi-room';

export type MultiRoomTargetStatus = 'preparing' | 'ok' | 'failed' | 'removed';

export type MultiRoomTarget = {
    deviceId: string;
    deviceName: string;
    status: MultiRoomTargetStatus;
    error?: string;
};

export type PickedFile = {
    path: string;
    name: string;
    size: number;
};

// ---------------------------------------------------------------------
// mDNS
// ---------------------------------------------------------------------

export type MdnsResult = {
    name: string;
    type: string;
    address: string;
    port: number;
    properties: Record<string, string>;
};

// ---------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------

export type TimingStrategy = 'PTP' | 'NTP' | 'None';
export type TimingFlowMode = 'auto' | 'ptp' | 'ntp' | 'none';
export type PtpMasterState = 'idle' | 'master' | 'stopped';

export type NtpServerSnapshot = {
    running: boolean;
    port: number | null;
};

export type PtpMasterSnapshot = {
    running: boolean;
    peerAddress: string | null;
    clockIdentity: string | null;
    eventPort: number | null;
    generalPort: number | null;
    state: PtpMasterState | null;
    syncsSent: number;
    announcesSent: number;
    delayReqsReceived: number;
    delayRespsSent: number;
    announcesReceived: number;
};

export type TimingInspectEntry = {
    id: string;
    name: string;
    model: string;
    sourceVersion: string;
    address: string;
    port: number;
    features: string;
    strategy: TimingStrategy;
    supportsPTP: boolean;
    supportsBufferedAudio: boolean;
    error?: string;
};

export type TimingFlowReport = {
    deviceId: string;
    deviceName: string;
    mode: TimingFlowMode;
    receiverFeatures: string;
    supportsPTP: boolean;
    selectedStrategy: TimingStrategy;
    predictedNegotiation: TimingStrategy;
    timingServerPort: number | null;
    ptpEventPort: number | null;
    ptpGeneralPort: number | null;
    ptpClockIdentity: string | null;
    ptpStats: {
        state: PtpMasterState | null;
        syncsSent: number;
        announcesSent: number;
        delayReqsReceived: number;
        delayRespsSent: number;
        announcesReceived: number;
    } | null;
};

// ---------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------

export type LogLevel = 'log' | 'error' | 'warn' | 'info' | 'debug';
export type LogGroup = 'debug' | 'error' | 'info' | 'net' | 'raw' | 'warn';

export type LogEntry = {
    time: string;
    category: string;
    message: string;
    level: LogLevel;
};
