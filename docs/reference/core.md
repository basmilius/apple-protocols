# @apple-protocols/core

`@apple-protocols/core` has a main entry point and five subpaths. It knows no protocol.

## @apple-protocols/core

```ts
import { AppleProtocolError, Logger, reporter } from '@apple-protocols/core';
```

### Errors

Every class takes a `message: string`. The connection errors have a default message.

| Export | Extends |
| --- | --- |
| `AppleProtocolError` | `Error` |
| `ConnectionError` | `AppleProtocolError` |
| `ConnectionTimeoutError` | `ConnectionError` |
| `ConnectionClosedError` | `ConnectionError` |
| `PairingError` | `AppleProtocolError` |
| `AuthenticationError` | `PairingError` |
| `CredentialsError` | `PairingError` |
| `CommandError` | `AppleProtocolError` |
| `SetupError` | `AppleProtocolError` |
| `DiscoveryError` | `AppleProtocolError` |
| `EncryptionError` | `AppleProtocolError` |
| `InvalidResponseError` | `AppleProtocolError` |
| `TimeoutError` | `AppleProtocolError` |
| `PlaybackError` | `AppleProtocolError` |
| `DecryptionError` | `EncryptionError`; the authentication tag of a ChaCha20-Poly1305 frame did not match |
| `TLV8PairingError` | `PairingError`; `constructor(message: string, code?: number)`, `code: number \| undefined` holds the TLV8 error code of the accessory |

### Logging

| Export | Description |
| --- | --- |
| `class Logger` | `constructor(id: string, sink?: LogSink)`; `debug()`, `error()`, `info()`, `net()`, `raw()`, `warn()`; `traffic(protocol, direction, summary, decoded?, bytes?)`; `id`, `label` |
| `reporter: Reporter` | The global reporter |
| type `Reporter` | `all()`, `none()`, `enable(group)`, `disable(group)`, `isEnabled(group)`, `accepts(group)`, `printsToConsole(group)`, `setSink(sink, options?)`, `clearSink()`, `setTrafficSink(sink)`, `clearTrafficSink()`, `reportTraffic(entry)`, `report(group, deviceId, args)`, `tapsTraffic` |
| type `DebugGroup` | `'debug' \| 'error' \| 'info' \| 'net' \| 'raw' \| 'warn'` |
| type `LogSink` | `(group: DebugGroup, args: readonly unknown[]) => void` |
| type `ReporterEntry` | `{group: DebugGroup; deviceId: string \| null; args: readonly unknown[]; timestamp: number}` |
| type `ReporterSink` | `(entry: ReporterEntry) => void` |
| type `ReporterSinkOptions` | `{groups?: readonly DebugGroup[]; silenceConsole?: boolean}` |
| type `TrafficEntry` | `{deviceId: string \| null; protocol: TrafficProtocol; direction: TrafficDirection; summary: string; decoded?: unknown; bytes?: Uint8Array; timestamp: number}` |
| type `TrafficSink` | `(entry: TrafficEntry) => void` |
| type `TrafficDirection` | `'in' \| 'out'` |
| type `TrafficProtocol` | `string` |

### Helpers

| Export | Description |
| --- | --- |
| `waitFor(ms: number): Promise<void>` | |
| type `EventMap` | `Record<string, any>` |

## @apple-protocols/core/crypto

The subpath exports namespaces and two types. Acronyms stay in capitals: `AES`, `ChaCha20`, `HKDF`.

| Export | Description |
| --- | --- |
| `ChaCha20` | `encrypt(key, nonce, aad, plaintext): EncryptedData`, `decrypt(key, nonce, aad, ciphertext, authTag): Buffer` (throws `DecryptionError` from the main entry), `padNonce(nonce)`, `CHACHA20_AUTH_TAG_LENGTH` (16), `CHACHA20_NONCE_LENGTH` (12), type `EncryptedData` (`{ciphertext; authTag}`) |
| `Ed25519` | `generateKeyPair(): KeyPair`, `sign(message, secretKey)`, `verify(message, signature, publicKey)` |
| `Curve25519` | `generateKeyPair(): KeyPair`, `generateSharedSecKey(priKey, pubKey)` |
| `AES` | `encrypt(key, iv, plaintext)`, `decrypt(key, iv, ciphertext)`; AES-128-CTR |
| `HKDF` | `derive(options: HKDFOptions): Buffer`; `deriveEncryptionKeys(sharedSecret: Buffer, salt: string, readInfo: string, writeInfo: string): {readKey: Buffer; writeKey: Buffer}` |
| type `HKDFOptions` | `{hash; key; length; salt; info}` |
| type `KeyPair` | `{publicKey: Uint8Array; secretKey: Uint8Array}` |

## @apple-protocols/core/discovery

| Export | Description |
| --- | --- |
| `class Discovery` | `constructor(service: string)`; `find(useCache?)`, `findUntil(id, tries?, timeout?)`, `findByAddress(address, timeout?, wakePorts?)`; static `findServices(services, useCache?)`, `clearCache()`, `wake(address, ports)` |
| `mdnsMulticast(services: string[], timeout = 4): Promise<MdnsService[]>` | Timeout in seconds |
| `mdnsUnicast(hosts: string[], services: string[], timeout = 4, wakePorts = []): Promise<MdnsService[]>` | |
| `class MdnsResponder` | `constructor(logger: Logger, service: AdvertisedService, address?: string)`; `start()`, `stop()`, static `localAddress()` |
| type `DiscoveryResult` | `{id: string; fqdn: string; address: string; txt: Readonly<Record<string, string>>; service: {port: number; protocol: 'tcp' \| 'udp'; type: string}}`. The model identifier sits in `txt.model` or `txt.am` |
| type `DiscoverOptions` | `{useCache?: boolean}`; reuses a scan younger than 30 seconds, default true. The one definition the protocol packages and devices share |
| type `MdnsService` | `{name; type; address; port; properties: Record<string, string>}` |
| type `AdvertisedService` | `{instance; type; host; port; txt}` |

## @apple-protocols/core/encoding

| Export | Description |
| --- | --- |
| `TLV8` | `encode(entries)`, `decode(buffer): Map<number, Buffer>` (one value per type, the first run wins), `decodeEntries(buffer): [number, Buffer][]` (every entry in order, adjacent fragments joined), `bail(data)` (throws `TLV8PairingError` from the main entry), `Value`, `State`, `Method`, `Flags`, `ErrorCode` |
| `OPack` | `encode(data)`, `decode(data)`, `int(value: number \| bigint)`, `float(value)`, `sizedInteger(value: number \| bigint, size)` with a size of 1, 2, 4, 8 or 16 bytes. Integers are signed; a sized integer outside the safe number range holds a `bigint`. Dates encode and decode as `Date`. `encode` throws a `TypeError` beyond 32 nested containers and `decode` throws a `TypeError` on a truncated buffer, a bad reference, deeper nesting or an unsupported tag |
| `Plist` | `serialize(value)`, `parse(buffer)`, types `PlistValue`, `PlistDictionary` |
| `DAAP` | `encodeTag()`, `encodeContainer()`, `encodeTagWithSize()`, `encodePlaybackStatus()`, `encodeTrackMetadata()`, `decode()`, `decodeTag()`, `decodeToObject()`, `decodeTrackMetadata()`, `ContentCode`, `TagType` and their types |
| `NTP` | `now(): bigint`, `parts(ntp: bigint): [number, number]`, `encode(fields)`, `decode(buffer)`, type `PacketFields` |
| `NSKeyedArchiver` | `decode(archive)`, `decodeAsArray(archive)` |
| `RTI` | `decodeSession(data)`, `encodeOperation(sessionUUID, text, clear)`, type `TextInputSession` |

## @apple-protocols/core/pairing

| Export | Description |
| --- | --- |
| `class PairSetup` | `constructor(context: Context, transport: PairingTransport, options?: PairingOptions)`; `start()`, `pin(askPin): Promise<AccessoryCredentials>`, `transient(): Promise<AccessoryKeys>`, `m1()` to `m6()` |
| `class PairVerify` | `constructor(context, transport, options?)`; `start(credentials: AccessoryCredentials): Promise<AccessoryKeys>` |
| `class PairSetupServer` | `constructor(context, identity: AccessoryIdentity, pin: string, options?)`; `handle(request: Buffer): Promise<Buffer>`, `controller`, `sharedSecret` |
| `class PairVerifyServer` | `constructor(context, identity, resolveController: ControllerResolver, options?)`; `handle(request)`, `pairingId`, `sharedSecret` |
| `generateAccessoryIdentity(): AccessoryIdentity` | A random identifier and a new Ed25519 key pair |
| `deriveControlKeys(sharedSecret: Buffer): {accessoryToControllerKey: Buffer; controllerToAccessoryKey: Buffer}` | |
| `TRANSIENT_PAIRING_PIN` | `'3939'` |
| type `AccessoryCredentials` | `{accessoryIdentifier: string; accessoryLongTermPublicKey: Buffer; pairingId: Buffer; publicKey: Buffer; secretKey: Buffer}` |
| type `AccessoryKeys` | `{pairingId; sharedSecret; accessoryToControllerKey; controllerToAccessoryKey}`, all `Buffer` |
| type `AccessoryIdentity` | `{identifier: string; publicKey: Buffer; secretKey: Buffer}` |
| type `PairedController` | `{identifier: string; longTermPublicKey: Buffer}` |
| type `ControllerResolver` | `(pairingId: string) => Buffer \| undefined` |
| type `PairingOptions` | `{useAes?: boolean}` |
| type `PairingStep` | `'m1' \| 'm3' \| 'm5'` |
| type `PairingTransport` | `(payload: Buffer, step: PairingStep) => Promise<Buffer>` |

## @apple-protocols/core/transport

| Export | Description |
| --- | --- |
| `class Context` | `constructor(deviceId: string, identity: DeviceIdentity = {}, sink?: LogSink)`; `deviceId`, `identity` (only the overrides you passed), `logger` |
| `DEFAULT_CLIENT_NAME` | `'Apple Protocols'`: the name a client presents when `identity.name` is not set |
| `class Connection<TEventMap>` | `constructor(context, address, port)`; `connect()`, `disconnect()`, `destroy(error?)`, `write(data)`, `debug(enabled)`; `address`, `port`, `localAddress`, `isConnected`, `state`, `signal`, `context`; events `connect`, `data`, `error`, `closed` |
| `class EncryptionAwareConnection<TEventMap>` | `Connection` plus `enableEncryption(readKey, writeKey)`, `isEncrypted`, and the protected getter `encryption: EncryptionState \| undefined` for subclasses |
| `class EncryptionState` | `constructor(readKey, writeKey)`; `readKey`, `readCount`, `writeKey`, `writeCount` |
| `buildNonce(counter: number, format: NonceFormat): Buffer` | A 12-byte nonce |
| type `NonceFormat` | `'counter-at-0' \| 'counter-at-4'` |
| type `DeviceIdentity` | `{name?; model?; osName?; osVersion?; osBuildVersion?; sourceVersion?; applicationBundleIdentifier?; applicationBundleVersion?}`, all strings. A field you leave out, or set to `undefined`, keeps the default of the protocol package |
| type `CloseReason` | `'local' \| 'remote' \| 'timeout' \| 'error'` |
| type `ConnectionState` | `'closing' \| 'connected' \| 'connecting' \| 'disconnected' \| 'failed'` |
