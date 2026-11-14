# Handoff: the @corewire rebuild

State on 2026-11-14, branch `refactor/corewire` (not pushed). `main` equals `origin/main` (`5286829`), the version that runs in production in the Homey app on about 19,000 hubs. The requirement for the whole rebuild: no regression for the Homey app after it migrates.

## Read first

1. `docs/reports/package-structure.tsx`: the approved design (Dutch). Packages, what `core` may contain, how a protocol works, how code is wired, what `devices` does and does not do.
2. `docs/parity/behavior-inventory.md`: 311 items of production behavior with ids. This is the checklist every rewrite is audited against.
3. `CLAUDE.md`: the packages, patterns, protocol pitfalls and the diagnostics agent loop of the new structure.
4. `docs/parity/devices-api.md`: the `@corewire/devices` API as built; section 0 lists where it differs from the design.

## Decisions by the owner (Bas)

- Scope `@corewire`. One package per protocol on one shared core: `core`, `airplay` (with `/mrp`, `/raop`, `/rtsp`), `companion-link`, `devices` (the former sdk), `audio-source`, private `diagnostics`. HomeKit comes later as `@corewire/homekit`; nothing is built for it now.
- A format that stands on its own lives in `core/encoding` even with one consumer (DAAP, NTP timestamps, RTI). Protocol behavior never lives in core. The timing servers stay in `airplay`.
- The existing code is not sacred: restructure and rewrite where the design is better served. Bytes on the wire and behavior toward devices and consumers are.
- The proxy becomes part of diagnostics. `packages/proxy` disappears.
- Sub-agents (Opus) do the work, the orchestrating chat decides. Each step is committed on the branch in English conventional commits with the behavior changes in the body. Never push, amend or rewrite commits.
- No references to pyatv or any other project or external site in code comments. Keep the fact and the reason, drop the attribution.
- The repository keeps its name for now.
- Audio core deduplication between AirPlay audio and RAOP is postponed: it cannot be verified without listening. RAOP code only moved.

## Done and device-tested

| Commit | Step |
| --- | --- |
| `57027b8` | Packages restructured into `@corewire/*`, no behavior change |
| `c3bfd63` | `core` final: `Connection` connects once and ends once with `closed(reason, error?)` and an `AbortSignal`; pairing is `PairSetup`/`PairVerify` (+ `*Server`) with a `PairingTransport` function; generic discovery, `discover()` per protocol package |
| `794ea17` | AirPlay: `connect()` returns an `AirPlaySession` with `openRemoteControl()`, `playUrl()`, `streamAudio()`; `pair()` for PIN pairing |
| `98d54d6` | MRP: `@corewire/airplay/mrp`, `MediaRemote.open(session)`, state as a socket-free model (`state.apply(...)`) |
| `59ebd8f` | Companion Link: `connect()` returns a session with groups (`hid`, `touch`, `text`, `power`, `apps`, `accounts`, `media`, `system`, `interests`, `state`); `pair()` |
| `e45656b`, `3e5a268` | Two small fixes (mDNS regex, channel leak on abort during SETUP) |
| `6866b5e` | Remaining step 1: the new `@corewire/devices` API with built-in recovery |
| `990df3c` | Remaining step 2: diagnostics on the public APIs, with the proxy and storage inside |
| (step 3 commit) | Remaining step 3: CI and release workflow for the five `@corewire` packages, README, CLAUDE.md, report updated where the build deviated |

After every step the outgoing traffic was compared with the baseline on real devices and matched: connect (Apple TV with credentials, HomePod with transient pairing), remote keys, lists, power state, volume, playback queue, pause/play, URL playback, audio streaming, power off/on, app launch. Simulated drops of the control, data and event stream each end the session at once.

The public API of `@corewire/devices` was kept as it was through the protocol steps, so diagnostics kept working; remaining steps 1 and 2 then redesigned it and moved diagnostics onto it. Both were device-tested against the baseline the same way.

## How to test against the baseline

- Baseline worktree: `../apple-protocols-baseline` (origin/main, read-only, Electron installed). Remove it with `git worktree remove` when the migration is done.
- Only one diagnostics app can run at a time (shared bridge file). Bas allowed the orchestrating chat to start it itself: `bun --cwd packages/diagnostics dev:agent` in the background, then `diag wait-ready`. Stop the app before agents edit `packages/*/src`, otherwise `--watch` restarts it and reconnects devices on every save.
- `tools/parity/capture.sh <repo> <outdir> connect|call|invoke <device> ...` records traffic, events and errors around one action. `bun tools/parity/compare.ts <baselineDir> <newDir>` compares the outgoing sequence per protocol.
- Baseline captures are in `/tmp/parity/baseline/{tv,pod,wk}` (not committed: they contain account ids). If `/tmp` was cleared, record them again from the baseline worktree.
- Devices: `Extra-TV` (spare Apple TV, usually asleep) for quiet scenarios; `Slaapkamer-HomePod` for connect and volume reads only; `Woonkamer-TV`: Bas allowed everything, including audio, URL playback, power and app launch. Someone may be watching it; restore what you change (relaunch `com.google.ios.youtube`). Volume above 0.5 and credential-removing channels need his confirmation.
- Not yet tested: PIN pairing against the new code (AirPlay and Companion Link `pair()` were rewritten). It re-pairs diagnostics with the TV and needs Bas at the screen to read the code. Do it once near the end.

## Remaining work, in order

### 1. The new `@corewire/devices` API (done, `6866b5e`)
Design: report sections "Wat @corewire/devices wel en niet doet", "Hoe de code aan elkaar hangt", "Wat er uit de Homey-app verdwijnt". Inventory sections 3, 6 and 7.

- Devices `AppleTV` and `HomePod` (no `HomePodMini` class, use `model`). Constructed from a plain target (`{address}` plus optional port/TXT/id); the device finds its services itself (unicast mDNS for Companion Link) and re-resolves on recovery. No fabricated discovery results, no setters after construction.
- Lifecycle and recovery inside the device: `connect()` keeps it connected until `disconnect()`. One `status` event with `connecting | connected | degraded | recovering | offline`, a reason, and per-protocol state. `degraded` = AirPlay up, Companion Link missing; the device keeps looking and attaches Companion Link when found.
- Recovery must be at least as persistent as the Homey app is today (HY-13 to HY-16): 3 quick attempts (1/2/4 s), then for an Apple TV 15 attempts every 2 minutes, then every 15 minutes forever; HomePod every 15 minutes forever. The forced reconnect every 15 minutes on a healthy session existed to work around the zombie session (LC-13), which is fixed; decide with evidence whether it can go. The connect retry that `Connection` lost in step 2 must be covered here.
- Capabilities are always present (`tv.apps` never `undefined`), `supports(...)` tells availability, unavailable calls throw an `UnavailableError`. One layer per capability: the controllers plus `internal/airplay-controls.ts` shim and the managers collapse into capabilities that work on the protocol sessions.
- Own types instead of protobuf in the public API: `'off' | 'one' | 'all'`, playback state strings, `nowPlaying.supports('next')`. Now playing as a snapshot. Volume 0 to 1 only.
- `Credentials` with one string form; `Credentials.parse()` must also read what the Homey app stores today (hex fields, see `getAccessoryCredentialsFromDevice.ts` in the app).
- No `configure()`, no globals: logger and timing come in through options; the shared timing server starts lazily at the first audio stream.
- Apple Music catalog helpers (lyrics, animated artwork) move to the subpath `@corewire/devices/catalog`.
- `ConnectionRecovery` moves from `core/transport` into devices (or is replaced). `deviceModel` already lives in devices.
- Open points from earlier steps to settle here: the MRP model still emits message-named events (`setState`, `deviceInfo`) to keep diagnostics identical, which contradicts "each layer its own events"; `StateController.isKeyboardActive` always returns `true` (ST-27); now-playing state is only cleared at the next connect (LC-09); `recovering`/`recoveryFailed` were declared but never emitted (LC-26).
- The exact `disconnected(true|false)` semantics the Homey app relies on (AP-HS-02, AP-HS-28, LC-11, LC-18, HY-06) disappear with the new `status` event; the Homey migration must be written against the new semantics, and the audit must show nothing depends on the old ones.

### 2. Diagnostics on the public APIs, with the proxy and storage inside (done, `990df3c`)
- `device:call` roots become the device and `device.sessions`; no string paths into internals. Update `src/main/agent/actions.ts`, panels and snapshots; keep every user-visible feature. `actions.ts` reads `airplayState.keyboardInfo`, a getter that does not exist (broken before the rebuild).
- Move `packages/proxy` into `packages/diagnostics/src/main/proxy/` with a panel, `proxy:*` channels and `diag proxy status|start|stop`; `proxy:start` needs confirmation. The branch `experimental/reworked-api` contains an earlier version of this move inside the old layout; use it as reference, do not check it out.
- The mDNS responder (advertising) moves from the proxy into `core/discovery`; the pairing servers stay in `core/pairing`.
- `Storage`/`JsonStorage`/`MemoryStorage` move from `@corewire/core/storage` into diagnostics; the temporary subpath disappears. `Context` in `core/transport` stays as the plain object that is handed down.
- Leftovers noted by agents: unused builders in `companion-link/src/messages.ts` (`ping`, `publishPresence`, `fetchSiriStatus`, `systemInfoUpdate`, `buildRtiClearPayload`, `buildRtiInputPayload`); `siriRemoteInfo` parses `Buffer.from(...).buffer` (possible wrong offset, inherited); raw `exchange` with a preset `_x` registers under the wrong key; `raop/raop.ts` still takes a `DiscoveryResult`; `raop/const.ts` sends the metadata strings `'Streaming with apple-raop'`/`'apple-raop'` to the device (behavior, untouched); import order in rewritten import blocks is not alphabetical everywhere.

### 3. CI, README, CLAUDE.md (done, step 3 commit)
- `.github/workflows/checks.yml` and `released.yml` for the new package list; the release workflow publishes five packages under `@corewire`. Checks run `build.sh`, the core pairing test and the proxy smoke test. The release publishes with `npm publish --provenance` over OIDC and no `NPM_TOKEN`; `provenance: false` is gone from the `publishConfig` of the five packages. It only works once the trust is set up (step 6).
- Rewrite `CLAUDE.md` and `README.md` for the new structure. Remove the old-name instructions (Homey copy loop, package table, dependency graph).
- Update the report where the build deviated from it (codecs DAAP/NTP/RTI stay in core; `timing/` sits at the top level of airplay; MRP has one state model instead of a separate `nowPlaying`).

### 4. Independent audit
An agent that wrote none of the rebuild checks every item of `behavior-inventory.md` against the new code and reports kept/changed/dropped with file references. Sections 5 (fix history) and 7 (Homey) of the inventory were compiled by helper agents and their line numbers were not all verified; the audit should re-check them against the baseline.

### 5. Migrate the Homey app
`~/Development/Projects/homey/com.basmilius.apple`, in a worktree. It imports only `@corewire/devices` and `@corewire/audio-source`. The table in the report section "Wat er uit de Homey-app verdwijnt" lists what goes. Validate with the app's own build (`bun run build`, `homey app build`) and a soak test on Bas's devices; release to the Homey test channel first. The old `@basmilius/apple-*` packages stay on npm, so rolling back is a version pin.

### 6. Publishing
Bas wants npm trusted publishing for `@corewire`: publish a placeholder version of each package first, then link GitHub with `npm trust`, then let the release workflow publish. Do this with him; it uses his npm account. After that, deprecate the nine `@basmilius/apple-*` packages with a pointer to `@corewire`.

## House rules for agents

Give every sub-agent: the design report, the inventory with the ids relevant to its step, the baseline worktree path as read-only reference, the rule that it reports per touched inventory id `kept | changed | dropped` and lists every runtime behavior change, the commit rules above, `rm -rf packages/*/dist && bash build.sh` plus `bun run packages/core/test/pairing-server.ts` and `bun run packages/diagnostics/test/proxy-smoke.ts` as the done condition, and the project rules from `CLAUDE.md` (code-style skill, Edit tool, no tests added, no dev server started by the agent).
