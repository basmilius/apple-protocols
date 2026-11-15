# Playback

`device.playback` sends playback commands to the app that plays now. They go out as Media Remote commands over AirPlay, on both devices.

```ts
await tv.playback.pause();
await tv.playback.play();
await tv.playback.skipForward(30);
await tv.playback.seek(90);
await tv.playback.setShuffle('songs');
await tv.playback.setRepeat('one');
```

| Method | Meaning |
| --- | --- |
| `play()`, `pause()`, `togglePlayPause()`, `stop()` | Transport |
| `next()`, `previous()` | Next or previous item |
| `skipForward(seconds = 15)`, `skipBackward(seconds = 15)` | Skip by an interval |
| `seek(seconds)` | Jump to a position from the start |
| `setRepeat(mode)` | `off`, `one` or `all` |
| `setShuffle(mode)` | `off`, `albums` or `songs` |
| `setRate(rate)` | Playback speed; 1 is normal |

Every method throws `UnavailableError` while AirPlay is down. When the app refuses a command, the method rejects with a `CommandRefusedError`. Its `reason` is the send error in lower camel case, such as `applicationNotFound`, and its `status` the handler status, such as `noActionableNowPlayingItem`.

```ts
import { CommandRefusedError } from '@corewire/devices';

try {
    await tv.playback.next();
} catch (err) {
    if (err instanceof CommandRefusedError) {
        console.log('refused', err.reason, err.status);
    }
}
```

## What the app accepts

Apps differ. A live stream cannot seek; a podcast app may not shuffle. `nowPlaying.supports(command)` asks the app that plays now:

```ts
if (tv.nowPlaying.supports('seek')) {
    await tv.playback.seek(0);
}
```

The commands are `play`, `pause`, `togglePlayPause`, `stop`, `next`, `previous`, `skipForward`, `skipBackward`, `seek`, `repeat`, `shuffle` and `rate`. Without an app the answer is false.

## Playback or remote keys

`playback.pause()` tells the app to pause. `remote.press('pause')` sends the pause key, as a physical remote would, and the system decides what happens. Use `playback` for media, and `remote` for navigating the interface. See [Remote and touch](/guide/remote).
