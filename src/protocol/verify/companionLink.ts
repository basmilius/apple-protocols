import tweetnacl, { type BoxKeyPair } from 'tweetnacl';
import { debug } from '@/cli';
import { decryptChacha20, encryptChacha20, generateCurve25519KeyPair, generateCurve25519SharedSecKey, hkdf } from '@/crypto';
import { bailTlv, decodeTlv, encodeTlv, TlvState, TlvValue } from '@/encoding';
import { CompanionLinkFrameType, CompanionLinkSocket } from '@/socket';
import CompanionLink from '../companionLink';

export default class {
    readonly #protocol: CompanionLink;
    readonly #socket: CompanionLinkSocket;
    readonly #ephemeralKeyPair: BoxKeyPair;

    constructor(protocol: CompanionLink, socket: CompanionLinkSocket) {
        this.#protocol = protocol;
        this.#socket = socket;
        this.#ephemeralKeyPair = generateCurve25519KeyPair();
    }

    async start(credentials: Credentials): Promise<AccessoryKeys> {
        const m1 = await this.#m1();
        const m2 = await this.#m2(credentials.accessoryIdentifier, credentials.accessoryLongTermPublicKey, m1);

        await this.#m3(credentials.pairingId, credentials.secretKey, m2);

        return await this.#m4(m2);
    }

    async #m1(): Promise<M1> {
        const [, response] = await this.#socket.exchange(CompanionLinkFrameType.PV_Start, {
            _pd: encodeTlv([
                [TlvValue.State, TlvState.M1],
                [TlvValue.PublicKey, Buffer.from(this.#ephemeralKeyPair.publicKey)]
            ]),
            _auTy: 4
        });

        const data = this.#tlv(response);
        const serverPublicKey = data.get(TlvValue.PublicKey);
        const encryptedData = data.get(TlvValue.EncryptedData);

        return {
            encryptedData,
            serverPublicKey
        };
    }

    async #m2(localAccessoryIdentifier: string, longTermPublicKey: Buffer, m1: M1): Promise<M2> {
        const sharedSecret = Buffer.from(generateCurve25519SharedSecKey(
            this.#ephemeralKeyPair.secretKey,
            m1.serverPublicKey
        ));

        const sessionKey = hkdf({
            hash: 'sha512',
            key: sharedSecret,
            length: 32,
            salt: Buffer.from('Pair-Verify-Encrypt-Salt'),
            info: Buffer.from('Pair-Verify-Encrypt-Info')
        });

        const encryptedData = m1.encryptedData.subarray(0, -16);
        const encryptedTag = m1.encryptedData.subarray(-16);

        const data = decryptChacha20(sessionKey, Buffer.from('PV-Msg02'), null, encryptedData, encryptedTag);
        const tlv = decodeTlv(data);

        const accessoryIdentifier = tlv.get(TlvValue.Identifier);
        const accessorySignature = tlv.get(TlvValue.Signature);

        if (accessoryIdentifier.toString() !== localAccessoryIdentifier) {
            throw new Error(`Invalid accessory identifier. Expected ${accessoryIdentifier.toString()} to be ${localAccessoryIdentifier}.`);
        }

        const accessoryInfo = Buffer.concat([
            m1.serverPublicKey,
            accessoryIdentifier,
            this.#ephemeralKeyPair.publicKey
        ]);

        if (!tweetnacl.sign.detached.verify(accessoryInfo, accessorySignature, longTermPublicKey)) {
            throw new Error('Invalid accessory signature.');
        }

        return {
            serverEphemeralPublicKey: m1.serverPublicKey,
            sessionKey,
            sharedSecret
        };
    }

    async #m3(pairingId: Buffer, secretKey: Buffer, m2: M2): Promise<M3> {
        const iosDeviceInfo = Buffer.concat([
            this.#ephemeralKeyPair.publicKey,
            pairingId,
            m2.serverEphemeralPublicKey
        ]);

        const iosDeviceSignature = Buffer.from(tweetnacl.sign.detached(iosDeviceInfo, secretKey));

        const innerTlv = encodeTlv([
            [TlvValue.Identifier, pairingId],
            [TlvValue.Signature, iosDeviceSignature]
        ]);

        const {authTag, ciphertext} = encryptChacha20(m2.sessionKey, Buffer.from('PV-Msg03'), null, innerTlv);
        const encrypted = Buffer.concat([ciphertext, authTag]);

        const [, response] = await this.#socket.exchange(CompanionLinkFrameType.PV_Next, {
            _pd: encodeTlv([
                [TlvValue.State, TlvState.M3],
                [TlvValue.EncryptedData, encrypted]
            ]),
            _auTy: 4
        });

        console.log(this.#tlv(response));

        return {};
    }

    async #m4(m2: M2): Promise<AccessoryKeys> {
        const accessoryToControllerKey = hkdf({
            hash: 'sha512',
            key: m2.sharedSecret,
            length: 32,
            salt: Buffer.alloc(0),
            info: Buffer.from('ServerEncrypt-main')
        });

        const controllerToAccessoryKey = hkdf({
            hash: 'sha512',
            key: m2.sharedSecret,
            length: 32,
            salt: Buffer.alloc(0),
            info: Buffer.from('ClientEncrypt-main')
        });

        return {
            accessoryToControllerKey,
            controllerToAccessoryKey
        };
    }

    #tlv(response: unknown): Map<number, Buffer> {
        if (typeof response !== 'object' || response === null) {
            throw new Error('Invalid response from receiver.');
        }

        const data = decodeTlv(response['_pd']);

        if (data.has(TlvValue.Error)) {
            bailTlv(data);
        }

        debug('Decoded TLV', data);

        return data;
    }
}

type Credentials = {
    readonly accessoryIdentifier: string;
    readonly accessoryLongTermPublicKey: Buffer;
    readonly pairingId: Buffer;
    readonly publicKey: Buffer;
    readonly secretKey: Buffer;
};

type M1 = {
    readonly encryptedData: Buffer;
    readonly serverPublicKey: Buffer;
};

type M2 = {
    readonly serverEphemeralPublicKey: Buffer;
    readonly sessionKey: Buffer;
    readonly sharedSecret: Buffer;
};

type M3 = {};

type AccessoryKeys = {
    readonly accessoryToControllerKey: Buffer;
    readonly controllerToAccessoryKey: Buffer;
};
