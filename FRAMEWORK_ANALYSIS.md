# Apple Private Framework Analyse

> Analyse van `/tmp/libraries/System/Library/PrivateFrameworks/` Mach-O arm64e binaries.
> Tools: `otool`, `nm`, `strings`, `objdump`
> Datum: 2026-03-23

## Samenvatting

Onze apple-protocols library is **verrassend compleet** in vergelijking met wat Apple intern gebruikt. De HKDF key derivation strings, pairing flows (M1-M6), nonce formaten, en ProtocolMessage types komen exact overeen. De belangrijkste ontdekkingen waar we van kunnen profiteren zijn:

1. **APAC codec** — een nieuw/onbekend Apple audio codec voor spatial audio
2. **Surround sound audio formaten** tot 9.1.6
3. **Advanced keep-alive modes** (low-power)
4. **Dynamic latency management**
5. **HomePod-specifieke features** (conversation detection, listening mode)
6. **~80 ontbrekende protobuf message types** (voornamelijk GroupSession/SharePlay)

---

## 1. HKDF Key Derivation — BEVESTIGD CORRECT

Onze implementatie gebruikt exact dezelfde HKDF info strings als Apple:

| Stream      | Salt                    | Read Key Info                     | Write Key Info                     | Status                   |
|-------------|-------------------------|-----------------------------------|------------------------------------|--------------------------|
| Control     | `Control-Salt`          | `Control-Read-Encryption-Key`     | `Control-Write-Encryption-Key`     | ✅ Match                  |
| DataStream  | `DataStream-Salt{seed}` | `DataStream-Input-Encryption-Key` | `DataStream-Output-Encryption-Key` | ✅ Match                  |
| EventStream | `Events-Salt`           | `Events-Read-Encryption-Key`      | `Events-Write-Encryption-Key`      | ✅ Match (swap bevestigd) |

Extra HKDF strings gevonden in AirPlaySupport:
- `Pair-Setup-AES-IV` / `Pair-Setup-AES-Key` — voor M5/M6 exchange
- `Pair-Verify-AES-IV` / `Pair-Verify-AES-Key` — voor pair-verify
- `AirPlayPairing` — pairing identity label

## 2. Audio Formaten — SIGNIFICANTE ONTDEKKINGEN

### Formaten uit AirPlaySender binary:

```
ALAC/44100/16/2    ALAC/44100/20/2    ALAC/44100/24/2
ALAC/48000/16/2    ALAC/48000/20/2    ALAC/48000/24/2

AAC-LC/44100/2     AAC-LC/48000/2
AAC_LC/48000/5.1   AAC_LC/48000/5.1.2  AAC_LC/48000/7.1

AAC-ELD/16000/1    AAC-ELD/24000/1    AAC-ELD/32000/1
AAC-ELD/44100/1    AAC-ELD/44100/2    AAC-ELD/48000/1
AAC-ELD/48000/2    AAC_ELD/48000/5.1  AAC_ELD/48000/5.1.2

APAC/48000/2       APAC/48000/5.1     APAC/48000/5.1.2
APAC/48000/5.1.4   APAC/48000/7.1     APAC/48000/7.1.2
APAC/48000/7.1.4   APAC/48000/9.1.6
```

### Nieuwe ontdekkingen:

**APAC** — Apple Positional Audio Codec (vermoedelijk). Volledig onbekend codec met ondersteuning tot 9.1.6 surround. Alleen op 48kHz. Dit is waarschijnlijk Apple's proprietary spatial audio codec.

**ALAC 20-bit** — Naast 16-bit en 24-bit ondersteunt Apple ook 20-bit ALAC.

**AAC-ELD varianten** — Veel meer sample rates dan verwacht (16kHz voor spraak tot 48kHz voor muziek). AAC-ELD wordt specifiek gebruikt voor "LL or AAC_ELD Spatial Mirroring".

**Surround sound** — Tot 9.1.6 (9 kanalen + 1 sub + 6 height). Configuraties: 5.1, 5.1.2, 5.1.4, 7.1, 7.1.2, 7.1.4, 9.1.6.

### Impact voor onze library:
We ondersteunen momenteel alleen ALAC 44.1/48kHz stereo en AAC-LC stereo. Surround sound en APAC zijn relevante uitbreidingen voor HomePod-gebruik.

## 3. Transport Types — APAP & APAT

Nieuwe transport concepten gevonden:

| Acroniem          | Naam                    | Beschrijving                         |
|-------------------|-------------------------|--------------------------------------|
| **APAP**          | AirPlay Audio Protocol  | Basis audio protocol                 |
| **APAT**          | AirPlay Audio Transport | Nieuwer transport layer              |
| **APAT_Buffered** | APAT Buffered           | Voor media playback (buffered audio) |
| **APAT_HLA**      | APAT High Latency Audio | Voor high-latency scenarios          |

Gerelateerde engine types:
- `APAudioEngineBuffered` — Media playback audio engine
- `APAudioEngineRealTime` — Real-time audio engine (mirroring, Siri)
- `APAudioEngineBufferedAdapter` — Bridge tussen de twee

Wij onderscheiden momenteel niet expliciet tussen deze transport types. Ons `AudioStream` class combineert elementen van zowel buffered als real-time.

## 4. Protobuf Messages — ~80 ontbrekend

### Onze dekking: 118 proto types, MediaRemote bevat 194

### Categorieën van ontbrekende types:

**GroupSession / SharePlay (13+ types):**
- `GroupSessionInfo`, `GroupSessionToken`, `GroupSessionParticipant`
- `GroupSessionJoinRequest/Response`, `GroupSessionRemoveRequest`
- `GroupSessionLeaderDiscoveryMessage`, `GroupSessionFastSyncMessage`
- `GroupSessionIdentityShareMessage/Reply`, `GroupSessionErrorReply`
- `GroupSessionMemberSyncMessage`, `RequestGroupSessionMessage`
- `GroupTopologyModificationRequest`

**ApplicationConnection (5 types):**
- `ApplicationConnectionContext`, `ApplicationConnectionMessage`
- `ApplicationConnectionMessageHeader`, `ApplicationConnectionProtocolMessage`
- `CreateApplicationConnectionMessage`

**Audio Geavanceerd (6 types):**
- `AudioBuffer`, `AudioDataBlock`, `AudioRoute`
- `AudioStreamPacketDescription`, `AudioTime`, `AudioFormat`
- `AirPlayLeaderInfo` (multi-room leader)

**Microphone (2 types):**
- `MicrophoneConnectionRequestMessage`
- `MicrophoneConnectionResponseMessage`

**Hosted Endpoints (2 types):**
- `CreateHostedEndpointRequest/Response`

**Artwork Varianten (3 types):**
- `AnimatedArtwork`, `DataArtwork`, `RemoteArtwork`

**Video (2 types):**
- `VideoThumbnail`, `VideoThumbnailRequest`

**Overige:**
- `SetConversationDetectionEnabledMessage` — HomePod
- `MusicHandoffEvent/Session` — Handoff
- `Color`, `Destination`, `Diagnostic`
- `UserIdentity`, `Value`, `KeyValuePair`
- `DiscoverySessionConfiguration`
- `TranscriptAlignment`, `LyricsToken`, `LyricsEvent`
- `TextEditingAttributes`, `TextInputTraits`
- `PlaybackQueueParticipant`
- `AVAirPlaySecuritySettings`, `AVEndpointDescriptor`
- `AVOutputDeviceDescriptor`, `AVOutputDeviceSourceInfo`, `AVRouteQuery`

### Impact:
De meeste ontbrekende types zijn voor **SharePlay** (GroupSession) en **Apple-interne communicatie** (ApplicationConnection). Voor ons primaire gebruik (media playback, remote control, volume) zijn we compleet.

## 5. Features & Capabilities

Uit de binary:
```
features are a combination of characters:
  s)creen, a)udio, p)layback, b)uffered audio, c)ontrol
```

Additionele feature concepten:
- `AirPlayFeatures` — Hoofd feature set
- `ExtendedFeatures` — Uitgebreide features
- `MetadataFeatures` — Metadata capabilities
- `EnabledFeatures` — Actieve features op een endpoint
- Features worden als 64-bit flags (`%#ll{flags}`) doorgegeven

## 6. Pairing — BEVESTIGD EN VOLLEDIG

Apple's pairing implementatie bevestigt onze flows:

**Pair-setup (PIN):** M1→M2→M3→M4→M5→M6 — exact zoals geïmplementeerd
**Pair-verify:** PV1→PV2→PV3→PV4 — exact zoals geïmplementeerd

Extra pairing types in Apple's code die wij niet implementeren:
- `pair-setup CU` — CoreUtils pairing (modern)
- `pair-setup UA Legacy` — Legacy UA pairing
- `pair-verify CU-{type}` — CoreUtils verify met type parameter

Authenticatie types:
- `coreUtilsKeyHolder` — Modern (wat wij gebruiken)
- `legacyKeyHolder` — Legacy AES key/IV
- `fpAuthentication` — FairPlay
- `mfiAuthentication` — Made for iPhone
- `rsaAuthentication` — RSA

## 7. Keep-alive Systeem

Apple heeft meerdere keep-alive modes:

| Mode      | Beschrijving                                          |
|-----------|-------------------------------------------------------|
| Normal    | Standaard keep-alive op control stream                |
| Low Power | `keepAliveLowPower` — Aparte transport stream         |
| Stats     | `keepAliveSendStatsAsBody` — Stats in keep-alive body |

Gerelateerde functies:
- `apsession_ensureKeepAliveStarted`
- `apsession_ensureLowPowerKeepAliveStreamSetup`
- `apsession_restartKeepAliveInDifferentModeIfNeeded`
- `apsession_handleTransportSessionKeepAliveResponseReceived`

Wij gebruiken alleen basic TCP keep-alive. Een low-power mode zou nuttig zijn voor altijd-verbonden Homey scenarios.

## 8. Dynamic Latency Management

Apple heeft een sophisticated latency management systeem:

```
DynamicLatencyManager is using variant=%@ latencyTierIdx=%d latencyMs=%d
DynamicLatencyManager returned new latencyMs=%u latencyTierIndex=%d
```

- Tier-based latency (meerdere niveaus)
- Adaptive latency offset op basis van glitches
- Live adaptive latency offset
- Connection latency hints
- Separate latency settings voor screen vs media presentation mode

Wij hebben momenteel geen dynamic latency management.

## 9. Volume Systeem — GEAVANCEERDER

Apple's volume systeem is complexer dan onze implementatie:

- **dB-based volume** (`volumeDB`) naast lineair
- **Per-output device volume** (multi-room)
- **Volume capabilities** (wat kan het device?)
- **Volume fade** (geleidelijke volume transities)
- **Relative volume adjustment** (`adjustVolume` vs `setVolume`)
- **Mute als apart concept**

Protobuf types die we hebben: SetVolume, GetVolume, VolumeDidChange, SetVolumeMuted, etc.
Protobuf types die we missen: `AdjustVolumeMessage` (relatieve volume wijziging)

## 10. HomePod-specifieke Features

- **Conversation Detection** (`SetConversationDetectionEnabledMessage`) — Auto-pause bij spraak
- **Listening Mode** (`SetListeningModeMessage`) — ANC/Transparency mode control
- **Audio Fade** (`AudioFadeMessage/Response`) — Cross-fade tussen bronnen
- **Speaker Grouping** (`PermanentSpeakerGroupingInfo`, `SpeakerGroupingOverride`)

## 11. Screen Mirroring Details

Uit `APEndpointStreamScreenAVCWrapper`:

- HDR support (HDR mode, HDR mirroring support)
- YCbCr 4:4:4 support (`receiver supports 444`)
- Rotation support
- Resolution negotiation (`max size in pixels`)
- FPS control (`max FPS`, `setting screen capture FPS`)
- Presentation modes (media vs mirroring)
- EDID support (display identification)
- Third party TV detection
- Overscanned display support
- Preferred UI scale

## 12. TVRemoteCore — Remote Control Details

Klassen en sessies:
- `RPHIDSession` — HID via Rapport
- `RPHIDTouchSession` — Touch events via Rapport
- `RPTextInputSession` — Text input via Rapport
- `RTIInputSystemSourceSession` — Remote Text Input systeem

Keyboard attributen:
```
title, PINEntryAttributes, secure, enablesReturnKeyAutomatically,
keyboardType, returnKeyType, autocapitalizationType,
autocorrectionType, spellCheckingType
```

Button events via `TVRCButton`, media events via `TVRCMediaEventsManager`.

## 13. RemoteHID — Dieper dan Verwacht

- `HIDTimeSyncProtocol` — Time synchronisatie voor HID events
- `HIDPacketDevice` — Packet-based HID device
- Transport versioning
- Get/Set Report handlers (bidirectioneel)
- Device property notifications
- Bluetooth AACP transport (Apple Accessory Configuration Protocol)
- Refresh/reconnect mechanisme met retry counting

## 14. Rapport Framework

Rapport is Apple's device-to-device communicatie framework:

- Gebruikt door AirPlay, Companion Link, en HID
- `SnapInSnapOutManager` — Proximity-based device handoff via NearbyInteraction
- Connection management met NWConnection
- Pairing identity sharing
- Used alongside Companion Link: `RPCompanionLinkClient` referenced in AirPlaySender

## 15. Music.app Analyse

> Bron: `/System/Applications/Music.app/Contents/MacOS/Music` (Mach-O universal binary, arm64e + x86_64)
> Analyse: `strings`, `nm` — datum: 2026-03-26

Music.app is Apple's eigen AirPlay client (sender). Het gebruikt **geen Companion Link** — puur AirPlay + het MediaRemote framework (`MRMediaRemote*` functies).

### DelegationService Protocol

Een volledig protobuf-gebaseerd protocol voor **Apple Account delegatie** naar AirPlay receivers. Hiermee kan een device (Apple TV/HomePod) direct Apple Music content fetchen via het gedelegeerde account.

**HKDF encryption keys:**
- Salt: `DelegationService-Salt`
- Read key: `DelegationService-Read-Encryption-Key`
- Write key: `DelegationService-Write-Encryption-Key`

**Protobuf types** (uit `Protocols/WHA/DelegationService.pb.cc`):
- `DelegationService.Message` (wrapper met `Request` / `Response`)
- `DelegationService.StartDelegationRequest` / `StartDelegationResponse`
- `DelegationService.FinishDelegationRequest` / `FinishDelegationResponse`
- `DelegationService.PlayerInfoContextToken`
- `DelegationService.PlayerDelegateInfoToken`
- `DelegationService.PlayerInfoContextRequestToken`

**Lifecycle:**
- `AccountDelegationHandler` — beheert delegation discovery en sessies
- `AccountDelegationConversation` — individuele delegation sessie met een device
- Gebruikt FairPlay SAP (`/fp-setup`) voor DRM content autorisatie
- PIN-everytime security mode niet ondersteund voor AccountDelegation

**Impact:** DelegationService zou het mogelijk maken om Apple Music direct op devices af te spelen via account delegatie. Vereist echter Apple Music account tokens + FairPlay certificaten.

### Lyrics Systeem (TSL = Time-Synced Lyrics)

Music.app heeft een uitgebreid lyrics systeem gebaseerd op **TTML** (Timed Text Markup Language) XML.

**Data hierarchie:**
```
TSLLyricsSongInfo
├── TSLLyricsSongWriter[]          — songwriter metadata
├── TSLLyricsSection[]             — secties (verse, chorus, etc.)
│   └── TSLLyricsLine[]            — regels met mStartTime, mEndTime
│       └── TSLLyricsWord[]        — woorden met individuele timing
├── TSLLyricsTranslation[]         — vertalingen per taal
│   └── TSLLyricsTranslationText[] — vertaalde tekst per regel
└── mTranslationsMap[language]     — taal → vertaling mapping
```

**Features:**
- **Word-level timing** — `mStartTime`, `mEndTime` per woord voor karaoke-achtige weergave
- **Syllable-level animatie** — `SyllableContainer`, `SyllableLayer` voor sub-woord highlighting
- **Background vocals** — apart concept (`primaryVocalText`, `backgroundVocalText`, `BackgroundVocalsPosition`)
- **Vertalingen** — per taal met `mTranslationMap[language]`
- **Vocal attenuation** — `kStoreDAAPSupportsVocalAttenuationCode` (Apple Music Sing)
- **TTML parsing** — `TSLLyricsSongInfo::CreateFromTTML()`, `TSLLyricsXMLParser.cpp`

**MRP protocol integratie:**
- `SendLyricsEventMessage` stuurt real-time timing events naar de receiver
- TTML data wordt aangeleverd via `PlaybackQueueRequestMessage` met lyrics flag
- `MPModelPropertyLyricsTTML` — MediaPlayer model property
- Opslag: `/var/mobile/Media/ttml/` (iOS)

**UI klassen:**
- `LyricsViewController` / `ImmersiveLyricsViewController` — weergave
- `SyncedLyricsManager` / `SyncedLyricsTimingProvider` — timing synchronisatie
- `SyncedLyricsLineContentLayer` — per-regel rendering
- `LyricsPlayActivityEvent` — lyrics activiteit tracking

### BufferedAirPlay

Music.app maakt breed gebruik van `BufferedAirPlay`:

- `BufferedAirPlayOutputDevice` — per-speaker output device wrapper
- `BufferedAirPlayAddOutputDeviceToContext()` — voegt devices toe aan playback context
- `BufferedAirPlaySetVolumeAction` — per-device volume instellen in groepen
- Aparte dispatch queue: `com.apple.iTunes.SpeakerGroupManager.SharedQ`

Dit bevestigt dat **APAT_Buffered** (zie sectie 3) het primaire transport is voor media playback in Music.app.

### Speaker Group Management

Complexe speaker group hiërarchie:

```
SpeakerGroupManager
├── ComputerSpeakerGroup    — lokale speakers (kComputerSpeakerGroupID)
├── RemoteSpeakerGroup      — AirPlay speakers
│   └── RemoteSpeakerGroupAudioDevice
└── SpeakerGroupList        — alle groepen
    └── SpeakerGroupDisplayData
```

**Belangrijke patronen:**
- Group leader bescherming: *"Deselection of the group leader device when it is the only device selected is not allowed!"*
- `ClusterDeviceType` conversie naar preference values
- `RegisterDeviceIDForClusterID()` — registratie van device-cluster mapping
- `SpeakerGroupMessageType` — communicatie binnen groepen
- `SpeakerGroupAudioDeviceConfigInfo` — per-device audio configuratie

### Volume Systeem

Bevestigt de geavanceerde volume features uit sectie 9:

- **Endpoint-level volume:** `MRAVEndpointGetVolume()`, `MRAVEndpointSetVolume()`
- **Per-output-device volume:** `MRAVEndpointGetOutputDeviceVolume()`, `SetOutputDeviceVolumeLevel()`
- **Volume capabilities check:** `MRAVEndpointGetVolumeControlCapabilities()`
- **Volume scrubbing:** `EndScrubbingVolume()` patroon voor geanimeerde volume transities (`VolumeSliderScrubbingInfo`)
- **Group volume:** `SetDeviceGroupVolumes()`, `FinalizeVolumes()` — coördineert volume over meerdere devices

### Audio

Music.app sender-side beperkingen:
- Kanalen: `(channelsPerFrame == 1) || (channelsPerFrame == 2)` — alleen mono of stereo
- Sample rates: 48000, 44100, 22050, 11025, 8000
- Bit depths: 16, 20, 24, 32
- Codecs: ALAC (`$alac`), AAC, PCM (`kAudioFormatLinearPCM`)
- Audio engines: `AudioDeviceAudioEngine` (AirPlay), `BluetoothAudioDeviceAudioEngine` (Bluetooth)

### Overige bevindingen

- **RTSPTimeSyncServer** — eigen NTP-achtige time sync server (vergelijkbaar met onze TimingServer)
- **PlaybackQueue.pb.cc** — ook in `Protocols/WHA/` directory, bevestigt protobuf voor playback queue
- **MediaRemote framework** — `MRAVEndpoint*` voor output device management, `MRDelegationUUID` voor account delegation
- **FairPlay** — `/fp-setup` endpoint voor DRM content autorisatie, niet voor pairing
- **Digest authentication** — `RTSPClient::VerifyAppleResponseHeader`, `RTSPProtocol::CalculateDigestHashA1` (RFC2617)

---

## Aanbevelingen voor apple-protocols

### Hoge Prioriteit (direct nuttig):

1. **AdjustVolume protobuf** — Relatieve volume wijziging toevoegen
2. **Low-power keep-alive** — Belangrijk voor Homey (altijd verbonden)
3. **AAC-ELD support** — Nuttig voor low-latency audio scenarios
4. **AudioFade messages** — Soepele audio transities

### Medium Prioriteit (feature uitbreiding):

5. **Surround sound audio formaten** — 5.1 en 7.1 support
6. **Dynamic latency management** — Adaptieve latency op basis van netwerk
7. **Lyrics verrijking** — requestLyrics(), TTML parsing, word-level timing
8. **DelegationService proto's** — Voorbereiding voor account delegatie
9. **AnimatedArtwork** protobuf — Geanimeerde album art
10. **Keyboard attributen** — Rijkere text input (secure, keyboard type, etc.)

### Lage Prioriteit (nice-to-have):

11. **APAC codec** — Waarschijnlijk niet te implementeren zonder Apple's decoder
12. **GroupSession/SharePlay** protobufs — Alleen relevant voor multi-user
13. **ApplicationConnection** protobufs — Apple-intern
14. **Screen mirroring** — Complex, apart project
15. **MusicHandoff** — Apple ecosystem specifiek

### Niet van toepassing:

- **SetListeningMode** / **SetConversationDetection** — AirPods-specifiek, niet relevant voor dit project
- **FairPlay DRM implementatie** — Vereist Apple licentie/certificaten
