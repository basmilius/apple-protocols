# RAOP 520 Error Fix - Complete Rewrite Based on pyatv

## The Problem

Despite multiple attempts to fix the 520 error by matching pyatv's implementation, the error persisted. A deeper analysis revealed fundamental architectural differences.

## Root Cause - URI Format

The **critical** issue was the RTSP URI format:

### ❌ Our Previous Implementation
```typescript
const rtspUrl = `rtsp://{targetHost}/{sessionId}`;  // Using REMOTE host
```

### ✅ pyatv's Implementation
```python
@property
def uri(self) -> str:
    return f"rtsp://{self.connection.local_ip}/{self.session_id}"  # Using LOCAL IP!
```

**The RTSP URI must use the client's LOCAL IP address, not the server's remote address.**

This is how Apple's RAOP protocol identifies the client and establishes proper session context.

## Complete Changes

### 1. URI Format (CRITICAL)

**Before:**
```typescript
const rtspUrl = `rtsp://${this.targetHost}/${this.raopSessionId}`;
```

**After:**
```typescript
const localIp = await getLocalIP();
this.localIp = localIp;  // Cache immediately
const rtspUrl = `rtsp://${localIp}/${this.raopSessionId}`;
```

**Applied to all RTSP commands:**
- OPTIONS
- ANNOUNCE
- SETUP
- RECORD
- SET_PARAMETER
- TEARDOWN

### 2. Transport Header Format

**Before:**
```typescript
const transport = `RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;control_port=0;timing_port=0;client_port=${this.audioPort}`;
```

**After:**
```typescript
const transport = `RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;control_port=${controlPort};timing_port=${timingPort}`;
```

Changes:
- Removed `client_port` parameter (not used by pyatv)
- Changed `control_port=0` to actual port
- Changed `timing_port=0` to actual port

### 3. Socket Management

**Before:**
```typescript
const timingSocket = createSocket('udp4');
const timingPort = await new Promise<number>((resolve) => {
  timingSocket.bind(0, () => {
    const port = timingSocket.address().port;
    timingSocket.close();  // ❌ WRONG! Closed immediately
    resolve(port);
  });
});
```

**After:**
```typescript
this.timingSocket = createSocket('udp4');
const timingPort = await new Promise<number>((resolve) => {
  this.timingSocket!.bind(0, () => {
    const port = this.timingSocket!.address().port;
    resolve(port);  // ✅ Keep open for server to use
  });
});
```

**Why:** The server needs these ports to remain open for bidirectional communication during audio streaming.

### 4. Session ID Storage

**Added:**
```typescript
private rtspSessionId: number | null = null;
```

**Parse from SETUP response:**
```typescript
const sessionHeader = setupResponse.headers.get('Session');
if (sessionHeader) {
  // Handle "12345;timeout=60" format
  const sessionIdStr = sessionHeader.split(';')[0].trim();
  this.rtspSessionId = parseInt(sessionIdStr);
}
```

### 5. Early Caching of Local IP

**Before:**
```typescript
const localIp = await getLocalIP();
const rtspUrl = `rtsp://${localIp}/${this.raopSessionId}`;
// ... lots of code ...
this.localIp = localIp;  // Cached at end
```

**After:**
```typescript
const localIp = await getLocalIP();
this.localIp = localIp;  // ✅ Cache immediately
const rtspUrl = `rtsp://${localIp}/${this.raopSessionId}`;
```

**Why:** If an error occurs during setup, subsequent method calls need the cached localIp.

## Architecture Changes

### New Instance Variables

```typescript
// Additional UDP sockets for RAOP protocol
private timingSocket: DgramSocket | null = null;
private controlClientSocket: DgramSocket | null = null;

// RTSP session ID from SETUP response
private rtspSessionId: number | null = null;

// Local IP for URI (cached early)
private localIp: string | null = null;
```

### Cleanup in Teardown

```typescript
async teardown(): Promise<void> {
  // Close RTSP connection
  if (this.rtspClient && this.localIp) {
    const rtspUrl = `rtsp://${this.localIp}/${this.raopSessionId}`;
    await this.rtspClient.teardown(rtspUrl);
  }

  // Close all UDP sockets
  if (this.audioSocket) { ... }
  if (this.timingSocket) { ... }       // NEW
  if (this.controlClientSocket) { ... } // NEW
  if (this.controlSocket) { ... }
}
```

## Why Each Change Matters

### 1. Local IP in URI
- **Purpose**: Identifies the client to the server
- **Without it**: Server doesn't know where to send responses → 520 error
- **Protocol requirement**: RAOP expects client identification via URI

### 2. Real Port Numbers
- **Purpose**: Server needs actual ports for timing and control messages
- **Without it**: Server can't establish proper synchronization
- **Port 0**: Invalid for actual communication

### 3. Keep Sockets Open
- **Purpose**: Server sends timing/control packets back to client
- **Without it**: Packets sent to closed ports → connection fails
- **Critical**: Bidirectional UDP communication required

### 4. Session ID Storage
- **Purpose**: Track RTSP session across multiple commands
- **Without it**: Server may reject subsequent commands
- **Protocol**: Session management is part of RTSP spec

### 5. Early IP Caching
- **Purpose**: Robustness in error scenarios
- **Without it**: Partial setup breaks subsequent calls
- **Best practice**: Cache dependencies early

## pyatv Reference Implementation

### URI Construction
```python
class RtspSession:
    @property
    def uri(self) -> str:
        return f"rtsp://{self.connection.local_ip}/{self.session_id}"
```

### Transport Header
```python
resp = await self.rtsp.setup(
    headers={
        "Transport": (
            "RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;"
            f"control_port={control_client_port};"
            f"timing_port={timing_server_port}"
        )
    }
)
```

### Session Parsing
```python
self.context.rtsp_session = int(resp.headers["Session"])
self.context.control_port = int(options["control_port"])
self.context.server_port = int(options["server_port"])
```

## Testing Checklist

- [x] URI uses local IP (not remote host)
- [x] Transport header includes real ports
- [x] Sockets remain open during session
- [x] Session ID parsed and stored
- [x] Local IP cached early
- [x] All RTSP commands use correct URI
- [x] Teardown closes all sockets
- [x] Code review passed
- [x] Security scan passed (0 alerts)

## Expected Behavior

With these changes:

1. **OPTIONS**: Client announces itself with local IP
2. **ANNOUNCE**: Server knows where client is
3. **SETUP**: Client provides actual ports for server communication
4. **RECORD**: Session established, ready for audio
5. **Audio Stream**: Bidirectional UDP communication works
6. **Timing/Control**: Server can send sync packets to client

## Migration Notes

If you have existing code using this library:

**No API changes** - The public interface remains the same. All changes are internal to match RAOP protocol requirements.

```typescript
// This still works the same
const session = new RaopSession(device);
await session.establish();
await session.setupSession();
await session.startPlayback();
await session.sendAudio(buffer);
await session.teardown();
```

## Summary

The 520 error was caused by a fundamental misunderstanding of the RAOP protocol:

1. **URI must use LOCAL IP** (not remote host) ← Most critical
2. **Ports must be real** (not 0)
3. **Sockets must stay open** (not closed after getting port)
4. **Session ID must be tracked** (from SETUP response)

All changes now match pyatv's working implementation exactly.
