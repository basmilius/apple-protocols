import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AccessoryCredentials } from '@apple-protocols/core/pairing';
import { Credentials } from '@apple-protocols/devices';

/** Protocols that can have stored pairing credentials. */
export type ProtocolType = 'airplay' | 'companionLink' | 'raop';

export type StoredDevice = {
    readonly identifier: string;
    readonly name: string;
};

/** The five fields with base64 binaries, as diagnostics stored them before the string form. */
export type LegacyCredentials = {
    readonly accessoryIdentifier: string;
    readonly accessoryLongTermPublicKey: string;
    readonly pairingId: string;
    readonly publicKey: string;
    readonly secretKey: string;
};

/** New pairings store the string form of `Credentials`; entries written before stay as they are. */
export type StoredCredentials = string | LegacyCredentials;

/** The storage file, keyed by device id and by `deviceId:protocol`. */
export type StorageData = {
    version: 1;
    devices: Record<string, StoredDevice>;
    credentials: Record<string, StoredCredentials>;
};

const LEGACY_FIELDS: readonly (keyof LegacyCredentials)[] = ['accessoryIdentifier', 'accessoryLongTermPublicKey', 'pairingId', 'publicKey', 'secretKey'];
const STRING_PREFIX = 'cw1.';

function credentialKey(deviceId: string, protocol: ProtocolType): string {
    return `${deviceId}:${protocol}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reads either stored form back into the credentials the protocol packages take. */
function accessoryCredentialsOf(stored: StoredCredentials): AccessoryCredentials {
    if (typeof stored !== 'string') {
        return {
            accessoryIdentifier: stored.accessoryIdentifier,
            accessoryLongTermPublicKey: Buffer.from(stored.accessoryLongTermPublicKey, 'base64'),
            pairingId: Buffer.from(stored.pairingId, 'base64'),
            publicKey: Buffer.from(stored.publicKey, 'base64'),
            secretKey: Buffer.from(stored.secretKey, 'base64')
        };
    }

    // Validates the documented string form; its five fields are base64url, accessory id first.
    Credentials.parse(stored);

    const [identifier, accessoryLongTermPublicKey, pairingId, publicKey, secretKey] = stored.slice(STRING_PREFIX.length).split('.').map(field => Buffer.from(field, 'base64url'));

    return {accessoryIdentifier: identifier.toString('utf8'), accessoryLongTermPublicKey, pairingId, publicKey, secretKey};
}

/**
 * The device registrations and pairing credentials of diagnostics, in
 * `~/.config/apple-protocols/storage.json`. Credentials are keyed by `deviceId:protocol`, so a
 * device can hold separate AirPlay and Companion Link credentials.
 */
export class JsonStorage {
    readonly #path: string;
    #data: StorageData = {version: 1, devices: {}, credentials: {}};

    constructor(path: string) {
        this.#path = path;
    }

    get data(): StorageData {
        return this.#data;
    }

    get path(): string {
        return this.#path;
    }

    /** Reads the file when it exists. Entries are kept as written; only a new pairing writes one. */
    async load(): Promise<void> {
        if (!existsSync(this.#path)) {
            return;
        }

        const json = JSON.parse(readFileSync(this.#path, 'utf-8'));

        if (!isRecord(json) || json.version !== 1 || !isRecord(json.devices) || !isRecord(json.credentials)) {
            throw new Error('Invalid credential storage schema.');
        }

        for (const device of Object.values(json.devices)) {
            if (!isRecord(device) || typeof device.identifier !== 'string' || typeof device.name !== 'string') {
                throw new Error('Invalid stored device.');
            }
        }

        for (const credentials of Object.values(json.credentials)) {
            const valid = typeof credentials === 'string'
                ? credentials.startsWith(STRING_PREFIX)
                : isRecord(credentials) && LEGACY_FIELDS.every(field => typeof credentials[field] === 'string');

            if (!valid) {
                throw new Error('Invalid stored credentials.');
            }
        }

        this.#data = json as StorageData;
    }

    /** Writes through a temporary file, so a crash never leaves half a file. */
    async save(): Promise<void> {
        mkdirSync(dirname(this.#path), {recursive: true});

        const temporaryPath = `${this.#path}.${randomUUID()}.tmp`;

        try {
            writeFileSync(temporaryPath, JSON.stringify(this.#data, null, 2), {encoding: 'utf-8', mode: 0o600, flag: 'wx'});
            renameSync(temporaryPath, this.#path);
        } finally {
            if (existsSync(temporaryPath)) {
                unlinkSync(temporaryPath);
            }
        }
    }

    setDevice(identifier: string, device: StoredDevice): void {
        this.#data.devices[identifier] = device;
    }

    /** Removes the device and every credential stored for it. */
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

    hasCredentials(deviceId: string, protocol: ProtocolType): boolean {
        return Object.hasOwn(this.#data.credentials, credentialKey(deviceId, protocol));
    }

    /** @throws {CredentialsError} When the stored string form is malformed. */
    getCredentials(deviceId: string, protocol: ProtocolType): AccessoryCredentials | undefined {
        const stored = this.#data.credentials[credentialKey(deviceId, protocol)];

        return stored === undefined ? undefined : accessoryCredentialsOf(stored);
    }

    /** Stores the string form of `Credentials`. */
    setCredentials(deviceId: string, protocol: ProtocolType, credentials: AccessoryCredentials): void {
        this.#data.credentials[credentialKey(deviceId, protocol)] = Credentials.from(credentials).toString();
    }

    removeCredentials(deviceId: string, protocol: ProtocolType): void {
        delete this.#data.credentials[credentialKey(deviceId, protocol)];
    }
}

/** Queues credential saves in call order. */
export class StorageQueue {
    readonly #storage: JsonStorage;

    #pending: Promise<void> = Promise.resolve();

    constructor() {
        this.#storage = new JsonStorage(join(homedir(), '.config', 'apple-protocols', 'storage.json'));

        this.save = this.save.bind(this);
    }

    get storage(): JsonStorage {
        return this.#storage;
    }

    get path(): string {
        return this.#storage.path;
    }

    async load(): Promise<void> {
        await this.#storage.load();
    }

    /** Resolves once this call's write is on disk, with earlier writes already done. */
    async save(): Promise<void> {
        this.#pending = this.#pending.then(
            () => this.#storage.save(),
            () => this.#storage.save()
        );

        await this.#pending;
    }
}
