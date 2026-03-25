# Feature Vergelijking: apple-protocols vs Apple Private Frameworks

> Deep scan van 9 packages + 14 Apple framework dumps
> Datum: 2026-03-24

---

## Totaaloverzicht

| Categorie                   | Status           | Dekking |
|-----------------------------|------------------|---------|
| Discovery & Connection      | Gedeeltelijk     | ~85%    |
| Pairing & Authentication    | Gedeeltelijk     | ~70%    |
| AirPlay Protocol            | Gedeeltelijk     | ~75%    |
| Audio Streaming             | Gedeeltelijk     | ~70%    |
| Companion Link Protocol     | Vrijwel volledig | ~95%    |
| Media Remote Protocol (MRP) | Gedeeltelijk     | ~65%    |
| Device Abstractions         | Volledig         | ~95%    |
| Encoding & Encryption       | Volledig         | ~95%    |
| URL Playback                | Gedeeltelijk     | ~80%    |
| Screen Mirroring            | Ontbreekt        | 0%      |

---

## 1. Discovery & Connection

### Wat wij implementeren
- mDNS discovery (zelfgebouwde DNS encoder/decoder, meerdere UDP sockets)
- Service types: `_airplay._tcp`, `_companion-link._tcp`, `_raop._tcp`
- Cache (30s TTL), Wake (TCP knock op 4 poorten)
- Connection met retry (3 pogingen), keepAlive, EncryptionAwareConnection
- ConnectionRecovery: exponential backoff
- Feature parsing uit TXT records, device model lookup

### Wat Apple extra heeft
- BLE discovery fallback (Rapport)
- `_hap._tcp` (HomeKit) discovery
- Sleep proxy awareness
- WiFi Direct fallback

### Ontbrekend

| Feature                           | Prioriteit |
|-----------------------------------|------------|
| BLE discovery/connection fallback | Laag       |
| HomeKit accessory discovery       | Laag       |
| Sleep proxy awareness             | Laag       |

---

## 2. Pairing & Authentication

### Wat wij implementeren
- PIN pairing (SRP-6a M1-M6) -> AccessoryCredentials
- Transient pairing (M1-M4, PIN "3939") -> AccessoryKeys
- Pair-verify (Curve25519 ECDH) -> read/write keys
- AirPlay pairing (`/pair-setup`, `/pair-verify`)
- Companion Link pairing (OPack frames)
- Credential storage: JsonStorage + MemoryStorage

### Wat Apple extra heeft
- FairPlay authentication (DRM content)
- MFi authentication (hardware auth chip)
- Account Owner pair-verify (iCloud binding)
- Admin pairing operations (ACL beheer)
- HomeKit identity verificatie

### Ontbrekend

| Feature                   | Prioriteit                               |
|---------------------------|------------------------------------------|
| FairPlay authentication   | Medium (niet haalbaar zonder Apple keys) |
| Account Owner pair-verify | Medium                                   |
| MFi authentication        | Laag (niet haalbaar)                     |

---

## 3. AirPlay Protocol

### Wat wij implementeren
- **ControlStream**: GET, POST, PUT, SETUP, RECORD, FLUSH, TEARDOWN, SET_PARAMETER
- **Endpoints**: `/info`, `/feedback`, `/pair-setup`, `/pair-verify`, `/play`, `/playback-info`, `/volume`, `/rate`, `/setProperty`
- **DataStream**: 154 proto bestanden, 129 ProtocolMessage types
- **EventStream**: Encrypted reverse HTTP
- **Feature negotiation**: 31 feature flags, `/info` parsing, sourceVersion capping
- **Keep-alive**: `/feedback` elke 2s

### Wat Apple extra heeft
- Buffered Audio Engine (APAP/APAT)
- Screen mirroring (H.264/HEVC)
- FairPlay DRM (`/fp-setup`)
- APAC codec (multi-channel spatial audio)
- Aggregate endpoints (multi-device management)
- Transport statistieken

### Ontbrekend

| Feature                  | Prioriteit         |
|--------------------------|--------------------|
| Screen mirroring         | Medium             |
| FairPlay DRM endpoint    | Medium             |
| APAP/APAT buffered audio | Medium             |
| APAC codec               | Laag (proprietary) |

---

## 4. Audio Streaming

### Wat wij implementeren
- Real-time RTP via UDP met ChaCha20 encryption
- Formats: PCM (diverse rates/depths), ALAC, AAC-LC, AAC-ELD, Opus (gedefinieerd)
- NTP sync met wall-clock anchor points
- Retransmission (packet backlog 1000, futile responses)
- RFC2198 (code klaar, `REDUNDANCY_COUNT=0`)
- RTCP sync packets (1s interval)
- RAOP package: volledige RAOP client
- Audio Sources: FFmpeg, MP3, OGG, WAV, PCM, SineWave, URL, Live, File

### Wat Apple extra heeft
- APAC codec (stereo t/m 9.1.6 surround)
- PTP clock sync (preciezer dan NTP)
- Buffered audio transport (APAP/APAT)
- Siri TTS audio markering
- Dual audio engine (buffered + realtime)
- Multi-room cluster sync

### Ontbrekend

| Feature                                     | Prioriteit         |
|---------------------------------------------|--------------------|
| RFC2198 inschakelen (header format bepalen) | Hoog               |
| PTP clock sync                              | Medium             |
| Buffered audio transport                    | Medium             |
| Multi-room cluster sync                     | Medium             |
| APAC codec                                  | Laag (proprietary) |

---

## 5. Companion Link Protocol

### Wat wij implementeren
- OPack framing, ChaCha20 encryption, NoOp heartbeat
- Session management (systemInfo, sessionStart, TVRCSessionStart)
- Feature versioning (sourceVersion thresholds: 250.3, 340.15, 600.20)
- 19 HID commands + SingleTap/DoubleTap/Hold
- Touch events (touchStart/Stop/Event, tap, swipe)
- Text Input RTI (start/stop/change, NSKeyedArchiver payloads)
- 13 Media Control commands + `_mcF` flags parsing
- System controls (captions, appearance, reduce loud sounds, finding mode)
- App management (launch app/URL, list apps)
- Account management (list/switch users)
- Up Next (fetch, add, remove, markAsWatched, playMedia)
- Siri PTT (start/stop)
- CompanionLinkState: attention, mediaControlFlags, nowPlayingInfo, supportedActions, textInput, volumeAvailable
- 47 message builders in messages.ts
- Presence publishing

### Wat Apple extra heeft
- Siri audio streaming (mic input via RPSiriAudioSession)
- `TVRCSwitchActiveUserAccountEvent`
- Siri Remote finding (Bluetooth locatie)
- Game controller events (joystick input)

### Ontbrekend

| Feature                | Prioriteit |
|------------------------|------------|
| Siri audio streaming   | Medium     |
| Game controller events | Laag       |
| Siri Remote finding    | Laag       |

---

## 6. Media Remote Protocol (MRP)

### Wat wij implementeren
- 129 ProtocolMessage types gedefinieerd in proto
- ~30 types actief gebruikt/verwerkt in DataStream handlers
- 75 Command enum waarden
- CommandInfo met 43 velden (incl. vocalsControl, sleepTimer, dialogOptions)
- Now Playing state: Client/Player hiërarchie, NowPlayingSnapshot, granulaire events
- Volume: absolute + relative, mute tracking
- Artwork: SET_ARTWORK, PlaybackQueueRequest met artwork formats
- Lyrics: SEND_LYRICS_EVENT, lyricsEvent forwarding
- Keyboard state tracking

### Wat Apple extra heeft (653 classes in MediaRemote)
- Game Controller (register, buttons, digitizer, motion/acceleration)
- Voice Input (register device, send audio, recording state)
- Microphone Connection (intercom)
- Playback Session Migration (device handoff)
- SharePlay/Group Session (13+ message types)
- Route Authorization
- Audio Fade (crossfade)
- Hosted Endpoints
- Application Connection
- Browsable Content

### Ontbrekend

| Feature                    | Prioriteit |
|----------------------------|------------|
| Game Controller support    | Medium     |
| Playback Session Migration | Medium     |
| Voice Input                | Laag       |
| SharePlay/Group Session    | Laag       |
| Audio Fade                 | Laag       |

---

## 7. Device Abstractions

### Wat wij implementeren
- **AppleTV**: AirPlay + Companion Link, now playing, remote, volume, text input, apps, accounts, power, system controls, Up Next, Siri
- **HomePod**: AirPlay only, now playing, remote, volume, URL playback, audio streaming
- **HomePodMini**: Extends HomePod
- **AirPlayState**: Client/Player hiërarchie, 20+ events, NowPlayingSnapshot
- **CompanionLinkState**: attention, mediaControlFlags, nowPlayingInfo, supportedActions, textInput

### Status: Volledig (~95%)

---

## 8. Encoding & Encryption

### Wat wij implementeren
- Plist (binary parse + serialize)
- OPack (encode + decode)
- TLV8 (encode + decode)
- DAAP (tag encoding/decoding)
- NTP (timestamps)
- NSKeyedArchiver (decode — CF$UID, NSArray, NSDictionary)
- ChaCha20-Poly1305 (encrypt/decrypt met AAD)
- Ed25519 (sign/verify/keygen)
- Curve25519 (DH key exchange)
- HKDF-SHA512 (key derivation)
- SRP-6a (pairing)

### Ontbrekend

| Feature                 | Prioriteit |
|-------------------------|------------|
| NSKeyedArchiver encoder | Medium     |
| XML Plist serialisatie  | Laag       |

---

## 9. URL Playback

### Wat wij implementeren
- `/play` POST met Content-Location, Start-Position, uuid, streamType, volume, rate
- `/playback-info` GET (positie, duur, rate, readyToPlay)
- `/rate` POST (play/pause)
- `/setProperty` PUT (dateRange, actionAtItemEnd, endTimes)
- `/volume` POST
- Retry logica (3x bij 500)
- `waitForPlaybackEnd()` met idle detection
- Feedback loop (2s)

### Ontbrekend

| Feature                        | Prioriteit |
|--------------------------------|------------|
| `/scrub` high-level methode    | Hoog       |
| `/stop` high-level methode     | Hoog       |
| HLS adaptive bitrate awareness | Laag       |

---

## 10. Screen Mirroring

### Status: Ontbreekt (0%)

Apple heeft: H.264/HEVC video streaming, HDR (HDR10, HLG, Dolby Vision), resolution negotiation, screen capture, YCbCr444, rotation, multi-codec, Valeria virtual display.

---

## Top 10 Prioriteiten

| #  | Feature                                 | Categorie      | Prioriteit |
|----|-----------------------------------------|----------------|------------|
| 1  | RFC2198 redundancy inschakelen          | Audio          | Hoog       |
| 2  | `/scrub` en `/stop` high-level methoden | URL Playback   | Hoog       |
| 3  | Game Controller support                 | MRP            | Medium     |
| 4  | Playback Session Migration              | MRP            | Medium     |
| 5  | Siri audio streaming via CL             | Companion Link | Medium     |
| 6  | PTP clock sync                          | Audio          | Medium     |
| 7  | Buffered audio transport (APAP/APAT)    | Audio/AirPlay  | Medium     |
| 8  | NSKeyedArchiver encoder                 | Encoding       | Medium     |
| 9  | Screen mirroring (H.264)                | AirPlay        | Medium     |
| 10 | Account Owner pair-verify               | Pairing        | Medium     |
