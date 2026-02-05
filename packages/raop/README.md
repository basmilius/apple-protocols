# @basmilius/apple-raop

Full TypeScript implementation of RAOP (Remote Audio Output Protocol) for streaming audio to Apple devices over the network.

## Overview

RAOP is Apple's proprietary protocol for streaming audio, forming the foundation of AirPlay audio capabilities. This package provides a complete implementation including RTSP control, RTP audio streaming, and session management.

## Installation

```bash
npm install @basmilius/apple-raop
```

## Features

- 🔍 **Device Discovery**: Find RAOP-enabled devices on your local network via mDNS
- 🎛️ **RTSP Control**: Full RTSP protocol implementation for session management
- 🎵 **Audio Streaming**: RTP-based audio transmission with proper timing
- 📡 **Multiple Codecs**: Support for ALAC, PCM, and AAC audio formats
- 🔊 **Volume Control**: Runtime volume adjustment
- 🔐 **Session Management**: Complete session lifecycle handling

## Usage

### Complete Streaming Session

```typescript
import { RaopFinder, RaopSession } from '@basmilius/apple-raop';

const finder = new RaopFinder();
const devices = await finder.locateDevices();

const session = new RaopSession(devices[0]);

// Establish RTSP control connection
await session.establish();

// Setup audio session (ALAC 44.1kHz stereo by default)
await session.setupSession({
  codec: 'ALAC',
  sampleRate: 44100,
  channels: 2,
  bitsPerSample: 16,
});

// Start playback
await session.startPlayback();

// Stream audio data
const audioBuffer = ...; // Your audio data
await session.sendAudio(audioBuffer);

// Control volume (0.0 to 1.0)
await session.setVolume(0.5);

// Close session
await session.teardown();
```

### Advanced Usage

#### Custom Audio Format

```typescript
// Use PCM format
await session.setupSession({
  codec: 'PCM',
  sampleRate: 48000,
  channels: 2,
  bitsPerSample: 16,
});
```

#### Low-Level RTP Streaming

```typescript
import { RtpStream } from '@basmilius/apple-raop';

const rtpStream = new RtpStream(44100);
const packet = rtpStream.createPacket(audioBuffer);
// Send packet.toBuffer() via UDP socket
```

#### Custom SDP Configuration

```typescript
import { SdpBuilder } from '@basmilius/apple-raop';

const sdp = SdpBuilder.defaultAlac().build();
// Use custom SDP in RTSP ANNOUNCE
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

# Run basic session demo
npm run demo

# Run complete audio streaming example (generates test tone)
npm run example

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

Manages a complete RAOP streaming session.

#### Constructor

- `constructor(device: DiscoveryResult)` - Create session for discovered device

#### Methods

- **`establish()`** - Open RTSP control connection  
  Returns: `Promise<void>`

- **`setupSession(audioFormat?)`** - Configure audio format and transport  
  Returns: `Promise<void>`  
  Parameters:
  - `audioFormat?`: AudioFormat - Audio configuration (defaults to ALAC 44.1kHz stereo)

- **`startPlayback()`** - Begin audio streaming  
  Returns: `Promise<void>`

- **`sendAudio(buffer)`** - Send audio data as RTP packet  
  Returns: `Promise<void>`  
  Parameters:
  - `buffer`: Buffer - Audio data to stream

- **`setVolume(level)`** - Adjust playback volume  
  Returns: `Promise<void>`  
  Parameters:
  - `level`: number - Volume level from 0.0 (mute) to 1.0 (max)

- **`teardown()`** - End session and close connections  
  Returns: `Promise<void>`

- **`isActive()`** - Check if session is connected  
  Returns: `boolean`

- **`getDeviceIdentifier()`** - Get device ID  
  Returns: `string`

- **`getSessionConfig()`** - Get current session configuration  
  Returns: `SessionConfig | null`

#### Properties

- `deviceInfo`: DiscoveryResult - Information about connected device

### `RtspClient`

Low-level RTSP protocol client.

#### Methods

- **`options(uri)`** - Send OPTIONS request
- **`announce(uri, sdp)`** - Send ANNOUNCE with SDP
- **`setup(uri, transport)`** - Send SETUP request
- **`record(uri, rtpInfo?)`** - Send RECORD to start streaming
- **`setParameter(uri, param, value)`** - Send SET_PARAMETER
- **`teardown(uri)`** - Send TEARDOWN to end session

### `RtpStream`

RTP packet sequence manager.

#### Methods

- **`createPacket(audioData, samplesPerFrame?)`** - Create next RTP packet
- **`getSsrc()`** - Get synchronization source identifier
- **`getSequenceNumber()`** - Get current sequence number
- **`getTimestamp()`** - Get current timestamp
- **`reset()`** - Reset stream state

### `SdpBuilder`

SDP (Session Description Protocol) content builder.

#### Static Methods

- **`defaultAlac()`** - Create builder with default ALAC configuration
- **`pcm(sampleRate?, channels?)`** - Create builder with PCM configuration

#### Methods

- **`build()`** - Generate SDP content string

### Types

#### `AudioFormat`
```typescript
interface AudioFormat {
  codec: 'ALAC' | 'PCM' | 'AAC';
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}
```

#### `SessionConfig`
```typescript
interface SessionConfig {
  audioFormat: AudioFormat;
  transport: TransportConfig;
  volume?: number;
}
```

#### `TransportConfig`
```typescript
interface TransportConfig {
  protocol: 'RTP/AVP/UDP' | 'RTP/AVP/TCP';
  clientPort: number;
  serverPort?: number;
  mode: 'record' | 'play';
}
```

## Protocol Implementation

This package implements the complete RAOP protocol stack:

### RTSP Control Layer
- **OPTIONS**: Query device capabilities
- **ANNOUNCE**: Declare audio format via SDP
- **SETUP**: Configure RTP transport
- **RECORD**: Start audio streaming
- **SET_PARAMETER**: Runtime control (volume, etc.)
- **TEARDOWN**: End session

### RTP Audio Layer
- Real-time audio packet transmission
- Sequence numbering and timing
- Support for multiple audio codecs

### Supported Audio Formats
- **ALAC** (Apple Lossless): High quality, most compatible
- **PCM** (L16): Uncompressed, highest quality
- **AAC**: Compressed, lower bandwidth

## Implementation Status

### ✅ Fully Implemented
- Device discovery via mDNS
- RTSP protocol client (all commands)
- RTP packet structure and streaming
- SDP generation for audio formats
- Session lifecycle management
- Volume control
- Multiple audio codec support

### 🔐 Not Implemented (Optional)
- Authentication/encryption (older devices work without auth)
- Timing synchronization protocol (NTP/PTP)
- Multi-room audio synchronization
- Metadata (cover art, track info)

## Notes

This implementation provides a complete RAOP client suitable for:
- Audio streaming applications
- AirPlay audio integration
- Custom audio players
- Network audio research

Most modern Apple devices accept unauthenticated RAOP connections for basic audio streaming. Advanced features like encryption may be required for some commercial applications.

## Known Limitations

While the core protocol is fully implemented, some advanced features are not included:

- **Audio Encoding**: Raw audio data must be pre-encoded to the target format (ALAC/AAC/PCM)
- **Authentication**: No RSA or pair-verify authentication (not required for most consumer devices)
- **Timing Protocol**: No NTP/PTP timing synchronization (basic RTP timing only)
- **Multi-room**: No synchronization across multiple devices
- **Metadata**: No support for cover art or track information
- **Buffering**: No adaptive jitter buffer or packet loss recovery

For production audio streaming, you'll need to add:
- Audio encoder (e.g., ALAC compression library)
- Timing management for smooth playback
- Buffer management for network jitter

See [RAOP_FINDINGS.md](../../RAOP_FINDINGS.md) for detailed protocol information.

## License

MIT
