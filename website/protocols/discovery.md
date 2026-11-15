# Discovery

```ts
import { Discovery, mdnsMulticast, mdnsUnicast } from '@corewire/core/discovery';
```

`@corewire/core/discovery` has its own DNS encoder and decoder, with no dependencies. It sends DNS-SD queries over multicast or unicast from a socket per network interface.

## The Discovery class

A `Discovery` searches for one service type.

```ts
import { Discovery } from '@corewire/core/discovery';

const airplay = new Discovery('_airplay._tcp.local');

const all = await airplay.find();
const one = await airplay.findUntil('Living-Room.local');
const byAddress = await airplay.findByAddress('192.168.1.20');

console.log(all.length, one.address, byAddress?.service.port);
```

| Method | Meaning |
| --- | --- |
| `find(useCache = true)` | One multicast scan; a scan less than 30 seconds old is reused |
| `findUntil(id, tries = 10, timeout = 1000)` | Scans without cache until the id shows up, waiting `timeout` ms between tries; throws `DiscoveryError` after the last try |
| `findByAddress(address, timeout = 4, wakePorts = [])` | A unicast query to one address; null when it does not answer |
| `Discovery.findServices(services, useCache = true)` | One multicast scan for several service types, as a map |
| `Discovery.clearCache()` | Forgets every cached scan |
| `Discovery.wake(address, ports)` | Knocks on each port to wake a sleeping device |

A `DiscoveryResult` has the `id`, `address`, `txt` record, `fqdn` and the `service` port, protocol and type. The model identifier is in the TXT record, as `txt.model` or `txt.am`.

`DiscoverOptions` (`{useCache?: boolean}`) is defined here once; the `discover()` of every protocol package and of `@corewire/devices` takes it.

The service constants live in the protocol packages: `AIRPLAY_SERVICE` in `@corewire/airplay`, `RAOP_SERVICE` in `@corewire/airplay/raop` and `COMPANION_LINK_SERVICE` in `@corewire/companion-link`. Each package also has a `discover()` of its own.

## Raw queries

`mdnsMulticast(services, timeout = 4)` and `mdnsUnicast(hosts, services, timeout = 4, wakePorts = [])` return `MdnsService` records with `name`, `type`, `address`, `port` and `properties`. Timeouts are in seconds.

```ts
import { mdnsUnicast } from '@corewire/core/discovery';

const services = await mdnsUnicast(['192.168.1.20'], ['_airplay._tcp.local', '_companion-link._tcp.local'], 5, [7000]);

for (const service of services) {
    console.log(service.type, service.port);
}
```

## Advertising

`MdnsResponder` advertises one service with periodic multicasts and answers queries for its type. It does not fully parse DNS questions and is meant for quiet test networks.

```ts
import { MdnsResponder } from '@corewire/core/discovery';
import { Context } from '@corewire/core/transport';

const responder = new MdnsResponder(new Context('test').logger, {
    instance: 'Test Receiver',
    type: '_airplay._tcp.local',
    host: 'test-receiver.local',
    port: 7000,
    txt: {model: 'AppleTV14,1'}
});

responder.start();
```
