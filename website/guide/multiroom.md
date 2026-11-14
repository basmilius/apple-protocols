# Multiroom

`device.multiroom` manages the group of output devices the device plays to. It works over AirPlay on both devices.

```ts
console.log(pod.multiroom.clusterId, pod.multiroom.isLeader);

await pod.multiroom.add('2A1B3C4D-0000-0000-0000-000000000000');
await pod.multiroom.remove('2A1B3C4D-0000-0000-0000-000000000000');
```

| Member | Meaning |
| --- | --- |
| `clusterId` | The id of the group the device belongs to, or null |
| `isClusterAware` | Whether the device takes part in groups |
| `isLeader` | Whether this device leads its group |
| `add(...deviceUids)` | Adds output devices to the group |
| `remove(...deviceUids)` | Removes output devices from the group |
| `set(...deviceUids)` | Replaces the whole group |

The methods take output device UIDs, the identifiers the Media Remote Protocol uses for an output. The device layer does not list them. The `MediaRemoteState` of [`device.sessions.mediaRemote`](/protocols/mrp) has `outputDevices`, each with a `name` and a `uniqueIdentifier`, and an `outputDevicesChanged` event.

```ts
const state = tv.sessions.mediaRemote?.state;

for (const output of state?.outputDevices ?? []) {
    console.log(output.name, output.uniqueIdentifier);
}
```

The methods throw `UnavailableError` while AirPlay is down.
