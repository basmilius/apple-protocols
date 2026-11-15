# Transport and logging

```ts
import { Connection, Context, EncryptionAwareConnection } from '@corewire/core/transport';
import { Logger, reporter } from '@corewire/core';
```

## Context

A `Context` ties a connection to a device: its `deviceId`, the `identity` this client presents, and the `logger` that tags every line with the device.

```ts
import { Context } from '@corewire/core/transport';

const context = new Context('Living-Room.local', {name: 'Kitchen hub'}, (group, args) => {
    console.log(group, ...args);
});

context.logger.info('[example]', 'hello');
```

The second argument is a `DeviceIdentity` with the fields you override (`name`, `model`, `osName`, `osVersion`, `osBuildVersion`, `sourceVersion`, `applicationBundleIdentifier`, `applicationBundleVersion`), all optional. `context.identity` returns only those overrides; each protocol package fills in its own defaults where it sends the identity. The name defaults to `DEFAULT_CLIENT_NAME`, `CoreWire`. The third argument is a `LogSink` that receives every log call of this context.

Pass one context to several connections of the same device, such as an AirPlay and a Companion Link session, so their logs line up.

## Connection

`Connection` wraps a TCP socket with a typed `EventEmitter`. It emits `connect`, `data`, `error` and `closed`. Every way a connection ends emits `closed` once, with a `CloseReason`, and aborts its `signal`.

| Member | Meaning |
| --- | --- |
| `connect()` | Opens the socket |
| `write(data)` | Writes bytes |
| `disconnect()` | Closes with reason `local` |
| `destroy(error?)` | Closes at once |
| `state` | `connecting`, `connected`, `closing`, `disconnected` or `failed` |
| `address`, `port`, `localAddress`, `isConnected`, `signal`, `context` | About the connection |

`EncryptionAwareConnection` adds `enableEncryption(readKey, writeKey)` and an `EncryptionState` with the keys and frame counters, which a subclass reads through the protected `encryption` getter. `buildNonce(counter, format)` builds the 12-byte ChaCha20 nonce: `counter-at-0` for Companion Link, `counter-at-4` for AirPlay.

## Logging

There are two layers. A `Logger` belongs to a context and has a method per group: `debug()`, `error()`, `info()`, `net()`, `raw()`, `warn()`. Every call goes to the global `reporter`, and to the context's sink when it has one.

The `reporter` decides what reaches the console and what reaches a sink:

```ts
import { reporter } from '@corewire/core';

reporter.enable('info');
reporter.disable('debug');

reporter.setSink(entry => {
    console.log(entry.deviceId, entry.group, ...entry.args);
}, {groups: ['error', 'warn', 'info'], silenceConsole: true});
```

| Method | Meaning |
| --- | --- |
| `enable(group)`, `disable(group)` | Console output per group; all groups start off |
| `all()`, `none()` | Turn console groups on or off at once |
| `setSink(sink, options?)` | One function receives every entry of every device, in `groups` (default all); `silenceConsole` stops console output |
| `clearSink()` | Removes the sink |
| `setTrafficSink(sink)`, `clearTrafficSink()` | Receives decoded protocol traffic, see below |

`all()` turns on every group except `raw`.

### Traffic

The protocol packages report every message they send and receive with `logger.traffic()`: the protocol, the direction, a one-line summary, the decoded message and the plaintext bytes. Without a traffic sink this costs nothing. With one you can build a traffic view, as the [diagnostics app](/diagnostics) does.

```ts
import { reporter } from '@corewire/core';

reporter.setTrafficSink(entry => {
    console.log(entry.protocol, entry.direction, entry.summary);
});
```

Traffic is plaintext, taken after decryption on the way in and before encryption on the way out. RTP audio packets are not reported.
