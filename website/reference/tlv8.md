# tlv8

```sh
npm install tlv8
```

```ts
import { decode, decodeEntries, encode } from 'tlv8';
```

The TLV8 codec as a package of its own, without dependencies and without the `@corewire` scope. `@corewire/core` depends on it and re-exports it as `TLV8` on `@corewire/core/encoding`. It holds the format only. The HAP constants (`Value`, `State`, `Method`, `Flags`, `ErrorCode`) and `bail()` live in `@corewire/core`, which adds them to its `TLV8` namespace. The format is described under [Encoding and crypto](/protocols/encoding#tlv8).

| Export | Description |
| --- | --- |
| `encode(entries: [number, number \| Buffer \| Uint8Array][]): Buffer` | Writes each `[type, value]`; a number value is a single byte. A value over 255 bytes becomes consecutive fragments of the same type |
| `decode(buffer: Buffer): Map<number, Buffer>` | One value per type. Adjacent fragments are joined; when a type comes back after another type, the first value wins. Throws a `RangeError` on a truncated entry |
| `decodeEntries(buffer: Buffer): [number, Buffer][]` | Every entry in order, for lists in which a type repeats. Adjacent fragments are joined. Throws a `RangeError` on a truncated entry |

```ts
import { decode, encode } from 'tlv8';

const STATE = 0x06;

const fields = decode(encode([[STATE, 1]]));

console.log(fields.get(STATE));
```

It works on `Buffer`, so it runs on Node.js 18.17 or later (20.3 or later on the 20 line) and Bun, and its types need `@types/node`.
