# Logging and errors

## Logging

Pass `log` to a device and it receives the entries of that device at the levels in `logLevels`. The default levels are `error` and `warn`.

```ts
import { HomePod } from '@corewire/devices';

const pod = new HomePod({address: '192.168.1.30', id: 'Kitchen.local'}, {
    logLevels: ['error', 'warn', 'info'],
    log: entry => {
        console.log(new Date(entry.timestamp).toISOString(), entry.device, entry.level, entry.message);
    }
});
```

A `LogEntry` has the `level`, the `device` id, the `message` formatted with `util.format`, the raw `args` and a `timestamp` in epoch milliseconds.

| Level | Content |
| --- | --- |
| `error` | Failures |
| `warn` | Problems the device works around |
| `info` | Connection and recovery steps |
| `debug` | Protocol details |
| `net` | Connection-level events |
| `raw` | Raw protocol data; very verbose |

### The global reporter

Every entry also goes to the global `reporter` in `@corewire/core`, which prints the groups you enable to the console. All groups are off until you enable one.

```ts
import { reporter } from '@corewire/core';

reporter.enable('warn');
reporter.enable('error');
```

`reporter.setSink()` also sends every entry of every device to one function; `{silenceConsole: true}` stops the console output while it is installed. See [Transport and logging](/protocols/transport#logging).

## Errors

Every error the packages throw on purpose extends `AppleProtocolError`. `@corewire/devices` re-exports every error class of `@corewire/core`, so you import them all from the package you already depend on:

```ts
import { CommandRefusedError, PairingError, UnavailableError } from '@corewire/devices';
```

```
AppleProtocolError
├── ConnectionError
│   ├── ConnectionTimeoutError
│   └── ConnectionClosedError
│       └── SetupClosedError        (@corewire/companion-link)
├── PairingError
│   ├── AuthenticationError
│   ├── CredentialsError
│   └── TLV8PairingError
├── CommandError
│   ├── CommandRefusedError         (@corewire/devices)
│   └── SendCommandError            (@corewire/airplay/mrp)
├── SetupError
├── DiscoveryError
├── EncryptionError
│   └── DecryptionError
├── InvalidResponseError
├── TimeoutError
├── PlaybackError
├── UnavailableError                (@corewire/devices)
└── CatalogError                    (@corewire/devices/catalog)
```

The classes without a package name come from `@corewire/core`.

What you meet through `@corewire/devices`:

| Error | When |
| --- | --- |
| `UnavailableError` | A capability was called while it cannot work |
| `PairingError` | A PIN was wrong, or pair-verify failed |
| `CredentialsError` | `Credentials.parse()` got a value it cannot read; also the Companion Link error of an Apple TV without credentials |
| `CommandRefusedError` | The device refused a playback command; `reason` and `status` say why, as strings |
| `PlaybackError` | The device refused a URL |
| `ConnectionClosedError` | A connect was interrupted, or a request went out on a session that ended |
| `TimeoutError` | A request got no reply in time |
| `CatalogError` | A request to the Apple Music catalog failed; see [Apple Music catalog](/guide/catalog) |
