import type { DiscoveryResult } from '@basmilius/apple-common';
import Pairing from './pairing';
import RTSP from './rtsp';

export default class AirPlay {
    get device(): DiscoveryResult {
        return this.#device;
    }

    get pairing(): Pairing {
        return this.#pairing;
    }

    get rtsp(): RTSP {
        return this.#rtsp;
    }

    readonly #device: DiscoveryResult;
    readonly #pairing: Pairing;
    readonly #rtsp: RTSP;

    constructor(device: DiscoveryResult) {
        this.#device = device;
        this.#rtsp = new RTSP(device.address, device.service.port);
        this.#pairing = new Pairing(this);
    }

    async connect(): Promise<void> {
        await this.#rtsp.connect();
    }

    async disconnect(): Promise<void> {
        await this.#rtsp.disconnect();
    }
}
