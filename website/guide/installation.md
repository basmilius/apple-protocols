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

- Node.js or Bun. The packages use `node:net`, `node:dgram`, `node:crypto` and `node:events`, so they do not run in a browser.
- The process must reach the devices on the local network: TCP to the AirPlay and Companion Link ports, UDP for mDNS on port 5353, and UDP for audio streams and timing.
- The `Ffmpeg` audio source needs `ffmpeg` on the `PATH`. The other sources decode in WebAssembly or plain TypeScript.

The packages ship as ES modules with type declarations. There is no CommonJS build.

## One version

Every package releases under the same version from one GitHub release. Upgrade them together. Mixing versions of `devices` and the protocol packages is not supported.

## Entry points

| Import | Contents |
| --- | --- |
| `@corewire/devices` | `AppleTV`, `HomePod`, `discover`, `createDevice`, `Credentials`, `Pairing`, `UnavailableError`, device models |
| `@corewire/devices/catalog` | `fetchLyrics`, `fetchAnimatedArtwork` |
| `@corewire/airplay` | `connect`, `pair`, `discover`, `AirPlaySession`, channels, URL playback, audio streams, timing |
| `@corewire/airplay/mrp` | `MediaRemote`, `MediaRemoteState`, keys, commands, volume, keyboard, message codec, protobuf types |
| `@corewire/airplay/raop` | `RaopClient` and the RAOP building blocks |
| `@corewire/airplay/rtsp` | `RtspClient`, request and response parsing |
| `@corewire/companion-link` | `connect`, `pair`, `discover`, `CompanionLinkSession` and its groups |
| `@corewire/audio-source` | `Mp3`, `Ogg`, `Wav`, `Pcm`, `File`, `Url`, `Ffmpeg`, `Live`, `SineWave` |
| `@corewire/core` | Errors, `Logger`, `reporter` and small helpers |
| `@corewire/core/crypto`, `/discovery`, `/encoding`, `/pairing`, `/transport` | The shared building blocks |
