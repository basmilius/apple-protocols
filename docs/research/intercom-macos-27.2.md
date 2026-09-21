# Intercom: what the macOS implementation actually contains

Examined on macOS 27.2, build 26B5086k, on 21 September 2026. The additional inspection supports looking beyond AirPlay, but it also exposes a platform boundary: the Home announcement entry points examined here are disabled or inert on macOS. We still do not have a standalone Intercom send command for Homey.

## New evidence

The Home application's load commands reference the Catalyst frameworks under `/System/iOSSupport`, including `Home`, `HomeUI`, `HomeUI2`, `HomeUICommon` and `HomeKit`. These are additional search targets beyond the native frameworks examined earlier.

`Home` contains the following functions:

| Function | Address | Observed behavior |
| --- | --- | --- |
| `-[HMHome(Additions) hf_shouldShowAnnounceButtonForThisHome]` | `0x2bc3d3e3c` | Returns zero unconditionally. |
| `-[HMHome(Additions) hf_shouldShowAnnounceFeatureForThisHome]` | `0x2bc3d3e44` | Returns zero unconditionally. |
| `-[HMRoom(HFAdditions) hf_shouldShowAnnounceButtonForThisRoom]` | `0x2bc3e0a90` | Returns zero unconditionally. |
| `-[HMRoom(HFAdditions) hf_shouldShowAnnounceFeatureForThisRoom]` | `0x2bc3e0a98` | Returns zero unconditionally. |

The first two were checked directly against the shared cache, in addition to Ghidra's output:

```asm
0x2bc3d3e3c  mov w0, #0
0x2bc3d3e40  ret
0x2bc3d3e44  mov w0, #0
0x2bc3d3e48  ret
```

There is also an explicit diagnostic string: `Announce settings should be hidden since containsHomePod = %{BOOL}d isAMac = %{BOOL}d`.

The more promising-looking AssistantServices observer is similarly limited in this build:

- `-[AFHomeAnnouncementObserver _setUp]`, `0x1a3d1a53c`, only logs.
- `-[AFHomeAnnouncementObserver _fetchStateAndLastPlayedAnnouncementForReason:completion:]`, `0x1a3d1a7c0`, logs and calls the completion block with `(0, 0)`. It does not fetch state from a service in this implementation. The two zero callback arguments were also verified in ARM64 assembly at `0x1a3d1a864` and `0x1a3d1a868`.

This changes the earlier assessment: class and selector names alone made AssistantServices look like an active path to follow on the Mac. Inspecting the implementation shows why that path stops here. Apple's [HomePod guide](https://support.apple.com/en-gb/guide/homepod/apdc2e0b5480/homepod) also lists iPhone, iPad and Apple Watch as Intercom clients, rather than Mac.

## Useful leads that remain

`Home` still contains `HFUserItem setEnableAnnounce:`, `HFMediaAccessoryItem setEnableAnnounce:`, `HFUserNotificationServiceTopic _announceTopic`, `HFUtilities sharedAnnouncementsDirectoryURL`, `root.announce.enabled` and `com.apple.announce`. Those identify user permissions, accessory settings, a notification topic and a local storage helper. They do not establish a network send API; `com.apple.announce` has not been verified as a Mach/XPC service name.

The separate `HomeKitDaemonLegacy` binary contains announce access levels, notification settings and current-user checks. Its other “announce” matches include Matter OTA announcements and doorbell announcements; those should not be treated as Intercom transport evidence.

For the next extraction, prioritize an iOS or HomePod firmware cache:

1. Compare the same `Home`/`HomeUI` announcement methods and `AFHomeAnnouncementObserver` with their non-stub implementations. Identify the actual record/send action and its client object.
2. Follow that object's XPC target and message schema. Check service entitlements and how it obtains home, user and recipient identities.
3. Follow the service to the audio payload and transport. Inspect HomeKit, AirPlay, Rapport or IDS only where the call graph leads; their presence alone does not establish their role.
4. Determine whether existing pairing credentials can authorize sending, or whether the path depends on an Apple account and a trusted Apple process. That distinction decides whether this belongs in the portable library or needs an Apple-side companion service.

Apple documents HomeKit/AirPlay audio channels between [Siri-enabled accessories and HomePod](https://support.apple.com/en-gb/guide/security/sec3a881ccb1/web), including Intercom functionality. This remains evidence of cooperation between the stacks, not proof that our existing AirPlay session can send Intercom messages. Ordinary URL/TTS playback is already a separate capability and should not be presented as native Intercom.

## Artifacts and limits

Artifacts in this worktree: `.research/intercom/`.

- `binaries/Home` and `binaries/AssistantServices`: extracted with `ipsw dyld extract --slide`.
- `metadata/`: strings, Objective-C metadata, symbol lists, selected function addresses and two direct assembly checks. HomeUI, HomeUI2 and HomeUICommon were inspected as metadata; they were not fully decompiled.
- `decompiled/Home/`: 36 selected functions; `decompiled/AssistantServices/`: 103 selected functions.
- `scripts/ExportSelected.java`: the Ghidra exporter used here; `logs/`: extraction/analysis logs.

Tools: ipsw 3.1.711, Ghidra 12.1.3, Java 21. Some exported pseudocode contains unresolved external stubs or truncated control flow because only the individual cache images were imported. Export success does not guarantee complete decompilation. The key return-zero/callback-zero findings above were checked against direct assembly.

No Intercom API was added. No Apple account services or devices were contacted. This investigation narrows the next firmware targets; it does not prove that portable Intercom is impossible.
