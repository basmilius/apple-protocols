# Multiroom

`device.multiroom` manages the group of output devices the device plays to, and the volume of each. It works over AirPlay on both devices.

```ts
console.log(pod.multiroom.clusterId, pod.multiroom.isLeader);

for (const output of pod.multiroom.outputs) {
    console.log(output.uid, output.name, output.model, output.isLocal);
}

pod.multiroom.on('change', outputs => {
    console.log('now playing on', outputs.map(output => output.name));
});

await pod.multiroom.add('2A1B3C4D-0000-0000-0000-000000000000');
await pod.multiroom.remove('2A1B3C4D-0000-0000-0000-000000000000');
```

| Member | Meaning |
| --- | --- |
| `clusterId` | The id of the group the device belongs to, or null |
| `isClusterAware` | Whether the device takes part in groups |
| `isLeader` | Whether this device leads its group |
| `outputs` | The output devices that play along now, as the device last reported them |
| `add(...deviceUids)` | Adds output devices to the group |
| `remove(...deviceUids)` | Removes output devices from the group |
| `set(...deviceUids)` | Replaces the whole group |
| `getVolume(deviceUid)` | The volume of one output device, 0 to 1 |
| `setVolume(deviceUid, level)` | Sets the volume of one output device, clamped to 0 to 1 |
| `mute(deviceUid)`, `unmute(deviceUid)` | Mutes or unmutes one output device |

## Output devices

The methods take the `uid` of an `OutputDevice`. It also has the `name`, the `model` identifier, the `groupId` and the flags `isLocal` (the device the session runs on), `isGroupLeader` and `hasVolumeControl`.

The `change` event fires when the list differs from the last one announced. Like the volume, the list survives a reconnect, so a reconnect that reports the same outputs emits nothing. `disconnect()` clears it.

```ts
for (const output of pod.multiroom.outputs) {
    if (output.hasVolumeControl && !output.isLocal) {
        await pod.multiroom.setVolume(output.uid, 0.3);
    }
}
```

The methods throw `UnavailableError` while AirPlay is down.
