# Lyrics and animated artwork

Diagnostics can request and display lyrics returned in a playback queue, and request and decode animated artwork URLs. This does not guarantee that an Apple Music receiver exports either asset to remote controllers.

## Framework evidence

The local reference files in `/Users/bas/Development/reference/apple-frameworks` and `.research/macos-27.2` show these paths:

- `PlaybackQueueRequestMessage.includeLyrics` requests `ContentItem.lyrics`. A `SEND_LYRICS_EVENT` is a separate message and is not the queue response. The previous diagnostics panel only displayed these events, so returned queue text was never shown.
- `MRNowPlayingSupportedAnimatedArtworkFormats` lists square and tall formats. The macOS 27.2 strings are `MRContentItemAnimatedArtworkFormatSquare` and `MRContentItemAnimatedArtworkFormatTall`.
- `requestedAnimatedArtworkAssetURLFormats` requests the corresponding `ContentItem.animatedArtworks`. `MRDPlaybackQueue::createPlaybackQueueForRequest:cachingPolicy:playerPath:partiallyCachedItems:capabilities:` processes these formats separately from static artwork.
- `MRAnimatedArtwork::protobufWithFormat:` archives the asset URL. `assetFileURLData` is an NSKeyedArchiver plist containing an NSURL, not a UTF-8 URL. The decoder resolves `NS.relative` and `NS.base`. A remote `file:` URL cannot be opened as a local file and is not returned as a playable URL.

Useful decompilation references:

- `.research/macos-27.2/decompiled/MediaRemote/1a393df14.c`: archived animated artwork URL.
- `.research/macos-27.2/decompiled/MediaRemote/1a396bb84.c`: supported animation formats.
- `mediaremoted/globals/createPlaybackQueueForRequest.c` in the reference directory: requested asset formats and cache lookup.

## Device test, 21 September 2026

Tested against Woonkamer TV, AppleTV11,1, OS build 24K5088l, running Apple Music. The user confirmed that Ghost's “Satanized” was playing and selected it as content with lyrics and animated artwork.

| Request | Observed response |
| --- | --- |
| Queue with `includeLyrics: true` | `lyricsAvailable: true`, `lyricsAdamID: 1796483916`; no lyric text or URL |
| Available artwork formats | No available animated formats |
| Explicit square and tall animated asset requests | No animated assets |
| Content-item-ID request | Sparse metadata, unlike the full current queue window |

The SDK therefore requests the current queue window and checks that the active player and item still match. Availability is kept separate from returned text. An omitted availability field is unknown, not false.

These results establish a limitation of the tested remote path. They do not establish that every Apple receiver refuses these assets, or that an additional Apple-specific request cannot expose them.

## Music.app catalog path

Further research in `Music_arm64e/globals` found a separate catalog path:

- `fetchAlbumDataWithId.c`, address `1001a6940`, extends album requests with `offers,editorialArtwork,editorialVideo,extendedAssetUrls`.
- `motionArtworkURL.c`, address `1001a3b18`, selects `motionDetailSquare` from the album model and converts its video string to an NSURL.
- `FUN.part2.c`, addresses `101814fac` and `101814b5c`, selects `bag://musicSubscription/ttmlLyrics` or `bag://musicSubscription/lyrics` and reads `ttml`, `lyrics`, `id` and `lyricsId` from the response. The request body builder at `1018148dc` includes the catalog `id`.
- The lyrics request inherits the Apple Music Store request path. The base code contains account checks, `musicMescal` configuration, account cookies and conditional authorization/signing headers. An authenticated request to the separate web catalog endpoint was subsequently reproduced, as described below. The earlier research's cloud-lyrics-token references also occur in custom cloud-library lyric handling; they are not sufficient evidence that this token alone authenticates catalog lyrics.

The public [Skeletá album page](https://music.apple.com/us/album/skelet%C3%A1/1796483834) contains `videoArtwork.dictionary.motionDetailSquare.video` and `tallVideoArtwork.dictionary.motionDetailTall.video` in its serialized page data. Both are HLS URLs. The SDK catalog lookup returned both URLs using the album ID received from Woonkamer TV. The square master playlist returned HTTP 200, H.264 variants and permissive CORS headers, without cookies or an account token.

`getAnimatedFromCatalog(storefront = 'us')` is an explicit network lookup, separate from the device-only method. Diagnostics exposes it as “Get from Apple Music” and uses HLS.js for Electron playback. This uses Apple's public page structure, not a documented API contract; page changes or regional availability may break the lookup. Artwork lookup does not require account credentials.

## TTML retrieval investigation

TTML means Timed Text Markup Language. Apple's lyrics profile uses XML paragraphs for lines and spans for timed words or syllables. Timing is optional; a lyrics response can also contain unsynchronized text. The [Apple asset guide](https://help.apple.com/itc/videoaudioassetguide/en.lproj/static.html) specifies `begin` and `end` times, performer metadata and song sections. A renderer must preserve spaces between spans and overlapping performers, and use the receiver's playhead for highlighting.

Additional local Music.app evidence:

- `FUN.part1.c`, `1008bd3fc`, checks account state and calls `101817db4` before creating a TTML request with flag `2` or `3`.
- `FUN.part2.c`, `101817db4`, queries the account's `enrolledinapplemusic` property.
- `1018148dc` builds the fields `id`, `l` and `itre`. The latter two names were verified against strings at `101b2fa3a` and `101b82b80` in the matching Mach-O binary.
- `10103cfbc` uses the newer `MusicKitInternal.MusicLyricsRequest.init(for: Song)` and requests its response. `10103d300` distinguishes custom lyrics from catalog lyrics. These are imported private framework functions; the Music.app decompilation does not contain their networking implementation.

The independent [MusanovaKit implementation](https://github.com/rryam/MusanovaKit) and [applemusic-private client](https://github.com/anselmoshim/applemusic-private) identify the web catalog endpoint as `GET https://amp-api.music.apple.com/v1/catalog/{storefront}/songs/{id}/syllable-lyrics`, with TTML in `data[].attributes.ttml`. Their authenticated requests use a bearer token and a music user token. This endpoint is not a public MusicKit lyrics API.

On 21 September 2026, requesting that endpoint for catalog item `1796483916` without credentials returned HTTP 401. The user subsequently supplied a request from their signed-in web session. Repeating it with the bearer token, music user token, Origin and Referer headers returned HTTP 200. No browser-control access was required.

For this request, `attributes.ttmlLocalizations` is itself an XML string; `attributes.ttml` is absent. The document is English even though the requested lyric locale was Dutch. It contains 62 paragraph elements and 342 span elements, with word timing. Times such as `17.866` represent seconds from the song start, including inside timed parent elements. The first line starts at 17.866 seconds and the last ends at 231.151 seconds.

The SDK now exposes `device.media.getLyricsFromCatalog(options)`. Options contain the bearer token, music user token and account storefront, with optional language/script preferences. The method uses the active item's lyrics catalog ID and rejects results if playback has moved to another item. It refuses redirects so account headers cannot be forwarded elsewhere. Tokens are neither stored nor returned, and error messages omit response bodies and credentials.

Diagnostics has password fields under Playback → Lyrics → Apple Music authorization. These are held only in panel state. "Get from Apple Music" retrieves the current item's lyrics; the XML is rendered as text with line and word highlighting and optional automatic scrolling. Timing follows the device playhead. This remains an on-demand diagnostics action; it does not add account login or automatic token refresh to Homey.

The SDK method was also tested through the running diagnostics bridge against Woonkamer TV after playback had moved to another catalog item. It returned TTML successfully. Browser checks parsed the actual Satanized response and verified clock formats, entity decoding, text spacing, end-exclusive highlighting and rejection of malformed XML/DTD declarations. A separate synthetic-text view check verified rendering, active-line changes and the follow control. No account tokens or copyrighted lyric fixtures were added to the repository.

## APIs and verification

`device.media.getLyrics()` returns text, availability, lyrics URL and catalog ID. The existing `requestLyrics(length)` API remains available. `device.artwork.getAnimated(width, height)` discovers advertised formats, requests their URLs and returns the decoded results. Diagnostics has a separate video view with playback controls and errors; its CSP allows HTTP(S) media.

Automated tests cover archived absolute and relative URLs, remote file URL rejection, malformed archives, format requests, track changes, lyrics without events, preserving artwork during metadata-only updates, and album-specific catalog extraction. Catalog URL retrieval and HLS availability were verified live. The user confirmed moving artwork in diagnostics after HLS.js was given priority over Electron's advertised native HLS support.

The workspace build and Homey compatibility build passed. The new tests passed on Bun and Node. The full Node test run has an unrelated failure in `describeProtocolMessage.test.ts`, which imports `bun:test`.
