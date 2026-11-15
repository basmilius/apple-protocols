# AirPlay sessions and channels

```ts
import { AirPlaySession, connect, discover, pair, toTarget } from '@corewire/airplay';
```

## Finding a receiver

`discover()` scans for `_airplay._tcp` and returns `AirPlayDiscoveryResult` entries: the core `DiscoveryResult` plus the parsed `features` mask. `toTarget()` turns one into an `AirPlayTarget`.

```ts
import { discover, toTarget } from '@corewire/airplay';

const receivers = await discover();
const target = toTarget(receivers[0]);

console.log(target.address, target.port, target.features?.toString(16));
```

An `AirPlayTarget` needs only an `address`. `port` defaults to 7000. `id` tags the logs; `txt` and `features` are what discovery found.

## Pairing

A HomePod accepts a transient pairing; `connect()` does it when you pass no credentials. An Apple TV wants a PIN pairing once:

```ts
import { pair } from '@corewire/airplay';

const pairing = await pair({address: '192.168.1.20'});

// The receiver shows its PIN now.
const credentials = await pairing.pin(await askForPin());
pairing.close();
```

`pair()` connects, fetches `/info` and asks the receiver to show its PIN. `PinPairing.pin()` runs pair-setup M1 to M6 and resolves the long-term `AccessoryCredentials`. A wrong PIN rejects with a `PairingError` and leaves the connection open; call `close()` when you give up. The same credentials work for Companion Link.

## Connecting

```ts
import { connect, type AirPlayTarget } from '@corewire/airplay';
import type { AccessoryCredentials } from '@corewire/core/pairing';

declare const target: AirPlayTarget;
declare const credentials: AccessoryCredentials;

const session = await connect(target, {credentials});

console.log(session.info.name, session.features.toString(16), session.supportsUrlPlayback);
```

`connect()` opens TCP, reads `GET /info`, runs pair-verify with the credentials (or a transient pairing without them) and turns on encryption of the control channel. It throws a `PairingError` when pairing fails, and a `ConnectionClosedError` when the `signal` aborts during the handshake.

| Option | Meaning |
| --- | --- |
| `credentials` | Long-term credentials for pair-verify. Without them the session pairs transiently |
| `context` | A `Context` with the logger and identity to use |
| `identity` | Overrides of the identity this client presents; ignored when you pass a context. The name defaults to `CoreWire` and goes into SETUP, URL playback, the MRP device info and the pair-setup M5 message |
| `timing` | A listening `TimingServer` to announce in every SETUP. Without one, SETUP announces no timing |
| `signal` | Ends the session, or interrupts the handshake, when aborted |

## The session

| Member | Meaning |
| --- | --- |
| `control` | The encrypted RTSP `ControlChannel` |
| `info` | The `/info` plist |
| `features` | The receiver's feature mask; `hasFeature(flag)` tests one |
| `supportsUrlPlayback` | Whether the receiver fetches and plays a URL itself |
| `remoteControl` | The data and event channels once remote control is open |
| `sessionUUID`, `pairingId`, `target`, `context` | Identifiers and settings of this session |
| `isOpen`, `closeReason`, `signal` | Its lifetime |
| `close()` | Ends the session and every connection that hangs off it, without TEARDOWN |

The session sends a `/feedback` keepalive every 2 seconds once remote control is open; the connections of URL playback and audio streams do the same. When no keepalive succeeded for 30 seconds, it ends with reason `timeout`. The deadline runs on a monotonic clock, so a jump of the wall clock (an NTP sync after boot) does not end a session.

## Remote control

`openRemoteControl()` runs the SETUP with the remote control features, opens the event channel, sends RECORD, then sets up and connects the MRP data channel. It resolves the two channels. Usually you call `MediaRemote.open()` instead, which does this and the MRP startup; see [Media Remote](/protocols/mrp).

```ts
import { connect } from '@corewire/airplay';

const session = await connect({address: '192.168.1.30'});

const {data, events} = await session.openRemoteControl({
    subscribe: channel => channel.on('deviceInfo', message => console.log('device info', message.name))
});

events.on('sessionDied', () => console.log('the receiver ended the session'));
```

`subscribe` runs after the data channel exists and before it connects, so a listener misses no message the receiver sends right away.

## Channels

| Channel | What it carries |
| --- | --- |
| `ControlChannel` | RTSP requests to the receiver: SETUP, RECORD, `/feedback`, properties, volume, `/play`, TEARDOWN. Extends `RtspClient`; you reach it as `session.control` |
| `EventChannel` | The reverse RTSP channel: the receiver sends requests and we answer `200 OK`. Emits `command`, `playQueue`, `duckAudio`, `unduckAudio` and `sessionDied` |
| `DataChannel` | MRP protobuf messages. `exchange()` waits for the reply, `send()` expects none. Emits `rawMessage` and one event per MRP message type |

The data and event channels are encrypted from their first byte with keys derived from the pair-verify secret. A frame that does not decrypt or parse ends the channel with reason `error`, and the session with it.

```ts
import { connect } from '@corewire/airplay';

const session = await connect({address: '192.168.1.30'});
const response = await session.control.getProperty('Volume');
console.log(response.status, Buffer.from(await response.arrayBuffer()));
```

`ControlChannel` requests resolve with any status; you check it.

## Feature flags

`parseFeatures()` reads the `features` TXT value. `AirPlayFeatureFlags` names the bits, `hasFeatureFlag()` tests one and `describeFlags()` lists the names that are set. `getPairingRequirement(txt)`, `isPasswordRequired(txt)`, `isRemoteControlSupported(txt)` and `getProtocolVersion(txt)` read a TXT record.

```ts
import { AirPlayFeatureFlags, describeFlags, hasFeatureFlag, parseFeatures } from '@corewire/airplay';

const features = parseFeatures('0x4A7FDFD5,0xBC157FDE');

console.log(describeFlags(features));
console.log(hasFeatureFlag(features, AirPlayFeatureFlags.SupportsUnifiedMediaControl));
```
