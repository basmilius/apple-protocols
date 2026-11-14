# Reference

A reference page lists every name an entry point exports, with its signature and a short description. Anything not listed is internal and may change in any release. The guides explain how the pieces fit; each page links to them.

| Entry point | Reference | Guide |
| --- | --- | --- |
| `@corewire/devices` | [Exports](/reference/devices) | [Guide](/guide/getting-started) |
| `@corewire/devices/catalog` | [Exports](/reference/devices#corewire-devices-catalog) | [Apple Music catalog](/guide/catalog) |
| `@corewire/airplay` | [Exports](/reference/airplay) | [Sessions and channels](/protocols/airplay) |
| `@corewire/airplay/mrp` | [Exports](/reference/airplay-mrp) | [Media Remote](/protocols/mrp) |
| `@corewire/airplay/raop` | [Exports](/reference/airplay-raop) | [RAOP](/protocols/raop) |
| `@corewire/airplay/rtsp` | [Exports](/reference/airplay-rtsp) | [RTSP](/protocols/rtsp) |
| `@corewire/companion-link` | [Exports](/reference/companion-link) | [Companion Link](/protocols/companion-link) |
| `@corewire/audio-source` | [Exports](/reference/audio-source) | [URLs and audio streams](/guide/media#audio-sources) |
| `@corewire/core` and its subpaths | [Exports](/reference/core) | [Pairing](/protocols/pairing), [Discovery](/protocols/discovery), [Encoding](/protocols/encoding), [Transport](/protocols/transport) |

Signatures leave out `readonly` and private members. Optional parameters show their default where there is one.
