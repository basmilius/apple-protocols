import { Aes, Chacha20, Curve25519, Ed25519, hkdf } from '@basmilius/apple-encryption';
import type { ToolInputOption } from '@shared/contract';
import { parseBytes, readBoolean, readNumber, readString, toHex } from './bytes';
import { keyInput, type ToolDefinition } from './registry';

/** Both protocols use 12-byte nonces with an 8-byte LE counter, but place the counter at different offsets. */
type NonceLayout = 'companionLink' | 'airplay' | 'raw';

const NONCE_OPTIONS: readonly ToolInputOption[] = [
    {value: 'companionLink', label: 'Companion Link (counter at offset 0)'},
    {value: 'airplay', label: 'AirPlay (4 zero bytes, counter at offset 4)'},
    {value: 'raw', label: 'Raw nonce'}
];

const buildNonce = (layout: NonceLayout, counter: number, raw: string): Buffer => {
    if (layout === 'raw') {
        return parseBytes(raw, 'nonce');
    }

    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64LE(BigInt(counter), layout === 'airplay' ? 4 : 0);

    return nonce;
};

type HkdfPreset = {
    readonly value: string;
    readonly label: string;
    readonly salt: string;
    readonly info: string;
    readonly length: number;
};

const HKDF_PRESETS: readonly HkdfPreset[] = [
    {value: 'pair-setup-controller-sign', label: 'Pair-Setup controller sign', salt: 'Pair-Setup-Controller-Sign-Salt', info: 'Pair-Setup-Controller-Sign-Info', length: 32},
    {value: 'pair-setup-accessory-sign', label: 'Pair-Setup accessory sign', salt: 'Pair-Setup-Accessory-Sign-Salt', info: 'Pair-Setup-Accessory-Sign-Info', length: 32},
    {value: 'pair-setup-encrypt', label: 'Pair-Setup session key', salt: 'Pair-Setup-Encrypt-Salt', info: 'Pair-Setup-Encrypt-Info', length: 32},
    {value: 'pair-setup-aes-key', label: 'Pair-Setup AES key', salt: '', info: 'Pair-Setup-AES-Key', length: 16},
    {value: 'pair-setup-aes-iv', label: 'Pair-Setup AES IV', salt: '', info: 'Pair-Setup-AES-IV', length: 16},
    {value: 'pair-verify-encrypt', label: 'Pair-Verify session key', salt: 'Pair-Verify-Encrypt-Salt', info: 'Pair-Verify-Encrypt-Info', length: 32},
    {value: 'pair-verify-aes-key', label: 'Pair-Verify AES key', salt: '', info: 'Pair-Verify-AES-Key', length: 16},
    {value: 'pair-verify-aes-iv', label: 'Pair-Verify AES IV', salt: '', info: 'Pair-Verify-AES-IV', length: 16},
    {value: 'control-read', label: 'Control read key', salt: 'Control-Salt', info: 'Control-Read-Encryption-Key', length: 32},
    {value: 'control-write', label: 'Control write key', salt: 'Control-Salt', info: 'Control-Write-Encryption-Key', length: 32},
    {value: 'events-read', label: 'Events read key', salt: 'Events-Salt', info: 'Events-Read-Encryption-Key', length: 32},
    {value: 'events-write', label: 'Events write key', salt: 'Events-Salt', info: 'Events-Write-Encryption-Key', length: 32},
    {value: 'datastream-input', label: 'DataStream input key', salt: 'DataStream-Salt', info: 'DataStream-Input-Encryption-Key', length: 32},
    {value: 'datastream-output', label: 'DataStream output key', salt: 'DataStream-Salt', info: 'DataStream-Output-Encryption-Key', length: 32},
    {value: 'companion-server', label: 'Companion Link server key', salt: '', info: 'ServerEncrypt-main', length: 32},
    {value: 'companion-client', label: 'Companion Link client key', salt: '', info: 'ClientEncrypt-main', length: 32},
    {value: 'custom', label: 'Custom', salt: '', info: '', length: 32}
];

export const ENCRYPTION_TOOLS: readonly ToolDefinition[] = [
    {
        id: 'ed25519.generate',
        title: 'Generate Ed25519 key pair',
        description: 'A signing key pair, the kind a controller identity is built on.',
        category: 'encryption',
        section: 'Ed25519',
        inputs: [],
        run: () => {
            const pair = Ed25519.generateKeyPair();
            return {publicKey: toHex(pair.publicKey), secretKey: toHex(pair.secretKey)};
        }
    },
    {
        id: 'ed25519.sign',
        title: 'Sign with Ed25519',
        description: 'Signs a message with a secret key.',
        category: 'encryption',
        section: 'Ed25519',
        inputs: [
            {name: 'message', label: 'Message', type: 'textarea', placeholder: 'Hex, or plain text with the toggle on', rows: 3},
            {name: 'asText', label: 'Message is plain text', type: 'boolean', default: false},
            keyInput('secretKey', 'Secret key')
        ],
        run: args => {
            const message = readBoolean(args, 'asText') ? Buffer.from(readString(args, 'message'), 'utf8') : parseBytes(args.message, 'message');
            return {signature: toHex(Ed25519.sign(message, parseBytes(args.secretKey, 'secretKey')))};
        }
    },
    {
        id: 'ed25519.verify',
        title: 'Verify an Ed25519 signature',
        description: 'Checks a signature against a message and a public key.',
        category: 'encryption',
        section: 'Ed25519',
        inputs: [
            {name: 'message', label: 'Message', type: 'textarea', placeholder: 'Hex, or plain text with the toggle on', rows: 3},
            {name: 'asText', label: 'Message is plain text', type: 'boolean', default: false},
            keyInput('signature', 'Signature'),
            keyInput('publicKey', 'Public key')
        ],
        run: args => {
            const message = readBoolean(args, 'asText') ? Buffer.from(readString(args, 'message'), 'utf8') : parseBytes(args.message, 'message');
            return {valid: Ed25519.verify(message, parseBytes(args.signature, 'signature'), parseBytes(args.publicKey, 'publicKey'))};
        }
    },
    {
        id: 'curve25519.generate',
        title: 'Generate Curve25519 key pair',
        description: 'The ephemeral key pair a pair-verify exchange opens with.',
        category: 'encryption',
        section: 'Curve25519',
        inputs: [],
        run: () => {
            const pair = Curve25519.generateKeyPair();
            return {publicKey: toHex(pair.publicKey), secretKey: toHex(pair.secretKey)};
        }
    },
    {
        id: 'curve25519.shared',
        title: 'Curve25519 shared secret',
        description: 'Derives the shared secret both ends of a pair-verify arrive at.',
        category: 'encryption',
        section: 'Curve25519',
        inputs: [keyInput('secretKey', 'Own secret key'), keyInput('publicKey', 'Peer public key')],
        run: args => ({sharedSecret: toHex(Curve25519.generateSharedSecKey(parseBytes(args.secretKey, 'secretKey'), parseBytes(args.publicKey, 'publicKey')))})
    },
    {
        id: 'chacha20.encrypt',
        title: 'ChaCha20-Poly1305 encrypt',
        description: 'Seals a plaintext. Pick the nonce layout of the stream you are imitating.',
        category: 'encryption',
        section: 'ChaCha20-Poly1305',
        inputs: [
            keyInput('key', 'Key (32 bytes)'),
            {name: 'layout', label: 'Nonce layout', type: 'select', default: 'airplay', options: NONCE_OPTIONS},
            {name: 'counter', label: 'Counter', type: 'number', default: 0, hint: 'The frame counter of the stream. Ignored for a raw nonce.'},
            {name: 'nonce', label: 'Raw nonce', type: 'text', placeholder: '12 bytes of hex', optional: true},
            {name: 'aad', label: 'Additional data', type: 'text', placeholder: 'The frame header, as hex', optional: true},
            {name: 'plaintext', label: 'Plaintext', type: 'textarea', placeholder: 'Hex, or plain text with the toggle on', rows: 3},
            {name: 'asText', label: 'Plaintext is plain text', type: 'boolean', default: false}
        ],
        run: args => {
            const nonce = buildNonce(readString(args, 'layout', 'airplay') as NonceLayout, readNumber(args, 'counter'), readString(args, 'nonce'));
            const aad = readString(args, 'aad').trim();
            const plaintext = readBoolean(args, 'asText') ? Buffer.from(readString(args, 'plaintext'), 'utf8') : parseBytes(args.plaintext, 'plaintext');
            const sealed = Chacha20.encrypt(parseBytes(args.key, 'key'), nonce, aad.length === 0 ? null : parseBytes(aad, 'aad'), plaintext);

            return {
                nonce: nonce.toString('hex'),
                ciphertext: sealed.ciphertext.toString('hex'),
                authTag: sealed.authTag.toString('hex'),
                sealed: Buffer.concat([sealed.ciphertext, sealed.authTag]).toString('hex')
            };
        }
    },
    {
        id: 'chacha20.decrypt',
        title: 'ChaCha20-Poly1305 decrypt',
        description: 'Opens a sealed message. Leave the tag empty to take the last 16 bytes of the ciphertext.',
        category: 'encryption',
        section: 'ChaCha20-Poly1305',
        inputs: [
            keyInput('key', 'Key (32 bytes)'),
            {name: 'layout', label: 'Nonce layout', type: 'select', default: 'airplay', options: NONCE_OPTIONS},
            {name: 'counter', label: 'Counter', type: 'number', default: 0, hint: 'The frame counter of the stream. Ignored for a raw nonce.'},
            {name: 'nonce', label: 'Raw nonce', type: 'text', placeholder: '12 bytes of hex', optional: true},
            {name: 'aad', label: 'Additional data', type: 'text', placeholder: 'The frame header, as hex', optional: true},
            {name: 'ciphertext', label: 'Ciphertext', type: 'textarea', placeholder: 'Hex, with or without the trailing tag', rows: 3},
            {name: 'authTag', label: 'Auth tag', type: 'text', placeholder: '16 bytes of hex', optional: true}
        ],
        run: args => {
            const nonce = buildNonce(readString(args, 'layout', 'airplay') as NonceLayout, readNumber(args, 'counter'), readString(args, 'nonce'));
            const aad = readString(args, 'aad').trim();
            const tagText = readString(args, 'authTag').trim();
            const sealed = parseBytes(args.ciphertext, 'ciphertext');
            const [ciphertext, authTag] =
                tagText.length === 0 ? [sealed.subarray(0, -Chacha20.CHACHA20_AUTH_TAG_LENGTH), sealed.subarray(-Chacha20.CHACHA20_AUTH_TAG_LENGTH)] : [sealed, parseBytes(tagText, 'authTag')];
            const plaintext = Chacha20.decrypt(parseBytes(args.key, 'key'), nonce, aad.length === 0 ? null : parseBytes(aad, 'aad'), Buffer.from(ciphertext), Buffer.from(authTag));

            return {
                nonce: nonce.toString('hex'),
                hex: plaintext.toString('hex'),
                text: plaintext.toString('utf8'),
                length: plaintext.length
            };
        }
    },
    {
        id: 'hkdf.derive',
        title: 'Derive a key with HKDF',
        description: 'The presets carry the salt and info strings this stack derives with; pick Custom to type your own.',
        category: 'encryption',
        section: 'HKDF',
        inputs: [
            {name: 'preset', label: 'Preset', type: 'select', default: 'control-read', options: HKDF_PRESETS.map(preset => ({value: preset.value, label: preset.label}))},
            keyInput('key', 'Shared secret'),
            {name: 'saltSuffix', label: 'Salt suffix', type: 'text', placeholder: 'The DataStream salt carries the stream seed', optional: true},
            {name: 'salt', label: 'Custom salt', type: 'text', optional: true},
            {name: 'info', label: 'Custom info', type: 'text', optional: true},
            {name: 'length', label: 'Custom length', type: 'number', default: 32, optional: true},
            {name: 'hash', label: 'Hash', type: 'select', default: 'sha512', options: [{value: 'sha512', label: 'SHA-512'}, {value: 'sha256', label: 'SHA-256'}]}
        ],
        run: args => {
            const name = readString(args, 'preset', 'control-read');
            const preset = HKDF_PRESETS.find(candidate => candidate.value === name);

            if (preset === undefined) {
                throw new Error(`Unknown preset '${name}'.`);
            }

            const custom = preset.value === 'custom';
            const salt = `${custom ? readString(args, 'salt') : preset.salt}${readString(args, 'saltSuffix')}`;
            const info = custom ? readString(args, 'info') : preset.info;
            const length = custom ? readNumber(args, 'length', 32) : preset.length;
            const hash = readString(args, 'hash', 'sha512');

            return {
                salt,
                info,
                length,
                hash,
                key: hkdf({hash, key: parseBytes(args.key, 'key'), length, salt: Buffer.from(salt, 'utf8'), info: Buffer.from(info, 'utf8')}).toString('hex')
            };
        }
    },
    {
        id: 'aes.encrypt',
        title: 'AES encrypt',
        description: 'The legacy AirPlay 1 path, where a pairing body is AES rather than ChaCha20.',
        category: 'encryption',
        section: 'AES',
        inputs: [
            keyInput('key', 'Key'),
            keyInput('iv', 'IV'),
            {name: 'plaintext', label: 'Plaintext', type: 'textarea', placeholder: 'Hex, or plain text with the toggle on', rows: 3},
            {name: 'asText', label: 'Plaintext is plain text', type: 'boolean', default: false}
        ],
        run: args => {
            const plaintext = readBoolean(args, 'asText') ? Buffer.from(readString(args, 'plaintext'), 'utf8') : parseBytes(args.plaintext, 'plaintext');
            const encrypted = Aes.encrypt(parseBytes(args.key, 'key'), parseBytes(args.iv, 'iv'), plaintext);

            return {hex: encrypted.toString('hex'), length: encrypted.length};
        }
    },
    {
        id: 'aes.decrypt',
        title: 'AES decrypt',
        description: 'Reverses the legacy AirPlay 1 path.',
        category: 'encryption',
        section: 'AES',
        inputs: [keyInput('key', 'Key'), keyInput('iv', 'IV'), {name: 'ciphertext', label: 'Ciphertext', type: 'textarea', placeholder: 'Hex', rows: 3}],
        run: args => {
            const plaintext = Aes.decrypt(parseBytes(args.key, 'key'), parseBytes(args.iv, 'iv'), parseBytes(args.ciphertext, 'ciphertext'));
            return {hex: plaintext.toString('hex'), text: plaintext.toString('utf8'), length: plaintext.length};
        }
    }
];
