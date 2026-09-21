# Intercom PoC findings and removal

The experimental diagnostics panel and its iOS HomeKit helper were removed at the user's request on 21 September 2026. There is no Intercom API, panel, agent channel or helper project in the codebase. The OPack Date changes introduced for this experiment were also reverted. The earlier protocol bug fixes remain.

## Why the experiment stopped

The PoC attempted to send `com.apple.announce.announcement.message` over an authenticated Companion Link connection. That mapping from Apple's Rapport API to our transport was a hypothesis, not a verified delivery path.

Our HomePod integration uses transient AirPlay pairing. This creates temporary session keys, not the persistent credentials required by the PoC's Companion Link pair-verify. The experimental option to reuse stored AirPlay credentials therefore did not help with our actual HomePod connections. The user also reported that the tvOS route did not work; no captured response here establishes the cause.

HomeKit home and user UUIDs identify the destination and sender but do not prove membership or authorize a session. Retrieving those UUIDs did not resolve the transport/authentication gap. The next prerequisite for any future implementation is a verified HomePod authentication and routing path, before further payload work.

## Payload findings

The [iOS simulator extraction](intercom-ios-simulator-27.md) supplies the Rapport request identifier and announcement dictionary fields. Additional targeted decompilation identified:

- `ANParticipant::message` at 0x26e0: `homeKitID`, `homeKitUserID`, `userID`, `isAccessory`, `isEndpoint`. `messageForCompanion` at 0x2804 adds `name`.
- `ANLocation::message` at 0x1ef0c: `home`, `flags`, `rooms`, `zones`, `users`, `devices`, and optional `homeLocationStatus`.
- `ANAnnouncement::init` at 0x36c4: version `1.0`, a generated announcement UUID and creation date, with zero-valued action/product/source defaults.
- `ANAnnouncementDataItem::encodeWithCoder:` at 0xfdf4: `DataType` and `Flags` as NSNumber objects, and `Data` as NSData. The type-name jump table at 0x10000 identifies 0 as generic, 1 as audio and 2 as text.

The PoC constructed an NSKeyedArchiver NSArray containing one `ANAnnouncementDataItem`, with audio type 1 and flags 0. A separate Swift Foundation decoder implementing those coding keys successfully recovered the 32,044 bytes of a one-second mono WAV tone. That proves archive interoperability with Foundation, not compatibility with Apple's Intercom receiver or its audio codec requirements.

Creation and playback-deadline values motivated experimental OPack Date support, using tag 0x06 with a little-endian CFAbsoluteTime double. Golden-byte and round-trip tests passed. This code was removed with the experiment; its wire behavior was not validated against a live Intercom receiver.

## Authentication findings and limits

Apple's daemon contains both Rapport and IDS send paths. The local XPC entitlement `com.apple.announced.client`, network peer authentication, and HomeKit membership are distinct requirements. The simulator's Rapport validation routine is a stub, so it cannot establish authorization rules on a physical HomePod.

The PoC's optional `_sessionStart` for `com.apple.announce` and cross-protocol reuse of AirPlay credentials were unverified experiments. No successful native Intercom delivery or playback was established. No live announcement was sent by the implementing agent. The user's tvOS failure is recorded separately from the offline checks.

## HomeKit identifier helper

A SwiftUI iOS helper read `HMHomeManager.homes`, `HMHome.uniqueIdentifier`, `HMHome.currentUser.uniqueIdentifier` and room identifiers. It supported copying individual UUIDs and sharing JSON. It required HomeKit permission and a signed provisioning profile with the HomeKit entitlement. It was successfully built, installed and launched on the user's iPhone, but identifiers alone did not solve authentication. Its source was removed with the PoC.

## Historical validation and retained artifacts

Before removal, 42 tests passed under Bun and Node, the nine libraries and Electron diagnostics built, and an isolated Homey copy passed compilation and debug app validation. Those checks covered payload construction, archive references, draft expiry/replay, error-code decoding and OPack dates. They did not establish a usable Intercom route.

Reverse-engineering artifacts remain in ignored `.research/ios-simulator-intercom/` and `.research/macos-27.2/`; historical PoC logs remain in `.research/intercom-poc/`. The [macOS findings](intercom-macos-27.2.md) and simulator report remain available for future research. There are no active usage instructions because the experiment has been removed.
