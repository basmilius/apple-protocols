# Apple Protocols

TypeScript monorepo voor Apple device protocollen (AirPlay 2, MRP, Companion Link, RAOP). Bun workspace.

## Build

```bash
bash build.sh        # Bouwt alle packages in dependency-volgorde
```

Elke package gebruikt `tsgo --noEmit && tsdown` (type-check + bundel). Diagnostics gebruikt `tsgo --noEmit` + `electron-vite build`; `bun run pack` draait electron-builder (macOS arm64/x64, Linux arm64/x64, Windows x64).

### Protobuf genereren

```bash
bun --cwd packages/airplay gen:proto   # buf generate → packages/airplay/src/proto/
```

117 `.proto` bestanden in `packages/airplay/proto/`, tooling: `@bufbuild/buf` + `@bufbuild/protoc-gen-es` + `@bufbuild/protobuf`.

## Validatie tegen Homey app

Na elke wijziging moet de Homey app (`~/Development/Projects/homey/com.basmilius.apple`) blijven bouwen. `diagnostics` is alleen een consumer en hoeft niet gekopieerd te worden:

```bash
# 1. Build apple-protocols
bash build.sh

# 2. Kopieer dist naar Homey node_modules
for pkg in apple-airplay apple-audio-source apple-common apple-companion-link apple-encoding apple-encryption apple-raop apple-rtsp apple-sdk; do
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
| `@basmilius/apple-sdk`            | `packages/sdk`            | High-level SDK: AppleTV, HomePod, controllers, discovery, pairing             |
| `@basmilius/apple-diagnostics`    | `packages/diagnostics`    | Electron app voor protocol-diagnostiek (React 19 + Tailwind 4, UI naar Ruimte)  |

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
sdk               → airplay, audio-source, common, companion-link, encoding, raop
diagnostics       → sdk + alle protocol packages
```

Alle interne deps gebruiken `workspace:*`. Bij release vervangt CI dit met de release-versie via `sed`.

## Architectuur

```
sdk (AppleTV, HomePod)
  ├── internal/airplay-* (AirPlayManager, Remote, State, Volume, Client, Player)
  │     └── @basmilius/apple-airplay (Protocol, DataStream, ControlStream, AudioStream, EventStream)
  │           └── @basmilius/apple-common (pairing, mDNS, storage)
  │                 ├── @basmilius/apple-encoding
  │                 └── @basmilius/apple-encryption
  ├── internal/companion-link-* (CompanionLinkManager)
  │     └── @basmilius/apple-companion-link
  └── device/
        ├── AppleTV = AirPlay + CompanionLink (remote control + media + apps + text input)
        ├── HomePod = AirPlay only (media + volume)
        └── HomePodMini = HomePod (zelfde, ander device model)
```

## Patronen

### Message sending (MRP via AirPlay DataStream)
Berichten worden gebouwd in `packages/airplay/src/dataStreamMessages.ts` en verstuurd via `DataStream.exchange()` (request/response) of `DataStream.send()` (fire-and-forget). Elk bericht is een `ProtocolMessage` wrapper met een protobuf extension.

### State tracking
`packages/sdk/src/internal/airplay-state.ts` luistert naar DataStream events en houdt now-playing, volume, keyboard, en output device state bij. `NowPlayingSnapshot` vergelijking voorkomt dubbele events. Consumers luisteren naar State events.

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

## Diagnostics app

`packages/diagnostics`: `src/main` (Electron main), `src/preload`, `src/renderer` (React), `src/shared` (IPC contract). De `@basmilius/apple-*` deps staan bewust in `devDependencies`: electron-vite externaliseert `dependencies`, en dan werkt de alias naar `../*/src` niet.

- Meerdere devices tegelijk: `SessionManager` (`src/main/session.ts`) houdt een `Map<deviceId, DeviceSession>`, met één gedeelde `TimingServer` en een save-queue om `JsonStorage`.
- `device:call { deviceId, root, path, args }` roept een pad aan op een allowlisted root (`device`, `airplay`, `airplayState`, `companionLink`, `airplayProtocol`, `companionLinkProtocol`). Zonder `args` leest het een getter. Setters kan het niet.
- Contract per domein: `contract.ts` (core), `contract.media.ts` (pair, audio, raop, raw, recovery), `contract.tools.ts` (tool, storage, mdns). Handlers in `src/main/channels/<domein>`. Een kanaal toevoegen: map + kanaallijst in het contractbestand, handler in de channels-module.
- Een paneel toevoegen: map onder `src/renderer/panels/<id>/` plus een regel in `registry.sdk.ts`, `registry.media.ts` of `registry.tools.ts`.
- Logs komen via `reporter.setSink()` (common) met `deviceId` binnen, zonder console-patching.
- Agent-bridge in `src/main/agent/` (`server.ts`, `guard.ts`, `resume.ts`), CLI in `cli/diag.ts`, gedeelde types in `src/shared/agent.ts`. `handle()` registreert elke handler ook voor `invoke()` in `ipc.ts`, dus een nieuw kanaal is vanzelf beschikbaar voor de agent. De bridge staat aan in dev, of met `--agent` / `DIAGNOSTICS_AGENT=1`.
- Split grid (`src/renderer/shell/split.ts`): kolommen van cellen, max 3x3, een cel is `{ deviceId, panelId }`.

## Debuggen tegen een echt device (agent-loop)

De diagnostics app heeft een agent-bridge: een HTTP-server op loopback die alle invoke-kanalen van het contract aanbiedt, plus de log-, event- en traffic-buffers. `diag` is de CLI ervoor. De gebruiker start de app zelf met `bun --cwd packages/diagnostics dev:agent` (`electron-vite dev --watch`); start hem nooit zelf. Meldt `diag` dat de bridge niet draait, vraag de gebruiker dan om hem te starten.

```bash
bun run diag wait-ready                          # wacht op de app en op het herverbinden van devices
bun run diag devices --scan                      # <device> is daarna een id of een stuk van de naam
bun run diag connect woonkamer
bun run diag mark                                # onthoud de cursors van nu
bun run diag call woonkamer device remote.up     # of: invoke <channel> '<json>'
bun run diag traffic --since-mark --decoded      # wat ging er over de lijn
bun run diag events --since-mark --source dataStream
bun run diag logs --since-mark --group error
bun run diag wait events --name volumeDidChange --timeout 10
```

Verbinden, stap voor stap:

1. `wait-ready` leest poort en token uit `~/.config/apple-protocols/diagnostics-agent.json`. Dat bestand bestaat alleen zolang de app draait.
2. `devices --scan` vult de discovery. `connect` werkt alleen op een device uit de laatste scan.
3. `<device>` moet precies één device raken. "Woonkamer" raakt er drie, gebruik dan `Woonkamer-TV` of het id. De foutmelding noemt de kandidaten.
4. `connect` gebruikt de credentials uit `storage.json`. Een Apple TV zonder credentials moet eerst gepaird worden (`pair:start`, de gebruiker geeft de PIN). Een HomePod verbindt zonder.
5. `connect` zet AirPlay op en daarna Companion Link, en komt terug met de snapshot. Controleer met `status` of `snapshot <device>`.

Loopt het vast, lees dan eerst het verkeer in plaats van de code: `traffic --limit 60` toont waar de handshake stopt, `logs --group error` de fout. Een `Exchange timed out for <uuid>` zoek je op met `traffic --grep <uuid> --decoded`: staat er alleen een uitgaand bericht, dan beantwoordt het device dat berichttype niet en hoort het een `send()` te zijn. Zet `timeout 20` voor een commando dat kan blijven hangen.

Het recept: `mark`, actie uitvoeren, `traffic`/`events`/`logs --since-mark` lezen, code aanpassen, `wait-ready`, herhalen. Een wijziging in `packages/*/src` herstart main vanzelf; de bridge verbindt de devices die via `connect` verbonden waren opnieuw. Cursors beginnen na een herstart weer bij 0, `--since-mark` vangt dat op.

- Uitvoer is compact. `--decoded` toont de gedecodeerde berichten, `--json` het hele record, `--grep`, `--limit` en `--protocol`/`--direction`/`--source`/`--name`/`--group` filteren. Binaire waarden zijn afgekapt op 64 bytes, `--bytes <n>` of `--full` haalt dat weg. Filter altijd eerst, artwork alleen al is honderden kilobytes.
- Traffic is plaintext (na decryptie, voor encryptie) en komt van `logger.traffic()` in `DataStream`, `EventStream`, Companion Link `stream.ts` en `RtspClient` (dus ook de AirPlay control stream en RAOP). RTP-audiopakketten zitten er niet in. Een nieuw tap-punt is een `logger.traffic()`-aanroep; zonder sink (Homey) doet die niets.
- Grenzen (`src/main/agent/guard.ts`): volume boven 0.5 en kanalen die credentials weggooien (`pair:forget`, `storage:remove*`) worden geweigerd tot de gebruiker akkoord is, daarna met `--confirm`. `storage:read` met `reveal` en `audio:pickFile` kunnen nooit. PIN-pairing vraagt de gebruiker: die leest de code van het scherm.
- Het device staat bij iemand thuis. Geen acties in een lus zonder reden, en zet terug wat je veranderde (volume, power, afspelen).

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
│   └── SendCommandError          (packages/sdk/src/internal/airplay-remote.ts)
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
- `isolatedDeclarations: true` (behalve `common` en `sdk`)
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

## Protocolvalkuilen

### EventStream key swap is bewust
`eventStream.ts` roept `enableEncryption(writeKey, readKey)` aan. De argumenten zijn bewust omgedraaid. De HKDF info-strings zijn benoemd vanuit het perspectief van de Apple TV:
- `Events-Write-Encryption-Key` = wat de Apple TV naar ons **schrijft** → wij gebruiken dit als **read** (decrypt) key
- `Events-Read-Encryption-Key` = wat de Apple TV van ons **leest** → wij gebruiken dit als **write** (encrypt) key

Bevestigd via pyatv (`ap2_session.py`: *"Read/Write info reversed here as connection originates from receiver!"*).

### Nonce formaten per protocol
- **Companion Link**: 12-byte LE counter op offset 0 (de counter is 8 bytes, trailing 4 bytes zijn zero)
- **AirPlay** (DataStream/EventStream): 4 zero bytes + 8-byte LE counter op offset 4

Beide formaten zijn bevestigd correct via pyatv's `Chacha20Cipher` (12-byte nonce_length) en `Chacha20Cipher8byteNonce` (4-byte pad + 8-byte counter).

### Encrypted/plaintext buffer scheiding
DataStream, EventStream en RtspClient gebruiken een aparte `#encryptedBuffer` voor inkomende TCP data en `#buffer` voor reeds-gedecrypte plaintext. Bij gedeeltelijke TCP-frames voorkomt dit dat nieuwe ciphertext bij plaintext terechtkomt. De ChaCha20-decoder zou die plaintext anders als frame-header lezen, met corruptie of een deadlock als gevolg.

### NTP timestamps moeten wall-clock zijn
`NTP.now()` in `encoding/ntp.ts` moet `Date.now()` gebruiken (wall-clock ms sinds Unix epoch). `process.hrtime.bigint()` is een monotone klok (nanoseconden sinds processtart) en levert NTP timestamps op die ~50 jaar afwijken. De Apple TV compenseert met een constant offset, maar bij procesherstart verandert dit offset volledig.

## CI/CD

Enige workflow: `.github/workflows/released.yml` (trigger: GitHub Release). Vervangt `0.0.0` → release tag en `workspace:*` → versie, bouwt alles, publiceert naar npm. Geen PR/push CI.

## Tests en tooling

- Geautomatiseerde tests zijn uitgesteld tot een apart, grondig testtraject. Voeg voorlopig geen tests toe. Valideer wijzigingen met de builds en diagnostics.
- Handmatige device-tests lopen via diagnostics; per package staan ook testscripts.
- Geen linter of formatter; stijlregels staan in `.editorconfig`.
- Geen Docker of `.env`-bestanden.
