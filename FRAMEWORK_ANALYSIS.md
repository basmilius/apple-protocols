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

### lastSupportedMessageType — KRITISCH

De Apple TV filtert berichten op basis van `lastSupportedMessageType` in het `DeviceInfoMessage`. Berichten met een type hoger dan deze waarde worden **niet verstuurd** naar de client.

- **Apple's eigen waarde (macOS Sequoia MediaRemote.framework):** `139` (0x8B)
- **Default fallback (als veld ontbreekt):** `36` (0x24)
- **pyatv / bunatv:** `108`
- **Onze library:** `139` (gematcht met Apple)

Het `MRSupportedProtocolMessages` object wordt geïnitialiseerd via `initWithLastSupportedMessageType:` en controleert via `canSendMessage:` of een bepaald type verstuurd mag worden.

### Volledige ProtocolMessage.Type mapping — GEVALIDEERD

Geëxtraheerd uit `MediaRemote.framework` (macOS Sequoia) via disassembly van elke `[MR*Message type]` getter.

**Belangrijk:** Eerdere bronnen (pyatv, bunatv) hadden **verkeerde nummers voor types boven 107**. De types hieronder zijn gevalideerd tegen Apple's daadwerkelijke implementatie.

| Hex  | Dec | Message Type                                    | Categorie       |
|------|-----|-------------------------------------------------|-----------------|
| 0x00 | 0   | UNKNOWN_MESSAGE                                 | -               |
| 0x01 | 1   | SEND_COMMAND_MESSAGE                            | Playback        |
| 0x02 | 2   | SEND_COMMAND_RESULT_MESSAGE                     | Playback        |
| 0x03 | 3   | GET_STATE_MESSAGE                               | State           |
| 0x04 | 4   | SET_STATE_MESSAGE                               | State           |
| 0x05 | 5   | SET_ARTWORK_MESSAGE                             | Artwork         |
| 0x06 | 6   | REGISTER_HID_DEVICE_MESSAGE                     | HID             |
| 0x07 | 7   | REGISTER_HID_DEVICE_RESULT_MESSAGE              | HID             |
| 0x08 | 8   | SEND_HID_EVENT_MESSAGE                          | HID             |
| 0x09 | 9   | SEND_HID_REPORT_MESSAGE                         | HID             |
| 0x0A | 10  | SEND_VIRTUAL_TOUCH_EVENT_MESSAGE                | Touch           |
| 0x0B | 11  | NOTIFICATION_MESSAGE                            | System          |
| 0x0C | 12  | CONTENT_ITEMS_CHANGED_NOTIFICATION_MESSAGE      | Content         |
| 0x0F | 15  | DEVICE_INFO_MESSAGE                             | System          |
| 0x10 | 16  | CLIENT_UPDATES_CONFIG_MESSAGE                   | System          |
| 0x11 | 17  | VOLUME_CONTROL_AVAILABILITY_MESSAGE             | Volume (legacy) |
| 0x12 | 18  | GAME_CONTROLLER_MESSAGE                         | Game            |
| 0x13 | 19  | REGISTER_GAME_CONTROLLER_MESSAGE                | Game            |
| 0x14 | 20  | REGISTER_GAME_CONTROLLER_RESPONSE_MESSAGE       | Game            |
| 0x15 | 21  | UNREGISTER_GAME_CONTROLLER_MESSAGE              | Game            |
| 0x16 | 22  | REGISTER_FOR_GAME_CONTROLLER_EVENTS_MESSAGE     | Game            |
| 0x17 | 23  | KEYBOARD_MESSAGE                                | Keyboard        |
| 0x18 | 24  | GET_KEYBOARD_SESSION_MESSAGE                    | Keyboard        |
| 0x19 | 25  | TEXT_INPUT_MESSAGE                              | Keyboard        |
| 0x1A | 26  | GET_VOICE_INPUT_DEVICES_MESSAGE                 | Voice           |
| 0x1B | 27  | GET_VOICE_INPUT_DEVICES_RESPONSE_MESSAGE        | Voice           |
| 0x1C | 28  | REGISTER_VOICE_INPUT_DEVICE_MESSAGE             | Voice           |
| 0x1D | 29  | REGISTER_VOICE_INPUT_DEVICE_RESPONSE_MESSAGE    | Voice           |
| 0x1E | 30  | SET_RECORDING_STATE_MESSAGE                     | Voice           |
| 0x1F | 31  | SEND_VOICE_INPUT_MESSAGE                        | Voice           |
| 0x20 | 32  | PLAYBACK_QUEUE_REQUEST_MESSAGE                  | Queue           |
| 0x21 | 33  | TRANSACTION_MESSAGE                             | System          |
| 0x22 | 34  | CRYPTO_PAIRING_MESSAGE                          | Pairing         |
| 0x23 | 35  | GAME_CONTROLLER_PROPERTIES_MESSAGE              | Game            |
| 0x24 | 36  | SET_READY_STATE_MESSAGE                         | System          |
| 0x25 | 37  | DEVICE_INFO_UPDATE_MESSAGE                      | System          |
| 0x26 | 38  | SET_CONNECTION_STATE_MESSAGE                    | System          |
| 0x27 | 39  | SEND_BUTTON_EVENT_MESSAGE                       | HID             |
| 0x28 | 40  | SET_HILITE_MODE_MESSAGE                         | System          |
| 0x29 | 41  | WAKE_DEVICE_MESSAGE                             | System          |
| 0x2A | 42  | GENERIC_MESSAGE                                 | System          |
| 0x2B | 43  | SEND_PACKED_VIRTUAL_TOUCH_EVENT_MESSAGE         | Touch           |
| 0x2C | 44  | SEND_LYRICS_EVENT                               | Lyrics          |
| 0x2E | 46  | SET_NOW_PLAYING_CLIENT_MESSAGE                  | NowPlaying      |
| 0x2F | 47  | SET_NOW_PLAYING_PLAYER_MESSAGE                  | NowPlaying      |
| 0x30 | 48  | MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE           | MultiRoom       |
| 0x31 | 49  | GET_VOLUME_MESSAGE                              | Volume          |
| 0x32 | 50  | GET_VOLUME_RESULT_MESSAGE                       | Volume          |
| 0x33 | 51  | SET_VOLUME_MESSAGE                              | Volume          |
| 0x34 | 52  | VOLUME_DID_CHANGE_MESSAGE                       | Volume          |
| 0x35 | 53  | REMOVE_CLIENT_MESSAGE                           | NowPlaying      |
| 0x36 | 54  | REMOVE_PLAYER_MESSAGE                           | NowPlaying      |
| 0x37 | 55  | UPDATE_CLIENT_MESSAGE                           | NowPlaying      |
| 0x38 | 56  | UPDATE_CONTENT_ITEM_MESSAGE                     | Content         |
| 0x39 | 57  | UPDATE_CONTENT_ITEM_ARTWORK_MESSAGE             | Artwork         |
| 0x3A | 58  | UPDATE_PLAYER_MESSAGE                           | NowPlaying      |
| 0x3B | 59  | PROMPT_FOR_ROUTE_AUTHORIZATION_MESSAGE          | Routing         |
| 0x3C | 60  | PROMPT_FOR_ROUTE_AUTHORIZATION_RESPONSE_MESSAGE | Routing         |
| 0x3D | 61  | PRESENT_ROUTE_AUTHORIZATION_STATUS_MESSAGE      | Routing         |
| 0x3E | 62  | GET_VOLUME_CONTROL_CAPABILITIES_MESSAGE         | Volume          |
| 0x3F | 63  | GET_VOLUME_CONTROL_CAPABILITIES_RESULT_MESSAGE  | Volume          |
| 0x40 | 64  | VOLUME_CONTROL_CAPABILITIES_DID_CHANGE_MESSAGE  | Volume          |
| 0x41 | 65  | SYNC_OUTPUT_DEVICES_MESSAGE                     | MultiRoom       |
| 0x42 | 66  | REMOVE_SYNCED_OUTPUT_DEVICES_MESSAGE            | MultiRoom       |
| 0x43 | 67  | REMOTE_TEXT_INPUT_MESSAGE                       | Keyboard        |
| 0x44 | 68  | GET_REMOTE_TEXT_INPUT_SESSION_MESSAGE           | Keyboard        |
| 0x45 | 69  | REMOVE_FROM_PARENT_GROUP_MESSAGE                | MultiRoom       |
| 0x46 | 70  | PLAYBACK_SESSION_REQUEST_MESSAGE                | Session         |
| 0x47 | 71  | PLAYBACK_SESSION_RESPONSE_MESSAGE               | Session         |
| 0x48 | 72  | SET_DEFAULT_SUPPORTED_COMMANDS_MESSAGE          | Playback        |
| 0x49 | 73  | PLAYBACK_SESSION_MIGRATE_REQUEST_MESSAGE        | Session         |
| 0x4A | 74  | PLAYBACK_SESSION_MIGRATE_RESPONSE_MESSAGE       | Session         |
| 0x4B | 75  | PLAYBACK_SESSION_MIGRATE_BEGIN_MESSAGE          | Session         |
| 0x4C | 76  | PLAYBACK_SESSION_MIGRATE_END_MESSAGE            | Session         |
| 0x4D | 77  | UPDATE_ACTIVE_SYSTEM_ENDPOINT_MESSAGE           | System          |
| 0x4E | 78  | PLAYBACK_SESSION_MIGRATE_POST_MESSAGE           | Session         |
|      |     | *Gap: 79-100 ongebruikt*                        |                 |
| 0x65 | 101 | SET_DISCOVERY_MODE_MESSAGE                      | Discovery       |
| 0x66 | 102 | UPDATE_SYNCED_ENDPOINTS_MESSAGE                 | Discovery       |
| 0x67 | 103 | REMOVE_SYNCED_ENDPOINTS_MESSAGE                 | Discovery       |
| 0x68 | 104 | PLAYER_CLIENT_PROPERTIES_MESSAGE                | NowPlaying      |
| 0x69 | 105 | ORIGIN_CLIENT_PROPERTIES_MESSAGE                | NowPlaying      |
| 0x6A | 106 | AUDIO_FADE_MESSAGE                              | Audio           |
| 0x6B | 107 | AUDIO_FADE_RESPONSE_MESSAGE                     | Audio           |
| 0x6C | 108 | DISCOVERY_UPDATE_ENDPOINTS_MESSAGE              | Discovery       |
| 0x6D | 109 | DISCOVERY_UPDATE_OUTPUT_DEVICES_MESSAGE         | Discovery       |
| 0x6E | 110 | SET_LISTENING_MODE_MESSAGE                      | AirPods         |
|      |     | *Gap: 111-119 ongebruikt*                       |                 |
| 0x78 | 120 | CONFIGURE_CONNECTION_MESSAGE                    | System          |
| 0x79 | 121 | CREATE_HOSTED_ENDPOINT_REQUEST_MESSAGE          | Endpoint        |
| 0x7A | 122 | CREATE_HOSTED_ENDPOINT_RESPONSE_MESSAGE         | Endpoint        |
|      |     | *Gap: 123-124 ongebruikt*                       |                 |
| 0x7D | 125 | ADJUST_VOLUME_MESSAGE                           | Volume          |
| 0x7E | 126 | GET_VOLUME_MUTED_MESSAGE                        | Volume          |
| 0x7F | 127 | GET_VOLUME_MUTED_RESULT_MESSAGE                 | Volume          |
| 0x80 | 128 | SET_VOLUME_MUTED_MESSAGE                        | Volume          |
| 0x81 | 129 | VOLUME_MUTED_DID_CHANGE_MESSAGE                 | Volume          |
| 0x82 | 130 | SET_CONVERSATION_DETECTION_ENABLED_MESSAGE      | AirPods         |
| 0x83 | 131 | PLAYER_CLIENT_PARTICIPANTS_UPDATE_MESSAGE       | SharePlay       |
| 0x84 | 132 | REQUEST_GROUP_SESSION_MESSAGE                   | SharePlay       |
| 0x85 | 133 | CONFIGURE_CONNECTION_SERVICE_MESSAGE            | MultiRoom       |
| 0x86 | 134 | CREATE_APPLICATION_CONNECTION_MESSAGE           | AppConnection   |
| 0x87 | 135 | APPLICATION_CONNECTION_PROTOCOL_MESSAGE         | AppConnection   |
| 0x88 | 136 | INVALIDATE_APPLICATION_CONNECTION_MESSAGE       | AppConnection   |
| 0x89 | 137 | MICROPHONE_CONNECTION_REQUEST_MESSAGE           | Microphone      |
| 0x8A | 138 | MICROPHONE_CONNECTION_RESPONSE_MESSAGE          | Microphone      |

**Verwijderd uit enum (geen eigen ProtocolMessage.Type in Apple's code):**
- `NOW_PLAYING_AUDIO_FORMAT_CONTENT_INFO_MESSAGE` — embedded type, geen top-level message
- `GROUP_SESSION_JOIN_RESPONSE_MESSAGE`, `GROUP_SESSION_FAST_SYNC_MESSAGE`, `GROUP_SESSION_IDENTITY_SHARE_MESSAGE`, `GROUP_SESSION_IDENTITY_SHARE_REPLY_MESSAGE`, `GROUP_SESSION_LEADER_DISCOVERY_MESSAGE`, `GROUP_SESSION_MEMBER_SYNC_MESSAGE`, `GROUP_SESSION_ERROR_REPLY_MESSAGE` — sub-types van GroupSession, geen eigen message types

**Correcties ten opzichte van pyatv/bunatv:**
- Types 1-107: ✅ Correct in alle projecten
- Types 108+: ❌ Waren verkeerd genummerd in pyatv/bunatv (en door ons overgenomen)
- `PLAYBACK_SESSION_MIGRATE_POST_MESSAGE`: was 108, moet 78
- `SET_CONVERSATION_DETECTION_ENABLED_MESSAGE`: was 109, moet 130
- `CREATE_APPLICATION_CONNECTION_MESSAGE`: was 113, moet 134
- `CREATE_HOSTED_ENDPOINT_REQUEST/RESPONSE_MESSAGE`: waren 114/115, moeten 121/122
- Meerdere types 108-110 zijn nieuw en bestonden niet in pyatv/bunatv

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

**MRP protocol — wat je WEL krijgt:**
- `ContentItemMetadata.lyricsAdamID` (field 104) — Apple Music catalog ID (referentie, geen data)
- `ContentItemMetadata.lyricsAvailable` (field 24) — boolean, of lyrics bestaan
- `ContentItemMetadata.lyricsURL` (field 71) — URL (meestal leeg voor remote)
- `ContentItem.lyrics.lyrics` (field 7) — soms plain text, vaak leeg
- `SendLyricsEventMessage` (type 44) — real-time timing events, maar alleen als de Apple TV zelf lyrics geladen heeft (lokaal UI). Wordt **niet** gepusht naar remote controllers.

**MRP protocol — wat je NIET krijgt:**
- TTML data (word-level timing) komt **niet** via MRP
- Plain text lyrics zijn niet gegarandeerd in de PlaybackQueue response

**Hoe lyrics wél werken (Apple Music Store API):**
- `LyricsHandler::StartGettingStoreLyrics()` → `StoreGetLyricsRequest` met `lyricsAdamID`
- Bag URLs: `bag://musicSubscription/lyrics` (plain text), `bag://musicSubscription/ttmlLyrics` (TTML XML)
- Authenticatie via `cloud-lyrics-token` (`kExtDAAPCloudLyricsTokenCode`)
- Vereist actief Apple Music abonnement
- Lyrics flags struct: `{initialized, hasLibraryLyrics, hasStoreLyrics, hasDownloadedCatalogLyrics, hasTimeSyncedLyrics, text, TTML}`
- TTML opslag: `/var/mobile/Media/ttml/` (iOS)

**Conclusie:** Lyrics zijn een Apple Music Store feature, geen MRP protocol feature. Zonder Apple ID token + Apple Music abonnement zijn lyrics niet op te halen. Het `DelegationService` protocol (zie hierboven) is Apple's mechanisme om een Apple ID te delegeren naar een AirPlay device, maar vereist FairPlay authenticatie.

**UI klassen (ter referentie):**
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

## 16. AirPlayReceiver Framework Analyse

> Bron: `/tmp/libraries/System/Library/PrivateFrameworks/AirPlayReceiver.framework/Versions/A/AirPlayReceiver`
> Dit is de receiver-kant (Apple TV / HomePod).

### Nieuwe HTTP/RTSP Endpoints

Endpoints die we niet kenden:

| Endpoint              | Doel                                  |
|-----------------------|---------------------------------------|
| `/action`             | Onbekend                              |
| `/audioMode`          | Audio modus instelling                |
| `/authorize`          | Autorisatie                           |
| `/configure`          | Video configuratie                    |
| `/ensure-pair-pin`    | PIN pairing validatie                 |
| `/getProperty`        | Property ophalen                      |
| `/setProperty`        | Property instellen                    |
| `/metrics`            | Performance metrics                   |
| `/pair-add`           | Peer toevoegen aan pairing database   |
| `/pair-list`          | Gepaarde peers opvragen               |
| `/pair-remove`        | Peer verwijderen uit pairing database |
| `/pair-pin-start`     | PIN-pairing starten                   |
| `/photo`              | Foto weergave                         |
| `/present`            | Screen mirroring starten              |
| `/resources`          | Resource bestanden ophalen            |
| `/slideshow-features` | Slideshow capabilities                |
| `/test`               | Test endpoint                         |

### Audio Transport Types

Vijf stream connection types:

| Type                                   | Protocol | Beschrijving                                          |
|----------------------------------------|----------|-------------------------------------------------------|
| `streamConnectionTypeRTP`              | UDP      | Traditioneel RTP (wat wij gebruiken)                  |
| `streamConnectionTypeRTCP`             | UDP      | RTCP feedback                                         |
| `streamConnectionTypeAPAP`             | ?        | Apple Proprietary Audio Protocol                      |
| `streamConnectionTypeAPAT`             | TCP      | Apple Proprietary Audio Transport (alleen BufferedNW) |
| `streamConnectionTypeMediaDataControl` | TCP      | Control channel voor media data                       |

APAT is TCP-gebaseerd met congestion control:
- `protocolDriverAPATTickIntervalMS` — tick interval
- `protocolDriverAPAT_maxCCFBDelayMs` — max congestion control feedback delay
- Buffer parameters: `audioBufferSize`, `decodeBufferSize`, `maxPacketSize`, `nodeCount`

### APAC Codec (Volledige formaten)

Apple Proprietary Audio Codec — exclusief op 48kHz, tot 9.1.6 surround:

```
APAC/48000/2        (stereo)
APAC/48000/5.1      APAC/48000/5.1.2    APAC/48000/5.1.4
APAC/48000/7.1      APAC/48000/7.1.2    APAC/48000/7.1.4
APAC/48000/9.1.6    (Dolby Atmos-niveau)
```

MAT Atmos passthrough: `APSReceiverAudioSessionBufferedHoseEnableMATAtmosPlayback`

### Ghost Audio Sessions

`APReceiverAudioSessionGhost` — speciale session voor cluster members die geen audio ontvangen maar wel actief zijn in een multi-room groep. Heeft eigen `SetRateAndAnchorTime`, `StartPacketProcesser`, `StopPacketProcesser`.

### SenderUIEventsChannel

Twee aparte remote control kanalen op de receiver:

1. **MediaRemote** (`APReceiverRemoteControlSessionMediaRemote`) — voor media commands (wat wij gebruiken via DataStream)
2. **SenderUIEventsChannel** (`APReceiverRemoteControlSessionSenderUIEventsChannel`) — voor UI events
   - `SupportsSenderUIEvents` capability flag
   - `RCS-SenderUIEventsChannel` stream naam
   - Touch setup: `com.apple.TouchRemote.deviceSetupActive`
   - Eigen `APMediaDataControlServer` transport

### Cluster/Multi-room Details

**Cluster Types:**
- `ClusterType_Generic` — multi-room
- `ClusterType_HT` — Home Theater
- `ClusterType_StereoPair` — stereo paar

**TightSync (gesynchroniseerde audio):**
- `TightSyncUUID`, `TightSyncGroupLeaderUUID`, `IsTightSyncGroupLeader`
- `tightSyncGroupModel` — model van de tight sync groep
- Buddy reachability tracking bij session start/end

**Persistent Groups:**
- `Persistent Group UUID/Leader UUID/MemberID/Name/Size/Type/Model`

**Silent Primary:**
- `IsSilentPrimary` — receiver is actief in cluster maar speelt niet
- `SmartRouting` — intelligente audio routing

### Pairing Varianten (Receiver-kant)

| Variant                         | Type                       |
|---------------------------------|----------------------------|
| `pair-setup CU, type %u`        | CoreUtils pairing (modern) |
| `pair-setup UA`                 | Unauthenticated            |
| `pair-setup PIN` / `PIN Legacy` | PIN-based                  |
| `pair-verify-HK`                | HomeKit verify             |
| `pair-verify-AO`                | Apple Owner verify         |
| `pair-verify-System`            | System pairing verify      |
| `pair-verify-Other`             | Overig                     |

Access control: `AccessControlType`, `AccessControlLevelHK`, `EnableHKAccessControl`

### Keep-Alive (Receiver-kant)

- Timer-based: `_mcProcessor_KeepAliveTimer`
- Timeout detectie: `No activity from client in %llu seconds, stopping keep-alive timer`
- `keepAliveSendStatsAsBody` — stats als body bij keep-alive
- Screen keep-alive apart: `aprscreen_handleKeepAlive`
- TCP keep-alive config: `remoteControlTCPKeepAliveIdleSecs`, `remoteControlTCPKeepAliveIntervalSecs`, `remoteControlTCPKeepAliveMaxUnansweredProbes`

### PTP 1588 Clock

- `1588Clock support changed` — PTP als alternatief voor NTP
- `UsePTPClock` — configureerbare toggle
- Grandmaster ID tracking
- NTP als fallback: `<APNTPClientLegacy %p>`

### Flush Operaties

Twee typen:
- `FLUSH` — standaard (alle audio)
- `FLUSHBUFFERED` — specifiek voor buffered audio
- `FlushWithinRange` — range-based met `flushFromSeq/TS` en `flushUntilSeq/TS`

### Overige Features

- **Valeria** — Apple Vision Pro integratie (`APValeriaHelper`, `IsValeria`)
- **UGL** — Universal Game Link voor laag-latentie gaming (`<APUGLPort>`, `uglServerInfo`)
- **MC2UC** — Multicast-naar-unicast detectie (`APMulticastProbeReceiver`)
- **NearbyInteraction/UWB** — Device proximity via `NISpatialBrowsingConfiguration`
- **Rapport** — BLE/P2P remote control transport (`rapport_remote_control_transport`)
- **DACP commands** — Receiver stuurt volume/playback commands via `GET /ctrl-int/1/%s HTTP/1.1`
- **HDR** — `DisplayHDRMode`, `receiverHDRCapability`
- **Packet Loss Concealment** — `plcCodecIsUsed`, `plcMode`, `plcSamplesCorrected`

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
