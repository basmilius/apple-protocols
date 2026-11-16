# Apple Music catalog

```ts
import { fetchAnimatedArtwork, fetchLyrics } from '@apple-protocols/devices/catalog';
```

A device never goes to the internet by itself. The `/catalog` entry point holds two functions that do, and you decide when to call them. Both take an id from the [now playing snapshot](/guide/now-playing) and an optional abort `signal`.

## Animated artwork

`fetchAnimatedArtwork(albumId, options?)` reads the public Apple Music page of an album and returns its animated artwork, as `AnimatedArtwork` entries with a `format`, a `url` and `source: 'apple-music'`. It needs no account.

```ts
import { fetchAnimatedArtwork } from '@apple-protocols/devices/catalog';

const item = tv.nowPlaying.current;

if (item?.storeAlbumId) {
    const artwork = await fetchAnimatedArtwork(item.storeAlbumId, {storefront: 'nl'});

    // The item may have changed while the request ran.
    if (tv.nowPlaying.current?.storeAlbumId === item.storeAlbumId) {
        console.log(artwork.map(entry => `${entry.format}: ${entry.url}`));
    }
}
```

| Option | Meaning |
| --- | --- |
| `storefront` | A two-letter storefront; `us` when omitted |
| `signal` | Cancels the request |

The request times out after 10 seconds. A page over 2 MB is refused. Only video URLs on `apple.com` and `mzstatic.com` hosts are returned.

## Lyrics

`fetchLyrics(catalogId, options)` fetches the time-synced lyrics of a song, as a TTML string, from the Apple Music catalog. It resolves null when the song has none.

```ts
import { fetchLyrics } from '@apple-protocols/devices/catalog';

const id = tv.nowPlaying.current?.lyricsId;

if (id) {
    const ttml = await fetchLyrics(id, {
        bearerToken: process.env.APPLE_MUSIC_BEARER ?? '',
        musicUserToken: process.env.APPLE_MUSIC_USER_TOKEN ?? '',
        storefront: 'us'
    });

    console.log(ttml?.slice(0, 200));
}
```

| Option | Meaning |
| --- | --- |
| `bearerToken` | An Apple Music developer token |
| `musicUserToken` | The music user token of a subscribed account |
| `storefront` | The two-letter storefront of that account |
| `language`, `script` | Optional localization of the lyrics |
| `signal` | Cancels the request |

This uses a private catalog endpoint. The tokens go with this one request and are never stored. Redirects are refused, so the tokens never reach another host. The request times out after 15 seconds. A 401 or 403 rejects with a message that says which token or subscription is at fault.

## Errors

Both functions throw a `CatalogError`, also for a network failure or a timeout. Its `reason` says what went wrong, and `status` holds the HTTP status when there was one, or null.

| Reason | When |
| --- | --- |
| `invalidArgument` | An id that is not numeric, a storefront that is not two letters, or a missing token |
| `unauthorized` | Apple Music rejected the bearer token (401) |
| `forbidden` | Apple Music denied access: the user token, the subscription or the storefront (403) |
| `requestFailed` | The request failed, timed out or got another error status |
| `invalidResponse` | The response was empty or could not be read |
| `tooLarge` | The response is over 2 MB |

```ts
import { CatalogError, fetchLyrics } from '@apple-protocols/devices/catalog';

try {
    await fetchLyrics('1440857781', {
        bearerToken: process.env.APPLE_MUSIC_BEARER ?? '',
        musicUserToken: process.env.APPLE_MUSIC_USER_TOKEN ?? '',
        storefront: 'us'
    });
} catch (err) {
    if (err instanceof CatalogError && err.reason === 'unauthorized') {
        console.warn('Renew the developer token.');
    }
}
```
