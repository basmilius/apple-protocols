import { pair, type PinPairing, toTarget } from '@corewire/airplay';
import type { AccessoryCredentials } from '@corewire/core/pairing';
import type { DeviceIdentity } from '@corewire/core/transport';
import type { DiscoveryResult } from '@corewire/core/discovery';

/**
 * Step-based pairing session for Apple TV devices, for a UI where the PIN arrives later
 * (such as Homey's pairing wizard):
 *
 * ```ts
 * const session = tv.createPairingSession();
 * await session.start();              // Connects and shows the PIN on the TV
 * await session.pin('1234');           // Submits the PIN, runs M1-M6
 * const credentials = await session.end();  // Returns the credentials, closes the connection
 * ```
 */
export class PairingSession {
    readonly #discoveryResult: DiscoveryResult;
    readonly #identity?: Partial<DeviceIdentity>;
    #credentials: AccessoryCredentials | undefined;
    #finished: boolean = false;
    #pairing: PinPairing | undefined;

    constructor(discoveryResult: DiscoveryResult, identity?: Partial<DeviceIdentity>) {
        this.#discoveryResult = discoveryResult;
        this.#identity = identity;
    }

    /** Connects to the device; once this resolves, the Apple TV shows a 4-digit PIN. */
    async start(): Promise<void> {
        this.#pairing = await pair(toTarget(this.#discoveryResult), {identity: this.#identity});
    }

    /**
     * Submits the PIN and runs the M1-M6 key exchange. A failed attempt keeps the connection;
     * call {@link abort} to give up.
     *
     * @param code - The 4-digit PIN displayed on the Apple TV screen.
     */
    async pin(code: string): Promise<void> {
        if (!this.#pairing) {
            throw new Error('PairingSession.start() must be called before pin().');
        }

        this.#credentials = await this.#pairing.pin(code);
    }

    /** Closes the connection and returns the credentials for future connections. */
    async end(): Promise<AccessoryCredentials> {
        if (!this.#credentials) {
            throw new Error('PairingSession.pin() must be called before end().');
        }

        const credentials = this.#credentials;
        this.#cleanup();

        return credentials;
    }

    /** Closes the connection without credentials, for when the user cancels. */
    abort(): void {
        this.#cleanup();
    }

    #cleanup(): void {
        if (this.#finished) {
            return;
        }

        this.#finished = true;
        this.#pairing?.close();
    }
}
