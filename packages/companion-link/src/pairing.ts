import { ConnectionClosedError, InvalidResponseError, PairingError } from '@corewire/core';
import { HKDF } from '@corewire/core/crypto';
import { type AccessoryCredentials, type AccessoryKeys, PairSetup, type PairingTransport, PairVerify } from '@corewire/core/pairing';
import { Context } from '@corewire/core/transport';
import { FrameType } from './frame';
import { Stream } from './stream';
import type { CompanionLinkTarget, PairOptions } from './types';

const PAIRING_TIMEOUT = 30000;

type PairM1 = Awaited<ReturnType<PairSetup['m1']>>;

/**
 * Sends each pairing message as `_pd` in an OPack frame: a start frame for M1, a next frame after
 * that. `extra` carries the field that tells pair-setup and pair-verify apart.
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

/**
 * Pair-verify over OPack frames, followed by the channel keys. The HKDF info strings are named
 * from the device's side: it encrypts with `ServerEncrypt-main`, our read key.
 */
export async function verifyPairing(stream: Stream, context: Context, credentials: AccessoryCredentials): Promise<AccessoryKeys> {
    const verify = new PairVerify(context, frameTransport(stream, FrameType.PairVerifyStart, FrameType.PairVerifyNext, {_auTy: 4}));
    const keys = await verify.start(credentials);

    const {readKey: accessoryToControllerKey, writeKey: controllerToAccessoryKey} = HKDF.deriveEncryptionKeys(
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

/**
 * Starts a PIN pairing: connects and sends pair-setup M1, upon which the device shows its PIN.
 * Finish with {@link PinPairing.pin}, which returns the long-term credentials.
 *
 * @throws {PairingError} When the device refuses to start pairing.
 * @throws {ConnectionClosedError} When the signal aborts first.
 */
export async function pair(target: CompanionLinkTarget, options: PairOptions = {}): Promise<PinPairing> {
    const context = options.context ?? new Context(target.id ?? target.address, options.identity);
    const stream = new Stream(context, target.address, target.port);
    const interrupt = (): void => stream.destroy();

    options.signal?.addEventListener('abort', interrupt, {once: true, signal: stream.signal});

    try {
        await stream.connect();

        const setup = new PairSetup(context, frameTransport(stream, FrameType.PairSetupStart, FrameType.PairSetupNext, {_pwTy: 1}));

        await setup.start();

        return new PinPairing(stream, setup, await setup.m1());
    } catch (err) {
        stream.destroy();

        throw options.signal?.aborted ? new ConnectionClosedError('Pairing was interrupted.') : err;
    }
}

/** A PIN pairing whose PIN the device shows now. One connection, used once. */
export class PinPairing {
    /** Aborts when the pairing connection closes. */
    get signal(): AbortSignal {
        return this.#stream.signal;
    }

    readonly #m1: PairM1;
    readonly #setup: PairSetup;
    readonly #stream: Stream;

    constructor(stream: Stream, setup: PairSetup, m1: PairM1) {
        this.#m1 = m1;
        this.#setup = setup;
        this.#stream = stream;
    }

    /**
     * Runs pair-setup M2 to M6 with the PIN from the screen. The connection stays open; call
     * {@link close} when done.
     *
     * @throws {PairingError} When a step fails or the PIN is wrong.
     */
    async pin(code: string): Promise<AccessoryCredentials> {
        const m2 = await this.#setup.m2(this.#m1, code);
        const m3 = await this.#setup.m3(m2);
        const m4 = await this.#setup.m4(m3);
        const m5 = await this.#setup.m5(m4);
        const credentials = await this.#setup.m6(m4, m5);

        if (!credentials) {
            throw new PairingError('Pairing failed, could not get accessory keys.');
        }

        return credentials;
    }

    /** Closes the pairing connection. */
    close(): void {
        this.#stream.destroy();
    }
}
