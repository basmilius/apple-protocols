import { type AccessoryCredentials, type AccessoryKeys, AccessoryPair, AccessoryVerify, deriveEncryptionKeys, PairingError } from '@basmilius/apple-common';
import type ControlStream from './controlStream';
import type Protocol from './protocol';

/**
 * AirPlay-specific pair-setup wrapper.
 *
 * Wraps the generic {@link AccessoryPair} (HAP M1-M6) with RTSP transport,
 * sending TLV8 payloads via POST to `/pair-pin-start` and `/pair-setup` on the
 * AirPlay control stream. Supports both PIN-based pairing (HKP=3) and transient
 * pairing (HKP=4).
 */
export class Pairing {
    /** The underlying RTSP control stream used for pairing requests. */
    get controlStream(): ControlStream {
        return this.#controlStream;
    }

    /** The generic HAP AccessoryPair instance handling SRP/TLV8 logic. */
    get internal(): AccessoryPair {
        return this.#internal;
    }

    readonly #controlStream: ControlStream;
    readonly #internal: AccessoryPair;
    #hkp: 3 | 4;

    /**
     * @param protocol - The AirPlay protocol instance providing context and control stream.
     */
    constructor(protocol: Protocol) {
        this.#controlStream = protocol.controlStream;
        this.#internal = new AccessoryPair(protocol.context, this.#request.bind(this));
    }

    /**
     * Starts the pairing process by sending M1.
     */
    async start(): Promise<void> {
        await this.#internal.start();
    }

    /**
     * Performs PIN-based pair-setup (M1-M6).
     *
     * Triggers a PIN prompt on the Apple TV, asks the user for the PIN via the
     * callback, and completes the SRP exchange to obtain long-term credentials.
     *
     * @param askPin - Callback that should return the 4-digit PIN displayed on the device.
     * @returns Long-term credentials for future pair-verify sessions.
     * @throws PairingError if the pairing session cannot be started or SRP fails.
     */
    async pin(askPin: () => Promise<string>): Promise<AccessoryCredentials> {
        this.#hkp = 3;

        await this.#pinStart();

        return this.#internal.pin(askPin);
    }

    /**
     * Initiates the PIN pairing flow without completing it.
     *
     * Triggers the PIN prompt on the Apple TV. Useful when the PIN entry
     * is handled separately (e.g. in a two-step UI flow).
     */
    async pinStart(): Promise<void> {
        this.#hkp = 3;

        await this.#pinStart();
    }

    /**
     * Performs transient pair-setup (M1-M4, no PIN).
     *
     * Establishes an ephemeral session without long-term credentials. Used for
     * connections that only need encryption, not persistent authentication.
     *
     * @returns Ephemeral session keys (shared secret, read/write keys).
     * @throws PairingError if the pairing session cannot be started.
     */
    async transient(): Promise<AccessoryKeys> {
        this.#hkp = 4;

        await this.#pinStart();

        return this.#internal.transient();
    }

    /**
     * Sends the `/pair-pin-start` request to the device to begin the pairing flow.
     *
     * @throws PairingError if the device rejects the request.
     */
    async #pinStart(): Promise<void> {
        const response = await this.#controlStream.post('/pair-pin-start', null, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': this.#hkp.toString()
        });

        if (response.status !== 200) {
            throw new PairingError(`Cannot start pairing session. ${response.status} ${response.statusText} ${await response.text()}`);
        }
    }

    /**
     * Sends a pair-setup TLV8 payload to `/pair-setup` and returns the response.
     *
     * @param _ - The SRP step identifier (m1/m3/m5), unused but required by the callback signature.
     * @param data - TLV8-encoded request payload.
     * @returns TLV8-encoded response payload from the device.
     */
    async #request(_: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const response = await this.#controlStream.post('/pair-setup', data, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': this.#hkp.toString()
        });

        return Buffer.from(await response.arrayBuffer());
    }
}

/**
 * AirPlay-specific pair-verify wrapper.
 *
 * Wraps the generic {@link AccessoryVerify} (Curve25519 key exchange) with RTSP
 * transport, sending TLV8 payloads via POST to `/pair-verify`. After successful
 * verification, derives control stream encryption keys using HKDF with the
 * 'Control-Salt' salt.
 */
export class Verify {
    /** The underlying RTSP control stream used for verify requests. */
    get controlStream(): ControlStream {
        return this.#controlStream;
    }

    /** The generic HAP AccessoryVerify instance handling the Curve25519 exchange. */
    get internal(): AccessoryVerify {
        return this.#internal;
    }

    readonly #controlStream: ControlStream;
    readonly #internal: AccessoryVerify;

    /**
     * @param protocol - The AirPlay protocol instance providing context and control stream.
     */
    constructor(protocol: Protocol) {
        this.#controlStream = protocol.controlStream;
        this.#internal = new AccessoryVerify(protocol.context, this.#request.bind(this));
    }

    /**
     * Performs pair-verify and derives control stream encryption keys.
     *
     * Executes the Curve25519 key exchange using stored credentials, then derives
     * separate read and write keys for the RTSP control stream using HKDF-SHA512
     * with 'Control-Salt' and direction-specific info strings.
     *
     * Note: the HKDF info strings are named from the Apple TV's perspective:
     * 'Control-Read-Encryption-Key' is what the Apple TV reads = what we write.
     *
     * @param credentials - Long-term credentials from a previous pair-setup.
     * @returns Session keys including derived control stream encryption keys.
     */
    async start(credentials: AccessoryCredentials): Promise<AccessoryKeys> {
        const keys = await this.#internal.start(credentials);

        const {readKey: accessoryToControllerKey, writeKey: controllerToAccessoryKey} = deriveEncryptionKeys(
            keys.sharedSecret,
            'Control-Salt',
            'Control-Read-Encryption-Key',
            'Control-Write-Encryption-Key'
        );

        return {
            accessoryToControllerKey,
            controllerToAccessoryKey,
            pairingId: keys.pairingId,
            sharedSecret: keys.sharedSecret
        };
    }

    /**
     * Sends a pair-verify TLV8 payload to `/pair-verify` and returns the response.
     *
     * @param _ - The step identifier (m1/m3/m5), unused but required by the callback signature.
     * @param data - TLV8-encoded request payload.
     * @returns TLV8-encoded response payload from the device.
     */
    async #request(_: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const response = await this.controlStream.post('/pair-verify', data, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': '3'
        });

        return Buffer.from(await response.arrayBuffer());
    }
}
