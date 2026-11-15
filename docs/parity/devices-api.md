# Design: the public API of `@corewire/devices`

Step 1 of the remaining work in `HANDOFF.md`. Inventory ids refer to `behavior-inventory.md`, `H:` is the Homey app root. The design was approved and is implemented; section 0 lists where the implementation differs from the text below, and the decisions on the open questions.

## 0. Implementation notes

Decisions by Bas on section 8: `disconnected` is the sixth state; `remote.press` routes as designed, without a `via` option; the shared timing server starts at the first connect (the report says first audio stream, step 3 updates the report); the forced 15-minute reconnect goes without new probe bytes, and the Homey soak test in step 5 checks it; with a `resolve` option the device never scans with multicast.

Where the code differs from the sections below:

- **No spurious events across a recovery** (extra requirement). `nowPlaying` compares public values only, with the last ones it announced, which survive sessions. Within a session ST-07 therefore only fires where the public item differs: a change of `hasArtworkUrl`/`hasArtworkData` alone (artwork arriving for the same item) now fires `artwork` instead of `change`. Section 0.1 has the details.
- **Audio playback teardown.** When an audio stream ends or fails, `AudioPlayback` closes its AirPlay session (control and event channel, feedback timer) before it waits for the source to stop, so a source whose `stop()` rejects or hangs cannot keep that session open. `AudioStream.stream()` no longer waits for the source to stop either; the bytes and their order on the wire stay the same (TEARDOWN, then the UDP sockets, then the session connections).
- **TEARDOWN window.** A remote close of a channel normally ends the whole AirPlay session at once. Once TEARDOWN went out, a remote close of the event or data channel waits instead: the control channel stays open until the TEARDOWN reply arrives or its 6 s timeout passes, and then the session closes with reason `local`. An Apple TV closes the event channel right after TEARDOWN, often before its `200 OK`; without this window the control channel closed first and the end of every audio stream rejected. If the receiver closes the control channel itself before it answers, `ControlChannel.teardown()` resolves with `undefined` (logged at debug) instead of rejecting, and the session closes with reason `remote`. The bytes on the wire stay the same. URL playback sends TEARDOWN only after a failed start and gets the same rule; its `stop()` sends none.
- **Volume `change` is deduplicated.** It fires only when level, muted, availability or mode differ from the last emitted value. ST-19 changes: a VOLUME_DID_CHANGE with the same level no longer fires. The getters keep their values across sessions, while `volume.up()`/`down()` still step from the model, which a new session clears to 0 until the device reports (as before, AP-HS-03).
- **`AppleDevice`** is `AppleDevice<TCapability extends AppleTVCapability = Capability>` with a protected constructor. It exposes `protected mediaRemoteState` and `protected companionLinkState` for the subclass, and since round 2 one protected hook: `reset()`, which runs at the start of `disconnect()`. `AppleTV` overrides it to reset power; its own `disconnect()` override is gone.
- **`Credentials.from(accessoryCredentials)`** is public, for credentials from a protocol `pair()`. Diagnostics needs it. `Credentials.toFields()` writes the hex object form `parse()` reads, for storage an older release has to read (audit m6).
- **`MediaPlayback` is an interface** (round 2; it was a class). `instanceof MediaPlayback` no longer works. Its `ended` getter starts waiting on first read. For a URL that starts the `/playback-info` poll or the play-queue watch, so a consumer that never reads it sends nothing extra (the old `waitForPlaybackEnd()` was opt-in too).
- **`playUrl` on a device without URL playback** throws `UnavailableError` before it connects. The old code connected, paired and then threw `PlaybackError`.
- **The MRP model** also gets `outputDevicesChanged(devices)` and `participantsChanged(participants)`, and `deviceInfo` messages no longer have a handler of their own (they update the cluster and output device UID only). Removed events: `configureConnection`, `deviceInfo`, `deviceInfoUpdate`, `keyboard`, `originClientProperties`, `playerClientProperties`, `removeClient`, `removePlayer`, `sendCommandResult`, `setArtwork`, `setDefaultSupportedCommands`, `setNowPlayingClient`, `setNowPlayingPlayer`, `setState`, `updateClient`, `updateContentItem`, `updateContentItemArtwork`, `updatePlayer`, `updateOutputDevice`, `playerClientParticipantsUpdate`, `volumeControlAvailability`, `volumeControlCapabilitiesDidChange`, `volumeDidChange`, `volumeMutedDidChange`.
- **Logging.** `Logger` takes an optional `LogSink` (`(group, args) => void`, exported from core); `Context(deviceId, identity?, sink?)` passes it on. The device formats entries with `util.format`.
- **Companion Link start.** The first Companion Link attempt starts once the first AirPlay attempt settled, so the wire order stays AirPlay then Companion Link. Its unicast query therefore runs after the AirPlay connect; Homey ran it before. That moves an mDNS query, not session bytes.
- **No combined unicast query (finding B13, kept).** Section 3.4 describes one unicast DNS-SD query for both protocols. The code still sends two: AirPlay before its connect, Companion Link after the first AirPlay attempt. Combining them changes the mDNS query bytes and moves the Companion Link query before the AirPlay connect, and the wire rule of round 2 kept the current order and bytes. A combined query can come later, with a device test.
- **Companion Link follows AirPlay to a new address** (round 2, HY-16). When AirPlay comes back at a new address after a re-resolve, a Companion Link link that waits in its 2 or 15 minute phase retries there at once.
- **`resolve(last, signal)`** (round 2). The option gets an `AbortSignal` that aborts after 15 s or when `disconnect()` cancels the attempt. After a timeout the attempt goes on with the last known address, so a lookup that hangs no longer freezes the device.
- **Capabilities are interfaces** (round 2): `NowPlayingControl`, `VolumeControl`, `PowerControl`, `TextControl`, `AppsControl`, `AccountsControl`, `SystemControl`, `TouchControl`, `RemoteControl`, `PlaybackControl`, `ArtworkControl`, `MediaControl`, `MultiroomControl`, `MediaPlayback`. The classes behind them are internal. Gone from the public surface: `nowPlaying.hold()`, `resume()`, `stop()`, `reset()`, `volume.reset()`, `power.reset()` and every capability constructor. The ones with events extend `EventEmitter` with an exported map: `NowPlayingEventMap`, `VolumeEventMap`, `PowerEventMap`, `TextEventMap`, `MultiroomEventMap`.
- **Error boundary** (round 2). The index re-exports every error class of core (`AppleProtocolError`, `AuthenticationError`, `CommandError`, `ConnectionClosedError`, `ConnectionError`, `ConnectionTimeoutError`, `CredentialsError`, `DecryptionError`, `DiscoveryError`, `EncryptionError`, `InvalidResponseError`, `PairingError`, `PlaybackError`, `SetupError`, `TimeoutError`, `TLV8PairingError`), so a consumer imports every error from devices. A refused playback command throws `CommandRefusedError extends CommandError` with string `reason` (send error, lower camel case) and `status` (handler status), and the `SendCommandError` with `Proto` enums as `cause`. `/catalog` throws `CatalogError` with `reason` and HTTP `status` instead of bare `Error`s; `fetchLyrics` still returns null on 404.
- **`artwork.get()` follows the rule** (round 2, finding B12). `artwork.get()` and `artwork.getAnimated()` throw `UnavailableError` while AirPlay is down, like every other capability method. They returned `null` and `[]` before. No exception to the rule remains.
- **Multiroom outputs** (round 2, finding B11). Section 1.7 had no way to learn the output UIDs. `multiroom.outputs` lists them as `OutputDevice` (`uid`, `name`, `model`, `groupId`, `isLocal`, `isGroupLeader`, `hasVolumeControl`; no protobuf types), with a `change` event that fires only when the list differs from the last one announced. The list survives a reconnect like the volume and `disconnect()` clears it. Per output: `getVolume(uid)` (GET_VOLUME), `setVolume(uid, level)` (SET_VOLUME with the output UID, clamped to 0 to 1), `mute(uid)` and `unmute(uid)` (SET_VOLUME_MUTED). They replace `getForDevice`, `setForDevice`, `muteDevice` and `unmuteDevice` of the production sdk and throw `UnavailableError` while AirPlay is down.
- **Client name CoreWire** (round 2, wire change decided by Bas). `ClientIdentity.name` defaults to `CoreWire` (`DEFAULT_CLIENT_NAME` in core) and sets the pair-setup M5 name (was `basmilius/apple-protocols`), the AirPlay SETUP `name`, the URL playback `clientProcName`, the MRP device info `name` and `computerName` (were `apple-protocols`) and the Companion Link `_systemInfo` name (was `AP Companion Link`, which ignored the identity). Unchanged on purpose: the URL playback `clientBundleID` `com.basmilius.apple-protocols` and the RAOP digest username `apple-protocols`.
- **Shared timing server** (round 2). It is reference counted: the first device that connects without its own `timing` starts it, the last one that disconnects closes it, so a Node script exits after `disconnect()`. Its errors go to the `log` option of the devices that use it (logger id `timing-server`).
- **Status listeners** (round 2). A listener that throws no longer stops the other listeners or leaves a new session unwatched; the link watches the session before it announces `established`, and the error is logged.
- **Status** reports `connecting` while AirPlay is up and the first Companion Link attempt runs, so a consumer sees no `degraded` flash before `connected`.
- **Diagnostics** keeps its own copy of the old discovery merge (`src/main/discovery.ts`), because its panels and pairing show the raw discovery results that `discover()` no longer returns. AirPlay pairing in diagnostics uses `pair()` from `@corewire/airplay` directly, since storage keeps raw credentials; `AppleTV.pair()` sends the same messages. Audio telemetry is only reported for the PTP experiment, because the device does not expose the stream's counters. The catalog lookups in the Now playing panel and the panels outside section 6 fail at runtime until step 2.
- **Style.** Function members of types are method signatures, also in the rebuild types outside devices (`Outstanding` in the AirPlay data channel, `Pending` in the Companion Link stream, `RemoteControlOptions.subscribe`).

### 0.1 What fires when a session comes back

The MRP model is cleared at the start of every AirPlay session (AP-HS-03) and fills up again from the device's messages. The Companion Link model is cleared at every Companion Link connect.

| Event | Old (per connect) | New |
| --- | --- | --- |
| `nowPlayingChanged` / `nowPlaying.change` | Always fired at the first evaluation, often twice (app first, then its state). The 15-minute reconnect repeated that every 15 minutes | Fires only when the public `NowPlaying` differs (deep equal) from the last one announced. After a reconnect the device holds back: as soon as the new session reports the announced item again nothing fires; if it reports something else, the item settled after 1 s (the last message resets the wait) is announced once. The restore ends at the latest 5 s after the new session is up; whatever the model holds then (possibly null) is announced once if it differs. `current` keeps the last item meanwhile |
| `playbackStateChanged` / `nowPlaying.state` | Fired Unknown to Playing at every connect | Fires only when the state differs from the last one announced, through `state` or as part of a `change`. While a reconnect restores, `state` is held as well: a state that changed during the outage fires once, right before the `change` that ends the restore, with the settled item and the last announced state as `previous`. A `change` to null resets the announced state to `unknown`, so the next app that plays fires `state` again |
| `artworkChanged` / `nowPlaying.artwork` | Fired on every SET_ARTWORK, also of the same artwork | Fires when the artwork of the current item looks different from outside: another identifier or URL, or other item or SET_ARTWORK bytes (compared by length and hash). Nothing fires while a reconnect restores. When the restore ends on the same item, the artwork is compared with the last announced one and `artwork` fires once if it differs. A part of the artwork the new session has not sent yet counts as unchanged, so the same artwork arriving in pieces fires nothing |
| `volumeChanged`, `volumeMutedChanged` / `volume.change` | Fired on every message | Fires only for a different value |
| `power` / `power.change` | Fired at every Companion Link connect (HY-08) | Unchanged: fires at every Companion Link connect and every attention report. Without the forced reconnect that is only after a real drop |
| `textInput` / `text.change` | Every `_tiStarted`/`_tiStopped` | Unchanged for Companion Link; MRP keyboard messages fire it while Companion Link is down |

`nowPlaying.current` and `nowPlaying.elapsed` return the last item and elapsed time while the new session has not reported yet. `nowPlaying.supports(command)` answers from the commands that item supported when the old session ended, so a consumer does not see every command disappear for the length of the restore.

This holding back is for recoveries only. An explicit `disconnect()` forgets what was announced: `nowPlaying` drops the last item, state and artwork (`current` is null, `elapsed` 0), `volume` returns to level 0, unmuted, unavailable, mode `none`, `power.state` to `unknown`, `text.state` to its defaults, and `multiroom` to no cluster and no outputs. Both models (MRP and Companion Link) are cleared too. The next `connect()` then announces the current item, state, volume and power as a new device does, without a restore. A consumer that cleared its own view (a restart button: `disconnect(); connect();`) gets it filled again.

Since round 2 this reset runs synchronously at the start of `disconnect()`, followed by one `status` (`disconnected`, reason `requested`, both protocols `off`), before the wait for the sessions to close (a graceful Companion Link stop takes up to 10 s). Before, `disconnect()` emitted two statuses, the first still showing `companionLink: connected`, and reset after the wait; a `connect()` right after an unawaited `disconnect()` then lost the values of its new session. Now `disconnect(); connect();`, also in the same tick, starts a new attempt and keeps its values. A `connect()` that was still pending rejects. Before round 2, `nowPlaying.current` still returned the old item after `disconnect()`, against this section.

`disconnect()` cancels the restore timers. No capability event (`nowPlaying`, `volume`, `power`, `text`) fires once `disconnect()` resolved: the sessions are closed by then and the models only change on device messages. A restore that was in flight ends with the reset.

## 1. Public API

### 1.1 Exports of `@corewire/devices`

```ts
// Devices
export { AppleDevice, AppleTV, HomePod } from './device';
export { Credentials } from './credentials';
export { Pairing } from './pairing';
export { CommandRefusedError, UnavailableError } from './errors';
export { createDevice, discover, WAKE_PORTS } from './discovery';
export { DeviceFamily, DeviceModel, getDeviceFamily, getDeviceModelName, isAirPort, isAppleTV, isHomePod, lookupDeviceModel } from './deviceModel';

// Errors of core, re-exported (round 2)
export {
    AppleProtocolError, AuthenticationError, CommandError, ConnectionClosedError, ConnectionError, ConnectionTimeoutError,
    CredentialsError, DecryptionError, DiscoveryError, EncryptionError, InvalidResponseError, PairingError, PlaybackError,
    SetupError, TimeoutError, TLV8PairingError
} from '@corewire/core';

// Capability interfaces and their event maps (round 2)
export type {
    AccountsControl, AppsControl, ArtworkControl, MediaControl, MediaPlayback, MultiroomControl, MultiroomEventMap,
    NowPlayingControl, NowPlayingEventMap, PlaybackControl, PowerControl, PowerEventMap, RemoteControl, SystemControl,
    TextControl, TextEventMap, TouchControl, VolumeControl, VolumeEventMap
};

export type {
    Account, AnimatedArtwork, App, AppleTVCapability, AppleTVOptions, Artwork, AudioSource, Capability, ClientIdentity,
    DeviceOptions, DeviceSessions, DeviceState, DeviceTarget, DiscoveredDevice, DiscoverOptions, HomePodCapability,
    LinkState, LogEntry, LogLevel, Lyrics, MediaKind, NowPlaying, NowPlayingCommand, NowPlayingSeries, OutputDevice,
    PairOptions, PlaybackState, PlayUrlOptions, PowerState, PressMode, PressOptions, ProtocolStatus, RemoteKey, RepeatMode,
    RetryPhase, ServiceRecord, ShuffleMode, Status, StatusReason, StreamAudioOptions, SwipeDirection, TextState,
    VolumeMode, VolumeState
} from './types';
```

This block shows what the index exports, not its literal source. `DiscoverOptions` is the type of `@corewire/core/discovery`, re-exported.

Gone from the index: every controller, `AirPlayManager`, `CompanionLinkManager`, `AirPlayState`/`Client`/`Player` aliases, `AIRPLAY_PROTOCOL`/`COMPANION_LINK_PROTOCOL`, `configure`, `HomePodMini`, `PairingSession`, `discoverAll`, `mdnsUnicast`, and the re-exports of `Proto`, `TimingServer`, `reporter`, `Storage`/`JsonStorage`/`MemoryStorage`, `mdnsMulticast`, `ConnectionRecovery`, `AIRPLAY_SERVICE`, `RAOP_SERVICE`, `COMPANION_LINK_SERVICE`. Who needs those imports them from the protocol package or `core`.

### 1.2 Construction

```ts
/** Where a device is. Only the address is required. */
export type DeviceTarget = {
    readonly address: string;

    /** AirPlay RTSP port; 7000 when omitted. */
    readonly port?: number;

    /** The AirPlay TXT record, when known. Supplies the model and the MAC (`deviceid`) for re-resolving. */
    readonly txt?: Readonly<Record<string, string>>;

    /** The mDNS host id, e.g. `Woonkamer-TV.local`. Tags the logs; the address when omitted. */
    readonly id?: string;
};

export type LogLevel = 'debug' | 'error' | 'info' | 'net' | 'raw' | 'warn';

export type LogEntry = {
    readonly level: LogLevel;
    readonly device: string;
    readonly message: string;
    readonly args: readonly unknown[];
    readonly timestamp: number;
};

export type ClientIdentity = Partial<{
    name: string; model: string; osName: string; osVersion: string; osBuildVersion: string; sourceVersion: string;
}>;

export type DeviceOptions = {
    /** Receives the log entries of this device at {@link logLevels}. The global reporter in core still gets them too. */
    log?(entry: LogEntry): void;

    /** Default `['error', 'warn']`. */
    readonly logLevels?: readonly LogLevel[];

    /**
     * NTP timing server announced in every SETUP. Omitted: a server shared by all devices, started at the first
     * connect of a device that uses it. `false`: SETUP announces no timing (Homey sets this when it runs remote).
     */
    readonly timing?: TimingServer | false;

    /**
     * Looks the device up again before a recovery attempt, after the built-in unicast query found nothing.
     * Homey plugs in its own discovery strategy here. A device with this option never scans with multicast:
     * the consumer owns discovery (decision by Bas).
     */
    resolve?(last: DeviceTarget, signal: AbortSignal): Promise<DeviceTarget | null>;   // signal: round 2, aborts after 15 s or on disconnect()

    /** Overrides of the identity this client presents. */
    readonly identity?: ClientIdentity;
};

export type AppleTVOptions = DeviceOptions & {
    /** From a PIN pairing. Without them AirPlay pairs transiently and Companion Link stays off. */
    readonly credentials?: Credentials;

    /** iCloud alternate DSID announced to Companion Link during its startup (CL-HS-09). */
    readonly activeUserAccount?: string;
};

new AppleTV(target: DeviceTarget, options?: AppleTVOptions);
new HomePod(target: DeviceTarget, options?: DeviceOptions);
```

No setters after construction. A new address arrives through re-resolving (section 3.4), new credentials mean a new device.

### 1.3 Devices

```ts
export abstract class AppleDevice<TCapability extends AppleTVCapability = Capability> extends EventEmitter<{status: [status: Status]}> {
    get id(): string;                 // target.id ?? target.address
    get name(): string;               // TXT `name`, else the /info `name`, else the id
    get address(): string;            // the address now in use; changes after a re-resolve
    get model(): DeviceModel;         // from TXT `model`, else from /info, else Unknown
    get modelName(): string;          // the raw model identifier, e.g. 'AudioAccessory5,1'
    get status(): Status;

    /** The protocol sessions in use now; undefined while a protocol is down. For diagnostics and experiments. */
    get sessions(): DeviceSessions;

    readonly nowPlaying: NowPlayingControl;
    readonly playback: PlaybackControl;
    readonly volume: VolumeControl;
    readonly remote: RemoteControl;
    readonly artwork: ArtworkControl;
    readonly media: MediaControl;
    readonly multiroom: MultiroomControl;

    /**
     * Starts keeping the device connected until {@link disconnect}. Resolves the first time the device reaches
     * `connected` or `degraded`. Rejects with the last error when the first attempt and the three quick retries
     * all fail; the device then stays `offline` and keeps trying on the slow schedule. A call while connecting
     * returns the same promise; a call while connected resolves at once. A call while `offline` runs the next
     * scheduled AirPlay attempt now; the schedule keeps its position unless that attempt succeeds.
     */
    connect(): Promise<void>;

    /**
     * Stops all retries, resets the announced values and emits `disconnected` at once (round 2), then ends the media
     * sessions and every protocol session and resolves. Idempotent.
     * The Companion Link graceful stop and socket close get 10 s together; after that the socket is destroyed.
     */
    disconnect(): Promise<void>;

    /** Whether the capability works now. A call that cannot work throws {@link UnavailableError}. */
    supports(capability: TCapability): boolean;
}

export class AppleTV extends AppleDevice<AppleTVCapability> {
    readonly text: TextControl;
    readonly power: PowerControl;
    readonly apps: AppsControl;
    readonly accounts: AccountsControl;
    readonly system: SystemControl;
    readonly touch: TouchControl;

    /** PIN pairing. Resolves once the PIN shows on screen. */
    static pair(target: DeviceTarget, options?: {identity?: ClientIdentity; signal?: AbortSignal}): Promise<Pairing>;
}

export class HomePod extends AppleDevice<HomePodCapability> {}

export type Capability = 'remote' | 'nowPlaying' | 'playback' | 'volume' | 'artwork' | 'multiroom' | 'streamAudio' | 'playUrl';
export type HomePodCapability = Capability;
export type AppleTVCapability = Capability | 'text' | 'power' | 'apps' | 'accounts' | 'system' | 'touch';

export type DeviceSessions = {
    readonly airplay?: AirPlaySession;          // from @corewire/airplay
    readonly mediaRemote?: MediaRemote;         // from @corewire/airplay/mrp
    readonly companionLink?: CompanionLinkSession;  // from @corewire/companion-link; always undefined on a HomePod
};

export class UnavailableError extends AppleProtocolError {
    readonly capability: string;
    /** `disconnected`: the protocol it needs is down. `unsupported`: the device cannot do it at all. */
    readonly reason: 'disconnected' | 'unsupported';
}
```

`supports()` rules:

| Capability | True when |
| --- | --- |
| `remote`, `nowPlaying`, `playback`, `volume`, `artwork`, `multiroom`, `streamAudio` | AirPlay connected (`mediaRemote` present) |
| `playUrl` | AirPlay connected and `session.supportsUrlPlayback` |
| `power` | AirPlay connected (on and off are AirPlay HID, HY-26); `power.state` comes from Companion Link |
| `text` | Companion Link or AirPlay connected |
| `apps`, `accounts`, `system`, `touch` | Companion Link connected |

`remote.press()` with a key that only Companion Link knows also needs Companion Link (section 1.6).

### 1.4 Status

```ts
export type DeviceState = 'disconnected' | 'connecting' | 'connected' | 'degraded' | 'recovering' | 'offline';

export type StatusReason =
    | 'requested'    // connect() or disconnect()
    | 'established'  // a protocol connected
    | 'remote'       // the device closed a session
    | 'timeout'      // AirPlay keepalive unanswered
    | 'error'        // a socket or frame broke
    | 'failed'       // a connect attempt failed, see `error`
    | 'scheduled';   // a retry was scheduled or started

export type LinkState = 'off' | 'connecting' | 'connected' | 'waiting';
export type RetryPhase = 'quick' | 'slow' | 'rare';

export type ProtocolStatus = {
    readonly state: LinkState;
    readonly attempt: number;               // failed attempts since this protocol was last connected
    readonly phase: RetryPhase | null;      // null unless waiting or connecting on a retry
    readonly nextAttemptAt: number | null;  // epoch ms
    readonly error: Error | null;           // last failure or close error
};

export type Status = {
    readonly state: DeviceState;
    readonly reason: StatusReason;
    readonly error: Error | null;
    readonly airplay: ProtocolStatus;
    readonly companionLink?: ProtocolStatus;  // Apple TV only
};
```

`status` fires on every change of any field. The spec listed five states; I added `disconnected` for before `connect()` and after `disconnect()`, because `offline` means "still trying" and needs to stay distinguishable from "not asked to connect".

### 1.5 Now playing and playback

```ts
export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'interrupted' | 'seeking' | 'unknown';
export type RepeatMode = 'off' | 'one' | 'all';
export type ShuffleMode = 'off' | 'albums' | 'songs';
export type MediaKind = 'audio' | 'video' | 'unknown';

export type NowPlaying = {
    readonly app: {readonly bundleId: string; readonly name: string};
    readonly player: string;               // player id, 'MediaRemote-DefaultPlayer' by default
    readonly state: PlaybackState;
    readonly title: string;
    readonly artist: string;
    readonly trackArtist: string;          // metadata trackArtistName; Homey falls back to it
    readonly album: string;
    readonly genre: string;
    readonly duration: number;             // seconds, 0 when unknown
    readonly rate: number;
    readonly repeat: RepeatMode;           // Unknown and absent map to 'off'
    readonly shuffle: ShuffleMode;         // Unknown and absent map to 'off'
    readonly kind: MediaKind;
    readonly series: {readonly name: string; readonly season: number; readonly episode: number; readonly episodeTitle: string} | null;
    readonly contentRating: string;
    readonly contentIdentifier: string;
    readonly artworkId: string | null;
    readonly storeAlbumId: string | null;  // iTunesStoreAlbumIdentifier; null when absent or 0
    readonly lyricsId: string | null;      // lyricsAdamID
    readonly isAlwaysLive: boolean;
    readonly isAdvertisement: boolean;
};

export type NowPlayingCommand =
    | 'play' | 'pause' | 'togglePlayPause' | 'stop' | 'next' | 'previous' | 'skipForward' | 'skipBackward'
    | 'seek' | 'repeat' | 'shuffle' | 'rate';

export type Lyrics = {readonly identifier: string; readonly text: string | null; readonly available: boolean | null; readonly url: string | null; readonly catalogId: string | null};

export interface NowPlayingControl extends EventEmitter<{
    /** The snapshot changed (ST-07 comparison). First evaluation after every AirPlay connect always fires. */
    change: [item: NowPlaying | null];
    /** Playback state of the now-playing app changed (ST-06). Fires before the matching `change`. */
    state: [state: PlaybackState, previous: PlaybackState, item: NowPlaying];
    /** New artwork bytes or URL for the current item (ST-17, not deduplicated). */
    artwork: [item: NowPlaying];
}> {
    /** The last snapshot; stays readable while AirPlay is down (LC-09). */
    readonly current: NowPlaying | null;

    /** Elapsed seconds now, extrapolated as ST-12 describes; 0 without an item. */
    readonly elapsed: number;

    /** Whether the now-playing app accepts the command (ST-15). */
    supports(command: NowPlayingCommand): boolean;

    /** Lyrics of the current item from the playback queue. */
    lyrics(): Promise<Lyrics | null>;
}

export interface PlaybackControl {
    play(): Promise<void>;
    pause(): Promise<void>;
    togglePlayPause(): Promise<void>;
    stop(): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    skipForward(seconds?: number): Promise<void>;   // 15
    skipBackward(seconds?: number): Promise<void>;  // 15
    seek(seconds: number): Promise<void>;
    setRepeat(mode: RepeatMode): Promise<void>;
    setShuffle(mode: ShuffleMode): Promise<void>;
    setRate(rate: number): Promise<void>;
}
```

All `playback` methods send MRP SEND_COMMAND exactly as `Commands` does now, and throw `TimeoutError` as before (HY-24). A refusal throws `CommandRefusedError` with string reasons since round 2; it was `SendCommandError` with `Proto` enums. The rarer commands (like, chapters, sleep timer, fast forward) stay on `device.sessions.mediaRemote.commands`.

### 1.6 Volume, remote, power, text

```ts
export type VolumeMode = 'absolute' | 'relative' | 'none';   // Absolute and Both map to 'absolute'

export type VolumeState = {
    readonly level: number;      // 0..1, 0 until the device reports (ST-19)
    readonly muted: boolean;
    readonly available: boolean; // VOLUME_CONTROL_AVAILABILITY
    readonly mode: VolumeMode;   // VOLUME_CONTROL_CAPABILITIES
};

export interface VolumeControl extends EventEmitter<{change: [volume: VolumeState]}>, VolumeState {
    set(level: number): Promise<void>;                       // clamped 0..1, needs mode 'absolute' (ST-22, ST-23)
    up(): Promise<void>;                                     // 0.05 step or HID key per mode (TM-18)
    down(): Promise<void>;
    mute(): Promise<void>;
    unmute(): Promise<void>;
    toggleMute(): Promise<void>;
    fade(level: number, durationMs: number): Promise<void>;
}
```

`change` fires on every VOLUME_DID_CHANGE (no dedupe, ST-19), on every muted message (ST-21) and on availability or capability messages. The getters are updated before it fires (HY-21).

```ts
export type RemoteKey =
    // AirPlay HID and Companion Link
    | 'up' | 'down' | 'left' | 'right' | 'select' | 'menu' | 'home' | 'playPause'
    | 'volumeUp' | 'volumeDown' | 'mute' | 'channelUp' | 'channelDown' | 'wake' | 'suspend'
    // AirPlay HID only
    | 'topMenu' | 'play' | 'pause' | 'stop' | 'next' | 'previous'
    // Companion Link only
    | 'siri' | 'screensaver' | 'guide' | 'pageUp' | 'pageDown' | 'info' | 'captions' | 'power' | 'back' | 'exit'
    | 'skipForward' | 'skipBackward';

export type PressMode = 'tap' | 'double' | 'hold';
export type PressOptions = {readonly mode?: PressMode; readonly holdMs?: number};

export interface RemoteControl {
    press(key: RemoteKey, options?: PressOptions): Promise<void>;
}
```

Routing in `press`, chosen so every press the Homey app sends today keeps its bytes:

- `tap` goes over AirPlay HID when the key exists there (QK-07, TM-14), otherwise over Companion Link.
- `hold` and `double` go over Companion Link when it is connected and knows the key (CL Hold, 500 ms default; DoubleTap without delay, TM-16). Otherwise AirPlay HID long press (1000 ms default) or double press (150 ms gap, TM-15).
- `playPause` over AirPlay keeps ST-28 (HID play or pause by `isPlaying`).

Raw HID primitives (usage page plus usage) are not on the device; they stay on `sessions.mediaRemote.hid` and `sessions.companionLink.hid`.

```ts
export type PowerState = 'unknown' | 'asleep' | 'screensaver' | 'awake' | 'idle';

export interface PowerControl extends EventEmitter<{change: [state: PowerState]}> {
    readonly state: PowerState;  // last known; 'unknown' before Companion Link reported
    wake(): Promise<void>;       // AirPlay HID 0x01/0x83 (HY-26)
    sleep(): Promise<void>;      // AirPlay HID 0x01/0x82
}
```

`change` fires on every attention state report: once per Companion Link connect from `FetchAttentionState` and on every SystemStatus that changes it (ST-30, HY-08). Unchanged from today, so Homey's onoff resync at each Companion Link connect stays. The methods are not called `on`/`off` because that clashes with `EventEmitter.on`.

```ts
export type TextState = {
    readonly active: boolean;
    readonly text: string;
    readonly secure: boolean;
    readonly keyboardType: number;
    readonly autocorrection: boolean;
    readonly autocapitalization: boolean;
};

export interface TextControl extends EventEmitter<{change: [state: TextState]}> {
    readonly state: TextState;
    set(text: string): Promise<void>;
    append(text: string): Promise<void>;
    clear(): Promise<void>;
}
```

Companion Link first, AirPlay RTI otherwise, decided per call as `KeyboardController` does today. `state` comes from the Companion Link `_tiStarted`/`_tiStopped` state when Companion Link is connected, else from the MRP keyboard state (`isKeyboardActive` of the model, which is correct). This settles ST-27.

### 1.7 Apps, accounts, system, touch, artwork, multiroom

```ts
export type App = {readonly bundleId: string; readonly name: string};
export type Account = {readonly id: string; readonly name: string};

export interface AppsControl { list(): Promise<App[]>; launch(bundleId: string): Promise<void>; openUrl(url: string): Promise<void> }
export interface AccountsControl { list(): Promise<Account[]>; switch(id: string): Promise<void> }
export interface SystemControl {
    toggleCaptions(): Promise<void>;
    setAppearance(mode: 'light' | 'dark'): Promise<void>;
    setReduceLoudSounds(enabled: boolean): Promise<void>;
    setFindingMode(enabled: boolean): Promise<void>;
    startSiri(): Promise<void>;
    stopSiri(): Promise<void>;
}
export interface TouchControl { tap(holdMs?: number): Promise<void>; swipe(direction: 'up' | 'down' | 'left' | 'right', durationMs?: number): Promise<void> }

export type Artwork = {readonly url: string | null; readonly data: Uint8Array | null; readonly mimeType: string; readonly identifier: string | null; readonly width: number; readonly height: number};
export type AnimatedArtwork = {readonly format: string; readonly url: string | null; readonly source: 'device' | 'apple-music'};

export interface ArtworkControl {
    get(width?: number, height?: number): Promise<Artwork | null>;          // 600, -1 (ST-18, HY-23); null: the item has no artwork
    getAnimated(width?: number, height?: number): Promise<AnimatedArtwork[]>;
}                                                                           // both throw UnavailableError while AirPlay is down (round 2)

export interface MultiroomControl extends EventEmitter<MultiroomEventMap> {
    readonly clusterId: string | null;
    readonly isLeader: boolean;
    readonly isClusterAware: boolean;
    readonly outputs: readonly OutputDevice[];                  // round 2
    add(...deviceUids: string[]): Promise<void>;
    remove(...deviceUids: string[]): Promise<void>;
    set(...deviceUids: string[]): Promise<void>;
    getVolume(deviceUid: string): Promise<number>;              // round 2, 0 to 1
    setVolume(deviceUid: string, level: number): Promise<void>; // round 2, clamped 0 to 1
    mute(deviceUid: string): Promise<void>;                     // round 2
    unmute(deviceUid: string): Promise<void>;                   // round 2
}

export type MultiroomEventMap = {change: [outputs: readonly OutputDevice[]]};
```

`Account` renames `accountId` to `id`. Up Next, caption settings, TV provider and the rest stay on `sessions.companionLink`.

### 1.8 Media

```ts
export type MediaPlayback = {
    readonly kind: 'url' | 'audio';
    /** Settles when playback ended: the item played to the end, the source ran out, stop() ran or the session ended. */
    readonly ended: Promise<void>;
    stop(): void;
};

export type PlayUrlOptions = {readonly position?: number; readonly signal?: AbortSignal};

/** `volume` 0..1, sent as `20 * log10(volume)` dB, -144 for 0 (RA-HS-06 curve). Omitted: -20 dB (AS-HS-04). */
export type StreamAudioOptions = {readonly volume?: number; readonly signal?: AbortSignal};

export interface MediaControl {
    /** Resolves once playback started. A previous URL playback stops first (UP-HS-02). */
    playUrl(url: string, options?: PlayUrlOptions): Promise<MediaPlayback>;

    /** Resolves once the audio stream is set up. A previous stream stops first (AS-HS-01). */
    streamAudio(source: AudioSource, options?: StreamAudioOptions): Promise<MediaPlayback>;
}
```

`ended` replaces `waitForPlaybackEnd()` and the "resolve at the end" behavior of `streamAudio`. Both media sessions end when the AirPlay session ends or `disconnect()` runs (LC-08). For Homey's volume the bytes match: it now passes `level / 100` and the device computes the same `20 * Math.log10(...)` expression the app computes today.

### 1.9 Credentials and pairing

```ts
export class Credentials {
    /**
     * Reads the string form, or a stored object with the five fields where the binary fields are hex (what the
     * Homey app stores, H:src/apple-tv/pairing.ts:81) or base64 (what JsonStorage stores). A JSON string of
     * such an object works too.
     *
     * @throws {CredentialsError} When the value is not one of these forms.
     */
    static parse(value: string | Readonly<Record<string, unknown>>): Credentials;

    /** `cw1.` followed by five base64url fields, dot-separated: accessory id (UTF-8), accessory LTPK, pairing id, public key, secret key. */
    toString(): string;
    toJSON(): string;
}
```

A field counts as hex when it has only hex digits and an even length. A base64 value of 32 or more bytes that happens to contain only hex digits has a chance near 1e-20, so the two forms do not collide in practice. The device reads the `AccessoryCredentials` inside through a module-private symbol; nothing protocol-shaped is public.

```ts
export class Pairing {
    /** Runs M1 to M6 with the PIN. On success it closes the connection and returns the credentials. A wrong PIN keeps the connection open (PP-HS-04). */
    pin(code: string): Promise<Credentials>;

    /** Closes the connection without credentials. */
    close(): void;
}
```

The same credentials serve Companion Link (PP-HS-05). A HomePod needs no pairing; Homey's check stays `await pod.connect()` under its own timeout, then `await pod.disconnect()` (HY-20).

### 1.10 Discovery

```ts
export type ServiceRecord = {readonly name: string; readonly port: number; readonly txt: Readonly<Record<string, string>>};

export type DiscoveredDevice = {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    readonly model: DeviceModel;
    readonly modelName: string;
    readonly family: DeviceFamily;
    readonly mac: string | null;          // TXT deviceid, normalized
    readonly target: DeviceTarget;        // the AirPlay target to construct a device with
    readonly services: {readonly airplay?: ServiceRecord; readonly companionLink?: ServiceRecord; readonly raop?: ServiceRecord};
};

export type DiscoverOptions = {readonly useCache?: boolean};  // default true, 30 s cache (TM-29)

/** One multicast scan for AirPlay, Companion Link and RAOP; the services of one host merge by address. */
export function discover(options?: DiscoverOptions): Promise<DiscoveredDevice[]>;

/** An AppleTV for family AppleTV, a HomePod for everything else (as `createDevice` does today). */
export function createDevice(found: DiscoveredDevice, options?: AppleTVOptions): AppleTV | HomePod;

/** Ports knocked on to wake a sleeping device. */
export const WAKE_PORTS: readonly number[];  // [7000, 3689, 49152, 32498]
```

### 1.11 `@corewire/devices/catalog`

Pure functions that contact `music.apple.com`. The device never calls them.

```ts
export type AppleMusicLyricsOptions = {bearerToken: string; musicUserToken: string; storefront: string; language?: string; script?: string};

export function fetchAnimatedArtwork(albumId: string, options?: {storefront?: string; signal?: AbortSignal}): Promise<AnimatedArtwork[]>;
export function fetchLyrics(catalogId: string, options: AppleMusicLyricsOptions & {signal?: AbortSignal}): Promise<string | null>;
```

The callers pass `nowPlaying.current.storeAlbumId` or `lyricsId`. The old track-change guard inside `getAnimatedFromCatalog` moves to the caller; Homey already guards on its own album key (H:src/logic/airplay.ts:428).

## 2. Homey app usage mapped to the new API

| Today (file) | New |
| --- | --- |
| `new TimingServer()`, `listen()`, `configure({logging, timingServer})` (index.ts) | Nothing. `log` per device; `timing: false` when `useTimingServer` is false |
| `convertDiscoveryResult(result, type)` with `as unknown as` | `{address: result.address, port: Number(result.port), txt: result.txt, id: result.id}` |
| `getAccessoryCredentialsFromDevice()` hex to Buffer | `Credentials.parse(this.getStoreValue('credentials'))` |
| `new AppleTV({airplay, companionLink})`, rebuild when CL appears (apple-tv/device.ts:125) | `new AppleTV(target, {credentials, log})` once; CL attaches by itself |
| `mdnsUnicast([address], [COMPANION_LINK_SERVICE], 5)` and the hand-built `DiscoveryResult` | Gone; the device queries unicast itself |
| `tv.connect(credentials)` | `tv.connect()` |
| `tv.on('connected')`, `tv.on('disconnected', unexpected)` | `tv.on('status', s => ...)`: available on `connected` (and `degraded` if the app wants), unavailable on `recovering`/`offline` |
| `tv.companionLink.on('connected' / 'disconnected')` | `status.companionLink.state` |
| Two `ConnectionRecovery`, slow recovery, 15 min reconnect | Gone (section 3) |
| Flow `appletv_companion_link_failed` at slow attempt 15 | When `status.companionLink.phase` turns `'rare'` |
| `tv.discoveryResult =`, `pod.discoveryResult =`, `companionLink.discoveryResult =`, `findService(AIRPLAY_SERVICE)` before reconnect | `resolve` option backed by the Homey discovery strategy (MAC match), plus the built-in unicast |
| `airplay.setCredentials`, `companionLink.setCredentials`, `airplay.connect`, `airplay.disconnectSafely`, `airplay.isConnected`, `companionLink.isConnected`, `tv.isConnected` | Gone; `tv.status.state` |
| `tv.disconnect()`, `pod.disconnect()` (sync) | `await tv.disconnect()` |
| Restart button: dispose recovery, rebuild device | `await tv.disconnect(); await tv.connect();` |
| `tv.on('power', state)` | `tv.power.on('change', state)` |
| `sdk.power` guard, `power.on()/off()` | `tv.supports('power')`, `tv.power.wake()/sleep()` |
| `remote.up/down/left/right/select/home/menu/playPause/play/pause/next/previous/stop/topMenu/channelUp/channelDown/wake/suspend` | `remote.press('up')` and so on |
| `remote.mute()` | `remote.press('mute')` (HID toggle, same bytes) |
| `volume.up/down/set(x)` | Same |
| `companionLink.pressButton('Screensaver')`, `('Siri')` | `remote.press('screensaver')`, `remote.press('siri')` |
| `companionLink.pressButton('Home', 'Hold')` | `remote.press('home', {mode: 'hold'})` (CL Hold 500 ms, same bytes) |
| `companionLink.pressButton('Select', 'DoubleTap')` | `remote.press('select', {mode: 'double'})` (CL DoubleTap, same bytes) |
| `playback.play/pause/next/previous/stop` | Same |
| `playback.seekTo(n)`, `skipForward(n)`, `skipBackward(n)` | `playback.seek(n)`, same, same |
| `playback.setRepeatMode(Proto.RepeatMode_Enum.X)`, `utils/repeatMode.ts` | `playback.setRepeat('off' / 'one' / 'all')`; the Proto tables go |
| `playback.setShuffleMode(Proto.ShuffleMode_Enum.Songs / Off)` | `playback.setShuffle('songs' / 'off')` |
| `apps?.list/launch/openUrl`, `accounts?.list/switch` | `tv.apps...`, `tv.accounts...` with `tv.supports('apps')`; `account.accountId` becomes `account.id` |
| `sdk.capabilities.supportsUrlPlayback` | `tv.supports('playUrl')` |
| `media.playUrl(url)` then `media.waitForPlaybackEnd().catch(...)` | `(await tv.media.playUrl(url)).ended.catch(...)` |
| `Url.fromUrl(url)`, local `percentageToDecibels`, `media.streamAudio(src, dB)` | `await (await pod.media.streamAudio(src, {volume: level / 100})).ended` |
| `state.on('nowPlayingChanged', (client) => ...)` | `nowPlaying.on('change', item => ...)` |
| `state.on('playbackStateChanged', (client, _, _, newState))`, `newState === Playing` | `nowPlaying.on('state', (state, _, item) => ...)`, `state === 'playing'`; `item.app` replaces `client` |
| `state.on('volumeChanged')`, `state.on('volumeMutedChanged', muted)` | `volume.on('change', v => ...)` |
| `state.on('artworkChanged')` | `nowPlaying.on('artwork', ...)` |
| `state.elapsedTime` | `nowPlaying.elapsed` |
| `state.repeatMode`, `state.shuffleMode` | `nowPlaying.current?.repeat ?? 'off'`, `(nowPlaying.current?.shuffle ?? 'off') !== 'off'` |
| `state.activeClient.bundleIdentifier/displayName/title/artist/album/isPlaying/duration/artworkId` | `current.app.bundleId/app.name/title/artist/album/state === 'playing'/duration/artworkId` |
| `client.elapsedTime` | `nowPlaying.elapsed` |
| `activePlayer.currentItemMetadata.iTunesStoreAlbumIdentifier` (bigint vs `0n`), `trackArtistName` | `current.storeAlbumId` (null for 0), `current.trackArtist` |
| `client.isCommandSupported(Proto.Command.NextTrack)` and friends, `state.isCommandSupported` | `nowPlaying.supports('next' / 'previous' / 'repeat' / 'shuffle')` |
| `state.volume`, `state.volumeAvailable`, `airplay.state.volumeCapabilities` Absolute or Both | `volume.level`, `volume.available`, `volume.mode === 'absolute'` |
| `artwork.get(600)` | Same, same result fields |
| `artwork.getAnimatedFromCatalog()` | `fetchAnimatedArtwork(current.storeAlbumId)` from `@corewire/devices/catalog` |
| `new AppleTV({airplay}).createPairingSession()`, `start()`, `pin()`, `end()`, `abort()` | `const pairing = await AppleTV.pair(target)`, `pairing.pin(code)`, `pairing.close()` |
| Store `credentials` as hex fields | Store `credentials.toString()`; old stores keep working through `parse` |
| HomePod pairing `new HomePod({airplay}).connect()` / `disconnect()` | `new HomePod(target)`, same calls |
| Types `AbstractDevice`, `AirPlayClient`, `AirPlayPlayer`, `DiscoveryResult`, `MdnsService`, `AccessoryCredentials`, `Proto` | `AppleDevice`, `NowPlaying`, `DeviceTarget`, `Credentials`, string unions |
| `AIRPLAY_SERVICE`, `COMPANION_LINK_SERVICE` as map keys | Not exported; the app keys its Homey strategy by name |

## 3. Recovery

### 3.1 One link per protocol

The device keeps a link for AirPlay and, on an Apple TV, one for Companion Link. The two schedules run independently (HY-34). A link is `off`, `connecting`, `connected` or `waiting`.

```
off --connect()--> connecting --ok--> connected --session closed (not local)--> waiting
                       |                                                     ^      |
                       +------------------fail---------------------------> waiting  |
                                                timer fires, or connect() while offline --> connecting
any state --disconnect()--> off   (timers cleared, now-playing restore timers too, attempt aborted through its signal, sessions closed)
```

An attempt is: resolve (3.4), then `connect()` of the protocol package with an `AbortSignal` that `disconnect()` aborts. For AirPlay it also opens `MediaRemote` on the device's own `MediaRemoteState` (cleared first, AP-HS-03). For Companion Link it passes the device's own `CompanionLinkState`. Both models therefore outlive the sessions.

### 3.2 Timings

The delay before the next attempt depends on the number of failed attempts since the link was last connected. A drop counts as attempt 0, so the first retry after a drop waits 1 s. That matches `ConnectionRecovery.handleDisconnect` as Homey uses it.

| Phase | AirPlay on Apple TV | AirPlay on HomePod | Companion Link |
| --- | --- | --- | --- |
| `quick` | 1 s, 2 s, 4 s | 1 s, 2 s, 4 s | 1 s, 2 s, 4 s |
| `slow` | 15 attempts every 120 s | none | 15 attempts every 120 s |
| `rare` | every 900 s, forever | every 900 s, forever | every 900 s, forever |

This equals HY-13 to HY-16. HY-16's "one immediate rediscovery and reattach" is covered because every attempt resolves again. The constants live in `lifecycle/schedule.ts` as data. They are not options; persistence that a consumer can turn down is a regression path for Homey.

The connect retry `Connection` lost in step 2 (TM-01: 3 TCP attempts, 3 s apart) is covered by the first attempt plus the quick phase: four attempts over about 7 s plus connect time. Unlike TM-01 they retry the whole handshake, not just TCP.

Companion Link only runs while credentials exist. Without them its link stays `off` with a `CredentialsError` and the Apple TV reports `degraded`, because `connected` promises everything the device type offers and apps, accounts, power and touch then never work. An authentication failure keeps retrying on the schedule; the reason is in `error`, so the app can ask for re-pairing without the device giving up on a transient refusal.

### 3.3 Device state

| AirPlay link | Companion Link | `state` |
| --- | --- | --- |
| off | off | `disconnected` |
| connecting, never connected since `connect()`, first attempt | any | `connecting` |
| connected | connected | `connected` |
| connected | not connected (Apple TV) | `degraded` |
| waiting or connecting, phase `quick` | any | `recovering` |
| waiting or connecting, phase `slow` or `rare` | any | `offline` |

A HomePod never reports `degraded`. `connect()` resolves at the first `connected` or `degraded`. On an Apple TV it first waits for the first Companion Link attempt to finish, so it resolves `connected` right away when Companion Link works (as HY-03 does). It rejects when AirPlay enters `slow` (Apple TV) or `rare` (HomePod) for the first time.

### 3.4 Re-resolving

Before every attempt except the very first AirPlay attempt with a known port:

1. Unicast DNS-SD to the current address, after knocking `WAKE_PORTS`, 5 s, for `_airplay._tcp` (plus `_companion-link._tcp` on an Apple TV). It finishes early when every service answered. This is the query Homey sends today (TM-28, HY-17).
2. When AirPlay did not answer there: `options.resolve(last)`.
3. Only without a `resolve` option: a multicast scan for `_airplay._tcp` without cache, matched on MAC (`deviceid`), then on id.
4. When nothing answers at all: the attempt still connects to the last known address and port.

A hit updates `address`, the AirPlay port and TXT. The Companion Link port always comes from the latest unicast answer at the AirPlay address. The initial connect of an Apple TV runs step 1 once before the AirPlay connect, the order Homey uses today (`#discoverCompanionLink` before `tv.connect`).

### 3.5 Dropping the forced reconnect every 15 minutes

Decision: it goes. The device does not reconnect a healthy session.

Evidence:

- Homey added a periodic reconnect on 2026-01-31 (`0355389`, "companion link protocol should be more stable and reconnects every 5 minutes"), later 15 minutes in `ConnectionRecovery`. Library fixes for the instability it papered over landed after that: `267bcf5` (2026-02-02, CL exchanges hung on close/error, FX-31), `48f5273`/`e169ced`/`a99d4ae` (2026-02-20/21, the encrypted NoOp heartbeat blocked the CL connection, FX-28), `331d8ec` (2026-09-21, SetConnectionState=Disconnected now ends the session, FX-16), `86d7742` (2026-11-13, receive frames over 1024 bytes desynced the decryptor, FX-08).
- The zombie session (LC-13) needed two things: `Connection.destroy()` emitted no `close` (LC-01), and the manager reacted to data/event errors and timeouts with `controlStream.destroy()`. Since `c3bfd63` every way a `Connection` ends emits `closed` and aborts its signal (`core/src/transport/connection.ts:20`). `AirPlaySession` ends on any channel close, also a local destroy (`#channelClosed`, `airplay/src/session.ts:476`), on any data or event channel error (`#observe`, `:569`) and on SetConnectionState=Disconnected (`:585`). A session with `isOpen === true` and a dead channel can no longer exist.
- A dead AirPlay peer used to go unnoticed: feedback failures were only logged (TM-08). Now a feedback tick that finds no successful `/feedback` in the last 30 s ends the session with `timeout` (`KEEPALIVE_DEADLINE = 30000`, `session.ts:28`, `:652`). The interval stays 2 s and the requests are unchanged. Detection takes about 30 s: a receiver only flags an inactive client after tens of seconds, and a slow hub with event loop stalls can miss a few ticks without losing its session. A DHCP address change is therefore caught by the keepalive and handled by re-resolving.
- Keeping it costs every hub a full teardown per device every 15 minutes: state cleared (AP-HS-03), a new remote session on the TV, a power event, a DEVICE_INFO exchange.

What remains is a half-open Companion Link socket (peer gone without FIN). Companion Link has no request-response keepalive; the NoOp heartbeat gets no answer (TM-13). The kernel notices through TCP retransmission timeout on the heartbeat bytes, on Linux about 15 minutes with default `tcp_retries2`. That is the same bound the forced reconnect gave, so the decision does not regress Homey. LC-23 (a CL frame that fails to decrypt keeps the stream) is not a desync source: the read counter advances before the tag check (`stream.ts:154`), so the next frame decrypts again.

### 3.6 Where `ConnectionRecovery` goes

It is replaced by `lifecycle/` in devices and deleted from `core/transport` (with its export). Diagnostics is its only other user (`channels/media/recovery.ts`); see section 6.

## 4. Open points from earlier steps

**MRP model events.** The model (`MediaRemoteState`) stops announcing applied messages under their message names (`setState`, `deviceInfo`, and 23 more). Those duplicate the `DataChannel` events, which are the channel's own events. The model keeps its derived events and gets derived names where devices needs a message today: `volumeChanged(volume)`, `volumeMutedChanged(muted)`, `volumeControlChanged(available, capabilities)`, `keyboardChanged(state, attributes)`. It keeps `nowPlayingChanged`, `activePlayerChanged`, `playbackStateChanged`, `artworkChanged`, `supportedCommandsChanged`, `playbackQueueChanged`, `lyricsEvent`, `clusterChanged`, `clients`. The device forwards none of them; it emits its own `status` and capability events. Diagnostics loses nothing: it already watches the data channel for every message. This is a change in `packages/airplay/src/mrp/state.ts` inside this step.

**ST-27.** `StateController` goes, so `isKeyboardActive` that is always true goes with it. `tv.text.state.active` uses the correct model getter or the Companion Link state.

**LC-09.** Kept. The model is cleared when a new AirPlay session starts, not when one ends, and the device emits nothing at a drop. Clearing at the drop would emit `change(null)` and playback `state` events on every network blip. Homey turns those into "app stops playing" and "starts playing" flow triggers. `nowPlaying.current` documents that it is the last known value; `status` says whether it is live.

**LC-26.** The declared `recovering`/`recoveryFailed` events and `ConnectOptions.recovery` go. The `status` states `recovering` and `offline` replace them and are emitted.

**`disconnected(true|false)`.** Replaced by `status`:

| Old | New |
| --- | --- |
| `disconnected(true)` after a remote close (LC-10, LC-20) | `recovering`, reason `remote` / `timeout` / `error` |
| `disconnected(false)` from `disconnect()` (LC-11) | `disconnected`, reason `requested`; never `recovering` |
| `disconnected(false)` before a rebuild on a second `connect()` (AP-HS-02) | Nothing: `connect()` on a live device is a no-op |
| `disconnected(false)` after a failed connect (AP-HS-28, HY-04) | `recovering`, then `offline` with `connect()` rejecting; retries continue |
| CL explicit disconnect without any event (LC-18) | `status.companionLink.state` becomes `off` inside the `disconnected` status |

Nothing outside Homey and diagnostics listened to these events. In Homey the listeners are `H:src/apple-tv/device.ts:206-224` and `:247-266` and `H:src/homepod-base/device.ts:127-140`. All of them feed `ConnectionRecovery` or availability, and both move to `status`. In diagnostics `session.ts:263-274` and `channels/media/recovery.ts:125` listen; both are adapted in section 6.

## 5. Internal layout

```
packages/devices/src/
  index.ts
  types.ts                 public types that belong to no single folder (Status, DeviceTarget, options)
  errors.ts                UnavailableError
  deviceModel.ts           unchanged
  device/
    device.ts              AppleDevice: options, links, sessions, supports(), shared capabilities
    appleTv.ts             AppleTV: Companion Link link, AppleTV-only capabilities, static pair()
    homePod.ts
  lifecycle/
    link.ts                one protocol link: attempts, schedule, closed handling, abort
    schedule.ts            the delay table of section 3.2
    resolve.ts             unicast, resolve option, multicast (3.4)
    status.ts              state derivation (3.3)
    timing.ts              the shared lazy TimingServer
    log.ts                 per-device log routing
  nowPlaying/              nowPlaying.ts, snapshot.ts (Proto to own types), commands.ts (NowPlayingCommand to Proto.Command)
  playback/playback.ts
  volume/volume.ts
  remote/                  remote.ts, keys.ts (RemoteKey to HID usage and CL HidCommand)
  power/power.ts
  text/text.ts
  apps/apps.ts
  accounts/accounts.ts
  system/system.ts
  touch/touch.ts
  artwork/artwork.ts
  media/media.ts
  multiroom/multiroom.ts
  credentials/credentials.ts
  pairing/pairing.ts
  discovery/discover.ts
  catalog/                 index.ts (subpath entry), artwork.ts, lyrics.ts
```

Each capability takes two accessors at construction, `() => MediaRemote | undefined` and `() => CompanionLinkSession | undefined`, and works on the protocol sessions directly. One layer per capability, no manager in between.

Deleted: `controller/` (12 files), `internal/` (`airplay-manager.ts`, `companion-link-manager.ts`, `airplay-controls.ts`, `companion-link-state.ts`, `const.ts`, `protocol-access.ts`, `index.ts`; the Apple Music files move to `catalog/`), `configure.ts`, `discover.ts`, `device/homepod-mini.ts`, `device/device.ts` (rewritten), `pairing/pairing-session.ts`, `pairing/types.ts`, the old `types.ts`. In core: `transport/recovery.ts` and its export.

Other package changes this step needs:

- `package.json` of devices: subpath `./catalog`, and `tsdown` entry for it.
- `core/transport/context.ts`: `Context` takes an optional log sink and level list; `Logger` calls it next to the global reporter. Context stays the plain object passed down.
- `airplay/src/mrp/state.ts`: the event change in section 4.

## 6. Diagnostics after this step

Goal: it builds, and connect, remote keys, now playing, volume, audio streaming and traffic capture work through the new device. Everything else may fail at runtime with "path stops" until step 2.

- `main/index.ts`: drop `configure()`; set groups on `reporter` from `@corewire/core`.
- `main/logs.ts`, `main/traffic.ts`: import `reporter` and types from `@corewire/core`.
- `main/storage.ts`: `JsonStorage` from `@corewire/core/storage` (still there until step 2).
- `main/session.ts`: `createDevice(found, {credentials: Credentials.parse(stored), timing: sharedServer})`, where the stored credentials go through `parse` (base64 form). `#status` follows the `status` event: `connecting`, `connected`/`degraded` to `connected`, `recovering`, `offline` to `failed`, `disconnected`. On every status event it re-attaches its watchers to `device.sessions` (the sessions change after a recovery). Roots for `device:call`: `device` to the device, `airplay` to `sessions.mediaRemote`, `airplayState` to `sessions.mediaRemote?.state`, `airplayProtocol` to `sessions.airplay`, `companionLink` and `companionLinkProtocol` to `sessions.companionLink`. `disconnect()` awaits `device.disconnect()`, which also stops the retries.
- `main/events.ts`: `DEVICE_EVENTS = ['status']`; device-level sources `nowPlaying`, `volume`, `power`, `text` with their event names; `AIRPLAY_STATE_EVENTS` becomes the derived model names; `COMPANION_LINK_EVENTS` becomes the `CompanionLinkState` events. `SNAPSHOT_SOURCES` gets `dataStream`, since the model no longer echoes messages (snapshots are coalesced already).
- `main/snapshot.ts`: read the model from `sessions.mediaRemote.state`, `Proto` from `@corewire/airplay/mrp`, connection fields from `device.status`.
- `channels/media/audio.ts`: `device.media.streamAudio(source, {volume: 10 ** (volumeDb / 20)})`, -144 dB to 0, and `playUrl` through `device.media`. The default -20 dB maps to 0.1 and back to exactly `-20`, so the default capture compares byte for byte. Other dB values may differ in the last float digit of the `SET_PARAMETER` string; compare captures with the default. The PTP path keeps calling `sessions.airplay.streamAudio` directly.
- `channels/media/raw.ts`, `recovery.ts`: streams from `device.sessions`. The recovery channel drops its own `ConnectionRecovery`; `recovery:attach`/`detach` report the device status, `recovery:simulateDrop` stays.
- `channels/media/pairing.ts`: `AppleTV.pair(target)`; it stores `toString()` converted to the storage format the rest of diagnostics reads.
- `channels/tools/mdns.ts`, `features.ts`: `discover`, `getDeviceModelName`, `lookupDeviceModel`, `WAKE_PORTS` from devices; `mdnsUnicast` from `@corewire/core/discovery`; feature flags from `@corewire/airplay`.
- Renderer and agent, only for the test flows: `panels/remote/commands.ts` maps AirPlay keys to `{root: 'device', path: 'remote.press', args: [key, {mode}]}` and Companion Link keys to `{root: 'companionLink', path: 'hid.press', args: [...]}`; raw HID long and double press go to `{root: 'airplay', path: 'hid.longPress' / 'hid.doublePress'}`. `PlaybackPanel` and `VolumeControls`: `playback.togglePlayPause`, `playback.seek`, volume paths unchanged. `NowPlayingPanel`: `nowPlaying.lyrics`, types `AnimatedArtwork` and `Lyrics`. `agent/actions.ts`: `device:remote.press` with a key check, the playback and volume actions under their new names, reads `nowPlaying.current`, `volume.level`, `status`.

Diagnostics stays a consumer: no code from it moves into devices. The `diag call <device> device remote.up` recipe in `CLAUDE.md` becomes `remote.press '["up"]'`; step 3 rewrites `CLAUDE.md`.

## 7. Inventory ids and behavior changes

### 7.1 Ids

| Id | Verdict | Note |
| --- | --- | --- |
| AP-HS-01 | kept | concurrent `connect()` share one promise |
| AP-HS-02 | changed | `connect()` on a live device is a no-op |
| AP-HS-03 | kept | model cleared at the start of each AirPlay session |
| AP-HS-13 | kept | timing server announced in every SETUP; now started by the device |
| AP-HS-19, AP-HS-26 | kept | MediaRemote subscribes before connect; artwork prefetch unchanged |
| AP-HS-27 | kept | inside MediaRemote.open |
| AP-HS-28 | changed | failed connect goes to `recovering`, no `disconnected(false)` |
| CL-HS-01 | changed | CL connect is driven by the link; no public dedupe needed |
| CL-HS-02 | kept | a new CL session per attempt, old one closed first |
| CL-HS-09 | kept | `activeUserAccount` option |
| CL-HS-14 | kept | power event at each CL connect |
| CL-HS-15 | changed | a failed CL attempt schedules the next one |
| UP-HS-01 | changed | `UnavailableError` instead of "Not connected" |
| UP-HS-02, AS-HS-01 | kept | previous playback or stream stopped first |
| AS-HS-04 | kept | default -20 dB; volume now given as 0..1 |
| AS-HS-11 | changed | `streamAudio` resolves at setup; `ended` settles at the end |
| PP-HS-04 | changed | `pin()` closes on success; `close()` replaces `abort()`/`end()` |
| PP-HS-05 | kept | AirPlay credentials reused for CL |
| TM-01 | changed | covered by the quick phase over the whole handshake |
| TM-27, TM-29 | dropped / kept | ConnectionRecovery defaults gone; discovery cache unchanged |
| TM-28 | kept | unicast 5 s with knock, now inside the device |
| LC-08 | kept | media sessions end with the AirPlay session |
| LC-09 | kept | see section 4 |
| LC-10, LC-11, LC-18, LC-20 | changed | `status` replaces `disconnected(...)` |
| LC-13 | dropped | the zombie cannot occur; no forced reconnect |
| LC-24 | changed | `disconnect()` async, awaits the CL graceful stop (bounded at 10 s, then the socket is destroyed) |
| LC-25 | changed | device status follows both protocols |
| LC-26 | changed | recovery is emitted through `status` |
| LC-27, LC-28 | kept | stop and end of a newer playback unaffected |
| LC-30 to LC-32 | dropped | ConnectionRecovery is gone |
| ST-01 to ST-18 | kept | model unchanged; the snapshot maps it to own types |
| ST-19 | changed | `volume.change` only fires for a different value |
| ST-21, ST-22 | kept | through `volume.change` |
| ST-20 | kept | in MediaRemote |
| ST-25 | changed | `activeAppChanged` gone; `item.app` in `change` |
| ST-26 | changed | events during setup now reach the device consumers |
| ST-27 | changed | fixed, see section 4 |
| ST-28 to ST-31 | kept | |
| ST-33 | changed | `status.state` replaces `isConnected` |
| HY-01 | changed | no `configure`; options per device |
| HY-02, HY-03 | changed | CL attaches later; `connect()` waits for the first CL attempt |
| HY-04 to HY-07 | changed | `status` |
| HY-08 | kept | `power.change` at each CL connect |
| HY-09 to HY-12 | changed | no setters; `resolve` option; idempotent connect |
| HY-13 | changed | no 15 min forced reconnect |
| HY-14 to HY-16 | kept | same schedule inside the device |
| HY-17, HY-18 | changed | the device resolves; no hand-built results |
| HY-19, HY-20 | changed | `AppleTV.pair`, HomePod unchanged in shape |
| HY-21 to HY-31 | changed | renamed per section 2, same bytes |
| HY-32 | kept | error classes still not load-bearing; `UnavailableError` is new |
| HY-34 | changed | CL and AirPlay schedules stay independent inside the device |
| FX-21, FX-23, FX-43 | kept / dropped / kept | stale listeners impossible (signals); recovery flag gone; CL failure still never fails AirPlay |
| QK-07, QK-35 | kept | HID via `send`; volume targets the cluster UID |

### 7.2 Behavior changes toward consumers

1. Devices recover by themselves until `disconnect()`, on the schedule of section 3.2.
2. `connect()` is idempotent and rejects only after the quick phase; retries continue after the rejection. A `connect()` while `offline` runs the next attempt now.
3. No forced reconnect of a healthy session.
4. Companion Link attaches later without rebuilding the device; an Apple TV reports `degraded` meanwhile.
5. A call whose protocol is down throws `UnavailableError` immediately. Before, it threw `ConnectionClosedError` on the last session or a `TypeError` (HY-27).
6. `disconnect()` returns a promise.
7. Capability events also fire during the setup of a session (ST-26). This fixes a missed first now-playing event.
8. `streamAudio` and `playUrl` return a handle; `streamAudio` resolves at setup, not at the end.
9. Volume, repeat, shuffle and playback state use own types; Proto is gone from the API.
10. `remote.press` with `hold` or `double` prefers Companion Link.
11. `text.state.active` is correct (ST-27).
12. Credentials have a string form; `Credentials.parse` reads the old Homey and storage forms.
13. `pin()` closes the pairing connection on success.
14. The MRP model no longer emits message-named events.
15. Logs go to a per-device `log` option as well as the global reporter.
16. `HomePodMini` is `HomePod` with `model === DeviceModel.HomePodMini`.

### 7.3 Behavior changes toward devices

None on the Homey paths: every mapping in section 2 sends the bytes it sends today. Differences for other consumers or edge cases:

- Recovery traffic follows section 3: unicast DNS-SD with a knock before every retry, then the `resolve` option, or without it a multicast scan. Homey sent the same unicast; other consumers did not retry at all.
- `playUrl` on a receiver without URL playback no longer opens a connection and pairs before it fails.
- A consumer that never configured a timing server now gets the shared one, so its SETUP bodies announce `NTP` and a port instead of `None`. `timing: false` restores `None`.
- When the shared timing server fails to bind, SETUP announces `None`. Today Homey passes a server whose `listen()` failed and SETUP announces `NTP` with port 0.
- No more 15-minute teardown and rebuild of both sessions.
- Diagnostics remote presses with hold or double go over Companion Link when it is connected.

## 8. Questions for Bas

Answered; see section 0. The original questions:

1. `disconnected` as a sixth state, next to the five in the handoff. I think it is needed so "never asked" and "still trying" stay apart.
2. `remote.press` routing: tap over AirPlay, hold and double over Companion Link when connected. It keeps Homey's bytes. The alternative is an explicit `via` option, which I left out.
3. The shared timing server starts at the first connect, not at the first audio stream as the report says. Remote-control SETUP announces the timing server today (AP-HS-13), so a later start would change those bytes for Homey.
4. Dropping the 15-minute reconnect leaves a half-open Companion Link socket to the kernel's retransmission timeout, about 15 minutes. Is that acceptable, or should the device probe Companion Link (for example `FetchAttentionState` every few minutes, new bytes on the wire)?
5. Is a multicast scan from inside the Homey app allowed and reliable? If not, Homey relies on the `resolve` option and the unicast step, which is what it does today.
