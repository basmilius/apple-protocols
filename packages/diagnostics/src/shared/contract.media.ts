import type { CallResult, ProtocolName } from './contract';

// --- Pairing ---

export type PairRequest = {
    readonly deviceId: string;
    readonly protocol: ProtocolName;
};

export type PairStage = 'idle' | 'started' | 'awaitingPin' | 'verifying' | 'done' | 'failed';

export type PairStatus = {
    readonly deviceId: string;
    readonly protocol: ProtocolName;
    readonly stage: PairStage;
    readonly error: string | null;
    /** The service id the credentials are stored under, once pairing reached that point. */
    readonly serviceId: string | null;
    readonly updatedAt: number;
};

// --- Audio sources ---

/**
 * One entry per `@basmilius/apple-audio-source` class. The renderer cannot construct them, so it
 * describes which one it wants and main builds it.
 */
export type AudioSourceSpec =
    | { readonly kind: 'url'; readonly url: string }
    | { readonly kind: 'file'; readonly path: string }
    | { readonly kind: 'wav'; readonly from: 'url' | 'file'; readonly url?: string; readonly path?: string }
    | { readonly kind: 'mp3'; readonly from: 'url' | 'file'; readonly url?: string; readonly path?: string }
    | { readonly kind: 'ogg'; readonly from: 'url' | 'file'; readonly url?: string; readonly path?: string }
    | { readonly kind: 'pcm'; readonly path: string; readonly sampleRate?: number }
    | { readonly kind: 'sineWave'; readonly frequency: number; readonly duration: number }
    | { readonly kind: 'ffmpeg'; readonly path: string; readonly duration: number }
    | { readonly kind: 'live'; readonly frequency: number; readonly duration: number; readonly bufferDuration?: number };

export type AudioSourceKind = AudioSourceSpec['kind'];

export const AUDIO_SOURCE_KINDS: readonly AudioSourceKind[] = ['url', 'file', 'wav', 'mp3', 'ogg', 'pcm', 'sineWave', 'ffmpeg', 'live'];

// --- Audio: play URL ---

export type PlayUrlRequest = {
    readonly deviceId: string;
    readonly url: string;
    /** Start position in seconds. */
    readonly position?: number;
};

// --- Audio: stream ---

export type StreamRequest = {
    readonly deviceId: string;
    readonly source: AudioSourceSpec;
    /** -144 mutes, 0 is the loudest the receiver accepts. */
    readonly volumeDb?: number;
    /**
     * Runs the stream over a low-level protocol with a PTP grandmaster instead of the shared NTP
     * timing server. Known to produce silent playback on PTP-capable receivers.
     */
    readonly ptpExperiment?: boolean;
};

/** What `AudioStream.stats` reports, plus the PTP counters when the experiment is on. */
export type AudioTelemetry = {
    readonly packetsSent: number;
    readonly retransmitRequests: number;
    readonly retransmitsFulfilled: number;
    readonly retransmitsFailed: number;
    readonly packetLossRate: number;
    readonly totalBytesSent: number;
    readonly ptp: PtpTelemetry | null;
};

export type PtpTelemetry = {
    readonly state: string;
    readonly eventPort: number;
    readonly generalPort: number;
    readonly clockIdentity: string;
    readonly syncsSent: number;
    readonly announcesSent: number;
    readonly announcesReceived: number;
    readonly delayReqsReceived: number;
    readonly delayRespsSent: number;
};

export type AudioMode = 'idle' | 'url' | 'stream';

export type AudioStatus = {
    readonly deviceId: string;
    readonly mode: AudioMode;
    readonly playing: boolean;
    /** A one-line description of what was handed to the device. */
    readonly source: string | null;
    readonly volumeDb: number | null;
    readonly ptpExperiment: boolean;
    readonly startedAt: number | null;
    readonly error: string | null;
    readonly telemetry: AudioTelemetry | null;
};

// --- RAOP ---

export type RaopServiceInfo = {
    readonly id: string;
    readonly fqdn: string;
    readonly address: string;
    readonly port: number;
    readonly modelName: string;
};

export type RaopMetadata = {
    readonly title?: string;
    readonly artist?: string;
    readonly album?: string;
    readonly duration?: number;
};

export type RaopConnectRequest = {
    readonly deviceId: string;
    /** A service from `raop:services`. Left out to pick the one on the device address. */
    readonly serviceId?: string;
};

export type RaopStreamRequest = {
    readonly deviceId: string;
    readonly source: AudioSourceSpec;
    readonly metadata?: RaopMetadata;
    /** 0 to 100. */
    readonly volume?: number;
};

export type RaopStatus = {
    readonly deviceId: string;
    readonly connected: boolean;
    readonly streaming: boolean;
    readonly serviceId: string | null;
    readonly address: string | null;
    readonly modelName: string | null;
    readonly info: Record<string, unknown> | null;
    readonly source: string | null;
    readonly lastEvent: string | null;
    readonly error: string | null;
    readonly updatedAt: number;
};

// --- Raw protocol ---

export type RawTransport = 'dataStream' | 'companionLink' | 'controlStream';

export type RawParamType = 'string' | 'number' | 'boolean' | 'enum' | 'json' | 'stringList';

export type RawParamOption = {
    readonly label: string;
    readonly value: number | string;
};

export type RawParam = {
    readonly name: string;
    readonly label: string;
    readonly type: RawParamType;
    readonly options?: readonly RawParamOption[];
    readonly defaultValue?: unknown;
    readonly optional?: boolean;
    readonly hint?: string;
};

export type RawBuilderInfo = {
    readonly id: string;
    readonly title: string;
    readonly transport: RawTransport;
    /** Groups the picker, for example `Playback` or `Volume`. */
    readonly category: string;
    readonly description: string;
    /** Whether this one has a reply worth waiting for. */
    readonly supportsExchange: boolean;
    readonly params: readonly RawParam[];
};

export type RawMessageRequest = {
    readonly deviceId: string;
    readonly transport: RawTransport;
    readonly id: string;
    readonly args: Readonly<Record<string, unknown>>;
    /** Wait for a reply instead of firing and forgetting. */
    readonly exchange?: boolean;
};

// --- Connection recovery ---

export type RecoveryOptionsInfo = {
    readonly baseDelay: number;
    readonly maxDelay: number;
    readonly maxAttempts: number;
};

export type RecoveryStatus = {
    readonly deviceId: string;
    readonly enabled: boolean;
    readonly options: RecoveryOptionsInfo;
    readonly recovering: boolean;
    readonly attempt: number;
    readonly lastEvent: string | null;
    readonly error: string | null;
    readonly updatedAt: number;
};

export type RecoveryConfigureRequest = {
    readonly deviceId: string;
    readonly enabled: boolean;
    readonly options?: Partial<RecoveryOptionsInfo>;
};

export type MediaInvokeMap = {
    'pair:start': [PairRequest, PairStatus];
    'pair:pin': [{ readonly deviceId: string; readonly pin: string }, PairStatus];
    'pair:cancel': [{ readonly deviceId: string }, void];
    'pair:status': [{ readonly deviceId: string }, PairStatus | null];
    'pair:forget': [PairRequest, void];

    'audio:playUrl': [PlayUrlRequest, void];
    'audio:stopUrl': [{ readonly deviceId: string }, void];
    'audio:waitForEnd': [{ readonly deviceId: string }, void];
    'audio:stream': [StreamRequest, void];
    'audio:stopStream': [{ readonly deviceId: string }, void];
    'audio:status': [{ readonly deviceId: string }, AudioStatus | null];
    'audio:pickFile': [{ readonly kind: AudioSourceKind }, string | null];

    'raop:services': [{ readonly rescan?: boolean }, readonly RaopServiceInfo[]];
    'raop:connect': [RaopConnectRequest, RaopStatus];
    'raop:stream': [RaopStreamRequest, void];
    'raop:setVolume': [{ readonly deviceId: string; readonly volume: number }, void];
    'raop:stop': [{ readonly deviceId: string }, void];
    'raop:close': [{ readonly deviceId: string }, void];
    'raop:status': [{ readonly deviceId: string }, RaopStatus | null];

    'raw:builders': [void, readonly RawBuilderInfo[]];
    'raw:send': [RawMessageRequest, CallResult];

    'recovery:status': [{ readonly deviceId: string }, RecoveryStatus];
    'recovery:configure': [RecoveryConfigureRequest, RecoveryStatus];
    'recovery:simulateDrop': [{ readonly deviceId: string }, void];
    'recovery:wake': [{ readonly deviceId: string }, void];
};

export type MediaEventMap = {
    'pair:status': PairStatus;
    'audio:status': AudioStatus;
    'raop:status': RaopStatus;
    'recovery:status': RecoveryStatus;
};

export const MEDIA_INVOKE_CHANNELS: readonly (keyof MediaInvokeMap)[] = [
    'pair:start',
    'pair:pin',
    'pair:cancel',
    'pair:status',
    'pair:forget',
    'audio:playUrl',
    'audio:stopUrl',
    'audio:waitForEnd',
    'audio:stream',
    'audio:stopStream',
    'audio:status',
    'audio:pickFile',
    'raop:services',
    'raop:connect',
    'raop:stream',
    'raop:setVolume',
    'raop:stop',
    'raop:close',
    'raop:status',
    'raw:builders',
    'raw:send',
    'recovery:status',
    'recovery:configure',
    'recovery:simulateDrop',
    'recovery:wake'
];

export const MEDIA_EVENT_CHANNELS: readonly (keyof MediaEventMap)[] = ['pair:status', 'audio:status', 'raop:status', 'recovery:status'];
