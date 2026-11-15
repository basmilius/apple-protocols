# Credentials and pairing

A HomePod accepts a transient pairing on every connect and needs nothing from you. An Apple TV wants a PIN pairing once. You store the long-term credentials that pairing returns. The packages never write them anywhere.

## PIN pairing

`AppleTV.pair()` connects over AirPlay and asks the Apple TV to show a PIN. It resolves once the PIN is on screen. `pin()` runs pair-setup with the code and returns `Credentials`.

```ts
import { AppleTV } from '@corewire/devices';

const pairing = await AppleTV.pair({address: '192.168.1.20'});

try {
    const credentials = await pairing.pin(await askForPin());
    await save(credentials.toString());
} catch (error) {
    // A wrong PIN keeps the connection open for another try.
    pairing.close();
    throw error;
}
```

- A wrong PIN rejects with a `PairingError` and leaves the pairing open, so you can call `pin()` again.
- On success `pin()` closes the connection itself.
- `close()` gives up without credentials.

`pair()` takes `PairOptions`: an `identity` that overrides the name, model and versions this client presents, and an abort `signal`. The Apple TV lists the pairing under `identity.name`, or `CoreWire` without one. A home hub can pass its own name here.

The credentials come from AirPlay pair-setup and serve Companion Link too. One pairing covers both protocols.

## Storing credentials

`toString()` returns a compact string: `cw1.` followed by five base64url fields. `toJSON()` returns the same string, so `JSON.stringify` writes it for an object that holds credentials.

```ts
import { Credentials } from '@corewire/devices';

const credentials = Credentials.parse(await load());

await save(JSON.stringify({credentials}));
```

The string holds the secret key of this controller. Store it like a password.

## Reading them back

`Credentials.parse()` reads:

- the string form from `toString()`;
- an object with the five fields `accessoryIdentifier`, `accessoryLongTermPublicKey`, `pairingId`, `publicKey` and `secretKey`, where the binary fields are hex or base64;
- a JSON string of such an object.

The object forms read credentials that were stored before the string form existed. Anything else throws a `CredentialsError`.

`toFields()` writes the object form, with the binary fields as hex strings. Use it when an older release of your app must still read your storage.

```ts
const fields = credentials.toFields();

console.log(fields.accessoryIdentifier, fields.pairingId);
```

## Credentials from a protocol package

`pair()` from `@corewire/airplay` or `@corewire/companion-link` returns raw `AccessoryCredentials`. `Credentials.from()` wraps them for a device:

```ts
import { pair } from '@corewire/airplay';
import { AppleTV, Credentials } from '@corewire/devices';

const pairing = await pair({address: '192.168.1.20'});
const raw = await pairing.pin(await askForPin());
pairing.close();

const tv = new AppleTV({address: '192.168.1.20'}, {credentials: Credentials.from(raw)});
```

## Without credentials

An `AppleTV` without credentials still connects. AirPlay pairs transiently, which gives remote keys, now playing, playback and volume. Companion Link stays `off` with a `CredentialsError` in `status.companionLink.error`, and the device reports `degraded`. Apps, accounts, power state, system settings and touch then never work.

## Credentials that stopped working

When the user removes the pairing on the Apple TV, pair-verify fails. The device keeps retrying on its schedule, and the error sits in `status.airplay.error` or `status.companionLink.error`. Check for a `PairingError` there and offer to pair again:

```ts
import { PairingError } from '@corewire/devices';

tv.on('status', status => {
    if (status.companionLink?.error instanceof PairingError) {
        console.warn('Pair this Apple TV again.');
    }
});
```

`@corewire/devices` exports every error class. See [Logging and errors](/guide/logging-and-errors).
