import { createCipher, createDecipher } from 'chacha';

const AUTH_TAG_LENGTH = 16;
const NONCE_LENGTH = 12;

export function decrypt(key: Buffer, nonce: Buffer, add: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer {
    nonce = padNonce(nonce);

    const decipher = createDecipher(key, nonce);
    add && decipher.setAAD(add);
    decipher.setAuthTag(authTag);

    const plaintext = decipher._update(ciphertext);
    decipher._final();

    return plaintext;
}

export function encrypt(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData {
    nonce = padNonce(nonce);

    const cipher = createCipher(key, nonce);
    aad && cipher.setAAD(aad);

    const ciphertext = cipher._update(plaintext);
    cipher._final();

    const authTag = cipher.getAuthTag();

    return {
        ciphertext: ciphertext,
        authTag: authTag
    };
}

export function padNonce(nonce: Buffer): Buffer {
    if (nonce.length >= NONCE_LENGTH) {
        return nonce;
    }

    return Buffer.concat([
        Buffer.alloc(NONCE_LENGTH - nonce.length, 0),
        nonce
    ]);
}

// NOTE
// Uncomment when Bun supports chacha20-poly1305 out of box.
//
// import { createCipheriv, createDecipheriv } from 'node:crypto';
//
// export function decrypt(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer {
//     if (nonce.length < NONCE_LENGTH) {
//         nonce = Buffer.concat([
//             Buffer.alloc(NONCE_LENGTH - nonce.length, 0),
//             nonce
//         ]);
//     }
//
//     const decipher = createDecipheriv('chacha20-poly1305', key, nonce, {authTagLength: AUTH_TAG_LENGTH});
//     aad && decipher.setAAD(aad, {plaintextLength: ciphertext.length});
//     decipher.setAuthTag(authTag);
//
//     const plaintext = decipher.update(ciphertext);
//     decipher.final();
//
//     return plaintext;
// }
//
// export function encrypt(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData {
//     if (nonce.length < NONCE_LENGTH) {
//         nonce = Buffer.concat([
//             Buffer.alloc(NONCE_LENGTH - nonce.length, 0),
//             nonce
//         ]);
//     }
//
//     const cipher = createCipheriv('chacha20-poly1305', key, nonce, {authTagLength: AUTH_TAG_LENGTH});
//     aad && cipher.setAAD(aad, {plaintextLength: plaintext.length});
//
//     const ciphertext = cipher.update(plaintext);
//     cipher.final();
//
//     const authTag = cipher.getAuthTag();
//
//     return {
//         ciphertext: ciphertext,
//         authTag: authTag
//     };
// }

export type EncryptedData = {
    readonly ciphertext: Buffer;
    readonly authTag: Buffer;
};
