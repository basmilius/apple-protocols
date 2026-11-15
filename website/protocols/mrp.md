# Media Remote (MRP)

```ts
import { MediaRemote, MediaRemoteState } from '@corewire/airplay/mrp';
```

The Media Remote Protocol carries remote control, now playing, volume and text input inside an AirPlay session. Its messages are protobuf `ProtocolMessage`s on the data channel.

## Opening

```ts
import { connect } from '@corewire/airplay';
import { MediaRemote } from '@corewire/airplay/mrp';

const session = await connect({address: '192.168.1.30'});
const remote = await MediaRemote.open(session);

remote.state.on('nowPlayingChanged', (client, player) => {
    console.log(client?.bundleIdentifier, player?.title);
});

await remote.hid.select();
await remote.commands.pause();

await session.close();
```

`MediaRemote.open(session, options?)` opens remote control on the session and runs the MRP startup: DEVICE_INFO as an exchange, then the connection state, the update subscription and GET_STATE. The state listens from before the data channel connects, so it misses nothing. A failed startup ends the session. It throws `SetupError`, `TimeoutError` (DEVICE_INFO got no reply) or `ConnectionClosedError`.

Pass `{state}` to feed a `MediaRemoteState` you keep across sessions. `open()` does not clear it. Call `state.clear()` when a new session should start empty.

A `MediaRemote` lives as long as its session.

## The parts

| Part | Class | What it does |
| --- | --- | --- |
| `hid` | `Hid` | Keys as USB HID events: `up()`, `select()`, `home()`, `playPause()`, `volumeUp()`, `wake()`, `suspend()` and more; `press()`, `longPress()` and `doublePress()` take a usage page and usage |
| `commands` | `Commands` | Playback commands to the now playing app: `play()`, `pause()`, `nextTrack()`, `seekToPosition()`, `setShuffleMode()`, `setRepeatMode()`, `changePlaybackRate()`, `likeTrack()`, `setSleepTimer()` and more |
| `volume` | `Volume` | 0 to 1: `get()`, `set()`, `up()`, `down()`, `mute()`, `fade()`; per output device with `setForDevice()` and `getForDevice()` |
| `keyboard` | `Keyboard` | Text input through the remote text input session: `set()`, `append()`, `clear()` |
| `outputDevices` | `OutputDevices` | The output context: `add()`, `remove()`, `set()`, plus listening mode and conversation detection of a HomePod |
| `playbackQueue` | `PlaybackQueue` | `request()` the queue, `requestAssets()` for lyrics and artwork formats of the current item |
| `artwork` | `Artwork` | `get(width, height)` and `getAnimated(width, height)` |
| `state` | `MediaRemoteState` | The model the messages feed |

`wake()` on the `MediaRemote` sends WAKE_DEVICE.

A command the app refuses rejects with `SendCommandError`, which has the `sendError` and the `handlerReturnStatus`. A reply without a result counts as success.

HID events go out with `send()`, not `exchange()`, because the receiver never replies to one. Touch is not part of MRP here, since tvOS drops the session on a virtual touch event. Use Companion Link for touch.

```ts
import type { MediaRemote } from '@corewire/airplay/mrp';

declare const remote: MediaRemote;

// The Consumer page (0x0c), usage 0x40: the home key, held for a second.
await remote.hid.longPress(0x0c, 0x40, 1000);
```

## The state

`MediaRemoteState` derives clients and their players, what plays now, volume, keyboard, output devices and the multiroom cluster from the messages it gets.

| Getter | Meaning |
| --- | --- |
| `nowPlayingClient` | The `Client` (an app) that plays now, or null |
| `clients` | Every client by bundle identifier |
| `volume`, `volumeMuted`, `volumeAvailable`, `volumeCapabilities` | Volume |
| `isKeyboardActive`, `keyboardState`, `keyboardAttributes` | Text input |
| `outputDevices`, `outputDeviceUID` | Output devices |
| `clusterID`, `clusterType`, `isClusterAware`, `isClusterLeader`, `participants` | Multiroom |
| `artworkJpegData` | The last SET_ARTWORK image |

Its events: `nowPlayingChanged`, `activePlayerChanged`, `playbackStateChanged`, `playbackQueueChanged`, `supportedCommandsChanged`, `artworkChanged`, `lyricsEvent`, `volumeChanged`, `volumeMutedChanged`, `volumeControlChanged`, `keyboardChanged`, `outputDevicesChanged`, `participantsChanged`, `clusterChanged` and `clients`.

A `Client` is an app. It holds `Player`s and proxies its getters (`title`, `artist`, `duration`, `elapsedTime`, `playbackState`, `isCommandSupported()` and more) to the active player. `elapsedTime` extrapolates from the timestamp of the last state and the playback rate.

### Feeding recorded messages

The state does no I/O. `apply(name, message)` feeds it one decoded message. `decodeMessage()` turns a `ProtocolMessage` into that pair.

```ts
import { decodeMessage, MediaRemoteState, parseMessages } from '@corewire/airplay/mrp';

declare const recorded: Buffer;

const state = new MediaRemoteState();

state.on('volumeChanged', volume => console.log('volume', volume));

for (const message of parseMessages(recorded)) {
    const decoded = decodeMessage(message);

    if (decoded) {
        state.apply(...decoded);
    }
}
```

`parseMessages()` splits a buffer of varint-prefixed messages. `decodeMessage()` returns null for a type the package does not know.

## Sending your own messages

`Messages` builds `ProtocolMessage`s with their extension. `Proto` holds the generated protobuf types and enums. Send them on the data channel:

```ts
import { Messages, Proto, type MediaRemote } from '@corewire/airplay/mrp';

declare const remote: MediaRemote;

remote.channel.send(Messages.sendCommandWithSkipInterval(Proto.Command.SkipForward, 30));

const reply = await remote.channel.exchange(Messages.getVolume(remote.state.outputDeviceUID ?? ''));
console.log(Proto.ProtocolMessage_Type[reply.type]);
```

`exchange()` resolves with the reply that carries the same identifier, and throws `TimeoutError` when none arrives. Use `send()` for messages the receiver does not answer, or the exchange times out.

`describeProtocolMessage(message)` turns a message into a plain object for logs.
