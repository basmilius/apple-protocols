import { OPack, TLV8 } from "@basmilius/apple-encoding";
import { SRP, SrpClient } from 'fast-srp-hap';
import { v4 as uuid } from 'uuid';
import { reporter } from './cli';
import { AIRPLAY_TRANSIENT_PIN } from './const';
import { Chacha20, Curve25519, hkdf } from './crypto';
import tweetnacl from 'tweetnacl';

export class AccessoryPair {
    readonly #name: string;
    readonly #pairingId: Buffer;
    readonly #requestHandler: RequestHandler;
    #publicKey: Buffer;
    #secretKey: Buffer;
    #srp: SrpClient;

    constructor(requestHandler: RequestHandler) {
        this.#name = 'basmilius/apple-protocols';
        this.#pairingId = Buffer.from(uuid().toUpperCase());
        this.#requestHandler = requestHandler;
    }

    async start(): Promise<void> {
        const keyPair = tweetnacl.sign.keyPair();
        this.#publicKey = Buffer.from(keyPair.publicKey);
        this.#secretKey = Buffer.from(keyPair.secretKey);
    }

    async pin(askPin: () => Promise<string>): Promise<AccessoryCredentials> {
        const m1 = await this.m1();
        const m2 = await this.m2(m1, await askPin());
        const m3 = await this.m3(m2);
        const m4 = await this.m4(m3);
        const m5 = await this.m5(m4);
        const m6 = await this.m6(m4, m5);

        if (!m6) {
            throw new Error('Pairing failed, could not get accessory keys.');
        }

        return m6;
    }

    async transient(): Promise<AccessoryKeys> {
        const m1 = await this.m1([[TLV8.Value.Flags, TLV8.Flags.TransientPairing]]);
        const m2 = await this.m2(m1);
        const m3 = await this.m3(m2);
        const m4 = await this.m4(m3);

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

    async m1(additionalTlv: [number, number | Buffer][] = []): Promise<PairM1> {
        const response = await this.#requestHandler('m1', TLV8.encode([
            [TLV8.Value.Method, TLV8.Method.PairSetup],
            [TLV8.Value.State, TLV8.State.M1],
            ...additionalTlv
        ]));

        const data = tlv(response);
        const publicKey = data.get(TLV8.Value.PublicKey);
        const salt = data.get(TLV8.Value.Salt);

        return {publicKey, salt};
    }

    async m2(m1: PairM1, pin: string = AIRPLAY_TRANSIENT_PIN): Promise<PairM2> {
        const srpKey = await SRP.genKey(32);

        this.#srp = new SrpClient(SRP.params.hap, m1.salt, Buffer.from('Pair-Setup'), Buffer.from(pin), srpKey, true);
        this.#srp.setB(m1.publicKey);

        const publicKey = this.#srp.computeA();
        const proof = this.#srp.computeM1();

        return {publicKey, proof};
    }

    async m3(m2: PairM2): Promise<PairM3> {
        const response = await this.#requestHandler('m3', TLV8.encode([
            [TLV8.Value.State, TLV8.State.M3],
            [TLV8.Value.PublicKey, m2.publicKey],
            [TLV8.Value.Proof, m2.proof]
        ]));

        const data = tlv(response);
        const serverProof = data.get(TLV8.Value.Proof);

        return {serverProof};
    }

    async m4(m3: PairM3): Promise<PairM4> {
        this.#srp.checkM2(m3.serverProof);

        const sharedSecret = this.#srp.computeK();

        return {sharedSecret};
    }

    async m5(m4: PairM4): Promise<PairM5> {
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

        const innerTlv = TLV8.encode([
            [TLV8.Value.Identifier, this.#pairingId],
            [TLV8.Value.PublicKey, this.#publicKey],
            [TLV8.Value.Signature, Buffer.from(signature)],
            [TLV8.Value.Name, OPack.encode({
                name: this.#name
            })]
        ]);

        const {authTag, ciphertext} = Chacha20.encrypt(sessionKey, Buffer.from('PS-Msg05'), null, innerTlv);
        const encrypted = Buffer.concat([ciphertext, authTag]);

        const response = await this.#requestHandler('m5', TLV8.encode([
            [TLV8.Value.State, TLV8.State.M5],
            [TLV8.Value.EncryptedData, encrypted]
        ]));

        const data = tlv(response);
        const encryptedDataRaw = data.get(TLV8.Value.EncryptedData);
        const encryptedData = encryptedDataRaw.subarray(0, -16);
        const encryptedTag = encryptedDataRaw.subarray(-16);

        return {
            authTag: encryptedTag,
            data: encryptedData,
            sessionKey
        };
    }

    async m6(m4: PairM4, m5: PairM5): Promise<AccessoryCredentials> {
        const data = Chacha20.decrypt(m5.sessionKey, Buffer.from('PS-Msg06'), null, m5.data, m5.authTag);
        const tlv = TLV8.decode(data);

        const accessoryIdentifier = tlv.get(TLV8.Value.Identifier);
        const accessoryLongTermPublicKey = tlv.get(TLV8.Value.PublicKey);
        const accessorySignature = tlv.get(TLV8.Value.Signature);

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
}

export class AccessoryVerify {
    readonly #ephemeralKeyPair: tweetnacl.BoxKeyPair;
    readonly #requestHandler: RequestHandler;

    constructor(requestHandler: RequestHandler) {
        this.#ephemeralKeyPair = Curve25519.generateKeyPair();
        this.#requestHandler = requestHandler;
    }

    async start(credentials: AccessoryCredentials): Promise<AccessoryKeys> {
        const m1 = await this.#m1();
        const m2 = await this.#m2(credentials.accessoryIdentifier, credentials.accessoryLongTermPublicKey, m1);

        await this.#m3(credentials.pairingId, credentials.secretKey, m2);

        return await this.#m4(m2, credentials.pairingId);
    }

    async #m1(): Promise<VerifyM1> {
        const response = await this.#requestHandler('m1', TLV8.encode([
            [TLV8.Value.State, TLV8.State.M1],
            [TLV8.Value.PublicKey, Buffer.from(this.#ephemeralKeyPair.publicKey)]
        ]));

        const data = tlv(response);
        const serverPublicKey = data.get(TLV8.Value.PublicKey);
        const encryptedData = data.get(TLV8.Value.EncryptedData);

        return {
            encryptedData,
            serverPublicKey
        };
    }

    async #m2(localAccessoryIdentifier: string, longTermPublicKey: Buffer, m1: VerifyM1): Promise<VerifyM2> {
        const sharedSecret = Buffer.from(Curve25519.generateSharedSecKey(
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

        const data = Chacha20.decrypt(sessionKey, Buffer.from('PV-Msg02'), null, encryptedData, encryptedTag);
        const tlv = TLV8.decode(data);

        const accessoryIdentifier = tlv.get(TLV8.Value.Identifier);
        const accessorySignature = tlv.get(TLV8.Value.Signature);

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

    async #m3(pairingId: Buffer, secretKey: Buffer, m2: VerifyM2): Promise<VerifyM3> {
        const iosDeviceInfo = Buffer.concat([
            this.#ephemeralKeyPair.publicKey,
            pairingId,
            m2.serverEphemeralPublicKey
        ]);

        const iosDeviceSignature = Buffer.from(tweetnacl.sign.detached(iosDeviceInfo, secretKey));

        const innerTlv = TLV8.encode([
            [TLV8.Value.Identifier, pairingId],
            [TLV8.Value.Signature, iosDeviceSignature]
        ]);

        const {authTag, ciphertext} = Chacha20.encrypt(m2.sessionKey, Buffer.from('PV-Msg03'), null, innerTlv);
        const encrypted = Buffer.concat([ciphertext, authTag]);

        await this.#requestHandler('m3', TLV8.encode([
            [TLV8.Value.State, TLV8.State.M3],
            [TLV8.Value.EncryptedData, encrypted]
        ]));

        return {};
    }

    async #m4(m2: VerifyM2, pairingId: Buffer): Promise<AccessoryKeys> {
        return {
            accessoryToControllerKey: Buffer.alloc(0),
            controllerToAccessoryKey: Buffer.alloc(0),
            pairingId,
            sharedSecret: m2.sharedSecret
        };
    }
}

function tlv(buffer: Buffer): Map<number, Buffer> {
    const data = TLV8.decode(buffer);

    if (data.has(TLV8.Value.Error)) {
        TLV8.bail(data);
    }

    reporter.raw('Decoded TLV', data);

    return data;
}

type RequestHandler = (step: 'm1' | 'm3' | 'm5', data: Buffer) => Promise<Buffer>;

type PairM1 = {
    readonly publicKey: Buffer;
    readonly salt: Buffer;
}

type PairM2 = {
    readonly publicKey: Buffer;
    readonly proof: Buffer;
};

type PairM3 = {
    readonly serverProof: Buffer;
};

type PairM4 = {
    readonly sharedSecret: Buffer;
};

type PairM5 = {
    readonly authTag: Buffer;
    readonly data: Buffer;
    readonly sessionKey: Buffer;
};

type VerifyM1 = {
    readonly encryptedData: Buffer;
    readonly serverPublicKey: Buffer;
};

type VerifyM2 = {
    readonly serverEphemeralPublicKey: Buffer;
    readonly sessionKey: Buffer;
    readonly sharedSecret: Buffer;
};

type VerifyM3 = {};

export type AccessoryCredentials = {
    readonly accessoryIdentifier: string;
    readonly accessoryLongTermPublicKey: Buffer;
    readonly pairingId: Buffer;
    readonly publicKey: Buffer;
    readonly secretKey: Buffer;
};

export type AccessoryKeys = {
    readonly pairingId: Buffer;
    readonly sharedSecret: Buffer;
    readonly accessoryToControllerKey: Buffer;
    readonly controllerToAccessoryKey: Buffer;
};
