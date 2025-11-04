import { type AccessoryCredentials, type AccessoryKeys, AccessoryVerify, hkdf } from '@basmilius/apple-common';
import { type default as CompanionLinkSocket, FrameType } from './socket';
import type CompanionLink from './protocol';

export default class CompanionLinkVerify {
    get socket(): CompanionLinkSocket {
        return this.#protocol.socket;
    }

    readonly #internal: AccessoryVerify;
    readonly #protocol: CompanionLink;

    constructor(protocol: CompanionLink) {
        this.#internal = new AccessoryVerify(this.#request.bind(this));
        this.#protocol = protocol;
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
        const frameType = step === 'm1' ? FrameType.PV_Start : FrameType.PV_Next;
        const [, response] = await this.socket.exchange(frameType, {
            _pd: data,
            _auTy: 4
        });

        if (typeof response !== 'object' || response === null) {
            throw new Error('Invalid response from receiver.');
        }

        return response['_pd'];
    }
}
