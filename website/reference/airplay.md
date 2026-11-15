# @corewire/airplay

```ts
import { AirPlaySession, connect, pair } from '@corewire/airplay';
```

See [Sessions and channels](/protocols/airplay) and [URLs and audio streams](/protocols/airplay-media).

## Sessions

| Export | Description |
| --- | --- |
| `connect(target: AirPlayTarget, options?: ConnectOptions): Promise<AirPlaySession>` | TCP, `GET /info`, pair-verify or a transient pairing, then encryption. Throws `PairingError`, `ConnectionClosedError` |
| `pair(target: AirPlayTarget, options?: PairOptions): Promise<PinPairing>` | Starts a PIN pairing; the receiver shows its PIN once this resolves |

### AirPlaySession

`class AirPlaySession extends EventEmitter<{closed: [reason: SessionCloseReason, error?: Error]}>`

| Member | Description |
| --- | --- |
| `closeReason: SessionCloseReason \| undefined` | Why the session ended; undefined while open |
| `context: Context` | |
| `control` | The encrypted RTSP control channel; see [ControlChannel](#controlchannel) |
| `features: bigint` | The feature mask from `/info` |
| `info: Record<string, any>` | The `/info` plist |
| `isOpen: boolean` | |
| `pairingId: Buffer` | Our pairing identifier |
| `remoteControl: RemoteControlChannels \| undefined` | The data and event channels once remote control is open |
| `sessionUUID: string` | Identifies the session in SETUP bodies |
| `signal: AbortSignal` | Aborts with a `ConnectionClosedError` when the session ends |
| `supportsUrlPlayback: boolean` | Whether the receiver plays a URL itself |
| `target: AirPlayTarget` | |
| `hasFeature(feature: bigint): boolean` | |
| `close(): Promise<void>` | Ends the session and every connection on it, without TEARDOWN |
| `openRemoteControl(options?: RemoteControlOptions): Promise<RemoteControlChannels>` | SETUP, event channel, RECORD, data channel and keepalive. Throws `SetupError`, `ConnectionClosedError` |
| `playUrl(url: string, options?: PlayUrlOptions): Promise<UrlPlayback>` | URL playback on a connection of its own. Throws `PlaybackError`, `SetupError` |
| `streamAudio(source: AudioSource, options?: StreamAudioOptions): Promise<AudioPlayback>` | An audio stream on a connection of its own. Throws `SetupError` |
| event `closed` | Fires once, with the reason and an optional error |

The constructor takes the parts of a finished handshake; use `connect()`.

### PinPairing

| Member | Description |
| --- | --- |
| `signal: AbortSignal` | Aborts when the pairing connection closes |
| `pin(code: string): Promise<AccessoryCredentials>` | Runs pair-setup M1 to M6. A wrong PIN rejects with `PairingError` and leaves the connection open |
| `close(): void` | Closes the pairing connection |

## Channels

### ControlChannel

`class ControlChannel extends RtspClient`, the type of `AirPlaySession.control`. The entry point does not export the class; you reach it through a session.

| Member | Description |
| --- | --- |
| `activeRemoteId: string`, `dacpId: string`, `sessionId: string` | The session headers |
| `isEncrypted: boolean` | |
| `pendingTeardown: Promise<void> \| undefined` | Settles once the TEARDOWN in flight is answered, times out or loses its connection |
| `enableEncryption(readKey: Buffer, writeKey: Buffer): void` | Switches to encrypted frames |
| `command(streamId: number, payload: Record<string, unknown> \| ArrayBuffer, sessionUUID: string): Promise<Response>` | A play queue command as `POST /command` |
| `feedback(stats?: Record<string, unknown>): Promise<Response>` | The keepalive |
| `flush(uri: string, headers: Record<string, string>): Promise<Response>` | |
| `flushBuffered(uri: string, headers?: Record<string, string>): Promise<Response>` | |
| `get(path, headers?, timeout?)`, `post(path, body?, headers?, timeout?)`, `put(path, body?, headers?, timeout?)`, `record(path, headers?, timeout?)`, `setup(path, body?, headers?, timeout?)`: `Promise<Response>` | Plain requests |
| `getProperty(property: string): Promise<Response>` | Reads a receiver property such as `Volume` or `ClusterUUID` |
| `setProperty(property: string, body?): Promise<Response>` | Writes a receiver property |
| `scrub(position: number): Promise<Response>` | Seeks URL playback |
| `setAudioMode(mode: string): Promise<Response>` | Such as `default`, `moviePlayback` or `spoken` |
| `setParameter(parameter: string, value: string): Promise<Response>` | `SET_PARAMETER` with a `text/parameters` body |
| `setVolume(volume: number): Promise<Response>` | |
| `stop(): Promise<Response>` | Stops URL playback |
| `teardown(path: string, headers?, timeout?): Promise<Response \| undefined>` | Ends the session on the receiver; undefined when the receiver closed the connection first |

Requests resolve with any status; the caller checks it.

### DataChannel

`class DataChannel extends EncryptedChannel<DataChannelEventMap>`

| Member | Description |
| --- | --- |
| `constructor(context: Context, address: string, port: number, sharedSecret: Buffer, seed: bigint)` | |
| `exchange(message: ProtocolMessage \| [ProtocolMessage, DescExtension], timeout?: number): Promise<ProtocolMessage>` | Resolves with the reply with the same identifier. Throws `TimeoutError`, `ConnectionClosedError` |
| `send(message: ProtocolMessage \| [ProtocolMessage, DescExtension]): void` | Sends without waiting. Throws `ConnectionClosedError` |
| events | `rawMessage` for every message, then one event per MRP message name with the decoded extension |

### EventChannel

`class EventChannel extends EncryptedChannel<EventChannelEventMap>`

| Member | Description |
| --- | --- |
| `constructor(context: Context, address: string, port: number, sharedSecret: Buffer)` | |
| `respond(status: number, statusText: string, headers?, body?: Buffer): void` | Answers a request of the receiver |
| event `command: [data: Record<string, unknown>]` | Any `POST /command` |
| event `playQueue: [event: PlayQueueCommand]` | A decoded play queue command |
| event `duckAudio`, `unduckAudio: [data: Record<string, unknown>]` | |
| event `sessionDied: []` | The receiver ended the session |


## Playback

`UrlPlayback` and `AudioPlayback` share one shape for waiting until playback is done: `ended: Promise<void>`. RAOP and `@corewire/devices` use the same shape.

### UrlPlayback

| Member | Description |
| --- | --- |
| `signal: AbortSignal` | Aborts when the playback's connection closes |
| `static start(channels, url: string, position: number): Promise<UrlPlayback>` | Used by `AirPlaySession.playUrl()`; the constructor is private |
| `ended: Promise<void>` | Resolves when playback ends, then closes the connection; rejects with `PlaybackError` when the receiver reports an error. Lazy: the first read starts watching the play queue, or polling `/playback-info` on a receiver without one |
| `getPlaybackInfo(): Promise<PlaybackInfo \| null>` | Empty when nothing plays, null when the receiver did not answer |
| `stop(): void` | Stops playback and closes the connection, without TEARDOWN |

### AudioPlayback

Created by `AirPlaySession.streamAudio()`; the constructor takes internal parts.

| Member | Description |
| --- | --- |
| `ended: Promise<void>` | Resolves when the source ran out and TEARDOWN went out; rejects when the stream failed or was stopped halfway |
| `signal: AbortSignal` | |
| `stats: AudioStreamStats` | |
| `stop(): void` | Stops the source and closes the connection, without TEARDOWN |

## Timing

### TimingServer

| Member | Description |
| --- | --- |
| `constructor(options?: {logger?: Logger})` | Errors of the socket go to `logger` |
| `port: number` | The UDP port; 0 until bound |
| `listen(): Promise<void>` | Binds a random port |
| `close(): void` | |
| `onMessage(data: Buffer, info: RemoteInfo): void`, `onError(err: Error): void` | Socket handlers |

### PtpMaster

Experimental IEEE 1588 grandmaster for receivers with PTP support.

| Member | Description |
| --- | --- |
| `constructor(peerAddress: string)` | |
| `start(): Promise<{eventPort: number; generalPort: number}>` | Binds 319 and 320, or ephemeral ports without permission |
| `stop(): void` | |
| `state: 'idle' \| 'master' \| 'stopped'` | |
| `eventPort`, `generalPort`, `clockIdentity`, `syncsSent`, `announcesSent`, `delayReqsReceived`, `delayRespsSent`, `announcesReceived` | Ports and counters |
| `onEventPacket()`, `onGeneralPacket()`, `onEventError()`, `onGeneralError()` | Socket handlers |

## Discovery and features

| Export | Description |
| --- | --- |
| `AIRPLAY_SERVICE` | `'_airplay._tcp.local'` |
| `discover(options?: DiscoverOptions): Promise<AirPlayDiscoveryResult[]>` | The AirPlay receivers on the network; `DiscoverOptions` comes from `@corewire/core/discovery` |
| `toTarget(result: DiscoveryResult): AirPlayTarget` | The connect target for a result |
| `withFeatures(result: DiscoveryResult): AirPlayDiscoveryResult` | Adds the parsed feature mask |
| `parseFeatures(features: string): bigint` | Reads a `features` TXT value: one hex value or `low,high` |
| `AirPlayFeatureFlags: Record<string, bigint>` | Feature flags by name |
| `hasFeatureFlag(features: bigint, flag: bigint): boolean` | |
| `describeFlags(features: bigint): AirPlayFeatureFlagName[]` | The names of the flags that are set |
| `getProtocolVersion(txt: Record<string, string>): 1 \| 2` | |
| `getPairingRequirement(txt: Record<string, string>): PairingRequirement` | `'none' \| 'pin' \| 'transient' \| 'homekit'` |
| `isPasswordRequired(txt: Record<string, string>): boolean` | |
| `isRemoteControlSupported(txt: Record<string, string>): boolean` | |
| `generateActiveRemoteId(): string`, `generateDacpId(): string`, `generateSessionId(): string` | Random identifiers for RTSP headers |
| `AUDIO_SAMPLE_RATE` (44100), `AUDIO_CHANNELS` (2), `AUDIO_BYTES_PER_CHANNEL` (2) | The audio format |

## Types

| Type | Definition |
| --- | --- |
| `AirPlayTarget` | `{address: string; port?: number; id?: string; txt?: Readonly<Record<string, string>>; features?: bigint}` |
| `ConnectOptions` | `{credentials?: AccessoryCredentials; context?: Context; identity?: DeviceIdentity; timing?: TimingServer; signal?: AbortSignal}` |
| `PairOptions` | `Pick<ConnectOptions, 'context' \| 'identity' \| 'signal'>` |
| `SessionCloseReason` | `'local' \| 'remote' \| 'timeout' \| 'error'` |
| `RemoteControlChannels` | `{data: DataChannel; events: EventChannel}` |
| `RemoteControlOptions` | `{subscribe?(data: DataChannel): void}` |
| `PlayUrlOptions` | `{position?: number; signal?: AbortSignal}` |
| `StreamAudioOptions` | `{volumeDb?: number; ptpMaster?: PtpMaster; signal?: AbortSignal}` |
| `PlaybackInfo` | `{duration?; position?; rate?; readyToPlay?; error?: {code; domain}; state?: PlayQueueState}` |
| `PlayQueueCommand` | `Record<string, unknown>` |
| `PlayQueueState` | `'loading' \| 'playing' \| 'paused' \| 'stopped'` |
| `AudioSource` | `{duration: number; readFrames(count: number): Promise<Buffer \| null>; reset(); start(); stop()}`; 44100 Hz stereo signed 16-bit big-endian PCM |
| `AudioStreamStats` | `{packetsSent; retransmitRequests; retransmitsFulfilled; retransmitsFailed; packetLossRate; totalBytesSent}` |
| `DataChannelEventMap` | `rawMessage` plus one entry per `MrpMessageName` |
| `EventChannelEventMap` | `command`, `playQueue`, `duckAudio`, `unduckAudio`, `sessionDied` |
| `AirPlayDiscoveryResult` | `DiscoveryResult & {features?: bigint}` |
| `AirPlayFeatureFlagName` | `string` |
| `PairingRequirement` | `'none' \| 'pin' \| 'transient' \| 'homekit'` |

## Client identity

`identity` in `ConnectOptions` and `PairOptions` overrides what the client presents. A field you leave out keeps its default: name `CoreWire` (`DEFAULT_CLIENT_NAME` of `@corewire/core/transport`), model `iPhone17,3`, OS `iPhone OS` 26.3 (`25D63`), source version `935.7.1`, bundle `com.apple.TVRemote` version `700`. The name goes into the SETUP body, the URL playback body, the MRP device info and the pair-setup M5 message.
