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

Every error the packages throw on purpose extends `AppleProtocolError` from `@corewire/core`. Add `@corewire/core` to your dependencies to import them; your package manager may not expose the copy that `@corewire/devices` brings along.

```
AppleProtocolError
├── ConnectionError
│   ├── ConnectionTimeoutError
│   └── ConnectionClosedError
│       └── SetupClosedError        (@corewire/companion-link)
├── PairingError
│   ├── AuthenticationError
│   └── CredentialsError
├── CommandError
│   └── SendCommandError            (@corewire/airplay/mrp)
├── SetupError
├── DiscoveryError
├── EncryptionError
├── InvalidResponseError
├── TimeoutError
├── PlaybackError
└── UnavailableError                (@corewire/devices)
```

`TLV8PairingError` (in `TLV8` of `@corewire/core/encoding`) and `DecryptionError` (in `Chacha20` of `@corewire/core/crypto`) extend `Error` directly.

What you meet through `@corewire/devices`:

| Error | When |
| --- | --- |
| `UnavailableError` | A capability was called while it cannot work |
| `PairingError` | A PIN was wrong, or pair-verify failed |
| `CredentialsError` | `Credentials.parse()` got a value it cannot read; also the Companion Link error of an Apple TV without credentials |
| `SendCommandError` | The app refused a playback command |
| `PlaybackError` | The device refused a URL |
| `ConnectionClosedError` | A connect was interrupted, or a request went out on a session that ended |
| `TimeoutError` | A request got no reply in time |
