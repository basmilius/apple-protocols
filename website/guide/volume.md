# Volume

`device.volume` is the volume of the output device, on a scale of 0 to 1. It works on both devices over AirPlay.

```ts
console.log(tv.volume.level, tv.volume.muted, tv.volume.mode);

await tv.volume.set(0.25);
await tv.volume.up();
await tv.volume.toggleMute();
await tv.volume.fade(0.1, 3000);
```

## State

`volume` itself implements `VolumeState`:

| Property | Meaning |
| --- | --- |
| `level` | 0 to 1; 0 until the device reports |
| `muted` | Whether the output is muted |
| `available` | Whether the device offers volume control now |
| `mode` | `absolute`, `relative` or `none` |

In mode `relative` the device can step the volume but not set it. In mode `none` it offers no volume control at all.

## Methods

| Method | Meaning |
| --- | --- |
| `set(level)` | Clamped to 0 to 1; needs mode `absolute` |
| `up()`, `down()` | A 0.05 step in mode `absolute`, the volume key in mode `relative` |
| `mute()`, `unmute()`, `toggleMute()` | Mute |
| `fade(level, durationMs)` | Fades to `level` over `durationMs` |

Every method throws `UnavailableError` while AirPlay is down.

## The change event

```ts
tv.volume.on('change', volume => {
    console.log(`volume ${Math.round(volume.level * 100)}%`, volume.muted ? 'muted' : '');
});
```

`change` fires only when `level`, `muted`, `available` or `mode` differs from what it announced last. The values outlive the sessions, so a reconnect that reports the same volume emits nothing. `disconnect()` resets them to the initial values, so the next `connect()` announces the volume again.

A new session starts from 0 until the device reports its level. `up()` and `down()` right after a reconnect step from that value.

## Units

Volume on a device is always 0 to 1. The protocol packages use other scales: an AirPlay audio stream takes decibels (-144 to 0), and RAOP takes a percentage (0 to 100) when a stream starts and dBFS in `setVolume()`. `media.streamAudio()` converts its `volume` option for you.
