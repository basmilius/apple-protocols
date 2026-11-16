# @apple-protocols/companion-link

```ts
import { CompanionLinkSession, connect, pair } from '@apple-protocols/companion-link';
```

See [Companion Link](/protocols/companion-link).

## Sessions

| Export | Description |
| --- | --- |
| `connect(target: CompanionLinkTarget, options: ConnectOptions): Promise<CompanionLinkSession>` | Pair-verify, encryption and the startup. Throws `CredentialsError`, `PairingError`, `ConnectionClosedError` |
| `pair(target: CompanionLinkTarget, options?: PairOptions): Promise<PinPairing>` | Sends pair-setup M1; the Apple TV shows its PIN |
| `discover(options?: DiscoverOptions): Promise<DiscoveryResult[]>` | The devices that accept Companion Link; `DiscoverOptions` comes from `@apple-protocols/core/discovery` |
| `toTarget(result: DiscoveryResult): CompanionLinkTarget` | |
| `COMPANION_LINK_SERVICE` | `'_companion-link._tcp.local'` |

### CompanionLinkSession

`class CompanionLinkSession extends EventEmitter<{closed: [reason: SessionCloseReason, error?: Error]}>`

| Member | Description |
| --- | --- |
| `closeReason: SessionCloseReason \| undefined` | |
| `context: Context` | |
| `isOpen: boolean` | |
| `signal: AbortSignal` | Aborts when the session ends |
| `sourceVersion: string` | The source version the device reported, such as `715.2`; `0` when it sent none |
| `stream: Stream` | The encrypted OPack stream, for raw frames |
| `supportsMediaControl: boolean` | Source version 250.3 or later |
| `supportsSiriPTT: boolean` | Siri push-to-talk; source version 600.20 or later |
| `supportsTextInput: boolean` | Source version 340.15 or later |
| `target: CompanionLinkTarget` | |
| `accounts: Accounts`, `apps: Apps`, `hid: Hid`, `interests: Interests`, `media: Media`, `power: Power`, `system: System`, `text: Text`, `touch: Touch` | The groups |
| `state: CompanionLinkState` | |
| `close(): Promise<void>` | Ends the session. Resolves also when closing the socket fails; that logs a warning |
| `noOp(): void` | Sends a NoOp frame, which stays plaintext |
| event `closed` | Fires once |

### PinPairing

| Member | Description |
| --- | --- |
| `signal: AbortSignal` | |
| `pin(code: string): Promise<AccessoryCredentials>` | Finishes pair-setup |
| `close(): void` | |

### SetupClosedError

`class SetupClosedError extends ConnectionClosedError` with `reason: SessionCloseReason`. The device or the socket ended the connection after it opened and before the session was ready.

## Groups

| Class | Members |
| --- | --- |
| `Accounts` | `list(): Promise<UserAccount[]>`, `switch(accountId)`, `switchActive(iCloudAltDSID)`, `requestAppSignIn(bundleId, requestType?)`, `requestTVProvider(providerUrl, providerName)`, `requestRestrictedAccess(restrictionType)` |
| `Apps` | `list(): Promise<LaunchableApp[]>`, `launch(bundleId)`, `openUrl(url)`, `topShelf()` |
| `Hid` | `command(command: HidCommandKey, down?)`, `press(command: HidCommandKey, type?: ButtonPressType, holdDelayMs?)`, `gameControllerStart()`, `gameControllerStop()`, `sendGameControllerEvent(x, y, isDown)` |
| `Interests` | `register(events)`, `deregister(events)`, `subscribe(event, listener)`, `unsubscribe(event, listener?)` |
| `Media` | `capabilities`, `flags`, `nowPlayingInfo`, `supportedActions`, `volumeAvailable`, `command(command: MediaControlCommandKey, content?)`, `skipBy(seconds)`, `fetchControlStatus()`, `fetchNowPlayingInfo()`, `fetchSupportedActions()`, `play(item)` |
| `Power` | `attentionState`, `fetch(): Promise<AttentionState>`, `isAwake()`, `wake()`, `sleep()` |
| `System` | `toggleCaptions()`, `getCaptionSetting()`, `setCaptionSetting(enabled)`, `setAppearance(light: boolean)`, `setReduceLoudSounds(enabled)`, `setFindingMode(enabled)`, `siriStart()`, `siriStop()`, `siriRemoteInfo()`, `fetchUpNext(paginationToken?)`, `addToUpNext(identifier, kind)`, `removeFromUpNext(identifier, kind)`, `markAsWatched(identifier, kind)` |
| `Text` | `state: TextInputState`, `set(text)`, `append(text)`, `clear()`, `command(text, clearPreviousInput)`, `start()`, `stop()` |
| `Touch` | `tap(holdMs?)`, `swipe(direction: SwipeDirection, duration?)`, `send(finger, phase, x, y)`, `sendHid(finger, phase, x, y)` |

## State

`class CompanionLinkState extends EventEmitter<CompanionLinkStateEventMap>`

| Member | Description |
| --- | --- |
| `attentionState: AttentionState` | |
| `mediaCapabilities: MediaCapabilities`, `mediaControlFlags: number` | |
| `nowPlayingInfo: Record<string, unknown> \| null` | |
| `supportedActions: Record<string, unknown> \| null` | |
| `textInputState: TextInputState` | |
| `volumeAvailable: boolean` | |
| `apply(name: string, content: unknown): void` | Applies one event |
| `clear(): void` | |

Events: `attentionStateChanged: [AttentionState]`, `mediaControlFlagsChanged: [flags, capabilities]`, `nowPlayingInfoChanged: [info]`, `supportedActionsChanged: [actions]`, `textInputChanged: [TextInputState]`, `volumeAvailabilityChanged: [available]`.

## Transport

| Export | Description |
| --- | --- |
| `Stream` | The encrypted Companion Link connection: `exchange(type, message, timeout?)`, `sendOPack(type, message)`, `send(type, payload)`, event `event: [name, content]` |
| `Channel` | Requests and events on a stream: `exchange(message)`, `send(message)`, `listen(name, listener)`, `unlisten(name, listener)`, `signal`, `isConnected` |
| `Messages` | Builders for the OPack messages the groups send |
| `FrameType`, `MessageType`, `OPackFrameTypes`, `PairingFrameTypes` | Frame and message type constants |
| `HidCommand`, `MediaControlCommand`, `MediaControlFlag` | Command and flag constants |
| `HidTouchPhase`, `TouchPhase` | Touch phases for HID touch events (1-based) and touch events (0-based) |
| `convertAttentionState(state: number): AttentionState` | |

## Types

| Type | Definition |
| --- | --- |
| `CompanionLinkTarget` | `{address: string; port: number; id?: string; txt?: Readonly<Record<string, string>>}` |
| `ConnectOptions` | `{credentials: AccessoryCredentials; context?: Context; identity?: DeviceIdentity; activeUserAccount?: string; state?: CompanionLinkState; signal?: AbortSignal}`. `identity.name` is the name in `_systemInfo` and in the pair-setup M5 message, `Apple Protocols` when omitted |
| `PairOptions` | `Pick<ConnectOptions, 'context' \| 'identity' \| 'signal'>` |
| `SessionCloseReason` | `'local' \| 'remote' \| 'timeout' \| 'error'` |
| `AttentionState` | `'unknown' \| 'asleep' \| 'screensaver' \| 'awake' \| 'idle'` |
| `ButtonPressType` | `'DoubleTap' \| 'Hold' \| 'SingleTap'` |
| `LaunchableApp` | `{bundleId: string; name: string}` |
| `UserAccount` | `{accountId: string; name: string}` |
| `MediaCapabilities` | Booleans `play`, `pause`, `nextTrack`, `previousTrack`, `fastForward`, `rewind`, `volume`, `skipForward`, `skipBackward` |
| `TextInputState` | `{isActive; documentText; isSecure; keyboardType; autocorrection; autocapitalization}` |
| `SwipeDirection` | `'up' \| 'down' \| 'left' \| 'right'` |
| `HidCommandKey`, `MediaControlCommandKey` | The keys of `HidCommand` and `MediaControlCommand` |
| `TouchPhaseValue`, `HidTouchPhaseValue` | The values of `TouchPhase` and `HidTouchPhase` |
| `CompanionLinkStateEventMap`, `StreamEventMap` | Event maps |
| `EventListener` | `(content: unknown) => void` |
| `Reply` | `Record<string, any>` |
