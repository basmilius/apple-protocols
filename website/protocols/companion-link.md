# Companion Link

```ts
import { CompanionLinkSession, connect, discover, pair, toTarget } from '@corewire/companion-link';
```

Companion Link is the protocol the Remote app on an iPhone uses with an Apple TV. It carries apps, accounts, power state, text input, touch and system settings as OPack messages over an encrypted TCP connection.

## Connecting

Companion Link always needs credentials from a PIN pairing. The AirPlay credentials of an Apple TV work, so one pairing covers both protocols.

```ts
import { connect, discover, toTarget } from '@corewire/companion-link';
import type { AccessoryCredentials } from '@corewire/core/pairing';

declare const credentials: AccessoryCredentials;

const [found] = await discover();
const session = await connect(toTarget(found), {credentials});

session.on('closed', reason => console.log('closed', reason));

const apps = await session.apps.list();
await session.apps.launch(apps[0].bundleId);
await session.hid.press('Select');
console.log(await session.power.fetch());

await session.close();
```

`connect(target, options)` runs pair-verify, turns on encryption, then the startup: system info, session start, the TV remote session, touch and text input start, the heartbeat, interest in the state events, and a fetch of the attention state and the media control status. It throws `CredentialsError` without credentials, `PairingError` when pair-verify fails and `ConnectionClosedError` when the signal aborts or the device closes during the handshake. `SetupClosedError` (a `ConnectionClosedError`) means the device or the socket ended the connection after it opened and before the session was ready.

| Option | Meaning |
| --- | --- |
| `credentials` | Required |
| `context`, `identity` | As for AirPlay |
| `activeUserAccount` | The iCloud alternate DSID to announce as the active user at startup |
| `state` | A `CompanionLinkState` to feed; keep one across sessions to keep its listeners |
| `signal` | Ends the session, or interrupts the handshake, when aborted |

A `CompanionLinkTarget` needs the `address` and the `port` of the `_companion-link._tcp` service. Unlike AirPlay there is no default port.

## Pairing

`pair(target, options?)` sends pair-setup M1, upon which the Apple TV shows its PIN. `PinPairing.pin(code)` finishes and resolves `AccessoryCredentials`. It works like [AirPlay pairing](/protocols/airplay#pairing).

## The groups

| Group | Methods |
| --- | --- |
| `apps` | `list()`, `launch(bundleId)`, `openUrl(url)`, `topShelf()` |
| `accounts` | `list()`, `switch(accountId)`, `switchActive(iCloudAltDSID)` and sign-in requests |
| `hid` | `press(command, type?, holdDelayMs?)` with a `HidCommand` name and `SingleTap`, `DoubleTap` or `Hold`; `command(command, down)` for one edge; game controller events |
| `touch` | `tap(holdMs?)`, `swipe(direction, duration?)`, and raw `send()` and `sendHid()` touch events |
| `text` | `set()`, `append()`, `clear()`, and `state` |
| `power` | `attentionState`, `fetch()`, `isAwake()`, `wake()`, `sleep()` |
| `media` | `command()`, `skipBy(seconds)`, `play(item)`, `capabilities`, `nowPlayingInfo` |
| `system` | Captions, appearance, Reduce Loud Sounds, Find My mode, Siri, Up Next |
| `interests` | `subscribe(event, listener)` and `unsubscribe()` for device events |
| `state` | The `CompanionLinkState` |

```ts
import type { CompanionLinkSession } from '@corewire/companion-link';

declare const session: CompanionLinkSession;

await session.hid.press('Home', 'DoubleTap');
await session.touch.swipe('left');
await session.text.set('search terms');
await session.system.setAppearance(false);
```

## State

`CompanionLinkState` collects what the device reports: `attentionState`, `textInputState`, `mediaControlFlags` and `mediaCapabilities`, `nowPlayingInfo`, `supportedActions` and `volumeAvailable`. Its events are `attentionStateChanged`, `textInputChanged`, `mediaControlFlagsChanged`, `nowPlayingInfoChanged`, `supportedActionsChanged` and `volumeAvailabilityChanged`. Like the MRP state it does no I/O: `apply(name, content)` feeds it one event.

```ts
import type { CompanionLinkSession } from '@corewire/companion-link';

declare const session: CompanionLinkSession;

session.state.on('attentionStateChanged', state => console.log('power', state));
session.state.on('textInputChanged', input => console.log('keyboard', input.isActive, input.documentText));
```

## Raw messages

`Messages` builds the OPack messages the groups send. `session.stream` is the encrypted `Stream`, with `exchange(type, message)` for a request and `sendOPack(type, message)` for an event. `FrameType` and `MessageType` name the frame and message types. Prefer the groups; they track replies and errors for you.

The session sends a heartbeat to keep the connection open. Companion Link has no request and response keepalive, so a peer that vanished without closing the socket is noticed only when TCP gives up on the heartbeat bytes.
