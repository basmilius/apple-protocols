# Pairing

```ts
import { PairSetup, PairVerify } from '@corewire/core/pairing';
```

AirPlay and Companion Link pair with the HomeKit Accessory Protocol (HAP): pair-setup with SRP and a PIN (M1 to M6), and pair-verify with Curve25519 on every connect (M1 to M4). `@corewire/core/pairing` implements both sides and knows no protocol. A protocol hands it a `PairingTransport` that carries the TLV8 payloads.

You only need this page when you add a protocol or build a test peer. `pair()` and `connect()` of the protocol packages run pairing for you.

## The transport

A `PairingTransport` is a function that sends one payload and resolves the reply. `step` says which message it is (`m1`, `m3` or `m5`), for protocols that frame each step differently.

```ts
import type { PairingTransport } from '@corewire/core/pairing';

declare function post(path: string, body: Buffer): Promise<Buffer>;

const transport: PairingTransport = async payload => await post('/pair-setup', payload);
```

## Pair-setup

```ts
import { PairSetup, type PairingTransport } from '@corewire/core/pairing';
import { Context } from '@corewire/core/transport';

declare const transport: PairingTransport;

const setup = new PairSetup(new Context('Living-Room.local'), transport);

await setup.start();
const credentials = await setup.pin(async () => await askForPin());

console.log(credentials.accessoryIdentifier);
```

`start()` generates the controller's long-term Ed25519 key pair. `pin(askPin)` runs M1 to M6 and calls `askPin` between M1 and M2, when the device shows its PIN. It resolves `AccessoryCredentials`: the accessory identifier and long-term public key, and this controller's pairing id and key pair. M5 carries the name of the controller, which the device lists with its pairings: the `name` of the context identity, or `CoreWire` when it has none.

The steps are public too (`m1()` to `m6()`) for a caller that has to wait for the PIN between M1 and M2 across calls, as `PinPairing` does.

`transient()` runs M1 to M4 with the fixed transient PIN (`TRANSIENT_PAIRING_PIN`) and resolves `AccessoryKeys` that hold for this connection only. A HomePod accepts it.

`PairingOptions.useAes` switches the encrypted sub-TLVs to AES-128-CTR for legacy devices.

## Pair-verify

```ts
import { PairVerify, type AccessoryCredentials, type PairingTransport } from '@corewire/core/pairing';
import { Context } from '@corewire/core/transport';

declare const transport: PairingTransport;
declare const credentials: AccessoryCredentials;

const verify = new PairVerify(new Context('Living-Room.local'), transport);
const keys = await verify.start(credentials);

console.log(keys.sharedSecret.byteLength);
```

`start(credentials)` resolves `AccessoryKeys` with the shared secret. Each protocol derives its own channel keys from it with HKDF. It throws `AuthenticationError` when the accessory's identity does not match the credentials. `deriveControlKeys(sharedSecret)` derives the HAP control channel keys.

## The accessory side

`PairSetupServer` and `PairVerifyServer` answer pair-setup and pair-verify as an accessory would. `generateAccessoryIdentity()` creates an identity for them. Use them to test a controller, or to build a peer that sits between a controller and a device.

```ts
import { generateAccessoryIdentity, PairSetup, PairSetupServer } from '@corewire/core/pairing';
import { Context } from '@corewire/core/transport';

const context = new Context('test');
const identity = generateAccessoryIdentity();
const server = new PairSetupServer(context, identity, '1234');

const client = new PairSetup(context, payload => server.handle(payload));
await client.start();

const credentials = await client.pin(async () => '1234');
console.log(credentials.accessoryIdentifier === identity.identifier, server.controller?.identifier);
```

`handle(request)` takes one request payload and resolves the reply. `PairVerifyServer` takes a `ControllerResolver` that maps a pairing id to the controller's long-term public key.
