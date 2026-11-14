# Apple Protocols

[![Build checks](https://github.com/basmilius/apple-protocols/actions/workflows/checks.yml/badge.svg)](https://github.com/basmilius/apple-protocols/actions/workflows/checks.yml)
[![Release packages](https://github.com/basmilius/apple-protocols/actions/workflows/released.yml/badge.svg)](https://github.com/basmilius/apple-protocols/actions/workflows/released.yml)

TypeScript implementations of AirPlay 2, the Media Remote Protocol (MRP), RAOP and Companion Link, published under the `@corewire` scope. They run on Node.js and Bun without native dependencies.

I wrote most of this by studying network traffic and reading other implementations of Apple's undocumented protocols. The rewrite to TypeScript started so the [Homey app](https://github.com/basmilius/homey-apple) could control Apple TVs and HomePods without a Python runtime. That app is still the main user, and it shapes what `@corewire/devices` promises to keep stable.

## Packages

| Package                    | What it is                                                                                                   |
|----------------------------|--------------------------------------------------------------------------------------------------------------|
| `@corewire/devices`        | `AppleTV` and `HomePod`. They connect, recover on their own and expose remote, now playing, volume, apps and media. Start here. |
| `@corewire/airplay`        | The AirPlay 2 session with its control, event and data channels, URL playback, audio streaming and timing. MRP lives on `@corewire/airplay/mrp`, RAOP on `/raop`, RTSP on `/rtsp`. |
| `@corewire/companion-link` | The Companion Link session of an Apple TV: HID, touch, text input, power, apps, accounts, media, system settings. |
| `@corewire/audio-source`   | Audio sources for streaming: MP3, OGG, WAV, FLAC and QOA decoders, PCM, FFmpeg, URLs, live input and a sine wave. |
| `@corewire/core`           | What the protocols share: TLV8, OPack, plist and DAAP codecs, ChaCha20, Ed25519, Curve25519, SRP, HAP pairing, encrypted transport and mDNS. It knows no protocol. |

The protocol packages depend only on `core`. `devices` is the one place where AirPlay and Companion Link meet. All packages share one version.

## Install

```bash
bun add @corewire/devices
bun add @corewire/audio-source   # only to stream audio from your own process
```

`npm install` and `pnpm add` work as well. Install a protocol package directly (`@corewire/airplay`, `@corewire/companion-link`) when you want the protocol without the device layer.

## Apple TV and HomePod

### Pair an Apple TV once

A HomePod needs no pairing. An Apple TV shows a PIN, and the credentials it returns are yours to store.

```ts
import { AppleTV } from '@corewire/devices';

const pairing = await AppleTV.pair({address: '192.168.1.20'});

// The Apple TV now shows a four digit PIN.
const credentials = await pairing.pin('1234');

await save(credentials.toString());
```

`Credentials.parse()` reads that string back. It also reads the hex object older versions of the Homey app stored.

### Connect and stay connected

```ts
import { AppleTV, Credentials } from '@corewire/devices';

const tv = new AppleTV({address: '192.168.1.20'}, {
    credentials: Credentials.parse(await load()),
    log: entry => console.log(entry.level, entry.message)
});

tv.on('status', status => {
    // 'disconnected' | 'connecting' | 'connected' | 'degraded' | 'recovering' | 'offline'
    console.log(status.state, status.reason, status.airplay.state, status.companionLink?.state);
});

tv.nowPlaying.on('change', item => {
    console.log(item?.app.name, item?.title, item?.state);
});

await tv.connect();

await tv.remote.press('select');
await tv.remote.press('home', {mode: 'double'});
await tv.playback.setRepeat('all');
await tv.volume.set(0.3);

if (tv.supports('apps')) {
    await tv.apps.launch('com.apple.TVMusic');
}

await tv.disconnect();
```

`connect()` resolves once the device is usable. After that the device keeps itself connected until `disconnect()`. When a connection drops it retries after 1, 2 and 4 seconds. An Apple TV then tries every 2 minutes for half an hour and every 15 minutes after that. A HomePod goes straight to every 15 minutes. Neither gives up. Before every retry the device looks up its address again, so a new DHCP lease does not strand it.

`degraded` means AirPlay works and Companion Link does not yet. Remote, now playing and volume keep working, and the device attaches Companion Link as soon as it answers. Capabilities such as `tv.apps` always exist. `supports()` tells you whether one works right now, and a call that cannot work throws an `UnavailableError`.

### Find devices

```ts
import { createDevice, discover } from '@corewire/devices';

const found = await discover();

for (const device of found) {
    console.log(device.name, device.modelName, device.address);
}

// An AppleTV for an Apple TV, a HomePod for everything else.
const device = createDevice(found[0], {log: entry => console.log(entry.message)});
```

You don't need discovery to connect. A device built from only an address finds its services itself.

### Stream audio to a HomePod

```ts
import { Url } from '@corewire/audio-source';
import { HomePod } from '@corewire/devices';

const pod = new HomePod({address: '192.168.1.30'});
await pod.connect();

const source = await Url.fromUrl('https://example.com/song.mp3');
const playback = await pod.media.streamAudio(source, {volume: 0.4});
await playback.ended;

// Or let the device fetch and play the URL itself.
await pod.media.playUrl('https://example.com/stream.m3u8', {position: 30});
```

Volume is always 0 to 1 on a device. Lyrics and animated artwork from the Apple Music catalog live in `@corewire/devices/catalog`. The device never goes to the internet on its own.

## The protocols directly

### AirPlay and MRP

`connect()` returns a session that is ready to use: pair-verify, encryption, `/info` and the keepalive are done. A session lives once. It ends with a reason (`local`, `remote`, `timeout` or `error`) and does not reconnect.

```ts
import { connect, discover, pair, toTarget } from '@corewire/airplay';
import { MediaRemote } from '@corewire/airplay/mrp';

const [found] = await discover();
const target = toTarget(found);

// Apple TV: pair once with a PIN. A HomePod connects without credentials (transient pairing).
const pairing = await pair(target);
const credentials = await pairing.pin('1234');

const session = await connect(target, {credentials});
session.on('closed', (reason, error) => console.log('closed', reason, error));

const remote = await MediaRemote.open(session);

remote.state.on('nowPlayingChanged', (client, player) => {
    console.log(client?.bundleIdentifier, player?.title);
});

await remote.hid.select();
await remote.commands.pause();

await session.close();
```

`MediaRemote.state` is a model without I/O. Feed it recorded messages with `apply()` and it behaves the same as on a live session. `session.playUrl()` and `session.streamAudio()` open their own connections inside the package.

### Companion Link

```ts
import { connect, discover, toTarget } from '@corewire/companion-link';

const [found] = await discover();
const session = await connect(toTarget(found), {credentials});

session.on('closed', reason => console.log('closed', reason));

const apps = await session.apps.list();
await session.apps.launch(apps[0].bundleId);
await session.hid.press('Select');
console.log(await session.power.fetch());

await session.close();
```

The AirPlay credentials of an Apple TV work for Companion Link too. Companion Link also has its own `pair()`.

## Diagnostics

`packages/diagnostics` is a private Electron app for working against real devices. It pairs, connects several devices at once and has panels for remote control, now playing, volume, audio streaming, RAOP, multiroom, mDNS scans, encoding tools and stored credentials. It also has a pairing proxy that sits between a controller and a device. Every message the app sends or receives lands in a traffic view as decoded plaintext.

```bash
bun install
bun --cwd packages/diagnostics dev
```

`bun --cwd packages/diagnostics pack` builds installers for macOS, Linux and Windows into `packages/diagnostics/release/`.

Start it with `dev:agent` and the `diag` CLI drives the running app from a terminal. It can connect, press keys, read traffic, events and logs, and start or stop the proxy:

```bash
bun --cwd packages/diagnostics dev:agent
bun run diag wait-ready
bun run diag devices --scan
bun run diag connect living-room
bun run diag call living-room device remote.press up
bun run diag traffic --decoded --limit 20
bun run diag --help
```

[CLAUDE.md](CLAUDE.md) has the full workflow and the confirmation rules (in Dutch).

## Development

```bash
bun install
bash build.sh
bun run packages/core/test/pairing-server.ts
bun run packages/diagnostics/test/proxy-smoke.ts
```

`build.sh` builds every package in dependency order. Libraries run `tsgo --noEmit && tsdown`, and diagnostics runs its type checks and an Electron Vite build. CI runs the same three commands on every pull request. A GitHub release publishes the five libraries to npm with provenance.

Build or watch a single package:

```bash
bun --cwd packages/airplay build
bun --cwd packages/airplay dev
```

Regenerate the MRP protobuf code after changing one of the 155 `.proto` files in `packages/airplay/proto/`:

```bash
bun --cwd packages/airplay gen:proto   # writes packages/airplay/src/mrp/proto/
```

There is no automated test suite yet. Changes are checked with the builds, the two scripts above and diagnostics against real devices.

## License

MIT
