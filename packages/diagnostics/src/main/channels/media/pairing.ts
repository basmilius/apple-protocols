import * as CompanionLink from '@basmilius/apple-companion-link';
import { PairingSession } from '@basmilius/apple-sdk';
import type { AccessoryCredentials, DiscoveryResult } from '@basmilius/apple-common';
import type { PairRequest, PairStage, PairStatus, ProtocolName } from '@shared/contract';
import { handle } from '../../ipc';
import type { ChannelContext } from '../context';

/** AirPlay uses {@link PairingSession}; Companion Link requires direct `Protocol.pairing` calls. */
class PairingAttempt {
    readonly deviceId: string;
    readonly protocol: ProtocolName;
    readonly serviceId: string;

    #stage: PairStage = 'idle';
    #error: string | null = null;
    #airplay: PairingSession | null = null;
    #companion: CompanionLink.Protocol | null = null;
    #pinResolve: ((pin: string) => void) | null = null;
    #pinReject: ((reason: Error) => void) | null = null;
    #companionCredentials: Promise<AccessoryCredentials> | null = null;
    /** Buffers a PIN submitted before the M3 callback is ready. */
    #pendingPin: string | null = null;

    constructor(deviceId: string, protocol: ProtocolName, serviceId: string) {
        this.deviceId = deviceId;
        this.protocol = protocol;
        this.serviceId = serviceId;
    }

    get stage(): PairStage {
        return this.#stage;
    }

    get status(): PairStatus {
        return {
            deviceId: this.deviceId,
            protocol: this.protocol,
            stage: this.#stage,
            error: this.#error,
            serviceId: this.serviceId,
            updatedAt: Date.now()
        };
    }

    get awaitingPin(): boolean {
        return this.#stage === 'awaitingPin';
    }

    setStage(stage: PairStage): void {
        this.#stage = stage;

        if (stage !== 'failed') {
            this.#error = null;
        }
    }

    fail(error: unknown): void {
        this.#stage = 'failed';
        this.#error = error instanceof Error ? error.message : String(error);
    }

    /** Connects and asks the device to show its PIN. */
    async start(service: DiscoveryResult): Promise<void> {
        if (this.protocol === 'airplay') {
            this.#airplay = new PairingSession(service);
            await this.#airplay.start();

            return;
        }

        const protocol = new CompanionLink.Protocol(service);
        this.#companion = protocol;

        await protocol.connect();
        await protocol.pairing.start();
    }

    /** Completes pairing; for Companion Link, resolves the waiting `pin()` callback. */
    async submit(pin: string): Promise<AccessoryCredentials> {
        if (this.protocol === 'airplay') {
            if (this.#airplay === null) {
                throw new Error('Pairing has not been started.');
            }

            await this.#airplay.pin(pin);

            return await this.#airplay.end();
        }

        if (this.#companionCredentials === null) {
            throw new Error('Companion Link pairing has not been started.');
        }

        if (this.#pinResolve === null) {
            this.#pendingPin = pin;
        } else {
            const resolve = this.#pinResolve;
            this.#pinResolve = null;
            resolve(pin);
        }

        return await this.#companionCredentials;
    }

    /** Kicks off the Companion Link M3-M6 exchange, which parks until {@link submit} feeds it a PIN. */
    beginCompanionExchange(): void {
        if (this.#companion === null) {
            throw new Error('Companion Link pairing has not been started.');
        }

        this.#companionCredentials = this.#companion.pairing.pin(
            () =>
                new Promise<string>((resolve, reject) => {
                    if (this.#pendingPin !== null) {
                        resolve(this.#pendingPin);
                        this.#pendingPin = null;

                        return;
                    }

                    this.#pinResolve = resolve;
                    this.#pinReject = reject;
                })
        );

        /* Prevent an unhandled rejection before submit() starts awaiting this promise. */
        this.#companionCredentials.catch(() => undefined);
    }

    abort(): void {
        this.#pinReject?.(new Error('Pairing was cancelled.'));
        this.#pinResolve = null;
        this.#pinReject = null;

        try {
            this.#airplay?.abort();
        } catch {
            /* Cancellation may happen before the pairing session connects. */
        }

        try {
            void this.#companion?.disconnect();
        } catch {
            /* An already-closed socket needs no further cancellation. */
        }

        this.#airplay = null;
        this.#companion = null;
    }
}

/** Store credentials under the protocol's service ID, as expected by {@link SessionManager}. */
export function registerPairingChannels(context: ChannelContext): void {
    const attempts = new Map<string, PairingAttempt>();

    const push = (attempt: PairingAttempt): PairStatus => {
        const status = attempt.status;
        context.send('pair:status', status);

        return status;
    };

    const serviceOf = (request: PairRequest): DiscoveryResult => {
        const discovered = context.sessions.discoveredDevice(request.deviceId);

        if (discovered === null) {
            throw new Error(`Device '${request.deviceId}' is not in the last discovery result. Scan first.`);
        }

        const service = request.protocol === 'airplay' ? discovered.services.airplay : discovered.services.companionLink;

        if (!service) {
            throw new Error(`This device advertises no ${request.protocol === 'airplay' ? 'AirPlay' : 'Companion Link'} service.`);
        }

        return service;
    };

    handle('pair:start', async request => {
        attempts.get(request.deviceId)?.abort();

        const service = serviceOf(request);
        const attempt = new PairingAttempt(request.deviceId, request.protocol, service.id);
        attempts.set(request.deviceId, attempt);

        attempt.setStage('started');
        push(attempt);

        try {
            await attempt.start(service);
            attempt.setStage('awaitingPin');

            if (request.protocol === 'companionLink') {
                attempt.beginCompanionExchange();
            }
        } catch (error) {
            attempt.fail(error);
        }

        return push(attempt);
    });

    handle('pair:pin', async request => {
        const attempt = attempts.get(request.deviceId);

        if (!attempt) {
            throw new Error('No pairing is running for this device.');
        }

        if (!attempt.awaitingPin) {
            throw new Error(`Pairing is in stage '${attempt.stage}' and does not want a PIN.`);
        }

        attempt.setStage('verifying');
        push(attempt);

        try {
            const credentials = await attempt.submit(request.pin);

            context.storage.storage.setDevice(attempt.serviceId, {identifier: attempt.serviceId, name: attempt.serviceId});
            context.storage.storage.setCredentials(attempt.serviceId, attempt.protocol, credentials);
            await context.storage.save();

            attempt.setStage('done');
        } catch (error) {
            attempt.fail(error);
        } finally {
            attempt.abort();
        }

        const status = push(attempt);
        context.send('discovery:changed', context.sessions.list());

        return status;
    });

    handle('pair:cancel', request => {
        const attempt = attempts.get(request.deviceId);

        if (!attempt) {
            return;
        }

        attempt.abort();
        attempt.setStage('idle');
        push(attempt);
        attempts.delete(request.deviceId);
    });

    handle('pair:status', request => attempts.get(request.deviceId)?.status ?? null);

    handle('pair:forget', async request => {
        const discovered = context.sessions.discoveredDevice(request.deviceId);
        const service = request.protocol === 'airplay' ? discovered?.services.airplay : discovered?.services.companionLink;

        context.storage.storage.removeCredentials(service?.id ?? request.deviceId, request.protocol);
        await context.storage.save();

        context.send('discovery:changed', context.sessions.list());
    });
}
