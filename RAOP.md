# RAOP (Remote Audio Output Protocol) Implementation

## Overview

RAOP audio streaming is now integrated into the **AirPlay v2** package (`@basmilius/apple-airplay`), providing full compatibility with modern Apple devices including HomePods and Apple TVs.

## Quick Start

### Installation

```bash
npm install @basmilius/apple-airplay @basmilius/apple-common @basmilius/apple-encoding
```

### Basic Usage

```typescript
import { Discovery } from '@basmilius/apple-common';
import { Protocol } from '@basmilius/apple-airplay';

// Discover devices
const discovery = Discovery.airplay();
const device = await discovery.findUntil('Your-HomePod.local');

// Connect and authenticate
const protocol = new Protocol(device);
await protocol.connect();

await protocol.pairing.start();
const keys = await protocol.pairing.transient();

protocol.controlStream.enableEncryption(
    keys.accessoryToControllerKey,
    keys.controllerToAccessoryKey
);

// Setup event stream (required for HomePods)
await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);

// Setup audio stream with desired format
await protocol.setupAudioStream(
    keys.sharedSecret,
    {
        codec: 'PCM',          // 'PCM', 'ALAC', or 'AAC'
        sampleRate: 44100,     // Samples per second
        channels: 2,           // Stereo
        bitsPerSample: 16      // 16-bit audio
    }
);

// Stream audio data
const audioData = Buffer.alloc(352 * 4); // 352 samples, stereo, 16-bit
await protocol.audioStream.sendAudio(audioData);

// Keep connection alive
setInterval(() => protocol.feedback(), 2000);
```

## Audio Formats

### PCM (Recommended for simplicity)

```typescript
await protocol.setupAudioStream(keys.sharedSecret, {
    codec: 'PCM',
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16
});
```

- **Pros**: Simple, no encoding needed, works on all devices
- **Cons**: Higher bandwidth usage
- **Use case**: Real-time audio, simple applications

### ALAC (Apple Lossless)

```typescript
await protocol.setupAudioStream(keys.sharedSecret, {
    codec: 'ALAC',
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16
});
```

- **Pros**: Lossless compression, lower bandwidth
- **Cons**: Requires encoding
- **Use case**: Music streaming, high-quality audio

### AAC (Advanced Audio Coding)

```typescript
await protocol.setupAudioStream(keys.sharedSecret, {
    codec: 'AAC',
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16
});
```

- **Pros**: Best compression, lowest bandwidth
- **Cons**: Lossy, requires encoding
- **Use case**: Voice, lower bandwidth scenarios

## Complete Example

See `packages/airplay/test-audio.ts` for a complete working example that:
- Discovers HomePods
- Authenticates
- Streams a test tone (440Hz sine wave)
- Handles cleanup

```bash
cd packages/airplay
bun test-audio.ts homepod
```

## Device Compatibility

| Device | Support | Notes |
|--------|---------|-------|
| HomePod | ✅ Full | Requires AirPlay v2 with authentication |
| HomePod mini | ✅ Full | Requires AirPlay v2 with authentication |
| Apple TV 4K | ✅ Full | Can use verify with saved credentials |
| Apple TV HD | ✅ Full | Can use verify with saved credentials |
| AirPort Express | ✅ Works | Backward compatible |
| Third-party AirPlay | ⚠️ Varies | Depends on AirPlay version support |

## Architecture

The RAOP implementation consists of:

1. **Protocol**: Main class managing all streams
2. **ControlStream**: RTSP control channel (TCP)
3. **EventStream**: Event notifications (TCP)
4. **AudioStream**: RTP audio data (UDP)
5. **Pairing/Verify**: Authentication (HAP)

```
┌─────────────────────────────────────────┐
│            Protocol Class                │
├─────────────────────────────────────────┤
│  ┌───────────────┐  ┌────────────────┐  │
│  │ ControlStream │  │  EventStream   │  │
│  │   (RTSP/TCP)  │  │     (TCP)      │  │
│  └───────────────┘  └────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │        AudioStream (RTP/UDP)      │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │     Pairing/Verify (HAP Auth)     │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Audio Streaming Details

### RTP Packet Structure

```
┌─────────────┬──────────────┬─────────────┐
│ RTP Header  │ Audio Payload│ Encryption  │
│  (12 bytes) │  (variable)  │  (optional) │
└─────────────┴──────────────┴─────────────┘
```

### Timing

- **Samples per packet**: 352 (configurable)
- **Packet interval**: ~8ms at 44100 Hz
- **Sample rate**: 44100 Hz (standard) or 48000 Hz
- **Channels**: 1 (mono) or 2 (stereo)

### Encryption

Audio packets can be encrypted using ChaCha20-Poly1305:

```typescript
// Encryption is automatic when sharedSecret is provided
await protocol.setupAudioStream(keys.sharedSecret, audioFormat);
```

## Troubleshooting

### 500 Internal Server Error

**Cause**: Device requires authentication but not provided.

**Solution**: Ensure you call pairing/verify and enable encryption:

```typescript
const keys = await protocol.pairing.transient();
protocol.controlStream.enableEncryption(keys.accessoryToControllerKey, keys.controllerToAccessoryKey);
await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
```

### No Audio Output

**Cause**: Missing feedback loop or wrong audio format.

**Solution**: 
1. Start feedback loop: `setInterval(() => protocol.feedback(), 2000)`
2. Verify audio format matches device capabilities
3. Check audio data is properly formatted (16-bit PCM, stereo)

### Connection Drops

**Cause**: No feedback or missing event stream.

**Solution**: Always setup event stream and start feedback loop.

## API Reference

### Protocol

```typescript
class Protocol {
    // Streams
    get audioStream(): AudioStream | undefined;
    get controlStream(): ControlStream;
    get eventStream(): EventStream | undefined;
    get dataStream(): DataStream | undefined;
    
    // Connection
    async connect(): Promise<void>;
    async disconnect(): Promise<void>;
    async destroy(): Promise<void>;
    
    // Setup
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
    
    // Maintenance
    async feedback(): Promise<void>;
}
```

### AudioStream

```typescript
class AudioStream {
    async sendAudio(audioData: Buffer): Promise<void>;
    
    get sequenceNumber(): number;
    get timestamp(): number;
}
```

### AudioFormat

```typescript
interface AudioFormat {
    codec: 'PCM' | 'ALAC' | 'AAC';
    sampleRate: number;      // 44100 or 48000
    channels: number;        // 1 or 2
    bitsPerSample: number;   // 8, 16, or 24
}
```

## Migration from RAOP v1

The old RAOP v1 implementation has been removed. Key changes:

| Old (v1) | New (v2) |
|----------|----------|
| `RaopSession` | `Protocol` |
| `establish()` | `connect()` + authentication |
| `setupSession()` | `setupAudioStream()` |
| `sendAudio()` | `audioStream.sendAudio()` |
| Transport headers | Binary plist setup |
| Optional auth | Required for HomePods |
| AES encryption | ChaCha20 encryption |

## Examples

### Stream from File

```typescript
import fs from 'fs';

// Read WAV file (skip header, get PCM data)
const wavData = fs.readFileSync('audio.wav');
const pcmData = wavData.slice(44); // Skip 44-byte WAV header

// Stream in chunks
const chunkSize = 352 * 4; // 352 samples, stereo, 16-bit
for (let i = 0; i < pcmData.length; i += chunkSize) {
    const chunk = pcmData.slice(i, i + chunkSize);
    await protocol.audioStream.sendAudio(chunk);
    await waitFor(8); // ~8ms per packet
}
```

### Generate Test Tone

```typescript
// Generate 440Hz sine wave
const sampleRate = 44100;
const frequency = 440;
const duration = 5; // seconds

for (let t = 0; t < duration * sampleRate; t += 352) {
    const chunk = Buffer.alloc(352 * 4);
    for (let i = 0; i < 352; i++) {
        const time = (t + i) / sampleRate;
        const value = Math.sin(2 * Math.PI * frequency * time);
        const sample = Math.floor(value * 0x7FFF);
        chunk.writeInt16LE(sample, i * 4);     // Left
        chunk.writeInt16LE(sample, i * 4 + 2); // Right
    }
    await protocol.audioStream.sendAudio(chunk);
    await waitFor(8);
}
```

## Resources

- [AirPlay Package](./packages/airplay/)
- [Test Examples](./packages/airplay/test-audio.ts)
- [Apple Common Package](./packages/common/)
- [Encoding Package](./packages/encoding/)

## Support

For issues or questions, please file a GitHub issue in this repository.
