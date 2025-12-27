import type { DiscoveryResult } from '@basmilius/apple-common';
import Api from './api';
import Pairing from './pairing';
import Socket from './socket';
import Verify from './verify';

export default class CompanionLink {
    get api(): Api {
        return this.#api;
    }

    get device(): DiscoveryResult {
        return this.#device;
    }

    get socket(): Socket {
        return this.#socket;
    }

    get pairing(): Pairing {
        return this.#pairing;
    }

    get verify(): Verify {
        return this.#verify;
    }

    readonly #api: Api;
    readonly #device: DiscoveryResult;
    readonly #socket: Socket;
    readonly #pairing: Pairing;
    readonly #verify: Verify;

    constructor(device: DiscoveryResult) {
        this.#device = device;
        this.#socket = new Socket(device.address, device.service.port);
        this.#api = new Api(this);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    async connect(): Promise<void> {
        await this.#socket.connect();
    }

    async disconnect(): Promise<void> {
        await this.#socket.disconnect();
    }
}
