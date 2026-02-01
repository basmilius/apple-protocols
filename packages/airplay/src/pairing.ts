import { type AccessoryCredentials, type AccessoryKeys, AccessoryPair, AccessoryVerify, hkdf } from '@basmilius/apple-common';
import type ControlStream from './controlStream';
import type Protocol from './protocol';

export class Pairing {
    get controlStream(): ControlStream {
        return this.#controlStream;
    }

    get internal(): AccessoryPair {
        return this.#internal;
    }

    readonly #controlStream: ControlStream;
    readonly #internal: AccessoryPair;
    #hkp: 3 | 4;

    constructor(protocol: Protocol) {
        this.#controlStream = protocol.controlStream;
        this.#internal = new AccessoryPair(protocol.context, this.#request.bind(this));
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
        const response = await this.#controlStream.post('/pair-pin-start', null, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': this.#hkp.toString()
        });

        if (response.status !== 200) {
            throw new Error(`Cannot start pairing session. ${response.status} ${response.statusText} ${await response.text()}`);
        }
    }

    async #request(_: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const response = await this.#controlStream.post('/pair-setup', data, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': this.#hkp.toString()
        });

        return Buffer.from(await response.arrayBuffer());
    }
}

export class Verify {
    get controlStream(): ControlStream {
        return this.#controlStream;
    }

    get internal(): AccessoryVerify {
        return this.#internal;
    }

    readonly #controlStream: ControlStream;
    readonly #internal: AccessoryVerify;

    constructor(protocol: Protocol) {
        this.#controlStream = protocol.controlStream;
        this.#internal = new AccessoryVerify(protocol.context, this.#request.bind(this));
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
        const response = await this.controlStream.post('/pair-verify', data, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': '3'
        });

        return Buffer.from(await response.arrayBuffer());
    }
}
