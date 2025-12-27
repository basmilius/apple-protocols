import { type AccessoryCredentials, type AccessoryKeys, AccessoryPair } from '@basmilius/apple-common';
import { FrameType } from './messages';
import type Socket from './socket';
import type Protocol from './protocol';

export default class CompanionLinkPairing {
    get internal(): AccessoryPair {
        return this.#internal;
    }

    get socket(): Socket {
        return this.#protocol.socket;
    }

    readonly #internal: AccessoryPair;
    readonly #protocol: Protocol;

    constructor(protocol: Protocol) {
        this.#internal = new AccessoryPair(this.#request.bind(this));
        this.#protocol = protocol;
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
        const frameType = step === 'm1' ? FrameType.PS_Start : FrameType.PS_Next;
        const [, response] = await this.socket.exchange(frameType, {
            _pd: data,
            _pwTy: 1
        });

        if (typeof response !== 'object' || response === null) {
            throw new Error('Invalid response from receiver.');
        }

        return response['_pd'];
    }
}
