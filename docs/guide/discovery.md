# Discovering devices

```ts
import { createDevice, discover } from '@apple-protocols/devices';
```

## Scanning

`discover()` sends one multicast DNS-SD query for `_airplay._tcp`, `_companion-link._tcp` and `_raop._tcp` and listens for about four seconds. It merges the answers of one host by address into a `DiscoveredDevice`.

```ts
import { discover } from '@apple-protocols/devices';

const found = await discover();

for (const device of found) {
    console.log(device.id, device.name, device.address, device.modelName, device.mac);
    console.log('companion link:', !!device.services.companionLink);
}
```

A scan less than 30 seconds old is reused. Pass `{useCache: false}` to force a new one. Two scans that run at the same time share one query.

```ts
import { discover } from '@apple-protocols/devices';

const fresh = await discover({useCache: false});
```

## What a result holds

| Field | Meaning |
| --- | --- |
| `id` | The service instance name with spaces as dashes, plus `.local`, such as `Living-Room.local` |
| `name` | The name to show; today the same value as `id` |
| `address` | The address that answered |
| `model`, `modelName`, `family` | The `DeviceModel`, the raw model identifier (`AppleTV14,1`) and the `DeviceFamily` |
| `mac` | The `deviceid` from the TXT record as `AA:BB:CC:DD:EE:FF`, or null |
| `target` | A `DeviceTarget` to construct a device with |
| `services` | The `airplay`, `companionLink` and `raop` records (name, port, TXT), each when present |

## Creating a device

`createDevice()` returns an `AppleTV` for the Apple TV family and a `HomePod` for every other receiver. It takes the same options as the `AppleTV` constructor.

```ts
import { AppleTV, createDevice, Credentials, discover } from '@apple-protocols/devices';

const [first] = await discover();
const device = createDevice(first, {credentials: Credentials.parse(await load())});

if (device instanceof AppleTV) {
    await device.connect();
}
```

You can also pass `first.target` to a constructor. The target carries the address, the AirPlay port, the TXT record and the id, so the first connect skips the lookup.

## Without discovery

A device built from only an address works. Before the first connect, and before every retry, it asks that address for its services with a unicast DNS-SD query. See [Connection and recovery](/guide/connection#finding-the-device-again).

```ts
import { HomePod } from '@apple-protocols/devices';

const pod = new HomePod({address: '192.168.1.30'});
```

## Device models

`lookupDeviceModel()` maps a model identifier (`AppleTV6,2`) or an internal code name (`J305AP`) to a `DeviceModel`. `getDeviceModelName()` gives a display name, `getDeviceFamily()` the family, and `isAppleTV()`, `isHomePod()` and `isAirPort()` test the family.

```ts
import { DeviceModel, getDeviceModelName, isHomePod, lookupDeviceModel } from '@apple-protocols/devices';

const model = lookupDeviceModel('AudioAccessory5,1');

console.log(model === DeviceModel.HomePodMini, getDeviceModelName(model), isHomePod(model));
```

A model the table does not know is `DeviceModel.Unknown`. `discover()` still sorts it into a family by its identifier, so a new Apple TV model gets an `AppleTV` from `createDevice()`.
