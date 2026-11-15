import { randomUUID } from 'node:crypto';
import { SRP, SrpClient } from 'fast-srp-hap';
import { Curve25519, Ed25519, type KeyPair } from '../crypto';
import { OPack, TLV8 } from '../encoding';
import { AuthenticationError, PairingError } from '../errors';
import { type Context, DEFAULT_CLIENT_NAME } from '../transport';
import { decodeTlv, deriveControlKeys, deriveKey, pairingCipher } from './cipher';
import { TRANSIENT_PAIRING_PIN } from './const';
import type { AccessoryCredentials, AccessoryKeys, PairingOptions, PairingTransport } from './types';

/**
 * Runs HAP pair-setup as the controller, with SRP-6a followed by an Ed25519 identity exchange.
 *
 * A PIN pairing runs M1 to M6 and yields long-term credentials. A transient pairing stops after M4
 * with the fixed {@link TRANSIENT_PAIRING_PIN} and yields session keys only. The steps are public
 * for a caller that has to wait for the PIN between M1 and M2.
 */
export class PairSetup {
    readonly #context: Context;
    readonly #pairingId: Buffer;
    readonly #transport: PairingTransport;
    readonly #useAes: boolean;
    #publicKey: Buffer;
    #secretKey: Buffer;
    #srp: SrpClient;

    constructor(context: Context, transport: PairingTransport, options: PairingOptions = {}) {
        this.#context = context;
        this.#pairingId = Buffer.from(randomUUID().toUpperCase());
        this.#transport = transport;
        this.#useAes = options.useAes ?? false;
    }

    /** Generates the controller's long-term Ed25519 key pair. Call before {@link pin}. */
    async start(): Promise<void> {
        const keyPair = Ed25519.generateKeyPair();
        this.#publicKey = Buffer.from(keyPair.publicKey);
        this.#secretKey = Buffer.from(keyPair.secretKey);
    }

    /**
     * Runs a PIN pairing from M1 to M6. It calls `askPin` after M1, once the accessory shows the PIN.
     *
     * @throws {PairingError} If a step fails.
     */
    async pin(askPin: () => Promise<string>): Promise<AccessoryCredentials> {
        const m1 = await this.m1();
        const m2 = await this.m2(m1, await askPin());
        const m3 = await this.m3(m2);
        const m4 = await this.m4(m3);
        const m5 = await this.m5(m4);
        const m6 = await this.m6(m4, m5);

        if (!m6) {
            throw new PairingError('Pairing failed, could not get accessory keys.');
        }

        return m6;
    }

    /** Runs a transient pairing from M1 to M4 without a PIN. The keys hold for this connection only. */
    async transient(): Promise<AccessoryKeys> {
        const m1 = await this.m1([[TLV8.Value.Flags, TLV8.Flags.TransientPairing]]);
        const m2 = await this.m2(m1);
        const m3 = await this.m3(m2);
        const m4 = await this.m4(m3);

        return {
            pairingId: this.#pairingId,
            sharedSecret: m4.sharedSecret,
            ...deriveControlKeys(m4.sharedSecret)
        };
    }

    /** Asks the accessory for its SRP public key and salt. */
    async m1(additionalTlv: [number, number | Buffer][] = []): Promise<PairM1> {
        const response = await this.#transport(TLV8.encode([
            [TLV8.Value.Method, TLV8.Method.PairSetup],
            [TLV8.Value.State, TLV8.State.M1],
            ...additionalTlv
        ]), 'm1');

        const data = decodeTlv(this.#context, response);

        return {
            publicKey: data.get(TLV8.Value.PublicKey),
            salt: data.get(TLV8.Value.Salt)
        };
    }

    /** Computes the SRP public key and the proof that we know the PIN. Sends nothing. */
    async m2(m1: PairM1, pin: string = TRANSIENT_PAIRING_PIN): Promise<PairM2> {
        const srpKey = await SRP.genKey(32);

        this.#srp = new SrpClient(SRP.params.hap, m1.salt, Buffer.from('Pair-Setup'), Buffer.from(pin), srpKey, true);
        this.#srp.setB(m1.publicKey);

        return {
            publicKey: this.#srp.computeA(),
            proof: this.#srp.computeM1()
        };
    }

    /** Sends our SRP public key and proof, and receives the accessory's proof. */
    async m3(m2: PairM2): Promise<PairM3> {
        const response = await this.#transport(TLV8.encode([
            [TLV8.Value.State, TLV8.State.M3],
            [TLV8.Value.PublicKey, m2.publicKey],
            [TLV8.Value.Proof, m2.proof]
        ]), 'm3');

        const data = decodeTlv(this.#context, response);

        return {
            serverProof: data.get(TLV8.Value.Proof)
        };
    }

    /** Checks the accessory's proof and derives the SRP shared secret. Sends nothing. */
    async m4(m3: PairM3): Promise<PairM4> {
        this.#srp.checkM2(m3.serverProof);

        return {
            sharedSecret: this.#srp.computeK()
        };
    }

    /** Sends our signed, encrypted identity and receives the accessory's encrypted identity. */
    async m5(m4: PairM4): Promise<PairM5> {
        const iosDeviceX = deriveKey(m4.sharedSecret, 'Pair-Setup-Controller-Sign-Salt', 'Pair-Setup-Controller-Sign-Info');
        const sessionKey = deriveKey(m4.sharedSecret, 'Pair-Setup-Encrypt-Salt', 'Pair-Setup-Encrypt-Info');
        const cipher = pairingCipher('Pair-Setup', m4.sharedSecret, sessionKey, this.#useAes);

        const signature = Ed25519.sign(Buffer.concat([iosDeviceX, this.#pairingId, this.#publicKey]), this.#secretKey);

        const innerTlv = TLV8.encode([
            [TLV8.Value.Identifier, this.#pairingId],
            [TLV8.Value.PublicKey, this.#publicKey],
            [TLV8.Value.Signature, Buffer.from(signature)],
            [TLV8.Value.Name, OPack.encode({
                name: this.#context.identity.name ?? DEFAULT_CLIENT_NAME
            })]
        ]);

        const response = await this.#transport(TLV8.encode([
            [TLV8.Value.State, TLV8.State.M5],
            [TLV8.Value.EncryptedData, cipher.seal('PS-Msg05', innerTlv)]
        ]), 'm5');

        const data = decodeTlv(this.#context, response);

        return {
            encryptedData: data.get(TLV8.Value.EncryptedData),
            sessionKey
        };
    }

    /**
     * Decrypts and verifies the accessory's identity from M5. Sends nothing.
     *
     * @throws {AuthenticationError} If the accessory signature is invalid.
     */
    async m6(m4: PairM4, m5: PairM5): Promise<AccessoryCredentials> {
        const cipher = pairingCipher('Pair-Setup', m4.sharedSecret, m5.sessionKey, this.#useAes);
        const tlv = TLV8.decode(cipher.open('PS-Msg06', m5.encryptedData));

        const accessoryIdentifier = tlv.get(TLV8.Value.Identifier);
        const accessoryLongTermPublicKey = tlv.get(TLV8.Value.PublicKey);
        const accessorySignature = tlv.get(TLV8.Value.Signature);

        const accessoryX = deriveKey(m4.sharedSecret, 'Pair-Setup-Accessory-Sign-Salt', 'Pair-Setup-Accessory-Sign-Info');
        const accessoryInfo = Buffer.concat([accessoryX, accessoryIdentifier, accessoryLongTermPublicKey]);

        if (!Ed25519.verify(accessoryInfo, accessorySignature, accessoryLongTermPublicKey)) {
            throw new AuthenticationError('Invalid accessory signature.');
        }

        return {
            accessoryIdentifier: accessoryIdentifier.toString(),
            accessoryLongTermPublicKey,
            pairingId: this.#pairingId,
            publicKey: this.#publicKey,
            secretKey: this.#secretKey
        };
    }
}

/**
 * Runs HAP pair-verify as the controller. An ephemeral Curve25519 exchange proves both long-term
 * identities from an earlier pair-setup, so every session gets fresh keys without the PIN.
 */
export class PairVerify {
    readonly #context: Context;
    readonly #ephemeralKeyPair: KeyPair;
    readonly #transport: PairingTransport;
    readonly #useAes: boolean;

    constructor(context: Context, transport: PairingTransport, options: PairingOptions = {}) {
        this.#context = context;
        this.#ephemeralKeyPair = Curve25519.generateKeyPair();
        this.#transport = transport;
        this.#useAes = options.useAes ?? false;
    }

    /**
     * Verifies the pairing and returns the shared secret. The channel keys stay empty, because
     * each protocol derives its own from the secret.
     *
     * @throws {AuthenticationError} If the accessory's identity does not match the credentials.
     */
    async start(credentials: AccessoryCredentials): Promise<AccessoryKeys> {
        const m1 = await this.#m1();
        const m2 = await this.#m2(credentials.accessoryIdentifier, credentials.accessoryLongTermPublicKey, m1);

        await this.#m3(credentials.pairingId, credentials.secretKey, m2);

        return {
            accessoryToControllerKey: Buffer.alloc(0),
            controllerToAccessoryKey: Buffer.alloc(0),
            pairingId: credentials.pairingId,
            sharedSecret: m2.sharedSecret
        };
    }

    async #m1(): Promise<VerifyM1> {
        const response = await this.#transport(TLV8.encode([
            [TLV8.Value.State, TLV8.State.M1],
            [TLV8.Value.PublicKey, Buffer.from(this.#ephemeralKeyPair.publicKey)]
        ]), 'm1');

        const data = decodeTlv(this.#context, response);

        return {
            encryptedData: data.get(TLV8.Value.EncryptedData),
            serverPublicKey: data.get(TLV8.Value.PublicKey)
        };
    }

    /** Derives the shared secret and verifies the accessory's signed identity. Sends nothing. */
    async #m2(localAccessoryIdentifier: string, longTermPublicKey: Buffer, m1: VerifyM1): Promise<VerifyM2> {
        const sharedSecret = Buffer.from(Curve25519.generateSharedSecKey(this.#ephemeralKeyPair.secretKey, m1.serverPublicKey));
        const sessionKey = deriveKey(sharedSecret, 'Pair-Verify-Encrypt-Salt', 'Pair-Verify-Encrypt-Info');
        const cipher = pairingCipher('Pair-Verify', sharedSecret, sessionKey, this.#useAes);

        const tlv = TLV8.decode(cipher.open('PV-Msg02', m1.encryptedData));
        const accessoryIdentifier = tlv.get(TLV8.Value.Identifier);
        const accessorySignature = tlv.get(TLV8.Value.Signature);

        if (accessoryIdentifier.toString() !== localAccessoryIdentifier) {
            throw new AuthenticationError(`Invalid accessory identifier. Expected ${accessoryIdentifier.toString()} to be ${localAccessoryIdentifier}.`);
        }

        const accessoryInfo = Buffer.concat([m1.serverPublicKey, accessoryIdentifier, this.#ephemeralKeyPair.publicKey]);

        if (!Ed25519.verify(accessoryInfo, accessorySignature, longTermPublicKey)) {
            throw new AuthenticationError('Invalid accessory signature.');
        }

        return {
            cipher,
            serverEphemeralPublicKey: m1.serverPublicKey,
            sharedSecret
        };
    }

    /** Sends our signed proof. The M4 reply carries nothing we use. */
    async #m3(pairingId: Buffer, secretKey: Buffer, m2: VerifyM2): Promise<void> {
        const iosDeviceInfo = Buffer.concat([this.#ephemeralKeyPair.publicKey, pairingId, m2.serverEphemeralPublicKey]);
        const iosDeviceSignature = Buffer.from(Ed25519.sign(iosDeviceInfo, secretKey));

        const innerTlv = TLV8.encode([
            [TLV8.Value.Identifier, pairingId],
            [TLV8.Value.Signature, iosDeviceSignature]
        ]);

        await this.#transport(TLV8.encode([
            [TLV8.Value.State, TLV8.State.M3],
            [TLV8.Value.EncryptedData, m2.cipher.seal('PV-Msg03', innerTlv)]
        ]), 'm3');
    }
}

type PairM1 = {
    readonly publicKey: Buffer;
    readonly salt: Buffer;
};

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
    /** The sealed identity of the accessory, which {@link PairSetup.m6} opens. */
    readonly encryptedData: Buffer;

    readonly sessionKey: Buffer;
};

type VerifyM1 = {
    readonly encryptedData: Buffer;
    readonly serverPublicKey: Buffer;
};

type VerifyM2 = {
    readonly cipher: ReturnType<typeof pairingCipher>;
    readonly serverEphemeralPublicKey: Buffer;
    readonly sharedSecret: Buffer;
};
