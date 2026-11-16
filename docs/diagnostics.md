# Diagnostics

`packages/diagnostics` in the repository is a private Electron app for working against real devices. It is not published to npm. The project tests every change with it on an Apple TV and a HomePod. It also shows what a device sends.

## What it does

- Pairs Apple TVs and stores the credentials.
- Connects several devices at once, through `@apple-protocols/devices`.
- Has panels for remote control, now playing, volume, audio streaming, RAOP, multiroom, mDNS scans, encoding tools and stored credentials.
- Shows every message it sends or receives in a traffic view, decrypted and decoded. This is the traffic sink of [`reporter`](/protocols/transport#traffic).
- Shows the log of each device, the events of its capabilities and statistics per device.
- Has a pairing proxy that sits between a controller and a device and records what passes.

## Running it

From a checkout of the repository:

```sh
bun install
bun --cwd packages/diagnostics dev
```

`bun --cwd packages/diagnostics pack` builds installers for macOS, Linux and Windows into `packages/diagnostics/release/`.

## The diag CLI

`dev:agent` starts the app with a small HTTP bridge on the loopback interface. The bridge offers every channel of the app to the `diag` command line tool:

```sh
bun --cwd packages/diagnostics dev:agent

bun run diag wait-ready
bun run diag devices --scan
bun run diag connect living-room
bun run diag mark
bun run diag call living-room device remote.press up
bun run diag traffic --since-mark --decoded
bun run diag events --since-mark
bun run diag logs --since-mark --group error
```

| Command | Meaning |
| --- | --- |
| `status` | The bridge, its cursors and the devices |
| `wait-ready` | Waits for the app, after a restart too, and for its reconnects |
| `devices [--scan]` | The discovered devices |
| `connect <device>`, `disconnect <device>` | `<device>` is an id or a part of the name that matches one device |
| `snapshot <device>` | The current state of a device |
| `call <device> <root> <path> [args...]` | Calls an action or reads a value on the device |
| `invoke <channel> [json]` | Any channel of the app |
| `mark` | Remembers the current cursors, for `--since-mark` |
| `logs`, `events`, `traffic` | Reads a buffer, with filters such as `--grep`, `--limit`, `--protocol` and `--direction` |
| `wait <logs\|events\|traffic>` | Blocks until something matches |
| `proxy status`, `proxy start`, `proxy stop` | The pairing proxy |

`bun run diag --help` lists every option. Actions that change something lasting, such as forgetting credentials or setting the volume above half, ask for `--confirm`.

A typical loop runs `mark`, does something and reads `traffic`, `events` and `logs` since the mark. When a request times out, the traffic shows whether the device answered at all.
