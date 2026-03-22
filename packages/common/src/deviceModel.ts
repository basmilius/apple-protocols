export enum DeviceModel {
    Unknown = 0,

    // Apple TV
    AppleTVGen2 = 1,
    AppleTVGen3 = 2,
    AppleTVHD = 3,
    AppleTV4K = 4,
    AppleTV4KGen2 = 5,
    AppleTV4KGen3 = 6,

    // HomePod
    HomePod = 10,
    HomePodMini = 11,
    HomePodGen2 = 12,

    // AirPort
    AirPortExpress = 20,
    AirPortExpressGen2 = 21,
}

export enum DeviceType {
    Unknown = 0,
    AppleTV = 1,
    HomePod = 2,
    AirPort = 3,
}

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
    'AirPort10,115': DeviceModel.AirPortExpressGen2,
};

const INTERNAL_NAMES: Record<string, DeviceModel> = {
    'K66AP': DeviceModel.AppleTVGen2,
    'J33AP': DeviceModel.AppleTVGen3,
    'J33IAP': DeviceModel.AppleTVGen3,
    'J42dAP': DeviceModel.AppleTVHD,
    'J105aAP': DeviceModel.AppleTV4K,
    'J305AP': DeviceModel.AppleTV4KGen2,
    'J255AP': DeviceModel.AppleTV4KGen3,
    'B520AP': DeviceModel.HomePodMini,
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
    [DeviceModel.AirPortExpressGen2]: 'AirPort Express (2nd generation)',
};

const MODEL_TYPES: Record<DeviceModel, DeviceType> = {
    [DeviceModel.Unknown]: DeviceType.Unknown,
    [DeviceModel.AppleTVGen2]: DeviceType.AppleTV,
    [DeviceModel.AppleTVGen3]: DeviceType.AppleTV,
    [DeviceModel.AppleTVHD]: DeviceType.AppleTV,
    [DeviceModel.AppleTV4K]: DeviceType.AppleTV,
    [DeviceModel.AppleTV4KGen2]: DeviceType.AppleTV,
    [DeviceModel.AppleTV4KGen3]: DeviceType.AppleTV,
    [DeviceModel.HomePod]: DeviceType.HomePod,
    [DeviceModel.HomePodMini]: DeviceType.HomePod,
    [DeviceModel.HomePodGen2]: DeviceType.HomePod,
    [DeviceModel.AirPortExpress]: DeviceType.AirPort,
    [DeviceModel.AirPortExpressGen2]: DeviceType.AirPort,
};

export const lookupDeviceModel = (identifier: string): DeviceModel =>
    MODEL_IDENTIFIERS[identifier] ?? INTERNAL_NAMES[identifier] ?? DeviceModel.Unknown;

export const getDeviceModelName = (model: DeviceModel): string =>
    MODEL_NAMES[model] ?? 'Unknown';

export const getDeviceType = (model: DeviceModel): DeviceType =>
    MODEL_TYPES[model] ?? DeviceType.Unknown;

export const isAppleTV = (model: DeviceModel): boolean =>
    getDeviceType(model) === DeviceType.AppleTV;

export const isHomePod = (model: DeviceModel): boolean =>
    getDeviceType(model) === DeviceType.HomePod;

export const isAirPort = (model: DeviceModel): boolean =>
    getDeviceType(model) === DeviceType.AirPort;
