import type { StorageData } from '@basmilius/apple-common';
import { STORAGE_PROTOCOLS, type StorageDump, type StoredDeviceInfo, type StorageProtocol } from '@shared/contract';
import type { StorageQueue } from '../../storage';

/** Mask credential key material; keep `accessoryIdentifier` visible as the device name. */
const SECRET_FIELDS: readonly string[] = ['accessoryLongTermPublicKey', 'pairingId', 'publicKey', 'secretKey'];

const mask = (value: unknown): string => {
    const length = typeof value === 'string' ? Buffer.from(value, 'base64').length : 0;
    return `[hidden, ${length} bytes]`;
};

/** Mask keys in main so they never cross IPC without an explicit reveal request. */
const maskData = (data: StorageData): unknown => ({
    ...data,
    credentials: Object.fromEntries(
        Object.entries(data.credentials).map(([key, credentials]) => [
            key,
            Object.fromEntries(Object.entries(credentials).map(([field, value]) => [field, SECRET_FIELDS.includes(field) ? mask(value) : value]))
        ])
    )
});

export function listDevices(storage: StorageQueue): readonly StoredDeviceInfo[] {
    return storage.storage.listDevices().map(device => ({
        identifier: device.identifier,
        name: device.name,
        credentials: STORAGE_PROTOCOLS.filter(protocol => storage.storage.getCredentials(device.identifier, protocol) !== undefined)
    }));
}

export function readStorage(storage: StorageQueue, reveal: boolean): StorageDump {
    const data = storage.storage.data;
    return {path: storage.path, revealed: reveal, data: reveal ? data : maskData(data)};
}

export async function removeCredentials(storage: StorageQueue, deviceId: string, protocol: StorageProtocol): Promise<void> {
    storage.storage.removeCredentials(deviceId, protocol);
    await storage.save();
}

export async function removeDevice(storage: StorageQueue, deviceId: string): Promise<void> {
    storage.storage.removeDevice(deviceId);
    await storage.save();
}
