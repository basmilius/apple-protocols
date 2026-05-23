import type {
    AppInfo,
    DeviceInfo,
    DeviceProtocol,
    LogEntry,
    LogGroup,
    MdnsResult,
    MediaPlaybackKind,
    MultiRoomTarget,
    MultiRoomTargetStatus,
    NtpServerSnapshot,
    PairingResult,
    PairingStartPayload,
    PairingUnpairedPayload,
    PickedFile,
    PtpMasterSnapshot,
    RepeatModeLabel,
    ShuffleModeLabel,
    StateSnapshot,
    TimingFlowMode,
    TimingFlowReport,
    TimingInspectEntry,
    UserInfo
} from './snapshots';

// ---------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------

export type NavigationButton =
    | 'up'
    | 'down'
    | 'left'
    | 'right'
    | 'select'
    | 'menu'
    | 'home'
    | 'topMenu'
    | 'back'
    | 'channelUp'
    | 'channelDown';

export type RemoteTransport = 'airplay' | 'companionLink';

export type GesturePayload =
    | {type: 'swipe'; direction: 'up' | 'down' | 'left' | 'right'; duration?: number; transport?: RemoteTransport}
    | {type: 'tap'; x: number; y: number; finger?: number; transport?: RemoteTransport};

export type HidKind = 'press' | 'long' | 'double';

export type PlaybackAction =
    | 'play'
    | 'pause'
    | 'playPause'
    | 'stop'
    | 'next'
    | 'previous'
    | 'advanceShuffle'
    | 'advanceRepeat';

export type SystemAction =
    | 'captions'
    | 'dark'
    | 'light'
    | 'siri-start'
    | 'siri-stop'
    | 'find-remote-on'
    | 'find-remote-off';

export type ShuffleModeInput = 'off' | 'albums' | 'songs';
export type RepeatModeInput = 'off' | 'one' | 'all';

// ---------------------------------------------------------------------
// Request map
// ---------------------------------------------------------------------

export type IpcRequestMap = {
    // Discovery + connection + state
    'device:discover': {req: void; res: DeviceInfo[]};
    'device:rescan': {req: void; res: DeviceInfo[]};
    'device:list-paired': {req: void; res: DeviceInfo[]};
    'device:connect': {req: {deviceId: string}; res: StateSnapshot};
    'device:connect-ip': {req: {address: string; port?: number}; res: StateSnapshot};
    'device:disconnect': {req: void; res: null};
    'state:snapshot': {req: void; res: StateSnapshot};

    // Pairing
    'pairing:start': {req: {deviceId: string; protocol: DeviceProtocol}; res: null};
    'pairing:submit-pin': {req: {pin: string}; res: null};
    'pairing:cancel': {req: void; res: null};
    'pairing:unpair': {req: {deviceId: string; protocol: DeviceProtocol}; res: null};
    'pairing:verify': {req: {deviceId: string; protocol?: DeviceProtocol}; res: {protocol: DeviceProtocol; ok: true}};

    // Playback
    'playback:command': {req: {action: PlaybackAction}; res: null};
    'playback:seek': {req: {position: number}; res: null};
    'playback:skip': {req: {direction: 'forward' | 'backward'; seconds?: number}; res: null};
    'playback:set-shuffle': {req: {mode: ShuffleModeInput}; res: null};
    'playback:set-repeat': {req: {mode: RepeatModeInput}; res: null};
    'playback:request-queue': {req: {length?: number}; res: null};

    // Volume
    'volume:set': {req: {level: number}; res: null};
    'volume:adjust': {req: {direction: 'up' | 'down'}; res: null};
    'volume:mute': {req: {muted: boolean}; res: null};
    'volume:toggle-mute': {req: void; res: null};

    // Remote (Apple TV)
    'remote:navigate': {req: {button: NavigationButton}; res: null};
    'remote:power': {req: {action: 'on' | 'off' | 'toggle'}; res: null};
    'remote:gesture': {req: GesturePayload; res: null};
    'remote:text': {req: {action: 'set' | 'append' | 'clear'; text?: string}; res: null};
    'remote:hid': {req: {usagePage: number; usage: number; kind: HidKind; duration?: number}; res: null};
    'remote:apps:list': {req: void; res: AppInfo[]};
    'remote:apps:launch': {req: {bundleId: string}; res: null};
    'remote:users:list': {req: void; res: UserInfo[]};
    'remote:users:switch': {req: {accountId: string}; res: null};
    'remote:system': {req: {action: SystemAction}; res: null};

    // Media
    'media:play-url': {req: {url: string; position?: number}; res: null};
    'media:stop-url': {req: void; res: null};
    'media:pick-file': {req: {filters?: {name: string; extensions: string[]}[]}; res: PickedFile | null};
    'media:stream-file': {req: {path: string}; res: null};
    'media:stream-url': {req: {url: string}; res: null};
    'media:stop-stream': {req: void; res: null};
    'media:stream-sine': {req: {frequency: number; durationSec?: number; amplitude?: number}; res: null};
    'media:stop-sine': {req: void; res: null};

    // Multi-room
    'multi-room:prepare': {req: {deviceIds: string[]}; res: MultiRoomTarget[]};
    'multi-room:stream-url': {req: {url: string}; res: null};
    'multi-room:stream-file': {req: {path: string}; res: null};
    'multi-room:stop': {req: void; res: null};
    'multi-room:add': {req: {deviceId: string}; res: MultiRoomTarget};
    'multi-room:remove': {req: {deviceId: string}; res: null};
    'multi-room:targets': {req: void; res: MultiRoomTarget[]};

    // mDNS
    'mdns:multicast': {req: {services?: string[]; timeout?: number}; res: MdnsResult[]};
    'mdns:unicast': {req: {address: string; services?: string[]; timeout?: number}; res: MdnsResult[]};

    // Timing
    'timing:ntp:state': {req: void; res: NtpServerSnapshot};
    'timing:ntp:start': {req: void; res: NtpServerSnapshot};
    'timing:ntp:stop': {req: void; res: NtpServerSnapshot};
    'timing:ptp:state': {req: void; res: PtpMasterSnapshot};
    'timing:ptp:start': {req: {address: string}; res: PtpMasterSnapshot};
    'timing:ptp:stop': {req: void; res: PtpMasterSnapshot};
    'timing:inspect': {req: void; res: TimingInspectEntry[]};
    'timing:flow': {req: {deviceId: string; mode: TimingFlowMode}; res: TimingFlowReport};

    // Logs
    'logs:snapshot': {req: void; res: LogEntry[]};
    'logs:clear': {req: void; res: null};
    'logs:set-groups': {req: {groups: LogGroup[]}; res: null};
};

export type IpcRequestChannel = keyof IpcRequestMap;
export type IpcRequest<K extends IpcRequestChannel> = IpcRequestMap[K]['req'];
export type IpcResponse<K extends IpcRequestChannel> = IpcRequestMap[K]['res'];

// ---------------------------------------------------------------------
// Event map
// ---------------------------------------------------------------------

export type IpcEventMap = {
    'device:connected': DeviceInfo;
    'device:disconnected': {unexpected: boolean};
    'device:state': StateSnapshot;
    'device:recovering': {attempt: number};
    'device:recovery-failed': null;

    'pairing:started': PairingStartPayload;
    'pairing:pin-requested': null;
    'pairing:ended': PairingResult;
    'pairing:unpaired': PairingUnpairedPayload;

    'media:playback-ended': {kind: MediaPlaybackKind};
    'media:multi-room-target-changed': {deviceId: string; status: MultiRoomTargetStatus; error?: string};

    'timing:ntp:state': NtpServerSnapshot;
    'timing:ptp:state': PtpMasterSnapshot;

    'log:entry': LogEntry;
};

export type IpcEventChannel = keyof IpcEventMap;
export type IpcEvent<K extends IpcEventChannel> = IpcEventMap[K];

// ---------------------------------------------------------------------
// Bridge contract
// ---------------------------------------------------------------------

export type IpcApi = {
    invoke<K extends IpcRequestChannel>(channel: K, payload: IpcRequest<K>): Promise<IpcResponse<K>>;
    on<K extends IpcEventChannel>(channel: K, listener: (data: IpcEvent<K>) => void): () => void;
};

// ---------------------------------------------------------------------
// Channel arrays (preload validation)
// ---------------------------------------------------------------------

export const IPC_REQUEST_CHANNELS: IpcRequestChannel[] = [
    'device:discover',
    'device:rescan',
    'device:list-paired',
    'device:connect',
    'device:connect-ip',
    'device:disconnect',
    'state:snapshot',
    'pairing:start',
    'pairing:submit-pin',
    'pairing:cancel',
    'pairing:unpair',
    'pairing:verify',
    'playback:command',
    'playback:seek',
    'playback:skip',
    'playback:set-shuffle',
    'playback:set-repeat',
    'playback:request-queue',
    'volume:set',
    'volume:adjust',
    'volume:mute',
    'volume:toggle-mute',
    'remote:navigate',
    'remote:power',
    'remote:gesture',
    'remote:text',
    'remote:hid',
    'remote:apps:list',
    'remote:apps:launch',
    'remote:users:list',
    'remote:users:switch',
    'remote:system',
    'media:play-url',
    'media:stop-url',
    'media:pick-file',
    'media:stream-file',
    'media:stream-url',
    'media:stop-stream',
    'media:stream-sine',
    'media:stop-sine',
    'multi-room:prepare',
    'multi-room:stream-url',
    'multi-room:stream-file',
    'multi-room:stop',
    'multi-room:add',
    'multi-room:remove',
    'multi-room:targets',
    'mdns:multicast',
    'mdns:unicast',
    'timing:ntp:state',
    'timing:ntp:start',
    'timing:ntp:stop',
    'timing:ptp:state',
    'timing:ptp:start',
    'timing:ptp:stop',
    'timing:inspect',
    'timing:flow',
    'logs:snapshot',
    'logs:clear',
    'logs:set-groups'
];

export const IPC_EVENT_CHANNELS: IpcEventChannel[] = [
    'device:connected',
    'device:disconnected',
    'device:state',
    'device:recovering',
    'device:recovery-failed',
    'pairing:started',
    'pairing:pin-requested',
    'pairing:ended',
    'pairing:unpaired',
    'media:playback-ended',
    'media:multi-room-target-changed',
    'timing:ntp:state',
    'timing:ptp:state',
    'log:entry'
];
