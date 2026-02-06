# RAOP Stalling Fix - HTTP/1.1 Response Parsing

## Problem

After adding auth-setup authentication (which fixed the 500 error), the implementation was stalling at "Configuring audio format" with no error message. The device connection seemed to hang indefinitely.

## Root Cause

The response parser in `RtspClient` only matched `RTSP/1.0` protocol responses:

```typescript
// ❌ WRONG - Only matches RTSP/1.0
const statusMatch = statusLine.match(/RTSP\/1\.0 (\d+) (.+)/);
if (!statusMatch) break;  // Parser stalls here for HTTP responses!
```

**The issue:** auth-setup returns `HTTP/1.1` responses, not `RTSP/1.0`:

```
POST /auth-setup HTTP/1.1
...

HTTP/1.1 200 OK  ← Parser couldn't match this!
...
```

When the parser encountered `HTTP/1.1 200 OK`, the regex didn't match, so it would:
1. Break out of the processing loop
2. Leave the response in the buffer
3. Wait indefinitely for a "valid" response
4. Never resolve the auth-setup Promise
5. Stall the entire session setup

## The Fix

Updated the regex to match both `RTSP/1.0` and `HTTP/1.1`:

```typescript
// ✅ CORRECT - Matches both protocols
const statusMatch = statusLine.match(/(RTSP\/1\.0|HTTP\/1\.1) (\d+) (.+)/);
if (!statusMatch) {
  console.error('❌ Failed to parse status line:', statusLine);
  break;
}

const protocol = statusMatch[1];  // RTSP/1.0 or HTTP/1.1
const statusCode = parseInt(statusMatch[2]);
const statusText = statusMatch[3];

console.log(`📨 Received ${protocol} ${statusCode} ${statusText}`);
```

## Why auth-setup Uses HTTP

The auth-setup endpoint is an HTTP endpoint, not an RTSP endpoint:

```typescript
async authSetup(host: string): Promise<RtspResponse> {
  return this.sendRequest({
    method: RtspMethod.POST,
    uri: `/auth-setup`,
    headers: new Map([...]),
    body: body,
  }, 'HTTP/1.1');  // ← HTTP/1.1, not RTSP/1.0!
}
```

pyatv does the same thing:
```python
async def auth_setup(self) -> HttpResponse:
    return await self.exchange(
        "POST",
        "/auth-setup",
        protocol=HTTP_PROTOCOL,  # HTTP/1.1
        ...
    )
```

RAOP uses both protocols over the same TCP connection:
- **HTTP/1.1**: For auth-setup (authentication)
- **RTSP/1.0**: For media control (OPTIONS, ANNOUNCE, SETUP, RECORD, etc.)

## Comprehensive Logging Added

To diagnose this and future issues, comprehensive logging was added throughout:

### Request Logging

```typescript
console.log(`📤 Sending ${request.method} ${request.uri} (CSeq: ${cseq})`);
if (request.body) {
  console.log(`   └─ Body length: ${bodyData.length} bytes`);
}
```

### Response Logging

```typescript
console.log(`📨 Received ${protocol} ${statusCode} ${statusText}`);
```

### Session Flow Logging

Each step of the session setup now logs:

```
🌐 Local IP: 192.168.1.100
🎯 RTSP URL: rtsp://192.168.1.100/12345678

🔐 Step 0: AUTH-SETUP
📤 Sending POST /auth-setup (CSeq: 1)
   └─ Body length: 33 bytes
📨 Received HTTP/1.1 200 OK
✅ auth-setup: 200

🔍 Step 1: OPTIONS
📤 Sending OPTIONS rtsp://192.168.1.100/12345678 (CSeq: 2)
📨 Received RTSP/1.0 200 OK
✅ OPTIONS: 200

🔒 Step 1.5: Encryption setup
   No encryption required

📢 Step 2: ANNOUNCE
   SDP prepared (456 bytes)
📤 Sending ANNOUNCE rtsp://192.168.1.100/12345678 (CSeq: 3)
📨 Received RTSP/1.0 200 OK
✅ ANNOUNCE: 200

🔌 Step 3: Creating UDP sockets
   Audio socket: port 50001
   Timing socket: port 50002
   Control socket: port 50003

⚙️  Step 4: SETUP
   Transport: RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;control_port=50003;timing_port=50002
📤 Sending SETUP rtsp://192.168.1.100/12345678 (CSeq: 4)
📨 Received RTSP/1.0 200 OK
✅ SETUP: 200
   RTSP Session ID: 1
   Transport response: RTP/AVP/UDP;unicast;mode=record;server_port=6001;control_port=6002;timing_port=6003
   Server audio port: 6001

✅ Session setup complete!

▶️  Starting playback...
📤 Sending RECORD rtsp://192.168.1.100/12345678 (CSeq: 5)
📨 Received RTSP/1.0 200 OK
✅ RECORD: 200 - Playback started
```

## Benefits

### 1. Protocol Flexibility
Now handles both HTTP and RTSP responses correctly, matching pyatv's behavior.

### 2. Debugging Visibility
Users can see:
- Exactly which step is executing
- What requests are sent
- What responses are received
- Where the flow stalls (if it does)

### 3. Error Detection
If a response can't be parsed, it now logs:
```
❌ Failed to parse status line: INVALID LINE
```

### 4. Future-Proof
If Apple adds more HTTP endpoints (like they did with auth-setup), the parser will handle them.

## Testing

With these changes:

**Before:**
```
⏳ Configuring audio format...
(hangs forever - no indication of what's wrong)
```

**After:**
```
⏳ Configuring audio format...
🔐 Step 0: AUTH-SETUP
📤 Sending POST /auth-setup (CSeq: 1)
📨 Received HTTP/1.1 200 OK  ← Now parsed correctly!
✅ auth-setup: 200
🔍 Step 1: OPTIONS
...
✅ Session setup complete!
```

## Summary

The stalling was caused by a simple but critical bug: the response parser couldn't handle HTTP/1.1 responses from auth-setup. This is fixed by:

1. ✅ Supporting both RTSP/1.0 and HTTP/1.1 in the parser
2. ✅ Adding comprehensive logging for debugging
3. ✅ Matching pyatv's dual-protocol approach

The implementation should now complete the full handshake without stalling!
