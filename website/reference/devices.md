# @corewire/devices

```ts
import { AppleTV, HomePod } from '@corewire/devices';
```

## Devices

### AppleDevice

`abstract class AppleDevice<TCapability extends AppleTVCapability = Capability> extends EventEmitter<{status: [status: Status]}>`

The base of `AppleTV` and `HomePod`. Its constructor is protected. See [Apple TV and HomePod](/guide/devices).

| Member | Description |
| --- | --- |
| `address: string` | The current address |
| `id: string` | The target id, or the address |
| `model: DeviceModel` | From `modelName` |
| `modelName: string` | The model identifier, such as `AudioAccessory5,1`; empty until known |
| `name: string` | From the TXT record or `/info`; the id until known |
| `sessions: DeviceSessions` | The protocol sessions in use now |
| `status: Status` | The current status |
| `artwork: ArtworkControl` | [Artwork](/guide/now-playing#artwork) |
| `media: MediaControl` | [URLs and audio streams](/guide/media) |
| `multiroom: MultiroomControl` | [Multiroom](/guide/multiroom) |
| `nowPlaying: NowPlayingControl` | [Now playing](/guide/now-playing) |
| `playback: PlaybackControl` | [Playback](/guide/playback) |
| `remote: RemoteControl` | [Remote](/guide/remote) |
| `volume: VolumeControl` | [Volume](/guide/volume) |
| `connect(): Promise<void>` | Keeps the device connected until `disconnect()`. Resolves the first time it is connected or degraded; rejects when the first attempt and the quick retries failed |
| `disconnect(): Promise<void>` | Stops every retry and closes every session. Idempotent |
| `supports(capability: TCapability): boolean` | Whether the capability works now |
| event `status` | Fires on every change of the status |

### AppleTV

`class AppleTV extends AppleDevice<AppleTVCapability>`

| Member | Description |
| --- | --- |
| `constructor(target: DeviceTarget, options: AppleTVOptions = {})` | |
| `accounts: AccountsControl` | User accounts |
| `apps: AppsControl` | Apps |
| `power: PowerControl` | Power state, wake and sleep |
| `system: SystemControl` | System settings and Siri |
| `text: TextControl` | Text input |
| `touch: TouchControl` | Touch surface |
| `static pair(target: DeviceTarget, options: PairOptions = {}): Promise<Pairing>` | Starts a PIN pairing; the PIN shows on screen once this resolves |

### HomePod

`class HomePod extends AppleDevice<HomePodCapability>`

| Member | Description |
| --- | --- |
| `constructor(target: DeviceTarget, options: DeviceOptions = {})` | A HomePod, HomePod mini or second generation HomePod |

## Discovery

| Export | Description |
| --- | --- |
| `discover(options: DiscoverOptions = {}): Promise<DiscoveredDevice[]>` | One multicast scan for AirPlay, Companion Link and RAOP; services of one host merge by address |
| `createDevice(found: DiscoveredDevice, options: AppleTVOptions = {}): AppleTV \| HomePod` | An `AppleTV` for the Apple TV family, a `HomePod` for every other receiver |
| `WAKE_PORTS: readonly number[]` | Ports knocked on to wake a device: `[7000, 3689, 49152, 32498]` |

## Credentials and pairing

### Credentials

`class Credentials`

| Member | Description |
| --- | --- |
| `static from(credentials: AccessoryCredentials): Credentials` | Wraps credentials from a protocol `pair()` |
| `static parse(value: string \| Readonly<Record<string, unknown>>): Credentials` | Reads the string form, an object with the five fields (hex or base64), or JSON of such an object. Throws `CredentialsError` |
| `toString(): string` | `cw1.` and five base64url fields |
| `toJSON(): string` | The same as `toString()` |

### Pairing

`class Pairing`

| Member | Description |
| --- | --- |
| `pin(code: string): Promise<Credentials>` | Runs pair-setup with the PIN. Closes the connection on success; a wrong PIN keeps it open |
| `close(): void` | Closes the connection without credentials |

Start one with `AppleTV.pair()`.

## Errors

### UnavailableError

`class UnavailableError extends AppleProtocolError`

| Member | Description |
| --- | --- |
| `constructor(capability: string, reason: 'disconnected' \| 'unsupported', message?: string)` | |
| `capability: string` | The capability that was called |
| `reason: 'disconnected' \| 'unsupported'` | Its protocol is down, or the device cannot do it |

## Device models

| Export | Description |
| --- | --- |
| `enum DeviceModel` | `Unknown`, `AppleTVGen2`, `AppleTVGen3`, `AppleTVHD`, `AppleTV4K`, `AppleTV4KGen2`, `AppleTV4KGen3`, `HomePod`, `HomePodMini`, `HomePodGen2`, `AirPortExpress`, `AirPortExpressGen2` |
| `enum DeviceFamily` | `Unknown`, `AppleTV`, `HomePod`, `AirPort` |
| `lookupDeviceModel(identifier: string): DeviceModel` | From a model identifier (`AppleTV6,2`) or an internal name (`J305AP`) |
| `getDeviceModelName(model: DeviceModel): string` | A display name, such as `Apple TV 4K (2nd generation)` |
| `getDeviceFamily(model: DeviceModel): DeviceFamily` | The family of a model |
| `isAppleTV(model: DeviceModel): boolean` | |
| `isHomePod(model: DeviceModel): boolean` | |
| `isAirPort(model: DeviceModel): boolean` | |

## Capability types

These classes are exported as types. You reach them through a device.

### AccountsControl

| Member | Description |
| --- | --- |
| `list(): Promise<Account[]>` | The user accounts |
| `switch(id: string): Promise<void>` | Makes an account the active user |

### AppsControl

| Member | Description |
| --- | --- |
| `list(): Promise<App[]>` | The launchable apps |
| `launch(bundleId: string): Promise<void>` | Opens an app |
| `openUrl(url: string): Promise<void>` | Opens a universal link or an app URL scheme |

### ArtworkControl

| Member | Description |
| --- | --- |
| `get(width = 600, height = -1): Promise<Artwork \| null>` | The artwork of what plays now; a height of -1 keeps the aspect ratio |
| `getAnimated(width = 600, height = -1): Promise<AnimatedArtwork[]>` | The animated artwork formats the device knows |

### MediaControl

| Member | Description |
| --- | --- |
| `playUrl(url: string, options: PlayUrlOptions = {}): Promise<MediaPlayback>` | Has the device fetch and play a URL. Throws `UnavailableError` (`unsupported`) on a device that cannot, `PlaybackError` when it refuses the URL |
| `streamAudio(source: AudioSource, options: StreamAudioOptions = {}): Promise<MediaPlayback>` | Streams audio to the device |

### MediaPlayback

| Member | Description |
| --- | --- |
| `kind: 'url' \| 'audio'` | |
| `ended: Promise<void>` | Settles when playback ended; for a URL, watching starts at the first read |
| `stop(): void` | Stops playback and closes its connection |

### MultiroomControl

| Member | Description |
| --- | --- |
| `clusterId: string \| null` | The group id |
| `isClusterAware: boolean` | |
| `isLeader: boolean` | |
| `add(...deviceUids: string[]): Promise<void>` | Adds output devices to the group |
| `remove(...deviceUids: string[]): Promise<void>` | Removes output devices |
| `set(...deviceUids: string[]): Promise<void>` | Replaces the whole group |

### NowPlayingControl

`extends EventEmitter`

| Member | Description |
| --- | --- |
| `current: NowPlaying \| null` | The current item; the last announced one while a reconnect restores |
| `elapsed: number` | Elapsed seconds now, extrapolated while playing |
| `supports(command: NowPlayingCommand): boolean` | Whether the now playing app accepts the command |
| `lyrics(): Promise<Lyrics \| null>` | Lyrics of the current item from the playback queue |
| event `change: [item: NowPlaying \| null]` | The item differs from the last one emitted |
| event `state: [state: PlaybackState, previous: PlaybackState, item: NowPlaying]` | The playback state differs from the last one announced |
| event `artwork: [item: NowPlaying]` | The artwork of the current item changed |

`hold()`, `resume()` and `stop()` are public for the device class and not meant for you.

### PlaybackControl

| Member | Description |
| --- | --- |
| `play()`, `pause()`, `togglePlayPause()`, `stop()`: `Promise<void>` | Transport |
| `next(): Promise<void>`, `previous(): Promise<void>` | |
| `skipForward(seconds = 15): Promise<void>`, `skipBackward(seconds = 15): Promise<void>` | |
| `seek(seconds: number): Promise<void>` | Position from the start |
| `setRepeat(mode: RepeatMode): Promise<void>` | |
| `setShuffle(mode: ShuffleMode): Promise<void>` | |
| `setRate(rate: number): Promise<void>` | 1 is normal speed |

### PowerControl

`extends EventEmitter`

| Member | Description |
| --- | --- |
| `state: PowerState` | The last reported state; `unknown` before Companion Link reported one |
| `wake(): Promise<void>` | The wake key over AirPlay |
| `sleep(): Promise<void>` | The suspend key over AirPlay |
| event `change: [state: PowerState]` | Every report, including the one each Companion Link connect fetches |

### RemoteControl

| Member | Description |
| --- | --- |
| `press(key: RemoteKey, options: PressOptions = {}): Promise<void>` | Presses a key; throws `UnavailableError` when no connected protocol knows it |

### SystemControl

| Member | Description |
| --- | --- |
| `toggleCaptions(): Promise<void>` | |
| `setAppearance(mode: 'light' \| 'dark'): Promise<void>` | |
| `setReduceLoudSounds(enabled: boolean): Promise<void>` | |
| `setFindingMode(enabled: boolean): Promise<void>` | Find My mode |
| `startSiri(): Promise<void>`, `stopSiri(): Promise<void>` | |

### TextControl

`extends EventEmitter`

| Member | Description |
| --- | --- |
| `state: TextState` | The text input state, from Companion Link or else AirPlay |
| `set(text: string): Promise<void>` | Replaces the text of the focused field |
| `append(text: string): Promise<void>` | |
| `clear(): Promise<void>` | |
| event `change: [state: TextState]` | |

### TouchControl

| Member | Description |
| --- | --- |
| `tap(holdMs?: number): Promise<void>` | Selects what has focus; held when `holdMs` is given |
| `swipe(direction: SwipeDirection, durationMs?: number): Promise<void>` | 200 ms when omitted |

### VolumeControl

`extends EventEmitter implements VolumeState`

| Member | Description |
| --- | --- |
| `level: number`, `muted: boolean`, `available: boolean`, `mode: VolumeMode` | The current values |
| `set(level: number): Promise<void>` | Clamped to 0 to 1; needs mode `absolute` |
| `up(): Promise<void>`, `down(): Promise<void>` | A 0.05 step, or the volume key in mode `relative` |
| `mute()`, `unmute()`, `toggleMute()`: `Promise<void>` | |
| `fade(level: number, durationMs: number): Promise<void>` | |
| event `change: [volume: VolumeState]` | One of the values differs from the last one emitted |

## Types

| Type | Definition |
| --- | --- |
| `DeviceTarget` | `{address: string; port?: number; txt?: Readonly<Record<string, string>>; id?: string}` |
| `DeviceOptions` | `{log?(entry: LogEntry): void; logLevels?: readonly LogLevel[]; timing?: TimingServer \| false; resolve?(last: DeviceTarget): Promise<DeviceTarget \| null>; identity?: ClientIdentity}` |
| `AppleTVOptions` | `DeviceOptions & {credentials?: Credentials; activeUserAccount?: string}` |
| `PairOptions` | `{identity?: ClientIdentity; signal?: AbortSignal}` |
| `ClientIdentity` | `Partial<{name; model; osName; osVersion; osBuildVersion; sourceVersion}>`, all strings |
| `LogLevel` | `'debug' \| 'error' \| 'info' \| 'net' \| 'raw' \| 'warn'` |
| `LogEntry` | `{level: LogLevel; device: string; message: string; args: readonly unknown[]; timestamp: number}` |
| `DeviceState` | `'disconnected' \| 'connecting' \| 'connected' \| 'degraded' \| 'recovering' \| 'offline'` |
| `StatusReason` | `'requested' \| 'established' \| 'remote' \| 'timeout' \| 'error' \| 'failed' \| 'scheduled'` |
| `LinkState` | `'off' \| 'connecting' \| 'connected' \| 'waiting'` |
| `RetryPhase` | `'quick' \| 'slow' \| 'rare'` |
| `ProtocolStatus` | `{state: LinkState; attempt: number; phase: RetryPhase \| null; nextAttemptAt: number \| null; error: Error \| null}` |
| `Status` | `{state: DeviceState; reason: StatusReason; error: Error \| null; airplay: ProtocolStatus; companionLink?: ProtocolStatus}` |
| `Capability` | `'remote' \| 'nowPlaying' \| 'playback' \| 'volume' \| 'artwork' \| 'multiroom' \| 'streamAudio' \| 'playUrl'` |
| `HomePodCapability` | `Capability` |
| `AppleTVCapability` | `Capability \| 'text' \| 'power' \| 'apps' \| 'accounts' \| 'system' \| 'touch'` |
| `DeviceSessions` | `{airplay?: AirPlaySession; mediaRemote?: MediaRemote; companionLink?: CompanionLinkSession}` |
| `PlaybackState` | `'playing' \| 'paused' \| 'stopped' \| 'interrupted' \| 'seeking' \| 'unknown'` |
| `RepeatMode` | `'off' \| 'one' \| 'all'` |
| `ShuffleMode` | `'off' \| 'albums' \| 'songs'` |
| `MediaKind` | `'audio' \| 'video' \| 'unknown'` |
| `NowPlaying` | The now playing snapshot; see [the fields](/guide/now-playing#the-nowplaying-snapshot) |
| `NowPlayingSeries` | `{name: string; season: number; episode: number; episodeTitle: string}` |
| `NowPlayingCommand` | `'play' \| 'pause' \| 'togglePlayPause' \| 'stop' \| 'next' \| 'previous' \| 'skipForward' \| 'skipBackward' \| 'seek' \| 'repeat' \| 'shuffle' \| 'rate'` |
| `Lyrics` | `{identifier: string; text: string \| null; available: boolean \| null; url: string \| null; catalogId: string \| null}` |
| `VolumeMode` | `'absolute' \| 'relative' \| 'none'` |
| `VolumeState` | `{level: number; muted: boolean; available: boolean; mode: VolumeMode}` |
| `RemoteKey` | The 33 key names; see [Remote](/guide/remote#which-protocol-sends-the-key) |
| `PressMode` | `'tap' \| 'double' \| 'hold'` |
| `PressOptions` | `{mode?: PressMode; holdMs?: number}` |
| `PowerState` | `'unknown' \| 'asleep' \| 'screensaver' \| 'awake' \| 'idle'` |
| `TextState` | `{active: boolean; text: string; secure: boolean; keyboardType: number; autocorrection: boolean; autocapitalization: boolean}` |
| `App` | `{bundleId: string; name: string}` |
| `Account` | `{id: string; name: string}` |
| `SwipeDirection` | `'up' \| 'down' \| 'left' \| 'right'` |
| `Artwork` | `{url: string \| null; data: Uint8Array \| null; mimeType: string; identifier: string \| null; width: number; height: number}` |
| `AnimatedArtwork` | `{format: string; url: string \| null; source?: 'device' \| 'apple-music'}` |
| `AudioSource` | The audio source interface of `@corewire/airplay`, re-exported |
| `PlayUrlOptions` | `{position?: number; signal?: AbortSignal}` |
| `StreamAudioOptions` | `{volume?: number; signal?: AbortSignal}`; volume is 0 to 1 |
| `ServiceRecord` | `{name: string; port: number; txt: Readonly<Record<string, string>>}` |
| `DiscoveredDevice` | `{id; name; address; model: DeviceModel; modelName; family: DeviceFamily; mac: string \| null; target: DeviceTarget; services: {airplay?; companionLink?; raop?: ServiceRecord}}` |
| `DiscoverOptions` | `{useCache?: boolean}`; default true |

## @corewire/devices/catalog

```ts
import { fetchAnimatedArtwork, fetchLyrics } from '@corewire/devices/catalog';
```

| Export | Description |
| --- | --- |
| `fetchAnimatedArtwork(albumId: string, options: AnimatedArtworkOptions = {}): Promise<AnimatedArtwork[]>` | The animated artwork of an album, from its public Apple Music page |
| `fetchLyrics(catalogId: string, options: AppleMusicLyricsOptions): Promise<string \| null>` | The TTML lyrics of a song from the Apple Music catalog; null when it has none |
| type `AnimatedArtworkOptions` | `{storefront?: string; signal?: AbortSignal}`; storefront `us` when omitted |
| type `AppleMusicLyricsOptions` | `{bearerToken: string; musicUserToken: string; storefront: string; language?: string; script?: string; signal?: AbortSignal}` |
| type `AnimatedArtwork` | The same type as in the main entry point |

See [Apple Music catalog](/guide/catalog).
