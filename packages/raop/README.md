# @basmilius/apple-raop

TypeScript implementation of RAOP (Remote Audio Output Protocol) for discovering and connecting to Apple audio streaming devices.

## Overview

RAOP is Apple's protocol for streaming audio over a network, forming the foundation of AirPlay audio capabilities. This package provides basic device discovery and session management.

## Installation

```bash
npm install @basmilius/apple-raop
```

## Features

- 🔍 **Device Discovery**: Find RAOP-enabled devices on your local network via mDNS
- 🔌 **Connection Management**: Establish and manage sessions with discovered devices
- 📡 **Network Discovery**: Built on the mDNS service `_raop._tcp.local`

## Usage

### Discovering Devices

```typescript
import { RaopFinder } from '@basmilius/apple-raop';

const finder = new RaopFinder();
const devices = await finder.locateDevices();

console.log(`Found ${devices.length} RAOP device(s)`);
devices.forEach(device => {
  console.log(`  - ${device.id} at ${device.address}:${device.service.port}`);
});
```

### Connecting to a Device

```typescript
import { RaopFinder, RaopSession } from '@basmilius/apple-raop';

const finder = new RaopFinder();
const devices = await finder.locateDevices();

if (devices.length > 0) {
  const session = new RaopSession(devices[0]);
  
  await session.establish();
  console.log(`Connected to ${session.getDeviceIdentifier()}`);
  console.log(`Session active: ${session.isActive()}`);
  
  await session.teardown();
}
```

### Finding a Specific Device

```typescript
const finder = new RaopFinder();
const device = await finder.locateDevice('AppleTV.local', 10, 1000);

const session = new RaopSession(device);
await session.establish();
```

## Scripts

```bash
# Discover RAOP devices on network
npm run discover

# Run basic connection demo
npm run demo

# Compile TypeScript
npm run compile
```

## API Reference

### `RaopFinder`

Discovers RAOP-enabled devices on the network.

#### Methods

- **`locateDevices()`** - Find all RAOP devices on the network  
  Returns: `Promise<DiscoveryResult[]>`

- **`locateDevice(deviceId, attempts?, delayMs?)`** - Find a specific device with retries  
  Returns: `Promise<DiscoveryResult>`

### `RaopSession`

Manages a connection session with a RAOP device.

#### Constructor

- `constructor(device: DiscoveryResult)` - Create session for discovered device

#### Methods

- **`establish()`** - Open connection to device  
  Returns: `Promise<void>`

- **`teardown()`** - Close connection  
  Returns: `Promise<void>`

- **`isActive()`** - Check if session is connected  
  Returns: `boolean`

- **`getDeviceIdentifier()`** - Get device ID  
  Returns: `string`

#### Properties

- `deviceInfo`: DiscoveryResult - Information about connected device

## Current Limitations

This is a foundational implementation providing discovery and basic connectivity. Full RAOP functionality requires:

- RTSP protocol implementation
- Audio codec support (ALAC, AAC, PCM)
- RTP streaming
- Authentication/pairing flows
- Volume control
- Timing synchronization

See [RAOP_FINDINGS.md](../../RAOP_FINDINGS.md) for detailed protocol information.

## License

MIT
