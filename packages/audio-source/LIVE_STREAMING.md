# Live Streaming URL Detection

## Overview

The RAOP protocol implementation includes detection logic for live streaming URLs to prevent their use until proper support is implemented.

## Implementation

The detection logic is implemented in the `audio-source` package via the `isLiveStreamingUrl()` function, which is automatically called when creating audio sources.

### Detected Streaming Patterns

The function detects the following types of live streaming URLs:

1. **Streaming Protocols**
   - RTSP: `rtsp://example.com/live`
   - RTMP/RTMPS: `rtmp://example.com/stream`
   - RTP: `rtp://example.com/stream`

2. **HLS (HTTP Live Streaming)**
   - `.m3u8` manifests
   - `.m3u` playlists

3. **DASH (Dynamic Adaptive Streaming over HTTP)**
   - `.mpd` manifests

4. **Common Streaming Endpoints**
   - URLs containing `/live`
   - URLs containing `/stream`
   - Icecast/Shoutcast patterns (e.g., `/stream.mp3`, `/listen`)

### Usage

The validation is automatically applied when creating audio sources:

```typescript
import { Ffmpeg, Url } from '@basmilius/apple-audio-source';

// This will throw an error
const audioSource = new Ffmpeg('http://example.com/stream.m3u8', 5);
// Error: Live streaming URLs are not currently supported

// This will also throw an error
const audioSource = await Url.fromUrl('rtsp://example.com/live');
// Error: Live streaming URLs are not currently supported

// Regular files and static URLs work fine
const audioSource = new Ffmpeg('/path/to/file.mp3', 5); // ✓ OK
const audioSource = await Url.fromUrl('https://example.com/audio/song.mp3'); // ✓ OK
```

### Enabling Live Streaming Support (Future)

When live streaming support is implemented, the logic can be easily modified:

1. The `isLiveStreamingUrl()` function can be used to detect live streams
2. Instead of throwing an error, special handling can be implemented for streaming URLs
3. The detection logic is centralized in one function for easy maintenance

```typescript
// Future implementation example
if (isLiveStreamingUrl(filePath)) {
    // Enable special handling for live streams
    return new LiveStreamingSource(filePath);
} else {
    // Use regular file/static URL handling
    return new Ffmpeg(filePath, duration);
}
```

## Testing

Comprehensive tests are included in `packages/audio-source/test/streamDetection.test.ts` covering:
- Detection of various streaming protocols
- Detection of HLS and DASH manifests
- Detection of common streaming URL patterns
- Proper handling of regular files and static URLs
- Edge cases and URL parsing
