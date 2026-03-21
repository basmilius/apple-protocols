import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type AccessoryCredentials } from './pairing';

export type ProtocolType = 'airplay' | 'companionLink' | 'raop';

export type StoredDevice = {
    readonly identifier: string;
    readonly name: string;
};

export type StorageData = {
    version: 1;
    devices: Record<string, StoredDevice>;
    credentials: Record<string, SerializedCredentials>;
};

type SerializedCredentials = {
    readonly accessoryIdentifier: string;
    readonly accessoryLongTermPublicKey: string;
    readonly pairingId: string;
    readonly publicKey: string;
    readonly secretKey: string;
};

const credentialKey = (deviceId: string, protocol: ProtocolType): string =>
    `${deviceId}:${protocol}`;

const serializeCredentials = (credentials: AccessoryCredentials): SerializedCredentials => ({
    accessoryIdentifier: credentials.accessoryIdentifier,
    accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('base64'),
    pairingId: credentials.pairingId.toString('base64'),
    publicKey: credentials.publicKey.toString('base64'),
    secretKey: credentials.secretKey.toString('base64')
});

const deserializeCredentials = (stored: SerializedCredentials): AccessoryCredentials => ({
    accessoryIdentifier: stored.accessoryIdentifier,
    accessoryLongTermPublicKey: Buffer.from(stored.accessoryLongTermPublicKey, 'base64'),
    pairingId: Buffer.from(stored.pairingId, 'base64'),
    publicKey: Buffer.from(stored.publicKey, 'base64'),
    secretKey: Buffer.from(stored.secretKey, 'base64')
});

const createEmptyData = (): StorageData => ({
    version: 1,
    devices: {},
    credentials: {}
});

export abstract class Storage {
    #data: StorageData = createEmptyData();

    get data(): StorageData {
        return this.#data;
    }

    abstract load(): Promise<void>;

    abstract save(): Promise<void>;

    protected setData(data: StorageData): void {
        this.#data = data;
    }

    getDevice(identifier: string): StoredDevice | undefined {
        return this.#data.devices[identifier];
    }

    setDevice(identifier: string, device: StoredDevice): void {
        this.#data.devices[identifier] = device;
    }

    removeDevice(identifier: string): void {
        delete this.#data.devices[identifier];

        for (const key of Object.keys(this.#data.credentials)) {
            if (key.startsWith(`${identifier}:`)) {
                delete this.#data.credentials[key];
            }
        }
    }

    listDevices(): StoredDevice[] {
        return Object.values(this.#data.devices);
    }

    getCredentials(deviceId: string, protocol: ProtocolType): AccessoryCredentials | undefined {
        const stored = this.#data.credentials[credentialKey(deviceId, protocol)];

        if (!stored) {
            return undefined;
        }

        return deserializeCredentials(stored);
    }

    setCredentials(deviceId: string, protocol: ProtocolType, credentials: AccessoryCredentials): void {
        this.#data.credentials[credentialKey(deviceId, protocol)] = serializeCredentials(credentials);
    }

    removeCredentials(deviceId: string, protocol: ProtocolType): void {
        delete this.#data.credentials[credentialKey(deviceId, protocol)];
    }
}

export class JsonStorage extends Storage {
    readonly #path: string;

    constructor(path?: string) {
        super();

        this.#path = path ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.config', 'apple-protocols', 'storage.json');
    }

    async load(): Promise<void> {
        if (!existsSync(this.#path)) {
            return;
        }

        const raw = readFileSync(this.#path, 'utf-8');
        const json = JSON.parse(raw);

        if (json.version === 1) {
            this.setData(json);
        }
    }

    async save(): Promise<void> {
        mkdirSync(dirname(this.#path), { recursive: true });
        writeFileSync(this.#path, JSON.stringify(this.data, null, 2), 'utf-8');
    }
}

export class MemoryStorage extends Storage {
    async load(): Promise<void> {}

    async save(): Promise<void> {}
}
