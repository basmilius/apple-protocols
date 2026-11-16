<h1>
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
        <img src=".github/assets/logo-light.svg" alt="Apple Protocols" width="438" height="60">
    </picture>
</h1>

[![Build checks](https://github.com/basmilius/apple-protocols/actions/workflows/checks.yml/badge.svg)](https://github.com/basmilius/apple-protocols/actions/workflows/checks.yml)
[![Release packages](https://github.com/basmilius/apple-protocols/actions/workflows/released.yml/badge.svg)](https://github.com/basmilius/apple-protocols/actions/workflows/released.yml)

Apple Protocols talks to Apple TVs and HomePods from TypeScript. It implements AirPlay 2, the Media Remote Protocol (MRP), RAOP and Companion Link, and runs on Node.js and Bun with no native dependencies.

Apple documents none of these protocols. I worked out most of it from network captures. Apple Protocols exists for my [Homey app](https://github.com/basmilius/homey-apple), which is still its main user.

**Documentation: [apple-protocols.dev](https://apple-protocols.dev)**

## Packages

| Package                    | What it is                                                                         |
|----------------------------|------------------------------------------------------------------------------------|
| `@apple-protocols/devices`        | `AppleTV` and `HomePod`, with recovery, remote, now playing, volume and media. Start here. |
| `@apple-protocols/airplay`        | The AirPlay 2 session, with MRP on `/mrp`, RAOP on `/raop` and RTSP on `/rtsp`.    |
| `@apple-protocols/companion-link` | The Companion Link session of an Apple TV.                                         |
| `@apple-protocols/audio-source`   | Audio sources and decoders for streaming.                                          |
| `@apple-protocols/core`           | Codecs, crypto, pairing, transport and mDNS that the protocols share.              |

## Example

```bash
bun add @apple-protocols/devices@next
```

```ts
import { AppleTV, Credentials } from '@apple-protocols/devices';

const tv = new AppleTV({address: '192.168.1.20'}, {
    credentials: Credentials.parse(await load())
});

tv.on('status', status => console.log(status.state));

await tv.connect();
await tv.remote.press('select');
```

Pairing, recovery, discovery, audio streaming and the protocol packages are on [apple-protocols.dev](https://apple-protocols.dev).

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
