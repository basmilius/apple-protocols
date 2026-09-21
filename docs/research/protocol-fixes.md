# Protocol fixes and validation

Worktree: `/private/tmp/apple-protocols-fixes`, branch `fix/protocol-validation`, based on `a10898cacb7bbcf45560daca8656cb2358cd26a3`. The existing stream-volume fix and disabled PTP default are preserved. The fixes were merged into main as `d4938ea` on 21 September 2026. Nothing has been pushed, published or installed on Homey.

## Changes

| Area | Fixed behavior |
| --- | --- |
| RTSP / HTTP | Preserve `CSeq` when replying to events; reject malformed/conflicting Content-Length and oversized messages; create valid bodyless Fetch responses for 204/205/304. Close a stream after a parser/decryption failure. |
| TLV8 | Reject truncated headers and values before allocating/copying pairing data. |
| AirPlay DataStream | Process exact 32-byte ACK frames and empty sync frames. Transport ACKs no longer complete unrelated protobuf requests. Reject invalid frame sizes and malformed/truncated length prefixes. Eight-byte protobuf messages are no longer mistaken for the legacy bare format. |
| AirPlay features | Decode `featuresEx` as Apple's base64 little-endian full feature vector. Preserve integer precision and encode the full legacy 64-bit mask plus extended vector in SETUP. |
| Audio | Advertise 16-bit PCM matching the actual stream; route encoded URL audio through the shared decoder, including FLAC and QOA; flush whole FLAC files; decode only the supplied buffer slice and accept ArrayBuffer input. |
| Discovery | Read hexadecimal status flags from either `sf` or `flags`, including unprefixed values. |
| Companion Link | A failed interest registration does not prevent later registrations. Accept numeric-string power states and preserve the previous state on malformed updates. |
| Credential storage | Write a private temporary file (0600) and atomically rename it. Validate stored structure before replacing in-memory data. This does not add multi-process locking or crash-durable fsync. |

The feature-vector correction follows the extracted AirPlaySupport/AirPlayReceiver code from macOS 27.2. The binary plist generated for the sender was also accepted by Apple's `plutil`, retaining integer `2041620749713656320` and extended value `AMq/QEFLVRw=`.

## Compatibility changes to review

- `Url.fromUrl(url)` now rejects unrecognized encoded content instead of playing it as PCM. Intentional raw PCM callers must use `Url.fromUrl(url, {format: 'pcm'})`; the PCM format remains 44.1 kHz, signed 16-bit big-endian stereo.
- Strict parsers close malformed streams instead of attempting to continue at an uncertain byte boundary. RTSP headers are capped at 64 KiB; RTSP bodies and DataStream frames at 16 MiB.
- Invalid storage schemas and imprecise numeric feature masks now fail explicitly. Valid existing storage uses the unchanged version-1 schema.
- The corrected SETUP feature representation and PCM format have not been exercised on a physical Apple TV or HomePod during this work.

## Validation

- Before removal, 37 tests passed on Bun 1.4.0 and Node 26.7.0. The former runner built the nine library packages first, then ran both runtimes. Tests cover malformed inputs, fragmented/coalesced packets, ACK-versus-response correlation, all feature bits through bit 98, codec decoding and storage reloads.
- All nine library typechecks/builds pass. Diagnostics web build and all five CLI target builds pass after downloading missing dependencies and the Windows Bun runtime. The original `bash build.sh` run stopped at sandbox network restrictions; the remaining web/build steps were rerun successfully with network access.
- In `/private/tmp/apple-homey-validation`, the Homey source and dependencies were copied, then all nine local library `dist` directories substituted. Both `bun run build` and `homey app build` pass, including Homey's debug-level validation. The original Homey installation was not changed. This checks source/API compatibility; it is not a test on Homey's Node runtime or hardware.
- No live device commands, pairing attempts or playback tests were performed. Before merging, check pairing/reconnect, power pushes and short URL playback on the existing Homey devices.

The automated tests and their runner were subsequently removed at the project owner’s request; the results above describe validation before removal. Large build logs and reverse-engineering artifacts are under ignored `.research/`; the Intercom conclusions are recorded separately in `intercom-macos-27.2.md`.

## Validation after merging into main

Main also contains the Electron diagnostics rewrite from `b48b78f`. The merge only needed a `.gitignore` resolution: keep the Electron output ignores and add an ignore for temporary test output, subsequently removed along with the test runner.

Rebuilding against main's tooling exposed a declaration compatibility issue: generated declarations no longer included the Node type reference that the earlier worktree build emitted. Each library entry point now explicitly preserves its Node reference, so TypeScript 6 consumers resolve Node globals and EventEmitter types. No Homey configuration change was needed.

After that correction, all 37 tests pass on both runtimes, the nine libraries build, the Electron diagnostics typecheck/build passes, and the isolated Homey copy passes both `bun run build` and `homey app build` again. Current logs are in `.research/ios-simulator-intercom/merge-*.log` and `/private/tmp/apple-homey-merge-validation.log`.
