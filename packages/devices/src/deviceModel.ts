/** The Apple device models discovery recognizes. */
export enum DeviceModel {
    Unknown = 0,

    AppleTVGen2 = 1,
    AppleTVGen3 = 2,
    AppleTVHD = 3,
    AppleTV4K = 4,
    AppleTV4KGen2 = 5,
    AppleTV4KGen3 = 6,

    HomePod = 10,
    HomePodMini = 11,
    HomePodGen2 = 12,

    AirPortExpress = 20,
    AirPortExpressGen2 = 21
}

/** The family a device model belongs to. */
export enum DeviceFamily {
    Unknown = 0,
    AppleTV = 1,
    HomePod = 2,
    AirPort = 3
}

/** Maps Apple model identifiers (e.g. "AppleTV6,2") to known device models. */
const MODEL_IDENTIFIERS: Record<string, DeviceModel> = {
    'AppleTV2,1': DeviceModel.AppleTVGen2,
    'AppleTV3,1': DeviceModel.AppleTVGen3,
    'AppleTV3,2': DeviceModel.AppleTVGen3,
    'AppleTV5,3': DeviceModel.AppleTVHD,
    'AppleTV6,2': DeviceModel.AppleTV4K,
    'AppleTV11,1': DeviceModel.AppleTV4KGen2,
    'AppleTV14,1': DeviceModel.AppleTV4KGen3,

    'AudioAccessory1,1': DeviceModel.HomePod,
    'AudioAccessory1,2': DeviceModel.HomePod,
    'AudioAccessory5,1': DeviceModel.HomePodMini,
    'AudioAccessorySingle5,1': DeviceModel.HomePodMini,
    'AudioAccessory6,1': DeviceModel.HomePodGen2,

    'AirPort4,107': DeviceModel.AirPortExpress,
    'AirPort10,115': DeviceModel.AirPortExpressGen2
};

/** Maps Apple internal code names (e.g. "J305AP") to known device models. */
const INTERNAL_NAMES: Record<string, DeviceModel> = {
    'K66AP': DeviceModel.AppleTVGen2,
    'J33AP': DeviceModel.AppleTVGen3,
    'J33IAP': DeviceModel.AppleTVGen3,
    'J42dAP': DeviceModel.AppleTVHD,
    'J105aAP': DeviceModel.AppleTV4K,
    'J305AP': DeviceModel.AppleTV4KGen2,
    'J255AP': DeviceModel.AppleTV4KGen3,
    'B520AP': DeviceModel.HomePodMini
};

const MODEL_NAMES: Record<DeviceModel, string> = {
    [DeviceModel.Unknown]: 'Unknown',
    [DeviceModel.AppleTVGen2]: 'Apple TV (2nd generation)',
    [DeviceModel.AppleTVGen3]: 'Apple TV (3rd generation)',
    [DeviceModel.AppleTVHD]: 'Apple TV HD',
    [DeviceModel.AppleTV4K]: 'Apple TV 4K (1st generation)',
    [DeviceModel.AppleTV4KGen2]: 'Apple TV 4K (2nd generation)',
    [DeviceModel.AppleTV4KGen3]: 'Apple TV 4K (3rd generation)',
    [DeviceModel.HomePod]: 'HomePod',
    [DeviceModel.HomePodMini]: 'HomePod mini',
    [DeviceModel.HomePodGen2]: 'HomePod (2nd generation)',
    [DeviceModel.AirPortExpress]: 'AirPort Express',
    [DeviceModel.AirPortExpressGen2]: 'AirPort Express (2nd generation)'
};

const MODEL_TYPES: Record<DeviceModel, DeviceFamily> = {
    [DeviceModel.Unknown]: DeviceFamily.Unknown,
    [DeviceModel.AppleTVGen2]: DeviceFamily.AppleTV,
    [DeviceModel.AppleTVGen3]: DeviceFamily.AppleTV,
    [DeviceModel.AppleTVHD]: DeviceFamily.AppleTV,
    [DeviceModel.AppleTV4K]: DeviceFamily.AppleTV,
    [DeviceModel.AppleTV4KGen2]: DeviceFamily.AppleTV,
    [DeviceModel.AppleTV4KGen3]: DeviceFamily.AppleTV,
    [DeviceModel.HomePod]: DeviceFamily.HomePod,
    [DeviceModel.HomePodMini]: DeviceFamily.HomePod,
    [DeviceModel.HomePodGen2]: DeviceFamily.HomePod,
    [DeviceModel.AirPortExpress]: DeviceFamily.AirPort,
    [DeviceModel.AirPortExpressGen2]: DeviceFamily.AirPort
};

/**
 * Resolves an Apple model identifier or internal code name to a known device model.
 *
 * @param identifier - A model identifier (e.g. "AppleTV6,2") or an internal name (e.g. "J305AP").
 * @returns {@link DeviceModel.Unknown} when the identifier is not in the table.
 */
export function lookupDeviceModel(identifier: string): DeviceModel {
    return MODEL_IDENTIFIERS[identifier] ?? INTERNAL_NAMES[identifier] ?? DeviceModel.Unknown;
}

/** Returns the display name of a device model, such as "Apple TV 4K (2nd generation)" or "Unknown". */
export function getDeviceModelName(model: DeviceModel): string {
    return MODEL_NAMES[model] ?? 'Unknown';
}

/** Returns the family of a device model, {@link DeviceFamily.Unknown} for a model it does not know. */
export function getDeviceFamily(model: DeviceModel): DeviceFamily {
    return MODEL_TYPES[model] ?? DeviceFamily.Unknown;
}

/** Checks whether the model is any Apple TV generation. */
export function isAppleTV(model: DeviceModel): boolean {
    return getDeviceFamily(model) === DeviceFamily.AppleTV;
}

/** Checks whether the model is any HomePod variant. */
export function isHomePod(model: DeviceModel): boolean {
    return getDeviceFamily(model) === DeviceFamily.HomePod;
}

/** Checks whether the model is any AirPort Express generation. */
export function isAirPort(model: DeviceModel): boolean {
    return getDeviceFamily(model) === DeviceFamily.AirPort;
}
