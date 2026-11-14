# Apple Protocols

TypeScript monorepo voor Apple device protocollen (AirPlay 2, MRP, RAOP, Companion Link) onder de npm-scope `@corewire`. Bun workspace. De repository houdt voorlopig zijn naam.

## Build

```bash
bash build.sh        # Bouwt alle packages in dependency-volgorde, diagnostics als laatste
```

Elke library gebruikt `tsgo --noEmit && tsdown` (type-check + bundel). Diagnostics gebruikt `tsgo --noEmit` + `electron-vite build`; `bun run pack` draait electron-builder (macOS arm64/x64, Linux arm64/x64, Windows x64).

Na een wijziging zijn dit de controles, ook in CI:

```bash
rm -rf packages/*/dist && bash build.sh
bun run packages/core/test/pairing-server.ts          # pair-setup en pair-verify in geheugen
bun run packages/diagnostics/test/proxy-smoke.ts      # proxy-onderdelen aanmaken zonder sockets
```

### Protobuf genereren

```bash
bun --cwd packages/airplay gen:proto   # buf generate → packages/airplay/src/mrp/proto/
```

155 `.proto` bestanden in `packages/airplay/proto/`, tooling: `@bufbuild/buf` + `@bufbuild/protoc-gen-es` + `@bufbuild/protobuf`.

## Validatie tegen de Homey app

De Homey app (`~/Development/Projects/homey/com.basmilius.apple`) is de belangrijkste consumer en importeert alleen `@corewire/devices` en `@corewire/audio-source`. Zolang de app nog op `@basmilius/apple-sdk` draait, valideer je met diagnostics. Importeert de app `@corewire`, dan moet hij na elke wijziging blijven bouwen:

```bash
# 1. Build
bash build.sh

# 2. Kopieer de dist van devices, audio-source en hun dependencies naar Homey
for pkg in core airplay companion-link devices audio-source; do
  rm -rf ~/Development/Projects/homey/com.basmilius.apple/node_modules/@corewire/${pkg}/dist
  cp -r "packages/${pkg}/dist" ~/Development/Projects/homey/com.basmilius.apple/node_modules/@corewire/${pkg}/dist
done

# 3. Type-check de Homey app
bun --cwd ~/Development/Projects/homey/com.basmilius.apple run build
```

Faalt stap 3, dan is er een breaking change in de publieke API. `audio-source` bundelt een `decode-worker.mjs` en gedeelde decoderchunks: kopieer altijd de hele `dist`. `diagnostics` is alleen een consumer en hoeft niet mee.

## Packages (build-volgorde)

| Package                    | Pad                       | Doel                                                                                                     |
|----------------------------|---------------------------|----------------------------------------------------------------------------------------------------------|
| `@corewire/core`           | `packages/core`           | Protocolneutrale kern: codecs, crypto, transport, pairing, mDNS, foutklassen, logger                     |
| `@corewire/airplay`        | `packages/airplay`        | AirPlay 2 sessie en kanalen, URL-playback, audiostream, timing; MRP op `/mrp`, RAOP op `/raop`, RTSP op `/rtsp` |
| `@corewire/companion-link` | `packages/companion-link` | Companion Link sessie met groepen: HID, touch, text, power, apps, accounts, media, system, interests       |
| `@corewire/audio-source`   | `packages/audio-source`   | Audiobronnen en decoders: MP3, OGG, WAV, FLAC, QOA, PCM, FFmpeg, URL, SineWave, Live                      |
| `@corewire/devices`        | `packages/devices`        | `AppleTV` en `HomePod` met herstel, capabilities, credentials, discovery; Apple Music op `/catalog`      |
| `@corewire/diagnostics`    | `packages/diagnostics`    | Privé Electron app voor protocoldiagnostiek, met de proxy en de opslag erin (React 19 + Tailwind 4)      |

Subpaths van core: `@corewire/core/crypto`, `/discovery`, `/encoding`, `/pairing`, `/transport`. De hoofdingang heeft de foutklassen, `reporter`/`Logger` en kleine helpers.

## Dependency graph

```
core              (geen interne deps)
airplay           → core
companion-link    → core
audio-source      → core (plus het type AudioSource uit airplay, alleen als devDependency)
devices           → core, airplay, companion-link
diagnostics       → devices + alle protocol packages
```

Een protocolpackage hangt alleen van `core` af, nooit van een ander protocol. `devices` is de enige plek waar twee protocollen samenkomen. Alle interne deps gebruiken `workspace:*`. Bij release vervangt CI dit met de release-versie via `sed`.

## Architectuur

```
devices (AppleTV, HomePod)
  ├── lifecycle/                link per protocol, retry-schema, re-resolve, status
  ├── een map per capability    remote, nowPlaying, playback, volume, power, text, apps, ...
  ├── @corewire/airplay         connect() → AirPlaySession
  │     ├── ControlChannel (RTSP), EventChannel, DataChannel
  │     ├── /mrp                MediaRemote.open(session), MediaRemoteState (model zonder I/O)
  │     ├── playUrl() / streamAudio()   eigen verbindingen binnen de package
  │     └── timing/             NTP TimingServer, PTP master
  └── @corewire/companion-link  connect() → CompanionLinkSession
        └── @corewire/core      pairing, transport, discovery, encoding, crypto
```

- `AppleTV` = AirPlay + Companion Link (remote, media, apps, accounts, power, text, touch, system). `HomePod` = alleen AirPlay. Er is geen `HomePodMini`; gebruik `device.model`.
- Een device wordt gemaakt van een doel (`{address, port?, txt?, id?}`) plus opties. Logger, credentials en timing gaan mee als optie; geen `configure()`, geen setters achteraf.
- Ontwerp en afwijkingen: `docs/reports/package-structure.tsx` (goedgekeurd ontwerp) en `docs/parity/devices-api.md` (de devices API, sectie 0 voor wat anders werd).

## Patronen

### Sessies
`connect(target, options)` in `airplay` en `companion-link` geeft een sessie die klaar is: TCP, pair-verify (of transient pairing), encryptie en de startup. Een sessie leeft één keer en eindigt één keer met `closed(reason, error?)`, reden `local | remote | timeout | error`. Zijn `signal` (AbortSignal) gaat dan af en neemt timers, listeners, openstaande requests en kindkanalen mee. Een request op een gesloten sessie faalt met `ConnectionClosedError`, een request zonder antwoord met `TimeoutError`.

### Message sending (MRP via het AirPlay datakanaal)
Berichten worden gebouwd in `packages/airplay/src/mrp/messages.ts` en verstuurd via `DataChannel.exchange()` (request/response) of `DataChannel.send()` (fire-and-forget). Elk bericht is een `ProtocolMessage` wrapper met een protobuf extension. Beantwoordt een device een berichttype niet, dan hoort het een `send()` te zijn.

### State tracking
`MediaRemoteState` (`packages/airplay/src/mrp/state.ts`) is een model zonder I/O: je voedt het met `apply(name, message)`, live vanuit het datakanaal of uit opgenomen berichten via `decodeMessage()`. Het emit alleen afgeleide events (`nowPlayingChanged`, `volumeChanged`, `keyboardChanged`, `outputDevicesChanged`, ...). `CompanionLinkState` werkt hetzelfde. `devices` houdt per device één langlevend model en vergelijkt publieke waarden met wat het laatst aankondigde, zodat een herverbinding geen dubbele events geeft.

### Now playing hiërarchie
`MediaRemoteState` → `Client` (per bundleIdentifier) → `Player` (per playerPath). Client proxied getters naar de actieve Player. Player extrapoleert `elapsedTime` via Cocoa-timestamp + playbackRate. `devices` maakt daar een `NowPlaying` momentopname met eigen types van (`'playing' | 'paused' | ...`, `'off' | 'one' | 'all'`).

### HID events
Remote control via USB HID usage pages: Generic Desktop (0x01) voor navigatie, Consumer (0x0c) voor media. `MediaRemote.hid` (`packages/airplay/src/mrp/hid.ts`) heeft de toetsen en de primitieven `press`, `longPress` en `doublePress`. `device.remote.press(key, {mode})` kiest het protocol: een tap via AirPlay HID als de toets daar bestaat, hold en double via Companion Link als die verbonden is.

### Pairing
`PairSetup` (M1 tot M6, of M1 tot M4 transient) en `PairVerify` (Curve25519) in `packages/core/src/pairing/client.ts`, de accessoirekant (`PairSetupServer`, `PairVerifyServer`) in `server.ts`. Een protocol levert alleen een `PairingTransport`: een functie die één bericht verstuurt en het antwoord teruggeeft (HTTP-body bij AirPlay, OPack-frame bij Companion Link). `pair(target)` in `airplay` en `companion-link` start een PIN-pairing; `AppleTV.pair(target)` geeft een `Pairing` die `Credentials` oplevert. `Credentials` heeft één tekstvorm, `Credentials.parse()` leest ook de hex- en base64-objecten die Homey en de oude opslag bewaren.

### Connection management
- `Connection<TEventMap>` (`core/transport`): TCP socket wrapper, verbindt één keer zonder retry, `keepAlive(true, 10s)`, eindigt via één `closed`-event met een reden.
- `EncryptionAwareConnection`: voegt `enableEncryption(readKey, writeKey)` toe met `EncryptionState` (keys + counters); `buildNonce(counter, format)` maakt de nonce per protocol.
- Herstel zit alleen in `devices` (`packages/devices/src/lifecycle/`): per protocol een link met retries na 1, 2 en 4 s, daarna voor een Apple TV 15 pogingen elke 2 minuten en daarna elke 15 minuten, voor een HomePod elke 15 minuten. Nooit opgeven. Elke retry zoekt het device eerst opnieuw (unicast DNS-SD met een wake knock, dan de `resolve`-optie of een multicast scan).
- Het device meldt één `status`-event met `disconnected | connecting | connected | degraded | recovering | offline`, een reden en de stand per protocol. `degraded`: AirPlay werkt, Companion Link nog niet.

### Discovery (mDNS)
`Discovery` in `core/discovery` zoekt op een willekeurig servicetype; zelfgebouwde DNS encoder/decoder (geen deps), meerdere UDP sockets per netwerkinterface. `MdnsResponder` adverteert (gebruikt door de proxy). Elke protocolpackage heeft zijn eigen `discover()` en servicenaam; `discover()` uit `devices` voegt AirPlay, Companion Link en RAOP per host samen. `Discovery.wake(address, ports)` knocks op de poorten uit `WAKE_PORTS` (devices).

### Storage
Opslag hoort bij de app, niet bij de libraries. Diagnostics heeft `JsonStorage` in `packages/diagnostics/src/main/storage.ts` en schrijft naar `~/.config/apple-protocols/storage.json`. Nieuwe pairings gaan in de `Credentials`-tekstvorm; bestaande entries worden gelezen zoals ze zijn.

## Diagnostics app

`packages/diagnostics`: `src/main` (Electron main), `src/preload`, `src/renderer` (React), `src/shared` (IPC contract). De `@corewire/*` deps staan bewust in `devDependencies`: electron-vite externaliseert `dependencies`, en dan werkt de alias naar `../*/src` niet.

- Meerdere devices tegelijk: `SessionManager` (`src/main/session.ts`) houdt per device een `DeviceSession` bij, met één gedeelde `TimingServer` en een save-queue om `JsonStorage`.
- Diagnostics draait alleen op de publieke API's. `device:call { deviceId, root, path, args }` roept een pad aan op een van de roots `device` (het `AppleTV`/`HomePod` object), `airplay`, `mediaRemote` en `companionLink` (de sessies uit `device.sessions`). Zonder `args` leest het een getter. Setters kan het niet.
- Contract per domein: `contract.ts` (core), `contract.media.ts` (pair, audio, raop, raw, recovery, catalog), `contract.tools.ts` (tool, storage, mdns, proxy). Handlers in `src/main/channels/<domein>`. Een kanaal toevoegen: map + kanaallijst in het contractbestand, handler in de channels-module.
- De proxy staat in `src/main/proxy/` (AirPlay en Companion Link, met een `ProxyStore` voor zijn identiteit), met een paneel en de kanalen `proxy:status|start|stop`. Zijn verkeer komt in de traffic-buffer als protocol `proxy` onder het device waar hij naartoe relayt. `src/main/discovery.ts` houdt een eigen kopie van de discovery-merge, omdat de panelen de ruwe resultaten tonen.
- Een paneel toevoegen: map onder `src/renderer/panels/<id>/` plus een regel in `registry.sdk.ts`, `registry.media.ts` of `registry.tools.ts`. Een devicepaneel krijgt ook een plek in `PANEL_SECTIONS` (`registry.ts`): Device, Control, Streaming of Inspect.
- Gedeelde bouwstenen staan in `src/renderer/ui/` (onder meer `Section`, `KeyValue`, `StatusPill`, `StatusBar`, `ICONS`) en `panels/sdk-shared` (`EventFeed`, `PanelLink`, `NotConnected`, `ResultBlock`).
- Logs komen via `reporter.setSink()` (core) met `deviceId` binnen, zonder console-patching.
- Statistieken staan in `src/main/statistics.ts`: tellers per device in intervallen van 2 seconden, met 30 minuten historie. `statistics:history` levert de grafieken en totalen. De tellers staan los van de begrensde log- en verkeersbuffers en worden ook bijgehouden als het paneel gesloten is; een herstart van main wist de historie.
- Agent-bridge in `src/main/agent/` (`server.ts`, `guard.ts`, `resume.ts`, `actions.ts`), CLI in `cli/diag.ts`, gedeelde types in `src/shared/agent.ts`. `handle()` registreert elke handler ook voor `invoke()` in `ipc.ts`, dus een nieuw kanaal is vanzelf beschikbaar voor de agent. De bridge staat aan in dev, of met `--agent` / `DIAGNOSTICS_AGENT=1`.
- Shell (`src/renderer/shell`) staat op `Workspace` van `@adecore/ui`: device switcher in de top row, sidebar met de panelen van het gekozen device, rail met logconsole en tools als side panel. Er is één paneel tegelijk zichtbaar; `state/layout.ts` onthoudt per device welk.

## Debuggen tegen een echt device (agent-loop)

De diagnostics app heeft een agent-bridge: een HTTP-server op loopback die alle invoke-kanalen van het contract aanbiedt, plus de log-, event- en traffic-buffers. `diag` is de CLI ervoor. De gebruiker start de app zelf met `bun --cwd packages/diagnostics dev:agent` (`electron-vite dev --watch`); start hem nooit zelf. Meldt `diag` dat de bridge niet draait, vraag de gebruiker dan om hem te starten.

```bash
bun run diag wait-ready                          # wacht op de app en op het herverbinden van devices
bun run diag devices --scan                      # <device> is daarna een id of een stuk van de naam
bun run diag connect woonkamer-tv
bun run diag mark                                # onthoud de cursors van nu
bun run diag call woonkamer-tv device remote.press up
bun run diag call woonkamer-tv device remote.press select '{"mode":"hold"}'
bun run diag call woonkamer-tv device status     # zonder args: een getter lezen
bun run diag call woonkamer-tv mediaRemote state.volume
bun run diag traffic --since-mark --decoded      # wat ging er over de lijn
bun run diag events --since-mark --source dataStream
bun run diag logs --since-mark --group error
bun run diag wait events --name volume.change --timeout 10
```

Verbinden, stap voor stap:

1. `wait-ready` leest poort en token uit `~/.config/apple-protocols/diagnostics-agent.json`. Dat bestand bestaat alleen zolang de app draait.
2. `devices --scan` vult de discovery. `connect` werkt alleen op een device uit de laatste scan.
3. `<device>` moet precies één device raken. "Woonkamer" raakt er drie, gebruik dan `Woonkamer-TV` of het id. De foutmelding noemt de kandidaten.
4. `connect` gebruikt de credentials uit `storage.json`. Een Apple TV zonder credentials moet eerst gepaird worden (`pair:start`, de gebruiker geeft de PIN). Een HomePod verbindt zonder.
5. `connect` zet AirPlay op en daarna Companion Link, en komt terug met de snapshot. Controleer met `status` of `snapshot <device>`.

Loopt het vast, lees dan eerst het verkeer in plaats van de code: `traffic --limit 60` toont waar de handshake stopt, `logs --group error` de fout. Een `Exchange timed out for <uuid>` zoek je op met `traffic --grep <uuid> --decoded`: staat er alleen een uitgaand bericht, dan beantwoordt het device dat berichttype niet en hoort het een `send()` te zijn. Zet `timeout 20` voor een commando dat kan blijven hangen.

Het recept: `mark`, actie uitvoeren, `traffic`/`events`/`logs --since-mark` lezen, code aanpassen, `wait-ready`, herhalen. Een wijziging in `packages/*/src` herstart main vanzelf; de bridge verbindt de devices die via `connect` verbonden waren opnieuw. Cursors beginnen na een herstart weer bij 0, `--since-mark` vangt dat op.

Herstel en proxy:

```bash
bun run diag invoke recovery:status '{"deviceId":"<id>"}'                         # status van het device, per protocol
bun run diag invoke recovery:simulateDrop '{"deviceId":"<id>","stream":"data"}'   # control, data, event of companionLink
bun run diag proxy status                                                          # draaiende proxies, met PIN en aantallen
bun run diag proxy start woonkamer-tv airplay --confirm                            # alleen na akkoord van de gebruiker
bun run diag proxy stop airplay
```

- Uitvoer is compact. `--decoded` toont de gedecodeerde berichten, `--json` het hele record, `--grep`, `--limit` en `--protocol`/`--direction`/`--source`/`--name`/`--group` filteren. Binaire waarden zijn afgekapt op 64 bytes, `--bytes <n>` of `--full` haalt dat weg. Filter altijd eerst, artwork alleen al is honderden kilobytes.
- Eventbronnen: `device` (het `status`-event), `state` (capability-events als `nowPlaying.change`, `volume.change`, `power.change`, `text.change`), `airplayState` (het MRP-model), `dataStream`, `eventStream` en `companionLink`.
- Traffic is plaintext (na decryptie, voor encryptie) en komt van `logger.traffic()` in `DataChannel`, `EventChannel`, Companion Link `stream.ts` en `RtspClient` (dus ook het AirPlay controlkanaal en RAOP), plus de proxy. RTP-audiopakketten zitten er niet in. Een nieuw tap-punt is een `logger.traffic()`-aanroep; zonder sink (Homey) doet die niets.
- Agent calls gebruiken de expliciete actielijst in `src/main/agent/actions.ts`: acties op de root `device` (`remote.press`, `volume.*`, `playback.*`, `power.*`, `text.*`, `apps.*`, `accounts.*`, `touch.*`) en een vaste lijst getters per root. Directe protocolmethoden zijn alleen via de app beschikbaar. `raw:send` valideert de catalogusargumenten en vereist `--confirm`. SDK-volume is 0 tot 1, RAOP is 0 tot 100 procent, audio streaming gebruikt -144 tot 0 dB. Ongeldige argumenten worden ook met confirm geweigerd.
- Het Performance-paneel en `diag invoke performance:status` tonen eventloop p95/p99/max, piek sinds reset, RSS/heap/external en de retentie per capturebuffer. `performance:reset` wist de meetpiek. Audio toont de FFmpeg-buffer en pauzestatus; de pauzedrempel is één seconde PCM, met maximaal één extra stdout-chunk.
- Grenzen (`src/main/agent/guard.ts`): volume boven 0.5, `volume.up`, `proxy:start` en kanalen die credentials weggooien (`pair:forget`, `storage:remove*`) worden geweigerd tot de gebruiker akkoord is, daarna met `--confirm`. `storage:read` met `reveal` en `audio:pickFile` kunnen nooit. PIN-pairing vraagt de gebruiker: die leest de code van het scherm.
- Het device staat bij iemand thuis. Geen acties in een lus zonder reden, en zet terug wat je veranderde (volume, power, afspelen).

## Event systeem

Alle classes gebruiken Node.js `EventEmitter<EventMap>` (typed, geen custom wrapper). Patroon:
```ts
type EventMap = {
    eventName: [arg1Type, arg2Type];
};
class Foo extends EventEmitter<EventMap> { ... }
```

EventMaps zijn lokaal gedefinieerd per klasse. Een EventMap die consumers nodig hebben, wordt geëxporteerd (`MediaRemoteStateEventMap`, `CompanionLinkStateEventMap`, `DataChannelEventMap`, `EventChannelEventMap`, de `EventMap` van `RaopClient` op `/raop`). Elke laag heeft zijn eigen events: een kanaal geeft berichten, een model maakt er statuswijzigingen van, het device geeft `status` en zijn capability-events. Geen laag geeft een event van een andere laag ongewijzigd door.

## Error hierarchie

```
AppleProtocolError                (packages/core/src/errors.ts)
├── ConnectionError
│   ├── ConnectionTimeoutError
│   └── ConnectionClosedError
│       └── SetupClosedError      (packages/companion-link/src/session.ts)
├── PairingError
│   ├── AuthenticationError
│   └── CredentialsError
├── CommandError
│   └── SendCommandError          (packages/airplay/src/mrp/commands.ts)
├── SetupError
├── DiscoveryError
├── EncryptionError
├── InvalidResponseError
├── TimeoutError
├── PlaybackError
└── UnavailableError              (packages/devices/src/errors.ts)
```

Standalone: `TLV8PairingError` (`core/src/encoding/tlv8.ts`), `DecryptionError` (`core/src/crypto/chacha20.ts`).

## Logging

Eigen twee-laags systeem in `packages/core/src/reporter.ts`:
- `Reporter` (singleton `reporter`): beheert debug-groepen (`debug`, `error`, `info`, `net`, `raw`, `warn`), `.all()` / `.none()` / `.enable(group)` / `.disable(group)`, plus `setSink()` en `setTrafficSink()`
- `Logger` (per device via `Context` uit `core/transport`): methoden `debug()`, `error()`, `info()`, `net()`, `raw()`, `warn()`, `traffic()` met ANSI-kleuren. Een optionele `LogSink` stuurt de entries per device door; `devices` gebruikt dat voor de `log`-optie.
- Productie-library code gebruikt alleen het Logger-systeem, nooit `console.log` direct

## TypeScript configuratie

Alle packages delen deze instellingen:
- `target: esnext`, `module: esnext`, `moduleResolution: bundler`
- `strict: false`, `isolatedModules: true`, `skipLibCheck: true`
- `isolatedDeclarations: true` (behalve `devices`)
- Path aliases voor dev-tijd cross-package imports: `@corewire/core/*` → `../core/src/*`, `@corewire/airplay/*` → `../airplay/src/*`, `@corewire/*` → `../*/src`
- Output: ESM (`.mjs` + `.d.mts`) per ingang in `dist`; audio-source bundelt ook `decode-worker.mjs` en de gedeelde decoderchunks

## Code conventions

- Zie `.editorconfig`: 4 spaties, single quotes, semicolons, LF, geen trailing comma's
- Private class fields met `#` prefix
- Arrow functions waar mogelijk
- Functieleden van een type of interface schrijf je als method signature (`open(signal: AbortSignal): Promise<T>;`), niet als property met een arrow type. `readonly` vervalt op die leden. Een callback als parameter mag een arrow type blijven.
- Listeners op een sessie of kanaal ruim je op via het `AbortSignal` van de sessie, niet met `#bound*` velden en handmatig `off()`
- `waitFor(ms)` voor delays in HID press/release
- Error klassen zetten altijd `this.name` in de constructor
- Geen verwijzingen naar pyatv, andere projecten of externe sites in code comments. Houd het feit en de reden, laat de bron weg.
- Alle exports via `packages/*/src/index.ts` of de `index.ts` van een subpath

## Protocolvalkuilen

### EventChannel key swap is bewust
`packages/airplay/src/channels/event.ts` leidt de keys omgedraaid af. De HKDF info-strings zijn benoemd vanuit het perspectief van de Apple TV:
- `Events-Write-Encryption-Key` = wat de Apple TV naar ons **schrijft** → wij gebruiken dit als **read** (decrypt) key
- `Events-Read-Encryption-Key` = wat de Apple TV van ons **leest** → wij gebruiken dit als **write** (encrypt) key

Bevestigd via pyatv (`ap2_session.py`: *"Read/Write info reversed here as connection originates from receiver!"*).

### Nonce formaten per protocol
- **Companion Link**: 12-byte LE counter op offset 0 (de counter is 8 bytes, trailing 4 bytes zijn zero)
- **AirPlay** (DataChannel/EventChannel): 4 zero bytes + 8-byte LE counter op offset 4

Beide formaten zijn bevestigd correct via pyatv's `Chacha20Cipher` (12-byte nonce_length) en `Chacha20Cipher8byteNonce` (4-byte pad + 8-byte counter). In code maakt `buildNonce(counter, format)` (`core/transport`) ze.

### Encrypted/plaintext buffer scheiding
`EncryptedChannel` (`packages/airplay/src/channels/encrypted.ts`, basis van DataChannel en EventChannel) en `RtspClient` (`packages/airplay/src/rtsp/client.ts`) gebruiken een aparte `#encryptedBuffer` voor inkomende TCP data en `#buffer` voor reeds-gedecrypte plaintext. Bij gedeeltelijke TCP-frames voorkomt dit dat nieuwe ciphertext bij plaintext terechtkomt. De ChaCha20-decoder zou die plaintext anders als frame-header lezen, met corruptie of een deadlock als gevolg.

### AirPlay receive-frames zijn niet begrensd op 1024 bytes
De encoder verstuurt chunks van 1024 bytes, maar receivers sturen ook grotere ChaCha20-blokken. Gebruik bij ontvangst de 2-byte LE lengte en de buffergrens van de stream; een 1024-byte parsergrens verbreekt de verbinding met Apple TV en HomePod. De lengte is AAD en de auth tag blijft verplicht.

### NTP timestamps moeten wall-clock zijn
`NTP.now()` in `packages/core/src/encoding/ntp.ts` moet `Date.now()` gebruiken (wall-clock ms sinds Unix epoch). `process.hrtime.bigint()` is een monotone klok (nanoseconden sinds processtart) en levert NTP timestamps op die ~50 jaar afwijken. De Apple TV compenseert met een constant offset, maar bij procesherstart verandert dit offset volledig.

## CI/CD

`.github/workflows/checks.yml` draait op pull requests en pushes naar main: `bash build.sh` (ook diagnostics), de pairing-test van core en de proxy smoke test. `.github/workflows/released.yml` (trigger: GitHub Release) vervangt `0.0.0` → release tag en `workspace:*` → versie, bouwt de vijf libraries en publiceert `core`, `airplay`, `companion-link`, `audio-source` en `devices` met `npm publish --provenance --access public`. Publiceren loopt via npm trusted publishing (OIDC, `id-token: write`), zonder `NPM_TOKEN`; de trust per package zet Bas zelf op npm. `diagnostics` is privé en wordt niet gepubliceerd.

## Tests en tooling

- Geautomatiseerde tests zijn uitgesteld tot een apart, grondig testtraject. Voeg voorlopig geen tests toe. Valideer wijzigingen met de builds, de twee testscripts hierboven en diagnostics.
- Handmatige device-tests lopen via diagnostics. Voor vergelijkingen met de productieversie: `tools/parity/capture.sh` en `tools/parity/compare.ts` (zie `docs/parity/HANDOFF.md`).
- Geen linter of formatter; stijlregels staan in `.editorconfig`.
- Geen Docker of `.env`-bestanden.
