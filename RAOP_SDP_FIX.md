# RAOP SETUP 500 Error Fix - SDP Format

## Problem

After fixing the URI format (local IP) and adding authentication (auth-setup), the connection still failed at SETUP with a 500 Internal Server Error:

```
✅ ANNOUNCE: 200
⚙️  Step 4: SETUP
📨 Received RTSP/1.0 500 Internal Server Error
❌ Error: SETUP failed: 500 Internal Server Error
```

## Root Cause

Apple devices (HomePods, Apple TVs, AirPort Express) expect a **VERY SPECIFIC** SDP format that doesn't follow standard SDP conventions. This format was discovered through reverse engineering in pyatv.

### The Apple Quirk

Apple's RAOP implementation requires:
- **Always** use payload type `96`
- **Always** use `a=rtpmap:96 L16/44100/2` (hardcoded, regardless of actual format!)
- **Always** use ALAC-style fmtp parameters

This is counterintuitive because:
- The rtpmap says `L16` (Linear 16-bit PCM)
- But the fmtp contains ALAC-specific parameters
- The actual audio format is determined by fmtp, not rtpmap

## pyatv's Working Format

From `pyatv/support/rtsp.py`:

```python
ANNOUNCE_PAYLOAD = (
    "v=0\r\n"
    + "o=iTunes {session_id} 0 IN IP4 {local_ip}\r\n"
    + "s=iTunes\r\n"
    + "c=IN IP4 {remote_ip}\r\n"
    + "t=0 0\r\n"
    + "m=audio 0 RTP/AVP 96\r\n"
    + "a=rtpmap:96 L16/44100/2\r\n"  # HARDCODED!
    + f"a=fmtp:96 {FRAMES_PER_PACKET} 0 "
    + "{bits_per_channel} 40 10 14 {channels} 255 0 0 {sample_rate}\r\n"
)

FRAMES_PER_PACKET = 352
```

Key observations:
1. `a=rtpmap:96 L16/44100/2` is **completely hardcoded** - not parameterized
2. The fmtp line contains ALAC parameters: `352 0 16 40 10 14 2 255 0 0 44100`
3. Format: `{frames} {compat} {bits} {pb} {mb} {kb} {channels} {max_run} {max_frame} {avg_rate} {sample_rate}`

## Our Previous (Broken) Implementation

We tried to be "smart" and use different SDP formats per codec:

```typescript
// ❌ WRONG - Apple devices reject this!
if (this.audioFormat.codec === 'ALAC') {
  lines.push(`a=rtpmap:96 AppleLossless`);
} else if (this.audioFormat.codec === 'PCM') {
  lines.push(`a=rtpmap:10 L16/${sampleRate}/${channels}`);
}
```

This seemed logical but **Apple devices returned 500 errors** because they expect the exact format above.

## The Fix

Changed `sdp.ts` to match pyatv's format exactly:

```typescript
// ✅ CORRECT - Match pyatv exactly
private configureFmtp(): void {
  const { bitsPerSample = 16, channels = 2, sampleRate = 44100 } = this.audioFormat;
  
  // Always use payload type 96
  this.rtpMap = 96;
  
  // ALAC-style FMTP (matching pyatv)
  const framesPerPacket = 352;
  this.fmtp = `96 ${framesPerPacket} 0 ${bitsPerSample} 40 10 14 ${channels} 255 0 0 ${sampleRate}`;
}

build(): string {
  // ...
  // Always use hardcoded rtpmap (matching pyatv)
  lines.push(`m=audio 0 RTP/AVP 96`);
  lines.push(`a=rtpmap:96 L16/44100/2`);  // HARDCODED!
  lines.push(`a=fmtp:${this.fmtp}`);
  // ...
}
```

## Complete Working SDP Example

```
v=0
o=iTunes 3749121388 0 IN IP4 192.168.1.94
s=iTunes
c=IN IP4 192.168.1.195
t=0 0
m=audio 0 RTP/AVP 96
a=rtpmap:96 L16/44100/2
a=fmtp:96 352 0 16 40 10 14 2 255 0 0 44100
a=recvonly
```

This format:
- Uses local IP (192.168.1.94) in origin line
- Uses remote IP (192.168.1.195) in connection line
- Has hardcoded rtpmap `L16/44100/2`
- Has ALAC-style fmtp with actual parameters

## Why This Format?

This is Apple's proprietary format discovered through:
1. Packet captures of working AirPlay sessions
2. Reverse engineering Apple's AirPlay implementation
3. Trial and error with real devices

The pyatv project spent years perfecting this, and we benefit from their research.

## Testing

With the fixed SDP format, the expected flow is:

```
🔐 Step 0: AUTH-SETUP
✅ auth-setup: 404 (or 200)

🔍 Step 1: OPTIONS
✅ OPTIONS: 200

📢 Step 2: ANNOUNCE
   SDP payload (148 bytes):
   v=0
   o=iTunes 3749121388 0 IN IP4 192.168.1.94
   s=iTunes
   c=IN IP4 192.168.1.195
   t=0 0
   m=audio 0 RTP/AVP 96
   a=rtpmap:96 L16/44100/2
   a=fmtp:96 352 0 16 40 10 14 2 255 0 0 44100
   a=recvonly
✅ ANNOUNCE: 200

⚙️  Step 4: SETUP
✅ SETUP: 200  ← Should succeed now!
```

## References

- [pyatv RTSP implementation](https://github.com/postlund/pyatv/blob/master/pyatv/support/rtsp.py)
- [pyatv RAOP AirPlay v1](https://github.com/postlund/pyatv/blob/master/pyatv/protocols/raop/protocols/airplayv1.py)

## Key Takeaways

1. **Don't try to be clever** - Use Apple's exact format
2. **rtpmap is always** `96 L16/44100/2` (hardcoded)
3. **fmtp contains** the actual audio parameters
4. **This is Apple's quirk** - not a bug in our implementation
5. **Follow pyatv** - They've already figured it out
