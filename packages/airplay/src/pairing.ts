import { type AccessoryCredentials, type AccessoryKeys, deriveControlKeys, PairSetup, type PairingTransport, PairVerify } from '@corewire/core/pairing';
import { PairingError } from '@corewire/core';
import type { ControlStream } from './controlStream';
import type { Protocol } from './protocol';

/** Posts each pairing message as an octet-stream body to `path` on the control stream. */
function rtspTransport(controlStream: ControlStream, path: string, hkp: () => 3 | 4): PairingTransport {
    return async (payload) => {
        const response = await controlStream.post(path, payload, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': hkp().toString()
        });

        return Buffer.from(await response.arrayBuffer());
    };
}

/**
 * AirPlay pair-setup over `/pair-setup`. `X-Apple-HKP` is 3 for a PIN pairing and 4 for a
 * transient one, and `/pair-pin-start` has to go first in both cases.
 */
export class Pairing {
    get controlStream(): ControlStream {
        return this.#controlStream;
    }

    /** The HAP steps, for a caller that waits for the PIN between M1 and M2. */
    get internal(): PairSetup {
        return this.#internal;
    }

    readonly #controlStream: ControlStream;
    readonly #internal: PairSetup;
    #hkp: 3 | 4;

    constructor(protocol: Protocol) {
        this.#controlStream = protocol.controlStream;
        this.#internal = new PairSetup(protocol.context, rtspTransport(this.#controlStream, '/pair-setup', () => this.#hkp));
    }

    async start(): Promise<void> {
        await this.#internal.start();
    }

    /** @throws {PairingError} If the device refuses to start pairing or SRP fails. */
    async pin(askPin: () => Promise<string>): Promise<AccessoryCredentials> {
        await this.pinStart();

        return this.#internal.pin(askPin);
    }

    /** Makes the device show its PIN, without running the exchange. */
    async pinStart(): Promise<void> {
        this.#hkp = 3;

        await this.#pinStart();
    }

    /** @throws {PairingError} If the device refuses to start pairing. */
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
            throw new PairingError(`Cannot start pairing session. ${response.status} ${response.statusText} ${await response.text()}`);
        }
    }
}

/** AirPlay pair-verify over `/pair-verify`, followed by the control stream keys. */
export class Verify {
    get controlStream(): ControlStream {
        return this.#controlStream;
    }

    get internal(): PairVerify {
        return this.#internal;
    }

    readonly #controlStream: ControlStream;
    readonly #internal: PairVerify;

    constructor(protocol: Protocol) {
        this.#controlStream = protocol.controlStream;
        this.#internal = new PairVerify(protocol.context, rtspTransport(this.#controlStream, '/pair-verify', () => 3));
    }

    async start(credentials: AccessoryCredentials): Promise<AccessoryKeys> {
        const keys = await this.#internal.start(credentials);

        return {
            ...deriveControlKeys(keys.sharedSecret),
            pairingId: keys.pairingId,
            sharedSecret: keys.sharedSecret
        };
    }
}
