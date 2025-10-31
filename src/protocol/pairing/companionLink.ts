import { CompanionLinkFrameType, type CompanionLinkSocket } from '@/socket';
import { SRP, SrpClient } from 'fast-srp-hap';
import { v4 as uuid } from 'uuid';
import tweetnacl from 'tweetnacl';
import { debug } from '@/cli';
import { AIRPLAY_TRANSIENT_PIN } from '@/const';
import { decryptChacha20, encryptChacha20, hkdf } from '@/crypto';
import { bailTlv, decodeTlv, encodeOPack, encodeTlv, TlvFlags, TlvMethod, TlvState, TlvValue } from '@/encoding';
import CompanionLink from '../companionLink';

export default class {
    get name(): string {
        return this.#name;
    }

    get pairingId(): Buffer {
        return this.#pairingId;
    }

    readonly #name: string;
    readonly #pairingId: Buffer;
    readonly #protocol: CompanionLink;
    readonly #socket: CompanionLinkSocket;
    #publicKey: Buffer;
    #secretKey: Buffer;
    #srp: SrpClient;

    constructor(protocol: CompanionLink, socket: CompanionLinkSocket) {
        this.#protocol = protocol;
        this.#socket = socket;

        this.#name = 'Bas Companion Link';
        this.#pairingId = Buffer.from(uuid().toUpperCase());
    }

    async start(): Promise<void> {
        const keyPair = tweetnacl.sign.keyPair();
        this.#publicKey = Buffer.from(keyPair.publicKey);
        this.#secretKey = Buffer.from(keyPair.secretKey);
    }

    async pin(askPin: () => Promise<string>): Promise<PairingCredentials> {
        const m1 = await this.#m1();
        const m2 = await this.#m2(m1, await askPin());
        const m3 = await this.#m3(m2);
        const m4 = await this.#m4(m3);
        const m5 = await this.#m5(m4);
        const m6 = await this.#m6(m4, m5);

        if (!m6) {
            throw new Error('Pairing failed, could not get accessory keys.');
        }

        return m6;
    }

    async transient(): Promise<TransientPairingCredentials> {
        const m1 = await this.#m1([[TlvValue.Flags, TlvFlags.TransientPairing]]);
        const m2 = await this.#m2(m1);
        const m3 = await this.#m3(m2);
        const m4 = await this.#m4(m3);

        const accessoryToControllerKey = hkdf({
            hash: 'sha512',
            key: m4.sharedSecret,
            length: 32,
            salt: Buffer.from('Control-Salt'),
            info: Buffer.from('Control-Read-Encryption-Key')
        });

        const controllerToAccessoryKey = hkdf({
            hash: 'sha512',
            key: m4.sharedSecret,
            length: 32,
            salt: Buffer.from('Control-Salt'),
            info: Buffer.from('Control-Write-Encryption-Key')
        });

        return {
            pairingId: this.#pairingId,
            sharedSecret: m4.sharedSecret,
            accessoryToControllerKey,
            controllerToAccessoryKey
        };
    }

    async #m1(additionalTlv: [number, number | Buffer][] = []): Promise<M1> {
        const [, response] = await this.#socket.exchange(CompanionLinkFrameType.PS_Start, {
            _pd: encodeTlv([
                [TlvValue.Method, TlvMethod.PairSetup],
                [TlvValue.State, TlvState.M1],
                ...additionalTlv
            ]),
            _pwTy: 1
        });

        const data = this.#tlv(response);
        const publicKey = data.get(TlvValue.PublicKey);
        const salt = data.get(TlvValue.Salt);

        return {publicKey, salt};
    }

    async #m2(m1: M1, pin: string = AIRPLAY_TRANSIENT_PIN): Promise<M2> {
        const srpKey = await SRP.genKey(32);

        this.#srp = new SrpClient(SRP.params.hap, m1.salt, Buffer.from('Pair-Setup'), Buffer.from(pin), srpKey, true);
        this.#srp.setB(m1.publicKey);

        const publicKey = this.#srp.computeA();
        const proof = this.#srp.computeM1();

        return {publicKey, proof};
    }

    async #m3(m2: M2): Promise<M3> {
        const [, response] = await this.#socket.exchange(CompanionLinkFrameType.PS_Next, {
            _pd: encodeTlv([
                [TlvValue.State, TlvState.M3],
                [TlvValue.PublicKey, m2.publicKey],
                [TlvValue.Proof, m2.proof]
            ]),
            _pwTy: 1
        });

        const data = this.#tlv(response);
        const serverProof = data.get(TlvValue.Proof);

        return {serverProof};
    }

    async #m4(m3: M3): Promise<M4> {
        this.#srp.checkM2(m3.serverProof);

        const sharedSecret = this.#srp.computeK();

        return {sharedSecret};
    }

    async #m5(m4: M4): Promise<M5> {
        const iosDeviceX = hkdf({
            hash: 'sha512',
            key: m4.sharedSecret,
            length: 32,
            salt: Buffer.from('Pair-Setup-Controller-Sign-Salt', 'utf8'),
            info: Buffer.from('Pair-Setup-Controller-Sign-Info', 'utf8')
        });

        const sessionKey = hkdf({
            hash: 'sha512',
            key: m4.sharedSecret,
            length: 32,
            salt: Buffer.from('Pair-Setup-Encrypt-Salt', 'utf8'),
            info: Buffer.from('Pair-Setup-Encrypt-Info', 'utf8')
        });

        const deviceInfo = Buffer.concat([
            iosDeviceX,
            this.#pairingId,
            this.#publicKey
        ]);

        const signature = tweetnacl.sign.detached(deviceInfo, this.#secretKey);

        const innerTlv = encodeTlv([
            [TlvValue.Identifier, this.#pairingId],
            [TlvValue.PublicKey, this.#publicKey],
            [TlvValue.Signature, Buffer.from(signature)],
            [TlvValue.Name, Buffer.from(encodeOPack({
                name: this.#name
            }))]
        ]);

        const {authTag, ciphertext} = encryptChacha20(sessionKey, Buffer.from('PS-Msg05'), null, innerTlv);
        const encrypted = Buffer.concat([ciphertext, authTag]);

        const [, response] = await this.#socket.exchange(CompanionLinkFrameType.PS_Next, {
            _pd: encodeTlv([
                [TlvValue.State, TlvState.M5],
                [TlvValue.EncryptedData, encrypted]
            ]),
            _pwTy: 1
        });

        const data = this.#tlv(response);
        const encryptedDataRaw = data.get(TlvValue.EncryptedData);
        const encryptedData = encryptedDataRaw.subarray(0, -16);
        const encryptedTag = encryptedDataRaw.subarray(-16);

        return {
            authTag: encryptedTag,
            data: encryptedData,
            sessionKey
        };
    }

    async #m6(m4: M4, m5: M5): Promise<PairingCredentials> {
        const data = decryptChacha20(m5.sessionKey, Buffer.from('PS-Msg06'), null, m5.data, m5.authTag);
        const tlv = decodeTlv(data);

        const accessoryIdentifier = tlv.get(TlvValue.Identifier);
        const accessoryLongTermPublicKey = tlv.get(TlvValue.PublicKey);
        const accessorySignature = tlv.get(TlvValue.Signature);

        const accessoryX = hkdf({
            hash: 'sha512',
            key: m4.sharedSecret,
            length: 32,
            salt: Buffer.from('Pair-Setup-Accessory-Sign-Salt'),
            info: Buffer.from('Pair-Setup-Accessory-Sign-Info')
        });

        const accessoryInfo = Buffer.concat([
            accessoryX,
            accessoryIdentifier,
            accessoryLongTermPublicKey
        ]);

        if (!tweetnacl.sign.detached.verify(accessoryInfo, accessorySignature, accessoryLongTermPublicKey)) {
            throw new Error('Invalid accessory signature.');
        }

        return {
            accessoryIdentifier: accessoryIdentifier.toString(),
            accessoryLongTermPublicKey: accessoryLongTermPublicKey,
            pairingId: this.#pairingId,
            publicKey: this.#publicKey,
            secretKey: this.#secretKey
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

type M1 = {
    readonly publicKey: Buffer;
    readonly salt: Buffer;
}

type M2 = {
    readonly publicKey: Buffer;
    readonly proof: Buffer;
};

type M3 = {
    readonly serverProof: Buffer;
};

type M4 = {
    readonly sharedSecret: Buffer;
};

type M5 = {
    readonly authTag: Buffer;
    readonly data: Buffer;
    readonly sessionKey: Buffer;
};

type PairingCredentials = {
    readonly accessoryIdentifier: string;
    readonly accessoryLongTermPublicKey: Buffer;
    readonly pairingId: Buffer;
    readonly publicKey: Buffer;
    readonly secretKey: Buffer;
};

type TransientPairingCredentials = {
    readonly pairingId: Buffer;
    readonly sharedSecret: Buffer;
    readonly accessoryToControllerKey: Buffer;
    readonly controllerToAccessoryKey: Buffer;
};
