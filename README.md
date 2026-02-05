# Apple Protocols

This repository provides TypeScript implementations of several proprietary Apple network protocols. It was developed for use with [Apple for Homey Pro](https://github.com/basmilius/homey-apple).

## ⚙️ Requirements

- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/)
- An Apple TV (for testing)
- Patience — these are low-level protocols

## 🚀 Getting Started

1. Install dependencies using `bun install`.

## 📡 Protocols

### AirPlay 2

Implementation of Apple’s AirPlay 2 protocol stack.

_Currently under development._

### RAOP (Remote Audio Output Protocol)

**Path**: packages/raop

Implements the Remote Audio Output Protocol for discovering and connecting to Apple audio streaming devices.
This is the underlying protocol that powers AirPlay audio streaming.

#### 🧱 Build

To compile the @basmilius/apple-raop package:

```shell
cd packages/raop && npm run compile
```

#### 🔍 Discover Devices

To find RAOP-enabled devices via mDNS on your local network:

```shell
cd packages/raop && npm run discover
```

#### 🧪 Demo

Run a basic connection test:

```shell
cd packages/raop && npm run demo
```

See [RAOP_FINDINGS.md](RAOP_FINDINGS.md) for detailed protocol information and implementation notes.

### Companion Link

**Path**: packages/companion-link

Implements the Companion Link protocol, primarily used for communication with Apple TV devices.
The protocol uses a binary format transmitted over TCP.

#### 🧱 Build

To build the @basmilius/apple-companion-link package:

```shell
bun --cwd packages/companion-link build
```

#### 🔍 Discover Devices

To find Companion Link–enabled devices via mDNS on your local network:

```shell
bun --cwd packages/companion-link find
```

#### 🧪 Test

You can run a test script against a target Apple TV.

1. Update the FQDN in src/test.ts to match your target device.
2. Make sure that you call `pair()` first, so that device credentials are created.
3. When credentials are available, update the file and run `verify()`.

```shell
bun --cwd packages/companion-link watch:test
```
