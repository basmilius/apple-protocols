/**
 * Detects if a given path or URL appears to be a live streaming URL.
 * 
 * This function checks for common patterns associated with live streaming protocols
 * and services. When live streaming is supported in the future, this function can
 * be used to enable special handling for such URLs.
 * 
 * @param pathOrUrl - The file path or URL to check
 * @returns true if the path appears to be a live streaming URL, false otherwise
 * 
 * @example
 * ```typescript
 * isLiveStreamingUrl('http://example.com/stream.m3u8') // true
 * isLiveStreamingUrl('rtsp://example.com/live') // true
 * isLiveStreamingUrl('/path/to/file.mp3') // false
 * ```
 */
export function isLiveStreamingUrl(pathOrUrl: string): boolean {
    if (!pathOrUrl || typeof pathOrUrl !== 'string') {
        return false;
    }

    const normalized = pathOrUrl.toLowerCase().trim();

    // Check for streaming protocols
    if (normalized.startsWith('rtsp://') ||
        normalized.startsWith('rtmp://') ||
        normalized.startsWith('rtmps://') ||
        normalized.startsWith('rtp://')) {
        return true;
    }

    // Check for HTTP/HTTPS URLs with streaming patterns
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        // HLS (HTTP Live Streaming) manifests
        if (normalized.includes('.m3u8') || normalized.includes('.m3u')) {
            return true;
        }

        // MPEG-DASH manifests
        if (normalized.includes('.mpd')) {
            return true;
        }

        // Common streaming endpoints/patterns
        if (normalized.includes('/live') ||
            normalized.includes('/stream') ||
            normalized.includes('playlist.m3u')) {
            return true;
        }

        // Icecast/Shoutcast streaming servers (often use /stream or /listen)
        if (normalized.match(/\/(stream|listen)(\.mp3|\.aac|\.ogg)?(\?|$)/)) {
            return true;
        }
    }

    return false;
}
