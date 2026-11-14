import { Discovery } from '@corewire/core/discovery';
import { WAKE_PORTS } from '@corewire/devices';
import type { RecoveryOptionsInfo, RecoveryStatus } from '@shared/contract';
import { handle } from '../../ipc';
import type { DeviceSession } from '../../session';
import type { ChannelContext } from '../context';

/** The quick phase of the device's own schedule, shown in the panel; it is not configurable. */
const DEVICE_OPTIONS: RecoveryOptionsInfo = {
    baseDelay: 1000,
    maxDelay: 4000,
    maxAttempts: 3
};

/**
 * The device recovers by itself now; these channels report its status and keep the drop and wake
 * tools. Arming and disarming are accepted and change nothing, until step 2 reworks the panel.
 */
export function registerRecoveryChannels(context: ChannelContext): void {
    const lastEvents = new Map<string, string>();

    const statusOf = (deviceId: string): RecoveryStatus => {
        const status = context.sessions.sessions.get(deviceId)?.device?.status;
        const airplay = status?.airplay;

        return {
            deviceId,
            enabled: true,
            options: DEVICE_OPTIONS,
            recovering: status?.state === 'recovering' || status?.state === 'offline',
            attempt: airplay?.attempt ?? 0,
            lastEvent: lastEvents.get(deviceId) ?? status?.state ?? null,
            error: status?.error?.message ?? null,
            updatedAt: Date.now()
        };
    };

    const push = (deviceId: string): void => {
        context.send('recovery:status', statusOf(deviceId));
    };

    const sessionOf = (deviceId: string): DeviceSession => {
        const session = context.sessions.sessions.get(deviceId);

        if (!session) {
            throw new Error(`No session for device '${deviceId}'. Connect first.`);
        }

        return session;
    };

    handle('recovery:status', request => statusOf(request.deviceId));

    handle('recovery:configure', request => {
        const status = statusOf(request.deviceId);
        context.send('recovery:status', status);

        return status;
    });

    /* Destroying the socket is the only way to produce the unexpected disconnect recovery is for. */
    handle('recovery:simulateDrop', request => {
        const device = sessionOf(request.deviceId).device;

        if (device === null) {
            throw new Error('This device is not connected, so there is nothing to drop.');
        }

        const airplay = device.sessions.airplay;
        const kind = request.stream ?? 'data';
        if (!['control', 'data', 'event'].includes(kind)) throw new Error('Unknown stream to drop.');
        const stream = kind === 'control' ? airplay?.control : kind === 'event' ? airplay?.remoteControl?.events : airplay?.remoteControl?.data;

        if (!stream?.destroy) {
            throw new Error('This device has no selected stream socket to drop.');
        }

        lastEvents.set(request.deviceId, 'socket destroyed');
        push(request.deviceId);

        stream.destroy(new Error('Simulated drop.'));
    });

    handle('recovery:wake', async request => {
        const discovered = context.sessions.discoveredDevice(request.deviceId);

        if (discovered === null) {
            throw new Error(`Device '${request.deviceId}' is not in the last discovery result. Scan first.`);
        }

        await Discovery.wake(discovered.address, WAKE_PORTS);

        lastEvents.set(request.deviceId, `wake knocked on ${discovered.address}`);
        push(request.deviceId);
    });
}
