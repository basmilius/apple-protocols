# Apple Protocols

CoreWire: een TypeScript monorepo voor Apple device protocollen (AirPlay 2, MRP, RAOP, Companion Link) onder de npm-scope `@corewire`. Bun workspace. De repository houdt voorlopig zijn naam.

De merknaam is **CoreWire** (hoofdletter C en W) in proza, titels, de website, README's, UI-teksten en standaardnamen. Packagenamen (`@corewire/*`), importpaden, het domein `corewire.dev` en identifiers blijven in kleine letters.

## Build

```bash
bash build.sh        # Bouwt alle packages in dependency-volgorde, diagnostics als laatste
```

Elke library gebruikt `tsgo --noEmit && tsdown` (type-check + bundel). Diagnostics gebruikt `tsgo --noEmit` + `electron-vite build`. `bun run pack` draait electron-builder (macOS arm64/x64, Linux arm64/x64, Windows x64).

`build.sh` bouwt diagnostics met `bun --cwd packages/diagnostics build:check` naar `packages/diagnostics/out-check/` (via de env `DIAGNOSTICS_OUT_DIR`). Zo herschrijft een controle nooit `out/` onder een draaiende dev-app. Dat gaf eerder "Cannot find module .../out/main/decode-worker.mjs". `build` en `pack` schrijven nog naar `out/`.

Na een wijziging zijn dit de controles, ook in CI:

```bash
rm -rf packages/*/dist && bash build.sh
bun run packages/core/test/pairing-server.ts          # pair-setup en pair-verify in geheugen
bun run packages/diagnostics/test/proxy-smoke.ts      # proxy-onderdelen aanmaken zonder sockets
bun --cwd website build                               # de documentatie op corewire.dev
```

Alle gepubliceerde packages hebben `engines.node` `^18.17.0 || >=20.3.0` (`AbortSignal.any` is de nieuwste API die de code gebruikt), een `README.md` en een `LICENSE`.

### Website

`website/` is de VitePress-site voor corewire.dev: guide, protocols en een reference per package. Elke export staat in de reference en elke genoemde naam bestaat. Na een API-wijziging pas je de reference, de guides, `README.md` en de README per package aan. De codevoorbeelden moeten type-checken tegen de bronnen met de path aliases van de repo.

Deploy: `wrangler.toml` in de root (Cloudflare Workers met static assets uit `website/.vitepress/dist`, custom domain corewire.dev). `.github/workflows/website.yml` bouwt en deployt bij een push naar `main` die `website/**` raakt, of handmatig.

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

Faalt stap 3, dan is er een breaking change in de publieke API. `audio-source` bundelt een `decode-worker.mjs` en gedeelde decoderchunks: kopieer altijd de hele `dist`. Kan de worker niet laden (`MODULE_NOT_FOUND`), dan decodeert `audio-source` op de aanroepende thread in plaats van te falen. `diagnostics` is alleen een consumer en hoeft niet mee.

## Packages (build-volgorde)

| Package                    | Pad                       | Doel                                                                                                     |
|----------------------------|---------------------------|----------------------------------------------------------------------------------------------------------|
| `@corewire/core`           | `packages/core`           | Protocolneutrale kern: codecs, crypto, transport, pairing, mDNS, foutklassen, logger                     |
| `@corewire/airplay`        | `packages/airplay`        | AirPlay 2 sessie en kanalen, URL-playback, audiostream, timing; MRP op `/mrp`, RAOP-sessie op `/raop`, RTSP op `/rtsp` |
| `@corewire/companion-link` | `packages/companion-link` | Companion Link sessie met groepen: HID, touch, text, power, apps, accounts, media, system, interests       |
| `@corewire/audio-source`   | `packages/audio-source`   | Audiobronnen en decoders: `Mp3Source`, `OggSource`, `WavSource`, `PcmSource`, `FileSource`, `UrlSource`, `FfmpegSource`, `LiveSource`, `SineWaveSource` |
| `@corewire/devices`        | `packages/devices`        | `AppleTV` en `HomePod` met herstel, capabilities, credentials, discovery, alle foutklassen; Apple Music op `/catalog` |
| `@corewire/diagnostics`    | `packages/diagnostics`    | Privé Electron app voor protocoldiagnostiek, met de proxy en de opslag erin (React 19 + Tailwind 4)      |

Subpaths van core: `@corewire/core/crypto`, `/discovery`, `/encoding`, `/pairing`, `/transport`. De hoofdingang heeft de foutklassen, `reporter`/`Logger` en `waitFor`. AirPlay-helpers (`HTTP_TIMEOUT`, `getMacAddress`, `randomInt32/64`, `uint16ToBE`) en de standaardidentiteit zitten intern in airplay. `core/crypto` heeft alleen namespaces (`AES`, `ChaCha20`, `Curve25519`, `Ed25519`, `HKDF`) plus de types `KeyPair` en `HKDFOptions`. Afkortingen staan in hoofdletters: `AES`, `ChaCha20`, `HKDF`, `DAAP`, `NTP`, `OPack`, `RTI`, `TLV8`. `DiscoverOptions` staat één keer in `core/discovery`; `DiscoveryResult` heeft `id`, `fqdn`, `address`, `txt` en `service` (het model komt uit `txt.model ?? txt.am`).

Audio-source-klassen eindigen op `Source`, zodat geen ervan een global als `File` of `URL` overschaduwt. Klassen met een factory (`fromPath`, `fromUrl`, `fromBuffer`) hebben een private constructor. De rest krijgt een options-object (`new SineWaveSource({duration})`, `new FfmpegSource({path, duration})`, `new LiveSource({bufferDuration})`, `new PcmSource(pcm, {sampleRate})`).

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
  ├── een map per capability    remote, nowPlaying, playback, volume, power, text, apps, multiroom, ...
  ├── @corewire/airplay         connect() → AirPlaySession
  │     ├── ControlChannel (RTSP), EventChannel, DataChannel
  │     ├── /mrp                MediaRemote.open(session), MediaRemoteState (model zonder I/O)
  │     ├── /raop               connect() → RaopSession (AirPlay 1 audio)
  │     ├── playUrl() / streamAudio()   eigen verbindingen binnen de package
  │     └── timing/             NTP TimingServer, PTP master
  └── @corewire/companion-link  connect() → CompanionLinkSession
        └── @corewire/core      pairing, transport, discovery, encoding, crypto
```

- `AppleTV` = AirPlay + Companion Link (remote, media, apps, accounts, power, text, touch, system). `HomePod` = alleen AirPlay. Er is geen `HomePodMini`; gebruik `device.model`.
- Je maakt een device van een doel (`{address, port?, txt?, id?}`) plus opties. Logger, credentials, timing, `resolve` en `identity` gaan mee als optie. Er is geen `configure()` en er zijn geen setters achteraf.
- Capabilities zijn interfaces (`NowPlayingControl`, `VolumeControl`, `PowerControl`, `TextControl`, `AppsControl`, `AccountsControl`, `SystemControl`, `TouchControl`, `RemoteControl`, `PlaybackControl`, `ArtworkControl`, `MediaControl`, `MultiroomControl`, `MediaPlayback`); de klassen erachter zijn intern. Lifecycle-methoden (`hold`, `resume`, `reset`) en constructors met `MediaRemoteState` of sessies zijn dus niet publiek. Capabilities met events extenden `EventEmitter<...EventMap>`. `AppleDevice` heeft één protected hook: `reset()`, aan het begin van `disconnect()`; `AppleTV` overschrijft hem voor power.
- `devices` is de foutgrens: het re-exporteert alle foutklassen van core, vertaalt `SendCommandError` naar `CommandRefusedError` (`reason` en `status` als string) en `/catalog` gooit `CatalogError` (`reason`, `status`). Een consumer importeert geen `Proto`-enums of core-fouten.
- De clientnaam is overal `CoreWire` (`DEFAULT_CLIENT_NAME` in `core/transport`) tenzij `identity.name` iets anders zegt: pair-setup M5, AirPlay SETUP, URL-playback (`clientProcName`), MRP device info en Companion Link `_systemInfo`. De RAOP-metadata zonder stream-metadata is `Streaming with CoreWire` / `CoreWire` / `AirPlay`, in te stellen met de `metadata`-optie van RAOP `connect()`. Bewust niet veranderd: `clientBundleID` `com.basmilius.apple-protocols`, de RAOP digest-username `apple-protocols` en de paden onder `~/.config/apple-protocols`.
- Ontwerp en afwijkingen: `docs/reports/package-structure.tsx` (goedgekeurd ontwerp) en `docs/parity/devices-api.md` (de devices API, sectie 0 voor wat anders werd).

## Patronen

### Sessies
`connect(target, options)` in `airplay` en `companion-link` geeft een sessie die klaar is: TCP, pair-verify (of transient pairing), encryptie en de startup. Een sessie leeft één keer en eindigt één keer met `closed(reason, error?)`, reden `local | remote | timeout | error`. Zijn `signal` (AbortSignal) gaat dan af en neemt timers, listeners, openstaande requests en kindkanalen mee. Een request op een gesloten sessie faalt met `ConnectionClosedError`, een request zonder antwoord met `TimeoutError`. RAOP volgt hetzelfde patroon: `connect(target, {timing, metadata?, password?, signal?})` op `/raop` geeft een `RaopSession` met `closed`, `signal`, `close()`, `setVolumeDb()` en `stream()`. De bytes op de lijn zijn gelijk aan de oude `RaopClient`.

Wachten tot iets klaar is heeft overal één vorm: `ended: Promise<void>` (`UrlPlayback`, `AudioPlayback`, `RaopPlayback`, `MediaPlayback` van devices). `UrlPlayback.ended` is lazy: pas de eerste read start de `/playback-info`-poll of de play queue watch.

Deadlines en timeouts draaien op `performance.now()` (monotoon): de keepalive van 30 s, de discovery-cache, play queue-extrapolatie en het glitch-venster van audio. Wall-clock blijft alleen waar de waarde op de lijn of naar buiten gaat: NTP- en PTP-timestamps, Cocoa-timestamps van MRP en `ProtocolStatus.nextAttemptAt`.

### Message sending (MRP via het AirPlay datakanaal)
Berichten worden gebouwd in `packages/airplay/src/mrp/messages.ts` en verstuurd via `DataChannel.exchange()` (request/response) of `DataChannel.send()` (fire-and-forget). Elk bericht is een `ProtocolMessage` wrapper met een protobuf extension. Beantwoordt een device een berichttype niet, dan hoort het een `send()` te zijn.

### State tracking
`MediaRemoteState` (`packages/airplay/src/mrp/state.ts`) is een model zonder I/O: je voedt het met `apply(name, message)`, live vanuit het datakanaal of uit opgenomen berichten via `decodeMessage()`. Het emit alleen afgeleide events (`nowPlayingChanged`, `volumeChanged`, `keyboardChanged`, `outputDevicesChanged`, ...). `CompanionLinkState` werkt hetzelfde. `devices` houdt per device één langlevend model en vergelijkt publieke waarden met wat het laatst aankondigde, zodat een herverbinding geen dubbele events geeft.

### Now playing hiërarchie
`MediaRemoteState` → `Client` (per bundleIdentifier) → `Player` (per playerPath). Client proxied getters naar de actieve Player. Player extrapoleert `elapsedTime` via Cocoa-timestamp + playbackRate. `devices` maakt daar een `NowPlaying` momentopname met eigen types van (`'playing' | 'paused' | ...`, `'off' | 'one' | 'all'`).

### HID events
Remote control via USB HID usage pages: Generic Desktop (0x01) voor navigatie, Consumer (0x0c) voor media. `MediaRemote.hid` (`packages/airplay/src/mrp/hid.ts`) heeft de toetsen en de primitieven `press`, `longPress` en `doublePress`. `device.remote.press(key, {mode})` kiest het protocol: een tap via AirPlay HID als de toets daar bestaat, hold en double via Companion Link als die verbonden is.

### Pairing
`PairSetup` (M1 tot M6, of M1 tot M4 transient) en `PairVerify` (Curve25519) in `packages/core/src/pairing/client.ts`, de accessoirekant (`PairSetupServer`, `PairVerifyServer`) in `server.ts`. Een protocol levert alleen een `PairingTransport`: een functie die één bericht verstuurt en het antwoord teruggeeft (HTTP-body bij AirPlay, OPack-frame bij Companion Link). `pair(target)` in `airplay` en `companion-link` start een PIN-pairing; `AppleTV.pair(target)` geeft een `Pairing` die `Credentials` oplevert. `Credentials` heeft één tekstvorm, `Credentials.parse()` leest ook de hex- en base64-objecten die Homey en de oude opslag bewaren, en `toFields()` schrijft dat hex-object voor opslag die een oudere release nog moet lezen. M5 stuurt `{name}` uit de identiteit, standaard `CoreWire`.

### Connection management
- `Connection<TEventMap>` (`core/transport`): TCP socket wrapper, verbindt één keer zonder retry, `keepAlive(true, 10s)`, eindigt via één `closed`-event met een reden.
- `EncryptionAwareConnection`: voegt `enableEncryption(readKey, writeKey)` toe met `EncryptionState` (keys + counters), voor subklassen leesbaar via de protected getter `encryption`. `buildNonce(counter, format)` maakt de nonce per protocol.
- Herstel zit alleen in `devices` (`packages/devices/src/lifecycle/`): per protocol een link met retries na 1, 2 en 4 s, daarna voor een Apple TV 15 pogingen elke 2 minuten en daarna elke 15 minuten, voor een HomePod elke 15 minuten. Nooit opgeven. Elke retry zoekt het device eerst opnieuw (unicast DNS-SD met een wake knock, dan de `resolve(last, signal)`-optie of een multicast scan). `resolve` krijgt een signal dat na 15 s of bij `disconnect()` afgaat. AirPlay en Companion Link doen elk hun eigen unicast query (afwijking B13 in `docs/parity/devices-api.md`). Verbindt het ene protocol terwijl het andere op een retry wacht, dan probeert het andere het meteen, ook in zijn fase van 2 of 15 minuten (`retryNow()`, ook bij een nieuw adres van AirPlay). Een mislukte poging telt als de poging die hij verving.
- Het device meldt één `status`-event met `disconnected | connecting | connected | degraded | recovering | offline`, een reden en de stand per protocol. `degraded`: AirPlay werkt, Companion Link nog niet. Een listener die gooit, stopt de andere listeners niet; de fout gaat naar de log.
- `disconnect()` reset meteen de aangekondigde waarden (now playing, volume, power, text, multiroom outputs) en beide modellen, meldt één `status` `disconnected` en wacht daarna op het sluiten van de sessies (Companion Link tot 10 s). `connect()` direct erna, ook zonder await, start een nieuwe poging.
- De gedeelde `TimingServer` telt zijn gebruikers: het eerste device dat zonder eigen `timing` verbindt start hem, het laatste dat `disconnect()` doet sluit hem. Een Node-script eindigt dus na `disconnect()`. Zijn logs gaan naar de `log`-optie van die devices (logger-id `timing-server`).

### Discovery (mDNS)
`Discovery` in `core/discovery` zoekt op een willekeurig servicetype; zelfgebouwde DNS encoder/decoder (geen deps), meerdere UDP sockets per netwerkinterface. `MdnsResponder` adverteert (gebruikt door de proxy). Elke protocolpackage heeft zijn eigen `discover()` en servicenaam; `discover()` uit `devices` voegt AirPlay, Companion Link en RAOP per host samen. `Discovery.wake(address, ports)` knocks op de poorten uit `WAKE_PORTS` (devices).

### Multiroom
`device.multiroom` (`packages/devices/src/multiroom/`) heeft `outputs` (eigen type `OutputDevice`: `uid`, `name`, `model`, `groupId`, `isLocal`, `isGroupLeader`, `hasVolumeControl`, geen protobuf) met een `change`-event, `add/remove/set(...uids)` en volume per output: `getVolume(uid)` (GET_VOLUME), `setVolume(uid, level)` (SET_VOLUME met de output-UID), `mute/unmute(uid)` (SET_VOLUME_MUTED). `change` vuurt alleen als de lijst verschilt van de laatst aangekondigde; de lijst overleeft een herverbinding en `disconnect()` wist hem. Zonder AirPlay gooien de methoden `UnavailableError`.

### Storage
Opslag hoort bij de app, niet bij de libraries. Diagnostics heeft `JsonStorage` in `packages/diagnostics/src/main/storage.ts` en schrijft naar `~/.config/apple-protocols/storage.json`. Nieuwe pairings gaan in de `Credentials`-tekstvorm. Bestaande entries leest hij zoals ze zijn.

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
bun run diag call woonkamer-tv device multiroom.outputs   # de output-UID's voor multiroom.getVolume/setVolume/mute
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

Het recept: `mark`, actie uitvoeren, `traffic`/`events`/`logs --since-mark` lezen, code aanpassen, `wait-ready`, herhalen. Een wijziging in `packages/*/src` herstart main vanzelf. De bridge verbindt de devices die via `connect` verbonden waren opnieuw. Cursors beginnen na een herstart weer bij 0, `--since-mark` vangt dat op.

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
- Agent calls gebruiken de expliciete actielijst in `src/main/agent/actions.ts`: acties op de root `device` (`remote.press`, `volume.*`, `playback.*`, `power.*`, `text.*`, `apps.*`, `accounts.*`, `touch.*`, `multiroom.getVolume`, `multiroom.setVolume`, `multiroom.mute`, `multiroom.unmute`) en een vaste lijst getters per root, waaronder `device multiroom.outputs` voor de output-UID's. Directe protocolmethoden zijn alleen via de app beschikbaar. `raw:send` valideert de catalogusargumenten en vereist `--confirm`. SDK-volume (ook per output) is 0 tot 1. RAOP neemt in diagnostics 0 tot 100 procent en zet dat met `pctToDbfs` om naar `volumeDb`; `raop:stream` komt terug zodra de audio loopt. Audio streaming gebruikt -144 tot 0 dB. Ongeldige argumenten worden ook met confirm geweigerd.
- Het Performance-paneel en `diag invoke performance:status` tonen eventloop p95/p99/max, piek sinds reset, RSS/heap/external en de retentie per capturebuffer. `performance:reset` wist de meetpiek. Audio toont de FFmpeg-buffer en pauzestatus; de pauzedrempel is één seconde PCM, met maximaal één extra stdout-chunk.
- Grenzen (`src/main/agent/guard.ts`): volume boven 0.5 (ook `multiroom.setVolume`), `volume.up`, `multiroom.unmute`, `proxy:start` en kanalen die credentials weggooien (`pair:forget`, `storage:remove*`) worden geweigerd tot de gebruiker akkoord is, daarna met `--confirm`. `storage:read` met `reveal` en `audio:pickFile` kunnen nooit. PIN-pairing vraagt de gebruiker: die leest de code van het scherm.
- Het device staat bij iemand thuis. Geen acties in een lus zonder reden, en zet terug wat je veranderde (volume, power, afspelen).

## Event systeem

Alle classes gebruiken Node.js `EventEmitter<EventMap>` (typed, geen custom wrapper). Patroon:
```ts
type EventMap = {
    eventName: [arg1Type, arg2Type];
};
class Foo extends EventEmitter<EventMap> { ... }
```

EventMaps zijn lokaal gedefinieerd per klasse. Een EventMap die consumers nodig hebben, wordt geëxporteerd (`MediaRemoteStateEventMap`, `CompanionLinkStateEventMap`, `DataChannelEventMap`, `EventChannelEventMap`, `RaopEventMap` op `/raop`, en in devices `NowPlayingEventMap`, `VolumeEventMap`, `PowerEventMap`, `TextEventMap` en `MultiroomEventMap`). Een geëxporteerde EventMap krijgt de naam van zijn domein, nooit een kale `EventMap`. Elke laag heeft zijn eigen events: een kanaal geeft berichten, een model maakt er statuswijzigingen van, het device geeft `status` en zijn capability-events. Geen laag geeft een event van een andere laag ongewijzigd door.

## Error hierarchie

```
AppleProtocolError                (packages/core/src/errors.ts)
├── ConnectionError
│   ├── ConnectionTimeoutError
│   └── ConnectionClosedError
│       └── SetupClosedError      (packages/companion-link/src/session.ts)
├── PairingError
│   ├── AuthenticationError
│   ├── CredentialsError
│   └── TLV8PairingError          (met `code`)
├── CommandError
│   ├── SendCommandError          (packages/airplay/src/mrp/commands.ts)
│   └── CommandRefusedError       (packages/devices/src/errors.ts)
├── SetupError
├── DiscoveryError
├── EncryptionError
│   └── DecryptionError
├── InvalidResponseError
├── TimeoutError
├── PlaybackError
├── UnavailableError              (packages/devices/src/errors.ts)
└── CatalogError                  (packages/devices/src/catalog/errors.ts)
```

Alles zonder pad staat in `packages/core/src/errors.ts`. `devices` re-exporteert alle foutklassen van core. `CommandRefusedError` vervangt aan de devices-grens de `SendCommandError` met `Proto`-enums door strings (`reason`, `status`). De oorspronkelijke fout zit in `cause`. `CatalogError` heeft `reason` (`invalidArgument | unauthorized | forbidden | requestFailed | invalidResponse | tooLarge`) en `status` (HTTP of null).

## Logging

Eigen twee-laags systeem in `packages/core/src/reporter.ts`:
- `Reporter` (singleton `reporter`): beheert debug-groepen (`debug`, `error`, `info`, `net`, `raw`, `warn`), `.all()` / `.none()` / `.enable(group)` / `.disable(group)`, plus `setSink()` en `setTrafficSink()`
- `Logger` (per device via `Context` uit `core/transport`): methoden `debug()`, `error()`, `info()`, `net()`, `raw()`, `warn()`, `traffic()` met ANSI-kleuren. Een optionele `LogSink` stuurt de entries per device door. `devices` gebruikt dat voor de `log`-optie.
- Productie-library code gebruikt alleen het Logger-systeem, nooit `console.log` direct

## TypeScript configuratie

Alle packages delen deze instellingen:
- `target: esnext`, `module: esnext`, `moduleResolution: bundler`
- `strict: false`, `isolatedModules: true`, `skipLibCheck: true`
- `isolatedDeclarations: true` (behalve `devices`)
- Path aliases voor dev-tijd cross-package imports: `@corewire/core/*` → `../core/src/*`, `@corewire/airplay/*` → `../airplay/src/*`, `@corewire/*` → `../*/src`
- Output: ESM (`.mjs` + `.d.mts`) per ingang in `dist`. Audio-source bundelt ook `decode-worker.mjs` en de gedeelde decoderchunks. De decoders draaien in die worker. Ontbreekt het bestand (`MODULE_NOT_FOUND`), dan decoderen ze op de aanroepende thread
- tsdown haalt het output-target uit `engines.node` (`^18.17.0 || >=20.3.0`)

## Code conventions

- Zie `.editorconfig`: 4 spaties, single quotes, semicolons, LF, geen trailing comma's
- Private class fields met `#` prefix
- Een top-level functie en een benoemd component zijn een `function`-declaratie. Een helper binnen een functie is een arrow function aan een `const`
- Een class-methode is een methode, nooit een arrow function als property. Bind hem waar je hem doorgeeft
- Functieleden van een type of interface schrijf je als method signature (`open(signal: AbortSignal): Promise<T>;`), niet als property met een arrow type. `readonly` vervalt op die leden. Een callback als parameter mag een arrow type blijven.
- Listeners op een sessie of kanaal ruim je op via het `AbortSignal` van de sessie, niet met `#bound*` velden en handmatig `off()`
- `waitFor(ms)` voor delays in HID press/release
- Error klassen zetten altijd `this.name` in de constructor
- Geen verwijzingen naar andere implementaties, projecten of externe sites in code comments en documentatie. Houd het feit en de reden, laat de bron weg.
- Alle exports via `packages/*/src/index.ts` of de `index.ts` van een subpath

## Protocolvalkuilen

### EventChannel key swap is bewust
`packages/airplay/src/channels/event.ts` leidt de keys omgedraaid af. De HKDF info-strings zijn benoemd vanuit het perspectief van de Apple TV:
- `Events-Write-Encryption-Key` = wat de Apple TV naar ons **schrijft** → wij gebruiken dit als **read** (decrypt) key
- `Events-Read-Encryption-Key` = wat de Apple TV van ons **leest** → wij gebruiken dit als **write** (encrypt) key

De reden: de event-verbinding gaat uit van de receiver, dus lezen en schrijven zijn omgedraaid.

### Nonce formaten per protocol
- **Companion Link**: 12-byte LE counter op offset 0 (de counter is 8 bytes, trailing 4 bytes zijn zero)
- **AirPlay** (DataChannel/EventChannel): 4 zero bytes + 8-byte LE counter op offset 4

In code maakt `buildNonce(counter, format)` (`core/transport`) ze: `counter-at-0` voor Companion Link, `counter-at-4` voor AirPlay.

### Encrypted/plaintext buffer scheiding
`EncryptedChannel` (`packages/airplay/src/channels/encrypted.ts`, basis van DataChannel en EventChannel) en `RtspClient` (`packages/airplay/src/rtsp/client.ts`) gebruiken een aparte `#encryptedBuffer` voor inkomende TCP data en `#buffer` voor reeds-gedecrypte plaintext. Bij gedeeltelijke TCP-frames voorkomt dit dat nieuwe ciphertext bij plaintext terechtkomt. De ChaCha20-decoder zou die plaintext anders als frame-header lezen, met corruptie of een deadlock als gevolg.

### AirPlay receive-frames zijn niet begrensd op 1024 bytes
De encoder verstuurt chunks van 1024 bytes, maar receivers sturen ook grotere ChaCha20-blokken. Gebruik bij ontvangst de 2-byte LE lengte en de buffergrens van de stream. Een 1024-byte parsergrens verbreekt de verbinding met Apple TV en HomePod. De lengte is AAD en de auth tag blijft verplicht.

### OPack-referenties volgen de tabel van het device
Een referentie (`0xA0` tot `0xC4`) wijst naar de n-de waarde in een tabel die encoder en decoder elk zelf opbouwen. Beide kanten moeten dezelfde waarden opnemen, anders wijst een index naar iets anders. In de tabel komen strings van minstens 1 byte, bytes van minstens 2 bytes, floats, datums, UUID's en integers buiten -1 tot 39 (ook in een vaste breedte). Arrays en dictionaries komen er nooit in. Integers zijn signed. Een gewoon negatief getal blijft 8 bytes (`0x33`), omdat devices dat altijd zo kregen. Meer dan 32 geneste containers weigert een device.

### NTP timestamps moeten wall-clock zijn
`NTP.now()` in `packages/core/src/encoding/ntp.ts` moet `Date.now()` gebruiken (wall-clock ms sinds Unix epoch). `process.hrtime.bigint()` is een monotone klok (nanoseconden sinds processtart) en levert NTP timestamps op die ~50 jaar afwijken. De Apple TV compenseert met een constant offset, maar bij procesherstart verandert dit offset volledig.

## CI/CD

`.github/workflows/checks.yml` draait op pull requests en pushes naar main: `bash build.sh` (ook diagnostics, naar `out-check/`), de pairing-test van core, de proxy smoke test en de build van de website. `.github/workflows/website.yml` bouwt de website en deployt hem met `cloudflare/wrangler-action` naar Cloudflare Workers (corewire.dev) bij een push naar `main` die `website/**`, `wrangler.toml` of de workflow raakt, of handmatig; secrets `CLOUDFLARE_API_TOKEN` en `CLOUDFLARE_ACCOUNT_ID`. `.github/workflows/released.yml` (trigger: GitHub Release) vervangt `0.0.0` → release tag en `workspace:*` → versie, bouwt de vijf libraries en publiceert `core`, `airplay`, `companion-link`, `audio-source` en `devices` met `npm publish --provenance --access public`. Publiceren loopt via npm trusted publishing (OIDC, `id-token: write`), zonder `NPM_TOKEN`; de trust per package zet Bas zelf op npm. `diagnostics` is privé en wordt niet gepubliceerd.

## Tests en tooling

- Geautomatiseerde tests zijn uitgesteld tot een apart, grondig testtraject. Voeg voorlopig geen tests toe. Valideer wijzigingen met de builds, de twee testscripts hierboven, de website-build en diagnostics.
- Handmatige device-tests lopen via diagnostics. Voor vergelijkingen met de productieversie: `tools/parity/capture.sh` en `tools/parity/compare.ts` (zie `docs/parity/HANDOFF.md`).
- Geen linter of formatter; stijlregels staan in `.editorconfig`.
- Geen Docker of `.env`-bestanden.
