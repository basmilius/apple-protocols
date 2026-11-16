# Installation

The packages are in pre-release under the `next` tag, so install them with `@next` until the first stable release.

```sh
bun add @apple-protocols/devices@next
```

Add `@apple-protocols/audio-source` only when your process streams audio to a device itself:

```sh
bun add @apple-protocols/audio-source@next
```

`npm install` and `pnpm add` work too, with the same `@next` suffix. For a protocol without the device layer, install `@apple-protocols/airplay`, `@apple-protocols/companion-link` or `@apple-protocols/core` directly. `@apple-protocols/devices` already depends on all three.

## Requirements

- Node.js 18.17 or later (20.3 or later on the 20 line), or Bun. Every package declares this in `engines`. The packages use `node:net`, `node:dgram`, `node:crypto` and `node:events`, so they do not run in a browser.
- The process must reach the devices on the local network. That means TCP to the AirPlay and Companion Link ports, UDP 5353 for mDNS, and UDP for audio streams and timing.
- `FfmpegSource` needs `ffmpeg` on the `PATH`. The other sources decode in WebAssembly or plain TypeScript.

The packages ship as ES modules with type declarations. There is no CommonJS build.

## One version

One GitHub release publishes every package under the same version. Upgrade them together. Mixing versions of `devices` and the protocol packages is not supported.

## Entry points

| Import | Contents |
| --- | --- |
| `@apple-protocols/devices` | `AppleTV`, `HomePod`, `discover`, `createDevice`, `Credentials`, `Pairing`, every error class, device models |
| `@apple-protocols/devices/catalog` | `fetchLyrics`, `fetchAnimatedArtwork`, `CatalogError` |
| `@apple-protocols/airplay` | `connect`, `pair`, `discover`, `AirPlaySession`, channels, URL playback, audio streams, timing |
| `@apple-protocols/airplay/mrp` | `MediaRemote`, `MediaRemoteState`, keys, commands, volume, keyboard, message codec, protobuf types |
| `@apple-protocols/airplay/raop` | `connect`, `discover`, `RaopSession` and the TXT record helpers |
| `@apple-protocols/airplay/rtsp` | `RtspClient`, request and response parsing |
| `@apple-protocols/companion-link` | `connect`, `pair`, `discover`, `CompanionLinkSession` and its groups |
| `@apple-protocols/audio-source` | `Mp3Source`, `OggSource`, `WavSource`, `PcmSource`, `FileSource`, `UrlSource`, `FfmpegSource`, `LiveSource`, `SineWaveSource` |
| `@apple-protocols/core` | Errors, `Logger`, `reporter` and `waitFor` |
| `@apple-protocols/core/crypto`, `/discovery`, `/encoding`, `/pairing`, `/transport` | The shared building blocks |
