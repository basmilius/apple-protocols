# @corewire/devices

Control an Apple TV or a HomePod from Node.js. A device keeps itself connected over AirPlay and Companion Link, retries after a drop, and reports one `status` event. Remote keys, now playing, volume, playback, multiroom, apps, power, text input, URL playback and audio streaming are capabilities on the device. This package exports every error class.

Part of [CoreWire](https://corewire.dev).

## Install

```sh
npm install @corewire/devices@next
```

Requires Node.js 18.17 or later (20.3 or later on the 20 line).

## Example

```ts
import { AppleTV, Credentials, discover } from '@corewire/devices';

const [found] = await discover();
const tv = new AppleTV(found.target, {
    credentials: Credentials.parse(process.env.APPLE_TV_CREDENTIALS)
});

tv.on('status', status => console.log(status.state));
tv.nowPlaying.on('change', item => console.log(item?.title));

await tv.connect();
await tv.remote.press('select');
await tv.volume.set(0.3);
await tv.disconnect();
```

Pair an Apple TV once with `AppleTV.pair(target)` to get the credentials. A HomePod connects without them.

## License

MIT
