import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AirPlayArtwork } from '../src/internal/airplay-artwork';
import { decodeArtworkAssetURL } from '../src/internal/artwork-url';
import { MediaController } from '../src/controller/media';
import { AirPlayPlayer } from '../src/internal/airplay-player';
import { parseAppleMusicArtwork } from '../src/internal/apple-music-artwork';

const itemOf = (fields: Record<string, unknown>): any => ({dataArtworks: [], remoteArtworks: [], animatedArtworks: [], animatedArtworkPreviewFrames: [], availableAnimatedArtworkFormats: [], ...fields});

const fixture = (name: string): Buffer => readFileSync(new URL(`./fixtures/${name}.bplist`, import.meta.url));

test('decodes archived NSURL assets, including relative URLs', () => {
    assert.equal(decodeArtworkAssetURL(fixture('animated-https')), 'https://example.com/artwork.mp4');
    assert.equal(decodeArtworkAssetURL(fixture('animated-relative')), 'https://example.com/videos/clip.mp4');
    assert.equal(decodeArtworkAssetURL(fixture('animated-file')), null);
    assert.equal(decodeArtworkAssetURL(Buffer.from('not a plist')), null);
    assert.equal(decodeArtworkAssetURL(undefined), null);
});

test('discovers advertised animated formats before requesting their URLs', async () => {
    const requests: unknown[] = [];
    const format = 'MRContentItemAnimatedArtworkFormatSquare';
    const artwork = new AirPlayArtwork({
        async requestContentItemAssets(options: unknown) {
            requests.push(options);
            return itemOf({
                identifier: 'track',
                availableAnimatedArtworkFormats: [format],
                animatedArtworks: requests.length === 2 ? [{type: format, assetFileURLData: fixture('animated-https')}] : []
            });
        }
    } as any);
    assert.deepEqual(await artwork.getAnimated(), [{format, url: 'https://example.com/artwork.mp4'}]);
    assert.deepEqual(requests, [{includeAvailableArtworkFormats: true}, {requestedAnimatedArtworkAssetURLFormats: [format]}]);
});

test('does not return animated artwork from a different track', async () => {
    let request = 0;
    const artwork = new AirPlayArtwork({
        async requestContentItemAssets() {
            return itemOf({
                identifier: String(++request),
                availableAnimatedArtworkFormats: ['square'],
                animatedArtworks: [{type: 'square', assetFileURLData: fixture('animated-https')}]
            });
        }
    } as any);
    assert.deepEqual(await artwork.getAnimated(), []);
});

test('returns queue lyrics without requiring a lyrics event', async () => {
    let item = itemOf({identifier: 'track', lyrics: {lyrics: 'First line\nSecond line'}});
    const media = new MediaController({async requestContentItemAssets() { return item; }} as any);
    assert.equal((await media.getLyrics())?.text, 'First line\nSecond line');
    item = itemOf({identifier: 'track', metadata: {lyricsAvailable: true, lyricsAdamID: 123n}});
    assert.deepEqual(await media.getLyrics(), {identifier: 'track', text: null, available: true, url: null, catalogId: '123'});
    item = itemOf({identifier: 'track', metadata: {}});
    assert.equal((await media.getLyrics())?.available, null);
    assert.equal((await media.getLyrics())?.catalogId, null);
});

test('metadata-only updates preserve previously received artwork assets', () => {
    const player = new AirPlayPlayer('Music', 'Music');
    const animation = {type: 'square', assetFileURLData: fixture('animated-https')};
    player.setPlaybackQueue({location: 0, contentItems: [itemOf({identifier: 'track', animatedArtworks: [animation]})]} as any);
    player.updateContentItem(itemOf({identifier: 'track', metadata: {title: 'Updated title'}}));
    assert.deepEqual(player.currentItem?.animatedArtworks, [animation]);
});

test('extracts catalog video for the requested album only', () => {
    const data = readFileSync(new URL('./fixtures/apple-music-album.json', import.meta.url), 'utf8');
    const html = `<script type="application/json" id="serialized-server-data">${data}</script>`;
    const results = parseAppleMusicArtwork(html, '1796483834');
    assert.deepEqual(results.map(result => result.format), ['motionDetailSquare', 'motionDetailTall']);
    assert.ok(results.every(result => result.source === 'apple-music' && result.url?.endsWith('.m3u8')));
    assert.deepEqual(parseAppleMusicArtwork(html, '123'), []);
    assert.deepEqual(parseAppleMusicArtwork(html.replaceAll('mvod.itunes.apple.com', 'apple.com.example.org'), '1796483834'), []);
    assert.throws(() => parseAppleMusicArtwork('<html>Unavailable</html>', '1796483834'), /did not return/);
});
