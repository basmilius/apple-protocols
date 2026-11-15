# opack

An encoder and decoder for OPack, the compact binary object format that Apple devices use for Companion Link messages. No dependencies.

It is the same codec that [CoreWire](https://corewire.dev) uses to talk to Apple TVs, published on its own.

## Install

```sh
npm install opack
```

Runs on Node.js 18.17 or later (20.3 or later on the 20 line), Bun and anything else with `Uint8Array`, `DataView` and `TextEncoder`.

## Example

```ts
import { decode, encode, int } from 'opack';

const bytes = encode({_i: '_launchApp', _c: {_bundleID: 'com.apple.TVMusic'}, _x: int(42)});
const message = decode(bytes);

console.log(message._i);
```

`encode(value)` takes null, booleans, numbers, bigints, strings, `Uint8Array`, `Date`, arrays and plain objects, and returns a `Uint8Array`. It picks the smallest encoding for a number. When a device expects a specific type, wrap the value: `int(value)` writes an integer, `float(value)` a 64-bit float and `sizedInteger(value, size)` an integer of 1, 2, 4, 8 or 16 bytes. Integers are signed.

`decode(bytes)` returns the value. Integers from -1 to 39 come back as numbers. Larger ones come back as a `sizedInteger`, so encoding it again writes the same width; `.value` reads the number, or a `bigint` outside the safe number range. `encode` turns a repeated string, byte string of 2 bytes or more, date, float or integer outside -1 to 39 into a reference to its first occurrence, the way devices write them.

Both functions throw a `TypeError` beyond 32 nested containers. `decode` also throws one on a truncated buffer, a reference to a value that does not exist and an unknown tag.

The documentation is at [corewire.dev/reference/opack](https://corewire.dev/reference/opack).

## License

MIT
