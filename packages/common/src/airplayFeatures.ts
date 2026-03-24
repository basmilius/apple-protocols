/** Type definition for the AirPlay feature flags bitmask object. */
type AirPlayFeatureFlagsType = {
    readonly SupportsAirPlayVideoV1: bigint;
    readonly SupportsAirPlayPhoto: bigint;
    readonly SupportsAirPlayVideoFairPlay: bigint;
    readonly SupportsAirPlayVideoVolumeControl: bigint;
    readonly SupportsAirPlayVideoHTTPLiveStreams: bigint;
    readonly SupportsAirPlaySlideShow: bigint;
    readonly SupportsAirPlayScreen: bigint;
    readonly SupportsAirPlayAudio: bigint;
    readonly AudioRedundant: bigint;
    readonly Authentication_4: bigint;
    readonly MetadataFeatures_0: bigint;
    readonly MetadataFeatures_1: bigint;
    readonly MetadataFeatures_2: bigint;
    readonly AudioFormats_0: bigint;
    readonly AudioFormats_1: bigint;
    readonly AudioFormats_2: bigint;
    readonly AudioFormats_3: bigint;
    readonly Authentication_1: bigint;
    readonly Authentication_8: bigint;
    readonly SupportsLegacyPairing: bigint;
    readonly HasUnifiedAdvertiserInfo: bigint;
    readonly IsCarPlay: bigint;
    readonly SupportsAirPlayVideoPlayQueue: bigint;
    readonly SupportsAirPlayFromCloud: bigint;
    readonly SupportsTLS_PSK: bigint;
    readonly SupportsUnifiedMediaControl: bigint;
    readonly SupportsBufferedAudio: bigint;
    readonly SupportsPTP: bigint;
    readonly SupportsScreenMultiCodec: bigint;
    readonly SupportsSystemPairing: bigint;
    readonly IsAPValeriaScreenSender: bigint;
    readonly SupportsHKPairingAndAccessControl: bigint;
    readonly SupportsCoreUtilsPairingAndEncryption: bigint;
    readonly SupportsAirPlayVideoV2: bigint;
    readonly MetadataFeatures_3: bigint;
    readonly SupportsUnifiedPairSetupAndMFi: bigint;
    readonly SupportsSetPeersExtendedMessage: bigint;
    readonly SupportsAPSync: bigint;
    readonly SupportsWoL: bigint;
    readonly SupportsWoL2: bigint;
    readonly SupportsHangdogRemoteControl: bigint;
    readonly SupportsAudioStreamConnectionSetup: bigint;
    readonly SupportsAudioMetadataControl: bigint;
    readonly SupportsRFC2198Redundancy: bigint;
};

/**
 * AirPlay feature flags as a bitmask of bigint values. Each flag corresponds to a specific
 * capability advertised by an AirPlay device in its mDNS TXT record "features" field.
 * The bit positions match Apple's internal AirPlayFeatureFlags enum.
 */
export const AirPlayFeatureFlags: AirPlayFeatureFlagsType = {
    SupportsAirPlayVideoV1: 1n << 0n,
    SupportsAirPlayPhoto: 1n << 1n,
    SupportsAirPlayVideoFairPlay: 1n << 2n,
    SupportsAirPlayVideoVolumeControl: 1n << 3n,
    SupportsAirPlayVideoHTTPLiveStreams: 1n << 4n,
    SupportsAirPlaySlideShow: 1n << 5n,
    SupportsAirPlayScreen: 1n << 7n,
    SupportsAirPlayAudio: 1n << 9n,
    AudioRedundant: 1n << 11n,
    Authentication_4: 1n << 14n,
    MetadataFeatures_0: 1n << 15n,
    MetadataFeatures_1: 1n << 16n,
    MetadataFeatures_2: 1n << 17n,
    AudioFormats_0: 1n << 18n,
    AudioFormats_1: 1n << 19n,
    AudioFormats_2: 1n << 20n,
    AudioFormats_3: 1n << 21n,
    Authentication_1: 1n << 23n,
    Authentication_8: 1n << 26n,
    SupportsLegacyPairing: 1n << 27n,
    HasUnifiedAdvertiserInfo: 1n << 30n,
    IsCarPlay: 1n << 32n,
    SupportsAirPlayVideoPlayQueue: 1n << 33n,
    SupportsAirPlayFromCloud: 1n << 34n,
    SupportsTLS_PSK: 1n << 35n,
    SupportsUnifiedMediaControl: 1n << 38n,
    SupportsBufferedAudio: 1n << 40n,
    SupportsPTP: 1n << 41n,
    SupportsScreenMultiCodec: 1n << 42n,
    SupportsSystemPairing: 1n << 43n,
    IsAPValeriaScreenSender: 1n << 44n,
    SupportsHKPairingAndAccessControl: 1n << 46n,
    SupportsCoreUtilsPairingAndEncryption: 1n << 48n,
    SupportsAirPlayVideoV2: 1n << 49n,
    MetadataFeatures_3: 1n << 50n,
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

/** String union of all known AirPlay feature flag names. */
export type AirPlayFeatureFlagName = keyof typeof AirPlayFeatureFlags;

/** The type of pairing required to connect to an AirPlay device. */
export type PairingRequirement = 'none' | 'pin' | 'transient' | 'homekit';

/** Bitmask in the "sf" (status flags) TXT field indicating password protection. */
const PASSWORD_BIT = 0x80n;

/** Bitmask in the "sf" TXT field indicating legacy pairing (PIN required). */
const LEGACY_PAIRING_BIT = 0x200n;

/** Bitmask in the "sf" TXT field indicating a PIN is required. */
const PIN_REQUIRED_BIT = 0x8n;

/**
 * Parses an AirPlay features string into a single bigint bitmask.
 * Features are advertised as either a single hex value or two comma-separated
 * 32-bit hex values (low,high) which are combined into a 64-bit bitmask.
 *
 * @param features - The features string from the mDNS TXT record.
 * @returns The combined feature flags as a bigint.
 * @throws If the features string has an unexpected format.
 */
export function parseFeatures(features: string): bigint {
    const parts = features.split(',').map(part => part.trim());

    if (parts.length === 1) {
        return BigInt(parts[0]);
    }

    if (parts.length === 2) {
        const low = BigInt(parts[0]);
        const high = BigInt(parts[1]);

        return (high << 32n) | low;
    }

    throw new Error(`Invalid features format: ${features}`);
}

/**
 * Checks whether a specific feature flag is set in a features bitmask.
 *
 * @param features - The combined feature flags bitmask.
 * @param flag - The specific flag to check for.
 * @returns True if the flag is set.
 */
export function hasFeatureFlag(features: bigint, flag: bigint): boolean {
    return (features & flag) !== 0n;
}

/**
 * Returns the names of all feature flags that are set in the given bitmask.
 * Useful for debugging and diagnostics output.
 *
 * @param features - The combined feature flags bitmask.
 * @returns An array of feature flag names that are active.
 */
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
 * Determines the AirPlay protocol version supported by a device based on its
 * mDNS TXT record properties. AirPlay 2 is indicated by the presence of
 * SupportsUnifiedMediaControl or SupportsCoreUtilsPairingAndEncryption flags.
 *
 * @param txt - The key-value properties from the device's mDNS TXT record.
 * @returns 1 for legacy AirPlay, 2 for AirPlay 2.
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
 * Determines the pairing requirement for an AirPlay device based on its
 * feature flags and status flags. The hierarchy is:
 * HomeKit pairing > PIN required > Transient (system) pairing > Legacy PIN > None.
 *
 * @param txt - The key-value properties from the device's mDNS TXT record.
 * @returns The pairing requirement type.
 */
export function getPairingRequirement(txt: Record<string, string>): PairingRequirement {
    const featuresStr = txt.features ?? txt.ft;

    if (!featuresStr) {
        return 'none';
    }

    const features = parseFeatures(featuresStr);
    const sf = txt.sf ? BigInt(txt.sf) : 0n;

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

/**
 * Checks whether the AirPlay device requires a password to connect.
 * Determined by the "pw" TXT field or the password bit in the "sf" status flags.
 *
 * @param txt - The key-value properties from the device's mDNS TXT record.
 * @returns True if a password is required.
 */
export function isPasswordRequired(txt: Record<string, string>): boolean {
    if (txt.pw === 'true') {
        return true;
    }

    const sf = txt.sf ? BigInt(txt.sf) : 0n;

    return (sf & PASSWORD_BIT) !== 0n;
}

/**
 * Checks whether the AirPlay device supports remote control (Hangdog protocol).
 * Only devices with the SupportsHangdogRemoteControl flag can receive HID events.
 *
 * @param txt - The key-value properties from the device's mDNS TXT record.
 * @returns True if remote control is supported (typically Apple TV only).
 */
export function isRemoteControlSupported(txt: Record<string, string>): boolean {
    const featuresStr = txt.features ?? txt.ft;

    if (!featuresStr) {
        return false;
    }

    const features = parseFeatures(featuresStr);

    return hasFeatureFlag(features, AirPlayFeatureFlags.SupportsHangdogRemoteControl);
}
