# RAOP 500 Error Fix - Authentication Missing

## Problem Evolution

1. **Initial**: 520 Origin Error → Fixed by using local IP in URI
2. **Current**: 500 Internal Server Error during SETUP

## The 500 Error

After fixing the URI format, we successfully got past:
- ✅ OPTIONS (200 OK)
- ✅ ANNOUNCE (200 OK)

But then:
- ❌ SETUP (500 Internal Server Error)

The device stalled before returning 500, indicating it was validating something and rejecting the request.

## Root Cause - Missing Authentication

Analysis of pyatv revealed a **critical authentication step** before ANNOUNCE:

```python
async def setup(self, timing_server_port: int, control_client_port: int) -> None:
    # THIS WAS MISSING!
    verifier = pair_verify(self.context.credentials, self.rtsp.connection)
    await verifier.verify_credentials()
    
    # Then continue with normal flow
    await self.rtsp.announce(...)
    resp = await self.rtsp.setup(...)
```

The `pair_verify().verify_credentials()` translates to an **auth-setup** HTTP POST request.

## The auth-setup Request

### What It Does

Authenticates the client with the device before allowing RAOP commands. This establishes:
1. Trust relationship between client and device
2. Encryption mode (unencrypted in our case)
3. Public key exchange (for potential encrypted mode)

### Request Format

```
POST /auth-setup HTTP/1.1
CSeq: {sequence}
DACP-ID: {dacp_id}
Active-Remote: {active_remote}
Client-Instance: {dacp_id}
User-Agent: AirPlay/550.10
Content-Type: application/octet-stream
Host: {device_host}
Content-Length: 33

{binary_body}
```

### Binary Body

33 bytes total:
- 1 byte: `0x01` (AUTH_SETUP_UNENCRYPTED flag)
- 32 bytes: Curve25519 public key (static, never used for actual crypto)

```typescript
const AUTH_SETUP_UNENCRYPTED = Buffer.from([0x01]);

const CURVE25519_PUB_KEY = Buffer.from([
  0x59, 0x02, 0xed, 0xe9, 0x0d, 0x4e, 0xf2, 0xbd,
  0x4c, 0xb6, 0x8a, 0x63, 0x30, 0x03, 0x82, 0x07,
  0xa9, 0x4d, 0xbd, 0x50, 0xd8, 0xaa, 0x46, 0x5b,
  0x5d, 0x8c, 0x01, 0x2a, 0x0c, 0x7e, 0x1d, 0x4e,
]);

const body = Buffer.concat([AUTH_SETUP_UNENCRYPTED, CURVE25519_PUB_KEY]);
```

### Expected Responses

- **200 OK**: Authentication successful, proceed with RAOP
- **404 Not Found**: Device doesn't require auth-setup (older devices)
- **Other**: Device rejected authentication

## Implementation

### 1. Added Constants

```typescript
// In rtsp.ts
const AUTH_SETUP_UNENCRYPTED = Buffer.from([0x01]);
const CURVE25519_PUB_KEY = Buffer.from([...]);
```

### 2. Added authSetup() Method

```typescript
async authSetup(host: string): Promise<RtspResponse> {
  const body = Buffer.concat([AUTH_SETUP_UNENCRYPTED, CURVE25519_PUB_KEY]);
  
  const request: RtspRequest = {
    method: RtspMethod.POST,
    uri: `/auth-setup`,
    headers: new Map([
      ['User-Agent', 'AirPlay/550.10'],
      ['Content-Type', 'application/octet-stream'],
      ['Host', host],
    ]),
    body: body,  // Binary Buffer
  };
  
  return this.sendRequest(request, 'HTTP/1.1');  // HTTP not RTSP!
}
```

### 3. Updated Protocol Flow

**Before:**
```
1. OPTIONS
2. ANNOUNCE
3. SETUP → 500 ERROR
```

**After:**
```
0. AUTH-SETUP (new!)
1. OPTIONS
2. ANNOUNCE
3. SETUP → Success!
```

### 4. Error Handling

```typescript
try {
  const authResponse = await this.rtspClient.authSetup(this.targetHost);
  // Accept 200 (success) or 404 (not supported)
  if (authResponse.statusCode !== 200 && authResponse.statusCode !== 404) {
    console.warn(`auth-setup returned ${authResponse.statusCode}, continuing anyway`);
  }
} catch (error) {
  // Some devices don't support auth-setup, continue anyway
  console.warn('auth-setup failed, continuing:', error);
}
```

## Why HomePods Require This

HomePods (and newer Apple TVs) enforce stricter security:
1. **Authentication required** before accepting RAOP commands
2. **Prevents unauthorized streaming** to your speakers
3. **Standard AirPlay 2 behavior** (AirPlay 1 devices may not require it)

Without auth-setup:
- Device accepts OPTIONS (no auth needed)
- Device accepts ANNOUNCE (no auth needed)
- Device **rejects SETUP** (auth required) → 500 Error

With auth-setup:
- Client authenticates first
- Device trusts client
- All subsequent commands accepted

## Binary Data Handling

### Critical Fix

Initially, binary data was converted to string, which corrupted it:

```typescript
// ❌ WRONG - Corrupts binary data
body: body.toString('binary')
```

Fixed to send Buffer directly:

```typescript
// ✅ CORRECT - Preserves binary data
body: body  // Buffer

// In sendRequest:
const bodyData = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body);
this.socket.write(requestStr);  // Headers as string
this.socket.write(bodyData);    // Body as Buffer
```

## Type Safety

Added POST to RtspMethod enum instead of type casting:

```typescript
// ❌ BEFORE - Type casting bypasses safety
method: 'POST' as RtspMethod

// ✅ AFTER - Proper type
export enum RtspMethod {
  POST = 'POST',  // Added
  OPTIONS = 'OPTIONS',
  ANNOUNCE = 'ANNOUNCE',
  ...
}

method: RtspMethod.POST
```

## Testing

### Expected Behavior

With HomePod:
```
🔍 Searching for RAOP devices...
✅ Found 5 device(s)

🎯 Using: Slaapkamer-HomePod.local
⏳ Establishing connection...
✅ Connected

⏳ Configuring audio format...
   (auth-setup happens here - should be quick)
✅ Audio format configured  ← Should succeed now!

⏳ Starting playback...
✅ Ready to stream
```

### Debugging

If still failing, check:
1. auth-setup response code (should be 200 or 404)
2. Network connectivity (UDP ports)
3. Device logs (if accessible)

## References

### pyatv Implementation

```python
# pyatv/support/rtsp.py
async def auth_setup(self) -> HttpResponse:
    body = AUTH_SETUP_UNENCRYPTED + CURVE25519_PUB_KEY
    return await self.exchange(
        "POST",
        "/auth-setup",
        content_type="application/octet-stream",
        body=body,
        protocol=HTTP_PROTOCOL,
    )

# pyatv/protocols/raop/protocols/airplayv1.py
async def setup(self, timing_server_port: int, control_client_port: int) -> None:
    verifier = pair_verify(self.context.credentials, self.rtsp.connection)
    await verifier.verify_credentials()  # Calls auth_setup
    
    await self.rtsp.announce(...)
    resp = await self.rtsp.setup(...)
```

### Sources

- pyatv: https://github.com/postlund/pyatv
- owntone: https://github.com/owntone/owntone-server (Curve25519 key source)
- AirPlay protocol documentation (unofficial/reverse-engineered)

## Summary

The 500 error was caused by missing authentication. HomePods require an auth-setup handshake before accepting RAOP commands. This handshake:

1. ✅ Uses HTTP/1.1 (not RTSP)
2. ✅ Sends binary payload (unencrypted flag + public key)
3. ✅ Must happen BEFORE ANNOUNCE
4. ✅ Backward compatible (older devices return 404)

With this fix, the complete RAOP flow should now work with HomePods!
