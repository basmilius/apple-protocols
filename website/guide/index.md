# Introduction

CoreWire is a set of TypeScript packages that talk to Apple TVs and HomePods on the local network. They implement AirPlay 2, the Media Remote Protocol (MRP) inside it, RAOP and Companion Link. They run on Node.js and Bun, without native dependencies.

## The packages

| Package | What it is |
| --- | --- |
| `@corewire/devices` | `AppleTV` and `HomePod`. They connect, recover on their own and expose remote, now playing, volume, multiroom, apps and media. Start here. |
| `@corewire/airplay` | The AirPlay 2 session with its control, event and data channels, URL playback, audio streaming and timing. MRP lives on `@corewire/airplay/mrp`, RAOP on `/raop`, RTSP on `/rtsp`. |
| `@corewire/companion-link` | The Companion Link session of an Apple TV: HID keys, touch, text input, power, apps, accounts, media and system settings. |
| `@corewire/audio-source` | Sources for audio streaming: MP3, OGG, WAV, FLAC and QOA decoders, raw PCM, FFmpeg, URLs, live input and a sine wave. |
| `@corewire/core` | What the protocols share: TLV8, OPack, plist and DAAP codecs, ChaCha20, Ed25519, Curve25519, SRP, HAP pairing, encrypted transport and mDNS. It knows no protocol. |

The protocol packages depend only on `core`. AirPlay and Companion Link meet only in `devices`. All packages share one version.

The OPack and TLV8 codecs are standalone packages without dependencies, which `core` re-exports: [`opack`](/reference/opack) and [`tlv8`](/reference/tlv8). They also serve projects that need the format but not CoreWire.

## How these docs are organized

- The **Guide** covers `@corewire/devices`. It finds a device, connects, pairs and uses every capability of an Apple TV or HomePod.
- **Protocols** covers the packages underneath, for an AirPlay or Companion Link session without the device layer.
- **Reference** lists every export of each entry point, with its signature.
- **Diagnostics** describes the Electron app and the `diag` CLI that test against real devices.

## Which layer to use

Start with `@corewire/devices`. A device object keeps its connection alive and retries with backoff. It looks the device up again when its address changes, and now playing and volume stay steady across a reconnect. The API is the same whichever protocol answers a call.

Use a protocol package for something the device layer does not expose, for a tool that inspects traffic, or to decide yourself when a connection opens and closes. A protocol session lives once. It ends with a reason and does not reconnect.

## Next

Read [Installation](/guide/installation), then [Getting started](/guide/getting-started).
