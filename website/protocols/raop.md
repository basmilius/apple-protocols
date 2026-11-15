# RAOP

```ts
import { connect, discover, toTarget } from '@corewire/airplay/raop';
```

RAOP is the older AirPlay audio protocol, over RTSP and RTP. Use it for receivers that do not speak AirPlay 2, such as an AirPort Express. For an Apple TV or HomePod, [AirPlay audio streams](/protocols/airplay-media) are the better choice.

## Streaming

```ts
import { TimingServer } from '@corewire/airplay';
import { connect, discover, pctToDbfs, toTarget } from '@corewire/airplay/raop';
import { FileSource } from '@corewire/audio-source';

const timing = new TimingServer();
await timing.listen();

const [receiver] = await discover();
const session = await connect(toTarget(receiver), {timing});

session.on('closed', reason => console.log('closed', reason));

const playback = await session.stream(await FileSource.fromPath('song.mp3'), {
    volumeDb: pctToDbfs(40),
    metadata: {title: 'Song', artist: 'Artist', album: 'Album', duration: 215}
});

await playback.ended;

await session.close();
timing.close();
```

`connect(target, options)` follows the session pattern of the other protocols. It opens the RTSP connection and the control channel, reads `GET /info`, runs `/auth-setup` for an AirPort and sends ANNOUNCE and SETUP. The session it returns is ready. It ends once, with the `closed` event and its `signal`, when you call `close()` or when the RTSP connection drops.

| Member | Meaning |
| --- | --- |
| `stream(source, options?)` | Resolves once audio flows and returns a `RaopPlayback`. `volumeDb` is in dBFS. `metadata` shows title, artist, album, duration and artwork on the receiver. One stream runs at a time |
| `playback.ended` | Settles when the source ran out |
| `playback.stop()` | Stops the stream |
| `setVolumeDb(volumeDb)` | The volume in dBFS, -144 to 0 |
| `close()` | Stops the stream and closes every connection |
| `target`, `info`, `context`, `volumeDb` | About the receiver and the session |

`pctToDbfs(percentage)` converts a percentage to dBFS.

The RAOP target needs the `port` of the `_raop._tcp` service. `toTarget()` takes it from a discovery result. The encryption, metadata and audio properties come from its `txt`.

## Options

`connect()` requires a `TimingServer` in `timing`, whose port goes into SETUP. The other options are optional:

| Option | Meaning |
| --- | --- |
| `context` | A `Context` for the logger and the client identity |
| `metadata` | Title, artist and album to show while a stream has no metadata of its own. Defaults to `Streaming with CoreWire`, `CoreWire` and `AirPlay` |
| `password` | Answers a digest challenge on ANNOUNCE for a receiver with a password |
| `signal` | Aborts the handshake |

## Reading a TXT record

`getEncryptionTypes()`, `getMetadataTypes()` and `getAudioProperties()` read the properties of a receiver from its TXT record. See the [reference](/reference/airplay-raop).
