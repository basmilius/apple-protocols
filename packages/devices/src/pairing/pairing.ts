import { pair, type PinPairing } from '@corewire/airplay';
import { Credentials } from '../credentials/credentials';
import type { ClientIdentity, DeviceTarget } from '../types';

export type PairOptions = {
    readonly identity?: ClientIdentity;
    readonly signal?: AbortSignal;
};

/**
 * A PIN pairing with an Apple TV over AirPlay. The credentials also serve Companion Link.
 * Start one with `AppleTV.pair()`; the PIN shows on screen once it resolves.
 */
export class Pairing {
    readonly #pairing: PinPairing;

    private constructor(pairing: PinPairing) {
        this.#pairing = pairing;
    }

    /**
     * Opens the pairing connection. Callers use `AppleTV.pair()`.
     *
     * @internal
     */
    static async start(target: DeviceTarget, options: PairOptions = {}): Promise<Pairing> {
        return new Pairing(await pair({address: target.address, port: target.port, id: target.id, txt: target.txt}, {identity: options.identity, signal: options.signal}));
    }

    /**
     * Runs pair-setup with the PIN. On success it closes the connection and returns the credentials;
     * a wrong PIN keeps it open for another try.
     */
    async pin(code: string): Promise<Credentials> {
        const credentials = await this.#pairing.pin(code);

        this.#pairing.close();

        return Credentials.from(credentials);
    }

    /** Closes the connection without credentials. */
    close(): void {
        this.#pairing.close();
    }
}
