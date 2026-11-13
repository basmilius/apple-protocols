import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type AccessoryIdentity, generateAccessoryIdentity } from '@basmilius/apple-common';

/** On-disk shape of the proxy state file. Buffers are stored as hex strings. */
type ProxyStoreData = {
    version: 1;
    /** Accessory identities the proxy presents, keyed by a logical name (e.g. the target device id). */
    identities: Record<string, {identifier: string; publicKey: string; secretKey: string}>;
    /** Long-term public keys of controllers that paired with the proxy, keyed by their pairing id. */
    controllers: Record<string, string>;
};

/**
 * Persists the proxy's own accessory identities and the controllers that have paired with it, so that a
 * controller stays paired across runs (and pair-verify can resolve its long-term key). Stored alongside
 * the client credentials in `~/.config/apple-protocols/proxy.json`.
 */
export class ProxyStore {
    readonly #path: string;
    #data: ProxyStoreData;

    /**
     * @param path - Optional override for the state file location.
     */
    constructor(path?: string) {
        this.#path = path ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.config', 'apple-protocols', 'proxy.json');
        this.#data = {version: 1, identities: {}, controllers: {}};
    }

    /** Missing storage starts fresh; unreadable or corrupt identities must not be replaced. */
    load(): void {
        try {
            const parsed = JSON.parse(readFileSync(this.#path, 'utf8')) as Partial<ProxyStoreData>;
            if (parsed.version !== 1 || !parsed.identities || typeof parsed.identities !== 'object' || Array.isArray(parsed.identities) || !parsed.controllers || typeof parsed.controllers !== 'object' || Array.isArray(parsed.controllers)) throw new Error('Invalid proxy store schema.');
            const hex = (value: unknown, bytes: number): boolean => typeof value === 'string' && new RegExp(`^[a-f0-9]{${bytes * 2}}$`, 'i').test(value);
            for (const identity of Object.values(parsed.identities)) {
                if (!identity || typeof identity.identifier !== 'string' || !hex(identity.publicKey, 32) || !hex(identity.secretKey, 64)) throw new Error('Invalid proxy identity.');
            }
            if (Object.values(parsed.controllers).some(key => !hex(key, 32))) throw new Error('Invalid controller public key.');
            this.#data = parsed as ProxyStoreData;
            chmodSync(this.#path, 0o600);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new Error(`Cannot load proxy identities from ${this.#path}`, {cause: error});
            }
            this.#data = {version: 1, identities: {}, controllers: {}};
        }
    }

    /** Writes the state file, creating the directory if needed. */
    save(): void {
        mkdirSync(dirname(this.#path), {recursive: true, mode: 0o700});
        const temporaryPath = `${this.#path}.${randomUUID()}.tmp`;
        try {
            writeFileSync(temporaryPath, JSON.stringify(this.#data, null, 4), {encoding: 'utf8', mode: 0o600, flag: 'wx'});
            renameSync(temporaryPath, this.#path);
        } finally {
            rmSync(temporaryPath, {force: true});
        }
    }

    /**
     * Returns the accessory identity for the given key, generating and persisting a new one on first use.
     *
     * @param key - A logical name for the identity (typically the target device id).
     * @returns The accessory identity.
     */
    accessoryIdentity(key: string): AccessoryIdentity {
        const existing = this.#data.identities[key];

        if (Object.hasOwn(this.#data.identities, key)) {
            return {
                identifier: existing.identifier,
                publicKey: Buffer.from(existing.publicKey, 'hex'),
                secretKey: Buffer.from(existing.secretKey, 'hex')
            };
        }

        const identity = generateAccessoryIdentity();

        Object.defineProperty(this.#data.identities, key, {enumerable: true, configurable: true, writable: true, value: {
            identifier: identity.identifier,
            publicKey: identity.publicKey.toString('hex'),
            secretKey: identity.secretKey.toString('hex')
        }});

        this.save();

        return identity;
    }

    /**
     * Records a controller's long-term public key after a successful pair-setup.
     *
     * @param pairingId - The controller's pairing identifier.
     * @param longTermPublicKey - The controller's Ed25519 long-term public key.
     */
    rememberController(pairingId: string, longTermPublicKey: Buffer): void {
        if (longTermPublicKey.length !== 32) throw new Error('Controller public key must contain 32 bytes.');
        Object.defineProperty(this.#data.controllers, pairingId, {enumerable: true, configurable: true, writable: true, value: longTermPublicKey.toString('hex')});
        this.save();
    }

    /**
     * Looks up a controller's long-term public key by pairing identifier.
     *
     * @param pairingId - The controller's pairing identifier.
     * @returns The Ed25519 long-term public key, or undefined if the controller is unknown.
     */
    controller(pairingId: string): Buffer | undefined {
        const hex = this.#data.controllers[pairingId];

        return Object.hasOwn(this.#data.controllers, pairingId) && typeof hex === 'string' ? Buffer.from(hex, 'hex') : undefined;
    }
}
