import { Result } from 'node-dns-sd';
import { CompanionLinkSocket } from '@/socket';
import Api from './api/companionLink';
import Pairing from './pairing/companionLink';
import Verify from './verify/companionLink';

export default class CompanionLink {
    get api(): Api {
        return this.#api;
    }

    get socket(): CompanionLinkSocket {
        return this.#socket;
    }

    get pairing(): Pairing {
        return this.#pairing;
    }

    get verify(): Verify {
        return this.#verify;
    }

    readonly #api: Api;
    readonly #device: Result;
    readonly #socket: CompanionLinkSocket;
    readonly #pairing: Pairing;
    readonly #verify: Verify;

    constructor(device: Result) {
        this.#device = device;
        this.#socket = new CompanionLinkSocket(device.address, device.service.port);
        this.#api = new Api(this, this.#socket);
        this.#pairing = new Pairing(this, this.#socket);
        this.#verify = new Verify(this, this.#socket);
    }

    async connect(): Promise<void> {
        await this.#socket.connect();
    }
}
