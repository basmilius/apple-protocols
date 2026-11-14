import { Aes, Chacha20, deriveEncryptionKeys, hkdf } from '../crypto';
import { TLV8 } from '../encoding';
import type { Context } from '../transport';

/** Encrypts and decrypts the sub-TLVs that M5/M6 and pair-verify M2/M3 carry. */
export type PairingCipher = {
    seal(nonce: string, plaintext: Buffer): Buffer;
    open(nonce: string, sealed: Buffer): Buffer;
};

/** HKDF-SHA512 with string salt and info, as every HAP pairing key uses. */
export function deriveKey(key: Buffer, salt: string, info: string, length: number = 32): Buffer {
    return hkdf({
        hash: 'sha512',
        key,
        length,
        salt: Buffer.from(salt),
        info: Buffer.from(info)
    });
}

/**
 * ChaCha20-Poly1305 with the session key and an 8-byte message nonce ("PS-Msg05"), the auth tag
 * appended. Legacy devices use AES-128-CTR instead, keyed from the shared secret; the nonce then
 * plays no part.
 */
export function pairingCipher(phase: 'Pair-Setup' | 'Pair-Verify', sharedSecret: Buffer, sessionKey: Buffer, useAes: boolean): PairingCipher {
    if (useAes) {
        const key = deriveKey(sharedSecret, '', `${phase}-AES-Key`, 16);
        const iv = deriveKey(sharedSecret, '', `${phase}-AES-IV`, 16);

        return {
            seal: (_, plaintext) => Aes.encrypt(key, iv, plaintext),
            open: (_, sealed) => Aes.decrypt(key, iv, sealed)
        };
    }

    return {
        seal: (nonce, plaintext) => {
            const {authTag, ciphertext} = Chacha20.encrypt(sessionKey, Buffer.from(nonce), null, plaintext);

            return Buffer.concat([ciphertext, authTag]);
        },
        open: (nonce, sealed) => Chacha20.decrypt(sessionKey, Buffer.from(nonce), null, sealed.subarray(0, -16), sealed.subarray(-16))
    };
}

/** The HAP channel keys, named from the controller's side: we decrypt with `Control-Read-Encryption-Key`. */
export function deriveControlKeys(sharedSecret: Buffer): {accessoryToControllerKey: Buffer; controllerToAccessoryKey: Buffer} {
    const {readKey, writeKey} = deriveEncryptionKeys(sharedSecret, 'Control-Salt', 'Control-Read-Encryption-Key', 'Control-Write-Encryption-Key');

    return {
        accessoryToControllerKey: readKey,
        controllerToAccessoryKey: writeKey
    };
}

/** Decodes a TLV8 message and throws the accessory's error when it carries one. */
export function decodeTlv(context: Context, buffer: Buffer): Map<number, Buffer> {
    const data = TLV8.decode(buffer);

    if (data.has(TLV8.Value.Error)) {
        TLV8.bail(data);
    }

    context.logger.raw('Decoded TLV', data);

    return data;
}
