import { Protocol } from '@basmilius/apple-airplay';
import type { AccessoryCredentials, DeviceIdentity, DiscoveryResult } from '@basmilius/apple-common';

/**
 * Step-based pairing session for Apple TV devices.
 *
 * Provides a three-phase pairing flow suitable for external UI frameworks
 * (e.g., Homey's pairing wizard) where PIN entry happens asynchronously:
 *
 * ```ts
 * const session = tv.createPairingSession();
 * await session.start();              // Connects and triggers PIN dialog on TV
 * await session.pin('1234');           // Submits PIN, executes M1-M6
 * const credentials = await session.end();  // Returns credentials, cleans up
 * ```
 */
export class PairingSession {
    #protocol: Protocol | undefined;
    #credentials: AccessoryCredentials | undefined;
    #discoveryResult: DiscoveryResult;
    #identity?: Partial<DeviceIdentity>;
    #finished: boolean = false;

    constructor(discoveryResult: DiscoveryResult, identity?: Partial<DeviceIdentity>) {
        this.#discoveryResult = discoveryResult;
        this.#identity = identity;
    }

    /**
     * Connects to the device and triggers the PIN dialog.
     * After this method returns, the Apple TV displays a 4-digit PIN on screen.
     */
    async start(): Promise<void> {
        this.#protocol = new Protocol(this.#discoveryResult, this.#identity);
        await this.#protocol.connect();
        await this.#protocol.fetchInfo();
        await this.#protocol.pairing.start();
        await this.#protocol.pairing.pinStart();
    }

    /**
     * Submits the PIN and executes the M1-M6 key exchange.
     *
     * @param code - The 4-digit PIN displayed on the Apple TV screen.
     */
    async pin(code: string): Promise<void> {
        if (!this.#protocol) {
            throw new Error('PairingSession.start() must be called before pin().');
        }

        const internal = this.#protocol.pairing.internal;
        const m1 = await internal.m1();
        const m2 = await internal.m2(m1, code);
        const m3 = await internal.m3(m2);
        const m4 = await internal.m4(m3);
        const m5 = await internal.m5(m4);
        const credentials = await internal.m6(m4, m5);

        if (!credentials) {
            throw new Error('Pairing failed: could not obtain credentials.');
        }

        this.#credentials = credentials;
    }

    /**
     * Finishes the pairing session, cleans up the protocol connection,
     * and returns the obtained credentials.
     *
     * @returns Long-term credentials for future connections.
     */
    async end(): Promise<AccessoryCredentials> {
        if (!this.#credentials) {
            throw new Error('PairingSession.pin() must be called before end().');
        }

        const credentials = this.#credentials;
        this.#cleanup();
        return credentials;
    }

    /**
     * Aborts the pairing session and cleans up without returning credentials.
     * Use this when the user cancels pairing.
     */
    abort(): void {
        this.#cleanup();
    }

    #cleanup(): void {
        if (this.#finished) {
            return;
        }

        this.#finished = true;

        try {
            this.#protocol?.disconnect();
        } catch {
            // Best-effort cleanup.
        }
    }
}
