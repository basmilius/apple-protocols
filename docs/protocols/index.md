# Protocols

The device layer covers what most apps need. Use a protocol package for a message the device layer does not send, for a tool that inspects traffic, or to decide yourself when a connection opens and closes.

## The layers

```
@apple-protocols/devices          AppleTV, HomePod: connection upkeep, capabilities
├── @apple-protocols/airplay      AirPlay 2 sessions, URL playback, audio streams, timing
│   ├── /mrp               Media Remote on the AirPlay data channel
│   ├── /raop              RAOP audio streaming
│   └── /rtsp              The RTSP client the others build on
├── @apple-protocols/companion-link
└── @apple-protocols/core         pairing, encryption, transport, mDNS, codecs, errors, logging
```

`@apple-protocols/audio-source` sits beside them. It depends on `core` and produces the `AudioSource` that AirPlay and RAOP stream.

## Sessions live once

A device object reconnects. A protocol session does not. `connect()` returns a session that is ready to use. TCP is open, and pairing and encryption are done. The session then ends exactly once, with a reason:

| Reason | Meaning |
| --- | --- |
| `local` | This side closed it, or gave up on a setup step |
| `remote` | The device closed it |
| `timeout` | The keepalive went unanswered (AirPlay), or the socket did not open in time |
| `error` | A socket or frame broke |

When it ends, its `closed` event fires with the reason and an optional error, its `signal` aborts, and every channel, timer and pending request on it goes too. To continue, connect again. The device layer does that, with backoff and a fresh lookup.

```ts
import { connect } from '@apple-protocols/airplay';

const session = await connect({address: '192.168.1.30'});

session.on('closed', (reason, error) => {
    console.log('session ended', reason, error?.message);
});

session.signal.addEventListener('abort', () => console.log('aborted'));
```

`closeReason` is undefined while the session is open, and the reason afterwards. `isOpen` gives the same as a boolean.

## Models without I/O

`MediaRemoteState` (MRP) and `CompanionLinkState` (Companion Link) are models. They derive what plays, the volume, the keyboard and the power state from messages, and do no I/O themselves. You can pass one to `connect()` or `MediaRemote.open()` to keep it, and its listeners, across sessions. You can also feed it recorded traffic and get the same events as on a live session.

## Pages

- [Sessions and channels](/protocols/airplay): connecting, pairing and the AirPlay channels.
- [Media Remote (MRP)](/protocols/mrp): keys, commands, volume, keyboard and state over AirPlay.
- [URLs and audio streams](/protocols/airplay-media): `playUrl`, `streamAudio`, multiroom audio and timing.
- [RAOP](/protocols/raop) and [RTSP](/protocols/rtsp).
- [Companion Link](/protocols/companion-link).
- [Pairing](/protocols/pairing), [Discovery](/protocols/discovery), [Encoding and crypto](/protocols/encoding), [Transport and logging](/protocols/transport) in `@apple-protocols/core`.
