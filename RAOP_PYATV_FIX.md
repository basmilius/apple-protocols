# RAOP 520 Error Fix - pyatv Analysis

## Problem
After initial fix attempts with Apple-specific headers and encryption, the 520 error persisted with HomePods.

## Solution - Matching pyatv Implementation

By analyzing pyatv's working RAOP implementation, we identified several critical differences:

### 1. Header Format Differences

**User-Agent:**
- ❌ Before: `AirPlay/320.20`
- ✅ After: `AirPlay/550.10` (matches pyatv)

**DACP-ID:**
- ❌ Before: 8-byte lowercase hex
- ✅ After: 8-byte uppercase hex (16 characters)

**Active-Remote:**
- ❌ Before: String representation of integer
- ✅ After: Raw 32-bit unsigned integer

**Client-Instance:**
- ❌ Before: Independent random value
- ✅ After: Must match DACP-ID value

**Header Order:**
```
DACP-ID: {uppercase_hex}
Active-Remote: {integer}
Client-Instance: {same_as_dacp_id}
```

### 2. URI Format

**pyatv uses:**
```
rtsp://{host}/{session_id}
```

Where `session_id` is a random 32-bit integer.

**Before:**
```typescript
const rtspUrl = `rtsp://${targetHost}/${deviceInfo.id}`;  // Wrong!
```

**After:**
```typescript
this.raopSessionId = randomBytes(4).readUInt32BE(0);  // Random 32-bit int
const rtspUrl = `rtsp://${targetHost}/${this.raopSessionId}`;
```

### 3. SDP Format

**pyatv format:**
```sdp
v=0
o=iTunes {session_id} 0 IN IP4 {local_ip}
s=iTunes
c=IN IP4 {remote_ip}
t=0 0
m=audio 0 RTP/AVP 96
...
```

**Key changes:**
- Origin line: `o=iTunes {sessionId} 0 IN IP4 {localIp}`
- Session name: `s=iTunes` (not "RAOP Session")
- Connection: `c=IN IP4 {remoteIp}` (not 0.0.0.0)

**Implementation:**
```typescript
const localIp = await getLocalIP();
const sdp = new SdpBuilder(
  format,
  this.raopSessionId,     // Session ID
  localIp,                // Local IP
  this.targetHost,        // Remote IP
  aesConfig,
  encryptedKey
).build();
```

## Code Changes

### rtsp.ts
```typescript
// Generate IDs matching pyatv format
this.dacpId = randomBytes(8).toString('hex').toUpperCase();  // Uppercase!
this.activeRemote = randomBytes(4).readUInt32BE(0);         // Integer!

// Headers in request
requestStr += `DACP-ID: ${this.dacpId}\r\n`;
requestStr += `Active-Remote: ${this.activeRemote}\r\n`;
requestStr += `Client-Instance: ${this.dacpId}\r\n`;  // Matches DACP-ID!

// User-Agent
'User-Agent': 'AirPlay/550.10'  // Not 320.20!
```

### session.ts
```typescript
// Session ID generation
this.raopSessionId = randomBytes(4).readUInt32BE(0);

// URI format
const rtspUrl = `rtsp://${this.targetHost}/${this.raopSessionId}`;

// SDP with proper IPs
const localIp = await getLocalIP();
const sdp = new SdpBuilder(
  format,
  this.raopSessionId,
  localIp,
  this.targetHost,
  aesConfig,
  rsaEncryptedKey
).build();
```

### sdp.ts
```typescript
constructor(
  audioFormat: AudioFormat,
  sessionId: number,      // NEW
  localIp: string,        // NEW
  remoteIp: string,       // NEW
  aesConfig?: AesConfig,
  rsaEncryptedKey?: Buffer
)

// In build():
lines.push(`o=iTunes ${this.sessionId} 0 IN IP4 ${this.localIp}`);
lines.push('s=iTunes');
lines.push(`c=IN IP4 ${this.remoteIp}`);
```

## Why These Changes Matter

1. **User-Agent Version**: Apple devices may check version compatibility
2. **DACP-ID Case**: Case sensitivity in header parsing
3. **Active-Remote Type**: Expected as integer, not string
4. **Client-Instance = DACP-ID**: Apple's protocol expects these to match
5. **Session ID**: Must be random integer, not device identifier
6. **SDP Origin/Connection**: Devices validate IP addresses in SDP

## Testing

With these changes, the implementation now exactly matches pyatv's working implementation:
- ✅ Correct header format and values
- ✅ Proper URI structure
- ✅ Valid SDP with correct IPs
- ✅ Session ID generation

This should resolve the 520 error with HomePods.

## Reference

pyatv RAOP implementation:
- `pyatv/support/rtsp.py` - RTSP session management
- `pyatv/protocols/raop/protocols/airplayv1.py` - Protocol logic

Key pyatv code:
```python
self.session_id: int = randrange(2**32)
self.dacp_id: str = f"{randrange(2 ** 64):X}"
self.active_remote: int = randrange(2**32)

hdrs = {
    "CSeq": cseq,
    "DACP-ID": self.dacp_id,
    "Active-Remote": self.active_remote,
    "Client-Instance": self.dacp_id,  # Same as DACP-ID!
}

USER_AGENT = "AirPlay/550.10"

ANNOUNCE_PAYLOAD = (
    "v=0\r\n"
    + "o=iTunes {session_id} 0 IN IP4 {local_ip}\r\n"
    + "s=iTunes\r\n"
    + "c=IN IP4 {remote_ip}\r\n"
    ...
)
```
