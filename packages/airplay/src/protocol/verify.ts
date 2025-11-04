import { type AccessoryCredentials, type AccessoryKeys, AccessoryVerify, hkdf } from '@basmilius/apple-common';
import type AirPlay from './protocol';
import type AirPlayRTSP from './rtsp';

export default class AirPlayVerify {
    get rtsp(): AirPlayRTSP {
        return this.#protocol.rtsp;
    }

    readonly #internal: AccessoryVerify;
    readonly #protocol: AirPlay;

    constructor(protocol: AirPlay) {
        this.#internal = new AccessoryVerify(this.#request.bind(this));
        this.#protocol = protocol;
    }

    async start(credentials: AccessoryCredentials): Promise<AccessoryKeys> {
        const keys = await this.#internal.start(credentials);

        const accessoryToControllerKey = hkdf({
            hash: 'sha512',
            key: keys.sharedSecret,
            length: 32,
            salt: Buffer.from('Control-Salt'),
            info: Buffer.from('Control-Read-Encryption-Key')
        });

        const controllerToAccessoryKey = hkdf({
            hash: 'sha512',
            key: keys.sharedSecret,
            length: 32,
            salt: Buffer.from('Control-Salt'),
            info: Buffer.from('Control-Write-Encryption-Key')
        });

        return {
            accessoryToControllerKey,
            controllerToAccessoryKey,
            pairingId: keys.pairingId,
            sharedSecret: keys.sharedSecret
        };
    }

    async #request(_: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const response = await this.rtsp.post('/pair-verify', data, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': '3'
        });

        return Buffer.from(await response.arrayBuffer());
    }
}
