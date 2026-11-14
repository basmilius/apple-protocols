import { AppleProtocolError } from '@corewire/core';

/** A capability was called while it cannot work: its protocol is down, or the device cannot do it at all. */
export class UnavailableError extends AppleProtocolError {
    readonly capability: string;
    readonly reason: 'disconnected' | 'unsupported';

    constructor(capability: string, reason: 'disconnected' | 'unsupported', message?: string) {
        super(message ?? (reason === 'disconnected' ? `${capability} is unavailable while its protocol is not connected.` : `This device does not support ${capability}.`));
        this.name = 'UnavailableError';
        this.capability = capability;
        this.reason = reason;
    }
}

/** The session a capability needs, or an {@link UnavailableError} when its protocol is down. */
export function requireSession<T>(session: T | undefined, capability: string): T {
    if (!session) {
        throw new UnavailableError(capability, 'disconnected');
    }

    return session;
}
