# Connection and recovery

A device keeps itself connected. You call `connect()` once and `disconnect()` when you are done; everything in between is the device's job, and the `status` event reports it.

## connect()

`connect()` starts the AirPlay link. On an Apple TV with credentials, Companion Link starts as soon as the first AirPlay attempt settled, so AirPlay always connects first.

The promise:

- resolves the first time the device is `connected` or `degraded`;
- on an Apple TV, waits for the first Companion Link attempt, so it resolves `connected` right away when Companion Link works;
- rejects when the first attempt and the quick retries all failed. The device keeps trying on the slow schedule after that;
- rejects when `disconnect()` comes first.

A call while connected resolves at once. A call while `offline` runs the next scheduled attempt now. Two calls at the same time share one promise.

```ts
try {
    await tv.connect();
} catch (error) {
    // Still trying in the background; tv.status says when.
    console.warn('not reachable yet', error);
}
```

## The status event

`status` fires on every change of any field of the `Status`, and never for an equal one.

```ts
tv.on('status', status => {
    console.log(status.state, status.reason, status.error?.message);
    console.log('airplay', status.airplay.state, status.airplay.attempt, status.airplay.nextAttemptAt);
    console.log('companion link', status.companionLink?.state);
});
```

| Field | Meaning |
| --- | --- |
| `state` | The `DeviceState`, see below |
| `reason` | Why it changed: `requested`, `established`, `remote`, `timeout`, `error`, `failed` or `scheduled` |
| `error` | The error behind the change; null for `requested` and `established` |
| `airplay` | The `ProtocolStatus` of AirPlay |
| `companionLink` | The `ProtocolStatus` of Companion Link; Apple TV only |

`tv.status` returns the current value without waiting for an event.

### Device states

| State | When |
| --- | --- |
| `disconnected` | Before `connect()` and after `disconnect()` |
| `connecting` | The first attempt runs. On an Apple TV this lasts until the first Companion Link attempt finished, so you see no `degraded` before `connected` |
| `connected` | Every protocol of the device works |
| `degraded` | Apple TV only: AirPlay works, Companion Link does not (yet) |
| `recovering` | AirPlay dropped or failed and retries in the quick phase |
| `offline` | AirPlay retries in the slow or rare phase |

AirPlay decides the state. Companion Link only splits `connected` from `degraded`. A HomePod never reports `degraded`.

### Reasons

| Reason | Meaning |
| --- | --- |
| `requested` | `connect()` or `disconnect()` |
| `established` | A protocol connected |
| `remote` | The device closed a session |
| `timeout` | The AirPlay keepalive went unanswered for 30 seconds |
| `error` | A socket or frame broke |
| `failed` | A connect attempt failed; see `error` |
| `scheduled` | A retry was scheduled or started |

### Protocol status

| Field | Meaning |
| --- | --- |
| `state` | `off`, `connecting`, `connected` or `waiting` |
| `attempt` | The number of the retry that is scheduled or running since the protocol was last connected; 0 for the first connect |
| `phase` | `quick`, `slow` or `rare`; null unless the protocol waits for or runs a retry |
| `nextAttemptAt` | Epoch milliseconds of the next attempt, or null |
| `error` | The last failure or close error; null once connected |

## Retries

Each protocol has its own link and its own schedule. A drop counts as attempt 0, so the first retry after a drop waits one second.

| Phase | AirPlay on Apple TV | AirPlay on HomePod | Companion Link |
| --- | --- | --- | --- |
| `quick` | after 1 s, 2 s, 4 s | after 1 s, 2 s, 4 s | after 1 s, 2 s, 4 s |
| `slow` | 15 attempts, every 2 minutes | none | 15 attempts, every 2 minutes |
| `rare` | every 15 minutes, forever | every 15 minutes, forever | every 15 minutes, forever |

Neither device ever gives up. The delays are not options.

A healthy session is never reconnected on a timer. The AirPlay keepalive ends a session whose device stopped answering for 30 seconds, and the device then recovers like after any other drop.

A Companion Link authentication failure keeps retrying on the schedule. The reason is in `status.companionLink.error`, so your app can ask the user to pair again without the device giving up on a refusal that may pass.

## Finding the device again

Before every attempt, except the very first AirPlay attempt with a known port, the device looks itself up:

1. It knocks on `WAKE_PORTS` to wake a sleeping device, then sends a unicast DNS-SD query to the last known address and waits up to 5 seconds.
2. When AirPlay did not answer there, it calls your `resolve(last)` option.
3. Without a `resolve` option, it runs a multicast scan and matches on the MAC (`deviceid` in the TXT record), then on the id.
4. When nothing answers, the attempt still connects to the last known address and port.

A hit updates `address`, the AirPlay port and the TXT record. A new DHCP lease therefore does not strand a device. The Companion Link port always comes from the latest unicast answer.

Supply `resolve` when your app already runs its own discovery, or when multicast does not reach the device:

```ts
import { AppleTV, type DeviceTarget } from '@corewire/devices';

const known = new Map<string, DeviceTarget>();

const tv = new AppleTV({address: '192.168.1.20', id: 'Living-Room.local'}, {
    resolve: async last => known.get(last.id) ?? null
});
```

## State across a reconnect

The capabilities keep their values across sessions. A reconnect that brings back the same item, playback state, artwork or volume emits nothing, so a network blip does not look like playback stopping and starting. [Now playing](/guide/now-playing#across-a-reconnect) describes the details.

`power.change` is the exception. It fires at every Companion Link connect, so you can resync after a real drop.

An explicit `disconnect()` is not a reconnect. It resets the announced now playing, volume and power, so `await disconnect(); await connect();` announces everything fresh, like a new device.

## disconnect()

`disconnect()` stops every retry, aborts an attempt in flight, ends running URL playback and audio streams and closes every session. It is idempotent. Once it resolved, no capability event fires anymore.
