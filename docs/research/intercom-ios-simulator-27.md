# Intercom from the iOS 27 simulator

The installed iOS 27.0 simulator runtime, build **24A434**, contains the Announce client and daemon binaries missing from the native macOS investigation. They expose a concrete Intercom transport path through Rapport/Companion Link, plus an IDS path. This is enough to identify a request name and payload structure, but not to establish that our existing HomePod pairing can authorize it.

## Extracted files

The runtime root is:

```text
/Library/Developer/CoreSimulator/Volumes/iOS_24A434/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime/Contents/Resources/RuntimeRoot
```

Copies are in `.research/ios-simulator-intercom/files/` in this repository:

| File | Role supported by the inspected interfaces/code |
| --- | --- |
| `Announce.framework` | `ANAnnounce` send/reply APIs; announcements, destinations, participants, audio data items and XPC client code. |
| `AnnounceDaemon.framework` | XPC listener, announcement coordination, Rapport/IDS connections, routing, playback and validation. |
| `AnnounceSiriExtensions.framework` | Siri extension bundle and its plugins. Copied and indexed; not decompiled in this pass. |
| `AnnounceAppIntents.framework` | App Intents integration; referenced by the daemon launch configuration. Copied and indexed. |
| `HomeMessagingUtils.framework` | Shared home messaging helpers, including Rapport devices and IDS destination conversion. Copied and indexed. |
| `announced` | `/usr/libexec/announced`, the daemon executable. |
| `com.apple.announced.plist` | Launch configuration with Mach services, Rapport activation and IDS wake services. |
| `SystemVersion.plist` | Runtime version/build provenance. |

The frameworks include their resources and Info.plists. `manifest.json` records source paths and SHA-256 hashes for the five primary framework binaries, daemon and two plist files. No simulator was booted, no daemon invoked and no message sent. CoreSimulator was queried only to list installed runtimes.

## A concrete send path

The inspected entry points establish these layers:

```text
ANAnnounce sendRequest:completion:
  → Announce XPC client / com.apple.announced.server
  → ANAnnounceServiceListener
  → ANMessenger
  → ANRapportConnection / RPCompanionLinkClient
    or ANIDSConnection / IDSService
```

Evidence is stronger than a framework or method name alone:

- The launch plist registers Rapport service `com.apple.announce` and Mach service `com.apple.announced.server`.
- `ANRapportConnection::_sendMessage:linkClient:handler:` at **0x32420** uses `sendRequestID:request:options:responseHandler:` with **`com.apple.announce.announcement.message`**. Direct ARM64 disassembly confirms the string at 0x32540 and selector call at 0x32554.
- `_registerMessageRequestHandler` at **0x31890** registers the same request ID for incoming requests.
- `ANMessenger::_sendAnnouncement:toDestination:sentHandler:` at **0xbda8** contains both Rapport and IDS send calls. The full routing conditions have not yet been reconstructed.
- `ANIDSConnection::init` at **0x3c814** initializes an IDS service. Resolving the exported `ANAnnounceIDSServiceName` constant through its CFString gives **`com.apple.private.alloy.intercom`**. The launch plist also has the corresponding IDS wake service.

These are simulator-relative addresses in `AnnounceDaemon`, except the exported service-name constant in `Announce`. They are not macOS shared-cache addresses.

## Payload structure

In `Announce`, `ANAnnouncement::message` at **0x4bb8** builds a dictionary with keys including:

```text
MessageVersion, DataItems, Announcer, PlaybackDeadline, Action,
AnnouncementID, GroupID, ProductType, ProductTypeOverride, DeviceClass,
Location, AudioTranscription, CreationTimestamp, LastPlayedDate, Source
```

It archives the data-item collection through NSKeyedArchiver. `messageForCompanion` at **0x4ee8** starts with that dictionary and substitutes the Companion representation of the announcer. This requires nested model serialization; sending arbitrary audio bytes under the request name is not an implementation.

The next focused targets are `ANAnnouncementDataItem`, `ANParticipant`, `ANLocation`, the audio encoding, and how the sender builds recipient/home identities. The existing Companion Link framing and encoding code may be reusable, but service routing, authentication and payload compatibility still need validation.

## Access checks and simulator limits

`ANAnnounceServiceListener::listener:shouldAcceptNewConnection:` at **0x4244** checks feature enablement and `hasAnnounceEntitlement`. The latter, at **0x9a1c**, reads `kAnnounceEntitlement` through `valueForEntitlement:` and tests its boolean value.

Resolved constants in `Announce`:

| Symbol | Address | Value |
| --- | --- | --- |
| `kAnnounceEntitlement` | 0x590c0 | `com.apple.announced.client` |
| `kAnnounceClientIdEntitlement` | 0x590c8 | `com.apple.announced.clientid` |
| `ANAnnounceIDSServiceName` | 0x590d8 | `com.apple.private.alloy.intercom` |

The first entitlement gates the local XPC service. That is distinct from authorization of a network peer. We did not attempt to bypass it or infer network acceptance from it.

In this simulator, `ANMessenger::performRapportValidationForAnnouncement:withSenderContext:` at **0x3b40c** is only `mov x0, #0; ret`, confirmed in assembly. It does not reveal physical-device validation. Simulator code therefore cannot settle whether HomeKit trust, Apple account identity, different Rapport credentials or additional permissions are required on a HomePod.

The daemon plist also advertises `com.apple.dropin.setup`; that path was not investigated and is not evidence of a supported feature in our library.

## Research artifacts

Under `.research/ios-simulator-intercom/`:

- `files/`: copied bundles, daemon and configuration.
- `metadata/`: Objective-C interfaces, symbol lists, strings, load commands, selected addresses, resolved constants and assembly checks.
- `decompiled/Announce/`: 92 successfully exported functions from 94 selected addresses.
- `decompiled/AnnounceDaemon/`: 72 successfully exported functions.
- `scripts/ExportSelected.java`: targeted Ghidra exporter.
- `scripts/read_constants.py`: resolves the three constants in this exact arm64 simulator binary; offsets are build-specific.
- `logs/`: Ghidra logs, including unsupported Objective-C signature warnings.

Tools: ipsw 3.1.711, Ghidra 12.1.3, Java 21. Some inferred Objective-C receiver/argument types in the pseudocode are wrong; the decisive request ID and validation stub were checked in assembly. The exported text is analysis material, not compilable Apple source.

No Intercom feature was added to the library. The next step is to finish the payload and identity mapping, then compare the validation/service configuration against a physical iOS or HomePod firmware image before attempting a device test.
