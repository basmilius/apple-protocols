# @corewire/airplay/mrp

```ts
import { MediaRemote, MediaRemoteState } from '@corewire/airplay/mrp';
```

See [Media Remote (MRP)](/protocols/mrp).

## MediaRemote

| Member | Description |
| --- | --- |
| `static open(session: AirPlaySession, options?: MediaRemoteOptions): Promise<MediaRemote>` | Opens remote control and runs the MRP startup. Throws `SetupError`, `TimeoutError`, `ConnectionClosedError` |
| `constructor(session: AirPlaySession, channel: DataChannel, state: MediaRemoteState)` | Use `open()` |
| `channel: DataChannel` | |
| `artwork: Artwork` | |
| `commands: Commands` | |
| `hid: Hid` | |
| `keyboard: Keyboard` | |
| `outputDevices: OutputDevices` | |
| `playbackQueue: PlaybackQueue` | |
| `state: MediaRemoteState` | |
| `volume: Volume` | |
| `wake(): Promise<void>` | Sends WAKE_DEVICE |

`MediaRemoteOptions` is `{state?: MediaRemoteState}`.

## MediaRemoteState

`class MediaRemoteState extends EventEmitter<MediaRemoteStateEventMap>`

| Member | Description |
| --- | --- |
| `constructor()` | |
| `apply(name, message): void` | Applies one decoded message, as `apply(...decodeMessage(message))` |
| `clear(): void` | Resets every value |
| `clients: Record<string, Client>` | By bundle identifier |
| `nowPlayingClient: Client \| null` | |
| `isKeyboardActive: boolean`, `keyboardState`, `keyboardAttributes` | |
| `outputDeviceUID: string \| null`, `outputDevices: AVOutputDeviceDescriptor[]` | |
| `clusterID: string \| null`, `clusterType: number`, `isClusterAware: boolean`, `isClusterLeader: boolean` | |
| `participants: PlaybackQueueParticipant[]` | |
| `artworkJpegData: Uint8Array \| null` | |
| `volume: number`, `volumeAvailable: boolean`, `volumeCapabilities`, `volumeMuted: boolean` | |

`MediaRemoteStateEventMap`:

| Event | Arguments |
| --- | --- |
| `activePlayerChanged` | `client: Client \| null, player: Player \| null` |
| `artworkChanged` | `client: Client, player: Player` |
| `clients` | `Record<string, Client>` |
| `clusterChanged` | `clusterID: string \| null, isLeader: boolean` |
| `keyboardChanged` | `state: KeyboardState_Enum, attributes: TextEditingAttributes \| null` |
| `lyricsEvent` | `event: LyricsEvent, playerPath: PlayerPath \| undefined` |
| `nowPlayingChanged` | `client: Client \| null, player: Player \| null` |
| `outputDevicesChanged` | `devices: AVOutputDeviceDescriptor[]` |
| `participantsChanged` | `participants: PlaybackQueueParticipant[]` |
| `playbackQueueChanged` | `client: Client, player: Player` |
| `playbackStateChanged` | `client: Client, player: Player, oldState: PlaybackState_Enum, newState: PlaybackState_Enum` |
| `supportedCommandsChanged` | `client: Client, player: Player, commands: CommandInfo[]` |
| `volumeChanged` | `volume: number` |
| `volumeControlChanged` | `available: boolean, capabilities: VolumeCapabilities_Enum` |
| `volumeMutedChanged` | `muted: boolean` |

## Client and Player

`Client` is an app, identified by its bundle identifier. `Player` is a player within it.

| Member | On | Description |
| --- | --- | --- |
| `bundleIdentifier`, `players: Map<string, Player>`, `activePlayer: Player \| null` | Client | |
| `identifier`, `isDefaultPlayer` | Player | |
| `displayName` | both | |
| `title`, `artist`, `album`, `genre`, `seriesName`, `seasonNumber`, `episodeNumber`, `episodeTitle`, `contentRating`, `contentIdentifier`, `mediaType`, `duration` | both | Item metadata |
| `playbackState`, `playbackStateTimestamp`, `playbackRate`, `isPlaying`, `shuffleMode`, `repeatMode` | both | Playback |
| `elapsedTime` | both | Seconds, extrapolated from the state timestamp and the rate |
| `nowPlayingInfo`, `playbackQueue`, `currentItem`, `currentItemMetadata`, `currentItemLyrics` | both | Raw protobuf values |
| `artworkId`, `artworkUrl(width?, height?)`, `currentItemArtwork`, `currentItemArtworkUrl` | both | Artwork |
| `supportedCommands`, `findCommand(command)`, `isCommandSupported(command)` | both | Commands |
| `getOrCreatePlayer()`, `setActivePlayer()`, `removePlayer()`, `setDefaultSupportedCommands()`, `updateDisplayName()` | Client | Used by the state |
| `setNowPlayingInfo()`, `setPlaybackQueue()`, `setPlaybackState()`, `setSupportedCommands()`, `updateContentItem()` | Player | Used by the state |

`DEFAULT_PLAYER_ID` is `'MediaRemote-DefaultPlayer'`.

## Parts

### Hid

| Member | Description |
| --- | --- |
| `up()`, `down()`, `left()`, `right()`, `menu()`, `select()`, `home()`, `topMenu()` | Navigation |
| `play()`, `pause()`, `playPause()`, `stop()`, `next()`, `previous()` | Media keys |
| `volumeUp()`, `volumeDown()`, `mute()`, `channelUp()`, `channelDown()` | |
| `suspend()`, `wake()` | |
| `press(usePage: number, usage: number): Promise<void>` | Key-down, 25 ms, key-up |
| `longPress(usePage: number, usage: number, duration?: number): Promise<void>` | Held for `duration` ms |
| `doublePress(usePage: number, usage: number): Promise<void>` | |

All named keys return `Promise<void>`.

### Commands

| Member | Description |
| --- | --- |
| `send(command: Command, options?: CommandOptions): Promise<SendCommandResultMessage \| undefined>` | Any command. Throws `SendCommandError` |
| `play()`, `pause()`, `togglePlayPause()`, `stop()`, `nextTrack()`, `previousTrack()` | |
| `skipForward(interval?)`, `skipBackward(interval?)`, `seekToPosition(position)` | |
| `setShuffleMode(mode)`, `setRepeatMode(mode)`, `advanceShuffleMode()`, `advanceRepeatMode()`, `changePlaybackRate(rate)` | |
| `beginFastForward()`, `endFastForward()`, `beginRewind()`, `endRewind()`, `nextChapter()`, `previousChapter()` | |
| `likeTrack()`, `dislikeTrack()`, `bookmarkTrack()`, `addNowPlayingItemToLibrary()` | |
| `setSleepTimer(seconds: number, stopMode?: number)` | |

### SendCommandError

`class SendCommandError extends CommandError` with `sendError: SendError_Enum` and `handlerReturnStatus: HandlerReturnStatus_Enum`.

### Volume

| Member | Description |
| --- | --- |
| `get(): Promise<number>`, `set(volume: number): Promise<void>` | 0 to 1 |
| `up()`, `down()`, `mute()`, `unmute()`, `toggleMute()` | |
| `fade(targetVolume: number, durationMs: number): Promise<void>` | |
| `audioFade(fadeType: number): Promise<void>` | |
| `setForDevice(outputDeviceUID, volume)`, `getForDevice(outputDeviceUID)`, `muteDevice(outputDeviceUID)`, `unmuteDevice(outputDeviceUID)` | Per output device |
| `adjust(adjustment, outputDeviceUID?)` | A relative adjustment |

### Keyboard

`set(text)`, `append(text)`, `clear()` and `getSession()`, all `Promise<void>`. Operations run one at a time, in call order.

### OutputDevices

`add(deviceUIDs: string[])`, `remove(deviceUIDs: string[])`, `set(deviceUIDs: string[])`, `setConversationDetectionEnabled(enabled: boolean)` and `setListeningMode(mode: string)`, all `Promise<void>`.

### PlaybackQueue

| Member | Description |
| --- | --- |
| `request(length: number, artworkWidth?: number, artworkHeight?: number): Promise<void>` | The queue lands in the state |
| `requestAssets(options?, width?, height?): Promise<ContentItem \| null>` | Lyrics and artwork formats of the current item |

### Artwork

| Member | Description |
| --- | --- |
| `get(width?: number, height?: number): Promise<ArtworkResult \| null>` | |
| `getAnimated(width?: number, height?: number): Promise<AnimatedArtworkResult[]>` | |
| `clear(): void` | |

`ArtworkResult` is `{url; data: Uint8Array \| null; mimeType; identifier; width; height}`. `AnimatedArtworkResult` is `{format; url; source?: 'device' \| 'apple-music'}`.

## Codec

| Export | Description |
| --- | --- |
| `parseMessages(content: Buffer): ProtocolMessage[]` | Splits varint-prefixed messages |
| `decodeMessage(message: ProtocolMessage): MrpMessage \| null` | A `[name, extension]` pair; null for an unknown type |
| `describeProtocolMessage(message: ProtocolMessage): Record<string, unknown>` | A plain object for logs |
| type `MrpMessageMap` | The decoded extension per message name |
| type `MrpMessageName` | `keyof MrpMessageMap` |
| type `MrpMessage` | A `[name, extension]` pair |

## Messages

`Messages` builds `[ProtocolMessage, DescExtension]` pairs for `DataChannel.send()` and `exchange()`:

`protocol`, `clientUpdatesConfig`, `configureConnection`, `deviceInfo`, `modifyOutputContext`, `getState`, `getVolume`, `getVolumeMuted`, `notification`, `playbackQueueRequest`, `getKeyboardSession`, `getRemoteTextInputSession`, `remoteTextInput`, `textInput`, `sendButtonEvent`, `sendCommand`, `sendCommandWithSkipInterval`, `sendCommandWithPlaybackPosition`, `sendCommandWithPlaybackRate`, `sendCommandWithShuffleMode`, `sendCommandWithRepeatMode`, `sendCommandWithSleepTimer`, `registerHIDDevice`, `sendPackedVirtualTouchEvent`, `sendVirtualTouchEvent`, `sendHIDEvent`, `setConnectionState`, `setReadyState`, `setVolume`, `setVolumeMuted`, `setConversationDetectionEnabled`, `adjustVolume`, `audioFade`, `setListeningMode`, `setDiscoveryMode`, `requestGroupSession`, `playbackSessionMigrateBegin`, `playbackSessionMigrateEnd`, `wakeDevice`, and `getExtension(message, extension)` to read an extension. The type `PlaybackQueueAssetOptions` belongs to `playbackQueueRequest`.

## Proto

`Proto` holds the generated protobuf messages and enums of the Media Remote Protocol, such as `ProtocolMessage`, `ProtocolMessage_Type`, `Command`, `PlaybackState_Enum`, `RepeatMode_Enum`, `ShuffleMode_Enum` and `VolumeCapabilities_Enum`.
