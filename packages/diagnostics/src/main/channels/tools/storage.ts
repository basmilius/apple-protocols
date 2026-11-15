import { STORAGE_PROTOCOLS, type StorageDump, type StoredDeviceInfo, type StorageProtocol } from '@shared/contract';
import type { StorageData, StoredCredentials, StorageQueue } from '../../storage';

/** Mask credential key material; keep `accessoryIdentifier` visible as the device name. */
const SECRET_FIELDS: readonly string[] = ['accessoryLongTermPublicKey', 'pairingId', 'publicKey', 'secretKey'];

function mask(value: unknown): string {
    const length = typeof value === 'string' ? Buffer.from(value, 'base64').length : 0;

    return `[hidden, ${length} bytes]`;
}

/** The string form starts with the accessory id; everything after it is key material. */
function maskCredentials(credentials: StoredCredentials): unknown {
    if (typeof credentials === 'string') {
        const [prefix, identifier = ''] = credentials.split('.');

        return {form: prefix, accessoryIdentifier: Buffer.from(identifier, 'base64url').toString('utf8'), keys: '[hidden]'};
    }

    return Object.fromEntries(Object.entries(credentials).map(([field, value]) => [field, SECRET_FIELDS.includes(field) ? mask(value) : value]));
}

/** Mask keys in main so they never cross IPC without an explicit reveal request. */
function maskData(data: StorageData): unknown {
    return {
        ...data,
        credentials: Object.fromEntries(Object.entries(data.credentials).map(([key, credentials]) => [key, maskCredentials(credentials)]))
    };
}

export function listDevices(storage: StorageQueue): readonly StoredDeviceInfo[] {
    return storage.storage.listDevices().map(device => ({
        identifier: device.identifier,
        name: device.name,
        credentials: STORAGE_PROTOCOLS.filter(protocol => storage.storage.hasCredentials(device.identifier, protocol))
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
