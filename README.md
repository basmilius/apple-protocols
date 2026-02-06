# Apple Protocols

This repository provides TypeScript implementations of several proprietary Apple network protocols. It was developed for use with [Apple for Homey Pro](https://github.com/basmilius/homey-apple).

## ⚙️ Requirements

- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/)
- An Apple TV or HomePod (for testing)
- Patience — these are low-level protocols

## 🚀 Getting Started

1. Install dependencies using `bun install`.

## 📡 Protocols

### AirPlay 2

**Path**: packages/airplay

Full implementation of Apple's AirPlay 2 protocol stack, including:
- Remote control and media playback
- **RAOP (Remote Audio Output Protocol)** for audio streaming
- Event and data streams
- HAP-style pairing and verification

#### Features

- ✅ Device discovery via mDNS
- ✅ HAP pairing for HomePods
- ✅ Verify authentication for Apple TVs
- ✅ Control stream (RTSP)
- ✅ Event stream (notifications)
- ✅ Data stream (media control)
- ✅ Audio stream (RAOP)
- ✅ ChaCha20-Poly1305 encryption

#### 🧱 Build

```shell
cd packages/airplay && bun run build
```

#### 🔍 Discover Devices

```shell
cd packages/airplay && bun find.ts
```

#### 🧪 Test

Test with HomePod or Apple TV:

```shell
cd packages/airplay && bun test.ts homepod
cd packages/airplay && bun test.ts tv
```

#### 🎵 Audio Streaming (RAOP)

Stream audio to HomePods and Apple TVs:

```shell
cd packages/airplay && bun test-audio.ts homepod
```

See [RAOP.md](RAOP.md) for complete RAOP documentation and examples.

### Companion Link

**Path**: packages/companion-link

Implements the Companion Link protocol, primarily used for communication with Apple TV devices.
The protocol uses a binary format transmitted over TCP.

#### 🧱 Build

```shell
bun --cwd packages/companion-link build
```

#### 🔍 Discover Devices

```shell
bun --cwd packages/companion-link find
```

#### 🧪 Test

1. Update the FQDN in src/test.ts to match your target device.
2. Make sure that you call `pair()` first, so that device credentials are created.
3. When credentials are available, update the file and run `verify()`.

```shell
bun --cwd packages/companion-link watch:test
```

## 📦 Packages

| Package | Description | Status |
|---------|-------------|--------|
| `@basmilius/apple-airplay` | AirPlay 2 protocol with RAOP audio streaming | ✅ Working |
| `@basmilius/apple-companion-link` | Companion Link protocol | ✅ Working |
| `@basmilius/apple-common` | Shared utilities and types | ✅ Working |
| `@basmilius/apple-devices` | Apple device database | ✅ Working |
| `@basmilius/apple-encoding` | Protocol encoding/decoding | ✅ Working |

## 🎯 Device Compatibility

| Device | AirPlay 2 | RAOP Audio | Companion Link |
|--------|-----------|------------|----------------|
| HomePod | ✅ | ✅ | ❌ |
| HomePod mini | ✅ | ✅ | ❌ |
| Apple TV 4K | ✅ | ✅ | ✅ |
| Apple TV HD | ✅ | ✅ | ✅ |
| AirPort Express | ⚠️ | ✅ | ❌ |

## 📚 Documentation

- [RAOP Audio Streaming Guide](RAOP.md) - Complete guide to audio streaming
- [AirPlay Package](packages/airplay/) - Full AirPlay v2 implementation
- [Companion Link Package](packages/companion-link/) - Apple TV communication

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📄 License

See LICENSE file for details.
