/**
 * AirPlay feature flags (64-bit bitmask).
 *
 * Sources: pyatv, Apple framework disassembly (AirPlayReceiver sysInfo_createFeaturesInternal),
 * https://emanuelecozzi.net/docs/airplay2/features/
 */
export const AirPlayFeature: Record<string, bigint> = {
    SupportsAirPlayVideoV1: 1n << 0n,
    SupportsAirPlayPhoto: 1n << 1n,
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

/** Features we advertise for remote control sessions. */
export const SENDER_FEATURES_REMOTE_CONTROL: bigint =
    AirPlayFeature.SupportsAirPlayAudio
    | AirPlayFeature.AudioRedundant
    | AirPlayFeature.MetadataFeatures0
    | AirPlayFeature.MetadataFeatures1
    | AirPlayFeature.MetadataFeatures2
    | AirPlayFeature.MetadataFeatures3
    | AirPlayFeature.Authentication4
    | AirPlayFeature.Authentication1
    | AirPlayFeature.HasUnifiedAdvertiserInfo
    | AirPlayFeature.SupportsUnifiedMediaControl
    | AirPlayFeature.SupportsSystemPairing
    | AirPlayFeature.SupportsCoreUtilsPairingAndEncryption
    | AirPlayFeature.SupportsHKPairingAndAccessControl
    | AirPlayFeature.SupportsHangdogRemoteControl
    | AirPlayFeature.SupportsAPSync
    | AirPlayFeature.SupportsSetPeersExtendedMessage
    | AirPlayFeature.SupportsVolume;

/** Features we advertise for audio streaming sessions. */
export const SENDER_FEATURES_AUDIO: bigint =
    SENDER_FEATURES_REMOTE_CONTROL
    | AirPlayFeature.SupportsBufferedAudio
    | AirPlayFeature.SupportsAudioStreamConnectionSetup
    | AirPlayFeature.SupportsAudioMetadataControl
    | AirPlayFeature.AudioFormats0
    | AirPlayFeature.AudioFormats1
    | AirPlayFeature.AudioFormats2
    | AirPlayFeature.AudioFormats3
    | AirPlayFeature.SupportsPTP;

/** Helper to check if a feature set has a specific feature. */
export const hasFeature = (features: bigint, feature: bigint): boolean =>
    (features & feature) === feature;

/** Decode a features bitmask into a list of human-readable flag names. */
export const decodeFeatures = (features: bigint): string[] => {
    const result: string[] = [];

    for (const [name, bit] of Object.entries(AirPlayFeature)) {
        if ((features & bit) === bit) {
            result.push(name);
        }
    }

    return result;
};
