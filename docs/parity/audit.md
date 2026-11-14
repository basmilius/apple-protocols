# Audit: `refactor/corewire` (990df3c) against the production baseline (5286829)

## Status after audit

| Finding | Status | Why |
| --- | --- | --- |
| M1 | fixed | `CompanionLinkSession.close()` gives the graceful stop and the socket close 10 s together (a slow Apple TV may take that long for `_sessionStop`), then destroys the socket; a responsive peer gets the same bytes. |
| m1 | changed | The keepalive ends the session only when no `/feedback` succeeded for 30 s, checked at each 2 s tick; same requests on the wire, and a stalled hub no longer drops after about 6 s. |
| m2 | fixed | The restore ends at the latest 5 s after the new session is up and then announces what the model holds, once, if it differs. |
| m3 | fixed | A `change` to null resets the announced state to `unknown`, so the next app that plays fires `state`. |
| m4 | fixed | `connect()` while `offline` runs the next scheduled AirPlay attempt now; a failure counts as the attempt it replaced. |
| m5 | open | Accepted: the slower first rejection buys whole-handshake retries; Homey waits in `onInit` either way. |
| m6 | open | Rollback after a new pairing costs a re-pairing; decide in the Homey migration whether to keep writing the hex object. |
| m7 | fixed | Artwork compares item and SET_ARTWORK bytes by length and hash, so other bytes for the same item fire `artwork` once. |
| m8 | fixed | The code now reports `degraded`, as the design says: `connected` promises everything the device type offers. Homey always pairs an Apple TV and HomePods have no Companion Link, so Homey sees no difference. |
| m9 | open | Homey keys animated artwork by track and covers the check; the helper documents that the caller owns it. |
| M2 | fixed | A second audit found that `AudioPlayback` awaited `source.stop()` before closing its AirPlay session, so a source that rejected or hung leaked the control and event channel and the feedback timer. The session now closes first, as the baseline did; `AudioStream.stream()` no longer awaits the source either. Same bytes in the same order on the wire. |
| m10 | fixed | `state` no longer fires during a restore with a half item that contradicts `current`; it is held and fires right before the `change` that ends the restore, with the settled item. |
| m11 | fixed | `disconnect()` cancels the now-playing restore timers, so no `change` fires about a second after a disconnect. Volume, power and text only change on device messages and stay silent once the sessions are closed. |
| m12 | fixed | A restore that ends on the same item compares the artwork with the last announced one and fires `artwork` once if it differs. A part the new session has not sent yet counts as unchanged, so the same artwork coming back fires nothing. |

Independent audit of all 311 items of `behavior-inventory.md` against the new code. Every verdict was checked in code; the verdict tables in `devices-api.md` and the commit bodies were only used to decide whether a change is documented.

Path prefixes for the new code: `air/` packages/airplay/src, `cl/` packages/companion-link/src, `core/` packages/core/src, `dev/` packages/devices/src, `as/` packages/audio-source/src. Baseline references use the prefixes of the inventory (`sdk/`, `ap/`, `cm/`, ...) and point into `../apple-protocols-baseline`. `H:` is the Homey app.

Verdicts:

- `kept`: same behavior (bytes, timing, events), possibly in another file or shape that is not observable.
- `changed`: observable behavior or public API differs. `doc` means the change is documented and justified in a commit body of `5286829..HEAD`, in `devices-api.md` or in `HANDOFF.md`; `undoc` means it is not.
- `dropped`: the behavior is gone without an equivalent.

For section 5 the verdict says whether the fix still holds in the new code. For section 7 it says whether the Homey usage has a working equivalent in `@corewire/devices`: `kept` when the semantics are the same, `changed` when the equivalent has another shape or semantics.

## Summary

| Verdict | Count |
| --- | --- |
| kept | 234 |
| changed, documented | 70 |
| changed, undocumented | 2 |
| dropped, documented | 5 |
| dropped, undocumented | 0 |
| Total | 311 |

The wire paths the Homey app uses are unchanged: the AirPlay handshake, MRP startup, Companion Link startup, HID, commands, volume, URL playback and audio streaming send the same messages in the same order with the same timeouts. Credentials stored by Homey today (hex fields) are read by `Credentials.parse()`. The recovery schedule equals what Homey runs today (1/2/4 s, then 15 x 2 min for an Apple TV, then 15 min forever; HomePod straight to 15 min) and never gives up. Every Homey usage in section 7 has a working equivalent.

No blocker was found. One major finding concerns teardown (`disconnect()` can hang on a half-open Companion Link socket). The other findings are minor. Two inventory items changed without documentation (LC-04, AS-HS-12); both are harmless for Homey. Two minor findings (m2, m3) are undocumented side effects of the new now-playing layer on items whose model behavior is kept.

## Findings

### Major

**M1. `await device.disconnect()` can hang for many minutes on a half-open Companion Link socket.**
`AppleDevice.disconnect()` awaits `Link.stop()` (`dev/device/device.ts:221-231`), which awaits `CompanionLinkSession.close()` (`dev/lifecycle/link.ts:102-104`). `close()` runs the graceful stop: one deregistration send, then `_tiStop`, `_touchStop`, `TVRCSessionStop` and `_sessionStop` as exchanges with 10 s timeouts each (`cl/session.ts:324-362`), then `stream.disconnect()`, which calls `socket.end()` and waits for `close` without any timeout (`core/transport/connection.ts:136-157`). Against a dead peer that never answers or ACKs, that is about 40 s of exchange timeouts plus the kernel's retransmission timeout on the FIN (about 15 minutes on Linux with default `tcp_retries2`).
Baseline: the same graceful stop existed (LC-19, LC-02), but `AbstractDevice.disconnect()` did not await Companion Link (`sdk/device/apple-tv.ts:101`) and Homey never awaited it in `onUninit` or the restart path (HY-11). The migration table in `devices-api.md` section 2 tells Homey to write `await tv.disconnect()`.
Failure scenario: the Apple TV is unplugged at the wall. AirPlay notices within about 6 s (three failed `/feedback`), Companion Link stays `connected` until the kernel gives up. The user deletes the device or presses the restart button in Homey, or Homey updates the app; `onDeleted`/`onUninit`/restart awaits `tv.disconnect()` and blocks for up to about 15 minutes.
Fix suggestion: bound `CompanionLinkSession.close()` (for example 2 s per exchange and a total cap, then `destroy()`), or let `Link.stop()` not await `close` beyond a short timeout. Documented as "disconnect() is async, awaits the CL graceful stop" (devices-api 7.1, LC-24), but the unbounded wait is not.

### Minor

**m1. `/feedback` keepalive now ends sessions after three failures in a row (TM-08, TM-09, TM-10).** `air/session.ts:25`, `:646-670`. Documented and justified (794ea17, devices-api 3.5), and it is what replaces the forced 15-minute reconnect. Risk: a slow hub (event loop stalls) or a receiver that is slow while waking can miss three 1900 ms timeouts in 6 s and get an AirPlay drop it did not get before. With the quick retries the device is back within seconds, but a running URL playback or audio stream on that session ends with it. Watch for this in the Homey soak test.

**m2. `nowPlaying` can stay in "restoring" indefinitely after a reconnect.** `NowPlayingControl.hold()` sets `#restoring` (`dev/nowPlaying/nowPlaying.ts:97-105`). Only a `nowPlayingChanged` from the model ends it (`:127-151`). If the new session reports nothing that triggers `nowPlayingChanged` (for example nothing plays any more and the device sends no SET_NOW_PLAYING_CLIENT), `current` keeps returning the last item from before the drop, `elapsed` stays frozen at the held value, and `artwork` events are suppressed (`:112-115`), until the next model event. Homey impact is small because `power.change` at the Companion Link reconnect clears now playing when the TV sleeps, but a pull of `current` returns stale data. Undocumented as a limitation (devices-api 0.1 describes the restore, not this case). Suggestion: start the settle timer in `hold()` as well.

**m3. `nowPlaying.state` is not re-announced after a `change(null)`.** `#publish()` only updates `#lastState` for a non-null item (`dev/nowPlaying/nowPlaying.ts:189-194`). Sequence: app plays (`state` 'playing'), the client is removed (`change(null)`, `#lastState` stays 'playing'), a new app starts playing: no `state` event, because 'playing' equals the last announced state. Baseline fired `playbackStateChanged` here (Unknown to Playing for the new client, ST-06). Homey sets `speaker_playing` from `state` without debounce (H:src/logic/airplay.ts:286-291) but also from the debounced `change` (H:src/logic/airplay.ts:552-568), so Homey only loses the 300 ms fast path; a consumer that uses only `state` misses the start. Undocumented. Fix: set `#lastState` to 'unknown' (or announce 'stopped') when the item becomes null.

**m4. `connect()` on a device that is already `offline` does not trigger an attempt.** `dev/device/device.ts:181-218`: when `#running` is true, `connect()` only waits for status events. In the `slow` or `rare` phase the next event comes at the next scheduled attempt, so the promise stays pending for up to 2 minutes (Apple TV) or 15 minutes (HomePod), then rejects or resolves. Baseline `airplay.connect()` started an attempt right away. Homey's restart path does `disconnect()` first and is not affected; a flow or settings handler that calls `connect()` to "retry now" would be. Partly documented ("connect() is idempotent", 6866b5e); the wait is not.

**m5. The first `connect()` rejects later than before for an unreachable device.** Rejection comes after the first attempt and the three quick retries (`dev/device/device.ts:200-203`). Each retry first runs a 5 s unicast query with wake knocks and, without a `resolve` option, a multicast scan (`dev/lifecycle/resolve.ts:60-78`), then a TCP connect with a 30 s idle timeout (`core/const.ts:5`). Worst case about 150 s, against about 96 s for TM-01. Homey's `onInit` waits that long before it marks the device unavailable. Documented in substance (devices-api 3.2), not the duration.

**m6. New pairings stored with `Credentials.toString()` break a rollback.** `dev/credentials/credentials.ts:95-106` writes `cw1.<base64url>...`; `Credentials` exposes no way to get the hex fields back. HANDOFF names a version pin as the rollback plan. A device paired after the migration stores a string the old app cannot read (H:src/utils/getAccessoryCredentialsFromDevice.ts:12-18 reads `credentials.accessoryIdentifier` and hex fields). Old stores keep working in both directions because `parse()` never rewrites them. Suggestion: keep writing the hex object in Homey until rollback is off the table, which needs an accessor on `Credentials`, or accept that re-pairing is the rollback cost.

**m7. Artwork events for identifier-less SET_ARTWORK updates are deduplicated away.** `#artworkOf()` compares identifier, URL and two "bytes present" booleans (`dev/nowPlaying/nowPlaying.ts:108-110`). A second SET_ARTWORK with other JPEG bytes for the same item (no artwork identifier, same title) emits nothing, and `artwork.get()` is cached per artwork identifier anyway. Baseline fired `artworkChanged` on every SET_ARTWORK (ST-17) and Homey reset its artwork identifier on it (H:src/logic/airplay.ts:296-312). Documented (devices-api 0.1); impact limited to sources that change artwork without changing metadata.

**m8. `devices-api.md` 3.2 says an Apple TV without credentials reports `degraded`; the code reports `connected`.** `dev/device/device.ts:262` passes no Companion Link link to `deriveState` when credentials are missing, so the state is `connected` while `status.companionLink` is `off` with a `CredentialsError` (`:257-259`). Not a Homey path (Homey always has credentials for an Apple TV); the documentation and the code disagree.

**m9. `fetchAnimatedArtwork` no longer checks that the item is still current.** Baseline `getAnimatedFromCatalog()` returned `[]` when the track changed during the lookup (`sdk/internal/airplay-artwork.ts:100-110`). The new helper takes an album id and leaves that check to the caller (`dev/catalog/artwork.ts:47-51`, said in its doc comment only). Homey keys animated artwork by track and resets it on change (H:src/logic/airplay.ts:267-271), so it is covered there.

### Undocumented changes without a finding

- LC-04: a socket `error` on a connected socket now ends the connection at once with reason `error` (`core/transport/connection.ts:242-252`); before, it only emitted `error` and left the state to the following `close`. Node closes the socket after an error anyway, so the result is the same.
- AS-HS-12: the `PlaybackError('An audio stream is already active.')` guard is gone; every stream has its own connection and `MediaControl` stops the previous one (`dev/media/media.ts:123-124`).

### Not regressions, for the record

- The 15-minute forced reconnect is dropped (HY-13). Justified in devices-api 3.5 with code evidence that I verified: every `Connection` end emits `closed` (`core/transport/connection.ts:186-212`), the session ends on any channel close, data or event error and `SetConnectionState=Disconnected` (`air/session.ts:476-484`, `:569-592`), and the keepalive catches a dead AirPlay peer. The zombie session of LC-13 cannot occur. A half-open Companion Link socket is left to the kernel (about 15 minutes), the same bound the forced reconnect gave.
- A device that accepts a connection and drops it right away is retried every second forever (`dev/lifecycle/link.ts:153-162` resets the retry counter on every drop). Homey's `ConnectionRecovery` did the same (`reset()` on `connected`), so this is kept, but neither has a back-off for flapping.
- `volume.up()`/`down()` right after a reconnect step from 0 until the device reports its volume (`air/mrp/volume.ts:50-54`, model cleared at `dev/device/device.ts:323`). Same as baseline (AP-HS-03).

## Per-id table

### 1a. AirPlay remote-control connection

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| AP-HS-01 | kept | dev/device/device.ts:182-184 | In-flight dedupe moved to the device `connect()`. |
| AP-HS-02 | changed, doc | dev/device/device.ts:186-188 | `connect()` on a live device is a no-op (devices-api 4, 7.1). |
| AP-HS-03 | kept | dev/device/device.ts:322-323 | Model cleared per session; now after the AirPlay handshake instead of before any I/O, still before MRP. Not observable. |
| AP-HS-04 | kept | air/session.ts:84, :185; air/channels/control.ts:46-52 | New session UUID and control ids per session. The `Context` (logger, identity) is now per device instead of per connect; not observable on the wire. |
| AP-HS-05 | kept | air/session.ts:97-99, :469-473, :252, :256 | `assertCurrent` replaced by the session signal and checkpoints. |
| AP-HS-06 | changed, doc | air/session.ts:84, :90; air/const.ts:2 | Port 7000 default kept; no Connection retry (c3bfd63), covered by the quick retries. |
| AP-HS-07 | kept | air/info.ts:24-32 | |
| AP-HS-08 | kept | air/info.ts:45-50; air/channels/control.ts:63 | |
| AP-HS-09 | kept | air/pairing.ts:13-22, :37-46 | |
| AP-HS-10 | kept | air/session.ts:93-95; dev/device/device.ts:316 | |
| AP-HS-11 | kept | core/pairing/cipher.ts:48-50 | |
| AP-HS-12 | kept | air/session.ts:101 | |
| AP-HS-13 | changed, doc | air/session.ts:442-460; dev/lifecycle/timing.ts:11-29 | A shared server by default; `timing: false` gives `None`; a failed bind gives `None` instead of `NTP` port 0 (devices-api 7.3). Same bytes for Homey. |
| AP-HS-14 | kept | air/session.ts:243-246, :594-632 | |
| AP-HS-15 | kept | air/session.ts:250-251, :525-539 | |
| AP-HS-16 | kept | air/session.ts:252-253, :569-573 | |
| AP-HS-17 | kept | air/session.ts:486-504 | |
| AP-HS-18 | kept | air/session.ts:507; air/channels/data.ts:43; air/channels/encrypted.ts:29 | |
| AP-HS-19 | kept | air/session.ts:517-520; air/mrp/mediaRemote.ts:88-92 | |
| AP-HS-20 | changed, doc | air/session.ts:258, :569-579 | Data/event errors end the session instead of `controlStream.destroy()` (c3bfd63, 794ea17). |
| AP-HS-21 | kept | air/session.ts:260 | Keepalive starts before `MediaRemote` runs the MRP startup. |
| AP-HS-22 | kept | air/mrp/mediaRemote.ts:182; air/mrp/messages.ts | Builder only changed its UUID source. |
| AP-HS-23 | kept | air/mrp/mediaRemote.ts:183 | |
| AP-HS-24 | kept | air/mrp/mediaRemote.ts:184 | |
| AP-HS-25 | kept | air/mrp/mediaRemote.ts:185-186 | |
| AP-HS-26 | kept | air/mrp/mediaRemote.ts:72, :188-191 | `#lastArtworkId` is per MediaRemote, so null per session. |
| AP-HS-27 | kept | air/mrp/mediaRemote.ts:97-103; dev/lifecycle/link.ts:122-140 | `connected` becomes status reason `established`. |
| AP-HS-28 | changed, doc | dev/lifecycle/link.ts:142-150 | Failed connect goes to `recovering`, no `disconnected(false)` (devices-api 4). |
| AP-HS-29 | kept | air/session.ts:265-276, :542-561; air/mrp/mediaRemote.ts:104-113 | |
| AP-HS-30 | kept | air/channels/data.ts:45, :92-120; air/utils.ts:16-27 | |

### 1b. AirPlay URL playback

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| UP-HS-01 | changed, doc | dev/media/media.ts:78; dev/errors.ts:17-23 | `UnavailableError` instead of "Not connected" (devices-api 7.1). |
| UP-HS-02 | kept | dev/media/media.ts:84-85 | |
| UP-HS-03 | kept | air/session.ts:287, :635-643, :76-103 | |
| UP-HS-04 | kept | air/session.ts:287 | URL sessions never get a PtpMaster. |
| UP-HS-05 | changed, doc | dev/media/media.ts:80-82; air/session.ts:378-380 | Devices fails before connecting (devices-api 0). |
| UP-HS-06 | kept | air/session.ts:382-393 | |
| UP-HS-07 | kept | air/session.ts:395-398 | |
| UP-HS-08 | kept | air/session.ts:401-405 | |
| UP-HS-09 | kept | air/session.ts:407 | |
| UP-HS-10 | kept | air/playback/playback.ts:191-228 | |
| UP-HS-11 | kept | air/playback/playQueue.ts:16-19 | |
| UP-HS-12 | kept | air/playback/playQueue.ts:171-183; air/channels/control.ts:91-104 | |
| UP-HS-13 | kept | air/playback/playback.ts:220 | |
| UP-HS-14 | kept | air/playback/playback.ts:11, :230-261 | |
| UP-HS-15 | kept | air/playback/playback.ts:274-278 | |
| UP-HS-16 | changed, doc | air/session.ts:289-295, :421-430 | Failed playUrl closes its connection at once (794ea17). |
| UP-HS-17 | kept | air/playback/playback.ts:131-183 | |
| UP-HS-18 | kept | air/playback/playQueue.ts:62-80 | |
| UP-HS-19 | kept | air/playback/playQueue.ts:367-421 | |

### 1c. AirPlay audio streaming

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| AS-HS-01 | kept | dev/media/media.ts:120-138; air/session.ts:305-326 | `checked()` replaced by abort signals. |
| AS-HS-02 | kept | air/session.ts:340-357 | |
| AS-HS-03 | kept | air/session.ts:442-460 | Devices passes no PtpMaster. |
| AS-HS-04 | kept | air/session.ts:28, :360; dev/media/media.ts:7, :128 | Volume now 0..1, same dB mapping. |
| AS-HS-05 | changed, doc | air/session.ts:363, :646-670 | Three failures end the session (794ea17). |
| AS-HS-06 | kept | air/audio/stream.ts:235-271 | |
| AS-HS-07 | kept | air/audio/stream.ts (RECORD after audio SETUP) | |
| AS-HS-08 | kept | air/audio/stream.ts:343-371 | |
| AS-HS-09 | kept | air/audio/stream.ts:656-669 | |
| AS-HS-10 | kept | air/audio/stream.ts:15, :412-434 | |
| AS-HS-11 | changed, doc | air/audio/playback.ts:47-55; dev/media/media.ts:140-151 | Resolves at setup, `ended` settles at the end (6866b5e). |
| AS-HS-12 | changed, undoc | dev/media/media.ts:123-124 | Guard gone; one connection per stream, the previous one is stopped. Harmless. |

### 1d. RAOP

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| RA-HS-01 | changed, doc | air/raop/raop.ts | Takes a `RaopTarget` instead of a `DiscoveryResult` (990df3c); sequence unchanged. |
| RA-HS-02 | kept | air/raop/streamClient.ts | Moved only. |
| RA-HS-03 | kept | air/raop/raop.ts | |
| RA-HS-04 | kept | air/raop/streamClient.ts | |
| RA-HS-05 | kept | air/raop/rtspClient.ts | |
| RA-HS-06 | kept | air/raop/utils.ts | |

### 1e. Companion Link

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| CL-HS-01 | changed, doc | dev/lifecycle/link.ts:70-82; cl/session.ts:72-74 | Link drives connects; CredentialsError kept (59ebd8f, devices-api 7.1). |
| CL-HS-02 | changed, doc | cl/session.ts:83-128; dev/lifecycle/link.ts:107-120 | New session per attempt; listeners live on the session signal. |
| CL-HS-03 | changed, doc | cl/session.ts:83, :93 | No Connection retry (c3bfd63). |
| CL-HS-04 | kept | cl/pairing.ts:9, :37 | |
| CL-HS-05 | kept | cl/pairing.ts:43-44; cl/session.ts:105 | |
| CL-HS-06 | kept | cl/messages.ts:52-70; cl/session.ts:377-385 | |
| CL-HS-07 | kept | cl/session.ts:387-392; cl/messages.ts:113 | |
| CL-HS-08 | kept | cl/session.ts:394; cl/messages.ts:134 | |
| CL-HS-09 | kept | cl/session.ts:397-400; dev/device/device.ts:349 | |
| CL-HS-10 | kept | cl/session.ts:402; cl/messages.ts:169 | |
| CL-HS-11 | kept | cl/session.ts:405; cl/messages.ts:219 | |
| CL-HS-12 | kept | cl/session.ts:24, :408, :428-436 | |
| CL-HS-13 | kept | cl/session.ts:300-321; dev/device/device.ts:344 | State lives per device and is cleared at each connect. |
| CL-HS-14 | kept | cl/session.ts:411-423; cl/state.ts:115-120 | |
| CL-HS-15 | changed, doc | cl/session.ts:118-128; dev/lifecycle/link.ts:142-150 | Failure schedules the next attempt. |
| CL-HS-16 | kept | cl/channel.ts:59-64 | |
| CL-HS-17 | kept | cl/stream.ts:45, :113 | |
| CL-HS-18 | kept | cl/stream.ts:126, :140 | |
| CL-HS-19 | kept | cl/hid.ts:24-43; cl/messages.ts:156 | |
| CL-HS-20 | kept | cl/text.ts:20-67 | |
| CL-HS-21 | kept | cl/touch.ts:56-82 | |

### 1f. PIN pairing

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| PP-HS-01 | kept | air/pairing.ts:64-80; core/pairing/client.ts:38-42 | |
| PP-HS-02 | kept | air/pairing.ts:109-122; core/pairing/client.ts:12, :128-174 | |
| PP-HS-03 | kept | air/pairing.ts:13-22 | |
| PP-HS-04 | changed, doc | dev/pairing/pairing.ts:30-41 | `pin()` closes on success, `close()` replaces `abort()`/`end()`; a wrong PIN keeps the socket open as before. |
| PP-HS-05 | kept | dev/device/device.ts:316, :347 | |
| PP-HS-06 | kept | core/pairing/client.ts:248-254 | |

### 1g. Transient pairing

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| TP-HS-01 | kept | air/pairing.ts:25-34, :49-56 | `setup.start()` only generates keys; pin-start still precedes M1. |
| TP-HS-02 | kept | core/pairing/client.ts:61-71; core/pairing/const.ts | |
| TP-HS-03 | kept | air/pairing.ts:50 | |

### 2. Timers, timeouts, retries

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| TM-01 | changed, doc | core/transport/connection.ts:82-121; dev/lifecycle/schedule.ts:3 | One TCP attempt; whole handshake retried after 1/2/4 s (c3bfd63, devices-api 3.2). See m5. |
| TM-02 | kept | core/transport/connection.ts:105, :222 | |
| TM-03 | kept | core/transport/connection.ts:221 | |
| TM-04 | kept | core/transport/connection.ts:104 | |
| TM-05 | dropped, doc | core/transport/connection.ts:214-216 | No reconnect inside Connection (c3bfd63). |
| TM-06 | kept | core/const.ts:2; air/rtsp/client.ts:172-176 | |
| TM-07 | kept | air/channels/control.ts:12 | |
| TM-08 | changed, doc | air/session.ts:646-670 | Three failures end the session (794ea17). See m1. |
| TM-09 | changed, doc | air/session.ts:398 | Same keepalive rule. |
| TM-10 | changed, doc | air/session.ts:363 | Same keepalive rule. |
| TM-11 | kept | air/channels/data.ts:19, :70-73 | |
| TM-12 | kept | cl/stream.ts:17; cl/pairing.ts:9 | |
| TM-13 | kept | cl/session.ts:24, :428-436 | |
| TM-14 | kept | air/mrp/hid.ts:136-140 | |
| TM-15 | kept | air/mrp/hid.ts:118-133 | |
| TM-16 | kept | cl/hid.ts:24-43 | |
| TM-17 | kept | air/mrp/keyboard.ts:8, :108 | |
| TM-18 | kept | air/mrp/volume.ts:10, :13, :156-178 | |
| TM-19 | kept | air/playback/playback.ts:11, :259-261 | |
| TM-20 | kept | air/playback/playback.ts:14, :17 | |
| TM-21 | kept | air/playback/playQueue.ts:25, :192 | |
| TM-22 | kept | air/audio/stream.ts:21; air/raop/controlClient.ts | |
| TM-23 | kept | air/audio/pacing.ts | 3-line import diff. |
| TM-24 | kept | air/playback/playQueue.ts:30-33 | |
| TM-25 | kept | air/audio/latency.ts | Unchanged file. |
| TM-26 | kept | air/raop/raop.ts | |
| TM-27 | dropped, doc | dev/lifecycle/schedule.ts:3-6 | ConnectionRecovery removed; its 1/2/4 s live on in the schedule (6866b5e). |
| TM-28 | kept | core/discovery/mdns.ts:536-611; dev/lifecycle/resolve.ts:8, :11, :117 | Knock ports now passed by devices; 5 s as Homey used. |
| TM-29 | kept | core/discovery/discovery.ts:12, :58 | |
| TM-30 | kept | as/fetchAudio.ts:4-5 | |
| TM-31 | kept | as/decoder/decode.ts:75, :92 | |
| TM-32 | kept | as/ffmpeg.ts:117 | |

### 3. Lifecycle and teardown

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| LC-01 | changed, doc | core/transport/connection.ts:127-133, :186-212 | `destroy()` emits `closed` and aborts the signal (c3bfd63). |
| LC-02 | kept | core/transport/connection.ts:136-157 | Still no timeout on the close wait; now awaited by `device.disconnect()`. See M1. |
| LC-03 | changed, doc | core/transport/connection.ts:214-216 | `closed(reason)` instead of `close(hadError)`; no retry. |
| LC-04 | changed, undoc | core/transport/connection.ts:242-252 | A socket error ends the connection at once. Harmless. |
| LC-05 | kept | core/transport/connection.ts:255-258 | Idle timeout only exists while connecting (`:222`). |
| LC-06 | kept | core/transport/connection.ts:167-172; air/channels/data.ts:48-51 | Note: an `error` on the data channel now also ends the AirPlay session (`air/session.ts:575-578`). |
| LC-07 | kept | core/transport/connection.ts:191-200 | One socket per Connection; listeners removed at the end. |
| LC-08 | changed, doc | air/session.ts:542-561; air/mrp/mediaRemote.ts:160-164; dev/lifecycle/link.ts:85-105 | Same cleanup through the session signal; `status` replaces `disconnected`. |
| LC-09 | kept | dev/device/device.ts:322-323 | Decided in devices-api 4. See m2 for the restore side. |
| LC-10 | changed, doc | air/session.ts:476-484; dev/lifecycle/link.ts:153-162 | Status `recovering` with reason `remote`/`timeout`/`error`. |
| LC-11 | changed, doc | dev/device/device.ts:221-231 | Async; status `disconnected`, reason `requested`. |
| LC-12 | kept | air/session.ts:207-208 | |
| LC-13 | changed, doc | air/session.ts:569-592 | Zombie session fixed (devices-api 3.5). |
| LC-14 | kept | air/session.ts:542-561, :515, :534 | Children destroyed through the signal; no TEARDOWN. |
| LC-15 | changed, doc | air/channels/data.ts:47 | Also on `destroy()`, because destroy now emits `closed`. |
| LC-16 | kept | air/rtsp/client.ts:205-218 | |
| LC-17 | changed, doc | air/channels/encrypted.ts:68-72 | `destroy(err)` ends with reason `error`; no separate `error` event (c3bfd63). |
| LC-18 | changed, doc | cl/session.ts:246-297; dev/device/device.ts:221-231 | |
| LC-19 | kept | cl/session.ts:265-281, :324-362, :444-459 | Five single deregistrations, the combined one, then the four stops, as baseline (`sdk/internal/companion-link-state.ts:154-175` plus `cl/protocol.ts:120`). |
| LC-20 | changed, doc | cl/session.ts:232; dev/lifecycle/link.ts:153-162 | |
| LC-21 | changed, doc | core/transport/connection.ts:255-258; cl/session.ts:86-87 | Timeout only while connecting; every end emits `closed`. |
| LC-22 | kept | cl/stream.ts:202-205 | |
| LC-23 | kept | cl/stream.ts:240-244 | Decrypt failure still keeps the stream. |
| LC-24 | changed, doc | dev/device/device.ts:221-231 | Awaits both protocols. See M1. |
| LC-25 | changed, doc | dev/lifecycle/status.ts:13-43 | |
| LC-26 | changed, doc | dev/lifecycle/status.ts:38-42 | `recovering`/`offline` states are emitted. |
| LC-27 | kept | air/playback/playback.ts:144-147; air/audio/playback.ts:42-45 | |
| LC-28 | kept | dev/media/media.ts:100-107 | |
| LC-29 | kept | air/playback/playQueue.ts:357-364; air/playback/playback.ts:67 | |
| LC-30 | dropped, doc | dev/lifecycle/link.ts:85-105, :123, :143 | ConnectionRecovery gone; stale attempts ignored by AbortController identity. |
| LC-31 | dropped, doc | dev/lifecycle/link.ts:164-174 | No `failed`; the schedule never gives up. |
| LC-32 | dropped, doc |  | The periodic reconnect is gone (devices-api 3.5). |

The three LC-30 to LC-32 rows and TM-05, TM-27 are the five `dropped, doc` items.

### 4. Workarounds and quirks

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| QK-01 | kept | air/channels/event.ts:108-115 | |
| QK-02 | kept | air/channels/encryption.ts:7; cl/stream.ts:140, :157; air/audio/stream.ts:656-657 | |
| QK-03 | kept | air/channels/encryption.ts:16-41 | |
| QK-04 | kept | air/channels/encryption.ts:5, :44-60 | |
| QK-05 | kept | air/channels/encrypted.ts:23-24, :50-73; air/rtsp/client.ts | |
| QK-06 | kept | core/encoding/ntp.ts | Unchanged file. |
| QK-07 | kept | air/mrp/hid.ts:15-17, :136-140 | |
| QK-08 | kept | air/mrp/mediaRemote.ts:185-186 | |
| QK-09 | kept | air/channels/data.ts:159-161; air/utils.ts:38-48 | |
| QK-10 | kept | air/channels/data.ts:63, :176 | |
| QK-11 | kept | air/session.ts:585-592 | Now ends the session with reason `remote`. |
| QK-12 | kept | air/session.ts:287; air/airplayFeatures.ts:247 | |
| QK-13 | kept | air/session.ts:359-360 | |
| QK-14 | kept | air/session.ts:400-405 | |
| QK-15 | kept | cl/stream.ts:183-192 | |
| QK-16 | kept | cl/stream.ts:126 | |
| QK-17 | kept | cl/messages.ts:63-65 | |
| QK-18 | kept | cl/touch.ts:29-47; air/mrp/hid.ts:17 | |
| QK-19 | kept | cl/interests.ts:18-24; cl/session.ts:266-268 | |
| QK-20 | kept | air/mrp/playbackQueue.ts:39-43 | |
| QK-21 | kept | air/playback/playback.ts:220 | |
| QK-22 | kept | air/session.ts:169-173; dev/media/media.ts:80 | |
| QK-23 | kept | air/playback/playQueue.ts:335-336 | |
| QK-24 | kept | air/channels/control.ts:9, :92 | |
| QK-25 | kept | air/channels/control.ts:59-67; air/rtsp/client.ts:127-150 | |
| QK-26 | kept | air/channels/event.ts:64-100 | `sessionDied` still has no listener. |
| QK-27 | changed, doc | cl/stream.ts:210-215; air/channels/encrypted.ts:6; air/rtsp/client.ts:237-249 | CL overflow now closes the connection (59ebd8f); AirPlay and RTSP kept. |
| QK-28 | kept | air/mrp/player.ts | File moved, class renamed. |
| QK-29 | kept | air/mrp/player.ts | |
| QK-30 | kept | air/mrp/artworkUrl.ts; air/mrp/player.ts | |
| QK-31 | kept | air/mrp/messages.ts | |
| QK-32 | kept | cl/session.ts:169-182 | |
| QK-33 | kept | air/session.ts:507, :526 | |
| QK-34 | kept | air/session.ts:344, :385 | |
| QK-35 | kept | air/mrp/state.ts (updateDeviceInfo) | |
| QK-36 | kept | cl/text.ts:20-30 | |
| QK-37 | kept | air/audio/stream.ts (NACK handler) | Only the address source changed. |
| QK-38 | kept | air/timing/ntp.ts | 4-line diff. |

### 5. Fix history (does the fix still hold)

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| FX-01 | kept | dev/media/media.ts:100-107 | |
| FX-02 | kept | as/decoder/decode.ts:11-23 | |
| FX-03 | kept | cl/stream.ts:186-189; cl/touch.ts:76-81 | |
| FX-04 | kept | core/encoding/opack.ts:310-315, :346 | |
| FX-05 | kept | core/encoding/plist.ts:22-23 | |
| FX-06 | kept | packages/airplay/proto/CommandInfo.proto:132 | |
| FX-07 | kept | dev/media/media.ts:123-138; dev/lifecycle/link.ts:123, :143 | Generations replaced by AbortControllers. |
| FX-08 | kept | air/channels/encryption.ts:20-38; air/channels/encrypted.ts:6; air/audio/stream.ts (NACK) | The one-stream guard is AS-HS-12. |
| FX-09 | kept | core/transport/connection.ts:87-93, :191-200; air/audio/sourceSession.ts | |
| FX-10 | kept | core/encoding/opack.ts | 5-line import diff. |
| FX-11 | kept | cl/channel.ts:59-64 | |
| FX-12 | kept | air/audio/stream.ts:64-93 | |
| FX-13 | kept | core/encoding/rti.ts:43-44 | |
| FX-14 | kept | cl/text.ts:20-67; air/mrp/keyboard.ts; core/transport/connection.ts:127-133 | The recovery part is replaced by the Link. |
| FX-15 | kept | air/mrp/player.ts | |
| FX-16 | kept | air/mrp/hid.ts:136-140; air/session.ts:585-592; cl/touch.ts:56-64 | |
| FX-17 | kept | air/mrp/mediaRemote.ts:186 | |
| FX-18 | kept | air/channels/data.ts:130-131, :159; air/features.ts; core/encoding/tlv8.ts | Atomic storage moved to diagnostics with JsonStorage (990df3c). |
| FX-19 | kept | air/session.ts:28, :360; air/session.ts:287 | |
| FX-20 | kept | air/mrp/state.ts; air/mrp/player.ts; cl/messages.ts:134 | |
| FX-21 | kept | air/mrp/mediaRemote.ts:160-164; dev/lifecycle/link.ts:153-156 | Listeners die with the session signal. |
| FX-22 | kept | cl/interests.ts:18-24; cl/session.ts:266-268 | |
| FX-23 | kept |  | Not applicable any more: the recovery flag went with ConnectionRecovery (6866b5e, see LC-30 to LC-32). Nothing regresses. |
| FX-24 | kept | air/mrp/player.ts | |
| FX-25 | kept | air/mrp/player.ts:7, :37 | |
| FX-26 | kept | air/mrp/player.ts:97 | |
| FX-27 | kept | air/mrp/state.ts | |
| FX-28 | kept | cl/session.ts:24, :252-256; cl/stream.ts:126 | |
| FX-29 | kept | air/session.ts:517-520; air/mrp/mediaRemote.ts:88-92 | |
| FX-30 | kept | air/mrp/messages.ts:237 | |
| FX-31 | kept | cl/stream.ts:202-205 | |
| FX-32 | kept | core/transport/connection.ts:167-172 | |
| FX-33 | kept | air/channels/data.ts:102 | |
| FX-34 | kept | air/session.ts:533 | |
| FX-35 | kept | core/encoding/ntp.ts:48; air/timing/ntp.ts:124 | |
| FX-36 | kept | air/channels/encrypted.ts:68-72; air/rtsp/client.ts | Now reported through `closed('error')`. |
| FX-37 | kept | core/transport/connection.ts:261-267 | |
| FX-38 | kept | core/const.ts:2; air/channels/control.ts:12 | |
| FX-39 | kept | air/session.ts:569-579; core/utils.ts:65 | |
| FX-40 | kept | air/timing/ntp.ts; air/session.ts:630 | |
| FX-41 | kept | air/mrp/mediaRemote.ts:184 | |
| FX-42 | kept | air/mrp/mediaRemote.ts:182 | |
| FX-43 | kept | dev/lifecycle/status.ts:20-36 | Companion Link failure never fails AirPlay. |
| FX-44 | changed, doc | dev/device/device.ts | The old `packages/devices` logic is replaced again by the Link. |
| FX-45 | kept | cl/messages.ts:63; cl/session.ts:27 | |

### 6. State model

| Id | Verdict | New code | Notes |
| --- | --- | --- | --- |
| ST-01 | kept | air/mrp/state.ts | Moved, logic unchanged (diff only renames and event names). |
| ST-02 | kept | air/mrp/client.ts | |
| ST-03 | kept | air/mrp/state.ts | |
| ST-04 | kept | air/mrp/state.ts | |
| ST-05 | kept | air/mrp/player.ts | |
| ST-06 | kept | air/mrp/state.ts; dev/nowPlaying/nowPlaying.ts:153-163 | Model unchanged. The device-level `state` is deduplicated; see m3. |
| ST-07 | changed, doc | dev/nowPlaying/nowPlaying.ts:127-151, :172-197 | Public deep compare plus restore after reconnect (devices-api 0, 0.1). See m2. |
| ST-08 | kept | air/mrp/state.ts | |
| ST-09 | kept | air/mrp/state.ts | |
| ST-10 | kept | air/mrp/player.ts | |
| ST-11 | kept | air/mrp/player.ts | |
| ST-12 | kept | air/mrp/player.ts | |
| ST-13 | kept | air/mrp/player.ts | |
| ST-14 | kept | air/mrp/player.ts; dev/nowPlaying/snapshot.ts:81-82 | |
| ST-15 | kept | air/mrp/client.ts; dev/nowPlaying/nowPlaying.ts:66-68 | |
| ST-16 | kept | air/mrp/player.ts | |
| ST-17 | changed, doc | dev/nowPlaying/nowPlaying.ts:108-125 | Deduplicated (devices-api 0.1). See m7. |
| ST-18 | kept | air/mrp/artwork.ts:52-104 | Cache per MediaRemote, so per session. |
| ST-19 | changed, doc | dev/volume/volume.ts:99-109 | Only different values fire. |
| ST-20 | kept | air/mrp/mediaRemote.ts:168-177 | |
| ST-21 | changed, doc | dev/volume/volume.ts:55, :99-109 | Deduplicated with the volume. |
| ST-22 | kept | air/mrp/volume.ts:33-64, :190-194; dev/volume/volume.ts:10-22 | |
| ST-23 | kept | air/mrp/volume.ts:76-86 | |
| ST-24 | kept | air/mrp/state.ts | |
| ST-25 | changed, doc | dev/nowPlaying/snapshot.ts:71 | `activeAppChanged` gone; `item.app`. |
| ST-26 | changed, doc | dev/nowPlaying/nowPlaying.ts:60-62 | Events during setup reach consumers. |
| ST-27 | changed, doc | dev/text/text.ts:22-33 | Fixed. |
| ST-28 | kept | air/mrp/hid.ts:73-79; dev/remote/remote.ts:30-33 | |
| ST-29 | kept | air/mrp/commands.ts:146-165 | |
| ST-30 | kept | dev/power/power.ts:30-33; cl/state.ts:115-120, :164-179 | |
| ST-31 | kept | cl/state.ts:181-202; dev/text/text.ts:59 | |
| ST-32 | kept | cl/state.ts:123-141 | |
| ST-33 | changed, doc | dev/lifecycle/status.ts:13-43 | `status.state` replaces `isConnected`. |

### 7. Homey usages and their equivalents

| Id | Verdict | Equivalent in `@corewire/devices` | Notes |
| --- | --- | --- | --- |
| HY-01 | changed, doc | `log`, `logLevels`, `timing` options (dev/types.ts:42-62); shared server dev/lifecycle/timing.ts | Per-device sink receives every record (core/reporter.ts Logger), filtered to error/warn by default. |
| HY-02 | changed, doc | `new AppleTV(target, {credentials})`; CL attaches by itself (dev/device/device.ts:151-160, :285-291) | Capabilities always present; `supports()`. |
| HY-03 | changed, doc | `connect()` resolves on `connected` or `degraded` (dev/device/device.ts:194-196) | Waits for the first CL attempt first (dev/lifecycle/status.ts:31-33). |
| HY-04 | changed, doc | `status` `recovering` then `offline`, `connect()` rejects; retries go on | See m5. |
| HY-05 | changed, doc | `status.state === 'connected'` | |
| HY-06 | changed, doc | `status.state` `recovering`/`offline` with reason; `disconnected` with reason `requested` | Nothing in Homey depends on the old booleans beyond what `status` gives (verified in H:src/apple-tv/device.ts:206-266, H:src/homepod-base/device.ts:127-143). |
| HY-07 | changed, doc | `status.companionLink.state` | |
| HY-08 | kept | `tv.power.on('change')`, fires at every CL connect (cl/session.ts:411-417, dev/power/power.ts:30-33) | |
| HY-09 | changed, doc | `resolve` option plus built-in unicast (dev/lifecycle/resolve.ts:60-86) | |
| HY-10 | changed, doc | Credentials in the constructor; no setters | |
| HY-11 | changed, doc | `await tv.disconnect()` | See M1. |
| HY-12 | kept | dev/device/device.ts:182-188 | |
| HY-13 | changed, doc | Schedule in dev/lifecycle/schedule.ts; no forced reconnect | devices-api 3.5; verified. |
| HY-14 | kept | dev/lifecycle/schedule.ts:3-6, :20-30; flow trigger when `status.companionLink.phase` becomes `rare` | Per-protocol schedules; same persistence. |
| HY-15 | kept | dev/lifecycle/schedule.ts:25-29 | |
| HY-16 | kept | dev/device/device.ts:330-353 | Every CL attempt re-resolves with unicast. |
| HY-17 | changed, doc | dev/lifecycle/resolve.ts:113-125 | No hand-built results; target `{address, port, txt, id}`. |
| HY-18 | changed, doc | dev/device/device.ts:89-91 | `name` falls back to TXT name, `/info` name, then id. Homey does not read it. |
| HY-19 | changed, doc | `AppleTV.pair(target)` (dev/device/appleTv.ts:48-50), `pin()`, `close()`; `Credentials.parse(store)` (dev/credentials/credentials.ts:47-75) | Hex store read correctly: `decodeBinary` takes hex for even-length hex strings. See m6. |
| HY-20 | kept | `new HomePod(target)`, `connect()`, `disconnect()` | `connect()` rejects after the quick phase, well inside Homey's 20 s pairing timeout for a reachable pod. |
| HY-21 | changed, doc | `nowPlaying` `change`/`state`/`artwork`, `volume` `change` | Values are set before the events fire (dev/volume/volume.ts:107-108, dev/nowPlaying/nowPlaying.ts:184-196). See m3, m7. |
| HY-22 | changed, doc | `nowPlaying.current`, `nowPlaying.elapsed`, `nowPlaying.supports()`, `volume.level/available/mode` | `storeAlbumId` is a string or null instead of a bigint. |
| HY-23 | changed, doc | `artwork.get(600)` (dev/artwork/artwork.ts:13-15); `fetchAnimatedArtwork` from `/catalog` | See m9. |
| HY-24 | changed, doc | `playback.*` (dev/playback/playback.ts:18-66) | `seekTo` becomes `seek`; SendCommandError kept. |
| HY-25 | changed, doc | `volume.set/up/down`, `remote.press('mute')` (HID 0xE2) | Same bytes. |
| HY-26 | changed, doc | `tv.supports('power')`, `power.wake()/sleep()` (dev/power/power.ts:36-42) | Same HID usages. |
| HY-27 | changed, doc | `remote.press(key)` (dev/remote/remote.ts:24-55, dev/remote/keys.ts:8-30) | All 19 keys map to the same AirPlay HID usages; throws `UnavailableError` instead of TypeError. |
| HY-28 | changed, doc | `remote.press('screensaver' / 'siri')`, `press('home', {mode: 'hold'})`, `press('select', {mode: 'double'})` | Same CL frames when CL is up; hold falls back to AirPlay 1000 ms when CL is down. |
| HY-29 | changed, doc | `tv.apps`, `tv.accounts` (dev/apps/apps.ts, dev/accounts/accounts.ts) | `accountId` becomes `id`. |
| HY-30 | changed, doc | `tv.supports('playUrl')`, `media.playUrl(url)`, `.ended` | |
| HY-31 | changed, doc | `media.streamAudio(source, {volume})`, `.ended` (dev/media/media.ts:10-16, :120-154) | Same dB curve as the Homey helper. |
| HY-32 | kept |  | New `UnavailableError`; still nothing load-bearing. |
| HY-33 | kept |  | |
| HY-34 | changed, doc | dev/lifecycle/link.ts | Independent links per protocol; intentional teardown never yields `recovering`. |

## Corrections to the inventory

### Section 5 (fix history)

All 64 commit hashes exist in the baseline and match their description; every fix is present at 5286829. Corrections:

- **FX-18**: three references are wrong. `featuresEx` base64 LE decoding is in `ap/features.ts:3-21`, not `ap/protocol.ts:212` (that line only calls `parseReceiverFeatures`). Atomic storage (temp file plus `renameSync`) is `cm/storage.ts:230-233`; `:211` is schema validation. RTSP parse limits are `rt/encoding.ts:1-2`, `CSeq` normalization `rt/encoding.ts:209`; `:176` builds the `Response`.
- **FX-29**: d569277 moved the `exchange(deviceInfo)` inside the race promise in the old `packages/devices`; 954ab0a added `onBeforeConnect` (`ap/protocol.ts:383`). The handler registration in the DataStream constructor (`ap/dataStream.ts:123-125`) came from refactor 59c9983, not from either fix.
- **FX-30**: the request flags are on `ap/dataStreamMessages.ts:235-238`; `:224` is the function signature.
- **FX-32**: e6a4870 and 053ae13 add a try/catch and the `writable` check; emitting `ConnectionClosedError('Cannot write to a disconnected connection.')` came with the error hierarchy in 05ac796 (`cm/connection.ts:223-224`).
- **FX-35**: the guard rejects packets under 24 bytes, not 32 (`en/ntp.ts:48`); the timing server catches the `RangeError` (`cm/timing/ntp.ts:124`).
- Minor line notes, claims correct: FX-05 limits are constants at `en/plist.ts:22-23`; FX-14 public text input starts at `sdk/internal/airplay-remote.ts:415-422`; FX-19 default of -20 dB at `sdk/internal/airplay-manager.ts:463`; FX-28 15000 ms at `sdk/internal/companion-link-manager.ts:576`.

### Section 7 (Homey)

Checked against baseline 5286829 (equal to the installed `@basmilius/apple-sdk` 0.15.2) and Homey `src/`.

- **HY-04**: "no retry at that point" holds only for the immediate reaction. `#setupRecovery` runs before `connect()` (H:src/apple-tv/device.ts:142, H:src/homepod-base/device.ts:112) and `ConnectionRecovery` starts its `reconnectInterval` in its constructor (`cm/recovery.ts:63`), so a failed first connect is retried by the 15-minute interval.
- **HY-05**: the device-level emit is `sdk/device/apple-tv.ts:108` and `sdk/device/homepod.ts:30` (`device.ts:62` only forwards). The HomePod calls `setAvailable()` unconditionally plus `#stopSlowRecovery()` (H:src/homepod-base/device.ts:129-133); only the Apple TV checks `tv.isConnected` (H:src/apple-tv/device.ts:210). Because AirPlay `connected` fires before Companion Link connects, in practice the CL `connected` handler makes the Apple TV available (H:src/apple-tv/device.ts:252).
- **HY-07**: an explicit CL disconnect emits nothing at all (listener removed first, `sdk/internal/companion-link-manager.ts:199`); `disconnected(true/false)` are at `:644`/`:646`.
- **HY-11**: non-awaited calls are at H:src/apple-tv/device.ts:103, :129, :394, :513 and H:src/homepod-base/device.ts:92, :156, :191, :260, H:src/homepod-base/pairing.ts:89; the awaited one at H:src/apple-tv/device.ts:300. `AppleTV.disconnect()` itself starts `companionLink.disconnectSafely()` without awaiting (`sdk/device/apple-tv.ts:103`).
- **HY-12**: the dedupe rules differ. AirPlay `connect()` returns the in-flight promise (`sdk/internal/airplay-manager.ts:200`); CL `connect()` also returns at once when already connected (`sdk/internal/companion-link-manager.ts:132`). In `#reconnectAirPlay` (H:src/apple-tv/device.ts:394-398) `disconnectSafely()` aborts a running connect and the following `connect()` gets that failing promise back.
- **HY-14**: slow recovery starts from three places, not only after `failed`: AirPlay `failed` (H:src/apple-tv/device.ts:290), the CL failure path (`:453`), and a `tv.connect()` that succeeds without a CL object (`:154-156`). The flow trigger at attempt 15 fires only if CL is still not connected (`:368`). A failed AirPlay reconnect inside an attempt skips the CL step of that attempt (`:344-363`).
- **HY-15**: starts only from `failed` (H:src/homepod-base/device.ts:167-171); the first attempt follows after 900000 ms; each attempt does `disconnectSafely`, `findService`, `airplay.connect`; there is no guard against a double start (`:174-177`).
- **HY-16**: returns at once when a slow-recovery timer already runs (H:src/apple-tv/device.ts:426); the retry flag resets on CL `connected` (`:249`) and on restart (`:512`).
- **HY-17**: the CL builder is at H:src/apple-tv/device.ts:164-199. Missing from the item: the AirPlay side does the same (unicast path H:src/base/discoverableDevice.ts:136-169, `convertDiscoveryResult` H:src/utils/convertDiscoveryResult.ts:4-20 with `fqdn = id`, `port = Number(result.port)`, `packet: null`, `familyName: null`), which feeds the AppleTV/HomePod constructors and pairing.
- **HY-19**: start/abort at H:src/apple-tv/pairing.ts:124-135, pin/end at `:77-78`, storage at `:80-87`. A failed `pin()` is not followed by `abort()`. The read side is H:src/utils/getAccessoryCredentialsFromDevice.ts:5-18.
- **HY-21**: `volumeChanged` is debounced 300 ms too (H:src/logic/airplay.ts:325-331). `nowPlayingChanged` uses its `client` argument: null clears now playing (`:275`) and the client fields form the animated-artwork track key (`:267`); only after that does it re-read `activeClient`. `playbackStateChanged` uses `client.bundleIdentifier/displayName` (`:290`) and sets `speaker_playing` without debounce.
- **HY-22**: `sdk/controller/state.ts:33` is `title`, which the app does not read. Correct lines: `elapsedTime` :73, `shuffleMode` :93, `repeatMode` :97, `volume` :118, `volumeAvailable` :126, `activeClient` :156, `isCommandSupported` :166. The app reads `activePlayer` through `client.activePlayer` (H:src/logic/airplay.ts:416, :570), not `state.activePlayer`.
- **HY-27**: a TypeError only happens before the first session. After a disconnect `protocol.dataStream` still exists (destroyed, not undefined); HID then goes to `Connection.write` on a closed socket (`cm/connection.ts:222`), which emits an error event instead of throwing.
- **HY-28**: the app calls `CompanionLinkManager.pressButton` (`sdk/internal/companion-link-manager.ts:317`), which delegates to `cl/protocol.ts:268`. The flow guards are at H:src/apple-tv/flow.ts:233-249.
- **HY-30**: `playUrl` itself is `sdk/internal/airplay-manager.ts:369`; `:84` is only `supportsUrlPlayback`. Volume is only set when the argument is given and the device has `volume_set` (H:src/apple-tv/device.ts:575).
- **HY-31**: when a volume is given the app first calls `volume.set(volume/100)` (H:src/homepod-base/device.ts:295-297); without one it uses `volume_set ?? 0.5`, times 100, as the dB source (`:300`).
- **HY-34**: `failed` fires again, immediately, on every further `handleDisconnect(true)` without `reset()`, because the attempt counter stays at the maximum (`cm/recovery.ts:135`). After `failed` the reconnect interval stays stopped (`:89`) until `reset()`.

Homey usages that no HY item covers (all have an equivalent in the new API; listed so the migration does not miss them):

- `isConnected` semantics that recovery relies on (`airplay.isConnected` needs `#ready` plus all three streams, `sdk/internal/airplay-manager.ts:91-96`), read at H:src/apple-tv/device.ts:347, :351, :368, :373 and H:src/homepod-base/device.ts:199. Equivalent: `status.airplay.state`, `status.companionLink.state`.
- `StateController` listeners are attached once in `setDevice` and removed with `.off` (H:src/logic/airplay.ts:242-264); this needs the same `state` instance across reconnects. Equivalent: `nowPlaying` and `volume` are per device and outlive sessions (dev/device/device.ts:106-112).
- Proto enums: `RepeatMode_Enum.Off/One/All` (H:src/utils/repeatMode.ts:1-19), `ShuffleMode_Enum.Songs/Off/Unknown` (H:src/apple-tv/device.ts:501, H:src/logic/airplay.ts:81-82), `PlaybackState_Enum.Playing` (`:289`), `Command.NextTrack/PreviousTrack/ChangeRepeatMode/ChangeShuffleMode` (`:593-596`, `:639-642`), `VolumeCapabilities_Enum.Absolute/Both` (`:618`). Equivalent: string unions in dev/types.ts:116-118, :163-175, :186.
- Type and constant imports: `AbstractDevice`, `AirPlayClient`, `AirPlayPlayer` (H:src/logic/airplay.ts:1), `PairingSession` (H:src/apple-tv/pairing.ts:2), `AccessoryCredentials`, `DiscoveryResult`, `MdnsService`, and `AIRPLAY_SERVICE`/`COMPANION_LINK_SERVICE`, which are also Homey store keys and mDNS types (H:src/apple-tv/device.ts:54, :83, :168, :191). Equivalent: `AppleDevice`, `NowPlaying`, `Pairing`, `Credentials`, `DeviceTarget`; the service constants are no longer exported from devices, so Homey has to keep its own strings for its store keys.
- `ConnectionRecovery` `recovering(attempt)` events, used for logging only (H:src/apple-tv/device.ts:283, :313, H:src/homepod-base/device.ts:163). Equivalent: `status.airplay.attempt` / `phase`.
- `TimingServer` constructor, `listen()`, and the `SERVER=ws://...` environment switch that disables it (H:src/index.ts:19-22, :29-35). Equivalent: `timing: false` per device, shared server otherwise.
