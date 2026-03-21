export const AirPlayFeatureFlags = {
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
} as const;

export type AirPlayFeatureFlagName = keyof typeof AirPlayFeatureFlags;

export type PairingRequirement = 'none' | 'pin' | 'transient' | 'homekit';

const PASSWORD_BIT = 0x80n;
const LEGACY_PAIRING_BIT = 0x200n;
const PIN_REQUIRED_BIT = 0x8n;

export const parseFeatures = (features: string): bigint => {
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
};

export const hasFeatureFlag = (features: bigint, flag: bigint): boolean =>
    (features & flag) !== 0n;

export const describeFlags = (features: bigint): AirPlayFeatureFlagName[] => {
    const result: AirPlayFeatureFlagName[] = [];

    for (const [name, flag] of Object.entries(AirPlayFeatureFlags)) {
        if (hasFeatureFlag(features, flag)) {
            result.push(name as AirPlayFeatureFlagName);
        }
    }

    return result;
};

export const getProtocolVersion = (txt: Record<string, string>): 1 | 2 => {
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
};

export const getPairingRequirement = (txt: Record<string, string>): PairingRequirement => {
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
};

export const isPasswordRequired = (txt: Record<string, string>): boolean => {
    if (txt.pw === 'true') {
        return true;
    }

    const sf = txt.sf ? BigInt(txt.sf) : 0n;

    return (sf & PASSWORD_BIT) !== 0n;
};

export const isRemoteControlSupported = (txt: Record<string, string>): boolean => {
    const featuresStr = txt.features ?? txt.ft;

    if (!featuresStr) {
        return false;
    }

    const features = parseFeatures(featuresStr);

    return hasFeatureFlag(features, AirPlayFeatureFlags.SupportsHangdogRemoteControl);
};
