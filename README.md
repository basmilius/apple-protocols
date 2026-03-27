# Apple Protocols

TypeScript monorepo with implementations of proprietary Apple network protocols: **AirPlay 2**, **RAOP**, **Companion Link**, and supporting layers. Built with [Bun](https://bun.sh/) workspaces.

Developed for use with [Apple for Homey Pro](https://github.com/basmilius/homey-apple).

## Requirements

- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/)
- An Apple TV or HomePod (for testing)

## Getting started

```bash
bun install
bash build.sh
```

`build.sh` builds all packages in dependency order. Each package runs `tsgo --noEmit && tsdown` (type-check + bundle).

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
| `@basmilius/apple-diagnostics`    | `packages/diagnostics`    | Interactive test/debug tools (standalone binaries)                    |

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

// Find all AirPlay devices on the network.
const discovery = Discovery.airplay();
const devices = await discovery.find();

// Wait for a specific device by hostname.
const result = await discovery.findUntil('Living-Room.local');

// Discover all protocols at once (AirPlay + Companion Link + RAOP).
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

HomePods use transient pairing — no stored credentials needed.

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
await device.remote.commandSkipForward(15);
await device.remote.commandSeekToPosition(60);
await device.remote.commandSetShuffleMode(Proto.ShuffleMode_Enum.Songs);
```

### Now playing state

```ts
device.state.on('nowPlayingChanged', (client, player) => {
    console.log(client.bundleIdentifier); // 'com.apple.Music'
    console.log(client.title);
    console.log(client.artist);
    console.log(client.isPlaying);
});

device.state.on('volumeChanged', (volume) => {
    console.log(volume); // 0.0 – 1.0
});

// Or read directly
const {title, artist, album, duration, elapsedTime, isPlaying} = device.state;
```

### Streaming audio

```ts
import { Url } from '@basmilius/apple-audio-source';

// Client-side streaming: decode locally and send PCM via RTP.
const source = await Url.fromUrl('https://example.com/song.mp3');
await device.streamAudio(source);

// URL playback: device fetches and plays the URL itself.
await device.playUrl('https://example.com/video.mp4');
await device.playUrl('https://example.com/stream.m3u8', 30); // start at 30s
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

### Regenerating protobuf definitions

```bash
bun --cwd packages/airplay gen:proto
```

This runs [Buf](https://buf.build/) over the 117 `.proto` files in `packages/airplay/proto/` and outputs TypeScript to `packages/airplay/src/proto/`.

### Diagnostics

The `diagnostics` package builds standalone binaries for interactive testing and debugging:

```bash
bun --cwd packages/diagnostics build
```

This produces cross-platform binaries in `packages/diagnostics/dist/`:

| Binary                           | Platform            |
|----------------------------------|---------------------|
| `ap-diagnostics-macos-arm64`     | macOS Apple Silicon |
| `ap-diagnostics-macos-x64`       | macOS Intel         |
| `ap-diagnostics-linux-arm64`     | Linux ARM64         |
| `ap-diagnostics-linux-x64`       | Linux x64           |
| `ap-diagnostics-windows-x64.exe` | Windows x64         |

The tool provides an interactive menu for pairing, remote control, audio streaming, URL playback, mDNS scanning, and more.

### Testing against devices

Use the diagnostics tool for interactive testing:

```bash
# Build and run diagnostics
bun --cwd packages/diagnostics build
./packages/diagnostics/dist/ap-diagnostics-macos-arm64
```

The diagnostics tool provides an interactive menu for pairing, remote control, audio streaming, URL playback, mDNS scanning, and more.

## License

MIT
