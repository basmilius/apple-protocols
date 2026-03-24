import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type AccessoryCredentials } from './pairing';

/** Protocol types that can have stored pairing credentials. */
export type ProtocolType = 'airplay' | 'companionLink' | 'raop';

/** A device record stored in persistent storage. */
export type StoredDevice = {
    readonly identifier: string;
    readonly name: string;
};

/** Top-level structure of the storage file, versioned for future migration. */
export type StorageData = {
    version: 1;
    devices: Record<string, StoredDevice>;
    credentials: Record<string, SerializedCredentials>;
};

/** Base64-serialized form of {@link AccessoryCredentials} for JSON persistence. */
type SerializedCredentials = {
    readonly accessoryIdentifier: string;
    readonly accessoryLongTermPublicKey: string;
    readonly pairingId: string;
    readonly publicKey: string;
    readonly secretKey: string;
};

/**
 * Builds the composite key for credential storage lookup.
 *
 * @param deviceId - The device identifier.
 * @param protocol - The protocol type.
 * @returns A composite key in the format "deviceId:protocol".
 */
const credentialKey = (deviceId: string, protocol: ProtocolType): string =>
    `${deviceId}:${protocol}`;

/**
 * Converts credential buffers to base64 strings for JSON serialization.
 *
 * @param credentials - The credentials to serialize.
 * @returns A JSON-safe serialized form.
 */
const serializeCredentials = (credentials: AccessoryCredentials): SerializedCredentials => ({
    accessoryIdentifier: credentials.accessoryIdentifier,
    accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('base64'),
    pairingId: credentials.pairingId.toString('base64'),
    publicKey: credentials.publicKey.toString('base64'),
    secretKey: credentials.secretKey.toString('base64')
});

/**
 * Restores credential buffers from base64-encoded strings.
 *
 * @param stored - The serialized credentials from storage.
 * @returns Fully hydrated credentials with Buffer fields.
 */
const deserializeCredentials = (stored: SerializedCredentials): AccessoryCredentials => ({
    accessoryIdentifier: stored.accessoryIdentifier,
    accessoryLongTermPublicKey: Buffer.from(stored.accessoryLongTermPublicKey, 'base64'),
    pairingId: Buffer.from(stored.pairingId, 'base64'),
    publicKey: Buffer.from(stored.publicKey, 'base64'),
    secretKey: Buffer.from(stored.secretKey, 'base64')
});

/**
 * Creates an empty storage data structure with version 1 schema.
 *
 * @returns A fresh empty storage data object.
 */
const createEmptyData = (): StorageData => ({
    version: 1,
    devices: {},
    credentials: {}
});

/**
 * Abstract base class for persistent storage of device registrations and
 * pairing credentials. Subclasses implement the actual load/save mechanism.
 *
 * Credentials are stored keyed by "deviceId:protocol" to support per-protocol
 * pairing (a device can have separate AirPlay and Companion Link credentials).
 */
export abstract class Storage {
    #data: StorageData = createEmptyData();

    /** The current storage data. */
    get data(): StorageData {
        return this.#data;
    }

    /** Loads storage data from the underlying persistence mechanism. */
    abstract load(): Promise<void>;

    /** Saves the current storage data to the underlying persistence mechanism. */
    abstract save(): Promise<void>;

    /**
     * Replaces the internal data with the given storage data.
     * Used by subclasses during load.
     *
     * @param data - The loaded storage data to set.
     */
    protected setData(data: StorageData): void {
        this.#data = data;
    }

    /**
     * Retrieves a stored device by its identifier.
     *
     * @param identifier - The device identifier.
     * @returns The stored device, or undefined if not found.
     */
    getDevice(identifier: string): StoredDevice | undefined {
        return this.#data.devices[identifier];
    }

    /**
     * Stores or updates a device registration.
     *
     * @param identifier - The device identifier.
     * @param device - The device data to store.
     */
    setDevice(identifier: string, device: StoredDevice): void {
        this.#data.devices[identifier] = device;
    }

    /**
     * Removes a device and all its associated credentials from storage.
     *
     * @param identifier - The device identifier to remove.
     */
    removeDevice(identifier: string): void {
        delete this.#data.devices[identifier];

        for (const key of Object.keys(this.#data.credentials)) {
            if (key.startsWith(`${identifier}:`)) {
                delete this.#data.credentials[key];
            }
        }
    }

    /**
     * Returns all stored devices.
     *
     * @returns An array of all stored device records.
     */
    listDevices(): StoredDevice[] {
        return Object.values(this.#data.devices);
    }

    /**
     * Retrieves pairing credentials for a device and protocol combination.
     *
     * @param deviceId - The device identifier.
     * @param protocol - The protocol type.
     * @returns The deserialized credentials, or undefined if not found.
     */
    getCredentials(deviceId: string, protocol: ProtocolType): AccessoryCredentials | undefined {
        const stored = this.#data.credentials[credentialKey(deviceId, protocol)];

        if (!stored) {
            return undefined;
        }

        return deserializeCredentials(stored);
    }

    /**
     * Stores pairing credentials for a device and protocol combination.
     *
     * @param deviceId - The device identifier.
     * @param protocol - The protocol type.
     * @param credentials - The credentials to store.
     */
    setCredentials(deviceId: string, protocol: ProtocolType, credentials: AccessoryCredentials): void {
        this.#data.credentials[credentialKey(deviceId, protocol)] = serializeCredentials(credentials);
    }

    /**
     * Removes pairing credentials for a device and protocol combination.
     *
     * @param deviceId - The device identifier.
     * @param protocol - The protocol type.
     */
    removeCredentials(deviceId: string, protocol: ProtocolType): void {
        delete this.#data.credentials[credentialKey(deviceId, protocol)];
    }
}

/**
 * JSON file-based storage implementation. Persists data to a JSON file on disk,
 * defaulting to `~/.config/apple-protocols/storage.json`.
 */
export class JsonStorage extends Storage {
    readonly #path: string;

    /**
     * @param path - Optional custom file path. Defaults to `~/.config/apple-protocols/storage.json`.
     */
    constructor(path?: string) {
        super();

        this.#path = path ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.config', 'apple-protocols', 'storage.json');
    }

    /** Loads storage data from the JSON file, if it exists. */
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

    /** Saves the current storage data to the JSON file, creating directories as needed. */
    async save(): Promise<void> {
        mkdirSync(dirname(this.#path), { recursive: true });
        writeFileSync(this.#path, JSON.stringify(this.data, null, 2), 'utf-8');
    }
}

/**
 * In-memory storage implementation. Data is not persisted between sessions.
 * Useful for testing or environments without filesystem access.
 */
export class MemoryStorage extends Storage {
    /** No-op: memory storage has nothing to load. */
    async load(): Promise<void> {}

    /** No-op: memory storage has nothing to persist. */
    async save(): Promise<void> {}
}
