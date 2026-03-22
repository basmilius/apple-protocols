import { type AccessoryCredentials, type AccessoryKeys, AccessoryPair, AccessoryVerify, InvalidResponseError } from '@basmilius/apple-common';
import { hkdf } from '@basmilius/apple-encryption';
import { FrameType } from './frame';
import type Protocol from './protocol';
import type Stream from './stream';

export class Pairing {
    get internal(): AccessoryPair {
        return this.#internal;
    }

    get stream(): Stream {
        return this.#stream;
    }

    readonly #internal: AccessoryPair;
    readonly #stream: Stream;

    constructor(protocol: Protocol) {
        this.#internal = new AccessoryPair(protocol.context, this.#request.bind(this));
        this.#stream = protocol.stream;
    }

    async start(): Promise<void> {
        await this.#internal.start();
    }

    async pin(askPin: () => Promise<string>): Promise<AccessoryCredentials> {
        return this.#internal.pin(askPin);
    }

    async transient(): Promise<AccessoryKeys> {
        return this.#internal.transient();
    }

    async #request(step: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const frameType = step === 'm1'
            ? FrameType.PairSetupStart
            : FrameType.PairSetupNext;

        const [, response] = await this.#stream.exchange(frameType, {
            _pd: data,
            _pwTy: 1
        }, 30000);

        if (typeof response !== 'object' || response === null) {
            throw new InvalidResponseError('Invalid response from receiver.');
        }

        return response['_pd'];
    }
}

export class Verify {
    get internal(): AccessoryVerify {
        return this.#internal;
    }

    get stream(): Stream {
        return this.#stream;
    }

    readonly #internal: AccessoryVerify;
    readonly #stream: Stream;

    constructor(protocol: Protocol) {
        this.#internal = new AccessoryVerify(protocol.context, this.#request.bind(this));
        this.#stream = protocol.stream;
    }

    async start(credentials: AccessoryCredentials): Promise<AccessoryKeys> {
        const keys = await this.#internal.start(credentials);

        const accessoryToControllerKey = hkdf({
            hash: 'sha512',
            key: keys.sharedSecret,
            length: 32,
            salt: Buffer.alloc(0),
            info: Buffer.from('ServerEncrypt-main')
        });

        const controllerToAccessoryKey = hkdf({
            hash: 'sha512',
            key: keys.sharedSecret,
            length: 32,
            salt: Buffer.alloc(0),
            info: Buffer.from('ClientEncrypt-main')
        });

        return {
            accessoryToControllerKey,
            controllerToAccessoryKey,
            pairingId: keys.pairingId,
            sharedSecret: keys.sharedSecret
        };
    }

    async #request(step: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const frameType = step === 'm1'
            ? FrameType.PairVerifyStart
            : FrameType.PairVerifyNext;

        const [, response] = await this.#stream.exchange(frameType, {
            _pd: data,
            _auTy: 4
        }, 30000);

        if (typeof response !== 'object' || response === null) {
            throw new InvalidResponseError('Invalid response from receiver.');
        }

        return response['_pd'];
    }
}
