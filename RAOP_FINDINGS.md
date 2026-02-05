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
- Basic session management
- Connection establishment/teardown

### 🚧 Not Implemented (Future Work)
- RTSP protocol handling
- Audio codec integration
- RTP streaming
- Authentication/pairing
- Volume control
- Synchronization (multi-room audio)

## References

- AirPlay protocol is built on top of RAOP
- RTSP: RFC 2326
- RTP: RFC 3550
- mDNS/Bonjour: RFC 6762, RFC 6763

## Notes

This implementation provides foundational components for RAOP:
- Discovery of RAOP-capable devices
- Session lifecycle management
- Basic connection framework

A complete RAOP implementation requires:
1. RTSP client implementation
2. Audio encoding (ALAC/AAC)
3. RTP packet handling
4. Timing/synchronization
5. Authentication flows

The current implementation focuses on the discovery and connection layer, providing a starting point for audio streaming applications.
