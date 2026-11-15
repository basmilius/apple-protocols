# Now playing

`device.nowPlaying` holds what plays now, as plain snapshots of type `NowPlaying`. It comes from the Media Remote messages of the AirPlay session and works on both devices.

## Reading

```ts
const item = tv.nowPlaying.current;

if (item) {
    console.log(item.app.name, item.title, item.artist, item.state);
    console.log(`${tv.nowPlaying.elapsed.toFixed(0)} of ${item.duration} seconds`);
}
```

`current` is null when no app plays anything. `elapsed` is the position in seconds now, extrapolated from the playback rate while playing, so you can read it on a timer without asking the device.

## The NowPlaying snapshot

| Field | Meaning |
| --- | --- |
| `app` | `bundleId` and `name` of the app that plays |
| `player` | The player id within the app; `MediaRemote-DefaultPlayer` by default |
| `state` | `playing`, `paused`, `stopped`, `interrupted`, `seeking` or `unknown` |
| `title`, `artist`, `album`, `genre` | Item metadata; empty strings when absent |
| `trackArtist` | The track artist from the item metadata, for apps that leave `artist` empty |
| `duration` | Seconds; 0 when unknown |
| `rate` | Playback rate; 1 is normal speed |
| `repeat` | `off`, `one` or `all` |
| `shuffle` | `off`, `albums` or `songs` |
| `kind` | `audio`, `video` or `unknown` |
| `series` | `name`, `season`, `episode` and `episodeTitle` of a TV episode, or null |
| `contentRating`, `contentIdentifier` | As the app reports them |
| `artworkId` | Identifies the artwork of the item, or null |
| `storeAlbumId` | The iTunes Store album id, or null; feeds [`fetchAnimatedArtwork()`](/guide/catalog) |
| `lyricsId` | The Apple Music song id, or null; feeds [`fetchLyrics()`](/guide/catalog) |
| `isAlwaysLive`, `isAdvertisement` | Flags of the now playing info |

A snapshot is a new object for every change. Keep it, compare it, send it over IPC; nothing in it updates later.

## Events

```ts
tv.nowPlaying.on('change', item => {
    console.log('now playing', item?.title ?? 'nothing');
});

tv.nowPlaying.on('state', (state, previous, item) => {
    console.log(`${item.app.name}: ${previous} -> ${state}`);
});

tv.nowPlaying.on('artwork', item => {
    console.log('new artwork for', item.title);
});
```

| Event | Fires when |
| --- | --- |
| `change` | The snapshot differs from the last one this object emitted (deep equal) |
| `state` | The playback state differs from the last one announced. Fires before the matching `change`. A `change` to null resets the announced state to `unknown` |
| `artwork` | The artwork of the current item looks different: another identifier or URL, or other image bytes |

Every event compares public values with the last values this object announced. The device sends many messages for one visible change; you get one event.

## Across a reconnect

The announced values survive sessions. After a reconnect the device holds back:

- When the new session reports the same item again, nothing fires.
- When it reports another item, that item is announced once it settled for one second.
- At the latest five seconds after the new session is up, whatever the device reports then is announced once, if it differs.

Meanwhile `current` and `elapsed` return the last announced item and position, and `supports()` answers as that item did. A network blip does not look like playback stopping and starting. A state that changed during the outage fires `state` once, right before the `change` that ends the wait.

This only holds for a reconnect after a drop. `disconnect()` forgets the announced item, state and artwork, so the next `connect()` announces them again as a new device does.

## Artwork

`device.artwork` fetches the artwork of what plays now.

```ts
const artwork = await tv.artwork.get(600);

if (artwork?.data) {
    console.log(artwork.mimeType, artwork.width, artwork.height, artwork.data.byteLength);
} else if (artwork?.url) {
    console.log(artwork.url);
}
```

`get(width = 600, height = -1)` resolves an `Artwork` with a `url`, the image `data`, or both, or null when the current item has none. A height of -1 keeps the aspect ratio. `getAnimated(width, height)` resolves the animated artwork formats the device knows, as `AnimatedArtwork` entries with a `format` and a `url`; empty when there are none. Both throw `UnavailableError` while AirPlay is down, like every other capability. Check `supports('artwork')` first, or catch the error.

Listen to `nowPlaying` `artwork` events to know when to fetch again.

## Lyrics

`nowPlaying.lyrics()` asks the playback queue for the lyrics of the current item.

```ts
const lyrics = await tv.nowPlaying.lyrics();

if (lyrics?.text) {
    console.log(lyrics.text);
} else if (lyrics?.catalogId) {
    console.log('lyrics are in the catalog under', lyrics.catalogId);
}
```

It resolves a `Lyrics` record with the `text` when the device sends it, whether lyrics are `available`, a `url` and the `catalogId`. It throws `UnavailableError` without an AirPlay session. Many apps send no text; [`fetchLyrics()`](/guide/catalog) gets them from Apple Music instead.
