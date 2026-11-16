# @apple-protocols/companion-link

Companion Link for Node.js: the protocol an iPhone uses to control an Apple TV. A session gives HID keys, touch, text input, power, apps, accounts, media and system controls.

Part of [Apple Protocols](https://apple-protocols.dev). To control a device without handling sessions yourself, use `@apple-protocols/devices`.

## Install

```sh
npm install @apple-protocols/companion-link@next
```

Requires Node.js 18.17 or later (20.3 or later on the 20 line).

## Example

```ts
import { connect, discover, toTarget } from '@apple-protocols/companion-link';

const [device] = await discover();
const session = await connect(toTarget(device), {credentials});

const apps = await session.apps.list();
await session.apps.launch(apps[0].bundleId);
await session.close();
```

`credentials` come from a PIN pairing with `pair(target)`.

## License

MIT
