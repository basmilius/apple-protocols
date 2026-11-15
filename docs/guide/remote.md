# Remote and touch

## Pressing keys

`device.remote.press(key, options?)` presses a key, as on a physical remote.

```ts
await tv.remote.press('down');
await tv.remote.press('select');
await tv.remote.press('home', {mode: 'double'});
await tv.remote.press('select', {mode: 'hold', holdMs: 1500});
```

`mode` is `tap` (the default), `double` or `hold`. `holdMs` sets how long a hold lasts. Without it a hold lasts 500 ms over Companion Link and 1000 ms over AirPlay.

## Which protocol sends the key

AirPlay and Companion Link each know a set of keys. The device picks the route:

- A tap goes over AirPlay when AirPlay knows the key.
- A hold or a double press goes over Companion Link when it is connected and knows the key.
- Either way it falls back to the other protocol.
- When no connected protocol knows the key, `press()` throws `UnavailableError`.

| Keys | AirPlay | Companion Link |
| --- | --- | --- |
| `up`, `down`, `left`, `right`, `select`, `menu`, `home` | yes | yes |
| `playPause`, `volumeUp`, `volumeDown`, `mute` | yes | yes |
| `channelUp`, `channelDown`, `wake`, `suspend` | yes | yes |
| `play`, `pause`, `stop`, `next`, `previous`, `topMenu` | yes | no |
| `siri`, `screensaver`, `guide`, `pageUp`, `pageDown`, `info`, `captions` | no | yes |
| `power`, `back`, `exit`, `skipForward`, `skipBackward` | no | yes |

A HomePod has no Companion Link, so only the AirPlay keys work there.

## Touch

An Apple TV has a touch surface over Companion Link. AirPlay has none, because tvOS drops the Media Remote session on a virtual touch event.

```ts
await tv.touch.swipe('left');
await tv.touch.swipe('down', 400);
await tv.touch.tap();
await tv.touch.tap(800);
```

`swipe(direction, durationMs = 200)` swipes `up`, `down`, `left` or `right`. `tap(holdMs?)` selects what has focus, held when you pass `holdMs`. Both throw `UnavailableError` while Companion Link is down.
