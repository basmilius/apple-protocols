# Companion Link Protocol — Volledig Onderzoeksrapport

> Gebaseerd op disassembly van TVRemoteCore, CompanionServices, Rapport, RemoteHID, RemoteTextInput frameworks
> Datum: 2026-03-24

---

## 1. Protocol Overview

### 1.1 Transport

- TCP poort via mDNS `_companion-link._tcp`
- Frame: `[1 byte type][3 bytes BE length][payload]`
- OPack encoding voor messages
- ChaCha20-Poly1305 encryptie
- Nonce: 8-byte LE counter + 4 zero bytes (12 bytes totaal)
- AAD: 4-byte frame header
- HKDF keys: `ServerEncrypt-main` (read), `ClientEncrypt-main` (write)

### 1.2 Frame Types

| ID | Naam                   | Richting      | Doel                      |
|----|------------------------|---------------|---------------------------|
| 0  | Unknown                | -             | -                         |
| 1  | NoOp                   | Client→Server | Heartbeat/keepalive       |
| 3  | PairSetupStart         | Bi            | M1 pair-setup             |
| 4  | PairSetupNext          | Bi            | M3/M5 pair-setup          |
| 5  | PairVerifyStart        | Bi            | M1 pair-verify            |
| 6  | PairVerifyNext         | Bi            | M3 pair-verify            |
| 7  | OPackUnencrypted       | Bi            | OPack data voor encryptie |
| 8  | OPackEncrypted         | Bi            | OPack data na encryptie   |
| 9  | OPackPacked            | Bi            | OPack compact formaat     |
| 10 | PairingRequest         | Bi            | Family identity pairing   |
| 11 | PairingResponse        | Bi            | Family identity pairing   |
| 16 | SessionStartRequest    | Client→Server | Rapport sessie start      |
| 17 | SessionStartResponse   | Server→Client | Rapport sessie response   |
| 18 | SessionData            | Bi            | Rapport sessie data       |
| 32 | FamilyIdentityRequest  | Bi            | Familie identiteit        |
| 33 | FamilyIdentityResponse | Bi            | Familie identiteit        |
| 34 | FamilyIdentityUpdate   | Bi            | Familie identiteit update |

### 1.3 OPack Message Structure

| Veld         | Type    | Doel                                      |
|--------------|---------|-------------------------------------------|
| `_i`         | string  | Message identifier (commando)             |
| `_t`         | number  | Type: 1=Event, 2=Request, 3=Response      |
| `_x`         | number  | Transaction ID (koppelt request/response) |
| `_c`         | object  | Content payload                           |
| `_btHP`      | boolean | Bluetooth High Priority (optioneel)       |
| `_inUseProc` | string  | In-use process naam (optioneel)           |
| `_cht`       | boolean | Chatty flag (optioneel)                   |

### 1.4 Connection Lifecycle (Rapport state machine)

```
CInit → CConnectStart → CConnectWait → CPreAuthStart → CPreAuthWait
  → CPSStart → CPSWait (PairSetup)
  → CPVStart → CPVWait (PairVerify)
  → CPSKPrepare (pre-shared key)
  → CSessionStart → CSessionWait (systemInfo exchange)
  → CMsg (berichten uitwisselen)
  → CError → CRetryStart → CRetryWait
```

---

## 2. Sessie Types

| Sessie        | Start/Stop `_i`                        | Doel                                 |
|---------------|----------------------------------------|--------------------------------------|
| Main          | `_sessionStart` / `_sessionStop`       | Service `com.apple.tvremoteservices` |
| TVRC          | `TVRCSessionStart` / `TVRCSessionStop` | TV Remote Control                    |
| HID           | `_hidC`                                | Button events                        |
| Touch         | `_touchStart` / `_touchStop`           | Trackpad/swipe navigatie             |
| Text Input    | `_tiStart` / `_tiStop`                 | Keyboard input                       |
| Media Control | `_iMC` (interest)                      | Volume, captions, media commands     |
| Siri          | `_siriStart` / `_siriStop`             | Push-to-talk Siri + audio            |
| Siri Audio    | RPSiriAudioSession                     | Audio data voor Siri                 |

### Feature Versioning (tvOS sourceVersion)

| Versie    | Feature                       |
|-----------|-------------------------------|
| >= 250.3  | MediaControl                  |
| >= 340.15 | TextInput, MVPD (TV Provider) |
| >= 600.20 | SiriPTT (Push-to-Talk)        |

---

## 3. Alle Message Types

### 3.1 Requests (Client → Server, `_t: 2`)

| `_i`                               | Content keys                                                 | Beschrijving                        |
|------------------------------------|--------------------------------------------------------------|-------------------------------------|
| `_systemInfo`                      | `_bf, _cf, _clFl, _i, _idsID, _pubID, _sf, _sv, model, name` | Systeem info uitwisseling           |
| `_sessionStart`                    | `_srvT, _sid, _btHP`                                         | Start service sessie                |
| `_sessionStop`                     | `_srvT, _sid`                                                | Stop service sessie                 |
| `TVRCSessionStart`                 | `_btHP, _inUseProc`                                          | Start TV Remote sessie              |
| `TVRCSessionStop`                  | -                                                            | Stop TV Remote sessie               |
| `_hidC`                            | `_hBtS, _hidC`                                               | HID command (button state + ID)     |
| `_touchStart`                      | `_height, _width, _tFl`                                      | Start touch sessie                  |
| `_touchStop`                       | `_i`                                                         | Stop touch sessie                   |
| `_touchC`                          | `_tFg, _tPh, _tX, _tY`                                       | Touch event                         |
| `_tiStart`                         | -                                                            | Start text input                    |
| `_tiStop`                          | -                                                            | Stop text input                     |
| `_tiC`                             | `_tiV, _tiD`                                                 | Text input change (NSKeyedArchiver) |
| `_mcc`                             | `_mcc, _skpS, _vol`                                          | Media control command               |
| `_launchApp`                       | `_bundleID` of `_urlS`                                       | Launch app of URL                   |
| `FetchLaunchableApplicationsEvent` | -                                                            | Lijst van launchbare apps           |
| `FetchUserAccountsEvent`           | -                                                            | Gebruikersaccounts                  |
| `SwitchUserAccountEvent`           | `SwitchAccountID`                                            | Wissel gebruiker                    |
| `FetchAttentionState`              | -                                                            | Power/attention state               |
| `FetchSiriRemoteInfo`              | -                                                            | Siri Remote info                    |
| `FetchSiriStatus`                  | -                                                            | Siri beschikbaarheid                |
| `FetchSupportedActionsEvent`       | -                                                            | Ondersteunde acties                 |
| `FetchCurrentNowPlayingInfoEvent`  | -                                                            | Now playing info                    |
| `FetchMediaControlStatus`          | -                                                            | Media control status                |
| `FetchUpNextInfoEvent`             | `PaginationTokenKey`                                         | Up Next lijst                       |
| `AddToUpNextEvent`                 | `IdentifierKey, KindKey`                                     | Toevoegen aan Up Next               |
| `RemoveFromUpNextEvent`            | `IdentifierKey, KindKey`                                     | Verwijderen uit Up Next             |
| `MarkAsWatchedEvent`               | `IdentifierKey, KindKey`                                     | Markeer als bekeken                 |
| `PlayMediaEvent`                   | media item                                                   | Media afspelen                      |
| `PublishPresenceEvent`             | -                                                            | Device aanwezigheid                 |
| `ToggleCaptions`                   | -                                                            | Ondertiteling toggle                |
| `ToggleReduceLoudSounds`           | `ReduceLoundSoundsEnabled`                                   | Volume limiet                       |
| `ToggleSystemAppearance`           | `SystemAppearanceLight`                                      | Dark/light mode                     |
| `ToggleFindingMode`                | `FindingModeEnabledKey`                                      | Find My Remote                      |
| `_siriStart`                       | -                                                            | Start Siri PTT                      |
| `_siriStop`                        | -                                                            | Stop Siri                           |
| `_ping`                            | -                                                            | Ping                                |
| `_systemInfoUpdate`                | -                                                            | System info update                  |

### 3.2 Server Events (Server → Client)

| `_i`                 | Content keys        | Beschrijving                |
|----------------------|---------------------|-----------------------------|
| `SystemStatus`       | `state`             | Power state change          |
| `TVSystemStatus`     | `state`             | TV system status            |
| `_iMC`               | `_mcF, _mcs`        | Media control status update |
| `_tiStarted`         | `_tiV, _tiD`        | Text input sessie gestart   |
| `_tiStopped`         | -                   | Text input sessie gestopt   |
| `NowPlayingInfo`     | `NowPlayingInfoKey` | Now playing update          |
| `SupportedActions`   | actions             | Acties gewijzigd            |
| `SiriStatus`         | status              | Siri status                 |
| `MediaControlStatus` | `MediaControlFlags` | Media flags gewijzigd       |

---

## 4. HID Commands

### 4.1 Bekende Command IDs

| ID | Command          | HID Usage       |
|----|------------------|-----------------|
| 1  | Up               | Generic Desktop |
| 2  | Down             | Generic Desktop |
| 3  | Left             | Generic Desktop |
| 4  | Right            | Generic Desktop |
| 5  | Menu             | Consumer        |
| 6  | Select           | Generic Desktop |
| 7  | Home             | Consumer        |
| 8  | VolumeUp         | Consumer        |
| 9  | VolumeDown       | Consumer        |
| 10 | Siri             | Consumer        |
| 11 | Screensaver      | Consumer        |
| 12 | Sleep            | Consumer        |
| 13 | Wake             | Consumer        |
| 14 | PlayPause        | Consumer        |
| 15 | ChannelIncrement | Consumer        |
| 16 | ChannelDecrement | Consumer        |
| 17 | Guide            | Consumer        |
| 18 | PageUp           | Generic Desktop |
| 19 | PageDown         | Generic Desktop |

### 4.2 Extra commands uit TVRemoteCore (IDs onbekend, te testen)

Power, Mute, SkipForward, SkipBackward, Back, Exit, Info, CaptionsToggle, CaptionsAlwaysOn, CaptionsForcedOnly, ActivateScreenSaver

### 4.3 Button States (`_hBtS`)

| Waarde | State                |
|--------|----------------------|
| 1      | ButtonDown / Pressed |
| 2      | ButtonUp / Released  |

---

## 5. Touch Events

### 5.1 Sessie setup

```
_touchStart: { _height: float, _width: float, _tFl: number }
_touchStop: { _i: number }
```

### 5.2 Touch event

```
_touchC: {
    _tFg: number,   // finger ID (0-based)
    _tPh: number,   // phase
    _tX: float,     // x positie (0.0 - width)
    _tY: float      // y positie (0.0 - height)
}
```

### 5.3 Touch phases

| Waarde | Phase      |
|--------|------------|
| 0      | Began      |
| 1      | Moved      |
| 2      | Ended      |
| 3      | Cancelled  |
| 4      | Stationary |

---

## 6. Media Control Commands

| ID | Command            | Extra content keys |
|----|--------------------|--------------------|
| 1  | Play               | -                  |
| 2  | Pause              | -                  |
| 3  | NextTrack          | -                  |
| 4  | PreviousTrack      | -                  |
| 5  | GetVolume          | -                  |
| 6  | SetVolume          | `_vol`             |
| 7  | SkipBy             | `_skpS` (seconds)  |
| 8  | FastForwardBegin   | -                  |
| 9  | FastForwardEnd     | -                  |
| 10 | RewindBegin        | -                  |
| 11 | RewindEnd          | -                  |
| 12 | GetCaptionSettings | -                  |
| 13 | SetCaptionSettings | `_mcs`             |

---

## 7. Text Input (RTI)

### 7.1 Flow

1. `_tiStart` request → server stuurt `_tiStarted` event met `_tiD` (NSKeyedArchiver met sessionUUID)
2. Client stuurt `_tiC` events met `_tiD` (NSKeyedArchiver `RTITextOperations`)
3. `_tiStop` beëindigt de sessie

### 7.2 RTITextOperations velden

```
keyboardOutput          — TIKeyboardOutput met insertionText
intermediateText        — tussentijdse tekst (compositie)
textToAssert            — tekst om te forceren
selectionRangeToAssert  — selectie range
editingActionSelector   — editing actie (cut/copy/paste/selectAll)
targetSessionUUID       — sessie UUID
inputSourceState        — input bron status
fileHandles             — bestanden
attachmentDatas         — bijlagen
imageGlyphs             — afbeeldingen (Genmoji)
```

---

## 8. CompanionServices (CPS)

### 8.1 Authentication Flows

- AppSignIn — Sign in with Apple op de TV
- StorePurchase — App Store aankopen
- StoreAuthentication — iTunes Store
- SystemAuthentication — Systeem passwords
- TVProvider — TV provider authenticatie
- RestrictedAccess — Kinderbescherming
- AmbientSetup — Setup flows

### 8.2 Apple Intelligence

`CPSRemoteLLM` — Remote Large Language Model via companion device:
- `CPSRemoteLLMInfoRequest/Response`
- `CPSRemoteLLMPerformRequest/Response`
- Features: `foundationModelsLLM`, `interlinkedLLM`

---

## 9. Rapport Integratie

### 9.1 Transport Types

- BTPipe (Bluetooth)
- iWiFi (Infrastructure WiFi)
- AWDL (Apple Wireless Direct Link)
- Cloud (iCloud relay)
- Direct (TCP)

### 9.2 Identity/Access Levels

Self, SameAccountDevice, Family, Friend, SharedHome, Paired, SessionPaired, AdHocPaired, SharedTVUser, Guest

---

## 10. Huidige Implementatie Status

### Wat we HEBBEN

- Frame encoding/decoding, OPack framing
- Pair-setup (M1-M6), Pair-verify + encryption
- System info exchange, Session start/stop, TVRC session
- 19 HID commands, button press types (single/double/hold)
- Touch start/stop (maar geen touch events sturen)
- Text input start/stop/send/clear (basis)
- 13 media control commands
- App launching, account switching, attention state
- Event subscriptions, heartbeat

### Wat we MISSEN

#### Hoog

1. **Touch events sturen** — `_touchC` met finger, phase, x, y. Ontsluit swipe-navigatie.
2. **Extra HID commands** — Power, Mute, SkipForward/Backward, Back, Exit, Info
3. **Media control flags** — `_mcF` bitmask parsing voor beschikbare commands
4. **Feature versioning** — sourceVersion check voor tvOS feature support

#### Medium

5. **Caption control** — ToggleCaptions, GetCaptionSettings, SetCaptionSettings
6. **System appearance** — ToggleSystemAppearance (dark/light mode)
7. **Siri Push-to-Talk** — `_siriStart`/`_siriStop` + audio
8. **Up Next management** — Fetch, Add, Remove, MarkAsWatched, PlayMedia
9. **Reduce Loud Sounds** — ToggleReduceLoudSounds
10. **Find My Remote** — ToggleFindingMode

#### Laag

11. **Game controller events** — Joystick input
12. **Volledige RTI** — Selectie, editing, lexicons, document state
13. **CPS auth proxy** — App Sign-In, Store Purchase
14. **CPSRemoteLLM** — Apple Intelligence via companion
15. **HIDTimeSyncProtocol** — Tijd synchronisatie voor HID events
