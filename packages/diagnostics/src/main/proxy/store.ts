import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type AccessoryIdentity, generateAccessoryIdentity } from '@corewire/core/pairing';

/** The proxy state file. Buffers are hex strings. */
type ProxyStoreData = {
    version: 1;

    /** The identities the proxy presents, keyed by a name such as the id of the target device. */
    identities: Record<string, {identifier: string; publicKey: string; secretKey: string}>;

    /** Long-term public keys of the controllers that paired with the proxy, keyed by pairing id. */
    controllers: Record<string, string>;
};

/**
 * Keeps the accessory identities of the proxy and the controllers that paired with it in
 * `~/.config/apple-protocols/proxy.json`, so a controller stays paired across runs and pair-verify
 * finds its long-term key.
 */
export class ProxyStore {
    readonly #path: string;
    #data: ProxyStoreData;

    /** @param path - Overrides the location of the state file. */
    constructor(path?: string) {
        this.#path = path ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.config', 'apple-protocols', 'proxy.json');
        this.#data = {version: 1, identities: {}, controllers: {}};
    }

    /** Missing storage starts fresh; unreadable or corrupt identities must not be replaced. */
    load(): void {
        try {
            const parsed = JSON.parse(readFileSync(this.#path, 'utf8')) as Partial<ProxyStoreData>;

            if (parsed.version !== 1 || !parsed.identities || typeof parsed.identities !== 'object' || Array.isArray(parsed.identities) || !parsed.controllers || typeof parsed.controllers !== 'object' || Array.isArray(parsed.controllers)) {
                throw new Error('Invalid proxy store schema.');
            }

            const isHex = (value: unknown, bytes: number): boolean => typeof value === 'string' && new RegExp(`^[a-f0-9]{${bytes * 2}}$`, 'i').test(value);

            for (const identity of Object.values(parsed.identities)) {
                if (!identity || typeof identity.identifier !== 'string' || !isHex(identity.publicKey, 32) || !isHex(identity.secretKey, 64)) {
                    throw new Error('Invalid proxy identity.');
                }
            }

            if (Object.values(parsed.controllers).some(key => !isHex(key, 32))) {
                throw new Error('Invalid controller public key.');
            }

            this.#data = parsed as ProxyStoreData;
            chmodSync(this.#path, 0o600);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new Error(`Cannot load proxy identities from ${this.#path}.`, {cause: error});
            }

            this.#data = {version: 1, identities: {}, controllers: {}};
        }
    }

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
     * Generates and saves the identity on first use.
     *
     * @param key - A name for the identity, typically the id of the target device.
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
     * Saves the key of a controller after a successful pair-setup.
     *
     * @param longTermPublicKey - Ed25519, 32 bytes.
     */
    rememberController(pairingId: string, longTermPublicKey: Buffer): void {
        if (longTermPublicKey.length !== 32) {
            throw new Error('Controller public key must contain 32 bytes.');
        }

        Object.defineProperty(this.#data.controllers, pairingId, {enumerable: true, configurable: true, writable: true, value: longTermPublicKey.toString('hex')});
        this.save();
    }

    /** Returns the Ed25519 long-term public key of a controller, or undefined when it never paired. */
    controller(pairingId: string): Buffer | undefined {
        const hex = this.#data.controllers[pairingId];

        return Object.hasOwn(this.#data.controllers, pairingId) && typeof hex === 'string' ? Buffer.from(hex, 'hex') : undefined;
    }
}
