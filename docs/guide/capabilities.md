# Capabilities

Every capability is a property of the device, and every property exists from the moment you construct it. You never check for `undefined`. Whether a capability works depends on which protocol is up right now.

## Which protocol serves what

| Capability | Property | Protocol | Device |
| --- | --- | --- | --- |
| `remote` | `remote` | AirPlay, Companion Link for holds and double presses | both |
| `nowPlaying` | `nowPlaying` | AirPlay | both |
| `playback` | `playback` | AirPlay | both |
| `volume` | `volume` | AirPlay | both |
| `artwork` | `artwork` | AirPlay | both |
| `multiroom` | `multiroom` | AirPlay | both |
| `streamAudio` | `media.streamAudio()` | AirPlay | both |
| `playUrl` | `media.playUrl()` | AirPlay, when the device plays URLs | Apple TV |
| `text` | `text` | Companion Link, else AirPlay | Apple TV |
| `power` | `power` | Companion Link for the state, AirPlay to wake and sleep | Apple TV |
| `apps` | `apps` | Companion Link | Apple TV |
| `accounts` | `accounts` | Companion Link | Apple TV |
| `system` | `system` | Companion Link | Apple TV |
| `touch` | `touch` | Companion Link | Apple TV |

`HomePodCapability` types the capability names of a `HomePod`, and `AppleTVCapability` those of an `AppleTV`. Passing `'apps'` to `pod.supports()` is a type error.

## supports()

`supports(capability)` answers whether the capability works now:

- `playUrl` needs an AirPlay session on a device that plays URLs itself;
- `text` needs Companion Link or AirPlay;
- `apps`, `accounts`, `system` and `touch` need Companion Link;
- everything else needs AirPlay.

```ts
if (tv.supports('apps')) {
    const apps = await tv.apps.list();
    console.log(apps.map(app => app.name));
}
```

The answer changes with the connection. Check it right before you act, or catch the error.

## UnavailableError

A call that cannot work throws an `UnavailableError`. It carries the `capability` and a `reason`:

| Reason | Meaning |
| --- | --- |
| `disconnected` | The protocol the capability needs is down. It may work again after the next reconnect |
| `unsupported` | The device cannot do this at all, such as `playUrl` on a HomePod |

```ts
import { UnavailableError } from '@corewire/devices';

try {
    await tv.apps.launch('com.apple.TVMusic');
} catch (error) {
    if (error instanceof UnavailableError && error.reason === 'disconnected') {
        console.log(`${error.capability} comes back after the reconnect`);
    } else {
        throw error;
    }
}
```

Reading state never throws. `nowPlaying.current`, `volume.level`, `power.state`, `text.state` and `multiroom.outputs` return the last known values while a protocol is down. Fetching is different. `artwork.get()` and `artwork.getAnimated()` ask the device, so they throw `UnavailableError` without a session, like every method.

## Commands the app accepts

`nowPlaying.supports(command)` is a different question. It asks whether the app that plays now accepts a command, such as `seek` or `shuffle`. See [Playback](/guide/playback#what-the-app-accepts).
