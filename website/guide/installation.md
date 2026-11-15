# Installation

Install the device layer:

```sh
bun add @corewire/devices
```

Add `@corewire/audio-source` only when your process streams audio to a device itself:

```sh
bun add @corewire/audio-source
```

`npm install` and `pnpm add` work as well. Install a protocol package directly (`@corewire/airplay`, `@corewire/companion-link`, `@corewire/core`) when you want the protocol without the device layer. `@corewire/devices` already depends on all three.

## Requirements

- Node.js 18.17 or later (20.3 or later on the 20 line), or Bun. Every package declares this in `engines`. The packages use `node:net`, `node:dgram`, `node:crypto` and `node:events`, so they do not run in a browser.
- The process must reach the devices on the local network: TCP to the AirPlay and Companion Link ports, UDP for mDNS on port 5353, and UDP for audio streams and timing.
- The `FfmpegSource` audio source needs `ffmpeg` on the `PATH`. The other sources decode in WebAssembly or plain TypeScript.

The packages ship as ES modules with type declarations. There is no CommonJS build.

## One version

Every package releases under the same version from one GitHub release. Upgrade them together. Mixing versions of `devices` and the protocol packages is not supported.

## Entry points

| Import | Contents |
| --- | --- |
| `@corewire/devices` | `AppleTV`, `HomePod`, `discover`, `createDevice`, `Credentials`, `Pairing`, every error class, device models |
| `@corewire/devices/catalog` | `fetchLyrics`, `fetchAnimatedArtwork`, `CatalogError` |
| `@corewire/airplay` | `connect`, `pair`, `discover`, `AirPlaySession`, channels, URL playback, audio streams, timing |
| `@corewire/airplay/mrp` | `MediaRemote`, `MediaRemoteState`, keys, commands, volume, keyboard, message codec, protobuf types |
| `@corewire/airplay/raop` | `connect`, `discover`, `RaopSession` and the TXT record helpers |
| `@corewire/airplay/rtsp` | `RtspClient`, request and response parsing |
| `@corewire/companion-link` | `connect`, `pair`, `discover`, `CompanionLinkSession` and its groups |
| `@corewire/audio-source` | `Mp3Source`, `OggSource`, `WavSource`, `PcmSource`, `FileSource`, `UrlSource`, `FfmpegSource`, `LiveSource`, `SineWaveSource` |
| `@corewire/core` | Errors, `Logger`, `reporter` and `waitFor` |
| `@corewire/core/crypto`, `/discovery`, `/encoding`, `/pairing`, `/transport` | The shared building blocks |
