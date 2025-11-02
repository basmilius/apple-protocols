import type { DiscoveryResult } from '@basmilius/apple-common';
import Pairing from './pairing';
import RTSP from './rtsp';
import Verify from './verify';

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

    get verify(): Verify {
        return this.#verify;
    }

    readonly #device: DiscoveryResult;
    readonly #pairing: Pairing;
    readonly #rtsp: RTSP;
    readonly #verify: Verify;

    constructor(device: DiscoveryResult) {
        this.#device = device;
        this.#rtsp = new RTSP(device.address, device.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    async connect(): Promise<void> {
        await this.#rtsp.connect();
    }

    async disconnect(): Promise<void> {
        await this.#rtsp.disconnect();
    }
}
