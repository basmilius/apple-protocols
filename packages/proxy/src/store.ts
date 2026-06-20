import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

    /** Loads the state file, tolerating a missing or corrupt file by starting fresh. */
    load(): void {
        try {
            const parsed = JSON.parse(readFileSync(this.#path, 'utf8')) as Partial<ProxyStoreData>;
            this.#data = {
                version: 1,
                identities: parsed.identities ?? {},
                controllers: parsed.controllers ?? {}
            };
        } catch {
            this.#data = {version: 1, identities: {}, controllers: {}};
        }
    }

    /** Writes the state file, creating the directory if needed. */
    save(): void {
        mkdirSync(dirname(this.#path), {recursive: true});
        writeFileSync(this.#path, JSON.stringify(this.#data, null, 4), 'utf8');
    }

    /**
     * Returns the accessory identity for the given key, generating and persisting a new one on first use.
     *
     * @param key - A logical name for the identity (typically the target device id).
     * @returns The accessory identity.
     */
    accessoryIdentity(key: string): AccessoryIdentity {
        const existing = this.#data.identities[key];

        if (existing) {
            return {
                identifier: existing.identifier,
                publicKey: Buffer.from(existing.publicKey, 'hex'),
                secretKey: Buffer.from(existing.secretKey, 'hex')
            };
        }

        const identity = generateAccessoryIdentity();

        this.#data.identities[key] = {
            identifier: identity.identifier,
            publicKey: identity.publicKey.toString('hex'),
            secretKey: identity.secretKey.toString('hex')
        };

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
        this.#data.controllers[pairingId] = longTermPublicKey.toString('hex');
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

        return hex ? Buffer.from(hex, 'hex') : undefined;
    }
}
