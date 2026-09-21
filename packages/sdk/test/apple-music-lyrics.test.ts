import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAppleMusicLyrics, fetchAppleMusicLyrics } from '../src/internal/apple-music-lyrics';
import { MediaController } from '../src/controller/media';

const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1" end="2">Example</p></body></tt>';
const options = {bearerToken: 'Bearer fixture-bearer', musicUserToken: 'fixture-user', storefront: 'nl'};

test('accepts localized TTML and legacy TTML without assuming localization is an object', () => {
    assert.equal(extractAppleMusicLyrics({data: [{attributes: {ttmlLocalizations: ttml}}]}), ttml);
    assert.equal(extractAppleMusicLyrics({data: [{attributes: {ttml}}]}), ttml);
    assert.equal(extractAppleMusicLyrics({data: []}), null);
    assert.throws(() => extractAppleMusicLyrics({error: 'invalid'}), /invalid lyrics response/);
});

test('catalog request sends scoped auth, refuses redirects, and reports safe auth errors', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: URL, init: RequestInit) => {
        assert.equal(url.origin, 'https://amp-api.music.apple.com');
        assert.equal(url.pathname, '/v1/catalog/nl/songs/123/syllable-lyrics');
        assert.equal(init.redirect, 'error');
        const headers = new Headers(init.headers);
        assert.equal(headers.get('authorization'), 'Bearer fixture-bearer');
        assert.equal(headers.get('media-user-token'), 'fixture-user');
        return Response.json({data: [{attributes: {ttmlLocalizations: ttml}}]});
    }) as typeof fetch;
    try {
        assert.equal(await fetchAppleMusicLyrics('123', options), ttml);
        globalThis.fetch = (async () => new Response(null, {status: 401})) as typeof fetch;
        await assert.rejects(fetchAppleMusicLyrics('123', options), /bearer token \(401\)/);
        globalThis.fetch = (async () => {throw new Error('fixture-user');}) as typeof fetch;
        await assert.rejects(fetchAppleMusicLyrics('123', options), error => !String(error).includes('fixture-user'));
        await assert.rejects(fetchAppleMusicLyrics('../123', options), /numeric song ID/);
    } finally {
        globalThis.fetch = original;
    }
});

test('does not attach catalog lyrics to a different playback item', async () => {
    const original = globalThis.fetch;
    const player = {currentItem: {identifier: 'first'}, currentItemMetadata: {lyricsAdamID: 123n}};
    const media = new MediaController({state: {nowPlayingClient: {activePlayer: player}}} as any);
    globalThis.fetch = (async () => {
        player.currentItem.identifier = 'second';
        return Response.json({data: [{attributes: {ttml}}]});
    }) as typeof fetch;
    try {
        assert.equal(await media.getLyricsFromCatalog(options), null);
    } finally {
        globalThis.fetch = original;
    }
});
