import { randomBytes } from 'node:crypto';
import { SRP, SrpServer } from 'fast-srp-hap';
import { Curve25519, Ed25519, type KeyPair } from '../crypto';
import { TLV8 } from '../encoding';
import { AuthenticationError, PairingError } from '../errors';
import type { Context } from '../transport';
import { decodeTlv, deriveKey, type PairingCipher, pairingCipher } from './cipher';
import type { AccessoryIdentity, ControllerResolver, PairedController, PairingOptions } from './types';

/**
 * Accessory side of HAP pair-setup: answers M1, M3 and M5 with M2, M4 and M6. After M5,
 * {@link controller} holds the verified controller identity to persist.
 */
export class PairSetupServer {
    get controller(): PairedController | undefined {
        return this.#controller;
    }

    /** Available after M3. */
    get sharedSecret(): Buffer | undefined {
        return this.#sharedSecret;
    }

    readonly #context: Context;
    readonly #identity: AccessoryIdentity;
    readonly #pin: string;
    readonly #useAes: boolean;
    #controller: PairedController | undefined;
    #sharedSecret: Buffer | undefined;
    #srp: SrpServer;

    constructor(context: Context, identity: AccessoryIdentity, pin: string, options: PairingOptions = {}) {
        this.#context = context;
        this.#identity = identity;
        this.#pin = pin;
        this.#useAes = options.useAes ?? false;
    }

    /**
     * @throws {PairingError} If the request carries an unexpected state.
     * @throws {AuthenticationError} If the PIN proof or the controller signature is wrong.
     */
    async handle(request: Buffer): Promise<Buffer> {
        const data = decodeTlv(this.#context, request);
        const state = data.get(TLV8.Value.State)?.[0];

        switch (state) {
            case TLV8.State.M1:
                return this.#m1();

            case TLV8.State.M3:
                return this.#m3(data);

            case TLV8.State.M5:
                return this.#m5(data);

            default:
                throw new PairingError(`Unexpected pair-setup state ${state}.`);
        }
    }

    async #m1(): Promise<Buffer> {
        const salt = randomBytes(16);
        const secretKey = await SRP.genKey(32);

        this.#srp = new SrpServer(SRP.params.hap, salt, Buffer.from('Pair-Setup'), Buffer.from(this.#pin), secretKey);

        return TLV8.encode([
            [TLV8.Value.State, TLV8.State.M2],
            [TLV8.Value.PublicKey, this.#srp.computeB()],
            [TLV8.Value.Salt, salt]
        ]);
    }

    async #m3(data: Map<number, Buffer>): Promise<Buffer> {
        this.#srp.setA(data.get(TLV8.Value.PublicKey));

        try {
            this.#srp.checkM1(data.get(TLV8.Value.Proof));
        } catch {
            throw new AuthenticationError('Invalid controller proof, wrong PIN.');
        }

        const serverProof = this.#srp.computeM2();
        this.#sharedSecret = this.#srp.computeK();

        return TLV8.encode([
            [TLV8.Value.State, TLV8.State.M4],
            [TLV8.Value.Proof, serverProof]
        ]);
    }

    async #m5(data: Map<number, Buffer>): Promise<Buffer> {
        const sharedSecret = this.#sharedSecret;
        const sessionKey = deriveKey(sharedSecret, 'Pair-Setup-Encrypt-Salt', 'Pair-Setup-Encrypt-Info');
        const cipher = pairingCipher('Pair-Setup', sharedSecret, sessionKey, this.#useAes);

        const inner = TLV8.decode(cipher.open('PS-Msg05', data.get(TLV8.Value.EncryptedData)));
        const controllerIdentifier = inner.get(TLV8.Value.Identifier);
        const controllerPublicKey = inner.get(TLV8.Value.PublicKey);
        const controllerSignature = inner.get(TLV8.Value.Signature);

        const iosDeviceX = deriveKey(sharedSecret, 'Pair-Setup-Controller-Sign-Salt', 'Pair-Setup-Controller-Sign-Info');

        if (!Ed25519.verify(Buffer.concat([iosDeviceX, controllerIdentifier, controllerPublicKey]), controllerSignature, controllerPublicKey)) {
            throw new AuthenticationError('Invalid controller signature.');
        }

        this.#controller = {
            identifier: controllerIdentifier.toString(),
            longTermPublicKey: controllerPublicKey
        };

        const accessoryIdentifier = Buffer.from(this.#identity.identifier);
        const accessoryX = deriveKey(sharedSecret, 'Pair-Setup-Accessory-Sign-Salt', 'Pair-Setup-Accessory-Sign-Info');
        const accessorySignature = Buffer.from(Ed25519.sign(Buffer.concat([accessoryX, accessoryIdentifier, this.#identity.publicKey]), this.#identity.secretKey));

        const innerTlv = TLV8.encode([
            [TLV8.Value.Identifier, accessoryIdentifier],
            [TLV8.Value.PublicKey, this.#identity.publicKey],
            [TLV8.Value.Signature, accessorySignature]
        ]);

        return TLV8.encode([
            [TLV8.Value.State, TLV8.State.M6],
            [TLV8.Value.EncryptedData, cipher.seal('PS-Msg06', innerTlv)]
        ]);
    }
}

/**
 * Accessory side of HAP pair-verify, the mirror of the controller's pair-verify. After M3,
 * {@link sharedSecret} feeds the channel key derivation.
 */
export class PairVerifyServer {
    /** The verified controller's pairing identifier, available after M3. */
    get pairingId(): Buffer | undefined {
        return this.#pairingId;
    }

    /** Available after M1. */
    get sharedSecret(): Buffer | undefined {
        return this.#sharedSecret;
    }

    readonly #context: Context;
    readonly #identity: AccessoryIdentity;
    readonly #resolveController: ControllerResolver;
    readonly #useAes: boolean;
    #cipher: PairingCipher;
    #controllerPublicKey: Buffer;
    #ephemeralKeyPair: KeyPair;
    #pairingId: Buffer | undefined;
    #sharedSecret: Buffer | undefined;

    constructor(context: Context, identity: AccessoryIdentity, resolveController: ControllerResolver, options: PairingOptions = {}) {
        this.#context = context;
        this.#identity = identity;
        this.#resolveController = resolveController;
        this.#useAes = options.useAes ?? false;
    }

    /**
     * @throws {PairingError} If the request carries an unexpected state.
     * @throws {AuthenticationError} If the controller is unknown or its signature is wrong.
     */
    async handle(request: Buffer): Promise<Buffer> {
        const data = decodeTlv(this.#context, request);
        const state = data.get(TLV8.Value.State)?.[0];

        switch (state) {
            case TLV8.State.M1:
                return this.#m1(data);

            case TLV8.State.M3:
                return this.#m3(data);

            default:
                throw new PairingError(`Unexpected pair-verify state ${state}.`);
        }
    }

    async #m1(data: Map<number, Buffer>): Promise<Buffer> {
        this.#controllerPublicKey = data.get(TLV8.Value.PublicKey);
        this.#ephemeralKeyPair = Curve25519.generateKeyPair();

        const sharedSecret = Buffer.from(Curve25519.generateSharedSecKey(this.#ephemeralKeyPair.secretKey, this.#controllerPublicKey));
        const sessionKey = deriveKey(sharedSecret, 'Pair-Verify-Encrypt-Salt', 'Pair-Verify-Encrypt-Info');

        this.#sharedSecret = sharedSecret;
        this.#cipher = pairingCipher('Pair-Verify', sharedSecret, sessionKey, this.#useAes);

        const accessoryEphemeralPublicKey = Buffer.from(this.#ephemeralKeyPair.publicKey);
        const accessoryIdentifier = Buffer.from(this.#identity.identifier);
        const accessoryInfo = Buffer.concat([accessoryEphemeralPublicKey, accessoryIdentifier, this.#controllerPublicKey]);
        const accessorySignature = Buffer.from(Ed25519.sign(accessoryInfo, this.#identity.secretKey));

        const innerTlv = TLV8.encode([
            [TLV8.Value.Identifier, accessoryIdentifier],
            [TLV8.Value.Signature, accessorySignature]
        ]);

        return TLV8.encode([
            [TLV8.Value.State, TLV8.State.M2],
            [TLV8.Value.PublicKey, accessoryEphemeralPublicKey],
            [TLV8.Value.EncryptedData, this.#cipher.seal('PV-Msg02', innerTlv)]
        ]);
    }

    async #m3(data: Map<number, Buffer>): Promise<Buffer> {
        const inner = TLV8.decode(this.#cipher.open('PV-Msg03', data.get(TLV8.Value.EncryptedData)));
        const controllerIdentifier = inner.get(TLV8.Value.Identifier);
        const controllerSignature = inner.get(TLV8.Value.Signature);

        const longTermPublicKey = this.#resolveController(controllerIdentifier.toString());

        if (!longTermPublicKey) {
            throw new AuthenticationError('Unknown controller. Pair before verifying.');
        }

        const controllerInfo = Buffer.concat([this.#controllerPublicKey, controllerIdentifier, Buffer.from(this.#ephemeralKeyPair.publicKey)]);

        if (!Ed25519.verify(controllerInfo, controllerSignature, longTermPublicKey)) {
            throw new AuthenticationError('Invalid controller signature.');
        }

        this.#pairingId = controllerIdentifier;

        return TLV8.encode([
            [TLV8.Value.State, TLV8.State.M4]
        ]);
    }
}

/** A fresh accessory identity: a random MAC-like identifier and a new Ed25519 key pair. */
export function generateAccessoryIdentity(): AccessoryIdentity {
    const keyPair = Ed25519.generateKeyPair();
    const identifier = Array.from(randomBytes(6)).map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':');

    return {
        identifier,
        publicKey: Buffer.from(keyPair.publicKey),
        secretKey: Buffer.from(keyPair.secretKey)
    };
}
