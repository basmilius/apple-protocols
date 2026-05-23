import { JsonStorage } from '@basmilius/apple-common';
import type { DeviceProtocol, DeviceType } from '@shared/snapshots';

export async function createStorage(): Promise<JsonStorage> {
    const storage = new JsonStorage();
    await storage.load();
    return storage;
}

export function detectDeviceType(model: string): DeviceType {
    if (model.startsWith('AppleTV')) {
        return 'appletv';
    }

    if (/^AudioAccessory5,/.test(model)) {
        return 'homepod-mini';
    }

    if (/^AudioAccessory[16],/.test(model)) {
        return 'homepod';
    }

    return 'other';
}

export function detectPairedProtocols(
    storage: JsonStorage,
    deviceId: string,
    fallbackIds: string[] = []
): DeviceProtocol[] {
    const paired: DeviceProtocol[] = [];

    const protocols: DeviceProtocol[] = ['airplay', 'companionLink'];

    for (const protocol of protocols) {
        const direct = storage.getCredentials(deviceId, protocol);
        if (direct) {
            paired.push(protocol);
            continue;
        }

        for (const alt of fallbackIds) {
            if (storage.getCredentials(alt, protocol)) {
                paired.push(protocol);
                break;
            }
        }
    }

    return paired;
}
