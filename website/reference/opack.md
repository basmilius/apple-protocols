# opack

```sh
npm install opack
```

```ts
import { decode, encode, float, int, sizedInteger } from 'opack';
```

The OPack codec of `@corewire/core` as a package of its own, without dependencies and without the `@corewire` scope. It is built from the same source as `OPack` on `@corewire/core/encoding`, so both encode the same bytes. Inside CoreWire, use the `OPack` namespace; outside it, this package. The format is described under [Encoding and crypto](/protocols/encoding#opack).

| Export | Description |
| --- | --- |
| `encode(data: any): Uint8Array` | Takes null, booleans, numbers, bigints, strings, `Uint8Array`, `Date`, arrays, plain objects and the wrappers below. A repeated string, byte string of 2 bytes or more, date, float or integer outside -1 to 39 becomes a reference to its first occurrence. Throws a `TypeError` on an unsupported type or beyond 32 nested containers, a `RangeError` on an integer beyond 128 bits or an invalid date |
| `decode(data: Uint8Array): any` | Integers from -1 to 39 come back as numbers, larger ones as `sizedInteger`, dates as `Date`, UUIDs and byte strings as `Uint8Array`. Throws a `TypeError` on a truncated buffer, a bad reference, more than 32 nested containers or an unknown tag |
| `int(value: number \| bigint)` | Encodes the value as an integer in the smallest width that holds it. Throws a `RangeError` when the value is not an integer |
| `float(value: number)` | Encodes the value as a 64-bit float, also when it is a whole number |
| `sizedInteger(value: number \| bigint, size: number)` | Encodes the value as a signed integer of `size` bytes: 1, 2, 4, 8 or 16. Has `size`, `value` and `valueOf()`; `value` is a `bigint` outside the safe number range. Throws a `RangeError` on another size or a value that does not fit |

```ts
import { decode, encode, int } from 'opack';

const bytes = encode({_i: '_launchApp', _c: {_bundleID: 'com.apple.TVMusic'}, _x: int(42)});

console.log(decode(bytes)._i);
```

Requires Node.js 18.17 or later (20.3 or later on the 20 line) or Bun.
