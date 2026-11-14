import { CredentialsError } from '@corewire/core';
import type { AccessoryCredentials } from '@corewire/core/pairing';

const PREFIX = 'cw1';
const BINARY_FIELDS = ['accessoryLongTermPublicKey', 'pairingId', 'publicKey', 'secretKey'] as const;

const accessories = new WeakMap<Credentials, AccessoryCredentials>();

/** The credentials inside, for the protocol packages. Not part of the public API. */
export function accessoryCredentialsOf(credentials: Credentials): AccessoryCredentials {
    return accessories.get(credentials);
}

/** Hex when the value has only hex digits and an even length; base64 otherwise. */
function decodeBinary(value: unknown, field: string): Buffer {
    if (typeof value !== 'string' || value.length === 0) {
        throw new CredentialsError(`Credentials field '${field}' is missing.`);
    }

    if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
        return Buffer.from(value, 'hex');
    }

    return Buffer.from(value, 'base64');
}

/**
 * Long-term credentials from a PIN pairing. Store them with {@link toString}; read them back, and
 * the forms stored before, with {@link parse}.
 */
export class Credentials {
    private constructor(credentials: AccessoryCredentials) {
        accessories.set(this, credentials);
    }

    /** Wraps credentials from a pairing done with a protocol package directly. */
    static from(credentials: AccessoryCredentials): Credentials {
        return new Credentials(credentials);
    }

    /**
     * Reads the string form, or an object with the five fields where the binary fields are hex or
     * base64, or a JSON string of such an object.
     *
     * @throws {CredentialsError} When the value is none of these.
     */
    static parse(value: string | Readonly<Record<string, unknown>>): Credentials {
        if (typeof value === 'string' && value.startsWith(`${PREFIX}.`)) {
            return Credentials.#parseString(value);
        }

        let stored: unknown = value;

        if (typeof value === 'string') {
            try {
                stored = JSON.parse(value);
            } catch {
                throw new CredentialsError('Credentials are neither the string form nor JSON.');
            }
        }

        if (!stored || typeof stored !== 'object') {
            throw new CredentialsError('Credentials must be a string or an object.');
        }

        const record = stored as Record<string, unknown>;

        if (typeof record.accessoryIdentifier !== 'string' || record.accessoryIdentifier.length === 0) {
            throw new CredentialsError("Credentials field 'accessoryIdentifier' is missing.");
        }

        const [accessoryLongTermPublicKey, pairingId, publicKey, secretKey] = BINARY_FIELDS.map(field => decodeBinary(record[field], field));

        return new Credentials({accessoryIdentifier: record.accessoryIdentifier, accessoryLongTermPublicKey, pairingId, publicKey, secretKey});
    }

    static #parseString(value: string): Credentials {
        const parts = value.split('.');

        if (parts.length !== 6) {
            throw new CredentialsError('Credentials string has the wrong number of fields.');
        }

        const [, identifier, ...binary] = parts.map(part => Buffer.from(part, 'base64url'));
        const [accessoryLongTermPublicKey, pairingId, publicKey, secretKey] = binary;

        if (identifier.length === 0 || binary.some(field => field.length === 0)) {
            throw new CredentialsError('Credentials string has an empty field.');
        }

        return new Credentials({accessoryIdentifier: identifier.toString('utf8'), accessoryLongTermPublicKey, pairingId, publicKey, secretKey});
    }

    /** `cw1.` and five base64url fields: accessory id (UTF-8), accessory LTPK, pairing id, public key, secret key. */
    toString(): string {
        const credentials = accessories.get(this);
        const fields = [
            Buffer.from(credentials.accessoryIdentifier, 'utf8'),
            credentials.accessoryLongTermPublicKey,
            credentials.pairingId,
            credentials.publicKey,
            credentials.secretKey
        ];

        return [PREFIX, ...fields.map(field => Buffer.from(field).toString('base64url'))].join('.');
    }

    toJSON(): string {
        return this.toString();
    }
}
