# Apple Protocols

TypeScript monorepo voor Apple device protocollen (AirPlay 2, MRP, Companion Link, RAOP). Bun workspace.

## Build

```bash
bash build.sh        # Bouwt alle packages in dependency-volgorde
```

Elke package gebruikt `tsgo --noEmit && tsdown` (type-check + bundel). Diagnostics gebruikt `tsgo && bun -b build.ts` (compileert standalone binaries).

## Validatie tegen Homey app

Na elke wijziging moet de Homey app (`~/Development/Projects/homey/com.basmilius.apple`) blijven bouwen:

```bash
# 1. Build apple-protocols
bash build.sh

# 2. Kopieer dist naar Homey node_modules
for pkg in apple-airplay apple-audio-source apple-common apple-companion-link apple-devices apple-encoding apple-encryption apple-raop apple-rtsp; do
  cp -r "packages/${pkg#apple-}/dist" ~/Development/Projects/homey/com.basmilius.apple/node_modules/@basmilius/${pkg}/dist
done

# 3. Type-check Homey app
cd ~/Development/Projects/homey/com.basmilius.apple && bun run build
```

Als stap 3 faalt, is er een breaking change in de public API.

## Packages (build-volgorde)

| Package | Pad | Doel |
|---------|-----|------|
| `@basmilius/apple-encoding` | `packages/encoding` | Plist, OPack, TLV8, DAAP, NTP |
| `@basmilius/apple-encryption` | `packages/encryption` | Ed25519, Curve25519, ChaCha20, HKDF, SRP |
| `@basmilius/apple-common` | `packages/common` | Discovery, pairing (HAP M1-M6 + verify), storage, context, mDNS |
| `@basmilius/apple-audio-source` | `packages/audio-source` | Audio decoders: MP3, OGG, WAV, PCM, FFmpeg, URL |
| `@basmilius/apple-rtsp` | `packages/rtsp` | RTSP client (request/response, encryption) |
| `@basmilius/apple-airplay` | `packages/airplay` | AirPlay 2 protocol: control/data/audio/event streams, 117 protobuf definities |
| `@basmilius/apple-companion-link` | `packages/companion-link` | Companion Link: HID, apps, accounts, power, OPack framing |
| `@basmilius/apple-raop` | `packages/raop` | RAOP audio streaming via RTSP |
| `@basmilius/apple-devices` | `packages/devices` | Device abstracties: AppleTV, HomePod, HomePodMini |
| `@basmilius/apple-diagnostics` | `packages/diagnostics` | Interactieve test/debug tools |

## Architectuur

```
devices (AppleTV, HomePod)
  ├── airplay/ (AirPlayDevice + Remote, State, Volume)
  │     └── @basmilius/apple-airplay (Protocol, DataStream, ControlStream)
  │           └── @basmilius/apple-common (pairing, mDNS, storage)
  │                 ├── @basmilius/apple-encoding
  │                 └── @basmilius/apple-encryption
  ├── companion-link/ (CompanionLinkDevice)
  │     └── @basmilius/apple-companion-link
  └── model/ (AppleTV = AirPlay + Companion, HomePod = AirPlay only)
```

## Key patterns

### Message sending (MRP via AirPlay DataStream)
Berichten worden gebouwd in `packages/airplay/src/dataStreamMessages.ts` en verstuurd via `DataStream.exchange()` (request/response) of `DataStream.send()` (fire-and-forget). Elk bericht is een `ProtocolMessage` wrapper met een protobuf extension.

### State tracking
`packages/devices/src/airplay/state.ts` luistert naar DataStream events en houdt now-playing, volume, keyboard, en output device state bij. Consumers luisteren naar State events.

### HID events
Remote control via USB HID usage pages: Generic Desktop (0x01) voor navigatie, Consumer (0x0c) voor media. Gebouwd via `sendHIDEvent()`.

### Pairing
`AccessoryPair` (M1-M6 pair-setup) en `AccessoryVerify` (Curve25519 pair-verify) in `packages/common/src/pairing.ts`. Gebruikt door zowel AirPlay (`/pair-setup`, `/pair-verify`) als Companion Link (OPack frames).

## Protobuf

117 `.proto` bestanden in `packages/airplay/proto/`, gegenereerd via Buf (`@bufbuild/protobuf`). Gegenereerde TypeScript in `packages/airplay/src/proto/`.

## Code conventions

- Zie `.editorconfig`: 4 spaties, single quotes, semicolons, LF
- Geen trailing comma's
- Private class fields met `#` prefix
- Arrow functions waar mogelijk
- `waitFor(ms)` voor delays in HID press/release
