# Introduction

corewire is a set of TypeScript packages that talk to Apple TVs and HomePods on the local network. They implement AirPlay 2, the Media Remote Protocol (MRP) that runs inside it, RAOP and Companion Link. Everything runs on Node.js and Bun. There are no native dependencies.

## The packages

| Package | What it is |
| --- | --- |
| `@corewire/devices` | `AppleTV` and `HomePod`. They connect, recover on their own and expose remote, now playing, volume, apps and media. Start here. |
| `@corewire/airplay` | The AirPlay 2 session with its control, event and data channels, URL playback, audio streaming and timing. MRP lives on `@corewire/airplay/mrp`, RAOP on `/raop`, RTSP on `/rtsp`. |
| `@corewire/companion-link` | The Companion Link session of an Apple TV: HID keys, touch, text input, power, apps, accounts, media and system settings. |
| `@corewire/audio-source` | Sources for audio streaming: MP3, OGG, WAV, FLAC and QOA decoders, raw PCM, FFmpeg, URLs, live input and a sine wave. |
| `@corewire/core` | What the protocols share: TLV8, OPack, plist and DAAP codecs, ChaCha20, Ed25519, Curve25519, SRP, HAP pairing, encrypted transport and mDNS. It knows no protocol. |

The protocol packages depend only on `core`. `devices` is the one place where AirPlay and Companion Link meet. All packages release under one version.

## How these docs are organized

- The **Guide** covers `@corewire/devices`: finding a device, connecting, pairing, and every capability an Apple TV or HomePod exposes.
- **Protocols** covers the packages underneath, for when you want an AirPlay or Companion Link session without the device layer.
- **Reference** lists every name each entry point exports, with its signature.
- **Diagnostics** describes the Electron app and the `diag` CLI that the project uses to test against real devices.

## Which layer to use

Use `@corewire/devices` unless you have a reason not to. A device object keeps its connection alive, retries with backoff, looks the device up again when its address changes, and keeps now playing and volume steady across a reconnect. Its API stays the same whichever protocol answers a call.

Use a protocol package when you need something the device layer does not expose, when you build a tool that inspects traffic, or when you want full control over when a connection opens and closes. A protocol session lives once. It ends with a reason and does not reconnect.

## Next

Read [Installation](/guide/installation), then [Getting started](/guide/getting-started).
