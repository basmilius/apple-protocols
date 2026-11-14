# @corewire/airplay/raop

```ts
import { RaopClient } from '@corewire/airplay/raop';
```

See [RAOP](/protocols/raop).

## RaopClient

`class RaopClient extends EventEmitter<{stopped: []}>`

| Member | Description |
| --- | --- |
| `static create(target: RaopTarget, timingServer: TimingServer): Promise<RaopClient>` | Connects over RTSP and negotiates the transport |
| `static discover(deviceId: string, timingServer: TimingServer): Promise<RaopClient>` | Finds the receiver by id, then `create()` |
| `context: Context` | |
| `deviceId: string` | The target id, or its address |
| `address: string` | |
| `modelName: string` | From the TXT record; empty when unknown |
| `info: Record<string, unknown>` | Fetched during setup |
| `stream(source: AudioSource, options?: StreamOptions): Promise<void>` | Streams until the source runs out |
| `stop(): void` | Ends the running `stream()` after it flushed |
| `setVolume(volume: number): Promise<void>` | dBFS |
| `close(): Promise<void>` | Closes every connection |
| event `stopped` | |

## Building blocks

| Export | Description |
| --- | --- |
| `RtspClient` | RAOP's RTSP client: `info()`, `authSetup()`, `announce()`, `setup()`, `record()`, `flush()`, `setParameter()`, `setMetadata()`, `setArtwork()`, `feedback()`, `teardown()` |
| `StreamClient` | Sends audio over RTP: `initialize()`, `sendAudio()`, `setVolume()`, `stop()`, `close()` |
| `ControlClient` | The UDP control channel for sync and retransmits: `bind()`, `start()`, `stop()`, `close()`, `port` |
| `Statistics` | Frame pacing: `tick()`, `newInterval()`, `expectedFrameCount`, `framesBehind`, `intervalCompleted` |
| `PacketFifo` | A bounded backlog of sent packets by sequence number |
| `AudioPacketHeader.encode(header, payloadType, seqno, timestamp, ssrc): Buffer` | An RTP audio header |
| `SyncPacket.encode(header, payloadType, seqno, rtpTimestamp, ntpSec, ntpFrac, rtpTimestampNow): Buffer` | A sync packet |
| `decodeRetransmitRequest(data: Buffer): RetransmitRequest` | |
| `getEncryptionTypes(properties: Map<string, string>): EncryptionType` | From the TXT record |
| `getMetadataTypes(properties: Map<string, string>): MetadataType` | From the TXT record |
| `getAudioProperties(properties: Map<string, string>): [number, number, number]` | Sample rate, channels and bytes per channel |
| `pctToDbfs(volume: number): number` | A percentage to dBFS |
| `discover(options?: DiscoverOptions): Promise<DiscoveryResult[]>` | The RAOP receivers on the network |
| `RAOP_SERVICE` | `'_raop._tcp.local'` |
| `enum EncryptionType` | `Unknown`, `Unencrypted`, `MFiSAP` |
| `enum MetadataType` | `NotSupported`, `Text`, `Artwork`, `Progress` |

## Types

| Type | Definition |
| --- | --- |
| `RaopTarget` | `{address: string; port: number; id?: string; txt?: Readonly<Record<string, string>>}` |
| `StreamOptions` | `{metadata?: MediaMetadata; volume?: number}`; volume is 0 to 100 |
| `MediaMetadata` | `{title: string; artist: string; album: string; duration: number; artwork?: Buffer}` |
| `EventMap` | `{stopped: []}` |
| `PlaybackInfo` | `{position: number}` |
| `RaopListener` | `{playing(playbackInfo: PlaybackInfo): void; stopped(): void}` |
| `RetransmitRequest` | `{lostSeqno: number; lostPackets: number}` |
| `Settings`, `StreamContext`, `StreamProtocol` | The internals `StreamClient` works with |
