import type { DiscoveryResult } from '@basmilius/apple-common';
import { AirPlayDevice } from '@/airplay';

export default abstract class {
    get airplay(): AirPlayDevice {
        return this.#airplay;
    }

    readonly #airplay: AirPlayDevice;

    constructor(discoveryResult: DiscoveryResult) {
        this.#airplay = new AirPlayDevice(discoveryResult);
    }

    async connect(): Promise<void> {
        await this.#airplay.connect();
    }
}
