# Encoding and crypto

```ts
import { DAAP, NSKeyedArchiver, NTP, OPack, Plist, RTI, TLV8 } from '@corewire/core/encoding';
import { Aes, Chacha20, Curve25519, Ed25519, deriveEncryptionKeys, hkdf } from '@corewire/core/crypto';
```

Each codec is a namespace. They work on `Buffer` and `Uint8Array` and have no dependencies.

## Codecs

| Namespace | Format | Used by |
| --- | --- | --- |
| `TLV8` | Type-length-value with 8-bit types, as HAP pairing uses it | Pairing |
| `OPack` | Apple's compact binary object format | Companion Link messages |
| `Plist` | Binary property lists | AirPlay SETUP, `/info`, play queue commands, data channel framing |
| `DAAP` | DMAP tags | RAOP metadata |
| `NTP` | NTP timestamps and packets | Audio timing |
| `NSKeyedArchiver` | Keyed archives | Artwork URLs and metadata in MRP, Companion Link text input |
| `RTI` | Remote text input sessions | Text input over AirPlay |

### TLV8

```ts
import { TLV8 } from '@corewire/core/encoding';

const payload = TLV8.encode([
    [TLV8.Value.State, 1],
    [TLV8.Value.Method, 0]
]);

const fields = TLV8.decode(payload);
console.log(fields.get(TLV8.Value.State));
```

`encode(entries)` splits values over 255 bytes into fragments; `decode(buffer)` joins them again into a `Map` of type to value. `bail(fields)` throws a `TLV8PairingError` when a pairing reply carries an error or a back-off. `Value`, `State`, `Method`, `Flags` and `ErrorCode` name the HAP constants.

### OPack

```ts
import { OPack } from '@corewire/core/encoding';

const bytes = OPack.encode({_i: '_launchApp', _c: {_bundleID: 'com.apple.TVMusic'}, _x: OPack.int(42)});
const message = OPack.decode(bytes);

console.log(message._i);
```

`encode()` picks the smallest encoding for a number. `OPack.int(value)`, `OPack.float(value)` and `OPack.sizedInteger(value, size)` force a type when the device expects one.

### Plist

```ts
import { Plist } from '@corewire/core/encoding';

const bytes = Plist.serialize({deviceID: 'AA:BB:CC:DD:EE:FF', streams: [{type: 130}]});
const value = Plist.parse(bytes as ArrayBuffer);

console.log(value);
```

`serialize(value)` writes a binary plist; `parse(buffer)` reads one. Integers of 1, 2 and 4 bytes read as unsigned, an 8-byte integer comes back as a `bigint`, and a date as a `Date`.

### NTP

`NTP.now()` returns the current time as a 64-bit NTP timestamp from the wall clock. `NTP.parts(timestamp)` splits it into seconds and fraction. `encode()` and `decode()` handle a timing packet.

## Crypto

| Export | Contents |
| --- | --- |
| `Chacha20` | `encrypt(key, nonce, aad, plaintext)` and `decrypt(key, nonce, aad, ciphertext, authTag)` with ChaCha20-Poly1305; `padNonce()`, `DecryptionError` |
| `Ed25519` | `generateKeyPair()`, `sign()`, `verify()` |
| `Curve25519` | `generateKeyPair()`, `generateSharedSecKey()` |
| `Aes` | `encrypt()` and `decrypt()` with AES-128-CTR |
| `hkdf(options)` | HKDF (RFC 5869) with the `hash` you pass, such as `sha512` |
| `deriveEncryptionKeys(sharedSecret, salt, readInfo, writeInfo)` | Read and write keys from a shared secret |

```ts
import { randomBytes } from 'node:crypto';
import { Chacha20 } from '@corewire/core/crypto';

const key = randomBytes(32);
const nonce = Chacha20.padNonce(Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]));

const {ciphertext, authTag} = Chacha20.encrypt(key, nonce, null, Buffer.from('hello'));
const plaintext = Chacha20.decrypt(key, nonce, null, ciphertext, authTag);

console.log(plaintext.toString());
```

A wrong key, nonce or tag throws `DecryptionError`.
