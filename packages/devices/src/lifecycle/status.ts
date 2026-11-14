import type { DeviceState, ProtocolStatus, Status } from '../types';

export type StatusLink = {
    readonly status: ProtocolStatus;
    readonly hasConnected: boolean;
};

/**
 * The device state from its links. AirPlay decides; Companion Link only splits connected from
 * degraded. While the first Companion Link attempt runs the device still counts as connecting, so a
 * consumer does not see a degraded flash before connected.
 */
export function deriveState(running: boolean, airplay: StatusLink, companionLink?: StatusLink): DeviceState {
    if (!running) {
        return 'disconnected';
    }

    const {state, phase} = airplay.status;

    if (state === 'connected') {
        if (!companionLink) {
            return 'connected';
        }

        const link = companionLink.status;

        if (link.state === 'connected') {
            return 'connected';
        }

        if (link.state === 'connecting' && !companionLink.hasConnected && link.attempt === 0) {
            return 'connecting';
        }

        return 'degraded';
    }

    if (state === 'off' || phase === null) {
        return 'connecting';
    }

    return phase === 'quick' ? 'recovering' : 'offline';
}

/** Whether two statuses carry the same values, so no event goes out for nothing. */
export function sameStatus(a: Status | undefined, b: Status): boolean {
    return !!a
        && a.state === b.state
        && a.reason === b.reason
        && a.error === b.error
        && sameProtocol(a.airplay, b.airplay)
        && sameProtocol(a.companionLink, b.companionLink);
}

function sameProtocol(a: ProtocolStatus | undefined, b: ProtocolStatus | undefined): boolean {
    if (!a || !b) {
        return a === b;
    }

    return a.state === b.state
        && a.attempt === b.attempt
        && a.phase === b.phase
        && a.nextAttemptAt === b.nextAttemptAt
        && a.error === b.error;
}
