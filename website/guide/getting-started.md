# Getting started

This page connects to an Apple TV, reads what plays and presses a few keys. A HomePod works the same way, minus the pairing.

## Find the device

`discover()` runs one multicast scan of about four seconds and returns every Apple TV, HomePod and AirPlay receiver it heard, one entry per host.

```ts
import { discover } from '@corewire/devices';

const found = await discover();

for (const device of found) {
    console.log(device.name, device.modelName, device.address);
}
```

You don't need discovery to connect. A device built from only an address finds its services itself. See [Discovering devices](/guide/discovery).

## Pair once

A HomePod needs no pairing. An Apple TV shows a four digit PIN, and the credentials it returns are yours to store.

```ts
import { AppleTV } from '@corewire/devices';

const pairing = await AppleTV.pair({address: '192.168.1.20'});

// The Apple TV shows the PIN now.
const credentials = await pairing.pin(await askForPin());

await save(credentials.toString());
```

`Credentials.parse()` reads that string back. See [Credentials and pairing](/guide/pairing).

## Connect

```ts
import { AppleTV, Credentials } from '@corewire/devices';

const tv = new AppleTV({address: '192.168.1.20'}, {
    credentials: Credentials.parse(await load()),
    log: entry => console.log(entry.level, entry.message)
});

tv.on('status', status => {
    console.log(status.state, status.reason);
});

await tv.connect();
```

`connect()` resolves once the device is usable. From then on the device keeps itself connected until you call `disconnect()`. A dropped connection reconnects on its own, and the `status` event tells you what happens. See [Connection and recovery](/guide/connection).

## Use it

Every capability is a property of the device. They exist from the moment you construct it; a call that cannot work right now throws an `UnavailableError`.

```ts
tv.nowPlaying.on('change', item => {
    console.log(item?.app.name, item?.title, item?.state);
});

await tv.remote.press('select');
await tv.remote.press('home', {mode: 'double'});
await tv.playback.setRepeat('all');
await tv.volume.set(0.3);

if (tv.supports('apps')) {
    await tv.apps.launch('com.apple.TVMusic');
}
```

## Disconnect

```ts
await tv.disconnect();
```

`disconnect()` stops every retry, ends running media and closes every protocol session. No capability event fires after it resolved. You can call `connect()` again later.

## A HomePod

```ts
import { HomePod } from '@corewire/devices';

const pod = new HomePod({address: '192.168.1.30'});
await pod.connect();

console.log(pod.nowPlaying.current?.title, pod.volume.level);

await pod.playback.pause();
await pod.disconnect();
```

A HomePod connects over AirPlay with a transient pairing. It has remote keys, now playing, playback, volume, artwork, multiroom and audio streaming. It cannot fetch a URL itself; stream the audio instead (see [URLs and audio streams](/guide/media)).

## Next

- [Apple TV and HomePod](/guide/devices) describes the two classes and their options.
- [Capabilities](/guide/capabilities) lists what each device exposes and how `supports()` works.
