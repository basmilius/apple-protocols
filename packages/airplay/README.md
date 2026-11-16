# @apple-protocols/airplay

AirPlay 2 for Node.js: a session with pairing and encryption, remote control over MRP (`/mrp`), URL playback, audio streaming, and the timing servers. RAOP (AirPlay 1 audio) lives on `/raop` and the RTSP codec on `/rtsp`.

Part of [Apple Protocols](https://apple-protocols.dev). To control a device without handling sessions yourself, use `@apple-protocols/devices`.

## Install

```sh
npm install @apple-protocols/airplay@next
```

Requires Node.js 18.17 or later (20.3 or later on the 20 line).

## Example

```ts
import { connect, discover, toTarget } from '@apple-protocols/airplay';
import { MediaRemote } from '@apple-protocols/airplay/mrp';

const [receiver] = await discover();
const session = await connect(toTarget(receiver));
const remote = await MediaRemote.open(session);

await remote.hid.select();
session.on('closed', reason => console.log('closed', reason));
await session.close();
```

## License

MIT
