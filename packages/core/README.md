# @corewire/core

The shared base of the CoreWire protocol packages: codecs (OPack, TLV8, plist, DAAP, NTP, RTI), crypto, transport, HAP pairing (controller and accessory side), mDNS discovery and advertising, the error classes and the logger. It holds no protocol behavior of its own.

Part of [CoreWire](https://corewire.dev). Most applications use `@corewire/devices` instead.

## Install

```sh
npm install @corewire/core@next
```

Requires Node.js 18.17 or later (20.3 or later on the 20 line).

## Example

```ts
import { Discovery } from '@corewire/core/discovery';
import { OPack } from '@corewire/core/encoding';

const receivers = await new Discovery('_airplay._tcp.local').find();
console.log(receivers.map(receiver => `${receiver.id} at ${receiver.address}`));

const encoded = OPack.encode({_i: '_systemInfo'});
console.log(OPack.decode(encoded));
```

## License

MIT
