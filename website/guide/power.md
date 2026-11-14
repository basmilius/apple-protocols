# Power

`tv.power` is the power state of an Apple TV. A HomePod has no power capability.

```ts
console.log(tv.power.state);

tv.power.on('change', state => {
    console.log('power', state);
});

await tv.power.wake();
await tv.power.sleep();
```

## State

`state` is a `PowerState`:

| State | Meaning |
| --- | --- |
| `awake` | The Apple TV is on |
| `idle` | The Apple TV reports itself idle |
| `screensaver` | The screensaver runs |
| `asleep` | The Apple TV sleeps |
| `unknown` | Companion Link has not reported a state yet |

The state comes from Companion Link. Without credentials, or while Companion Link is down, it stays at the last reported value (`unknown` before the first report).

## The change event

`change` fires on every report from the Apple TV, including the one each Companion Link connect fetches. Unlike now playing and volume it does not skip equal values. After a real drop, the first `change` tells you the state as it is now, so use it to resync.

## Waking and sleeping

`wake()` and `sleep()` send the wake and suspend keys over AirPlay, so they work without Companion Link. They throw `UnavailableError` while AirPlay is down.

A sleeping Apple TV may not answer its AirPlay port at all. When the device looks itself up before a connect attempt, it first knocks on `WAKE_PORTS` (7000, 3689, 49152, 32498) to wake it. See [Connection and recovery](/guide/connection#finding-the-device-again).
