import { ConnectionClosedError, PairingError } from '@corewire/core';
import { type AccessoryCredentials, type AccessoryKeys, deriveControlKeys, PairSetup, type PairingTransport, PairVerify } from '@corewire/core/pairing';
import { Context } from '@corewire/core/transport';
import { ControlChannel } from './channels/control';
import { DEFAULT_PORT } from './const';
import { fetchInfo } from './info';
import type { AirPlayTarget, PairOptions } from './types';

/** `X-Apple-HKP` is 3 for a PIN pairing and pair-verify, 4 for a transient pairing. */
type HkpMode = 3 | 4;

/** Posts each pairing message as an octet-stream body; the HTTP status is not checked, the TLV carries errors. */
function rtspTransport(control: ControlChannel, path: string, hkp: HkpMode): PairingTransport {
    return async (payload) => {
        const response = await control.post(path, payload, {
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': hkp.toString()
        });

        return Buffer.from(await response.arrayBuffer());
    };
}

/** `/pair-pin-start` goes first for both a PIN and a transient pairing. */
async function pinStart(control: ControlChannel, hkp: HkpMode): Promise<void> {
    const response = await control.post('/pair-pin-start', null, {
        'Content-Type': 'application/octet-stream',
        'X-Apple-HKP': hkp.toString()
    });

    if (response.status !== 200) {
        throw new PairingError(`Cannot start pairing session. ${response.status} ${response.statusText} ${await response.text()}`);
    }
}

/** Pair-verify over `/pair-verify`, followed by the control keys. */
export async function verifyPairing(control: ControlChannel, context: Context, credentials: AccessoryCredentials): Promise<AccessoryKeys> {
    const verify = new PairVerify(context, rtspTransport(control, '/pair-verify', 3));
    const keys = await verify.start(credentials);

    return {
        ...deriveControlKeys(keys.sharedSecret),
        pairingId: keys.pairingId,
        sharedSecret: keys.sharedSecret
    };
}

/** Pair-setup M1 to M4 with the transient flag, for receivers that need no PIN (HomePod). */
export async function transientPairing(control: ControlChannel, context: Context): Promise<AccessoryKeys> {
    const setup = new PairSetup(context, rtspTransport(control, '/pair-setup', 4));

    await setup.start();
    await pinStart(control, 4);

    return await setup.transient();
}

/**
 * Starts a PIN pairing: connects, fetches `/info` and asks the receiver to show its PIN. Finish
 * with {@link PinPairing.pin}, which runs pair-setup M1 to M6 and returns the long-term credentials.
 *
 * @throws {PairingError} When the receiver refuses to start pairing.
 */
export async function pair(target: AirPlayTarget, options: PairOptions = {}): Promise<PinPairing> {
    // The abort listener below misses an abort that already happened.
    if (options.signal?.aborted) {
        throw new ConnectionClosedError('Pairing was interrupted.');
    }

    const context = options.context ?? new Context(target.id ?? target.address, options.identity);
    const control = new ControlChannel(context, target.address, target.port ?? DEFAULT_PORT);
    const interrupt = (): void => control.destroy();

    options.signal?.addEventListener('abort', interrupt, {once: true, signal: control.signal});

    try {
        await control.connect();
        await fetchInfo(control, context);

        const setup = new PairSetup(context, rtspTransport(control, '/pair-setup', 3));

        await setup.start();
        await pinStart(control, 3);

        return new PinPairing(control, setup);
    } catch (err) {
        control.destroy();

        throw options.signal?.aborted ? new ConnectionClosedError('Pairing was interrupted.') : err;
    }
}

/** A PIN pairing whose PIN the receiver shows now. One connection, used once. */
export class PinPairing {
    /** Aborts when the pairing connection closes. */
    get signal(): AbortSignal {
        return this.#control.signal;
    }

    readonly #control: ControlChannel;
    readonly #setup: PairSetup;

    constructor(control: ControlChannel, setup: PairSetup) {
        this.#control = control;
        this.#setup = setup;
    }

    /**
     * Runs pair-setup M1 to M6 with the PIN from the screen. A wrong PIN leaves the connection
     * open; call {@link close} when giving up.
     *
     * @throws {PairingError} When a step fails or the PIN is wrong.
     */
    async pin(code: string): Promise<AccessoryCredentials> {
        const m1 = await this.#setup.m1();
        const m2 = await this.#setup.m2(m1, code);
        const m3 = await this.#setup.m3(m2);
        const m4 = await this.#setup.m4(m3);
        const m5 = await this.#setup.m5(m4);
        const credentials = await this.#setup.m6(m4, m5);

        if (!credentials) {
            throw new PairingError('Pairing failed: could not obtain credentials.');
        }

        return credentials;
    }

    /** Closes the pairing connection. */
    close(): void {
        this.#control.destroy();
    }
}
