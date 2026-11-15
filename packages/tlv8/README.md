# tlv8

An encoder and decoder for TLV8, the type-length-value format of HomeKit (HAP) pairing, which AirPlay and Companion Link pair with too. No dependencies.

It is the same codec that [CoreWire](https://corewire.dev) uses to pair with Apple TVs and HomePods, published on its own.

## Install

```sh
npm install tlv8
```

Runs on Node.js 18.17 or later (20.3 or later on the 20 line) and Bun. It works on `Buffer`, so it needs Node's `Buffer` at runtime and `@types/node` for the types.

## Example

```ts
import { decode, encode } from 'tlv8';

const STATE = 0x06;
const PUBLIC_KEY = 0x03;

const payload = encode([
    [STATE, 1],
    [PUBLIC_KEY, Buffer.alloc(384)]
]);

const fields = decode(payload);
console.log(fields.get(STATE));
```

`encode(entries)` takes `[type, value]` pairs. A number value is a single byte. A value longer than 255 bytes becomes consecutive fragments of the same type.

`decode(buffer)` joins adjacent fragments again and returns a `Map` from type to value. When a type comes back after another type, the map keeps the first value. For a list in which a type repeats, `decodeEntries(buffer)` returns every `[type, value]` in order. Both throw a `RangeError` on a truncated entry.

The package holds the format only. The HAP type and error constants live in `@corewire/core`.

The documentation is at [corewire.dev/reference/tlv8](https://corewire.dev/reference/tlv8).

## License

MIT
