<h1>
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
        <img src=".github/assets/logo-light.svg" alt="CoreWire" width="276" height="60">
    </picture>
</h1>

[![Build checks](https://github.com/basmilius/apple-protocols/actions/workflows/checks.yml/badge.svg)](https://github.com/basmilius/apple-protocols/actions/workflows/checks.yml)
[![Release packages](https://github.com/basmilius/apple-protocols/actions/workflows/released.yml/badge.svg)](https://github.com/basmilius/apple-protocols/actions/workflows/released.yml)

CoreWire talks to Apple TVs and HomePods from TypeScript. It implements AirPlay 2, the Media Remote Protocol (MRP), RAOP and Companion Link, and runs on Node.js and Bun with no native dependencies.

Apple documents none of these protocols. I worked out most of it from network captures. CoreWire exists for my [Homey app](https://github.com/basmilius/homey-apple), which is still its main user.

**Documentation: [corewire.dev](https://corewire.dev)**

## Packages

| Package                    | What it is                                                                         |
|----------------------------|------------------------------------------------------------------------------------|
| `@corewire/devices`        | `AppleTV` and `HomePod`, with recovery, remote, now playing, volume and media. Start here. |
| `@corewire/airplay`        | The AirPlay 2 session, with MRP on `/mrp`, RAOP on `/raop` and RTSP on `/rtsp`.    |
| `@corewire/companion-link` | The Companion Link session of an Apple TV.                                         |
| `@corewire/audio-source`   | Audio sources and decoders for streaming.                                          |
| `@corewire/core`           | Codecs, crypto, pairing, transport and mDNS that the protocols share.              |

## Example

```bash
bun add @corewire/devices
```

```ts
import { AppleTV, Credentials } from '@corewire/devices';

const tv = new AppleTV({address: '192.168.1.20'}, {
    credentials: Credentials.parse(await load())
});

tv.on('status', status => console.log(status.state));

await tv.connect();
await tv.remote.press('select');
```

Pairing, recovery, discovery, audio streaming and the protocol packages are on [corewire.dev](https://corewire.dev).

## Development

```bash
bun install
bash build.sh
bun run packages/core/test/pairing-server.ts
bun run packages/diagnostics/test/proxy-smoke.ts
bun --cwd docs build
```

`packages/diagnostics` is a private Electron app for testing against real devices (`bun --cwd packages/diagnostics dev`). [CLAUDE.md](CLAUDE.md) describes the build, the release flow and the agent workflow.

## License

MIT
