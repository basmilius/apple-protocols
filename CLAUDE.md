# Apple Protocols

TypeScript monorepo voor Apple device protocollen (AirPlay 2, MRP, Companion Link, RAOP). Bun workspace.

## Build

```bash
bash build.sh        # Bouwt alle packages in dependency-volgorde
```

Elke package gebruikt `tsgo --noEmit && tsdown` (type-check + bundel). Diagnostics gebruikt `tsgo && bun -b build.ts` (compileert standalone binaries voor 5 platforms).

### Protobuf genereren

```bash
bun --cwd packages/airplay gen:proto   # buf generate → packages/airplay/src/proto/
```

117 `.proto` bestanden in `packages/airplay/proto/`, tooling: `@bufbuild/buf` + `@bufbuild/protoc-gen-es` + `@bufbuild/protobuf`.

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

| Package                           | Pad                       | Doel                                                                          |
|-----------------------------------|---------------------------|-------------------------------------------------------------------------------|
| `@basmilius/apple-encoding`       | `packages/encoding`       | Plist, OPack, TLV8, DAAP, NTP                                                 |
| `@basmilius/apple-encryption`     | `packages/encryption`     | Ed25519, Curve25519, ChaCha20, HKDF, SRP                                      |
| `@basmilius/apple-common`         | `packages/common`         | Discovery, pairing (HAP M1-M6 + verify), storage, context, mDNS               |
| `@basmilius/apple-audio-source`   | `packages/audio-source`   | Audio decoders: MP3, OGG, WAV, PCM, FFmpeg, URL, SineWave, Live               |
| `@basmilius/apple-rtsp`           | `packages/rtsp`           | RTSP client (request/response, encryption)                                    |
| `@basmilius/apple-airplay`        | `packages/airplay`        | AirPlay 2 protocol: control/data/audio/event streams, 117 protobuf definities |
| `@basmilius/apple-companion-link` | `packages/companion-link` | Companion Link: HID, apps, accounts, power, OPack framing                     |
| `@basmilius/apple-raop`           | `packages/raop`           | RAOP audio streaming via RTSP                                                 |
| `@basmilius/apple-devices`        | `packages/devices`        | Device abstracties: AppleTV, HomePod, HomePodMini                             |
| `@basmilius/apple-diagnostics`    | `packages/diagnostics`    | Interactieve test/debug CLI (standalone binaries)                             |

## Dependency graph

```
encoding          (geen interne deps)
encryption        (geen interne deps)
common            → encoding, encryption
audio-source      → common
rtsp              → common, encoding
airplay           → common, encoding, encryption, rtsp
companion-link    → common, encoding, encryption
raop              → common, encoding, encryption, rtsp
devices           → airplay, common, companion-link, encoding
diagnostics       → alle bovenstaande
```

Alle interne deps gebruiken `workspace:*`. Bij release vervangt CI dit met de release-versie via `sed`.

## Architectuur

```
devices (AppleTV, HomePod)
  ├── airplay/ (AirPlayDevice + Remote, State, Volume, Client, Player)
  │     └── @basmilius/apple-airplay (Protocol, DataStream, ControlStream, AudioStream, EventStream)
  │           └── @basmilius/apple-common (pairing, mDNS, storage)
  │                 ├── @basmilius/apple-encoding
  │                 └── @basmilius/apple-encryption
  ├── companion-link/ (CompanionLinkDevice)
  │     └── @basmilius/apple-companion-link
  └── model/
        ├── AppleTV = AirPlay + CompanionLink (remote control + media + apps + text input)
        ├── HomePod = AirPlay only (media + volume)
        └── HomePodMini = HomePod (zelfde, ander device model)
```

## Key patterns

### Message sending (MRP via AirPlay DataStream)
Berichten worden gebouwd in `packages/airplay/src/dataStreamMessages.ts` en verstuurd via `DataStream.exchange()` (request/response) of `DataStream.send()` (fire-and-forget). Elk bericht is een `ProtocolMessage` wrapper met een protobuf extension.

### State tracking
`packages/devices/src/airplay/state.ts` luistert naar DataStream events en houdt now-playing, volume, keyboard, en output device state bij. `NowPlayingSnapshot` vergelijking voorkomt dubbele events. Consumers luisteren naar State events.

### Now playing hierarchie
`AirPlayState` → `Client` (per bundleIdentifier) → `Player` (per playerPath). Client proxied getters naar de actieve Player. Player extrapoleert `elapsedTime` via Cocoa-timestamp + playbackRate.

### HID events
Remote control via USB HID usage pages: Generic Desktop (0x01) voor navigatie, Consumer (0x0c) voor media. Gebouwd via `sendHIDEvent()`. `AirPlayRemote` biedt high-level methoden (`up/down/play/pause/volumeUp` etc.) en primitieven (`pressAndRelease`, `longPress`, `doublePress`).

### Pairing
`AccessoryPair` (M1-M6 pair-setup) en `AccessoryVerify` (Curve25519 pair-verify) in `packages/common/src/pairing.ts`. Twee modi: PIN-pairing (M1-M6 → `AccessoryCredentials`) en transient (M1-M4 → `AccessoryKeys`). Gebruikt door zowel AirPlay (`/pair-setup`, `/pair-verify`) als Companion Link (OPack frames).

### Connection management
- `Connection<TEventMap>`: TCP socket wrapper, ingebouwde retry (3 pogingen, 3s interval), `keepAlive(true, 10s)`
- `EncryptionAwareConnection`: voegt `enableEncryption(readKey, writeKey)` toe met `EncryptionState` (keys + counters)
- `ConnectionRecovery`: exponential backoff (base=1s, max=30s, maxAttempts=3), optioneel `reconnectInterval`
- Bound handlers als `readonly #bound*` velden voor correcte `off()` bij reconnect

### Discovery (mDNS)
`Discovery` klasse met factory methods: `.airplay()`, `.companionLink()`, `.raop()`. Zelfgebouwde DNS encoder/decoder (geen deps). Meerdere UDP sockets per netwerk-interface. `wake(address)` knocks op 4 poorten.

### Storage
`abstract Storage` → `JsonStorage` (schrijft naar `~/.config/apple-protocols/storage.json`) of `MemoryStorage` (in-memory). Credentials worden base64-geserialiseerd.

## Event systeem

Alle classes gebruiken Node.js `EventEmitter<EventMap>` (typed, geen custom wrapper). Patroon:
```ts
type EventMap = {
    eventName: [arg1Type, arg2Type];
};
class Foo extends EventEmitter<EventMap> { ... }
```

EventMaps zijn lokaal gedefinieerd per klasse, niet hergebruikt/geexporteerd (uitzondering: `RaopClient`).

## Error hierarchie

```
AppleProtocolError                (packages/common/src/errors.ts)
├── ConnectionError
│   ├── ConnectionTimeoutError
│   └── ConnectionClosedError
├── PairingError
│   ├── AuthenticationError
│   └── CredentialsError
├── CommandError
│   └── SendCommandError          (packages/devices/src/airplay/remote.ts)
├── SetupError
├── DiscoveryError
├── EncryptionError
├── InvalidResponseError
├── TimeoutError
└── PlaybackError
```

Standalone: `TLV8PairingError` (encoding), `DecryptionError` (encryption).

## Logging

Eigen twee-laags systeem in `packages/common/src/reporter.ts`:
- `Reporter` (singleton `reporter`): beheert debug-groepen (`debug`, `error`, `info`, `net`, `raw`, `warn`), `.all()` / `.none()` / `.enable(group)` / `.disable(group)`
- `Logger` (per device via `Context`): methoden `debug()`, `error()`, `info()`, `net()`, `raw()`, `warn()` met ANSI-kleuren
- Productie-library code gebruikt alleen het Logger-systeem, nooit `console.log` direct

## TypeScript configuratie

Alle packages delen deze instellingen:
- `target: esnext`, `module: esnext`, `moduleResolution: bundler`
- `strict: false`, `isolatedModules: true`, `skipLibCheck: true`
- `isolatedDeclarations: true` (behalve `common` en `devices`)
- Path alias: `@basmilius/apple-*` → `../*/src` (dev-tijd cross-package imports)
- Output: ESM (`.mjs` + `.d.mts`), single entry point `./dist/index.mjs` per package

## Code conventions

- Zie `.editorconfig`: 4 spaties, single quotes, semicolons, LF, geen trailing comma's
- Private class fields met `#` prefix
- Arrow functions waar mogelijk
- `waitFor(ms)` voor delays in HID press/release
- Error klassen zetten altijd `this.name` in de constructor
- Bound event handlers als `readonly #bound*` class fields
- Alle exports via `packages/*/src/index.ts`

## Pitfalls & niet-triviale design decisions

### EventStream key swap is bewust
`eventStream.ts` roept `enableEncryption(writeKey, readKey)` aan — de argumenten lijken omgedraaid, maar dit is correct. De HKDF info-strings zijn benoemd vanuit het perspectief van de Apple TV:
- `Events-Write-Encryption-Key` = wat de Apple TV naar ons **schrijft** → wij gebruiken dit als **read** (decrypt) key
- `Events-Read-Encryption-Key` = wat de Apple TV van ons **leest** → wij gebruiken dit als **write** (encrypt) key

Bevestigd via pyatv (`ap2_session.py`: *"Read/Write info reversed here as connection originates from receiver!"*).

### Nonce formaten per protocol
- **Companion Link**: 12-byte LE counter op offset 0 (de counter is 8 bytes, trailing 4 bytes zijn zero)
- **AirPlay** (DataStream/EventStream): 4 zero bytes + 8-byte LE counter op offset 4

Beide formaten zijn bevestigd correct via pyatv's `Chacha20Cipher` (12-byte nonce_length) en `Chacha20Cipher8byteNonce` (4-byte pad + 8-byte counter).

### Encrypted/plaintext buffer scheiding
DataStream, EventStream en RtspClient gebruiken een aparte `#encryptedBuffer` voor inkomende TCP data en `#buffer` voor reeds-gedecrypte plaintext. Deze scheiding is essentieel: zonder dit wordt bij gedeeltelijke frames (partial TCP delivery) plaintext gemixed met nieuwe encrypted data, waardoor de ChaCha20 decoder de plaintext als frame-header interpreteert → corrupt gedrag of deadlock.

### NTP timestamps moeten wall-clock zijn
`NTP.now()` in `encoding/ntp.ts` moet `Date.now()` gebruiken (wall-clock ms sinds Unix epoch). `process.hrtime.bigint()` is een monotone klok (nanoseconden sinds processtart) en levert NTP timestamps op die ~50 jaar afwijken. De Apple TV compenseert met een constant offset, maar bij procesherstart verandert dit offset volledig.

## CI/CD

Enige workflow: `.github/workflows/released.yml` (trigger: GitHub Release). Vervangt `0.0.0` → release tag en `workspace:*` → versie, bouwt alles, publiceert naar npm. Geen PR/push CI.

## Tooling afwezig

- Geen unit tests of test framework (alleen handmatige test scripts in diagnostics en per package)
- Geen linter (ESLint/Biome) of formatter (Prettier) — alleen `.editorconfig`
- Geen Docker
- Geen `.env` bestanden (alleen `process.env.HOME` / `USERPROFILE` voor storage pad)
