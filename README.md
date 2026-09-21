# Apple Protocols

[![Release packages](https://github.com/basmilius/apple-protocols/actions/workflows/released.yml/badge.svg)](https://github.com/basmilius/apple-protocols/actions/workflows/released.yml)

TypeScript implementations of AirPlay 2, RAOP and Companion Link, with shared encoding, encryption and discovery packages.

Most of this code comes from studying network traffic and other implementations of Apple's undocumented protocols. I started the TypeScript rewrite to run it on a [Homey Pro](https://github.com/basmilius/homey-apple) without a Python runtime. Claude Code helped with handshake debugging and the 117 protobuf definitions.

## What you can do with this

- Discover, pair, and control Apple TV and HomePod devices from TypeScript/Node/Bun.
- Stream audio (MP3, FLAC, OGG, WAV) to AirPlay 2 devices, including multi-room.
- Read now-playing state, control playback, manage apps and accounts.
- Use the diagnostics tool for interactive testing and debugging.

## Requirements

- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/)
- An Apple TV or HomePod (for testing)

## Getting started

```bash
bun install
bash build.sh
```

`build.sh` builds the libraries and diagnostics in dependency order. Library packages run `tsgo --noEmit && tsdown`. Diagnostics runs its typechecks and an Electron Vite build.

## Packages

| Package                           | Path                      | Description                                                           |
|-----------------------------------|---------------------------|-----------------------------------------------------------------------|
| `@basmilius/apple-encoding`       | `packages/encoding`       | Plist, OPack, TLV8, DAAP, NTP encoding/decoding                       |
| `@basmilius/apple-encryption`     | `packages/encryption`     | Ed25519, Curve25519, ChaCha20-Poly1305, HKDF, SRP                     |
| `@basmilius/apple-common`         | `packages/common`         | mDNS discovery, HAP pairing (M1-M6 + verify), credential storage      |
| `@basmilius/apple-audio-source`   | `packages/audio-source`   | Audio decoders: MP3, OGG, WAV, FLAC, QOA, PCM, FFmpeg, URL            |
| `@basmilius/apple-rtsp`           | `packages/rtsp`           | RTSP client with encryption support                                   |
| `@basmilius/apple-airplay`        | `packages/airplay`        | AirPlay 2: control/data/audio/event streams, 117 protobuf definitions |
| `@basmilius/apple-companion-link` | `packages/companion-link` | Companion Link: HID, apps, accounts, power, OPack framing             |
| `@basmilius/apple-raop`           | `packages/raop`           | RAOP audio streaming via RTSP                                         |
| `@basmilius/apple-sdk`            | `packages/sdk`            | High-level SDK: AppleTV, HomePod, controllers, discovery, pairing     |
| `@basmilius/apple-proxy`          | `packages/proxy`          | Pairing proxy for inspecting and relaying protocol traffic          |
| `@basmilius/apple-diagnostics`    | `packages/diagnostics`    | Electron app for protocol testing and debugging                    |

### Dependency graph

```
@basmilius/apple-sdk
  ├── @basmilius/apple-airplay
  │     ├── @basmilius/apple-rtsp
  │     │     └── @basmilius/apple-common
  │     ├── @basmilius/apple-common
  │     │     ├── @basmilius/apple-encoding
  │     │     └── @basmilius/apple-encryption
  │     ├── @basmilius/apple-encoding
  │     └── @basmilius/apple-encryption
  ├── @basmilius/apple-companion-link
  │     ├── @basmilius/apple-common
  │     ├── @basmilius/apple-encoding
  │     └── @basmilius/apple-encryption
  ├── @basmilius/apple-raop
  │     ├── @basmilius/apple-rtsp
  │     ├── @basmilius/apple-common
  │     ├── @basmilius/apple-encoding
  │     └── @basmilius/apple-encryption
  ├── @basmilius/apple-audio-source
  │     └── @basmilius/apple-common
  ├── @basmilius/apple-common
  └── @basmilius/apple-encoding
```

## Usage

The `@basmilius/apple-sdk` package provides the high-level API. The examples below assume all packages are built.

### Discovering devices

```ts
import { Discovery } from '@basmilius/apple-common';

const discovery = Discovery.airplay();
const devices = await discovery.find();

const result = await discovery.findUntil('Living-Room.local');

// Scan AirPlay, Companion Link and RAOP together.
const all = await Discovery.discoverAll();
```

### Pairing

Pairing is required once per Apple TV. HomePods use transient pairing and don't need stored credentials.

```ts
import * as AirPlay from '@basmilius/apple-airplay';

const protocol = new AirPlay.Protocol(discoveryResult);
await protocol.connect();
await protocol.pairing.start();

// A PIN is shown on the Apple TV screen.
const credentials = await protocol.pairing.pin(async () => {
    return '1234'; // prompt the user for the PIN
});

// Store credentials for future connections.
protocol.disconnect();
```

### Connecting to a HomePod

HomePods connect with transient pairing.

```ts
import { HomePod } from '@basmilius/apple-sdk';

const device = new HomePod({ airplay: discoveryResult });
await device.connect();
```

### Connecting to an Apple TV

Apple TV requires credentials from a previous pairing.

```ts
import { AppleTV } from '@basmilius/apple-sdk';

const device = new AppleTV({ airplay: airplayResult, companionLink: companionLinkResult });
await device.connect(credentials);
```

### Remote control

```ts
import { Proto } from '@basmilius/apple-airplay';

// HID-based navigation
await device.remote.up();
await device.remote.down();
await device.remote.select();
await device.remote.menu();
await device.remote.home();

// Playback commands
await device.playback.play();
await device.playback.pause();
await device.playback.next();
await device.playback.previous();

// Volume
await device.volume.set(0.5);
await device.volume.up();
await device.volume.down();

// Seek and shuffle
await device.playback.skipForward(15);
await device.playback.seekTo(60);
await device.playback.setShuffleMode(Proto.ShuffleMode_Enum.Songs);
```

### Now playing state

```ts
device.state.on('nowPlayingChanged', (client, player) => {
    if (!client) return;

    console.log(client.bundleIdentifier); // 'com.apple.Music'
    console.log(client.title);
    console.log(client.artist);
    console.log(client.isPlaying);
});

device.state.on('volumeChanged', (volume) => {
    console.log(volume); // 0.0 to 1.0
});

const {title, artist, album, duration, elapsedTime, isPlaying} = device.state;
```

### Streaming audio

```ts
import { Url } from '@basmilius/apple-audio-source';

// Client-side streaming: decode locally and send PCM via RTP.
const source = await Url.fromUrl('https://example.com/song.mp3');
await device.media.streamAudio(source);

// URL playback: device fetches and plays the URL itself.
await device.media.playUrl('https://example.com/video.mp4');
await device.media.playUrl('https://example.com/stream.m3u8', 30); // start at 30s
```

### Apple TV specific (Companion Link)

```ts
const apps = await device.apps.list();
await device.apps.launch('com.apple.TV');

const users = await device.accounts.list();
await device.accounts.switch(accountId);

await device.power.on();
await device.power.off();
```

## Development

### Building a single package

```bash
# Type-check + bundle
bun --cwd packages/airplay build

# Watch mode (bundle only, no type-check)
bun --cwd packages/airplay dev
```

The proxy has a separate build: `bun --cwd packages/proxy build`.

### Regenerating protobuf definitions

```bash
bun --cwd packages/airplay gen:proto
```

This runs [Buf](https://buf.build/) over the 117 `.proto` files in `packages/airplay/proto/` and outputs TypeScript to `packages/airplay/src/proto/`.

### Diagnostics

The diagnostics package is an Electron app for pairing, remote control, streaming, mDNS scans and inspecting protocol traffic.

```bash
bun --cwd packages/diagnostics dev
```

Build the app with `bun --cwd packages/diagnostics build`. Create installers with `bun --cwd packages/diagnostics pack`; electron-builder writes them to `packages/diagnostics/release/`.

### Testing

Run the automated tests on Bun and Node:

```bash
bash test.sh
```

For device tests, start diagnostics with its agent bridge:

```bash
bun --cwd packages/diagnostics dev:agent
```

Then use the CLI from another terminal:

```bash
bun run diag wait-ready
bun run diag devices --scan
bun run diag --help
```

The user starts the app. See [CLAUDE.md](CLAUDE.md#debuggen-tegen-een-echt-device-agent-loop) for the device-testing workflow and confirmation rules.

## License

MIT
