import { describe, it, expect } from 'bun:test';
import Ffmpeg from '../src/ffmpeg';
import Url from '../src/url';

describe('Live streaming URL prevention', () => {
    describe('Ffmpeg', () => {
        it('should reject RTSP URLs', () => {
            expect(() => {
                new Ffmpeg('rtsp://example.com/live', 5);
            }).toThrow('Live streaming URLs are not currently supported');
        });

        it('should reject HLS URLs', () => {
            expect(() => {
                new Ffmpeg('http://example.com/stream.m3u8', 5);
            }).toThrow('Live streaming URLs are not currently supported');
        });

        it('should accept local files', () => {
            expect(() => {
                new Ffmpeg('/path/to/file.mp3', 5);
            }).not.toThrow();
        });

        it('should accept regular HTTP URLs for static files', () => {
            expect(() => {
                new Ffmpeg('http://example.com/audio/song.mp3', 5);
            }).not.toThrow();
        });
    });

    describe('Url.fromUrl', () => {
        it('should reject HLS URLs', async () => {
            await expect(
                Url.fromUrl('http://example.com/stream.m3u8')
            ).rejects.toThrow('Live streaming URLs are not currently supported');
        });

        it('should reject RTSP URLs', async () => {
            await expect(
                Url.fromUrl('rtsp://example.com/live')
            ).rejects.toThrow('Live streaming URLs are not currently supported');
        });

        it('should reject streaming endpoints', async () => {
            await expect(
                Url.fromUrl('http://example.com/live')
            ).rejects.toThrow('Live streaming URLs are not currently supported');
        });
    });
});
