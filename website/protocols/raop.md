# RAOP

```ts
import { RaopClient } from '@corewire/airplay/raop';
```

RAOP is the older AirPlay audio protocol, over RTSP and RTP. Use it for receivers that do not speak AirPlay 2, such as an AirPort Express. For an Apple TV or HomePod, [AirPlay audio streams](/protocols/airplay-media) are the better choice.

## Streaming

```ts
import { TimingServer } from '@corewire/airplay';
import { discover, RaopClient } from '@corewire/airplay/raop';
import { File } from '@corewire/audio-source';

const timing = new TimingServer();
await timing.listen();

const [receiver] = await discover();

const client = await RaopClient.create({
    address: receiver.address,
    port: receiver.service.port,
    id: receiver.id,
    txt: receiver.txt
}, timing);

client.on('stopped', () => console.log('stopped'));

await client.stream(await File.fromPath('song.mp3'), {
    volume: 40,
    metadata: {title: 'Song', artist: 'Artist', album: 'Album', duration: 215}
});

await client.close();
timing.close();
```

`RaopClient.create(target, timingServer)` connects over RTSP, reads the receiver's properties from its TXT record and negotiates the transport. `RaopClient.discover(deviceId, timingServer)` finds the receiver by id first.

| Member | Meaning |
| --- | --- |
| `stream(source, options?)` | Streams until the source runs out. `volume` is a percentage (0 to 100); `metadata` shows title, artist, album, duration and artwork on the receiver |
| `stop()` | Ends the running `stream()` after it flushed |
| `setVolume(volume)` | The volume in dBFS |
| `close()` | Closes every connection |
| `address`, `deviceId`, `modelName`, `info`, `context` | About the receiver |

`pctToDbfs(percentage)` converts a percentage to dBFS.

The RAOP target needs the `port` of the `_raop._tcp` service. The encryption, metadata and audio properties come from its `txt`.

## Building blocks

The entry point also exports the parts `RaopClient` is made of: `RtspClient` (RAOP's RTSP client), `StreamClient`, `ControlClient`, `Statistics`, `PacketFifo`, `AudioPacketHeader`, `SyncPacket`, `decodeRetransmitRequest()`, and `getEncryptionTypes()`, `getMetadataTypes()` and `getAudioProperties()` to read a TXT record. See the [reference](/reference/airplay-raop).
