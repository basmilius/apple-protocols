# Apple TV and HomePod

```ts
import { AppleTV, HomePod } from '@corewire/devices';
```

Both classes extend `AppleDevice`, which holds the connection, the status and the capabilities they share. You never construct an `AppleDevice` yourself.

| | `AppleTV` | `HomePod` |
| --- | --- | --- |
| Protocols | AirPlay and Companion Link | AirPlay |
| Pairing | PIN, once; the credentials are yours to store | None (transient) |
| Shared capabilities | `remote`, `nowPlaying`, `playback`, `volume`, `artwork`, `multiroom`, `media` | the same |
| Own capabilities | `apps`, `accounts`, `power`, `system`, `text`, `touch` | none |
| `playUrl` | Yes | No; stream the audio instead |
| Retry schedule | quick, slow, then rare | quick, then rare |

`HomePod` covers the HomePod, the HomePod mini and the second generation HomePod. `model` tells them apart.

## The target

A `DeviceTarget` says where the device is. Only the address is required.

```ts
import type { DeviceTarget } from '@corewire/devices';

const target: DeviceTarget = {
    address: '192.168.1.20',
    port: 7000,
    id: 'Living-Room.local'
};
```

| Field | Meaning |
| --- | --- |
| `address` | The IP address |
| `port` | The AirPlay port; 7000 when omitted |
| `txt` | The AirPlay TXT record, when known. It supplies the model and the MAC (`deviceid`) that recovery matches on |
| `id` | The mDNS host id. It tags the logs; the address when omitted |

A `DiscoveredDevice` has a ready `target`.

## Options

Both constructors take `DeviceOptions`. `AppleTV` takes `AppleTVOptions`, which adds `credentials` and `activeUserAccount`.

```ts
import { AppleTV, Credentials } from '@corewire/devices';

const tv = new AppleTV({address: '192.168.1.20'}, {
    credentials: Credentials.parse(await load()),
    log: entry => console.log(`[${entry.device}] ${entry.level}: ${entry.message}`),
    logLevels: ['error', 'warn', 'info'],
    identity: {name: 'Kitchen hub'}
});
```

| Option | Meaning |
| --- | --- |
| `credentials` | Apple TV only. From a PIN pairing. Without them AirPlay pairs transiently and Companion Link stays off, so the device stays `degraded` |
| `activeUserAccount` | Apple TV only. An iCloud alternate DSID that Companion Link announces as the active user at startup |
| `log(entry)` | Receives the log entries of this device at `logLevels` |
| `logLevels` | Default `['error', 'warn']`. Any of `debug`, `error`, `info`, `net`, `raw`, `warn` |
| `timing` | The NTP `TimingServer` announced in every SETUP. Omitted: one server shared by all devices, started at the first connect. `false`: no timing |
| `resolve(last)` | Looks the device up before a retry when the unicast query at the last address found nothing. With this option the device never scans with multicast |
| `identity` | Overrides of the name, model, OS and version this client presents to the device |

## Properties

| Property | Meaning |
| --- | --- |
| `address` | The current address; it changes when recovery finds the device elsewhere |
| `id` | The `id` of the target, or its address |
| `name` | From the TXT record or `/info`; the id until known |
| `model`, `modelName` | The `DeviceModel` and the raw identifier, such as `AudioAccessory5,1`; empty until known |
| `status` | The current `Status`, see [Connection and recovery](/guide/connection) |
| `sessions` | The protocol sessions in use now: `airplay`, `mediaRemote`, `companionLink`. Each is undefined while its protocol is down |

`sessions` is there for diagnostics and experiments. It hands you the objects from the [protocol packages](/protocols/). Anything you do on them bypasses the device layer, and the sessions change with every reconnect.

## Methods

| Method | Meaning |
| --- | --- |
| `connect()` | Keeps the device connected until `disconnect()`. Resolves the first time it is connected or degraded |
| `disconnect()` | Stops every retry and closes every session. Idempotent |
| `supports(capability)` | Whether a capability works right now |
| `AppleTV.pair(target, options?)` | Starts a PIN pairing. Static |

## Events

A device emits one event, `status`, with the new `Status`. Each capability with state is an `EventEmitter` of its own: `nowPlaying`, `volume`, `power` and `text`.
