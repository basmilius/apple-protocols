import { type AccessoryCredentials, type AccessoryKeys, PairSetup, type PairingTransport, PairVerify } from '@corewire/core/pairing';
import { deriveEncryptionKeys } from '@corewire/core/crypto';
import { InvalidResponseError } from '@corewire/core';
import { FrameType } from './frame';
import type { Protocol } from './protocol';
import type { Stream } from './stream';

const PAIRING_TIMEOUT = 30000;

/**
 * Sends each pairing message as `_pd` in an OPack frame: a start frame for M1, a next frame after
 * that. `extra` carries the fields that tell pair-setup and pair-verify apart.
 */
function frameTransport(stream: Stream, startFrame: number, nextFrame: number, extra: Record<string, unknown>): PairingTransport {
    return async (payload, step) => {
        const [, response] = await stream.exchange(step === 'm1' ? startFrame : nextFrame, {
            _pd: payload,
            ...extra
        }, PAIRING_TIMEOUT);

        if (typeof response !== 'object' || response === null) {
            throw new InvalidResponseError('Invalid response from receiver.');
        }

        return response['_pd'];
    };
}

/** Companion Link pair-setup over OPack frames. */
export class Pairing {
    get internal(): PairSetup {
        return this.#internal;
    }

    get stream(): Stream {
        return this.#stream;
    }

    readonly #internal: PairSetup;
    readonly #stream: Stream;

    constructor(protocol: Protocol) {
        this.#stream = protocol.stream;
        this.#internal = new PairSetup(protocol.context, frameTransport(this.#stream, FrameType.PairSetupStart, FrameType.PairSetupNext, {_pwTy: 1}));
    }

    async start(): Promise<void> {
        await this.#internal.start();
    }

    async pin(askPin: () => Promise<string>): Promise<AccessoryCredentials> {
        return this.#internal.pin(askPin);
    }

    /** Only succeeds when the Apple TV allows transient connections. */
    async transient(): Promise<AccessoryKeys> {
        return this.#internal.transient();
    }
}

/**
 * Companion Link pair-verify over OPack frames, followed by the channel keys. The HKDF info
 * strings are named from the Apple TV's side: it encrypts with `ServerEncrypt-main`, our read key.
 */
export class Verify {
    get internal(): PairVerify {
        return this.#internal;
    }

    get stream(): Stream {
        return this.#stream;
    }

    readonly #internal: PairVerify;
    readonly #stream: Stream;

    constructor(protocol: Protocol) {
        this.#stream = protocol.stream;
        this.#internal = new PairVerify(protocol.context, frameTransport(this.#stream, FrameType.PairVerifyStart, FrameType.PairVerifyNext, {_auTy: 4}));
    }

    async start(credentials: AccessoryCredentials): Promise<AccessoryKeys> {
        const keys = await this.#internal.start(credentials);

        const {readKey: accessoryToControllerKey, writeKey: controllerToAccessoryKey} = deriveEncryptionKeys(
            keys.sharedSecret,
            '',
            'ServerEncrypt-main',
            'ClientEncrypt-main'
        );

        return {
            accessoryToControllerKey,
            controllerToAccessoryKey,
            pairingId: keys.pairingId,
            sharedSecret: keys.sharedSecret
        };
    }
}
