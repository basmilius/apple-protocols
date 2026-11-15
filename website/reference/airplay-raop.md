# @corewire/airplay/raop

```ts
import { connect, discover, toTarget } from '@corewire/airplay/raop';
```

See [RAOP](/protocols/raop).

## Connecting

| Export | Description |
| --- | --- |
| `connect(target: RaopTarget, options: RaopConnectOptions): Promise<RaopSession>` | Connects over RTSP and returns a ready session: the control channel, `GET /info`, `/auth-setup` for an AirPort, then ANNOUNCE and SETUP. Throws `ConnectionClosedError` when the signal aborts during the handshake |
| `discover(options?: DiscoverOptions): Promise<DiscoveryResult[]>` | The RAOP receivers on the network; `DiscoverOptions` comes from `@corewire/core/discovery` |
| `toTarget(result: DiscoveryResult): RaopTarget` | A target from a discovery result: address, port, id and TXT record |
| `RAOP_SERVICE` | `'_raop._tcp.local'` |

## RaopSession

`class RaopSession extends EventEmitter<RaopEventMap>`

One RAOP connection to a receiver. It ends exactly once, with a reason. Then its `signal` aborts and a running stream stops. Create it with `connect()`; the constructor takes internal parts.

| Member | Description |
| --- | --- |
| `target: RaopTarget` | What `connect()` got |
| `context: Context` | Its logger and identity |
| `info: Record<string, unknown>` | The `/info` plist of the receiver; empty when it did not answer |
| `isOpen: boolean` | |
| `closeReason: CloseReason \| undefined` | Why the session ended, or undefined while it is open |
| `signal: AbortSignal` | Aborts with a `ConnectionClosedError` when the session ends |
| `volumeDb: number` | The volume last sent, in dBFS |
| `stream(source: AudioSource, options?: RaopStreamOptions): Promise<RaopPlayback>` | Sends metadata, RECORD, FLUSH and the volume, then the audio over RTP. Resolves once audio flows. One stream at a time: a second one throws `PlaybackError` |
| `setVolumeDb(volumeDb: number): Promise<void>` | dBFS, -144 (silent) to 0 |
| `close(): Promise<void>` | Stops a running stream and closes the connection |
| event `closed: [reason: CloseReason, error?: Error]` | The session ended; also when the RTSP connection drops |
| event `playing: [info: RaopPlaybackInfo]` | |
| event `stopped` | A stream stopped |

## RaopPlayback

| Member | Description |
| --- | --- |
| `ended: Promise<void>` | Settles when the source ran out and TEARDOWN went out |
| `stop(): void` | Stops the stream |

## Helpers

| Export | Description |
| --- | --- |
| `pctToDbfs(volume: number): number` | A percentage (0 to 100) to dBFS |
| `getEncryptionTypes(properties: Map<string, string>): EncryptionType` | From the TXT record |
| `getMetadataTypes(properties: Map<string, string>): MetadataType` | From the TXT record |
| `getAudioProperties(properties: Map<string, string>): [number, number, number]` | Sample rate, channels and bytes per channel |
| `enum EncryptionType` | `Unknown`, `Unencrypted`, `MFiSAP` |
| `enum MetadataType` | `NotSupported`, `Text`, `Artwork`, `Progress` |

## Types

| Type | Definition |
| --- | --- |
| `RaopTarget` | `{address: string; port?: number; id?: string; txt?: Readonly<Record<string, string>>}`; port 7000 when omitted |
| `RaopConnectOptions` | `{timing: TimingServer; context?: Context; metadata?: Partial<{title; artist; album}>; password?: string; signal?: AbortSignal}`. The port of `timing` goes into SETUP. `metadata` shows while a stream has none of its own: title `Streaming with CoreWire`, artist `CoreWire`, album `AirPlay` when omitted. `password` answers a digest challenge on ANNOUNCE |
| `RaopStreamOptions` | `{metadata?: MediaMetadata; volumeDb?: number}` |
| `RaopPlayback` | `{ended: Promise<void>; stop(): void}` |
| `RaopEventMap` | `{closed: [reason: CloseReason, error?: Error]; playing: [info: RaopPlaybackInfo]; stopped: []}` |
| `RaopPlaybackInfo` | `{metadata: MediaMetadata; position: number}` |
| `MediaMetadata` | `{title: string; artist: string; album: string; duration: number; artwork?: Buffer}` |
