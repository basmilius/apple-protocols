import { describe, it, expect } from 'bun:test';
import { isLiveStreamingUrl } from '../src/streamDetection';

describe('isLiveStreamingUrl', () => {
    describe('should detect streaming protocols', () => {
        it('should detect RTSP URLs', () => {
            expect(isLiveStreamingUrl('rtsp://example.com/live')).toBe(true);
            expect(isLiveStreamingUrl('RTSP://example.com/live')).toBe(true);
        });

        it('should detect RTMP URLs', () => {
            expect(isLiveStreamingUrl('rtmp://example.com/live')).toBe(true);
            expect(isLiveStreamingUrl('rtmps://example.com/live')).toBe(true);
        });

        it('should detect RTP URLs', () => {
            expect(isLiveStreamingUrl('rtp://example.com/stream')).toBe(true);
        });
    });

    describe('should detect HLS streaming', () => {
        it('should detect .m3u8 files', () => {
            expect(isLiveStreamingUrl('http://example.com/stream.m3u8')).toBe(true);
            expect(isLiveStreamingUrl('https://example.com/playlist.m3u8')).toBe(true);
        });

        it('should detect .m3u files', () => {
            expect(isLiveStreamingUrl('http://example.com/stream.m3u')).toBe(true);
        });

        it('should detect playlist.m3u pattern', () => {
            expect(isLiveStreamingUrl('http://example.com/playlist.m3u')).toBe(true);
        });
    });

    describe('should detect DASH streaming', () => {
        it('should detect .mpd manifests', () => {
            expect(isLiveStreamingUrl('http://example.com/stream.mpd')).toBe(true);
            expect(isLiveStreamingUrl('https://example.com/manifest.mpd')).toBe(true);
        });
    });

    describe('should detect common streaming patterns', () => {
        it('should detect /live endpoints', () => {
            expect(isLiveStreamingUrl('http://example.com/live')).toBe(true);
            expect(isLiveStreamingUrl('https://radio.example.com/live/stream1')).toBe(true);
        });

        it('should detect /stream endpoints', () => {
            expect(isLiveStreamingUrl('http://example.com/stream')).toBe(true);
            expect(isLiveStreamingUrl('http://example.com/radio/stream')).toBe(true);
        });

        it('should detect Icecast/Shoutcast patterns', () => {
            expect(isLiveStreamingUrl('http://example.com/stream.mp3')).toBe(true);
            expect(isLiveStreamingUrl('http://example.com/listen')).toBe(true);
            expect(isLiveStreamingUrl('http://example.com/listen.aac')).toBe(true);
            expect(isLiveStreamingUrl('http://example.com/stream?type=mp3')).toBe(true);
        });
    });

    describe('should NOT detect regular files', () => {
        it('should not detect local file paths', () => {
            expect(isLiveStreamingUrl('/path/to/file.mp3')).toBe(false);
            expect(isLiveStreamingUrl('./audio/song.ogg')).toBe(false);
            expect(isLiveStreamingUrl('../music/track.wav')).toBe(false);
        });

        it('should not detect regular HTTP URLs for static files', () => {
            expect(isLiveStreamingUrl('http://example.com/audio/song.mp3')).toBe(false);
            expect(isLiveStreamingUrl('https://cdn.example.com/music/track.ogg')).toBe(false);
            expect(isLiveStreamingUrl('http://example.com/download/audio.wav')).toBe(false);
        });

        it('should not detect file:// protocol', () => {
            expect(isLiveStreamingUrl('file:///home/user/music.mp3')).toBe(false);
        });
    });

    describe('should handle edge cases', () => {
        it('should handle empty or invalid inputs', () => {
            expect(isLiveStreamingUrl('')).toBe(false);
            expect(isLiveStreamingUrl(null as any)).toBe(false);
            expect(isLiveStreamingUrl(undefined as any)).toBe(false);
        });

        it('should be case-insensitive', () => {
            expect(isLiveStreamingUrl('HTTP://EXAMPLE.COM/STREAM.M3U8')).toBe(true);
            expect(isLiveStreamingUrl('RtSp://example.com/live')).toBe(true);
        });

        it('should handle URLs with query parameters', () => {
            expect(isLiveStreamingUrl('http://example.com/stream.m3u8?token=abc123')).toBe(true);
            expect(isLiveStreamingUrl('http://example.com/listen?format=mp3')).toBe(true);
        });
    });
});
