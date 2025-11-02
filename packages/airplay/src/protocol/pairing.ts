import { type AccessoryCredentials, type AccessoryKeys, AccessoryPair } from '@basmilius/apple-common';
import type AirPlay from './protocol';
import type AirPlayRTSP from './rtsp';

export default class AirPlayPairing {
    get internal(): AccessoryPair {
        return this.#internal;
    }

    get rtsp(): AirPlayRTSP {
        return this.#protocol.rtsp;
    }

    readonly #internal: AccessoryPair;
    readonly #protocol: AirPlay;

    constructor(protocol: AirPlay) {
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

    async #request(_: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const response = await this.rtsp.post('/pair-setup', data, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': '4'
        });

        return Buffer.from(await response.arrayBuffer());
    }
}
