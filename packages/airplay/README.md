# @basmilius/apple-airplay

TypeScript implementation of Apple's AirPlay 2 protocol, including RAOP (Remote Audio Output Protocol) for audio streaming.

## Features

- ✅ Full AirPlay 2 protocol support
- ✅ HAP-style pairing and verification
- ✅ Control Stream (RTSP over TCP)
- ✅ Event Stream (notifications over TCP)
- ✅ Data Stream (media control over TCP)
- ✅ **Audio Stream (RAOP over UDP/RTP)**
- ✅ ChaCha20-Poly1305 encryption
- ✅ Device discovery via mDNS

## Installation

```bash
npm install @basmilius/apple-airplay @basmilius/apple-common @basmilius/apple-encoding
```

## Quick Start

### Audio Streaming to HomePod

```typescript
import { Discovery } from '@basmilius/apple-common';
import { Protocol } from '@basmilius/apple-airplay';

// Discover device
const discovery = Discovery.airplay();
const device = await discovery.findUntil('Your-HomePod.local');

// Connect
const protocol = new Protocol(device);
await protocol.connect();

// Authenticate (transient pairing for HomePod)
await protocol.pairing.start();
const keys = await protocol.pairing.transient();

// Enable encryption
protocol.controlStream.enableEncryption(
    keys.accessoryToControllerKey,
    keys.controllerToAccessoryKey
);

// Setup event stream
await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);

// Setup audio stream (RAOP)
await protocol.setupAudioStream(keys.sharedSecret, {
    codec: 'PCM',
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16
});

// Keep connection alive
setInterval(() => protocol.feedback(), 2000);

// Stream audio
const audioData = Buffer.alloc(352 * 4); // 352 samples, stereo, 16-bit
await protocol.audioStream.sendAudio(audioData);
```

### Media Control on Apple TV

```typescript
import { Discovery } from '@basmilius/apple-common';
import { Protocol, DataStreamMessage } from '@basmilius/apple-airplay';

// Discover and connect
const discovery = Discovery.airplay();
const device = await discovery.findUntil('Apple-TV.local');
const protocol = new Protocol(device);
await protocol.connect();

// Use saved credentials (after initial pairing)
const keys = await protocol.verify.start({
    accessoryIdentifier: '...',
    accessoryLongTermPublicKey: Buffer.from('...', 'hex'),
    pairingId: Buffer.from('...', 'hex'),
    publicKey: Buffer.from('...', 'hex'),
    secretKey: Buffer.from('...', 'hex')
});

protocol.controlStream.enableEncryption(
    keys.accessoryToControllerKey,
    keys.controllerToAccessoryKey
);

// Setup streams
await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
await protocol.setupDataStream(keys.sharedSecret);

// Send commands
await protocol.dataStream.exchange(DataStreamMessage.deviceInfo(keys.pairingId));
await protocol.dataStream.exchange(DataStreamMessage.setVolume(outputUID, 0.5));
```

## Audio Formats

### PCM (Uncompressed)

```typescript
await protocol.setupAudioStream(keys.sharedSecret, {
    codec: 'PCM',
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16
});
```

- Simple, no encoding needed
- Works on all devices
- Higher bandwidth

### ALAC (Apple Lossless)

```typescript
await protocol.setupAudioStream(keys.sharedSecret, {
    codec: 'ALAC',
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16
});
```

- Lossless compression
- Lower bandwidth
- Requires encoding

### AAC (Lossy)

```typescript
await protocol.setupAudioStream(keys.sharedSecret, {
    codec: 'AAC',
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16
});
```

- Best compression
- Lossy quality
- Lowest bandwidth

## API Reference

### Protocol

Main class for managing AirPlay connections.

```typescript
class Protocol {
    // Properties
    get audioStream(): AudioStream | undefined;
    get controlStream(): ControlStream;
    get dataStream(): DataStream | undefined;
    get eventStream(): EventStream | undefined;
    
    // Methods
    async connect(): Promise<void>;
    async disconnect(): Promise<void>;
    async destroy(): Promise<void>;
    
    async setupAudioStream(
        sharedSecret: Buffer,
        audioFormat?: AudioFormat,
        controlPort?: number,
        timingPort?: number
    ): Promise<void>;
    
    async setupEventStream(
        sharedSecret: Buffer,
        pairingId: Buffer
    ): Promise<void>;
    
    async setupDataStream(
        sharedSecret: Buffer,
        onBeforeConnect?: () => void
    ): Promise<void>;
    
    async feedback(): Promise<void>;
}
```

### AudioStream

Handles RTP audio packet streaming.

```typescript
class AudioStream {
    async sendAudio(audioData: Buffer): Promise<void>;
    
    get sequenceNumber(): number;
    get timestamp(): number;
}
```

### AudioFormat

Audio format configuration.

```typescript
interface AudioFormat {
    codec: 'PCM' | 'ALAC' | 'AAC';
    sampleRate: number;      // 44100 or 48000
    channels: number;        // 1 (mono) or 2 (stereo)
    bitsPerSample: number;   // 8, 16, or 24
}
```

## Examples

### Stream Audio from File

```typescript
import fs from 'fs';

// Read WAV file (skip 44-byte header)
const wavData = fs.readFileSync('audio.wav');
const pcmData = wavData.slice(44);

// Stream in chunks
const chunkSize = 352 * 4; // 352 samples, stereo, 16-bit
for (let i = 0; i < pcmData.length; i += chunkSize) {
    const chunk = pcmData.slice(i, i + chunkSize);
    await protocol.audioStream.sendAudio(chunk);
    await new Promise(resolve => setTimeout(resolve, 8)); // ~8ms per packet
}
```

### Generate Test Tone

```typescript
// Generate 440Hz sine wave
const sampleRate = 44100;
const frequency = 440;

for (let t = 0; t < duration * sampleRate; t += 352) {
    const chunk = Buffer.alloc(352 * 4);
    for (let i = 0; i < 352; i++) {
        const time = (t + i) / sampleRate;
        const value = Math.sin(2 * Math.PI * frequency * time);
        const sample = Math.floor(value * 0x7FFF);
        chunk.writeInt16LE(sample, i * 4);     // Left channel
        chunk.writeInt16LE(sample, i * 4 + 2); // Right channel
    }
    await protocol.audioStream.sendAudio(chunk);
    await new Promise(resolve => setTimeout(resolve, 8));
}
```

## Device Compatibility

| Device | Support | Authentication |
|--------|---------|----------------|
| HomePod | ✅ Full | Transient pairing |
| HomePod mini | ✅ Full | Transient pairing |
| Apple TV 4K | ✅ Full | PIN pairing + verify |
| Apple TV HD | ✅ Full | PIN pairing + verify |
| AirPort Express | ✅ Works | Optional |

## Scripts

### Build

```bash
bun run build
```

### Find Devices

```bash
bun find.ts
```

### Test

```bash
# Test with HomePod
bun test.ts homepod

# Test with Apple TV
bun test.ts tv

# Pair with Apple TV (first time)
bun test.ts tvPair
```

### Audio Streaming

```bash
# Stream audio to HomePod
bun test-audio.ts homepod

# Stream audio to Apple TV
bun test-audio.ts tv
```

## Architecture

```
┌─────────────────────────────────────────┐
│            Protocol Class                │
├─────────────────────────────────────────┤
│  ┌───────────────┐  ┌────────────────┐  │
│  │ ControlStream │  │  EventStream   │  │
│  │   (RTSP/TCP)  │  │     (TCP)      │  │
│  └───────────────┘  └────────────────┘  │
│  ┌───────────────┐  ┌────────────────┐  │
│  │  DataStream   │  │  AudioStream   │  │
│  │     (TCP)     │  │   (RTP/UDP)    │  │
│  └───────────────┘  └────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │     Pairing/Verify (HAP Auth)     │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Troubleshooting

### 500 Internal Server Error

**Cause**: Missing authentication or encryption.

**Solution**: Ensure pairing/verify is completed and encryption is enabled:

```typescript
const keys = await protocol.pairing.transient();
protocol.controlStream.enableEncryption(keys.accessoryToControllerKey, keys.controllerToAccessoryKey);
```

### No Audio Output

**Cause**: Missing feedback loop or wrong format.

**Solution**:
1. Start feedback: `setInterval(() => protocol.feedback(), 2000)`
2. Verify audio format matches device
3. Check audio data is properly formatted (16-bit PCM, stereo)

### Connection Drops

**Cause**: No feedback or missing event stream.

**Solution**: Always setup event stream and feedback loop.

## Documentation

For complete documentation, see:
- [RAOP Guide](../../RAOP.md) - Complete RAOP audio streaming guide
- [Repository README](../../README.md) - Main documentation

## License

See LICENSE file for details.
