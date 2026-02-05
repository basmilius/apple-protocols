# RAOP (Remote Audio Output Protocol) Findings

## Overview

RAOP is Apple's proprietary protocol for streaming audio to compatible devices over a network. It's the underlying technology that powers AirPlay audio streaming.

## Protocol Characteristics

### Discovery
- **Service Type**: `_raop._tcp.local`
- **Method**: mDNS (Multicast DNS / Bonjour)
- **Port**: Typically 5000, but can vary (advertised via mDNS)

### Connection Model
- **Transport**: TCP for control, RTP/UDP for audio data
- **Control Port**: Advertised via mDNS service
- **Data Port**: Negotiated during session setup

### Authentication
- **Methods**: 
  - None (for older devices)
  - RSA-based authentication (AirPlay 1)
  - Pair-verify with Ed25519 (AirPlay 2)

## Protocol Flow

### 1. Device Discovery
```
Client -> mDNS Query (_raop._tcp.local)
Device -> mDNS Response (IP, Port, TXT records)
```

### 2. Session Establishment
```
Client -> RTSP OPTIONS (capabilities query)
Device -> 200 OK (supported methods)

Client -> RTSP ANNOUNCE (session parameters, audio codec)
Device -> 200 OK

Client -> RTSP SETUP (transport configuration)
Device -> 200 OK (transport parameters, server ports)
```

### 3. Audio Streaming
```
Client -> RTSP RECORD (start playback)
Device -> 200 OK

Client -> RTP Packets (audio data stream)

Client -> RTSP TEARDOWN (end session)
Device -> 200 OK
```

## TXT Record Fields

Common fields found in RAOP mDNS advertisements:

- `txtvers`: Protocol version (typically "1")
- `am`: Device model identifier  
- `cn`: Device capabilities
- `da`: Device signature/authentication requirement
- `et`: Encryption types supported
- `ft`: Feature flags
- `md`: Model name
- `pw`: Password required (boolean)
- `sf`: System flags
- `tp`: Transport protocol
- `vn`: Version number

## RTSP Commands

RAOP uses RTSP (Real-Time Streaming Protocol) for control:

- **OPTIONS**: Query supported methods
- **ANNOUNCE**: Declare session parameters and audio format
- **SETUP**: Configure transport (ports, protocols)
- **RECORD**: Start audio playback
- **SET_PARAMETER**: Runtime parameter changes (volume, etc.)
- **GET_PARAMETER**: Query runtime parameters
- **FLUSH**: Clear audio buffer
- **TEARDOWN**: End session

## Audio Codecs

Supported formats (device-dependent):
- **ALAC** (Apple Lossless): Most common, high quality
- **AAC**: Compressed, lower bandwidth
- **PCM**: Uncompressed, highest quality

## Implementation Status

### ✅ Completed
- Device discovery via mDNS
- RTSP protocol client with all commands
- RTP packet structure and streaming
- SDP generation for audio negotiation
- Session lifecycle management
- Volume control via SET_PARAMETER
- Support for ALAC, PCM, and AAC formats
- UDP transport for audio data

### 🔐 Optional/Advanced Features (Not Implemented)
- RSA authentication (not required for most devices)
- AirPlay 2 pair-verify encryption
- NTP/PTP timing synchronization
- Multi-room audio synchronization
- Audio buffer management and jitter handling
- Metadata transmission (cover art, track info)
- Lossless audio encoding (requires ALAC encoder)

## Implementation Details

The implementation provides:

1. **RtspClient**: Full RTSP protocol implementation
   - Request/response parsing
   - Session management
   - All RAOP commands

2. **RtpStream**: RTP packet handling
   - Sequence numbering
   - Timestamp management
   - Packet serialization

3. **SdpBuilder**: SDP content generation
   - Multiple codec support
   - Format parameter encoding

4. **RaopSession**: High-level session API
   - Connection establishment
   - Audio streaming interface
   - Volume control

## References

- AirPlay protocol is built on top of RAOP
- RTSP: RFC 2326
- RTP: RFC 3550
- mDNS/Bonjour: RFC 6762, RFC 6763

## Notes

This implementation provides complete RAOP client functionality:
- Discovery of RAOP-capable devices
- RTSP control protocol
- RTP audio streaming
- Volume control

To use this for actual audio playback:
1. Discover and connect to a device
2. Setup session with desired audio format
3. Encode audio to the selected format (ALAC/PCM/AAC)
4. Stream encoded audio via RTP packets
5. Handle timing for smooth playback

The current implementation focuses on the protocol layer. Audio encoding (e.g., ALAC compression) would need to be added separately for production use. PCM format works without encoding but requires more bandwidth.

Example workflow:
```typescript
const session = new RaopSession(device);
await session.establish();
await session.setupSession({ codec: 'PCM', sampleRate: 44100, channels: 2, bitsPerSample: 16 });
await session.startPlayback();

// Stream audio frames
for (const frame of audioFrames) {
  await session.sendAudio(frame);
  // Add timing delay based on frame size and sample rate
}

await session.teardown();
```
