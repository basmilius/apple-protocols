import { MEDIA_EVENT_CHANNELS, MEDIA_INVOKE_CHANNELS, type MediaEventMap, type MediaInvokeMap } from './contract.media';
import { TOOLS_EVENT_CHANNELS, TOOLS_INVOKE_CHANNELS, type ToolsEventMap, type ToolsInvokeMap } from './contract.tools';

/**
 * The whole surface between the Electron main process and the renderer. Main registers a handler
 * per {@link InvokeMap} channel, the preload bridge forwards it, and the renderer client is typed
 * from the same map, so a new channel is one entry here plus one handler in main.
 */

export type ProtocolName = 'airplay' | 'companionLink';

export type DeviceType = 'appletv' | 'homepod' | 'homepod-mini' | 'unknown';

export type DebugGroup = 'debug' | 'error' | 'info' | 'net' | 'raw' | 'warn';

/** Binary payload after serialization: lowercase hex, no separators. */
export type Bytes = {
    readonly $bytes: string;
    readonly length: number;
};

export type SerializedError = {
    readonly name: string;
    readonly message: string;
    readonly stack: string | null;
};

// --- Discovery ---

export type ServiceInfo = {
    readonly id: string;
    readonly fqdn: string;
    readonly address: string;
    readonly port: number;
    readonly type: string;
    readonly txt: Readonly<Record<string, string>>;
};

export type DiscoveredDeviceInfo = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    readonly modelName: string;
    readonly deviceType: DeviceType;
    readonly services: {
        readonly airplay: ServiceInfo | null;
        readonly companionLink: ServiceInfo | null;
    };
    /** The protocols credentials are stored for. */
    readonly paired: readonly ProtocolName[];
    /** Whether main currently holds a session for this device. */
    readonly session: DeviceSessionStatus;
};

export type DeviceSessionStatus = 'disconnected' | 'connecting' | 'connected' | 'recovering' | 'failed';

// --- State snapshot ---

export type ConnectionSnapshot = {
    readonly status: DeviceSessionStatus;
    readonly connected: boolean;
    readonly airplay: {
        readonly available: boolean;
        readonly connected: boolean;
    };
    readonly companionLink: {
        readonly available: boolean;
        readonly connected: boolean;
    };
    /** The reason the last connect attempt failed, or null. */
    readonly error: string | null;
};

export type DeviceInfoSnapshot = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    readonly modelName: string;
    readonly deviceType: DeviceType;
    readonly receiverInfo: Record<string, unknown> | null;
    readonly capabilities: Record<string, unknown> | null;
};

export type NowPlayingSnapshot = {
    readonly title: string;
    readonly artist: string;
    readonly album: string;
    readonly genre: string;
    readonly duration: number;
    readonly elapsedTime: number;
    readonly playbackRate: number;
    readonly playbackState: string;
    readonly mediaType: string;
    /** A data URL, or an http(s) URL the device handed out. Null when there is no artwork. */
    readonly artworkUrl: string | null;
    readonly appName: string | null;
    readonly bundleIdentifier: string | null;
};

export type VolumeSnapshot = {
    /** 0 to 100. */
    readonly level: number;
    readonly available: boolean;
    readonly muted: boolean;
};

export type ClusterSnapshot = {
    readonly clusterId: string | null;
    readonly isLeader: boolean;
    readonly isClusterAware: boolean;
};

export type OutputDeviceSnapshot = {
    readonly uid: string;
    readonly name: string;
    readonly modelId: string;
    readonly isLocal: boolean;
    readonly isGroupLeader: boolean;
    readonly volume: number;
};

export type ParticipantSnapshot = {
    readonly identifier: string;
    readonly displayName: string;
    readonly type: string;
};

export type PlayerSnapshot = {
    readonly identifier: string;
    readonly displayName: string;
    readonly isActive: boolean;
    readonly isDefaultPlayer: boolean;
    readonly playbackState: string;
    readonly title: string;
    readonly artist: string;
    readonly album: string;
    readonly genre: string;
    readonly seriesName: string;
    readonly seasonNumber: number;
    readonly episodeNumber: number;
    readonly mediaType: string;
    readonly contentIdentifier: string;
    readonly shuffleMode: string;
    readonly repeatMode: string;
    readonly playbackRate: number;
    readonly duration: number;
    readonly elapsedTime: number;
    readonly supportedCommands: readonly string[];
};

export type ClientSnapshot = {
    readonly bundleIdentifier: string;
    readonly displayName: string;
    readonly isActive: boolean;
    readonly playbackState: string;
    readonly title: string;
    readonly artist: string;
    readonly album: string;
    readonly genre: string;
    readonly mediaType: string;
    readonly contentIdentifier: string;
    readonly shuffleMode: string;
    readonly repeatMode: string;
    readonly playbackRate: number;
    readonly duration: number;
    readonly elapsedTime: number;
    readonly players: readonly PlayerSnapshot[];
};

export type KeyboardSnapshot = {
    readonly active: boolean;
    readonly text: string | null;
    readonly placeholder: string | null;
};

export type StateSnapshot = {
    readonly deviceId: string;
    readonly connection: ConnectionSnapshot;
    readonly device: DeviceInfoSnapshot | null;
    readonly nowPlaying: NowPlayingSnapshot;
    readonly volume: VolumeSnapshot;
    readonly keyboard: KeyboardSnapshot;
    readonly cluster: ClusterSnapshot;
    readonly outputDevices: readonly OutputDeviceSnapshot[];
    readonly participants: readonly ParticipantSnapshot[];
    readonly clients: readonly ClientSnapshot[];
    /** The commands the active player reports, by name. */
    readonly supportedCommands: readonly string[];
    readonly updatedAt: number;
};

// --- Forwarded events ---

export type DeviceEventSource = 'device' | 'state' | 'airplayState' | 'dataStream' | 'eventStream' | 'companionLink';

export type DeviceEvent = {
    readonly deviceId: string;
    readonly source: DeviceEventSource;
    readonly name: string;
    /** The listener arguments, serialized. */
    readonly payload: readonly unknown[];
    readonly timestamp: number;
    /** Monotonic within one main process run; the renderer keys rows on it. */
    readonly sequence: number;
};

// --- Logging ---

export type LogEntry = {
    readonly id: number;
    readonly group: DebugGroup;
    readonly deviceId: string | null;
    /** The arguments rendered to one line, which is what the console would have printed. */
    readonly message: string;
    /** The non-string arguments, serialized, so the console can show them as a tree. */
    readonly args: readonly unknown[];
    readonly timestamp: number;
};

// --- Generic call channel ---

/** The objects `device:call` may resolve a path against. */
export type CallRoot = 'device' | 'airplay' | 'airplayState' | 'companionLink' | 'airplayProtocol' | 'companionLinkProtocol';

export type CallRequest = {
    readonly deviceId: string;
    readonly root: CallRoot;
    /** A dotted path, for example `playback.seekTo` or `state.volume`. */
    readonly path: string;
    /** Left out for a getter read. */
    readonly args?: readonly unknown[];
};

export type CallSuccess<T = unknown> = {
    readonly ok: true;
    /** Whether the path ended in a function that was invoked, or in a value that was read. */
    readonly kind: 'call' | 'value';
    readonly value: T;
    readonly durationMs: number;
};

export type CallFailure = {
    readonly ok: false;
    readonly error: SerializedError;
};

export type CallResult<T = unknown> = CallSuccess<T> | CallFailure;

/**
 * `strictNullChecks` is off across this repo, and without it a `true`/`false` discriminant does not
 * narrow a union. Both sides of a call result are read through these instead.
 */
export function isCallFailure<T>(result: CallResult<T>): result is CallFailure {
    return !result.ok;
}

export function isCallSuccess<T>(result: CallResult<T>): result is CallSuccess<T> {
    return result.ok;
}

// --- Channels ---

export type AppInfo = {
    readonly platform: string;
    readonly versions: {
        readonly electron: string;
        readonly chrome: string;
        readonly node: string;
    };
    readonly storagePath: string;
};

export type ThemeRequest = {
    readonly resolved: 'light' | 'dark';
    readonly followsSystem: boolean;
    readonly background: string;
};

/**
 * Channel name to `[request, response]`. `void` on either side means the channel takes or returns
 * nothing. Every device-scoped request carries `deviceId`.
 */
export type CoreInvokeMap = {
    'app:info': [void, AppInfo];
    'app:theme': [ThemeRequest, void];

    'discovery:scan': [{ readonly rescan?: boolean }, readonly DiscoveredDeviceInfo[]];
    'discovery:list': [void, readonly DiscoveredDeviceInfo[]];

    'device:connect': [{ readonly deviceId: string }, StateSnapshot];
    'device:disconnect': [{ readonly deviceId: string }, void];
    'device:snapshot': [{ readonly deviceId: string }, StateSnapshot | null];
    'device:call': [CallRequest, CallResult];

    'log:history': [void, readonly LogEntry[]];
    'log:clear': [void, void];
};

/** Domain maps live in their own files so each can grow without touching this one. */
export type InvokeMap = CoreInvokeMap & MediaInvokeMap & ToolsInvokeMap;

export type CoreEventMap = {
    'device:event': DeviceEvent;
    'device:snapshot': StateSnapshot;
    'discovery:changed': readonly DiscoveredDeviceInfo[];
    'log:entry': LogEntry;
};

/** Channel name to the payload main pushes at the renderer. */
export type EventMap = CoreEventMap & MediaEventMap & ToolsEventMap;

export type InvokeChannel = keyof InvokeMap;
export type EventChannel = keyof EventMap;

export type InvokeRequest<C extends InvokeChannel> = InvokeMap[C][0];
export type InvokeResponse<C extends InvokeChannel> = InvokeMap[C][1];

/** What `contextBridge` exposes as `window.diagnostics`. */
export type DiagnosticsBridge = {
    invoke<C extends InvokeChannel>(channel: C, request: InvokeRequest<C>): Promise<InvokeResponse<C>>;
    /** Returns the unsubscribe function. */
    on<C extends EventChannel>(channel: C, listener: (payload: EventMap[C]) => void): () => void;
};

export const INVOKE_CHANNELS: readonly InvokeChannel[] = [
    'app:info',
    'app:theme',
    'discovery:scan',
    'discovery:list',
    'device:connect',
    'device:disconnect',
    'device:snapshot',
    'device:call',
    'log:history',
    'log:clear',
    ...MEDIA_INVOKE_CHANNELS,
    ...TOOLS_INVOKE_CHANNELS
];

export const EVENT_CHANNELS: readonly EventChannel[] = ['device:event', 'device:snapshot', 'discovery:changed', 'log:entry', ...MEDIA_EVENT_CHANNELS, ...TOOLS_EVENT_CHANNELS];

export const DEBUG_GROUPS: readonly DebugGroup[] = ['debug', 'error', 'info', 'net', 'raw', 'warn'];

export const DEVICE_EVENT_SOURCES: readonly DeviceEventSource[] = ['device', 'state', 'airplayState', 'dataStream', 'eventStream', 'companionLink'];

export * from './contract.media';
export * from './contract.tools';
