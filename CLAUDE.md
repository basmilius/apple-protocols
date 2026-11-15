# CoreWire

CoreWire is a TypeScript monorepo for Apple device protocols (AirPlay 2, MRP, RAOP, Companion Link) under the npm scope `@corewire`. It is a Bun workspace. The repository keeps its name `apple-protocols` for now.

The brand name is **CoreWire** (capital C and W) in prose, titles, the docs site, READMEs, UI text and default names. Package names (`@corewire/*`), import paths, the domain `corewire.dev` and identifiers stay lowercase.

## Build

```bash
bash build.sh        # Builds all packages in dependency order, diagnostics last
```

Every library uses `tsgo --noEmit && tsdown` (type check + bundle). Diagnostics uses `tsgo --noEmit` + `electron-vite build`. `bun run pack` runs electron-builder (macOS arm64/x64, Linux arm64/x64, Windows x64).

`build.sh` builds diagnostics with `bun --cwd packages/diagnostics build:check` into `packages/diagnostics/out-check/` (through the env `DIAGNOSTICS_OUT_DIR`). That way a check never rewrites `out/` under a running dev app. Before this change it caused "Cannot find module .../out/main/decode-worker.mjs". `build` and `pack` still write to `out/`.

After a change, run these checks. CI runs them too:

```bash
rm -rf packages/*/dist && bash build.sh
bun run packages/core/test/pairing-server.ts          # pair-setup and pair-verify in memory
bun run packages/diagnostics/test/proxy-smoke.ts      # create the proxy parts without sockets
bun --cwd docs build                                  # the documentation on corewire.dev
```

All published packages have `engines.node` `^18.17.0 || >=20.3.0` (`AbortSignal.any` is the newest API the code uses), a `README.md` and a `LICENSE`.

### Docs

`docs/` is the VitePress site for corewire.dev: guide, protocols and a reference per package. Every export appears in the reference and every name the docs mention exists. After an API change, update the reference, the guides, `README.md` and the README of each affected package. The code examples must type check against the sources with the repo's path aliases.

Deploy: `wrangler.toml` in the root (Cloudflare Workers with static assets from `docs/.vitepress/dist`, custom domain corewire.dev). The release workflow deploys the docs as well. A regular release puts them live. A prerelease only uploads a version tagged `prerelease-<version>`, without traffic. `.github/workflows/docs.yml` deploys manually from `main`, for a fix between two releases. A local deploy works too: `bun --cwd docs build && bunx wrangler@4.141.0 deploy`.

### Generate protobuf

```bash
bun --cwd packages/airplay gen:proto   # buf generate → packages/airplay/src/mrp/proto/
```

155 `.proto` files in `packages/airplay/proto/`. Tooling: `@bufbuild/buf` + `@bufbuild/protoc-gen-es` + `@bufbuild/protobuf`.

## Validation against the Homey app

The Homey app (`~/Development/Projects/homey/com.basmilius.apple`) is the main consumer. It imports only `@corewire/devices` and `@corewire/audio-source`, from npm, pinned to `1.0.0-next.1` (dist-tag `next`). The app must keep building after every change here:

```bash
# 1. Build the libraries
bash build.sh

# 2. Copy the built packages into the app and type check it
bun --cwd ~/Development/Projects/homey/com.basmilius.apple run corewire:local
bun --cwd ~/Development/Projects/homey/com.basmilius.apple run build
```

`corewire:local` copies the built packages into the app's `node_modules` as version `0.0.0-local`. The next `bun install` in the app restores the npm version. If the build fails, the public API has a breaking change. `audio-source` bundles a `decode-worker.mjs` and shared decoder chunks. If the worker cannot load (`MODULE_NOT_FOUND`), `audio-source` decodes on the calling thread instead of failing. `diagnostics` is only a consumer and does not need to be copied.

## Packages (build order)

| Package                    | Path                      | Purpose                                                                                                  |
|----------------------------|---------------------------|----------------------------------------------------------------------------------------------------------|
| `@corewire/core`           | `packages/core`           | Protocol neutral core: codecs, crypto, transport, pairing, mDNS, error classes, logger                   |
| `@corewire/airplay`        | `packages/airplay`        | AirPlay 2 session and channels, URL playback, audio stream, timing; MRP on `/mrp`, RAOP session on `/raop`, RTSP on `/rtsp` |
| `@corewire/companion-link` | `packages/companion-link` | Companion Link session with groups: HID, touch, text, power, apps, accounts, media, system, interests   |
| `@corewire/audio-source`   | `packages/audio-source`   | Audio sources and decoders: `Mp3Source`, `OggSource`, `WavSource`, `PcmSource`, `FileSource`, `UrlSource`, `FfmpegSource`, `LiveSource`, `SineWaveSource` |
| `@corewire/devices`        | `packages/devices`        | `AppleTV` and `HomePod` with recovery, capabilities, credentials, discovery, all error classes; Apple Music on `/catalog` |
| `@corewire/diagnostics`    | `packages/diagnostics`    | Private Electron app for protocol diagnostics, with the proxy and the storage inside (React 19 + Tailwind 4) |

Subpaths of core: `@corewire/core/crypto`, `/discovery`, `/encoding`, `/pairing`, `/transport`. The main entry has the error classes, `reporter`/`Logger` and `waitFor`. AirPlay helpers (`HTTP_TIMEOUT`, `getMacAddress`, `randomInt32/64`, `uint16ToBE`) and the default identity are internal to airplay. `core/crypto` has only namespaces (`AES`, `ChaCha20`, `Curve25519`, `Ed25519`, `HKDF`) plus the types `KeyPair` and `HKDFOptions`. Abbreviations are uppercase: `AES`, `ChaCha20`, `HKDF`, `DAAP`, `NTP`, `OPack`, `RTI`, `TLV8`. `DiscoverOptions` exists once, in `core/discovery`. `DiscoveryResult` has `id`, `fqdn`, `address`, `txt` and `service` (the model comes from `txt.model ?? txt.am`).

Audio source classes end in `Source`, so none of them shadows a global such as `File` or `URL`. Classes with a factory (`fromPath`, `fromUrl`, `fromBuffer`) have a private constructor. The others take an options object (`new SineWaveSource({duration})`, `new FfmpegSource({path, duration})`, `new LiveSource({bufferDuration})`, `new PcmSource(pcm, {sampleRate})`).

## Dependency graph

```
core              (no internal deps)
airplay           → core
companion-link    → core
audio-source      → core (plus the AudioSource type from airplay, as a devDependency only)
devices           → core, airplay, companion-link
diagnostics       → devices + all protocol packages
```

A protocol package depends only on `core`, never on another protocol. `devices` is the only place where two protocols meet. All internal deps use `workspace:*`. On release, CI replaces it with the release version through `sed`.

## Architecture

```
devices (AppleTV, HomePod)
  ├── lifecycle/                link per protocol, retry schedule, re-resolve, status
  ├── one folder per capability remote, nowPlaying, playback, volume, power, text, apps, multiroom, ...
  ├── @corewire/airplay         connect() → AirPlaySession
  │     ├── ControlChannel (RTSP), EventChannel, DataChannel
  │     ├── /mrp                MediaRemote.open(session), MediaRemoteState (model without I/O)
  │     ├── /raop               connect() → RaopSession (AirPlay 1 audio)
  │     ├── playUrl() / streamAudio()   own connections inside the package
  │     └── timing/             NTP TimingServer, PTP master
  └── @corewire/companion-link  connect() → CompanionLinkSession
        └── @corewire/core      pairing, transport, discovery, encoding, crypto
```

- `AppleTV` = AirPlay + Companion Link (remote, media, apps, accounts, power, text, touch, system). `HomePod` = AirPlay only. There is no `HomePodMini`; use `device.model`.
- You create a device from a target (`{address, port?, txt?, id?}`) plus options. Logger, credentials, timing, `resolve` and `identity` are options. There is no `configure()` and there are no setters afterwards.
- Capabilities are interfaces (`NowPlayingControl`, `VolumeControl`, `PowerControl`, `TextControl`, `AppsControl`, `AccountsControl`, `SystemControl`, `TouchControl`, `RemoteControl`, `PlaybackControl`, `ArtworkControl`, `MediaControl`, `MultiroomControl`, `MediaPlayback`); the classes behind them are internal. Lifecycle methods (`hold`, `resume`, `reset`) and constructors that take `MediaRemoteState` or sessions are therefore not public. Capabilities with events extend `EventEmitter<...EventMap>`. `AppleDevice` has one protected hook: `reset()`, at the start of `disconnect()`. `AppleTV` overrides it for power.
- `devices` is the error boundary. It re-exports all error classes of core, translates `SendCommandError` into `CommandRefusedError` (`reason` and `status` as strings), and `/catalog` throws `CatalogError` (`reason`, `status`). A consumer imports no `Proto` enums or core errors.
- The client name is `CoreWire` everywhere (`DEFAULT_CLIENT_NAME` in `core/transport`) unless `identity.name` says otherwise: pair-setup M5, AirPlay SETUP, URL playback (`clientProcName`), MRP device info and Companion Link `_systemInfo`. The RAOP metadata without stream metadata is `Streaming with CoreWire` / `CoreWire` / `AirPlay`, configurable with the `metadata` option of RAOP `connect()`. Deliberately unchanged: `clientBundleID` `com.basmilius.apple-protocols`, the RAOP digest username `apple-protocols` and the paths under `~/.config/apple-protocols`.
- Design and deviations: `.research/reports/package-structure.tsx` (approved design) and `.research/parity/devices-api.md` (the devices API, section 0 for what changed). `.research/` is a local folder that git ignores. It holds working notes and exists only on the owner's machine.

## Patterns

### Sessions
`connect(target, options)` in `airplay` and `companion-link` returns a session that is ready: TCP, pair-verify (or transient pairing), encryption and the startup. A session lives once and ends once with `closed(reason, error?)`, reason `local | remote | timeout | error`. Its `signal` (AbortSignal) then fires and takes timers, listeners, open requests and child channels with it. A request on a closed session fails with `ConnectionClosedError`, a request without an answer with `TimeoutError`. RAOP follows the same pattern: `connect(target, {timing, metadata?, password?, signal?})` on `/raop` returns a `RaopSession` with `closed`, `signal`, `close()`, `setVolumeDb()` and `stream()`. The bytes on the wire are the same as those of the old `RaopClient`.

Waiting for something to finish has one shape everywhere: `ended: Promise<void>` (`UrlPlayback`, `AudioPlayback`, `RaopPlayback`, `MediaPlayback` in devices). `UrlPlayback.ended` is lazy. Only the first read starts the `/playback-info` poll or the play queue watch.

Deadlines and timeouts run on `performance.now()` (monotonic): the 30 s keepalive, the discovery cache, play queue extrapolation and the audio glitch window. Wall clock stays only where the value goes on the wire or leaves the process: NTP and PTP timestamps, MRP Cocoa timestamps and `ProtocolStatus.nextAttemptAt`.

### Message sending (MRP over the AirPlay data channel)
`packages/airplay/src/mrp/messages.ts` builds the messages. They go out through `DataChannel.exchange()` (request/response) or `DataChannel.send()` (fire and forget). Every message is a `ProtocolMessage` wrapper with a protobuf extension. If a device does not answer a message type, that message should be a `send()`.

### State tracking
`MediaRemoteState` (`packages/airplay/src/mrp/state.ts`) is a model without I/O. You feed it with `apply(name, message)`, live from the data channel or from recorded messages through `decodeMessage()`. It emits only derived events (`nowPlayingChanged`, `volumeChanged`, `keyboardChanged`, `outputDevicesChanged`, ...). `CompanionLinkState` works the same way. `devices` keeps one long lived model per device and compares public values with what it last announced, so a reconnect does not produce duplicate events.

### Now playing hierarchy
`MediaRemoteState` → `Client` (per bundleIdentifier) → `Player` (per playerPath). Client proxies getters to the active Player. Player extrapolates `elapsedTime` from the Cocoa timestamp + playbackRate. `devices` turns that into a `NowPlaying` snapshot with its own types (`'playing' | 'paused' | ...`, `'off' | 'one' | 'all'`).

### HID events
Remote control uses USB HID usage pages: Generic Desktop (0x01) for navigation, Consumer (0x0c) for media. `MediaRemote.hid` (`packages/airplay/src/mrp/hid.ts`) has the keys and the primitives `press`, `longPress` and `doublePress`. `device.remote.press(key, {mode})` picks the protocol: a tap goes through AirPlay HID if the key exists there, hold and double go through Companion Link if it is connected.

### Pairing
`PairSetup` (M1 to M6, or M1 to M4 transient) and `PairVerify` (Curve25519) live in `packages/core/src/pairing/client.ts`, the accessory side (`PairSetupServer`, `PairVerifyServer`) in `server.ts`. A protocol supplies only a `PairingTransport`: a function that sends one message and returns the answer (HTTP body for AirPlay, OPack frame for Companion Link). `pair(target)` in `airplay` and `companion-link` starts a PIN pairing; `AppleTV.pair(target)` returns a `Pairing` that yields `Credentials`. `Credentials` has one text form. `Credentials.parse()` also reads the hex and base64 objects that Homey and the old storage keep, and `toFields()` writes that hex object for storage that an older release still has to read. M5 sends `{name}` from the identity, `CoreWire` by default.

### Connection management
- `Connection<TEventMap>` (`core/transport`): TCP socket wrapper. It connects once without retry, uses `keepAlive(true, 10s)` and ends through one `closed` event with a reason.
- `EncryptionAwareConnection`: adds `enableEncryption(readKey, writeKey)` with `EncryptionState` (keys + counters), readable for subclasses through the protected getter `encryption`. `buildNonce(counter, format)` builds the nonce per protocol.
- Recovery lives only in `devices` (`packages/devices/src/lifecycle/`). Each protocol has a link that retries after 1, 2 and 4 s. After that an Apple TV makes 15 attempts every 2 minutes and then tries every 15 minutes; a HomePod tries every 15 minutes. It never gives up. Every retry first looks up the device again (unicast DNS-SD with a wake knock, then the `resolve(last, signal)` option or a multicast scan). `resolve` gets a signal that fires after 15 s or on `disconnect()`. AirPlay and Companion Link each run their own unicast query (deviation B13 in `.research/parity/devices-api.md`). If one protocol connects while the other waits for a retry, the other tries right away, also in its 2 or 15 minute phase (`retryNow()`, also when AirPlay finds a new address). A failed attempt counts as the attempt it replaced.
- The device reports one `status` event with `disconnected | connecting | connected | degraded | recovering | offline`, a reason and the state per protocol. `degraded`: AirPlay works, Companion Link does not yet. A listener that throws does not stop the other listeners; the error goes to the log.
- `disconnect()` resets the announced values (now playing, volume, power, text, multiroom outputs) and both models right away, reports one `status` `disconnected`, and then waits for the sessions to close (Companion Link up to 10 s). A `connect()` right after it, even without await, starts a new attempt.
- The shared `TimingServer` counts its users. The first device that connects without its own `timing` starts it, the last one to call `disconnect()` closes it. A Node script therefore exits after `disconnect()`. Its logs go to the `log` option of those devices (logger id `timing-server`).

### Discovery (mDNS)
`Discovery` in `core/discovery` searches for any service type. It has its own DNS encoder/decoder (no deps) and opens several UDP sockets per network interface. `MdnsResponder` advertises (the proxy uses it). Every protocol package has its own `discover()` and service name; `discover()` from `devices` merges AirPlay, Companion Link and RAOP per host. `Discovery.wake(address, ports)` knocks on the ports from `WAKE_PORTS` (devices).

### Multiroom
`device.multiroom` (`packages/devices/src/multiroom/`) has `outputs` (its own type `OutputDevice`: `uid`, `name`, `model`, `groupId`, `isLocal`, `isGroupLeader`, `hasVolumeControl`, no protobuf) with a `change` event, `add/remove/set(...uids)` and volume per output: `getVolume(uid)` (GET_VOLUME), `setVolume(uid, level)` (SET_VOLUME with the output UID), `mute/unmute(uid)` (SET_VOLUME_MUTED). `change` fires only when the list differs from the last announced one. The list survives a reconnect and `disconnect()` clears it. Without AirPlay the methods throw `UnavailableError`.

### Storage
Storage belongs to the app, not to the libraries. Diagnostics has `JsonStorage` in `packages/diagnostics/src/main/storage.ts` and writes to `~/.config/apple-protocols/storage.json`. New pairings are stored in the `Credentials` text form. It reads existing entries as they are.

## Diagnostics app

`packages/diagnostics`: `src/main` (Electron main), `src/preload`, `src/renderer` (React), `src/shared` (IPC contract). The `@corewire/*` deps are in `devDependencies` on purpose: electron-vite externalizes `dependencies`, and then the alias to `../*/src` stops working.

- Several devices at once: `SessionManager` (`src/main/session.ts`) keeps a `DeviceSession` per device, with one shared `TimingServer` and a save queue around `JsonStorage`.
- Diagnostics runs only on the public APIs. `device:call { deviceId, root, path, args }` calls a path on one of the roots `device` (the `AppleTV`/`HomePod` object), `airplay`, `mediaRemote` and `companionLink` (the sessions from `device.sessions`). Without `args` it reads a getter. It cannot call setters.
- Contract per domain: `contract.ts` (core), `contract.media.ts` (pair, audio, raop, raw, recovery, catalog), `contract.tools.ts` (tool, storage, mdns, proxy). Handlers live in `src/main/channels/<domain>`. To add a channel: map + channel list in the contract file, handler in the channels module.
- The proxy lives in `src/main/proxy/` (AirPlay and Companion Link, with a `ProxyStore` for its identity), with a panel and the channels `proxy:status|start|stop`. Its traffic lands in the traffic buffer as protocol `proxy`, under the device it relays to. `src/main/discovery.ts` keeps its own copy of the discovery merge, because the panels show the raw results.
- To add a panel: a folder under `src/renderer/panels/<id>/` plus a line in `registry.sdk.ts`, `registry.media.ts` or `registry.tools.ts`. A device panel also gets a place in `PANEL_SECTIONS` (`registry.ts`): Device, Control, Streaming or Inspect.
- Shared building blocks live in `src/renderer/ui/` (among them `Section`, `KeyValue`, `StatusPill`, `StatusBar`, `ICONS`) and `panels/sdk-shared` (`EventFeed`, `PanelLink`, `NotConnected`, `ResultBlock`).
- Logs come in through `reporter.setSink()` (core) with a `deviceId`, without console patching.
- Statistics live in `src/main/statistics.ts`: counters per device in 2 second intervals, with 30 minutes of history. `statistics:history` delivers the charts and totals. The counters are separate from the bounded log and traffic buffers and keep counting while the panel is closed. A restart of main clears the history.
- Agent bridge in `src/main/agent/` (`server.ts`, `guard.ts`, `resume.ts`, `actions.ts`), CLI in `cli/diag.ts`, shared types in `src/shared/agent.ts`. `handle()` also registers every handler for `invoke()` in `ipc.ts`, so a new channel is available to the agent automatically. The bridge is on in dev, or with `--agent` / `DIAGNOSTICS_AGENT=1`.
- The shell (`src/renderer/shell`) is built on `Workspace` from `@adecore/ui`: device switcher in the top row, sidebar with the panels of the selected device, rail with the log console and tools as a side panel. One panel is visible at a time; `state/layout.ts` remembers which one per device.

## Debugging against a real device (agent loop)

The diagnostics app has an agent bridge: an HTTP server on loopback that offers all invoke channels of the contract, plus the log, event and traffic buffers. `diag` is its CLI. The user starts the app with `bun --cwd packages/diagnostics dev:agent` (`electron-vite dev --watch`). Never start it yourself. If `diag` reports that the bridge is not running, ask the user to start it.

```bash
bun run diag wait-ready                          # wait for the app and for devices to reconnect
bun run diag devices --scan                      # <device> is then an id or part of the name
bun run diag connect woonkamer-tv
bun run diag mark                                # remember the current cursors
bun run diag call woonkamer-tv device remote.press up
bun run diag call woonkamer-tv device remote.press select '{"mode":"hold"}'
bun run diag call woonkamer-tv device status     # without args: read a getter
bun run diag call woonkamer-tv mediaRemote state.volume
bun run diag call woonkamer-tv device multiroom.outputs   # the output UIDs for multiroom.getVolume/setVolume/mute
bun run diag traffic --since-mark --decoded      # what went over the wire
bun run diag events --since-mark --source dataStream
bun run diag logs --since-mark --group error
bun run diag wait events --name volume.change --timeout 10
```

Connecting, step by step:

1. `wait-ready` reads the port and token from `~/.config/apple-protocols/diagnostics-agent.json`. That file exists only while the app runs.
2. `devices --scan` fills the discovery. `connect` works only on a device from the last scan.
3. `<device>` must match exactly one device. "Woonkamer" matches three, so use `Woonkamer-TV` or the id. The error message lists the candidates.
4. `connect` uses the credentials from `storage.json`. An Apple TV without credentials must be paired first (`pair:start`, the user enters the PIN). A HomePod connects without them.
5. `connect` sets up AirPlay and then Companion Link, and returns the snapshot. Check with `status` or `snapshot <device>`.

If it gets stuck, read the traffic before the code. `traffic --limit 60` shows where the handshake stops, `logs --group error` shows the error. Look up an `Exchange timed out for <uuid>` with `traffic --grep <uuid> --decoded`. If only an outgoing message shows up, the device does not answer that message type and it should be a `send()`. Put `timeout 20` in front of a command that may hang.

The recipe: `mark`, perform the action, read `traffic`/`events`/`logs --since-mark`, change the code, `wait-ready`, repeat. A change in `packages/*/src` restarts main automatically. The bridge reconnects the devices that were connected through `connect`. Cursors start at 0 again after a restart; `--since-mark` handles that.

Recovery and proxy:

```bash
bun run diag invoke recovery:status '{"deviceId":"<id>"}'                         # status of the device, per protocol
bun run diag invoke recovery:simulateDrop '{"deviceId":"<id>","stream":"data"}'   # control, data, event or companionLink
bun run diag proxy status                                                          # running proxies, with PIN and counts
bun run diag proxy start woonkamer-tv airplay --confirm                            # only after the user agrees
bun run diag proxy stop airplay
```

- Output is compact. `--decoded` shows the decoded messages, `--json` the whole record, and `--grep`, `--limit` and `--protocol`/`--direction`/`--source`/`--name`/`--group` filter. Binary values are cut off at 64 bytes; `--bytes <n>` or `--full` removes that limit. Always filter first: artwork alone is hundreds of kilobytes.
- Event sources: `device` (the `status` event), `state` (capability events such as `nowPlaying.change`, `volume.change`, `power.change`, `text.change`), `airplayState` (the MRP model), `dataStream`, `eventStream` and `companionLink`.
- Traffic is plaintext (after decryption, before encryption). It comes from `logger.traffic()` in `DataChannel`, `EventChannel`, Companion Link `stream.ts` and `RtspClient` (so also the AirPlay control channel and RAOP), plus the proxy. RTP audio packets are not in it. A new tap point is a `logger.traffic()` call; without a sink (Homey) it does nothing.
- Agent calls use the explicit action list in `src/main/agent/actions.ts`: actions on the root `device` (`remote.press`, `volume.*`, `playback.*`, `power.*`, `text.*`, `apps.*`, `accounts.*`, `touch.*`, `multiroom.getVolume`, `multiroom.setVolume`, `multiroom.mute`, `multiroom.unmute`) and a fixed list of getters per root, among them `device multiroom.outputs` for the output UIDs. Direct protocol methods are available only through the app. `raw:send` validates the catalog arguments and requires `--confirm`. SDK volume (also per output) is 0 to 1. In diagnostics RAOP takes 0 to 100 percent and converts that with `pctToDbfs` to `volumeDb`; `raop:stream` returns as soon as the audio runs. Audio streaming uses -144 to 0 dB. Invalid arguments are refused even with confirm.
- The Performance panel and `diag invoke performance:status` show event loop p95/p99/max, the peak since reset, RSS/heap/external and the retention per capture buffer. `performance:reset` clears the measured peak. Audio shows the FFmpeg buffer and the pause state. The pause threshold is one second of PCM, with at most one extra stdout chunk.
- Limits (`src/main/agent/guard.ts`): volume above 0.5 (also `multiroom.setVolume`), `volume.up`, `multiroom.unmute`, `proxy:start` and channels that discard credentials (`pair:forget`, `storage:remove*`) are refused until the user agrees, and after that need `--confirm`. `storage:read` with `reveal` and `audio:pickFile` are never allowed. PIN pairing needs the user, who reads the code from the screen.
- The device is in someone's home. Do not run actions in a loop without a reason, and restore what you changed (volume, power, playback).

## Event system

All classes use Node.js `EventEmitter<EventMap>` (typed, no custom wrapper). Pattern:
```ts
type EventMap = {
    eventName: [arg1Type, arg2Type];
};
class Foo extends EventEmitter<EventMap> { ... }
```

Each class defines its EventMap locally. An EventMap that consumers need is exported (`MediaRemoteStateEventMap`, `CompanionLinkStateEventMap`, `DataChannelEventMap`, `EventChannelEventMap`, `RaopEventMap` on `/raop`, and in devices `NowPlayingEventMap`, `VolumeEventMap`, `PowerEventMap`, `TextEventMap` and `MultiroomEventMap`). An exported EventMap is named after its domain, never a bare `EventMap`. Every layer has its own events: a channel emits messages, a model turns them into state changes, the device emits `status` and its capability events. No layer passes on an event of another layer unchanged.

## Error hierarchy

```
AppleProtocolError                (packages/core/src/errors.ts)
├── ConnectionError
│   ├── ConnectionTimeoutError
│   └── ConnectionClosedError
│       └── SetupClosedError      (packages/companion-link/src/session.ts)
├── PairingError
│   ├── AuthenticationError
│   ├── CredentialsError
│   └── TLV8PairingError          (with `code`)
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

Everything without a path lives in `packages/core/src/errors.ts`. `devices` re-exports all error classes of core. At the devices boundary, `CommandRefusedError` replaces the `SendCommandError` with `Proto` enums by strings (`reason`, `status`). The original error is in `cause`. `CatalogError` has `reason` (`invalidArgument | unauthorized | forbidden | requestFailed | invalidResponse | tooLarge`) and `status` (HTTP or null).

## Logging

A custom two layer system in `packages/core/src/reporter.ts`:
- `Reporter` (singleton `reporter`): manages debug groups (`debug`, `error`, `info`, `net`, `raw`, `warn`), `.all()` / `.none()` / `.enable(group)` / `.disable(group)`, plus `setSink()` and `setTrafficSink()`
- `Logger` (per device through `Context` from `core/transport`): methods `debug()`, `error()`, `info()`, `net()`, `raw()`, `warn()`, `traffic()` with ANSI colors. An optional `LogSink` forwards the entries per device. `devices` uses that for the `log` option.
- Production library code uses only the Logger system, never `console.log` directly

## TypeScript configuration

All packages share these settings:
- `target: esnext`, `module: esnext`, `moduleResolution: bundler`
- `strict: false`, `isolatedModules: true`, `skipLibCheck: true`
- `isolatedDeclarations: true` (except `devices`)
- Path aliases for dev time cross package imports: `@corewire/core/*` → `../core/src/*`, `@corewire/airplay/*` → `../airplay/src/*`, `@corewire/*` → `../*/src`
- Output: ESM (`.mjs` + `.d.mts`) per entry in `dist`. Audio-source also bundles `decode-worker.mjs` and the shared decoder chunks. The decoders run in that worker. If the file is missing (`MODULE_NOT_FOUND`), they decode on the calling thread
- tsdown takes the output target from `engines.node` (`^18.17.0 || >=20.3.0`)

## Code conventions

- See `.editorconfig`: 4 spaces, single quotes, semicolons, LF, no trailing commas
- Private class fields with a `#` prefix
- A top level function and a named component are a `function` declaration. A helper inside a function is an arrow function assigned to a `const`
- A class method is a method, never an arrow function as a property. Bind it where you pass it on
- Write function members of a type or interface as a method signature (`open(signal: AbortSignal): Promise<T>;`), not as a property with an arrow type. `readonly` drops off those members. A callback as a parameter may stay an arrow type.
- Clean up listeners on a session or channel through the session's `AbortSignal`, not with `#bound*` fields and a manual `off()`
- `waitFor(ms)` for delays in HID press/release
- Error classes always set `this.name` in the constructor
- No references to other implementations, projects or external sites in code comments and documentation. Keep the fact and the reason, leave out the source.
- All exports go through `packages/*/src/index.ts` or the `index.ts` of a subpath

## Protocol pitfalls

### The EventChannel key swap is deliberate
`packages/airplay/src/channels/event.ts` derives the keys swapped. The HKDF info strings are named from the Apple TV's perspective:
- `Events-Write-Encryption-Key` = what the Apple TV **writes** to us → we use it as the **read** (decrypt) key
- `Events-Read-Encryption-Key` = what the Apple TV **reads** from us → we use it as the **write** (encrypt) key

The reason: the receiver opens the event connection, so read and write are swapped.

### Nonce formats per protocol
- **Companion Link**: 12 byte LE counter at offset 0 (the counter is 8 bytes, the trailing 4 bytes are zero)
- **AirPlay** (DataChannel/EventChannel): 4 zero bytes + 8 byte LE counter at offset 4

In code, `buildNonce(counter, format)` (`core/transport`) builds them: `counter-at-0` for Companion Link, `counter-at-4` for AirPlay.

### Separate encrypted and plaintext buffers
`EncryptedChannel` (`packages/airplay/src/channels/encrypted.ts`, the base of DataChannel and EventChannel) and `RtspClient` (`packages/airplay/src/rtsp/client.ts`) use a separate `#encryptedBuffer` for incoming TCP data and `#buffer` for plaintext that is already decrypted. With partial TCP frames this keeps new ciphertext from ending up next to plaintext. Otherwise the ChaCha20 decoder would read that plaintext as a frame header, which causes corruption or a deadlock.

### AirPlay receive frames are not limited to 1024 bytes
The encoder sends chunks of 1024 bytes, but receivers also send larger ChaCha20 blocks. On receive, use the 2 byte LE length and the buffer boundary of the stream. A 1024 byte parser limit breaks the connection with Apple TV and HomePod. The length is AAD and the auth tag stays mandatory.

### OPack references follow the device's table
A reference (`0xA0` to `0xC4`) points to the nth value in a table that the encoder and the decoder each build themselves. Both sides must record the same values, or an index points to something else. The table holds strings of at least 1 byte, bytes of at least 2 bytes, floats, dates, UUIDs and integers outside -1 to 39 (also in a fixed width). Arrays and dictionaries never go in. Integers are signed. A plain negative number stays 8 bytes (`0x33`), because devices always received it that way. A device refuses more than 32 nested containers.

### NTP timestamps must be wall clock
`NTP.now()` in `packages/core/src/encoding/ntp.ts` must use `Date.now()` (wall clock ms since the Unix epoch). `process.hrtime.bigint()` is a monotonic clock (nanoseconds since process start) and yields NTP timestamps that are off by ~50 years. The Apple TV compensates with a constant offset, but a process restart changes that offset completely.

## CI/CD

`.github/workflows/checks.yml` runs on pull requests and pushes to main: `bash build.sh` (diagnostics included, into `out-check/`), the pairing test of core, the proxy smoke test and the docs build. `.github/workflows/released.yml` (trigger: every published GitHub Release) replaces `"0.0.0"` → version (the tag without `v`) and `workspace:*` → version, builds the five libraries and publishes `core`, `airplay`, `companion-link`, `audio-source` and `devices` with `npm publish --provenance --access public`, under dist-tag `next` for a prerelease and `latest` for a regular release. Then it deploys the docs with `cloudflare/wrangler-action` to Cloudflare Workers (corewire.dev): live for a release, as a version without traffic for a prerelease. `.github/workflows/docs.yml` deploys the docs manually from `main`. The deploys use the secret `CLOUDFLARE_API_TOKEN`; the account id is in the workflow. Without that repository secret the docs steps of `released.yml` (which run after npm publish) and `docs.yml` fail. The workflow runs on Node 24 with npm `^11.5.1` (npm 12 does not install on every Node version). Publishing goes through npm trusted publishing (OIDC, `id-token: write`), without `NPM_TOKEN`; Bas sets up the trust per package on npm himself. `diagnostics` is private and is not published.

## Tests and tooling

- Automated tests are postponed to a separate, thorough testing effort. Do not add tests for now. Validate changes with the builds, the two test scripts above, the docs build and diagnostics.
- Manual device tests run through diagnostics. For comparisons with the production version: `tools/parity/capture.sh` and `tools/parity/compare.ts` (see `.research/parity/HANDOFF.md`, local only).
- No linter or formatter; the style rules live in `.editorconfig`.
- No Docker or `.env` files.
