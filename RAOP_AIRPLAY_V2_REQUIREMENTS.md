# RAOP AirPlay v2 Requirements

## Problem Statement

HomePods (and newer Apple devices) are returning **500 Internal Server Error** during the SETUP command, even though our AirPlay v1 implementation matches pyatv's airplayv1.py exactly.

## Root Cause

**HomePods require AirPlay v2 protocol**, which is fundamentally different from v1!

## AirPlay v1 vs v2 Comparison

### AirPlay v1 (Currently Implemented)

**Protocol Flow:**
```
1. AUTH-SETUP (optional, HTTP/1.1)
2. OPTIONS
3. ANNOUNCE (with SDP body)
4. SETUP (with Transport header)
5. RECORD
6. Stream audio via RTP/UDP
```

**SETUP Request:**
```
SETUP rtsp://192.168.1.94/12345678 RTSP/1.0
CSeq: 4
Transport: RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;control_port=50529;timing_port=52066
User-Agent: AirPlay/550.10
DACP-ID: 1234567890ABCDEF
Active-Remote: 1234567890
Client-Instance: 1234567890ABCDEF
```

### AirPlay v2 (HomePods Require)

**Protocol Flow:**
```
1. Pair-verify (HAP authentication)
2. SETUP (base connection with plist body)
3. Event channel setup (encrypted)
4. SETUP (audio stream with plist body)
5. RECORD
6. Stream encrypted audio via RTP/UDP
```

**SETUP Request (Base):**
```
SETUP rtsp://192.168.1.94/12345678 RTSP/1.0
CSeq: 2
Content-Type: application/x-apple-binary-plist
User-Agent: AirPlay/550.10
X-Apple-ProtocolVersion: 1
X-Apple-Session-ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
X-Apple-Stream-ID: 1

<binary plist body>:
{
  "deviceID": "AA:BB:CC:DD:EE:FF",
  "sessionUUID": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  "timingPort": 52066,
  "timingProtocol": "NTP",
  "isMultiSelectAirPlay": true,
  "groupContainsGroupLeader": false,
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "model": "iPhone14,3",
  "name": "pyatv",
  "osBuildVersion": "20F66",
  "osName": "iPhone OS",
  "osVersion": "16.5",
  "senderSupportsRelay": false,
  "sourceVersion": "690.7.1",
  "statsCollectionEnabled": false
}
```

**SETUP Response:**
```json
{
  "eventPort": 7000,
  "timingPort": 52066
}
```

**SETUP Request (Audio Stream):**
```
SETUP rtsp://192.168.1.94/12345678 RTSP/1.0
CSeq: 3
Content-Type: application/x-apple-binary-plist

<binary plist body>:
{
  "streams": [{
    "audioFormat": 0x800,
    "audioMode": "default",
    "controlPort": 50529,
    "ct": 1,  // Raw PCM
    "isMedia": true,
    "latencyMax": 88200,
    "latencyMin": 11025,
    "shk": <32-byte shared secret>,
    "spf": 352,  // Samples Per Frame
    "sr": 44100,  // Sample Rate
    "type": 0x60,
    "supportsDynamicStreamID": false,
    "streamConnectionID": 12345678
  }]
}
```

**SETUP Response:**
```json
{
  "streams": [{
    "controlPort": 54321,
    "dataPort": 54320,
    "type": 0x60
  }]
}
```

## Key Differences

### 1. Request Format
- **v1**: Transport header with semicolon-separated parameters
- **v2**: Binary plist body with structured data

### 2. SETUP Calls
- **v1**: Single SETUP call
- **v2**: Two SETUP calls (base connection + audio stream)

### 3. Headers
- **v1**: DACP-ID, Active-Remote, Client-Instance
- **v2**: X-Apple-Session-ID, X-Apple-Stream-ID, X-Apple-ProtocolVersion

### 4. Authentication
- **v1**: Optional auth-setup with Curve25519 (basic)
- **v2**: Required HAP pair-verify (full authentication)

### 5. Event Channel
- **v1**: None
- **v2**: Encrypted side channel for events (separate TCP connection)

### 6. Audio Encryption
- **v1**: Optional AES-128-CBC with RSA key exchange
- **v2**: ChaCha20-Poly1305 with shared secret from pair-verify

### 7. Response Format
- **v1**: RTSP headers (Transport, Session)
- **v2**: Binary plist body

## Detection

Devices advertise their capabilities in mDNS TXT records:

```
TXT Record Fields:
- pk: Public key for pairing
- pi: Protocol ID/version
- ft: Feature flags (indicates v2 support)
- sf: System flags
- vv: Version
- et: Encryption type
```

HomePods typically have:
- `ft` with v2 flags set
- `pk` present (pairing key)
- Higher version in `vv`

## Implementation Requirements

To support AirPlay v2, we need:

### 1. HAP Authentication
```typescript
- Implement HAP pair-verify procedure
- SRP-6a protocol
- Curve25519 key exchange
- Ed25519 signatures
```

### 2. Plist Bodies
```typescript
- Binary plist encoding/decoding
- Support for SETUP request bodies
- Parse response bodies
```

### 3. Event Channel
```typescript
- Setup encrypted TCP channel
- ChaCha20 encryption for channel
- Handle event messages
```

### 4. Audio Encryption
```typescript
- ChaCha20-Poly1305 cipher
- 8-byte nonce handling
- AAD (Additional Authenticated Data) from RTP header
- Append nonce to encrypted packets
```

### 5. Dual SETUP Flow
```typescript
- Base connection SETUP
- Wait for event channel
- Audio stream SETUP
- Parse plist responses
```

## Current Implementation Status

✅ **AirPlay v1 Complete:**
- RTSP protocol (all commands)
- Transport header format
- SDP format (matching pyatv)
- Basic auth-setup
- AES-128-CBC encryption (optional)
- Apple-specific headers

❌ **AirPlay v2 Not Implemented:**
- HAP pair-verify
- Plist request/response bodies
- Event channel
- ChaCha20 encryption
- Dual SETUP flow

## Workarounds

### For Testing Current Implementation

Use devices that support AirPlay v1:
- AirPort Express (older models)
- Some older Apple TVs
- Third-party AirPlay receivers
- Some Sonos devices

### Detection Code

```typescript
function isAirPlayV2(device: DiscoveryResult): boolean {
  // Check TXT record for v2 indicators
  const ft = device.txt.ft || '0';
  const pk = device.txt.pk;
  
  // Presence of pk (public key) usually indicates v2
  // ft flags can indicate v2 support
  return !!pk;
}
```

## Recommendation

### Short Term
1. Add response body logging (done)
2. Test with AirPlay v1 devices
3. Document v1/v2 differences (this doc)

### Long Term
1. Implement HAP authentication module
2. Add plist encoding/decoding
3. Implement event channel
4. Add ChaCha20 encryption
5. Create AirPlayV2 protocol class
6. Auto-detect and use appropriate protocol

## References

- **pyatv airplayv1.py**: Working AirPlay v1 implementation
- **pyatv airplayv2.py**: Working AirPlay v2 implementation
- **HAP Specification**: HomeKit Accessory Protocol
- **RAOP Specification**: Apple's Remote Audio Output Protocol

## Conclusion

The 500 error from HomePods is expected behavior - they require AirPlay v2 protocol which we haven't implemented yet. Our AirPlay v1 implementation is correct and should work with v1-compatible devices.

Implementing AirPlay v2 is a significant undertaking that requires:
- HAP authentication (complex)
- Binary plist support
- Additional encryption (ChaCha20)
- Event channel management
- More complex protocol flow

This is beyond the scope of the initial "basic RAOP implementation" and should be considered a separate feature addition.
