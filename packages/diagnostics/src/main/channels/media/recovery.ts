import type { EventEmitter } from 'node:events';
import { ConnectionRecovery, Discovery } from '@basmilius/apple-common';
import { AIRPLAY_PROTOCOL } from '@basmilius/apple-sdk';
import type { DeviceEvent, RecoveryOptionsInfo, RecoveryStatus } from '@shared/contract';
import { handle } from '../../ipc';
import type { DeviceSession } from '../../session';
import type { ChannelContext } from '../context';

const DEFAULT_OPTIONS: RecoveryOptionsInfo = {
    baseDelay: 1000,
    maxDelay: 30000,
    maxAttempts: 3
};

type RecoveryEntry = {
    enabled: boolean;
    options: RecoveryOptionsInfo;
    recovery: ConnectionRecovery | null;
    attempt: number;
    recovering: boolean;
    lastEvent: string | null;
    error: string | null;
    detach: (() => void) | null;
};

let sequence = 0;

/** The SDK does not instantiate `ConnectionRecovery`. Register one per device and forward its events. */
export function registerRecoveryChannels(context: ChannelContext): void {
    const entries = new Map<string, RecoveryEntry>();

    const entryOf = (deviceId: string): RecoveryEntry => {
        const existing = entries.get(deviceId);

        if (existing) {
            return existing;
        }

        const created: RecoveryEntry = {
            enabled: false,
            options: DEFAULT_OPTIONS,
            recovery: null,
            attempt: 0,
            recovering: false,
            lastEvent: null,
            error: null,
            detach: null
        };

        entries.set(deviceId, created);

        return created;
    };

    const statusOf = (deviceId: string): RecoveryStatus => {
        const entry = entryOf(deviceId);

        return {
            deviceId,
            enabled: entry.enabled,
            options: entry.options,
            recovering: entry.recovering,
            attempt: entry.attempt,
            lastEvent: entry.lastEvent,
            error: entry.error,
            updatedAt: Date.now()
        };
    };

    const push = (deviceId: string): void => {
        context.send('recovery:status', statusOf(deviceId));
    };

    /* Use decreasing sequence numbers to avoid collisions with session events. */
    const forward = (deviceId: string, name: string, payload: readonly unknown[]): void => {
        sequence += 1;

        const event: DeviceEvent = {
            deviceId,
            source: 'device',
            name,
            payload,
            timestamp: Date.now(),
            sequence: -sequence
        };

        context.send('device:event', event);
    };

    const sessionOf = (deviceId: string): DeviceSession => {
        const session = context.sessions.sessions.get(deviceId);

        if (!session) {
            throw new Error(`No session for device '${deviceId}'. Connect first.`);
        }

        return session;
    };

    const disable = (deviceId: string): void => {
        const entry = entryOf(deviceId);

        entry.detach?.();
        entry.detach = null;
        entry.recovery?.dispose();
        entry.recovery = null;
        entry.enabled = false;
        entry.recovering = false;
        entry.attempt = 0;
    };

    /* Reconnecting builds a new device, so the listener has to move with it or recovery fires once. */
    const attach = (deviceId: string, recovery: ConnectionRecovery): void => {
        const entry = entryOf(deviceId);
        const emitter = context.sessions.sessions.get(deviceId)?.device as unknown as EventEmitter | undefined;

        entry.detach?.();
        entry.detach = null;

        if (!emitter) {
            return;
        }

        const listener = (unexpected: boolean): void => recovery.handleDisconnect(unexpected);

        emitter.on('disconnected', listener);
        entry.detach = () => emitter.off('disconnected', listener);
    };

    const enable = (deviceId: string, options: RecoveryOptionsInfo): void => {
        disable(deviceId);

        const entry = entryOf(deviceId);

        // Recovery listens for the device's own disconnect, so arming without a session is a no-op.
        sessionOf(deviceId);

        const recovery = new ConnectionRecovery({
            baseDelay: options.baseDelay,
            maxDelay: options.maxDelay,
            maxAttempts: options.maxAttempts,
            onReconnect: async () => {
                await context.sessions.connect(deviceId);
                attach(deviceId, recovery);
            }
        });

        recovery.on('recovering', attempt => {
            entry.recovering = true;
            entry.attempt = attempt;
            entry.lastEvent = `recovering (attempt ${attempt})`;
            forward(deviceId, 'recovering', [attempt]);
            push(deviceId);
        });

        recovery.on('recovered', () => {
            entry.recovering = false;
            entry.attempt = 0;
            entry.error = null;
            entry.lastEvent = 'recovered';
            forward(deviceId, 'recovered', []);
            push(deviceId);
        });

        recovery.on('failed', errors => {
            entry.recovering = false;
            entry.error = errors.map(error => error.message).join('; ');
            entry.lastEvent = 'failed';
            forward(deviceId, 'recoveryFailed', [entry.error]);
            push(deviceId);
        });

        attach(deviceId, recovery);

        entry.recovery = recovery;
        entry.options = options;
        entry.enabled = true;
        entry.lastEvent = 'armed';
    };

    handle('recovery:status', request => statusOf(request.deviceId));

    handle('recovery:configure', request => {
        const entry = entryOf(request.deviceId);
        const options: RecoveryOptionsInfo = {...entry.options, ...request.options};

        if (request.enabled) {
            enable(request.deviceId, options);
        } else {
            disable(request.deviceId);
            entry.options = options;
            entry.lastEvent = 'disarmed';
        }

        const status = statusOf(request.deviceId);
        context.send('recovery:status', status);

        return status;
    });

    /* Destroying the socket is the only way to produce the unexpected disconnect recovery is for. */
    handle('recovery:simulateDrop', request => {
        const session = sessionOf(request.deviceId);
        const device = session.device;

        if (device === null) {
            throw new Error('This device is not connected, so there is nothing to drop.');
        }

        const stream = device.airplay[AIRPLAY_PROTOCOL].dataStream as unknown as { destroy?(): void } | undefined;

        if (!stream?.destroy) {
            throw new Error('This device has no data stream socket to drop.');
        }

        const entry = entryOf(request.deviceId);
        entry.lastEvent = 'socket destroyed';
        push(request.deviceId);

        stream.destroy();
    });

    handle('recovery:wake', async request => {
        const discovered = context.sessions.discoveredDevice(request.deviceId);

        if (discovered === null) {
            throw new Error(`Device '${request.deviceId}' is not in the last discovery result. Scan first.`);
        }

        await Discovery.wake(discovered.address);

        const entry = entryOf(request.deviceId);
        entry.lastEvent = `wake knocked on ${discovered.address}`;
        push(request.deviceId);
    });
}
