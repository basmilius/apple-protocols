# Apple Private Frameworks Reference

> Knowledge base extracted from ARM64 Mach-O binary analysis of Apple's private frameworks.
> Source: `/System/Library/PrivateFrameworks/` on macOS/iOS.
> Date: March 2026 (iOS 26.4 / tvOS 26.4)

---

## Table of Contents

1. [Framework Overview](#1-framework-overview)
2. [AirPlay Protocol](#2-airplay-protocol)
3. [Companion Link Protocol](#3-companion-link-protocol)
4. [Media Remote Protocol (MRP)](#4-media-remote-protocol-mrp)
5. [Encryption & Pairing](#5-encryption--pairing)
6. [Audio Streaming](#6-audio-streaming)
7. [RAOP Protocol](#7-raop-protocol)
8. [Screen Mirroring](#8-screen-mirroring)
9. [Protobuf Field Numbers](#9-protobuf-field-numbers)
10. [Feature Flags](#10-feature-flags)
11. [Unimplemented Features](#11-unimplemented-features)

---

## 1. Framework Overview

### Analyzed Frameworks

| Framework          | Location          | Purpose                                                                   |
|--------------------|-------------------|---------------------------------------------------------------------------|
| AirPlayReceiver    | PrivateFrameworks | AirPlay receiver-side (Apple TV) — RTSP endpoints, audio/video processing |
| AirPlaySender      | PrivateFrameworks | AirPlay sender-side (iPhone/Mac) — stream setup, feature negotiation      |
| AirPlaySupport     | PrivateFrameworks | Shared AirPlay utilities — RTP packet processing, encryption              |
| MediaRemote        | PrivateFrameworks | MRP protocol — now playing, remote control, game controller               |
| TVRemoteCore       | PrivateFrameworks | TV remote control — Companion Link, voice controller                      |
| CompanionServices  | PrivateFrameworks | Companion Link service management                                         |
| Rapport            | PrivateFrameworks | Device-to-device communication — BLE discovery, Siri audio sessions       |
| RemoteHID          | PrivateFrameworks | HID event generation — button presses, touch events                       |
| RemoteTextInput    | PrivateFrameworks | Text input via RTI — keyboard, NSKeyedArchiver payloads                   |
| MediaControlSender | PrivateFrameworks | High-level media control — scrub, stop, volume                            |

### Analysis Methods

1. **Symbol extraction**: `nm -gU <binary>` for exported symbols
2. **String extraction**: `strings <binary>` for protocol constants, endpoint paths, FourCC codes
3. **Disassembly**: `objdump -d <binary>` or `otool -tV <binary>` for ARM64 instruction analysis
4. **writeTo: disassembly**: `mov w2, #fieldNum` instructions reveal protobuf field numbers
5. **OBJC_IVAR ordering**: Ivar addresses sorted ascending typically match field number order
6. **readFrom: tag extraction**: Protobuf wire tags `(fieldNumber << 3 | wireType)` in switch tables

---

## 2. AirPlay Protocol

### Connection Flow

```
1. mDNS discovery (_airplay._tcp)
2. TCP connect to AirPlay port
3. GET /info → receiver capabilities, sourceVersion, features/featuresEx
4. POST /pair-setup (SRP M1-M6) or POST /pair-verify (Curve25519)
5. Enable encryption on ControlStream (HKDF: Control-Salt)
6. SETUP event stream → TCP connection, HKDF: Events-Salt
7. SETUP data stream → TCP connection, HKDF: DataStream-Salt{seed}
8. RECORD → start streaming
9. /feedback loop (every 2 seconds) → keep-alive
10. TEARDOWN → end session
```

### RTSP Endpoints (Receiver)

| Endpoint             | Method | Handler Symbol                                           | Description                                     |
|----------------------|--------|----------------------------------------------------------|-------------------------------------------------|
| `/info`              | GET    | `airplayReqProcessor_requestProcessGetInfo`              | Device info, features, sourceVersion            |
| `/pair-pin-start`    | POST   | —                                                        | Trigger PIN display on Apple TV                 |
| `/pair-setup`        | POST   | `airplayReqProcessor_requestProcessPairSetupCoreUtils`   | SRP pairing (M1-M6)                             |
| `/pair-verify`       | POST   | `airplayReqProcessor_requestProcessPairVerify`           | Pair verify (Curve25519)                        |
| `/feedback`          | POST   | `airplayReqProcessor_requestProcessFeedback`             | Keep-alive heartbeat                            |
| `/play`              | POST   | —                                                        | URL playback (Content-Location, Start-Position) |
| `/playback-info`     | GET    | —                                                        | Playback status (position, duration, rate)      |
| `/rate?value=%f`     | POST   | `airplayReqProcessor_requestProcessSetRate`              | Set playback rate                               |
| `/volume?volume=%f`  | POST   | —                                                        | Set volume                                      |
| `/stop`              | POST   | `mcProcessor_requestProcessStop`                         | Stop URL playback                               |
| `/scrub?position=%f` | POST   | `MediaControlClient_DoScrubSet`                          | Seek to position                                |
| `/setProperty?%@`    | PUT    | —                                                        | Set arbitrary property                          |
| `/getProperty?%@`    | GET    | —                                                        | Get arbitrary property                          |
| `/rateandanchortime` | POST   | `airplayReqProcessor_requestProcessSetRateAndAnchorTime` | Rate + anchor (buffered audio)                  |
| `GetAnchor`          | GET    | `airplayReqProcessor_requestProcessGetAnchor`            | Get anchor time (buffered audio)                |
| `/fp-setup`          | POST   | `airplayReqProcessor_requestProcessFPSetup`              | FairPlay DRM setup                              |
| `/metrics`           | POST   | `airplayReqProcessor_requestProcessMetrics`              | Diagnostics metrics                             |
| `/audioMode`         | POST   | —                                                        | Set audio mode                                  |
| `/command`           | POST   | `airplayReqProcessor_requestProcessCommand`              | Generic command dispatch                        |
| `SETUP`              | RTSP   | `airplayReqProcessor_requestProcessSetupPlist`           | Stream setup (plist body)                       |
| `RECORD`             | RTSP   | `airplayReqProcessor_requestProcessRecord`               | Start streaming                                 |
| `TEARDOWN`           | RTSP   | `airplayReqProcessor_requestProcessTearDown`             | Stop session                                    |
| `FLUSH`              | RTSP   | `airplayReqProcessor_requestProcessFlush`                | Flush audio buffers                             |
| `SET_PARAMETER`      | RTSP   | `airplayReqProcessor_requestProcessSetParameter`         | Set parameter (text, DMAP, artwork)             |
| `GET_PARAMETER`      | RTSP   | `airplayReqProcessor_requestProcessGetParameter`         | Get parameter                                   |
| `ANNOUNCE`           | RTSP   | `airplayReqProcessor_requestProcessAnnounce`             | RAOP announce (SDP)                             |
| `OPTIONS`            | RTSP   | `airplayReqProcessor_requestProcessOptions`              | RTSP options                                    |
| `SetPeers`           | POST   | `airplayReqProcessor_requestProcessSetPeers`             | Multi-room peer list                            |

### EventStream Commands (Apple TV → Controller)

The Apple TV sends `POST /command` with a binary plist body over the reverse-HTTP EventStream. The `type` field is a FourCC code.

| FourCC              | Name              | Description                                 |
|---------------------|-------------------|---------------------------------------------|
| `died`              | SessionDied       | Session ended by receiver                   |
| `stup`              | Setup             | Setup-related event during stream setup     |
| `play`              | Play              | Start playback command                      |
| `paus`              | Pause             | Pause command                               |
| `setMode`           | SetMode           | Audio/screen mode change                    |
| `duckAudio`         | DuckAudio         | Temporarily lower audio volume (e.g., Siri) |
| `unduckAudio`       | UnduckAudio       | Restore audio volume                        |
| `restartBitstream`  | RestartBitstream  | Restart video bitstream (screen mirroring)  |
| `setRecordingState` | SetRecordingState | Screen recording on/off                     |
| `forceKeyFrame`     | ForceKeyFrame     | Force video key frame                       |

### DACP Properties (Legacy Volume Control)

| Property                                          | Direction | Description                 |
|---------------------------------------------------|-----------|-----------------------------|
| `com.apple.AirTunes.DACP.devicevolume`            | → TV      | Set device volume           |
| `com.apple.AirTunes.DACP.devicevolumechanged`     | TV →      | Volume changed notification |
| `com.apple.AirTunes.DACP.volumeup`                | → TV      | Volume up                   |
| `com.apple.AirTunes.DACP.volumedown`              | → TV      | Volume down                 |
| `com.apple.AirTunes.DACP.mutetoggle`              | → TV      | Toggle mute                 |
| `com.apple.AirTunes.DACP.device-prevent-playback` | → TV      | Prevent playback            |

### SETUP Body Structure

The SETUP request body is a binary plist with these key fields:

```
{
    streams: [{
        type: 96,                    // realtime audio
        audioFormat: 0x800,          // PCM 44100/24/2 (see Audio Formats)
        audioMode: 'default',
        ct: 1,                       // compression type (PCM)
        controlPort: <UDP port>,     // control channel port
        latencyMs: 2000,
        spf: 352,                    // samples per frame
        isMedia: true,
        isFPOffload: false,
        supportsDynamicStreamID: true,
        rtpTime: <random u32>,
        streamConnectionID: <random i64>
    }],
    timingPort: <UDP port>,
    timingProtocol: 'NTP',
    deviceID: '<pairing ID>',
    macAddress: '<MAC>',
    sessionUUID: '<UUID>',
    sourceVersion: '<version>',
    name: '<device name>',
    model: '<device model>',
    features: <lower 32 bits>,       // as integer
    featuresEx: <upper 32 bits>,     // as integer
    keepAliveSendStatsAsBody: true,
    osName: 'iPhone OS',
    osVersion: '<version>',
    osBuildVersion: '<build>'
}
```

### /info Response Structure

```
{
    name: 'Living Room',
    model: 'AppleTV11,1',
    sourceVersion: '940.23.1',
    features: <integer>,             // lower 32 bits
    featuresEx: <string or integer>, // upper 32 bits (may be hex string like "0x1a0")
    statusFlags: <integer>,
    deviceID: '<MAC>',
    pi: '<pairing ID>',
    pk: '<public key hex>',
    initialVolume: -20.0,
    supportedAudioFormats: <bitmask>
}
```

**Important**: `featuresEx` can be a number, decimal string, or hex string (with or without `0x` prefix). Always use robust parsing: `Number()` for numbers, `parseInt(str, 16)` for hex strings.

---

## 3. Companion Link Protocol

### Connection Flow

```
1. mDNS discovery (_companion-link._tcp)
2. TCP connect to Companion Link port
3. Pair-verify (OPack frames, Curve25519)
4. Enable encryption (HKDF: ServerEncrypt-main / ClientEncrypt-main)
5. _systemInfo → device identification
6. _sessionStart → service session (com.apple.tvremoteservices)
7. TVRCSessionStart → TV remote control session
8. _touchStart → enable trackpad
9. _tiStart → enable text input
10. Register interests (_iMC, TVSystemStatus, NowPlayingInfo, SupportedActions, SystemStatus)
11. Heartbeat loop (NoOp every 15 seconds)
```

### Frame Format

```
[type: 1 byte][payloadLength: 3 bytes BE][payload: N bytes][authTag: 16 bytes if encrypted]
```

### Frame Types

| Value | Name           | Description                  |
|-------|----------------|------------------------------|
| 1     | NoOp           | Heartbeat (always plaintext) |
| 3     | PairSetupData  | Pair-setup data frame        |
| 4     | PairVerifyData | Pair-verify data frame       |
| 8     | OPackEncrypted | Encrypted OPack message      |

### OPack Message Structure

| Field | Type   | Description                                  |
|-------|--------|----------------------------------------------|
| `_i`  | string | Message identifier (command name)            |
| `_t`  | number | 1=Event, 2=Request, 3=Response               |
| `_x`  | number | Transaction ID (correlates request/response) |
| `_c`  | object | Content payload                              |

### Encryption

- **Algorithm**: ChaCha20-Poly1305
- **Nonce format**: 12 bytes — 8-byte LE counter at offset 0, 4 zero bytes trailing
- **AAD**: 4-byte frame header
- **Key derivation**: HKDF-SHA512
  - Read key: info=`ServerEncrypt-main`, salt=empty
  - Write key: info=`ClientEncrypt-main`, salt=empty

### All Message Types

#### Requests (`_t: 2`)

| Message ID                         | Description                                                      |
|------------------------------------|------------------------------------------------------------------|
| `_systemInfo`                      | Device identification (name, model, sourceVersion, capabilities) |
| `_sessionStart`                    | Start service session                                            |
| `_sessionStop`                     | Stop service session                                             |
| `TVRCSessionStart`                 | Start TV remote control session                                  |
| `TVRCSessionStop`                  | Stop TV remote control session                                   |
| `_hidC`                            | HID button command                                               |
| `_touchStart`                      | Start trackpad session                                           |
| `_touchStop`                       | Stop trackpad session                                            |
| `_tiStart`                         | Start text input session                                         |
| `_tiStop`                          | Stop text input session                                          |
| `_mcc`                             | Media control command                                            |
| `_launchApp`                       | Launch app by bundle ID                                          |
| `_launchURL`                       | Launch URL                                                       |
| `FetchLaunchableApplicationsEvent` | List installed apps                                              |
| `FetchUserAccountsEvent`           | List user accounts                                               |
| `SwitchUserAccountEvent`           | Switch active user account                                       |
| `FetchAttentionState`              | Get device attention state                                       |
| `FetchSiriRemoteInfo`              | Get Siri Remote hardware info                                    |
| `FetchSiriStatus`                  | Get Siri status                                                  |
| `FetchSupportedActionsEvent`       | Get supported actions                                            |
| `FetchCurrentNowPlayingInfoEvent`  | Get now playing info                                             |
| `FetchMediaControlStatus`          | Get media control status                                         |
| `FetchUpNextInfoEvent`             | Get Up Next queue                                                |
| `AddToUpNextEvent`                 | Add item to Up Next                                              |
| `RemoveFromUpNextEvent`            | Remove item from Up Next                                         |
| `MarkAsWatchedEvent`               | Mark item as watched                                             |
| `PlayMediaEvent`                   | Play specific media item                                         |
| `PublishPresenceEvent`             | Publish controller presence                                      |
| `ToggleCaptions`                   | Toggle closed captions                                           |
| `ToggleReduceLoudSounds`           | Toggle reduce loud sounds                                        |
| `ToggleSystemAppearance`           | Toggle dark/light mode                                           |
| `ToggleFindingMode`                | Toggle Find My Remote                                            |
| `_siriStart`                       | Start Siri push-to-talk                                          |
| `_siriStop`                        | Stop Siri push-to-talk                                           |
| `_ping`                            | Ping                                                             |

#### Events (`_t: 1`)

| Message ID  | Description                                   |
|-------------|-----------------------------------------------|
| `_interest` | Register/deregister interest in server events |
| `_tiC`      | Text input change (RTI payload)               |
| `_touchC`   | Touch event (finger, phase, x, y)             |

#### Server-Initiated Events

| Event                | Description                                             |
|----------------------|---------------------------------------------------------|
| `SystemStatus`       | System attention state change                           |
| `TVSystemStatus`     | TV system attention state change                        |
| `_iMC`               | Media control flags changed (`_mcF` bitmask)            |
| `_tiStarted`         | Text input session started (with `_tiD` plist)          |
| `_tiStopped`         | Text input session stopped                              |
| `NowPlayingInfo`     | Now playing info changed (NSKeyedArchiver binary plist) |
| `SupportedActions`   | Supported actions changed                               |
| `SiriStatus`         | Siri status changed                                     |
| `MediaControlStatus` | Media control status changed                            |

### HID Command IDs

| ID | Command    | ID | Command     |
|----|------------|----|-------------|
| 1  | Up         | 11 | Screensaver |
| 2  | Down       | 12 | Sleep       |
| 3  | Left       | 13 | Wake        |
| 4  | Right      | 14 | PlayPause   |
| 5  | Menu       | 15 | ChannelUp   |
| 6  | Select     | 16 | ChannelDown |
| 7  | Home       | 17 | Guide       |
| 8  | VolumeUp   | 18 | PageUp      |
| 9  | VolumeDown | 19 | PageDown    |
| 10 | Siri       |    |             |

Button press types: `SingleTap` (default), `DoubleTap`, `Hold`

HID message format:
```
_i: '_hidC'
_t: 2 (Request)
_c: { _hidC: <commandId>, _hBtS: 1 (down) or 2 (up) }
```

### Touch Events

```
_touchStart: { _height: 1080, _width: 1920, _tFl: 2 }
_touchC:     { _tFg: <finger>, _tPh: <phase>, _tX: <x>, _tY: <y> }
_touchStop:  {}
```

Touch phases: 0=Began, 1=Moved, 2=Ended, 3=Cancelled, 4=Stationary

**Important**: Touch events (`_touchC`) are fire-and-forget. Apple's `MRTelevisionSendVirtualTouchEvent` returns `void` (no completion handler). Do NOT use exchange() for touch events — use send/event instead.

### Media Control Commands

| ID | Command       | ID | Command          |
|----|---------------|----|------------------|
| 1  | Play          | 8  | FastForwardBegin |
| 2  | Pause         | 9  | FastForwardEnd   |
| 3  | NextTrack     | 10 | RewindBegin      |
| 4  | PreviousTrack | 11 | RewindEnd        |
| 5  | GetVolume     | 12 | GetCaptions      |
| 6  | SetVolume     | 13 | SetCaptions      |
| 7  | SkipBy        |    |                  |

### Media Control Flags (`_mcF` Bitmask)

| Bit | Flag          | Value  |
|-----|---------------|--------|
| 0   | Play          | 0x0001 |
| 1   | Pause         | 0x0002 |
| 2   | PreviousTrack | 0x0004 |
| 3   | NextTrack     | 0x0008 |
| 4   | FastForward   | 0x0010 |
| 5   | Rewind        | 0x0020 |
| 8   | Volume        | 0x0100 |
| 9   | SkipForward   | 0x0200 |
| 10  | SkipBackward  | 0x0400 |

### Feature Versioning (tvOS sourceVersion)

| Threshold | Features Enabled  |
|-----------|-------------------|
| >= 250.3  | Media Control     |
| >= 340.15 | Text Input, MVPD  |
| >= 600.20 | Siri Push-to-Talk |

### Attention States

| Value | State       | Description           |
|-------|-------------|-----------------------|
| 0     | unknown     | State not determined  |
| 1     | asleep      | Device is sleeping    |
| 2     | screensaver | Screensaver is active |
| 3     | awake       | Device is fully awake |
| 4     | idle        | Device is idle        |

### systemInfo Message

The `_systemInfo` message identifies the controller to the Apple TV. Contains:

- `_i`: Hardcoded device identifier (must be stable across sessions — Apple TV uses this to recognize the remote)
- `_pubID`: Hardcoded MAC-style identifier (same reason)
- `_idsID`: Pairing ID
- `_sv`: Source version string
- `model`: Device model (e.g., `iPhone16,2`)
- `name`: Display name
- `_lP`: Local port
- `_sf`: Service flags (1099511628032)
- `_stA`: Supported service types array
- `ReduceLoundSoundsEnabled`: Note — the typo "Lound" is Apple's, not ours

---

## 4. Media Remote Protocol (MRP)

### Transport

MRP messages travel over the AirPlay DataStream as protobuf-encoded `ProtocolMessage` wrappers. Each message has:

- `type`: Message type enum (see below)
- `identifier`: UUID for request/response correlation
- `uniqueIdentifier`: Second UUID
- `errorCode`: Error code enum

Extensions carry the actual message payload.

### DataStream Frame Format

```
[header: 32 bytes][plist payload]

Header:
  [tag: 8 bytes 'sync'/'comm'/'rply']
  [seqno: 8 bytes BE]
  [padding: 16 bytes]

Plist payload:
  { params: { data: <varint-length-prefixed ProtocolMessage bytes> } }
```

### Encryption (DataStream)

- **Algorithm**: ChaCha20-Poly1305
- **Nonce format**: 12 bytes — 4 zero bytes + 8-byte LE counter at offset 4
- **AAD**: 2-byte LE frame length
- **Key derivation**: HKDF-SHA512
  - Seed from SETUP response (`seed` field, random BigInt)
  - Salt: `DataStream-Salt{seed}`
  - Read key info: `DataStream-Output-Encryption-Key`
  - Write key info: `DataStream-Input-Encryption-Key`

### Encryption (EventStream)

- **Nonce format**: Same as DataStream (4 zero + 8-byte LE counter)
- **AAD**: 2-byte LE frame length
- **Key derivation**: HKDF-SHA512
  - Salt: `Events-Salt`
  - Read key info: `Events-Write-Encryption-Key` (Apple TV's write = our read)
  - Write key info: `Events-Read-Encryption-Key` (Apple TV's read = our write)

**Important**: The HKDF info strings for EventStream are named from the Apple TV's perspective. This is confirmed by pyatv (`ap2_session.py`: "Read/Write info reversed here as connection originates from receiver!").

### ProtocolMessage Types (Active)

| Type       | Name                                   | Description                             |
|------------|----------------------------------------|-----------------------------------------|
| 1          | SET_STATE                              | Set player state                        |
| 2          | SET_NOW_PLAYING_CLIENT                 | Set active now-playing client           |
| 3          | SET_NOW_PLAYING_PLAYER                 | Set active player within client         |
| 4          | SET_DEFAULT_SUPPORTED_COMMANDS         | Set default supported commands          |
| 5          | SEND_COMMAND                           | Send remote control command             |
| 6          | SEND_COMMAND_RESULT                    | Command result                          |
| 7          | DEVICE_INFO                            | Device information                      |
| 8          | CLIENT_UPDATES_CONFIG                  | Configure update subscriptions          |
| 10         | SET_CONNECTION_STATE                   | Set connection state                    |
| 15         | SET_ARTWORK                            | Set artwork data                        |
| 17         | UPDATE_CLIENT                          | Update client properties                |
| 24         | UPDATE_CONTENT_ITEM                    | Update content item metadata            |
| 28         | UPDATE_PLAYER                          | Update player properties                |
| 30         | REMOVE_PLAYER                          | Remove player                           |
| 31         | REMOVE_CLIENT                          | Remove client                           |
| 35         | KEYBOARD                               | Keyboard state                          |
| 37         | GET_KEYBOARD_SESSION                   | Get keyboard session                    |
| 38         | TEXT_INPUT                             | Text input                              |
| 39         | UPDATE_OUTPUT_DEVICE                   | Update output device                    |
| 43         | GET_STATE                              | Get current state                       |
| 45         | PLAYBACK_QUEUE_REQUEST                 | Request playback queue                  |
| 46         | PLAYBACK_QUEUE                         | Playback queue response                 |
| 50         | ORIGIN_CLIENT_PROPERTIES               | Origin client properties                |
| 51         | PLAYER_CLIENT_PROPERTIES               | Player client properties                |
| 55         | SEND_VIRTUAL_TOUCH_EVENT               | Virtual touch event                     |
| 56         | SEND_HID_EVENT                         | HID event (USB usage page + usage code) |
| 60         | VOLUME_CONTROL_AVAILABILITY            | Volume control availability             |
| 61         | SET_VOLUME                             | Set volume                              |
| 62         | GET_VOLUME                             | Get volume                              |
| 63         | GET_VOLUME_RESULT                      | Volume result                           |
| 64         | VOLUME_DID_CHANGE                      | Volume changed                          |
| 65         | DEVICE_INFO_UPDATE                     | Device info update                      |
| 66         | CONFIGURE_CONNECTION                   | Configure connection                    |
| 67         | UPDATE_CONTENT_ITEM_ARTWORK            | Update content item artwork             |
| 68         | SEND_LYRICS_EVENT                      | Lyrics event                            |
| 70         | VOLUME_CONTROL_CAPABILITIES_DID_CHANGE | Volume capabilities changed             |
| 71         | VOLUME_MUTED_DID_CHANGE                | Volume mute state changed               |
| 72         | MODIFY_OUTPUT_CONTEXT                  | Modify output context (multi-room)      |
| 73-76, 108 | PLAYBACK_SESSION_MIGRATE_*             | Playback session migration              |

### HID Events (via DataStream)

USB HID usage pages and usage codes sent via `SEND_HID_EVENT`:

**Generic Desktop (Page 0x01)**:

| Usage | Key           |
|-------|---------------|
| 0x82  | Suspend/Sleep |
| 0x83  | Wake          |
| 0x86  | Menu          |
| 0x89  | Select        |
| 0x8A  | Right         |
| 0x8B  | Left          |
| 0x8C  | Up            |
| 0x8D  | Down          |

**Consumer (Page 0x0C)**:

| Usage | Key            |
|-------|----------------|
| 0x40  | Home           |
| 0x60  | Top Menu       |
| 0x9C  | Channel Up     |
| 0x9D  | Channel Down   |
| 0xB0  | Play           |
| 0xB1  | Pause          |
| 0xB5  | Next Track     |
| 0xB6  | Previous Track |
| 0xB7  | Stop           |
| 0xE2  | Mute           |
| 0xE9  | Volume Up      |
| 0xEA  | Volume Down    |

### Virtual Touch Events

Sent via `SEND_VIRTUAL_TOUCH_EVENT` with:
- `virtualDeviceID`: Always 1 (BigInt)
- `event.x`, `event.y`: Coordinates (BigInt)
- `event.phase`: 1=Began, 2=Moved, 4=Ended
- `event.finger`: Finger index for multi-touch

**Important**: `MRTelevisionSendVirtualTouchEvent` in MediaRemote returns `void` — no completion handler. Touch events are fire-and-forget. The DataStream `rply` frames use FIFO matching, so exchange()-based touch events corrupt the response queue.

### Command Enum (Selected)

| Value | Command            | Value | Command                    |
|-------|--------------------|-------|----------------------------|
| 1     | Play               | 13    | SkipForward                |
| 2     | Pause              | 14    | SkipBackward               |
| 3     | TogglePlayPause    | 15    | NextChapter                |
| 4     | Stop               | 16    | PreviousChapter            |
| 5     | NextTrack          | 17    | ChangeShuffleMode          |
| 6     | PreviousTrack      | 18    | ChangeRepeatMode           |
| 7     | AdvanceShuffleMode | 26    | SeekToPlaybackPosition     |
| 8     | AdvanceRepeatMode  | 27    | ChangePlaybackRate         |
| 9     | BeginFastForward   | 28    | LikeTrack                  |
| 10    | EndFastForward     | 29    | DislikeTrack               |
| 11    | BeginRewind        | 30    | BookmarkTrack              |
| 12    | EndRewind          | 31    | AddNowPlayingItemToLibrary |

### Now Playing Hierarchy

```
AirPlayState
  └── clients: Record<bundleIdentifier, Client>
        └── players: Record<playerIdentifier, Player>
              └── contentItems, playbackState, metadata, artwork
```

- **Client**: Represents a running app (e.g., com.apple.Music)
- **Player**: Represents a media player within that app
- **Active flow**: `SetNowPlayingClient` designates the active client, `SetNowPlayingPlayer` designates the active player within it
- **State updates**: `SetState` updates a specific player's state but does NOT change which player is active

---

## 5. Encryption & Pairing

### Pairing Modes

| Mode              | Flow               | Result                                         | Use Case                                       |
|-------------------|--------------------|------------------------------------------------|------------------------------------------------|
| PIN pairing       | SRP-6a M1-M6       | `AccessoryCredentials` (LTSK, LTPK, pairingId) | First-time setup, persistent                   |
| Transient pairing | M1-M4 (PIN "3939") | `AccessoryKeys` (sharedSecret, pairingId)      | Session-only, no stored credentials            |
| Pair-verify       | Curve25519 ECDH    | `AccessoryKeys` (sharedSecret, pairingId)      | Subsequent connections with stored credentials |

### SRP-6a Pairing (M1-M6)

```
Controller                              Apple TV
    │                                       │
    │──── M1: TLV(method=0, state=1) ──────>│  pair-setup request
    │<─── M2: TLV(salt, publicKey, state=2) │  server's SRP params
    │──── M3: TLV(publicKey, proof, state=3)│  client proof
    │<─── M4: TLV(proof, state=4) ─────────│  server proof
    │──── M5: TLV(encrypted(Ed25519 sig)) ──>│  client identity
    │<─── M6: TLV(encrypted(Ed25519 sig)) ──│  server identity
    │                                       │
    Result: AccessoryCredentials (LTSK, LTPK, pairingId)
```

- Identity: `Pair-Setup` as SRP username
- HKDF for M5/M6 encryption: salt=`Pair-Setup-Encrypt-Salt`, info=`Pair-Setup-Encrypt-Info`
- ChaCha20 nonces: `PS-Msg05` (M5), `PS-Msg06` (M6) — left-padded with zeros to 12 bytes
- Ed25519 signing: HKDF salt=`Pair-Setup-Controller-Sign-Salt`, info=`Pair-Setup-Controller-Sign-Info`

### Pair-Verify (Curve25519 ECDH)

```
Controller                              Apple TV
    │                                       │
    │──── M1: TLV(state=1, publicKey) ──────>│  ephemeral Curve25519 pubkey
    │<─── M2: TLV(state=2, encrypted) ──────│  server identity + signature
    │──── M3: TLV(state=3, encrypted) ──────>│  client identity + signature
    │<─── M4: TLV(state=4) ────────────────│  success
    │                                       │
    Result: sharedSecret (for HKDF key derivation)
```

- ECDH shared secret: Curve25519 DH
- HKDF for verify encryption: salt=`Pair-Verify-Encrypt-Salt`, info=`Pair-Verify-Encrypt-Info`
- ChaCha20 nonces: `PV-Msg02` (M2 decrypt), `PV-Msg03` (M3 encrypt)
- Signature covers: `[serverPubKey || accessoryId || clientPubKey]`

### HKDF Key Derivation Summary

| Stream         | Salt                    | Read Key Info                            | Write Key Info                          |
|----------------|-------------------------|------------------------------------------|-----------------------------------------|
| ControlStream  | `Control-Salt`          | `Control-Read-Encryption-Key`            | `Control-Write-Encryption-Key`          |
| DataStream     | `DataStream-Salt{seed}` | `DataStream-Output-Encryption-Key`       | `DataStream-Input-Encryption-Key`       |
| EventStream    | `Events-Salt`           | `Events-Write-Encryption-Key` (swapped!) | `Events-Read-Encryption-Key` (swapped!) |
| Companion Link | (empty)                 | `ServerEncrypt-main`                     | `ClientEncrypt-main`                    |

### Nonce Formats

| Protocol                                 | Format                               | Size     |
|------------------------------------------|--------------------------------------|----------|
| AirPlay (DataStream, EventStream, Audio) | 4 zero bytes + 8-byte LE counter     | 12 bytes |
| Companion Link                           | 8-byte LE counter + 4 zero bytes     | 12 bytes |
| Pairing (SRP M5/M6)                      | Left-padded ASCII nonce (`PS-Msg05`) | 12 bytes |
| Pairing (Verify M2/M3)                   | Left-padded ASCII nonce (`PV-Msg02`) | 12 bytes |

### ChaCha20 AAD (Additional Authenticated Data)

| Context          | AAD                    |
|------------------|------------------------|
| AirPlay streams  | 2-byte LE frame length |
| Companion Link   | 4-byte frame header    |
| Pairing messages | None (null)            |

---

## 6. Audio Streaming

### Compression Types (ct in SETUP)

| ct Value     | FourCC | Codec                        |
|--------------|--------|------------------------------|
| 1 (0x01)     | `lpcm` | PCM (uncompressed)           |
| 2 (0x02)     | `alac` | Apple Lossless               |
| 4 (0x04)     | `aac ` | AAC-LC                       |
| 8 (0x08)     | `aace` | AAC-ELD                      |
| 32 (0x20)    | `opus` | Opus                         |
| 256 (0x100)  | `qc+3` | Unknown (Qualcomm?)          |
| 512 (0x200)  | `qach` | Unknown                      |
| 1024 (0x400) | `qacg` | Unknown                      |
| 2048 (0x800) | `qlac` | Unknown (Qualcomm Lossless?) |

Source: `APAudioFormatIDToAPCompressionType` disassembly.

### Audio Format Bitmask (audioFormat in SETUP)

| Value  | Description                      |
|--------|----------------------------------|
| 0x4    | PCM 8000 Hz, 16-bit, 1 channel   |
| 0x10   | PCM 16000 Hz, 16-bit, 1 channel  |
| 0x40   | PCM 24000 Hz, 16-bit, 1 channel  |
| 0x100  | PCM 32000 Hz, 16-bit, 1 channel  |
| 0x200  | PCM 44100 Hz, 16-bit, 2 channels |
| 0x400  | PCM 48000 Hz, 16-bit, 2 channels |
| 0x800  | PCM 44100 Hz, 24-bit, 2 channels |
| 0x1000 | PCM 48000 Hz, 24-bit, 2 channels |

### RTP Packet Format

```
[V=2 | P=0 | X=0 | CC=0 | M | PT][seqno: 2 bytes BE]
[timestamp: 4 bytes BE][SSRC: 4 bytes BE]
[encrypted audio data][authTag: 16 bytes][nonce trailer: optional]
```

- **PT = 0x60 (96)**: Normal audio packet
- **PT = 0x61 (97)**: RFC2198 redundant audio packet

### Audio Encryption

- **Algorithm**: ChaCha20-Poly1305
- **Nonce**: 12 bytes — 4 zero bytes + sequence number as LE uint32 at offset 4
- **AAD**: First 12 bytes of RTP header (before encryption)
- **Auth tag**: Appended after encrypted audio data (16 bytes)

### RTCP Sync Packets

Sent every 1 second via the control UDP channel:

```
[V=2 | P=0 | RC=0 | PT=210 | length=5]
[NTP timestamp: 8 bytes (seconds:4 + fraction:4)]
[RTP timestamp: 4 bytes]
```

### RFC2198 Redundancy

**Status**: Code ready but disabled (`REDUNDANCY_COUNT = 0`). Header format not yet confirmed.

- PT = 0x61 (97) for redundant packets (discovered via `APSRTPPacketProcessorProcessPacket` disassembly)
- SETUP body flags: `redundantAudio: true`, `supportsRTPPacketRedundancy: true`
- Receiver parser: `rtpPacketProcessor_processRFC2198Packet` in AirPlaySupport
- Sender builder: `realTimeAudioEngine_createRedundantAudioDataMessageBBuf` in AirPlaySender
- Max redundancy: `rfc2198MaxRedundancy` in AirPlaySender

### Retransmission

Apple TV sends retransmit requests on the control UDP port. Format:

```
[0x80, 0xD5 | 0x80][seqno start: 2 bytes][count: 2 bytes]
```

Response format:
```
[0x80, 0xD6][original seqno: 2 bytes][full original RTP packet]
```

### NTP Timing

- Timing server listens on UDP, port communicated in SETUP body (`timingPort`)
- Apple TV sends NTP requests, we respond with wall-clock timestamps
- **Must use wall-clock time** (`Date.now()`), NOT monotonic time (`process.hrtime`)
- NTP epoch: January 1, 1900

### Audio Format Negotiation Note

Our audio sources currently produce 16-bit PCM, but we request `AudioFormat.PCM_44100_24_2` (24-bit). The receiver compensates for the mismatch. When audio sources support 24-bit output, `bytesPerChannel` should be updated from 2 to 3.

---

## 7. RAOP Protocol

RAOP (Remote Audio Output Protocol) is the legacy audio streaming protocol over RTSP. Used for HomePod streaming where we act as the audio source.

### Flow

```
1. TCP connect to RAOP port (from _raop._tcp mDNS)
2. OPTIONS
3. ANNOUNCE (SDP with codec info)
4. SETUP (transport: RTP/AVP/UDP)
5. RECORD (with RTP-Info header)
6. SET_PARAMETER progress (start/now/end)
7. Stream audio via RTP UDP
8. FLUSH → clear buffers
9. TEARDOWN → end session
```

### Important Differences from AirPlay Audio

- RAOP uses RTSP ANNOUNCE with SDP body (not plist SETUP)
- Encryption uses Apple's proprietary scheme (RSA + AES)
- Sync timestamps must use wall-clock NTP anchors (not raw RTP offsets)
- `headTs` must use `>>> 0` for 32-bit unsigned wrapping

---

## 8. Screen Mirroring

**Status**: Not implemented (0%).

### Key Symbols

| Symbol                             | Framework     | Description           |
|------------------------------------|---------------|-----------------------|
| `APEndpointStreamScreenAVCWrapper` | AirPlaySender | Screen stream wrapper |
| `APEndpointStreamScreenUDP`        | AirPlaySender | UDP screen transport  |
| `APEndpointStreamScreenUDPCreate`  | AirPlaySender | Constructor           |
| `ScreenCaptureControl`             | AirPlaySender | Capture control       |
| `SupportsScreenMultiCodec`         | AirPlaySender | Feature flag (bit 42) |
| `SupportsAirPlayScreen`            | AirPlaySender | Feature flag (bit 7)  |

### Capabilities

Apple supports: H.264/HEVC video, HDR (HDR10, HLG, Dolby Vision), resolution negotiation, YCbCr444, rotation, multi-codec, Valeria virtual display.

---

## 9. Protobuf Field Numbers

### Verification Methods

1. **writeTo: disassembly**: `mov w2, #fieldNum` in Objective-C serialization — most reliable
2. **OBJC_IVAR address ordering**: Ivars sorted by address usually match field number order, EXCEPT when repeated/array fields are present (runtime reorders them to the front)
3. **readFrom: tag extraction**: Protobuf tags `(fieldNumber << 3 | wireType)` in deserialization switch tables
4. **Production verification**: Fields that work in production are correct by definition

### Known Ivar Reordering

`CommandInfo` and `CommandOptions` have repeated/array ivars placed at the FRONT of the object layout regardless of their field number. Scalar fields after the repeated fields DO follow field number order.

### Confirmed Types

| Type                          | Fields                              | Method                  |
|-------------------------------|-------------------------------------|-------------------------|
| AVOutputDeviceDescriptor      | 1-83                                | writeTo + ivar order    |
| DeviceInfoMessage             | 1-58 (gap at 18)                    | writeTo + ivar order    |
| NowPlayingInfo                | 1-19                                | writeTo + ivar order    |
| NowPlayingClient              | 1-10                                | writeTo + ivar order    |
| ContentItemMetadata           | 1-113 (gaps: 20,38,45,47,51,66)     | writeTo + ivar order    |
| CommandInfo                   | 1-29 (production), 30-43 (inferred) | Mixed                   |
| CommandOptions                | 2-92                                | Production + ivar order |
| OriginClientPropertiesMessage | 1-2                                 | writeTo                 |
| Origin                        | 1-5                                 | writeTo                 |

---

## 10. Feature Flags

AirPlay features are a 64-bit bitmask sent as two 32-bit halves (`features` + `featuresEx`).

| Bit | Name                                  | Description                  |
|-----|---------------------------------------|------------------------------|
| 0   | SupportsAirPlayVideo                  | Video streaming              |
| 1   | SupportsAirPlayPhoto                  | Photo display                |
| 7   | SupportsAirPlayScreen                 | Screen mirroring             |
| 9   | SupportsAirPlayAudio                  | Audio streaming              |
| 11  | SupportsRedundantAudio                | Audio redundancy support     |
| 14  | Authentication_4                      | Auth type 4                  |
| 17  | SupportsAirPlayPairing                | Pairing support              |
| 18  | SupportsPIN                           | PIN authentication           |
| 23  | SupportsAudioMetaCovers               | Album art                    |
| 25  | SupportsHKPairingAndAccessControl     | HomeKit pairing              |
| 26  | SupportsTransientPairing              | Transient pairing            |
| 27  | MetadataFeatures_0                    | Metadata support             |
| 30  | SupportsCoreUtilsPairingAndEncryption | CoreUtils pairing            |
| 32  | SupportsVolume                        | Volume control               |
| 33  | SupportsBufferedAudio                 | Buffered audio (APAP/APAT)   |
| 38  | SupportsSystemPairing                 | System pairing               |
| 40  | SupportsAPSync                        | AP sync                      |
| 41  | SupportsPTP                           | PTP clock sync               |
| 42  | SupportsScreenMultiCodec              | Multi-codec screen mirroring |
| 46  | SupportsRFC2198Redundancy             | RFC2198 audio redundancy     |
| 48  | SupportsHangdogRemoteControl          | Remote control (Apple TV)    |
| 50  | SupportsUnifiedMediaControl           | Unified media control        |
| 58  | SupportsUnifiedPairSetupAndMFi        | Unified pair setup           |

---

## 11. Unimplemented Features

### By Framework Reference

#### Game Controller (MediaRemote)

| Symbol                                    | Description                                                      |
|-------------------------------------------|------------------------------------------------------------------|
| `MREmulatedGameController`                | Game controller emulation class                                  |
| `MRRegisterGameControllerMessage`         | Register controller                                              |
| `MRRegisterGameControllerResponseMessage` | Registration response                                            |
| `MRGameControllerMessage`                 | Event data (buttons, motion)                                     |
| `_MRGameControllerButtonsProtobuf`        | Button state                                                     |
| `_MRGameControllerAccelerationProtobuf`   | Accelerometer (x,y,z,w + gravity, rotation, userAccel, attitude) |
| `_MRGameControllerDigitizerProtobuf`      | Touchpad input                                                   |
| `MRGameControllerInputMode`               | Bitmask: CaptureButtons, CaptureDigitizer, CaptureMotion         |

Proto files: `GameControllerMessage.proto`, `GameControllerButtons.proto`, `GameControllerMotion.proto`, `GameControllerDigitizer.proto`
ProtocolMessage types: 18-22

#### Playback Session Migration (MediaRemote)

| Symbol                                    | Description        |
|-------------------------------------------|--------------------|
| `MRPlaybackSessionMigrateRequest`         | Migration request  |
| `MRPlaybackSessionMigrateBeginMessage`    | Begin migration    |
| `MRPlaybackSessionMigrateEndMessage`      | End migration      |
| `MRPlaybackSessionMigratePostMessage`     | Post-migration     |
| `MRPlaybackSessionMigrateResponseMessage` | Migration response |

ProtocolMessage types: 73-76, 108

#### PTP Clock Synchronization (AirPlaySender)

| Symbol                                   | Description                 |
|------------------------------------------|-----------------------------|
| `SupportsPTP`                            | Feature flag (bit 41)       |
| `realTimeAudioEngine_setPTPTimeAnnounce` | Set PTP time announce       |
| `Establish PTP Clock`                    | Setup PTP clock for cluster |
| `ptpReenableRedundantClusterLinks`       | Redundant cluster links     |

#### Buffered Audio — APAP/APAT (AirPlaySender)

| Symbol                          | Description                       |
|---------------------------------|-----------------------------------|
| `APAudioEngineBuffered`         | Buffered audio engine             |
| `APAudioEngineBufferedAdapter`  | Adapter between buffered/realtime |
| `APEndpointStreamBufferedAudio` | Buffered audio stream             |
| `streamConnectionTypeAPAP`      | APAP transport                    |
| `streamConnectionTypeAPAT`      | APAT transport                    |
| `SupportsBufferedAudio`         | Feature flag (bit 40)             |

RTSP endpoints: `/rateandanchortime`, `GetAnchor`

#### Siri Audio Streaming (Rapport)

| Symbol                                                   | Description                           |
|----------------------------------------------------------|---------------------------------------|
| `RPSiriAudioSession`                                     | Siri audio session class              |
| `RPSiriAudioSession._activateWithCompletion:reactivate:` | Activate session                      |
| `RPSiriAudioSession._ensureXPCStarted`                   | Start XPC service                     |
| `AVVoiceController`                                      | Voice audio controller (TVRemoteCore) |

#### NSKeyedArchiver Encoder

| Symbol             | Description                    |
|--------------------|--------------------------------|
| `RTIKeyedArchiver` | RTI variant of NSKeyedArchiver |
| `NSKeyedArchiver`  | Standard encoder               |

Current state: Decoder exists (`packages/encoding/src/nskeyedarchiver.ts`), encoder missing. RTI payloads are manually built.

---

## Appendix: Framework Dump Locations

Framework binaries are located at:
```
/System/Library/PrivateFrameworks/<Name>.framework/<Name>
```

For analysis, Mach-O binaries can be examined with:
```bash
# Export symbols
nm -gU <binary>

# String constants
strings <binary>

# Full disassembly
objdump -d <binary>

# Objective-C metadata
otool -oV <binary>

# Ivar layout
otool -tV <binary> | grep -A5 "OBJC_IVAR"
```
