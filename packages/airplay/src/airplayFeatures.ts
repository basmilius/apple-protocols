import { parseFeatures } from './features';

/**
 * AirPlay feature flags as bigint bits of the `features` field in the mDNS TXT
 * record. Each flag is a capability the device advertises.
 */
export const AirPlayFeatureFlags: Record<string, bigint> = {
    SupportsAirPlayVideoV1: 1n << 0n,
    SupportsAirPlayPhoto: 1n << 1n,
    SupportsAirPlayVideoFairPlay: 1n << 2n,
    SupportsAirPlayVideoVolumeControl: 1n << 3n,
    SupportsAirPlayVideoHTTPLiveStreams: 1n << 4n,
    SupportsAirPlaySlideShow: 1n << 5n,
    SupportsAirPlayScreen: 1n << 7n,
    SupportsAirPlayAudio: 1n << 9n,
    AudioRedundant: 1n << 11n,
    Authentication4: 1n << 14n,
    MetadataFeatures0: 1n << 15n,
    MetadataFeatures1: 1n << 16n,
    MetadataFeatures2: 1n << 17n,
    AudioFormats0: 1n << 18n,
    AudioFormats1: 1n << 19n,
    AudioFormats2: 1n << 20n,
    AudioFormats3: 1n << 21n,
    Authentication1: 1n << 23n,
    Authentication8: 1n << 26n,
    SupportsLegacyPairing: 1n << 27n,
    HasUnifiedAdvertiserInfo: 1n << 30n,
    SupportsVolume: 1n << 32n,
    SupportsAirPlayVideoPlayQueue: 1n << 33n,
    SupportsAirPlayFromCloud: 1n << 34n,
    SupportsTLSPSK: 1n << 35n,
    SupportsUnifiedMediaControl: 1n << 38n,
    SupportsBufferedAudio: 1n << 40n,
    SupportsPTP: 1n << 41n,
    SupportsScreenMultiCodec: 1n << 42n,
    SupportsSystemPairing: 1n << 43n,
    IsAPValeriaScreenSender: 1n << 44n,
    SupportsHKPairingAndAccessControl: 1n << 46n,
    SupportsCoreUtilsPairingAndEncryption: 1n << 48n,
    SupportsAirPlayVideoV2: 1n << 49n,
    MetadataFeatures3: 1n << 50n,
    SupportsUnifiedPairSetupAndMFi: 1n << 51n,
    SupportsSetPeersExtendedMessage: 1n << 52n,
    SupportsAPSync: 1n << 54n,
    SupportsWoL: 1n << 55n,
    SupportsWoL2: 1n << 56n,
    SupportsHangdogRemoteControl: 1n << 58n,
    SupportsAudioStreamConnectionSetup: 1n << 59n,
    SupportsAudioMetadataControl: 1n << 60n,
    SupportsRFC2198Redundancy: 1n << 61n
};

export type AirPlayFeatureFlagName = string;

/** The pairing an AirPlay device requires before it accepts a connection. */
export type PairingRequirement = 'none' | 'pin' | 'transient' | 'homekit';

/** Password protection bit of the `sf` (status flags) TXT field. */
const PASSWORD_BIT = 0x80n;

/** Legacy pairing bit of the `sf` TXT field; it requires a PIN. */
const LEGACY_PAIRING_BIT = 0x200n;

/** PIN required bit of the `sf` TXT field. */
const PIN_REQUIRED_BIT = 0x8n;

export function hasFeatureFlag(features: bigint, flag: bigint): boolean {
    return (features & flag) === flag;
}

/** Names of the flags set in the bitmask, for debugging and diagnostics. */
export function describeFlags(features: bigint): AirPlayFeatureFlagName[] {
    const result: AirPlayFeatureFlagName[] = [];

    for (const [name, flag] of Object.entries(AirPlayFeatureFlags)) {
        if (hasFeatureFlag(features, flag)) {
            result.push(name as AirPlayFeatureFlagName);
        }
    }

    return result;
}

/**
 * Reads the AirPlay version from the mDNS TXT record. The flag
 * SupportsUnifiedMediaControl or SupportsCoreUtilsPairingAndEncryption means
 * AirPlay 2.
 */
export function getProtocolVersion(txt: Record<string, string>): 1 | 2 {
    const featuresStr = txt.features ?? txt.ft;

    if (!featuresStr) {
        return 1;
    }

    const features = parseFeatures(featuresStr);

    if (hasFeatureFlag(features, AirPlayFeatureFlags.SupportsUnifiedMediaControl)) {
        return 2;
    }

    if (hasFeatureFlag(features, AirPlayFeatureFlags.SupportsCoreUtilsPairingAndEncryption)) {
        return 2;
    }

    return 1;
}

/**
 * Reads the pairing requirement from the feature and status flags of the
 * mDNS TXT record. The order of precedence is HomeKit, PIN required,
 * transient (system) pairing, legacy PIN, none.
 */
export function getPairingRequirement(txt: Record<string, string>): PairingRequirement {
    const featuresStr = txt.features ?? txt.ft;

    if (!featuresStr) {
        return 'none';
    }

    const features = parseFeatures(featuresStr);
    const sf = parseStatusFlags(txt);

    if (hasFeatureFlag(features, AirPlayFeatureFlags.SupportsHKPairingAndAccessControl)) {
        return 'homekit';
    }

    if ((sf & PIN_REQUIRED_BIT) !== 0n) {
        return 'pin';
    }

    if (hasFeatureFlag(features, AirPlayFeatureFlags.SupportsSystemPairing)) {
        return 'transient';
    }

    if ((sf & LEGACY_PAIRING_BIT) !== 0n) {
        return 'pin';
    }

    return 'none';
}

/** True when the `pw` TXT field or the password bit of the `sf` status flags is set. */
export function isPasswordRequired(txt: Record<string, string>): boolean {
    if (txt.pw === 'true') {
        return true;
    }

    const sf = parseStatusFlags(txt);

    return (sf & PASSWORD_BIT) !== 0n;
}

/**
 * True when the device has the SupportsHangdogRemoteControl flag, which it
 * needs to receive HID events. In practice only an Apple TV has it.
 */
export function isRemoteControlSupported(txt: Record<string, string>): boolean {
    const featuresStr = txt.features ?? txt.ft;

    if (!featuresStr) {
        return false;
    }

    const features = parseFeatures(featuresStr);

    return hasFeatureFlag(features, AirPlayFeatureFlags.SupportsHangdogRemoteControl);
}

/** Feature bitmask we advertise for a remote control session. */
export const SENDER_FEATURES_REMOTE_CONTROL: bigint =
    AirPlayFeatureFlags.SupportsAirPlayAudio
    | AirPlayFeatureFlags.AudioRedundant
    | AirPlayFeatureFlags.MetadataFeatures0
    | AirPlayFeatureFlags.MetadataFeatures1
    | AirPlayFeatureFlags.MetadataFeatures2
    | AirPlayFeatureFlags.MetadataFeatures3
    | AirPlayFeatureFlags.Authentication4
    | AirPlayFeatureFlags.Authentication1
    | AirPlayFeatureFlags.HasUnifiedAdvertiserInfo
    | AirPlayFeatureFlags.SupportsUnifiedMediaControl
    | AirPlayFeatureFlags.SupportsSystemPairing
    | AirPlayFeatureFlags.SupportsCoreUtilsPairingAndEncryption
    | AirPlayFeatureFlags.SupportsHKPairingAndAccessControl
    | AirPlayFeatureFlags.SupportsHangdogRemoteControl
    | AirPlayFeatureFlags.SupportsAPSync
    | AirPlayFeatureFlags.SupportsSetPeersExtendedMessage
    | AirPlayFeatureFlags.SupportsVolume;

/** Feature bitmask we advertise for an audio streaming session: the remote control features plus the audio ones. */
export const SENDER_FEATURES_AUDIO: bigint =
    SENDER_FEATURES_REMOTE_CONTROL
    | AirPlayFeatureFlags.SupportsBufferedAudio
    | AirPlayFeatureFlags.SupportsAudioStreamConnectionSetup
    | AirPlayFeatureFlags.SupportsAudioMetadataControl
    | AirPlayFeatureFlags.AudioFormats0
    | AirPlayFeatureFlags.AudioFormats1
    | AirPlayFeatureFlags.AudioFormats2
    | AirPlayFeatureFlags.AudioFormats3
    | AirPlayFeatureFlags.SupportsPTP;

function parseStatusFlags(txt: Record<string, string>): bigint {
    const value = (txt.sf || txt.flags || '0').trim().replace(/^0x/i, '');

    if (!/^[0-9a-f]+$/i.test(value)) {
        return 0n;
    }

    return BigInt(`0x${value}`);
}
