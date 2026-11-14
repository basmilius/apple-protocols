# Behavior inventory: production baseline (5286829)

Paths: `ap/` packages/airplay/src, `cm/` packages/common/src, `cl/` packages/companion-link/src, `sdk/` packages/sdk/src, `rt/` packages/rtsp/src, `ro/` packages/raop/src, `en/` packages/encoding/src, `as/` packages/audio-source/src, all relative to the baseline worktree. `H:` is the Homey app root (~/Development/Projects/homey/com.basmilius.apple). `(unclear)` means intentional or accidental is not certain.

## 1. Handshake sequences

### 1a. AirPlay remote-control connection (`AirPlayManager.connect`)

- [ ] `AP-HS-01` `sdk/internal/airplay-manager.ts:199` Concurrent `connect()` calls share one in-flight promise (`#connecting`); cleared in `finally`.
- [ ] `AP-HS-02` `sdk/internal/airplay-manager.ts:211` If a session is up (`#disconnect === false`), `connect()` first calls `disconnect()`, which emits `disconnected(false)`, then builds a fresh session. A second `connect()` on a live device is a full teardown plus reconnect.
- [ ] `AP-HS-03` `sdk/internal/airplay-manager.ts:215` Before any I/O: `#disconnect=false`, `#ready=false`, `state.clear()` (all now-playing, volume, cluster state wiped at connect, not at disconnect).
- [ ] `AP-HS-04` `sdk/internal/airplay-manager.ts:219` A new `Protocol` (new Context, new session UUID upper-case, new ControlStream with new Active-Remote/DACP-ID/session id) per connect. Close/error/timeout listeners on the control stream are attached before TCP connect.
- [ ] `AP-HS-05` `sdk/internal/airplay-manager.ts:225` `assertCurrent()` after every await: if protocol replaced or `#disconnect` set, `protocol.disconnect()` and throw `ConnectionClosedError('AirPlay setup was interrupted.')`.
- [ ] `AP-HS-06` `ap/protocol.ts:185` Step 1: TCP connect to `discoveryResult.address:service.port` (default port 7000 if built from `address`, `sdk/device/device.ts:40`). Uses Connection retry (TM-01).
- [ ] `AP-HS-07` `ap/protocol.ts:198` Step 2: plaintext `GET /info` (exchange, 6000 ms). Non-200 does NOT throw: logs warn and returns `{}`; features stay 0. Parses `features`/`featuresEx`, logs `initialVolume`.
- [ ] `AP-HS-08` `ap/protocol.ts:224` If our `sourceVersion` (935.7.1, `cm/context.ts:25`) is higher than the receiver's, the SETUP bodies use the receiver's version (`#effectiveSourceVersion`). `User-Agent` keeps ours (`ap/controlStream.ts:77`).
- [ ] `AP-HS-09` `sdk/internal/airplay-manager.ts:238` Step 3a with credentials: pair-verify M1, M3 over `POST /pair-verify` (`Content-Type: application/octet-stream`, `X-Apple-HKP: 3`, `ap/pairing.ts:185`). Plaintext.
- [ ] `AP-HS-10` `sdk/internal/airplay-manager.ts:241` Step 3b without credentials: transient pairing (TP-HS-*). HomePod always goes here; Apple TV only when credentials missing.
- [ ] `AP-HS-11` `ap/pairing.ts:160` Control keys: HKDF-SHA512(sharedSecret, salt `Control-Salt`, read info `Control-Read-Encryption-Key` -> `accessoryToControllerKey`, write info `Control-Write-Encryption-Key` -> `controllerToAccessoryKey`).
- [ ] `AP-HS-12` `sdk/internal/airplay-manager.ts:740` Step 4: `controlStream.enableEncryption(accessoryToControllerKey, controllerToAccessoryKey)`. Every RTSP request after this is ChaCha20 framed (QK-04).
- [ ] `AP-HS-13` `sdk/internal/airplay-manager.ts:747` If a TimingServer is set (global via `configure()` or option), `protocol.useTimingServer()` before SETUP; affects `timingProtocol` (AS-HS-03).
- [ ] `AP-HS-14` `ap/protocol.ts:487` Step 5: `SETUP /<sessionId>` (exchange) body = `#setupBody(pairingId, SENDER_FEATURES_REMOTE_CONTROL)` + `isRemoteControlOnly: true` + timing fields. Body: `deviceID`=pairingId string, features encoded, `macAddress` upper-case, `model`, `name`, `osBuildVersion`, `osName`, `osVersion`, `sourceVersion` (capped), `sessionUUID`, `sessionCorrelationUUID` (same UUID) (`ap/protocol.ts:460`). Non-200 throws `SetupError` (`ap/protocol.ts:398`).
- [ ] `AP-HS-15` `ap/protocol.ts:496` `eventPort & 0xFFFF` from SETUP plist; any old event stream destroyed; new EventStream keys derived (QK-01), then TCP connect to event port, THEN `RECORD /<sessionId>` (exchange, status not checked) (`ap/protocol.ts:504-505`).
- [ ] `AP-HS-16` `sdk/internal/airplay-manager.ts:760` After event stream: if disconnect requested or protocol replaced, `protocol.disconnect()` + throw. Close listener on event stream attached (`#observeClose`, throws if stream already closed, `:666`).
- [ ] `AP-HS-17` `ap/protocol.ts:356` Step 6: second `SETUP /<sessionId>` with `streams:[{controlType:2, channelID:UUID, seed:randomInt64, clientUUID:UUID, type:130, wantsDedicatedSocket:true, clientTypeUUID:'1910A70F-DBC0-4242-AF95-115DB30604E1'}]`. Non-200 throws `SetupError('Failed to setup data stream.')`.
- [ ] `AP-HS-18` `ap/protocol.ts:377` `dataPort & 0xFFFF`; DataStream keys: HKDF salt `DataStream-Salt<seed decimal>`, read `DataStream-Input-Encryption-Key`, write `DataStream-Output-Encryption-Key` (`ap/dataStream.ts:317`). Encryption enabled before TCP connect.
- [ ] `AP-HS-19` `ap/protocol.ts:383` `onBeforeConnect` callback runs after DataStream construction, BEFORE its TCP connect: state tracker subscribes there so no early DEVICE_INFO/SET_STATE is missed (`sdk/internal/airplay-manager.ts:765`).
- [ ] `AP-HS-20` `sdk/internal/airplay-manager.ts:774` Data stream `error`/`timeout`/`setConnectionState` and event stream `error`/`timeout` handlers bound after data connect; previous streams' handlers removed first (`:753`).
- [ ] `AP-HS-21` `sdk/internal/airplay-manager.ts:787` Feedback interval (2000 ms) starts BEFORE the MRP messages.
- [ ] `AP-HS-22` `sdk/internal/airplay-manager.ts:789` MRP 1: `DEVICE_INFO_MESSAGE` via `exchange` (5000 ms), waits for reply matched by identifier. Fields (`ap/dataStreamMessages.ts:73`): uniqueIdentifier=pairingId, name, localizedModelName `iPhone`, systemBuildVersion, applicationBundleIdentifier `com.apple.TVRemote`, applicationBundleVersion `700`, protocolVersion 1, lastSupportedMessageType 139, supportsSystemPairing, allowsPairing, systemMediaApplication `com.apple.TVMusic`, supportsACL, supportsSharedQueue, supportsExtendedMotion, sharedQueueVersion 3, deviceClass iPhone, logicalDeviceCount 1, modelID, clusterType 0, isClusterAware true, isGroupLeader false, isProxyGroupPlayer false, groupContainsDiscoverableGroupLeader 0, supportsOutputContextSync true, computerName. Timeout fails the whole connect.
- [ ] `AP-HS-23` `sdk/internal/airplay-manager.ts:790` MRP 2: `SET_CONNECTION_STATE(Connected)` via `send`.
- [ ] `AP-HS-24` `sdk/internal/airplay-manager.ts:791` MRP 3: `CLIENT_UPDATES_CONFIG(artwork=true, nowPlaying=true, volume=true, keyboard=true, outputDevice=false, systemEndpoint=true, subscribedPlayerPaths=[])` via `send` (`ap/dataStreamMessages.ts:25`).
- [ ] `AP-HS-25` `sdk/internal/airplay-manager.ts:793` MRP 4: `GET_STATE` via `send`, never `exchange`: "device answers with unidentified SET_STATE pushes".
- [ ] `AP-HS-26` `sdk/internal/airplay-manager.ts:796` `#lastArtworkId=null` and `nowPlayingChanged` listener for artwork prefetch attached last (ST-20).
- [ ] `AP-HS-27` `sdk/internal/airplay-manager.ts:249` After setup: all three of control/data/event `isConnected` must be true, else `ConnectionClosedError('An AirPlay stream closed during setup.')`. Then `#ready=true`, then `emit('connected')` (`:260`).
- [ ] `AP-HS-28` `sdk/internal/airplay-manager.ts:253` Any failure in connect: if still current protocol, `disconnectSafely()` -> `#endSession(false)` -> emits `disconnected(false)` even though `connected` never fired; error rethrown to caller.
- [ ] `AP-HS-29` `sdk/internal/airplay-manager.ts:800` Failure inside `#setup`: clears feedback interval, `protocol.disconnect()`, rethrow.
- [ ] `AP-HS-30` `ap/dataStream.ts:113` DataStream outgoing seqno starts at `0x100000000 + randomInt32`; header 32 bytes: u32 BE total length, `sync`, 8 zero, `comm`, u64 BE seqno, u32 0 (`ap/utils.ts:37`). Payload is plist `{params:{data: varint(len)+protobuf}}` (`ap/dataStream.ts:271-281`); protobuf written with `writeUnknownFields:true`.

### 1b. AirPlay URL playback (`AirPlayManager.playUrl`)

- [ ] `UP-HS-01` `sdk/internal/airplay-manager.ts:370` Throws `Error('Not connected. Call connect() first.')` if no keys from a prior main connect.
- [ ] `UP-HS-02` `sdk/internal/airplay-manager.ts:375` Any previous URL protocol is `disconnect()`ed (not `stopPlayUrl`); a separate `Protocol` is created, as pyatv does, so the remote-control session stays untouched.
- [ ] `UP-HS-03` `sdk/internal/airplay-manager.ts:379` Order: TimingServer attached, TCP connect, `GET /info` (plaintext), verify (credentials) or transient (`pairing.start` + `transient`), `controlStream.enableEncryption(a2c, c2a)`.
- [ ] `UP-HS-04` `sdk/internal/airplay-manager.ts:387` PTP master never attached: "PtpMaster yields silent playback on PTP-capable receivers, the NTP timing server does not".
- [ ] `UP-HS-05` `ap/protocol.ts:560` Throws `PlaybackError` if receiver lacks VideoV1, VideoV2 and VideoPlayQueue features (HomePod).
- [ ] `UP-HS-06` `ap/protocol.ts:567` SETUP body = setupBody(SENDER_FEATURES_AUDIO) + `groupContainsGroupLeader:false, groupUUID:uuid() (lower-case here), isMultiSelectAirPlay:true, senderSupportsRelay:false, statsCollectionEnabled:false, supportsGroupCohesion:true, updateSessionRequest:false` + timing. Non-200 -> `SetupError`.
- [ ] `UP-HS-07` `ap/protocol.ts:587` Event stream connect on `eventPort`, then feedback loop starts (2000 ms) BEFORE RECORD.
- [ ] `UP-HS-08` `ap/protocol.ts:597` Second `GET /info`, now encrypted, between SETUP and RECORD (pyatv #2948); failure only logged.
- [ ] `UP-HS-09` `ap/protocol.ts:605` `RECORD /<sessionId>`.
- [ ] `UP-HS-10` `ap/protocol.ts:639` Play-queue path chosen when receiver has VideoPlayQueue or VideoV2 and an event stream exists; else legacy `/play`.
- [ ] `UP-HS-11` `ap/playQueue.ts:148` Play queue: SETUP `streams:[{type:130, controlType:1, channelID:'<MAC>-RCS-1', clientUUID, clientTypeUUID:'A6B27562-B43A-4F2D-B75F-82391E250194'}]`; on non-200 or no `streamID` retries with `<MAC>-RCS-2`.
- [ ] `UP-HS-12` `ap/playQueue.ts:175` Commands via `POST /command` over HTTP/1.1 with `X-Apple-Session-ID:<sessionUUID>`, `X-Apple-StreamID`, body `{params:{data:<bplist>}}` (`ap/controlStream.ts:129`): `insertPlayQueueItem` (>=400 -> fallback), then `setProperty isInterestedInDateRange=true (item uuid)`, `setProperty actionAtItemEnd=1`, `setRate rate=1`; each checked for HTTP ok and nested `errorCode==0`.
- [ ] `UP-HS-13` `ap/protocol.ts:656` Play queue failure on VideoV2-without-VideoV1 receivers throws "receiver does not support /play" ("LG and Samsung answer /play with 404"); otherwise falls back to `/play`.
- [ ] `UP-HS-14` `ap/protocol.ts:675` Legacy: `POST /play` plist `{Content-Location, Start-Position-Seconds, uuid, streamType:1, mediaType:'file', volume:1.0, rate:1.0, clientBundleID:'com.basmilius.apple-protocols', clientProcName, osBuildVersion, model, SenderMACAddress}`. 500 -> wait 1000 ms and retry, max 3 attempts; other >=400 throws `PlaybackError` immediately.
- [ ] `UP-HS-15` `ap/protocol.ts:715` After 200: `PUT /setProperty?isInterestedInDateRange {value:true}`, `PUT /setProperty?actionAtItemEnd {value:0}`, `POST /rate?value=1.000000`, `PUT forwardEndTime` and `reverseEndTime` with `{flags:0,value:0,epoch:0,timescale:0}`.
- [ ] `UP-HS-16` `ap/protocol.ts:613` Any failure after RECORD: close play queue, stop feedback, `TEARDOWN /<sessionId>` (failure logged), rethrow. In the manager the URL protocol is disconnected only if it was not yet stored (`sdk/internal/airplay-manager.ts:408`).
- [ ] `UP-HS-17` `ap/protocol.ts:763` `waitForPlaybackEnd`: play queue waits for `itemPlayedToEnd`, `stopped` after start, or close-after-start; legacy polls `GET /playback-info` every 1000 ms, needs a `duration` first, then 5 consecutive responses without duration = ended; null response (error/non-ok) = ended; `error` field throws `PlaybackError`.
- [ ] `UP-HS-18` `ap/protocol.ts:728` Play queue `getPlaybackInfo` answers from the last `playing` event (GET /playback-info returns 500 on tvOS 26, 403 on tvOS 27), extrapolating position by rate, clamped to duration.
- [ ] `UP-HS-19` `ap/playQueue.ts:371` FCUP `unhandledURL` requests answered by fetching the URL ourselves: http/https only (else 403 + fail), FairPlay key request -> 501 + fail, fetch error -> 502 + fail; non-HLS body only warned. Limits TM-24.

### 1c. AirPlay audio streaming (`AirPlayManager.streamAudio`)

- [ ] `AS-HS-01` `sdk/internal/airplay-manager.ts:468` Previous stream cleaned up first; new dedicated Protocol + `AudioSourceSession`; every step wrapped in `checked()` which throws `ConnectionClosedError('Audio stream cancelled.')` if a newer stream replaced this one.
- [ ] `AS-HS-02` `sdk/internal/airplay-manager.ts:487` Order: TCP connect, `GET /info`, verify or transient, enable control encryption, `setupEventStreamForAudioStreaming` (SETUP with UP-HS-06 fields but groupUUID upper-case, event stream connect, RECORD, `ap/protocol.ts:518`).
- [ ] `AS-HS-03` `ap/protocol.ts:429` Timing in SETUP: receiver `SupportsPTP` AND a PtpMaster -> `PTP` + master event port; else TimingServer -> `NTP` + its port; else `None`. SDK never sets a PtpMaster, so production is NTP (with `configure({timingServer})`) or None.
- [ ] `AS-HS-04` `sdk/internal/airplay-manager.ts:510` `SET_PARAMETER /<sessionId>` `volume: <dB>` (`text/parameters`) after event stream, before audio SETUP: "A fresh AirPlay audio session starts silent". Default `volumeDb=-20` (`sdk/controller/media.ts:60`).
- [ ] `AS-HS-05` `sdk/internal/airplay-manager.ts:512` Feedback interval 2000 ms on the stream protocol; errors swallowed.
- [ ] `AS-HS-06` `ap/audioStream.ts:196` Audio SETUP: bind local UDP control socket (port 0), random 32-byte `shk`, random SSRC; plist `streams:[{audioFormat:0x800 (PCM_44100_16_2), audioMode:'default', controlPort, ct:1 (PCM), isMedia:true, latencyMax:88200, latencyMin:11025, shk, spf:352, sr:44100, streamConnectionID:randomInt64, supportsDynamicStreamID:false, redundantAudio:false, supportsRTPPacketRedundancy:false, type:0x60}]`, explicit `Content-Type: application/x-apple-binary-plist`. Non-200 or no `streams` -> `SetupError`.
- [ ] `AS-HS-07` `ap/audioStream.ts:291` Second `RECORD` after audio SETUP.
- [ ] `AS-HS-08` `ap/audioStream.ts:311` `prepare`: UDP data socket `connect(dataPort, address)`; RTP anchor `rtp=0` <-> `NTP.now()` (wall clock); `FLUSH` with `Range: npt=0-`, `RTP-Info: seq=<rand16>;rtptime=0`; then sync packets start (TM-15).
- [ ] `AS-HS-09` `ap/audioStream.ts:514` RTP: `0x80`, PT 0x60 (marker bit on first packet), seq, ts, SSRC; payload ChaCha20-Poly1305 with key `shk`, nonce 12 bytes with u32 LE counter at offset 4, AAD = header bytes 4..12; trailer = ciphertext + tag + 8 nonce bytes (`:635`).
- [ ] `AS-HS-10` `ap/audioStream.ts:489` EOF: frames padded with silence until `latency` frames (11025 at tier 0) of padding sent, then stop; then `TEARDOWN /<sessionId>`.
- [ ] `AS-HS-11` `sdk/internal/airplay-manager.ts:521` `finally`: stream protocol disconnected, manager cleanup if still current, `session.stop()`. `streamAudio` resolves when the source ends and padding/teardown completed.
- [ ] `AS-HS-12` `ap/protocol.ts:862` One active audio source per Protocol; second `setupAudioStream` throws `PlaybackError('An audio stream is already active.')`.

### 1d. RAOP (`RaopClient`, not used by sdk or Homey)

- [ ] `RA-HS-01` `ro/raop.ts:153` Create: RTSP TCP connect, stream context (random seq/rtptime, latency 88200, volume -20), StreamClient.initialize.
- [ ] `RA-HS-02` `ro/streamClient.ts:140` Initialize: bind control client UDP, `GET /info` (errors swallowed -> `{}`), `POST /auth-setup` (HTTP/1.1, body `0x01 + curve25519 pub`) only if MFiSAP and model `AirPort*` (`:52`), then ANNOUNCE + SETUP.
- [ ] `RA-HS-03` `ro/raop.ts:229` ANNOUNCE (SDP; 401 + password -> digest retry), SETUP `Transport: RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;control_port=<c>;timing_port=<t>`; parse `server_port`, `control_port`.
- [ ] `RA-HS-04` `ro/streamClient.ts:186` sendAudio order: reset context, UDP connect to server_port, control client start, optional `progress`, metadata, artwork `SET_PARAMETER`, feedback loop 2000 ms, emit `playing`, RECORD (`Range`, `Session`, `RTP-Info`), FLUSH (same headers), optional volume via `pctToDbfs`, stream; `finally` TEARDOWN, close, emit `stopped`. Errors wrapped as `Error('An error occurred during streaming.', {cause})`.
- [ ] `RA-HS-05` `ro/rtspClient.ts:8` Default headers `DACP-ID`, `Active-Remote`, `Client-Instance`=DACP-ID, `User-Agent: AirPlay/550.10`; digest `Authorization` once set.
- [ ] `RA-HS-06` `ro/utils.ts:10` `pctToDbfs`: <=0 -> -144, >=100 -> 0, else `20*log10(v/100)`.

### 1e. Companion Link (`CompanionLinkManager.connect`)

- [ ] `CL-HS-01` `sdk/internal/companion-link-manager.ts:129` In-flight dedupe; if already connected and not disconnecting, returns without doing anything (unlike AirPlay AP-HS-02); throws `CredentialsError` if no credentials.
- [ ] `CL-HS-02` `sdk/internal/companion-link-manager.ts:150` Always `await disconnectSafely()` of the previous protocol first (bumps generation); then new `Protocol(discoveryResult)`; close/error/timeout listeners before connect; `check()` after every await throws `Error('Companion Link connect cancelled.')`.
- [ ] `CL-HS-03` `cl/protocol.ts:90` TCP connect to `discoveryResult.address:service.port` (Connection retry TM-01).
- [ ] `CL-HS-04` `cl/pairing.ts:153` Pair-verify: frame 5 (PairVerifyStart) for M1, frame 6 (PairVerifyNext) for M3, OPack `{_pd:<tlv>, _auTy:4}`, exchange timeout 30000 ms; reply matched by pairing queue key -1 (QK-15).
- [ ] `CL-HS-05` `cl/pairing.ts:130` CL keys: HKDF-SHA512 salt `''`, read `ServerEncrypt-main` -> a2c, write `ClientEncrypt-main` -> c2a; `stream.enableEncryption(a2c, c2a)` (`sdk/internal/companion-link-manager.ts:546`).
- [ ] `CL-HS-06` `cl/protocol.ts:179` `_systemInfo` request (exchange, 10000 ms) with `_bf:0, _cf:512, _clFl:128, _i:'b561af32aea6' (hardcoded), _idsID:pairingId, _pubID:'DA:6D:1E:D8:A0:4F', _sf:1099511628032, _sv:'715.2', model:'iPhone16,2', name:'AP Companion Link', _lP:50402, _dC:'1', _stA:[...]` (`cl/messages.ts:52`). Stores `_c._sv` as receiver sourceVersion.
- [ ] `CL-HS-07` `cl/protocol.ts:200` `_sessionStart` (exchange) `{_srvT:'com.apple.tvremoteservices', _sid:<random u32>, _btHP:false}`; session id = `(remote _sid << 32) | local`.
- [ ] `CL-HS-08` `cl/protocol.ts:233` `TVRCSessionStart` (exchange) with `_inUseProc:'tvremoted'`, `_c:{ProtocolVersionKey:'1.2'}`, `_btHP:false`.
- [ ] `CL-HS-09` `sdk/internal/companion-link-manager.ts:560` Optional `switchActiveUserAccount(iCloudAltDSID)` only if `activeUserAccount` set (not set by Homey).
- [ ] `CL-HS-10` `cl/protocol.ts:298` `_touchStart` (exchange) `{_height:1000.0 float, _tFl:0, _width:1000.0 float}`.
- [ ] `CL-HS-11` `cl/protocol.ts:344` `_tiStart` (exchange) `{_tiV:1}`.
- [ ] `CL-HS-12` `sdk/internal/companion-link-manager.ts:570` Heartbeat NoOp every 15000 ms starts here.
- [ ] `CL-HS-13` `sdk/internal/companion-link-state.ts:131` New `CompanionLinkState` per connect; stream listeners `_iMC`, `SystemStatus`, `TVSystemStatus`, `NowPlayingInfo`, `SupportedActions`, `_tiStarted`, `_tiStopped`; then one `_interest {_regEvents:[event]}` event frame (send) per event, each in its own try/catch.
- [ ] `CL-HS-14` `sdk/internal/companion-link-state.ts:182` `fetchInitialState`: `FetchAttentionState` exchange (failure only warned) and emits `attentionStateChanged` unconditionally (fires device `power` on every connect); then `FetchMediaControlStatus` exchange (failure warned).
- [ ] `CL-HS-15` `sdk/internal/companion-link-manager.ts:172` `emit('connected')` after everything; any failure: `disconnectSafely()` (or `stream.destroy()` if generation moved) and rethrow.
- [ ] `CL-HS-16` `cl/protocol.ts:802` Every `#exchange`: reply must be an object; `_em` present or `_ec` non-zero throws `CommandError('<_i>: <_em|Command failed> (<_ed> <_ec>)')`.
- [ ] `CL-HS-17` `cl/stream.ts:151` Every OPack frame gets `_x` = sized 8-byte integer from a counter starting at `randomInt(0, 65536)`; `exchange` captures `_x` before `sendOPack` increments it.
- [ ] `CL-HS-18` `cl/stream.ts:115` Frame header: 1 byte type, 3 byte BE length (payload + 16 tag when encrypted); header is AAD; nonce 12 bytes, u64 LE counter at offset 0. NoOp (type 1) is never encrypted.
- [ ] `CL-HS-19` `cl/protocol.ts:254` HID button: `_hidC {_hBtS: 1 down | 2 up, _hidC:<id>}` via exchange. `pressButton`: SingleTap = down, up; DoubleTap = down, up, down, up (no delay); Hold = down, wait `holdDelayMs` (default 500), up.
- [ ] `CL-HS-20` `cl/protocol.ts:365` Text input: serialized queue; each op does a fresh `_tiStart` exchange, decodes `_c._tiD` RTI session (throws "No active text input session." if missing), then `_tiC` events (send): clear op if requested, insert op if text non-empty. Generation bumped on `_tiStopped`, UUID change and close, failing queued ops.
- [ ] `CL-HS-21` `sdk/internal/companion-link-manager.ts:390` Touch goes through `_hidT` (finger 1-based, 0..1000). `tap()` = `pressButton('Select','SingleTap')` or `Hold` with holdMs. `swipe`: Began, `max(4, floor(d/50))` Moved steps with `waitFor(d/steps)`, Ended at end point (default 200 ms).

### 1f. PIN pairing (AirPlay, `PairingSession`)

- [ ] `PP-HS-01` `sdk/pairing/pairing-session.ts:33` `start()`: new Protocol, TCP connect, `GET /info`, Ed25519 keypair generation, `POST /pair-pin-start` (`X-Apple-HKP: 3`, octet-stream). Non-200 throws `PairingError` (`ap/pairing.ts:101`). The PIN appears on screen now.
- [ ] `PP-HS-02` `sdk/pairing/pairing-session.ts:46` `pin(code)`: M1 `{Method:PairSetup, State:M1}` sent only now, then SRP (user `Pair-Setup`, PIN), M3 `{State:M3, PublicKey, Proof}`, verify server proof, M5 encrypted (`PS-Msg05`, sign salt/info `Pair-Setup-Controller-Sign-*`, inner Name = OPack `{name:'basmilius/apple-protocols'}`), M6 decrypt (`PS-Msg06`) + verify accessory signature. All `POST /pair-setup` with `X-Apple-HKP: 3`.
- [ ] `PP-HS-03` `ap/pairing.ts:113` pair-setup/pair-verify HTTP status is not checked; TLV `Error` tag causes `TLV8PairingError` (BackOff tag -> "Device is busy, try again in N seconds.") (`en/tlv8.ts:101`).
- [ ] `PP-HS-04` `sdk/pairing/pairing-session.ts:72` `end()` returns credentials `{accessoryIdentifier (string), accessoryLongTermPublicKey, pairingId (UUID upper-case bytes), publicKey, secretKey}` and disconnects. A failed `pin()` does NOT disconnect; caller must `abort()`.
- [ ] `PP-HS-05` `sdk/device/apple-tv.ts:93` The AirPlay PIN credentials are reused unchanged for Companion Link pair-verify. No separate CL pairing in the Homey flow.
- [ ] `PP-HS-06` `cm/pairing.ts:466` Pair-verify M2 rejects with `AuthenticationError` if the accessory identifier differs from the stored one, or the signature fails.

### 1g. Transient pairing (HomePod, Apple TV without credentials)

- [ ] `TP-HS-01` `ap/pairing.ts:82` `POST /pair-pin-start` with `X-Apple-HKP: 4` first (non-200 throws).
- [ ] `TP-HS-02` `cm/pairing.ts:131` M1 with `Flags = TransientPairing`, SRP with PIN `3939` (`cm/const.ts:14`), M3, verify M4 proof; no M5/M6; keys from SRP K with `Control-Salt` (AP-HS-11). pairingId is a fresh UUID per `AccessoryPair`.
- [ ] `TP-HS-03` `ap/pairing.ts:113` All transient pair-setup requests carry `X-Apple-HKP: 4`.

## 2. Timers, timeouts, intervals, retries, delays

- [ ] `TM-01` `cm/connection.ts:87` Connection connect retry: 3 attempts, 3000 ms apart, on socket error or timeout while connecting. Exhausted -> state `failed`, original `connect()` promise rejects with the last error.
- [ ] `TM-02` `cm/connection.ts:253` Socket idle timeout 30000 ms (`SOCKET_TIMEOUT`) only while connecting; set to 0 after connect (`:363`).
- [ ] `TM-03` `cm/connection.ts:362` TCP keepalive on, initial delay 10000 ms; probe count/interval left to the OS (unclear how fast a dead peer is noticed).
- [ ] `TM-04` `cm/connection.ts:252` `setNoDelay(true)` on every socket.
- [ ] `TM-05` `cm/connection.ts:349` A connected socket that closes with `hadError` schedules a TCP reconnect (TM-01 delay) if retry still enabled; managers prevent it by destroying synchronously in their close handler (unclear for streams nobody observes).
- [ ] `TM-06` `cm/const.ts:17` RTSP request timeout `HTTP_TIMEOUT` 6000 ms (all ControlStream GET/POST/PUT/SETUP/RECORD/TEARDOWN); fires `TimeoutError('No response to CSeq N (path)')`, request removed, socket untouched.
- [ ] `TM-07` `ap/protocol.ts:313` `/feedback` timeout 1900 ms ("slightly less than the 2s interval").
- [ ] `TM-08` `sdk/internal/const.ts:4` Main session feedback `POST /feedback` every 2000 ms; error only logged, never tears down.
- [ ] `TM-09` `ap/protocol.ts:30` URL session feedback 2000 ms, started before RECORD, stopped at end/stop/failure.
- [ ] `TM-10` `sdk/internal/airplay-manager.ts:512` Audio stream session feedback 2000 ms, errors swallowed.
- [ ] `TM-11` `ap/dataStream.ts:222` MRP `exchange` default timeout 5000 ms; `TimeoutError('Exchange timed out for <identifier>')`; nothing else happens to the connection.
- [ ] `TM-12` `cl/stream.ts:17` CL exchange default 10000 ms; pairing/verify exchanges 30000 ms (`cl/pairing.ts:78`, `:161`).
- [ ] `TM-13` `sdk/internal/companion-link-manager.ts:576` CL heartbeat NoOp every 15000 ms, unencrypted, errors logged.
- [ ] `TM-14` `sdk/internal/airplay-remote.ts:530` HID press: key-down `send`, `waitFor(25)`, key-up `send`.
- [ ] `TM-15` `sdk/internal/airplay-remote.ts:505` Double press: press, `waitFor(150)`, press. Long press default 1000 ms hold (`:516`).
- [ ] `TM-16` `cl/protocol.ts:268` CL Hold default 500 ms; DoubleTap without delay.
- [ ] `TM-17` `sdk/internal/airplay-remote.ts:463` AirPlay RTI text session wait 5000 ms -> `TimeoutError('AirPlay did not provide an RTI text session.')`.
- [ ] `TM-18` `sdk/internal/airplay-volume.ts:10` Volume up/down step 0.05 (absolute capability); fade step interval 50 ms, steps `max(1, floor(ms/50))`, last step exact target (`:262`).
- [ ] `TM-19` `ap/protocol.ts:700` `/play` 500 retry: 1000 ms wait, 3 attempts.
- [ ] `TM-20` `ap/protocol.ts:36` Playback-info poll 1000 ms, idle threshold 5.
- [ ] `TM-21` `ap/playQueue.ts:196` Play queue start timeout 30000 ms -> rejects `waitForEnd` with "Playback did not start within 30 seconds." (playUrl itself already resolved).
- [ ] `TM-22` `ap/audioStream.ts:17` Audio sync packet every 1000 ms plus one immediately; RAOP control sync also 1000 ms (`ro/controlClient.ts:180`).
- [ ] `TM-23` `ap/streamTiming.ts:37` Packet pacing against `performance.now()`; when behind by >=352 frames send up to 3 catch-up packets; warn after 5 consecutive late packets.
- [ ] `TM-24` `ap/playQueue.ts:28` FCUP fetch: 20000 ms timeout, 8 MiB per response, 32 MiB per session, max 4 in flight.
- [ ] `TM-25` `ap/latencyManager.ts:10` Latency tiers 0.25/0.5/1/2 s; 3 glitches (NACKs) in 5000 ms raise tier; 500 successes stabilize. Only the initial tier is used for padding (computed once in `prepare`).
- [ ] `TM-26` `ro/raop.ts:273` RAOP feedback 2000 ms, errors warned.
- [ ] `TM-27` `cm/recovery.ts:54` ConnectionRecovery defaults: maxAttempts 3, baseDelay 1000, maxDelay 30000, exponential on (1000, 2000, 4000), reconnectInterval 0 (off).
- [ ] `TM-28` `cm/mdns.ts:563` mDNS unicast: queries resent every 1000 ms, finish at `timeout*1000` (default 4 s) or once `hosts*services` services seen; knocks ports 7000, 3689, 49152, 32498 with 500 ms TCP timeout first (`:533`).
- [ ] `TM-29` `cm/discovery.ts:158` `findUntil`: 10 tries, 1000 ms apart; discovery cache TTL 30000 ms (`:16`).
- [ ] `TM-30` `as/fetchAudio.ts:4` URL audio download: 30000 ms timeout, 64 MiB max.
- [ ] `TM-31` `as/decoder/decode.ts:92` Decode worker job timeout 30000 ms; idle worker terminated after 10000 ms (`:70`); max 2 concurrent decodes.
- [ ] `TM-32` `as/ffmpeg.ts:115` FFmpeg stop: `kill()` then SIGKILL after 2000 ms; stdout paused once 1 s of PCM is buffered.

## 3. Lifecycle and teardown

- [ ] `LC-01` `cm/connection.ts:144` `Connection.destroy()`: retry off, retry timer cleared, pending connect rejected `ConnectionClosedError`, socket listeners removed then socket destroyed. Emits NO `close` event. Pending RTSP/MRP/CL requests on that connection are therefore not rejected by close handlers; they run into their own timeouts.
- [ ] `LC-02` `cm/connection.ts:159` `Connection.disconnect()`: retry off, pending connect rejected; already closed -> cleanup; connecting -> `destroy()`; else `end()` and resolves on socket `close` (no timeout; unclear how long a dead peer can hold this).
- [ ] `LC-03` `cm/connection.ts:338` Socket `close`: state `disconnected` (unless `closing`), emits `close(hadError)`, then maybe retry (TM-05).
- [ ] `LC-04` `cm/connection.ts:399` Socket `error`: emitted only if an `error` listener exists (else warn "No error handler registered"); retry only while connecting; connected-state change is left to `close`.
- [ ] `LC-05` `cm/connection.ts:420` Socket `timeout`: emits `timeout`; while connecting -> retry; else state `failed` + socket destroy (with listeners, so `close` follows).
- [ ] `LC-06` `cm/connection.ts:222` `write()` on a disconnected/unwritable socket does not throw: emits `error(ConnectionClosedError('Cannot write to a disconnected connection.'))`. RTSP/MRP/CL error handlers reject all pending requests on that emit.
- [ ] `LC-07` `cm/connection.ts:256` Every socket handler ignores events from a socket that is no longer current.
- [ ] `LC-08` `sdk/internal/airplay-manager.ts:270` `#endSession(unexpected)`: no-op if already disconnected; sets `#disconnect`, `#ready=false`; detaches close listeners; removes control error/timeout listeners; clears feedback; unbinds data/event handlers; cleans URL session (`stopPlayUrl` + disconnect) and audio stream; state tracker unsubscribed; artwork cache cleared; `protocol.disconnect()`; `emit('disconnected', unexpected)` in `finally`.
- [ ] `LC-09` `sdk/internal/airplay-manager.ts:270` State (`clients`, now-playing, volume, outputDeviceUID) is NOT cleared on disconnect; getters keep returning the last values until the next `connect()` clears them (AP-HS-03).
- [ ] `LC-10` `sdk/internal/airplay-manager.ts:661` Any close of control, event or data stream while current -> `#endSession(true)` -> `disconnected(true)`. Remote FIN without error also counts as unexpected.
- [ ] `LC-11` `sdk/internal/airplay-manager.ts:266` `disconnect()` -> `#endSession(false)` -> `disconnected(false)`, synchronous, returns void. `disconnectSafely()` is the same but catches and logs exceptions (`:310`).
- [ ] `LC-12` `sdk/internal/airplay-manager.ts:681` Control stream `error` only logs; the following `close` drives teardown.
- [ ] `LC-13` `sdk/internal/airplay-manager.ts:690` Data/event stream `error`, any `timeout`, and `SetConnectionState=Disconnected` (`:715`) call `controlStream.destroy()`. Because destroy emits no `close` (LC-01), `disconnected(true)` only follows when the receiver then closes the event or data socket (unclear; zombie session with `isConnected=false` and no event otherwise).
- [ ] `LC-14` `ap/protocol.ts:257` `Protocol.disconnect()`: stop audio source, close play queue, close audio stream, `destroy()` data, event, control streams (each try/catch), stop PTP, stop URL feedback, clear refs and timing server. No TEARDOWN sent.
- [ ] `LC-15` `ap/dataStream.ts:331` DataStream rejects all outstanding exchanges with `ConnectionClosedError` on `close` or `disconnect()`, with the error on `error`; not on `destroy()` (LC-01).
- [ ] `LC-16` `rt/client.ts:214` RTSP client rejects pending requests on `close` (`ConnectionClosedError('Connection closed.')`), `error` (that error) and `timeout` (`ConnectionTimeoutError`).
- [ ] `LC-17` `ap/dataStream.ts:434` Data/event stream parse or decrypt failure: buffers cleared, `destroy()`, then `emit('error')`.
- [ ] `LC-18` `sdk/internal/companion-link-manager.ts:186` CL `disconnect()` (async): `#disconnect=true`, generation++, heartbeat cleared, state unsubscribe, close/error/timeout listeners removed BEFORE closing, then `stream.destroy()` if a connect is in flight else `await protocol.disconnect()`. Consequence: an explicit CL disconnect emits no `disconnected` event at all.
- [ ] `LC-19` `cl/protocol.ts:120` CL graceful stop when connected: `_interest {_deregEvents:['_iMC','SystemStatus','TVSystemStatus']}` (send), then `_tiStop`, `_touchStop`, `TVRCSessionStop`, `_sessionStop` exchanges, each try/catch and stopping early if the stream dropped; then `stream.disconnect()` (end + wait for close).
- [ ] `LC-20` `sdk/internal/companion-link-manager.ts:638` CL stream `close` while not disconnecting: set `#disconnect`, start `disconnectSafely()`, `emit('disconnected', true)`. The `disconnected(false)` branch is effectively unreachable because listeners are removed first.
- [ ] `LC-21` `sdk/internal/companion-link-manager.ts:660` CL `timeout` -> `stream.destroy()` (no close event, so no `disconnected`; unclear). CL `error` only logs (`:653`).
- [ ] `LC-22` `cl/stream.ts:165` CL stream rejects all pending exchanges with `ConnectionClosedError('Stream cleanup.')` on close/disconnect, with the error on `error`.
- [ ] `LC-23` `cl/stream.ts:227` CL decrypt/OPack failure only emits `error` (logged by manager); the stream is not destroyed and the nonce counter may be out of sync afterwards (unclear).
- [ ] `LC-24` `sdk/device/device.ts:170` `AbstractDevice.disconnect()`: `state.unsubscribe()` then `airplay.disconnectSafely()`. `AppleTV.disconnect()` additionally `companionLink.disconnectSafely()` without awaiting (`sdk/device/apple-tv.ts:101`).
- [ ] `LC-25` `sdk/device/device.ts:62` Device `connected` follows AirPlay `connected` only; device `disconnected(unexpected)` follows AirPlay `disconnected` only. CL connect/disconnect never produce device-level events.
- [ ] `LC-26` `sdk/types.ts:16` `recovering` and `recoveryFailed` device events and `ConnectOptions.recovery` are declared but never emitted/used; the library does no automatic reconnect at device level.
- [ ] `LC-27` `sdk/internal/airplay-manager.ts:446` `stopPlayUrl()` closes the play queue, stops feedback and disconnects the URL protocol; no TEARDOWN. `stopStreamAudio()` stops the source, clears feedback and disconnects (`:540`).
- [ ] `LC-28` `sdk/internal/airplay-manager.ts:430` `waitForPlaybackEnd` cleans up only the URL protocol it waited on; a newer `playUrl` keeps playing.
- [ ] `LC-29` `ap/playQueue.ts:357` Play queue: control or event stream `close` after start = ended (resolve); before start = `PlaybackError('The connection closed before playback started.')`.
- [ ] `LC-30` `cm/recovery.ts:84` `handleDisconnect(false)` and calls after `dispose()` are no-ops; `reset()` bumps generation, zeroes attempts, cancels the pending retry, restarts the interval; `dispose()` cancels everything and removes listeners; stale attempt results are ignored via generation check.
- [ ] `LC-31` `cm/recovery.ts:130` Recovery emits `recovering(attempt)` before each delayed attempt, `recovered` on success (resets attempts, restarts interval), `failed(errors)` once attempts are exhausted (no further attempts until `reset()`).
- [ ] `LC-32` `cm/recovery.ts:193` Periodic `reconnectInterval` calls `onReconnect` even when healthy; skipped while recovering or a scheduled call runs; failures silent. `handleDisconnect(true)` stops the interval until success or reset.

## 4. Workarounds and quirks

- [ ] `QK-01` `ap/eventStream.ts:97` Event stream keys deliberately swapped: `enableEncryption(writeKey, readKey)`; HKDF salt `Events-Salt`, infos named from the Apple TV's side ("intentionally swapped", pyatv agrees).
- [ ] `QK-02` `ap/utils.ts:14` AirPlay nonce: 12 bytes, 4 zero bytes then u64 LE counter at offset 4. CL nonce: u64 LE at offset 0 (`cl/stream.ts:131`). Audio RTP nonce: u32 LE at offset 4 (`ap/audioStream.ts:641`).
- [ ] `QK-03` `ap/encryption.ts:41` Receive frames are not limited to 1024 bytes ("Receive blocks can exceed the 1024-byte chunks we send"); length is 2-byte LE AAD, frame = len + 18; zero length throws; only complete frames consumed, tail kept.
- [ ] `QK-04` `ap/encryption.ts:74` Send side chunks plaintext into 1024-byte frames.
- [ ] `QK-05` `ap/dataStream.ts:366` Separate `#encryptedBuffer` and plaintext `#buffer` in DataStream, EventStream and RtspClient so partial TCP frames never mix ciphertext into plaintext.
- [ ] `QK-06` `en/ntp.ts:17` `NTP.now()` must be wall clock (`Date.now()`), not `hrtime`; RTP anchor and timing server depend on it.
- [ ] `QK-07` `sdk/internal/airplay-remote.ts:495` HID events must be `send()`: "Apple TV never replies to HID events. Waiting would time out on key-down and prevent key-up".
- [ ] `QK-08` `sdk/internal/airplay-manager.ts:792` `GET_STATE` must be `send()` (unidentified SET_STATE pushes, no reply).
- [ ] `QK-09` `ap/dataStream.ts:410` `rply` frames are transport acks and must not complete exchanges; `sync` frames with or without payload get a `rply` (32-byte header, command bytes zero, same seqno, always encrypted) (`ap/utils.ts:59`).
- [ ] `QK-10` `ap/dataStream.ts:224` Exchange matching by `identifier`, fallback key `type_<type>` when identifier empty; every built message gets random upper-case `identifier` and `uniqueIdentifier` (`ap/dataStreamMessages.ts:15`).
- [ ] `QK-11` `sdk/internal/airplay-manager.ts:715` `SetConnectionState=Disconnected` from the device means it ignores the session from now on; connection must go down.
- [ ] `QK-12` `sdk/internal/airplay-manager.ts:387` PTP stays off for URL and audio sessions (silent playback with PtpMaster); NTP timing server works. `SENDER_FEATURES_AUDIO` still advertises `SupportsPTP` (`cm/airplayFeatures.ts:274`).
- [ ] `QK-13` `sdk/internal/airplay-manager.ts:509` Fresh AirPlay audio sessions are silent until `SET_PARAMETER volume` is sent.
- [ ] `QK-14` `ap/protocol.ts:597` Second encrypted `/info` between SETUP and RECORD for URL sessions (pyatv #2948).
- [ ] `QK-15` `cl/stream.ts:298` CL: match `_x` only for `_t == Response` ("Server events can reuse an outstanding request's `_x`"); pairing replies have no `_x` and match the single pairing slot -1 only for pairing frame types 3..6 (`:311`).
- [ ] `QK-16` `cl/stream.ts:116` CL NoOp frames are always plaintext even after encryption.
- [ ] `QK-17` `cl/messages.ts:58` `_systemInfo` identifiers hardcoded (`_i`, `_pubID`); random ids make the TV treat each connection as a new remote (TODO kept).
- [ ] `QK-18` `sdk/internal/companion-link-manager.ts:370` `_touchC` has no tvOS handler; `_hidT` is what works. Virtual touch over MRP makes tvOS drop the session, so AirPlay has no touch.
- [ ] `QK-19` `cl/protocol.ts:596` `deregisterInterests` and `unsubscribe` are no-ops on a closed stream (avoid disconnect loops).
- [ ] `QK-20` `sdk/internal/airplay-manager.ts:610` "TVMusic returns sparse metadata for identifier-only requests": content-item asset requests ask for the queue window `(0, 1)` with resolved playerPath.
- [ ] `QK-21` `ap/protocol.ts:656` LG/Samsung (VideoV2 without VideoV1) answer `/play` with 404: no legacy fallback there.
- [ ] `QK-22` `ap/protocol.ts:176` HomePod (no video feature bits) cannot `playUrl`; must stream audio.
- [ ] `QK-23` `ap/playQueue.ts:339` "pyatv #2948 only treats `stopped` as the end once playback started".
- [ ] `QK-24` `ap/controlStream.ts:130` Play queue `/command` payload must be ArrayBuffer for plist data ("The serializer only writes plist data for an ArrayBuffer, not for a Buffer"); `/command` uses HTTP/1.1, everything else RTSP/1.0 unless stated.
- [ ] `QK-25` `ap/controlStream.ts:73` Default RTSP headers: `CSeq` (incrementing), `Active-Remote` (random u32 decimal), `DACP-ID` (16 hex upper), `User-Agent: AirPlay/<sourceVersion>`, `X-Apple-ProtocolVersion: 1`, `X-Apple-Session-ID` (random u32 decimal); plist bodies set `Content-Type: application/x-apple-binary-plist`; `Content-Length` always (0 when empty) (`rt/client.ts:130-155`).
- [ ] `QK-26` `ap/eventStream.ts:139` Event stream answers every request `200 OK` with `CSeq` echoed; `POST /command` also `Audio-Latency: 0`. `cycleUsePickedRoute`/`duckAudio`, `unduckAudio`, `died` mapped to events; nobody in sdk listens to `sessionDied` (unclear).
- [ ] `QK-27` `rt/client.ts:243` RTSP receive buffer cap 2 MiB: on overflow both buffers reset, all pending requests rejected, `error` emitted (no destroy). DataStream/EventStream: 4 MiB caps, frame length 32 B..16 MiB, else destroy (`ap/dataStream.ts:373-394`). CL buffer cap 1 MiB, emits error only (`cl/stream.ts:195`).
- [ ] `QK-28` `sdk/internal/airplay-player.ts:233` "Devices occasionally send NaN": elapsed extrapolation only with finite values and non-zero timestamps.
- [ ] `QK-29` `sdk/internal/airplay-player.ts:499` Protobuf repeated fields arrive empty on metadata-only updates; only non-empty arrays replace existing ones.
- [ ] `QK-30` `sdk/internal/airplay-player.ts:19` Artwork URLs `.heic` rewritten to `.jpg`; `{w}`/`{h}` (999999 when < 1), `{c}`=`bb`, `{f}`=`jpg`; only http(s) results accepted.
- [ ] `QK-31` `ap/dataStreamMessages.ts:517` `SEND_HID_EVENT` data uses a fixed timestamp blob `438922cf08020000` and fixed framing bytes (pyatv layout); usage page/usage/down as u16 BE.
- [ ] `QK-32` `cl/protocol.ts:156` CL feature gates by receiver `_sv`: media control >= 250.3, text input >= 340.15, Siri PTT >= 600.20.
- [ ] `QK-33` `ap/protocol.ts:377` Ports from SETUP plists are masked with `& 0xFFFF`.
- [ ] `QK-34` `ap/protocol.ts:519` Audio SETUP `groupUUID` upper-case; URL SETUP `groupUUID` lower-case (`:570`) (unclear).
- [ ] `QK-35` `sdk/internal/airplay-state.ts:811` `outputDeviceUID` = `clusterID || deviceUID || uniqueIdentifier` from DEVICE_INFO; volume commands target this UID, so clustered HomePods are addressed via cluster id.
- [ ] `QK-36` `cl/protocol.ts:71` Text input generation bumps on `_tiStopped`, a new `_tiStarted` UUID, decode failure, and stream close.
- [ ] `QK-37` `ap/audioStream.ts:742` NACK handling: only RTP v2, >= 8 bytes, from the receiver's address and control port; type 0x55; max 512 packets; missing packets answered with an empty "futile" retransmit (`0x80 0xD6 seq 0000`); backlog 1000 packets.
- [ ] `QK-38` `cm/timing/ntp.ts:104` Timing server reply: type `0x53|0x80`, reftime = request sendtime, recv = send = now; malformed packets logged, never thrown.

## 5. Fix history

- [ ] `FX-01` c420af8 `waitForPlaybackEnd` cleaned up a newer playUrl session. Fix: `sdk/internal/airplay-manager.ts:430`.
- [ ] `FX-02` 925119d Decode worker with explicit `execArgv` rejected V8 flags Homey passes (`--expose-gc`). Fix: inherit unless `--input-type`, `as/decoder/decode.ts:13`.
- [ ] `FX-03` f138ffd Any frame during pairing resolved the pairing slot. Fix: pairing types only, `cl/stream.ts:311`. Same commit: swipe Moved to end point, `sdk/internal/companion-link-manager.ts:435`.
- [ ] `FX-04` 38eb168 tvOS reads OPack ints as signed (128..255 in 1 byte arrived negative). Fix: width caps 0x7F/0x7FFF/0x7FFFFFFF, `en/opack.ts:340`. NSDictionary decoded as array. Fix: `en/nskeyedarchiver.ts:29`.
- [ ] `FX-05` 60bd77e Plist ints read signed (44100 -> -21436). Fix: own parser, unsigned < 8 bytes, 8-byte as bigint, limits 32768 objects / depth 256, `en/plist.ts:84`.
- [ ] `FX-06` 9edb35f `vocalsControlLevel/Max/Min` declared uint32 but sent as float: SET_STATE parse failed, now-playing lost on AppleTV18,1. Fix: `packages/airplay/proto/CommandInfo.proto:132`.
- [ ] `FX-07` 148a183 streamAudio raced cleanup; cancelled stream kept running. Fix: `checked()`, `sdk/internal/airplay-manager.ts:477`. CL connect/disconnect races. Fix: `#connecting`, generation, `sdk/internal/companion-link-manager.ts:129-202`.
- [ ] `FX-08` 86d7742 Receive blocks > 1024 bytes desynced `readCount`. Fix: `ap/encryption.ts:38`; RTSP tail kept `rt/client.ts:265`; buffer caps `ap/dataStream.ts:373`; spoofed/oversized NACKs rejected `ap/audioStream.ts:743`; one active audio session per protocol `ap/protocol.ts:862`.
- [ ] `FX-09` 68ef276 Old socket events hit new connection; connect during closing allowed; disconnect on connecting socket hung. Fix: `cm/connection.ts:133`, `:188`, `:256`. Source read could hang after stop: `cm/audioSourceSession.ts`.
- [ ] `FX-10` f174509 OPack decode unbounded, wrong ref width, wrong terminator. Fix: `en/opack.ts:561`, `:688`, `:469`.
- [ ] `FX-11` d146f98 CL replies with `_em`/non-zero `_ec` resolved as success. Fix: `cl/protocol.ts:806`.
- [ ] `FX-12` 650b9a5 audioFormat bits shifted by 2 (sent 0x200 for 44.1/16/2). Fix: table, `ap/audioStream.ts:50`.
- [ ] `FX-13` 5d742d7 RTI sessionUUID as raw bytes rejected. Fix: fallback, `en/rti.ts:43`.
- [ ] `FX-14` 9ceb238 Text input could hit the wrong session. Fix: serialized queue + generation, `cl/protocol.ts:365`; AirPlay RTI text input added `sdk/internal/airplay-remote.ts:442`; destroy now cancels retry/connect `cm/connection.ts:145`; stale recovery attempts ignored `cm/recovery.ts:147`.
- [ ] `FX-15` cbe1594 Position froze at 0 on track change (elapsed=0, rate=0 while playing); paused player reports rate 1. Fix: newest of NPI/metadata, rate fallback, raw value when not Playing/Unknown, `sdk/internal/airplay-player.ts:242-250`.
- [ ] `FX-16` 331d8ec HID via exchange timed out on key-down, key-up never sent. Fix: `send`, `sdk/internal/airplay-remote.ts:528`. MRP virtual touch dropped the session: removed. `SetConnectionState=Disconnected` handled `sdk/internal/airplay-manager.ts:715`. `_touchC` dead; `_hidT` and Select-tap `sdk/internal/companion-link-manager.ts:390-411`.
- [ ] `FX-17` 154a079 `exchange(GET_STATE)` timed out. Fix: `send`, `sdk/internal/airplay-manager.ts:793`.
- [ ] `FX-18` f563b64 `rply` resolved the first exchange (QK-09) `ap/dataStream.ts:411`; frame length unchecked `:393`; `parseMessages` split wrong `ap/utils.ts:137`; `featuresEx` decoded as base64 LE `ap/protocol.ts:212`; PCM 24-bit advertised for 16-bit data `ap/audioStream.ts:230`; `sf`/`flags` hex parsing `cm/airplayFeatures.ts:276`; atomic storage `cm/storage.ts:211`; TLV8 bounds `en/tlv8.ts:193`; RTSP parse limits and `CSeq` casing `rt/encoding.ts:176`; per-interest try/catch and attention state 1..4 `sdk/internal/companion-link-state.ts:142`, `:249`; raw PCM must be explicit `as/url.ts:35`.
- [ ] `FX-19` a10898c Streamed audio silent: session starts muted and PtpMaster gives silence. Fix: `SET_PARAMETER volume` (default -20 dB) and PTP off, `sdk/internal/airplay-manager.ts:490`, `:509`.
- [ ] `FX-20` 818dacd Artwork disappeared after UPDATE_CONTENT_ITEM_ARTWORK. Fix: merged into items, `sdk/internal/airplay-state.ts:649`, `sdk/internal/airplay-player.ts:491`. TVRCSessionStart lacked `ProtocolVersionKey: '1.2'`: `cl/messages.ts:147`.
- [ ] `FX-21` 332e550 / 314d34b Old protocol listeners fired after reconnect and looked like unexpected disconnects. Fix: unbind before rebind, `sdk/internal/airplay-manager.ts:752`, `sdk/internal/companion-link-manager.ts:199`.
- [ ] `FX-22` 4b4df8a / 21d155f / 1a90504 Unsubscribe on closed CL stream looped through disconnect. Fix: `cl/protocol.ts:574`, `:597`.
- [ ] `FX-23` 9308e14 Recovery scheduled flag stayed set after dispose. Fix: `cm/recovery.ts:115`.
- [ ] `FX-24` 20ef2b1 lodash `merge` let old item fields override new. Fix: non-null per-key merge, `sdk/internal/airplay-player.ts:477`.
- [ ] `FX-25` baf6708 / 363619f / 76916ca Elapsed time from the wrong epoch. Fix: Cocoa offset 978307200, `sdk/internal/airplay-player.ts:7`.
- [ ] `FX-26` 39d3c03 Older playback-state messages overwrote newer. Fix: timestamp guard, `sdk/internal/airplay-player.ts:444`.
- [ ] `FX-27` 3556766 SetNowPlayingClient without client crashed. Fix: `sdk/internal/airplay-state.ts:525`.
- [ ] `FX-28` a99d4ae / e169ced / 48f5273 Encrypted NoOp heartbeat blocked the connection. Fix: NoOp plaintext, sync `noOp()`, 15000 ms, `cl/stream.ts:116`, `sdk/internal/companion-link-manager.ts:570`.
- [ ] `FX-29` d569277 / 954ab0a DEVICE_INFO arrived before handlers. Fix: handlers in DataStream constructor `ap/dataStream.ts:123`, subscribe in `onBeforeConnect` `ap/protocol.ts:383`.
- [ ] `FX-30` d416c1e Playback queue request lacked lyrics/sections/alignments/participants. Fix: `ap/dataStreamMessages.ts:224`.
- [ ] `FX-31` 267bcf5 CL exchanges hung on close/error. Fix: reject all, `cl/stream.ts:165`.
- [ ] `FX-32` e6a4870 / 053ae13 / 6ba395c Writing to closed socket threw. Fix: emits `ConnectionClosedError`, `cm/connection.ts:222`.
- [ ] `FX-33` 7b04584 Protobuf extensions dropped on send. Fix: `writeUnknownFields`, `ap/dataStream.ts:271`.
- [ ] `FX-34` 8d0f7d4 `setupEventStream` arguments swapped. Fix: `(sharedSecret, pairingId)`, `sdk/internal/airplay-manager.ts:759`.
- [ ] `FX-35` e53f4ce NTP packets < 32 B crashed timing server. Fix: `en/ntp.ts:48`, `cm/timing/ntp.ts:124`.
- [ ] `FX-36` 7729281 / 3e009f6 / f8c15fe Decryption errors swallowed, connection never restarted. Fix: destroy + emit error, `ap/dataStream.ts:438`, `ap/eventStream.ts:223`, `rt/client.ts:297`.
- [ ] `FX-37` 9e6739b / a5413f3 Error emitted twice or with no listener crashed. Fix: `cm/connection.ts:403`.
- [ ] `FX-38` cc47cad / c05143b RTSP timeout 1750 ms too short; feedback overlapped. Fix: 6000 ms and 1900 ms, `cm/const.ts:17`, `ap/protocol.ts:313`.
- [ ] `FX-39` 470d7af / 3e58822 Data/event stream error/timeout unhandled. Fix: `sdk/internal/airplay-manager.ts:774`. No MAC gave null: falls back to `00:00:00:00:00:00` `cm/utils.ts:83`.
- [ ] `FX-40` 7759a98 Timing server resolved before it had a port; correlation UUID hardcoded. Fix: `cm/timing/ntp.ts:68`, `ap/protocol.ts:474`.
- [ ] `FX-41` e90f150 Now-playing updates not requested. Fix: `nowPlayingUpdates=true`, `ap/dataStreamMessages.ts:25`.
- [ ] `FX-42` ad793da (superseded) 3 s race for DEVICE_INFO replaced by `exchange(deviceInfo)` 5000 ms, `sdk/internal/airplay-manager.ts:789`.
- [ ] `FX-43` 9308e14 (superseded) CL failure used to disconnect AirPlay; now swallowed, `sdk/device/apple-tv.ts:95`.
- [ ] `FX-44` 0dbb930 / fbb7217 / 019406a / fc4de8e / 64dc2c5 / fb8d9d0 Disconnected-flag, feedback clear and power emit fixes in the removed `packages/devices`; behavior now in sdk managers, exact parity (unclear).
- [ ] `FX-45` 7ee61b8 / 1119d60 `_systemInfo._i` randomization reverted to hardcoded; `_iMC` interest reverted then restored (registered at HEAD).

## 6. State model semantics

- [ ] `ST-01` `sdk/internal/airplay-state.ts:135` `nowPlayingClient` = client keyed by the bundle id from the last SET_NOW_PLAYING_CLIENT; null when none or removed.
- [ ] `ST-02` `sdk/internal/airplay-client.ts:35` `activePlayer` = player set by SET_NOW_PLAYING_PLAYER, else `MediaRemote-DefaultPlayer`; null if that player does not exist.
- [ ] `ST-03` `sdk/internal/airplay-state.ts:830` Clients created lazily on SET_STATE, UPDATE_CONTENT_ITEM, SET_DEFAULT_SUPPORTED_COMMANDS, UPDATE_CLIENT, SET_NOW_PLAYING_PLAYER, and SET_NOW_PLAYING_CLIENT (only when displayName present); display name updated when non-empty; `clients` event on create.
- [ ] `ST-04` `sdk/internal/airplay-state.ts:569` SET_STATE without bundle id is ignored entirely. Player id fallback `MediaRemote-DefaultPlayer`.
- [ ] `ST-05` `sdk/internal/airplay-player.ts:443` Playback state updates with an older `playbackStateTimestamp` are dropped.
- [ ] `ST-06` `sdk/internal/airplay-state.ts:581` `playbackStateChanged(client, player, old, new)` fires only for the now-playing client (any of its players) and only when the stored state actually changed.
- [ ] `ST-07` `sdk/internal/airplay-state.ts:896` `nowPlayingChanged(client|null, activePlayer|null)` fires only when the snapshot differs: bundle id, player id, playbackState, title, artist, album, genre, duration, playbackRate, shuffle, repeat, mediaType, seriesName, season, episode, episodeTitle, contentRating, contentIdentifier, artworkId, hasArtworkUrl, hasArtworkData, isAlwaysLive, isAdvertisement. Elapsed time is not part of it. First evaluation after connect always fires.
- [ ] `ST-08` `sdk/internal/airplay-state.ts:537` Snapshot checked after: SET_NOW_PLAYING_CLIENT (always), SET_NOW_PLAYING_PLAYER (always), SET_STATE / UPDATE_CONTENT_ITEM / UPDATE_CONTENT_ITEM_ARTWORK (only for the now-playing client), REMOVE_CLIENT (if it was active), REMOVE_PLAYER (if its client is active).
- [ ] `ST-09` `sdk/internal/airplay-state.ts:436` REMOVE_CLIENT of the active client clears the active bundle id, emits `activePlayerChanged` and then a snapshot check (which yields `nowPlayingChanged(null, null)`).
- [ ] `ST-10` `sdk/internal/airplay-player.ts:111` Metadata precedence: title/artist/album/duration from NowPlayingInfo first, then current content item metadata; genre/season/episode/contentRating from item metadata then additional metadata (`nowPlayingInfoData`); `playbackRate` NPI `??` metadata.
- [ ] `ST-11` `sdk/internal/airplay-player.ts:256` Current item = `playbackQueue.contentItems[location]`, else first item.
- [ ] `ST-12` `sdk/internal/airplay-player.ts:229` Elapsed: pick newest of NPI (`elapsedTime`, `timestamp`) and metadata (`elapsedTime`, `elapsedTimeTimestamp`); when state is neither Playing nor Unknown return raw elapsed; else `elapsed + (now - (cocoaTs + 978307200)) * (rate || player.playbackRate)`, min 0.
- [ ] `ST-13` `sdk/internal/airplay-player.ts:467` UPDATE_CONTENT_ITEM merges only into an existing item with the same identifier in the current queue; unknown items are dropped; metadata merged per key for non-null values (keys starting `$` skipped).
- [ ] `ST-14` `sdk/internal/airplay-player.ts:209` shuffle/repeat derived from the `ChangeShuffleMode`/`ChangeRepeatMode` CommandInfo of the player's supported commands, not from state fields.
- [ ] `ST-15` `sdk/internal/airplay-client.ts:71` Client supported commands = player commands plus default commands not overridden; `isCommandSupported` = found and `enabled !== false`.
- [ ] `ST-16` `sdk/internal/airplay-player.ts:275` `artworkId` only with evidence (`artworkAvailable`, `artworkURL` or `artworkIdentifier`): artworkIdentifier, else contentIdentifier, else item identifier.
- [ ] `ST-17` `sdk/internal/airplay-state.ts:487` `artworkChanged(client, player)` fires on every SET_ARTWORK and every UPDATE_CONTENT_ITEM_ARTWORK when a now-playing client and active player exist (no dedupe). SET_ARTWORK JPEG kept in `artworkJpegData` (never cleared until connect).
- [ ] `ST-18` `sdk/internal/airplay-artwork.ts:123` `artwork.get(w=600,h=-1)`: cached by artworkId; order URL, inline item data, SET_ARTWORK jpeg, then a playback queue request `(0,1,w,h<0?400:h)` and retry data/URL; null otherwise; cache cleared on disconnect.
- [ ] `ST-19` `sdk/internal/airplay-state.ts:785` `volumeDidChange` -> StateController `volumeChanged(volume)` on every VOLUME_DID_CHANGE message, no dedupe; value 0..1 as sent. Initial `volume` 0 until a message arrives (no GET at connect).
- [ ] `ST-20` `sdk/internal/airplay-manager.ts:698` On `nowPlayingChanged` with a different artworkId (incl. null to null after reset), the manager sends `PLAYBACK_QUEUE_REQUEST(0,1)` via exchange, errors swallowed.
- [ ] `ST-21` `sdk/internal/airplay-state.ts:796` `volumeMutedChanged(muted)` on every VOLUME_MUTED_DID_CHANGE; initial false.
- [ ] `ST-22` `sdk/internal/airplay-state.ts:757` Volume availability/capabilities from VOLUME_CONTROL_AVAILABILITY and VOLUME_CONTROL_CAPABILITIES_DID_CHANGE; initial `None`/false. `set`/`fade` need Absolute or Both; `up`/`down` use 0.05 steps for Absolute/Both, HID volume keys for Relative, throw `CommandError` for None (`sdk/internal/airplay-volume.ts:51`).
- [ ] `ST-23` `sdk/internal/airplay-volume.ts:119` `volume.set` clamps to 0..1 and needs an `outputDeviceUID` (else `CommandError('No output device active.')`); SET_VOLUME via exchange.
- [ ] `ST-24` `sdk/internal/airplay-state.ts:744` Output devices from `clusterAwareOutputDevices` if non-empty else `outputDevices`; `clusterChanged` only when clusterID or leader flag changes on DEVICE_INFO(_UPDATE).
- [ ] `ST-25` `sdk/controller/state.ts:209` StateController re-emits `nowPlayingChanged`, then `activeAppChanged(bundleId|null, displayName|null)` after every nowPlayingChanged (not deduped).
- [ ] `ST-26` `sdk/device/device.ts:178` StateController subscribes on AirPlay `connected`, unsubscribes on `disconnected` and on `device.disconnect()`; events from before `connected` (setup phase) are not forwarded to the controller.
- [ ] `ST-27` `sdk/controller/state.ts:132` `isKeyboardActive` returns `keyboardState !== undefined`, i.e. always true (unclear, likely a bug).
- [ ] `ST-28` `sdk/internal/airplay-remote.ts:151` `remote.playPause()` decides by `nowPlayingClient.isPlaying` (HID play or pause), `playback.playPause()` sends TogglePlayPause command.
- [ ] `ST-29` `sdk/internal/airplay-remote.ts:566` SendCommand result: `sendError != NoError` throws `SendCommandError`; a reply without the extension resolves silently.
- [ ] `ST-30` `sdk/device/apple-tv.ts:55` Device `power(state)` = CL `attentionStateChanged`; fires at every CL connect (CL-HS-14) and on SystemStatus/TVSystemStatus when the state changes; values `asleep`(1), `screensaver`(2), `awake`(3), `idle`(4); unknown or non 1..4 ignored (`sdk/internal/companion-link-state.ts:247`).
- [ ] `ST-31` `sdk/device/apple-tv.ts:59` Device `textInput(state)` = CL `_tiStarted` (decoded RTI session, `isActive:true`) / `_tiStopped` (default state); decode failure emits default state.
- [ ] `ST-32` `sdk/internal/companion-link-state.ts:219` `_iMC` flags: event only when flags change; `volumeAvailabilityChanged` when the volume bit flips.
- [ ] `ST-33` `sdk/device/apple-tv.ts:76` `AppleTV.isConnected` = AirPlay connected AND (CL connected or no CL configured). `AirPlayManager.isConnected` needs `#ready`, not disconnecting, and all three streams connected (`sdk/internal/airplay-manager.ts:91`).

## 7. What the Homey app relies on

- [ ] `HY-01` `sdk/configure.ts:32` App calls `configure({logging:['error','warn'], timingServer})` once (H:src/index.ts:37), possibly with a TimingServer whose `listen()` failed. Devices capture the global timing server at construction (`sdk/device/device.ts:48`).
- [ ] `HY-02` `sdk/device/apple-tv.ts:48` CL exists only if `companionLink` discovery passed to the constructor; `power`, `apps`, `accounts`, `system` are `undefined` otherwise. App rebuilds the AppleTV when CL appears later (H:src/apple-tv/device.ts:125).
- [ ] `HY-03` `sdk/device/apple-tv.ts:87` `AppleTV.connect(creds)` rejects only on AirPlay failure; CL failure is swallowed and the call resolves. App then checks only that `tv.companionLink` exists (H:src/apple-tv/device.ts:154).
- [ ] `HY-04` `sdk/internal/airplay-manager.ts:253` A failed AirPlay connect emits `disconnected(false)`; the app ignores `unexpected=false` and handles the rejection by `setUnavailable`, no retry at that point.
- [ ] `HY-05` `sdk/device/device.ts:62` App listens to device `connected` (no args): `recovery.reset()`, and `setAvailable()` when `tv.isConnected` (H:src/apple-tv/device.ts:206, H:src/homepod-base/device.ts:129).
- [ ] `HY-06` `sdk/internal/airplay-manager.ts:270` App listens to device `disconnected(unexpected)`: returns on false; on true `setUnavailable` + `ConnectionRecovery.handleDisconnect(true)` (H:src/apple-tv/device.ts:216). Every intentional disconnect (`disconnect()`, `disconnectSafely()`, `connect()` on a live session) must keep emitting `false`; every remote close must emit `true`.
- [ ] `HY-07` `sdk/internal/companion-link-manager.ts:172` App listens on `tv.companionLink` for `connected` (reset CL recovery, maybe `setAvailable`) and `disconnected(unexpected)` (ignore false; true -> `setUnavailable` + CL recovery) (H:src/apple-tv/device.ts:247, :258).
- [ ] `HY-08` `sdk/device/apple-tv.ts:55` App listens to `power(state)`: `awake`/`screensaver` = on, everything else off; off clears now-playing (H:src/apple-tv/device.ts:226). Relies on `power` firing at each CL connect to resync `onoff`.
- [ ] `HY-09` `sdk/internal/airplay-manager.ts:52` App sets `tv.discoveryResult`, `pod.discoveryResult` and `tv.companionLink.discoveryResult` before reconnecting; must take effect on the next `connect()` (each connect builds a new Protocol from the stored result).
- [ ] `HY-10` `sdk/internal/airplay-manager.ts:643` App calls `tv.airplay.setCredentials(creds)` (sync) and `await tv.companionLink.setCredentials(creds)`, then `airplay.connect()` / `companionLink.connect()` directly (H:src/apple-tv/device.ts:397, :308, :420).
- [ ] `HY-11` `sdk/internal/airplay-manager.ts:310` App calls `airplay.disconnectSafely()` and `device.disconnect()` without awaiting (treated as sync); only `companionLink.disconnectSafely()` is awaited.
- [ ] `HY-12` `sdk/internal/airplay-manager.ts:199` App relies on in-flight dedupe of `airplay.connect()` and CL `connect()`; recovery retries, the 15 min scheduled reconnect and slow recovery can overlap.
- [ ] `HY-13` `sdk/index.ts:69` App uses the exported `ConnectionRecovery` with `{maxAttempts:3, baseDelay:1000, reconnectInterval:900000, onReconnect}` (delays 1000, 2000, 4000 ms, then `failed`) (H:src/apple-tv/device.ts:274, :293; H:src/homepod-base/device.ts:149). The interval force-reconnects every 15 min even when healthy; `connected` after it calls `reset()`.
- [ ] `HY-14` App Apple TV slow recovery after `failed`: every 120000 ms for 15 attempts, then every 900000 ms; reconnects AirPlay if `!airplay.isConnected`, rediscovers/attaches CL if `!companionLink.isConnected`; flow trigger `appletv_companion_link_failed` at attempt 15; stops when `tv.isConnected` (H:src/apple-tv/device.ts:8-10, :323-385). New library recovery must be at least this persistent (indefinite).
- [ ] `HY-15` App HomePod extended recovery: fixed 900000 ms retries while `!pod.airplay.isConnected`, no attempt cap (H:src/homepod-base/device.ts:174-210).
- [ ] `HY-16` App CL failure path: first failure does one immediate rediscovery + reattach, then slow recovery (H:src/apple-tv/device.ts:425-454).
- [ ] `HY-17` `cm/mdns.ts:563` App rediscovers via `mdnsUnicast([address], [service], 5)` and matches `s.address === address`; builds `DiscoveryResult` by hand (`id`/`fqdn` from name, `familyName:null`, `packet:null`, `txt`, `service:{port, protocol:'tcp', type}`) and casts. Library must only read `id`, `fqdn`, `address`, `modelName`, `familyName`, `txt`, `service.port` and tolerate `packet:null`. CL is always found by unicast to the AirPlay address.
- [ ] `HY-18` `sdk/device/device.ts:77` `familyName:null` means `device.name` falls back to fqdn (app does not read it).
- [ ] `HY-19` `sdk/pairing/pairing-session.ts:33` Apple TV pairing: `new AppleTV({airplay})`, `createPairingSession()`, `start()`, then later `pin(code)`, `end()`; `abort()` on start failure. The temporary AppleTV is never disconnected; `end()` must close the pairing socket. Stored credentials: `accessoryIdentifier` string plus hex of `accessoryLongTermPublicKey`, `pairingId`, `publicKey`, `secretKey` (H:src/apple-tv/pairing.ts:80).
- [ ] `HY-20` `sdk/device/homepod.ts:24` HomePod pairing: `pod.connect()` (transient) under a 20000 ms app timeout, then `pod.disconnect()` in `finally`; no credentials stored; reconnect via `connect()` without args.
- [ ] `HY-21` `sdk/controller/state.ts:179` App listens to `state` `nowPlayingChanged` (debounced 300 ms, re-reads `state.activeClient`), `playbackStateChanged` (uses `newState === Playing`), `volumeChanged` (args ignored, reads `state.volume`), `volumeMutedChanged(muted)`, `artworkChanged` (args ignored) (H:src/logic/airplay.ts:247). `activeClient` and `volume` must be updated before the event fires.
- [ ] `HY-22` `sdk/controller/state.ts:33` App reads synchronously: `elapsedTime`, `repeatMode` (undefined = off), `shuffleMode` (Off/Unknown = off), `activeClient` (`bundleIdentifier`, `title`, `artist`, `album`, `displayName`, `isPlaying`, `duration`, `elapsedTime`, `artworkId`, `isCommandSupported`), `activePlayer.currentItemMetadata.iTunesStoreAlbumIdentifier` (bigint, compared with `0n`) and `trackArtistName`, `volume` (0..1), `volumeAvailable`, `isCommandSupported`, `airplay.state.volumeCapabilities` (Absolute/Both decides `volume_set`).
- [ ] `HY-23` `sdk/internal/airplay-artwork.ts:123` App calls `artwork.get(600)` expecting `{url}` or `{data}` or null; null leaves the identifier unset so a later event retries. Also `artwork.getAnimatedFromCatalog()` picking `format === 'motionDetailSquare'` with https URL.
- [ ] `HY-24` `sdk/controller/playback.ts:15` Capabilities use `playback.play/pause/next/previous/stop/setRepeatMode/setShuffleMode` (SendCommand exchange, may throw `SendCommandError` or `TimeoutError`), `seekTo/skipForward/skipBackward` with integer seconds.
- [ ] `HY-25` `sdk/internal/airplay-volume.ts:119` `volume.set(x)` with Homey 0..1 raw (flows divide 0..100 by 100); `volume.up/down`; `remote.mute()` as a toggle (HID 0xE2).
- [ ] `HY-26` `sdk/controller/power.ts:20` App guards power on `sdk.power` existing (CL configured) but `power.on/off` are AirPlay HID wake (0x01/0x83) / suspend (0x01/0x82); flows call `remote.wake/suspend` without guard.
- [ ] `HY-27` `sdk/controller/remote.ts:19` Remote capabilities and flows call `remote.up/down/left/right/select/menu/home/playPause/play/pause/next/previous/mute/stop/topMenu/channelUp/channelDown/wake/suspend` and `volume.up/down`, all awaited; they throw TypeError if no data stream exists (no connected-check).
- [ ] `HY-28` `cl/protocol.ts:268` Flows call `companionLink.pressButton('Screensaver')`, `('Home','Hold')`, `('Select','DoubleTap')`, `('Siri')`, guarded only on CL object existence.
- [ ] `HY-29` `sdk/controller/apps.ts:18` Flows use `apps.list()` (`[{bundleId, name}]`), `apps.launch(id)`, `apps.openUrl(url)`, `accounts.list()` (`[{accountId, name}]`), `accounts.switch(id)`; `?.` makes them no-ops without CL.
- [ ] `HY-30` `sdk/internal/airplay-manager.ts:84` Apple TV `playUrl` checks `capabilities.supportsUrlPlayback` (from `/info` features of the current main protocol), sets volume, `media.playUrl(url)` (position 0), then fire-and-forget `media.waitForPlaybackEnd()` with `.catch` (H:src/apple-tv/device.ts:569-592).
- [ ] `HY-31` `sdk/internal/airplay-manager.ts:463` HomePod `playUrl` = `Url.fromUrl(url)` then `media.streamAudio(source, dB)` with dB = `<=0 -> -144` else `20*log10(p/100)`; awaited until the stream ends; needs the timing server (H:src/homepod-base/device.ts:285-307).
- [ ] `HY-32` No app code catches library errors by class or name; all catches are generic. Thrown messages may change, types are not load-bearing for Homey.
- [ ] `HY-33` App does not use `keyboard`, `textInput` event, `system`, `multiroom`, `power.getState()`, `volume.get()`, `receiverInfo`, `pair()`, RAOP or `Discovery`.
- [ ] `HY-34` `cm/recovery.ts:94` App relies on `ConnectionRecovery.reset()` cancelling a pending retry and restarting the interval, `dispose()` cancelling everything, `failed` firing once after `maxAttempts`, `handleDisconnect(false)` being a no-op. If the library takes over recovery it must keep `disconnected(false)` silent for intentional teardown and keep CL and AirPlay recovery independent.
