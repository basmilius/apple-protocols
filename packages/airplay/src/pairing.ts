import { type AccessoryCredentials, type AccessoryKeys, AccessoryPair } from '@basmilius/apple-common';
import type Protocol from './protocol';
import type RTSP from './rtsp';

export default class AirPlayPairing {
    get internal(): AccessoryPair {
        return this.#internal;
    }

    get rtsp(): RTSP {
        return this.#protocol.rtsp;
    }

    readonly #internal: AccessoryPair;
    readonly #protocol: Protocol;
    #hkp: 3 | 4;

    constructor(protocol: Protocol) {
        this.#internal = new AccessoryPair(this.#request.bind(this));
        this.#protocol = protocol;
    }

    async start(): Promise<void> {
        await this.#internal.start();
    }

    async pin(askPin: () => Promise<string>): Promise<AccessoryCredentials> {
        this.#hkp = 3;

        await this.#pinStart();

        return this.#internal.pin(askPin);
    }

    async pinStart(): Promise<void> {
        this.#hkp = 3;

        await this.#pinStart();
    }

    async transient(): Promise<AccessoryKeys> {
        this.#hkp = 4;

        await this.#pinStart();

        return this.#internal.transient();
    }

    async #pinStart(): Promise<void> {
        const response = await this.rtsp.post('/pair-pin-start', null, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': this.#hkp.toString()
        });

        if (response.status !== 200) {
            throw new Error(`Cannot start pairing session. ${response.status} ${response.statusText} ${await response.text()}`);
        }
    }

    async #request(_: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const response = await this.rtsp.post('/pair-setup', data, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': this.#hkp.toString()
        });

        return Buffer.from(await response.arrayBuffer());
    }
}
