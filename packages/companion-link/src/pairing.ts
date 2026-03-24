import { type AccessoryCredentials, type AccessoryKeys, AccessoryPair, AccessoryVerify, InvalidResponseError } from '@basmilius/apple-common';
import { hkdf } from '@basmilius/apple-encryption';
import { FrameType } from './frame';
import type Protocol from './protocol';
import type Stream from './stream';

/**
 * Handles the HAP pair-setup flow (M1-M6) for the Companion Link protocol.
 * Wraps {@link AccessoryPair} and transports TLV8 payloads over OPack frames.
 * After successful pairing, produces {@link AccessoryCredentials} that can be
 * persisted and reused for future pair-verify sessions.
 */
export class Pairing {
    /** The underlying HAP pair-setup state machine. */
    get internal(): AccessoryPair {
        return this.#internal;
    }

    /** The Companion Link stream used for frame transport. */
    get stream(): Stream {
        return this.#stream;
    }

    readonly #internal: AccessoryPair;
    readonly #stream: Stream;

    /**
     * @param protocol - The Companion Link protocol instance providing context and stream.
     */
    constructor(protocol: Protocol) {
        this.#internal = new AccessoryPair(protocol.context, this.#request.bind(this));
        this.#stream = protocol.stream;
    }

    /**
     * Initiates the pair-setup flow by sending M1.
     */
    async start(): Promise<void> {
        await this.#internal.start();
    }

    /**
     * Completes PIN-based pairing (M3-M6) by prompting the user for the PIN
     * displayed on the Apple TV.
     *
     * @param askPin - Callback that should return the 4-digit PIN entered by the user.
     * @returns The established pairing credentials for future verification.
     */
    async pin(askPin: () => Promise<string>): Promise<AccessoryCredentials> {
        return this.#internal.pin(askPin);
    }

    /**
     * Completes transient (PIN-less) pairing (M1-M4).
     * Only succeeds if the Apple TV allows transient connections.
     *
     * @returns The session keys for this transient connection.
     */
    async transient(): Promise<AccessoryKeys> {
        return this.#internal.transient();
    }

    /**
     * Sends a pair-setup TLV8 payload to the Apple TV and returns the response.
     *
     * @param step - The current pairing step identifier.
     * @param data - The TLV8-encoded pairing data to send.
     * @returns The TLV8-encoded response data from the Apple TV.
     * @throws InvalidResponseError if the response is not a valid object.
     */
    async #request(step: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const frameType = step === 'm1'
            ? FrameType.PairSetupStart
            : FrameType.PairSetupNext;

        const [, response] = await this.#stream.exchange(frameType, {
            _pd: data,
            _pwTy: 1
        }, 30000);

        if (typeof response !== 'object' || response === null) {
            throw new InvalidResponseError('Invalid response from receiver.');
        }

        return response['_pd'];
    }
}

/**
 * Handles the HAP pair-verify flow for the Companion Link protocol.
 * Wraps {@link AccessoryVerify} and derives ChaCha20 encryption keys using HKDF
 * after successful Curve25519 key exchange. The derived keys use Companion Link-specific
 * HKDF info strings (`ServerEncrypt-main` / `ClientEncrypt-main`).
 */
export class Verify {
    /** The underlying HAP pair-verify state machine. */
    get internal(): AccessoryVerify {
        return this.#internal;
    }

    /** The Companion Link stream used for frame transport. */
    get stream(): Stream {
        return this.#stream;
    }

    readonly #internal: AccessoryVerify;
    readonly #stream: Stream;

    /**
     * @param protocol - The Companion Link protocol instance providing context and stream.
     */
    constructor(protocol: Protocol) {
        this.#internal = new AccessoryVerify(protocol.context, this.#request.bind(this));
        this.#stream = protocol.stream;
    }

    /**
     * Performs pair-verify using previously established credentials and derives
     * ChaCha20 encryption keys for the session.
     *
     * The HKDF info strings are named from the Apple TV's perspective:
     * - `ServerEncrypt-main` derives the key the Apple TV uses to encrypt (our read key).
     * - `ClientEncrypt-main` derives the key we use to encrypt (our write key).
     *
     * @param credentials - The credentials obtained from a prior pair-setup.
     * @returns The derived session keys including read/write encryption keys.
     */
    async start(credentials: AccessoryCredentials): Promise<AccessoryKeys> {
        const keys = await this.#internal.start(credentials);

        const accessoryToControllerKey = hkdf({
            hash: 'sha512',
            key: keys.sharedSecret,
            length: 32,
            salt: Buffer.alloc(0),
            info: Buffer.from('ServerEncrypt-main')
        });

        const controllerToAccessoryKey = hkdf({
            hash: 'sha512',
            key: keys.sharedSecret,
            length: 32,
            salt: Buffer.alloc(0),
            info: Buffer.from('ClientEncrypt-main')
        });

        return {
            accessoryToControllerKey,
            controllerToAccessoryKey,
            pairingId: keys.pairingId,
            sharedSecret: keys.sharedSecret
        };
    }

    /**
     * Sends a pair-verify TLV8 payload to the Apple TV and returns the response.
     *
     * @param step - The current verify step identifier.
     * @param data - The TLV8-encoded verify data to send.
     * @returns The TLV8-encoded response data from the Apple TV.
     * @throws InvalidResponseError if the response is not a valid object.
     */
    async #request(step: 'm1' | 'm3' | 'm5', data: Buffer): Promise<Buffer> {
        const frameType = step === 'm1'
            ? FrameType.PairVerifyStart
            : FrameType.PairVerifyNext;

        const [, response] = await this.#stream.exchange(frameType, {
            _pd: data,
            _auTy: 4
        }, 30000);

        if (typeof response !== 'object' || response === null) {
            throw new InvalidResponseError('Invalid response from receiver.');
        }

        return response['_pd'];
    }
}
