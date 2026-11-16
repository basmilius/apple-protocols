import { Discovery } from '@apple-protocols/core/discovery';
import { type ProtocolStatus, WAKE_PORTS } from '@apple-protocols/devices';
import type { RecoveryLink, RecoveryStatus } from '@shared/contract';
import { handle } from '../../ipc';
import type { DeviceSession } from '../../session';
import type { ChannelContext } from '../context';

const DROP_TARGETS = ['control', 'data', 'event', 'companionLink'];

function linkOf(status: ProtocolStatus | undefined): RecoveryLink | null {
    if (status === undefined) {
        return null;
    }

    return {
        state: status.state,
        attempt: status.attempt,
        phase: status.phase,
        nextAttemptAt: status.nextAttemptAt,
        error: status.error?.message ?? null
    };
}

/**
 * The device recovers by itself; these channels report its status on every change and keep the
 * tools to provoke a recovery: drop a socket, or knock to wake a sleeping device.
 */
export function registerRecoveryChannels(context: ChannelContext): void {
    const lastEvents = new Map<string, string>();

    const statusOf = (deviceId: string): RecoveryStatus => {
        const status = context.sessions.sessions.get(deviceId)?.device?.status;

        return {
            deviceId,
            state: status?.state ?? null,
            reason: status?.reason ?? null,
            error: status?.error?.message ?? null,
            airplay: linkOf(status?.airplay),
            companionLink: linkOf(status?.companionLink),
            lastEvent: lastEvents.get(deviceId) ?? null,
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

    context.onEvent(event => {
        if (event.source === 'device' && event.name === 'status') {
            push(event.deviceId);
        }
    });

    handle('recovery:status', request => statusOf(request.deviceId));

    /* Destroying a socket is the only way to produce the unexpected disconnect recovery is for. */
    handle('recovery:simulateDrop', request => {
        const device = sessionOf(request.deviceId).device;

        if (device === null) {
            throw new Error('This device is not connected, so there is nothing to drop.');
        }

        const kind = request.stream ?? 'data';

        if (!DROP_TARGETS.includes(kind)) {
            throw new Error('Unknown stream to drop.');
        }

        const {airplay, companionLink} = device.sessions;
        const stream = kind === 'companionLink'
            ? companionLink?.stream
            : kind === 'control' ? airplay?.control : kind === 'event' ? airplay?.remoteControl?.events : airplay?.remoteControl?.data;

        if (!stream?.destroy) {
            throw new Error('The selected stream has no socket to drop.');
        }

        lastEvents.set(request.deviceId, `${kind} socket destroyed`);
        push(request.deviceId);

        stream.destroy(new Error('Simulated drop.'));
    });

    handle('recovery:wake', async request => {
        const discovered = context.sessions.discoveredDevice(request.deviceId);

        if (discovered === null) {
            throw new Error(`Device '${request.deviceId}' is not in the last discovery result. Scan first.`);
        }

        await Discovery.wake(discovered.address, WAKE_PORTS);

        lastEvents.set(request.deviceId, `wake knock sent to ${discovered.address}`);
        push(request.deviceId);
    });
}
