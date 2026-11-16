import { Proto, type SendCommandError } from '@apple-protocols/airplay/mrp';
import { AppleProtocolError, CommandError } from '@apple-protocols/core';

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

/** The device refused a playback command, for example because nothing plays or the app does not handle it. */
export class CommandRefusedError extends CommandError {
    /** Why the command did not reach a handler, such as `applicationNotFound` or `timedOut`; `noError` when it did. */
    readonly reason: string;

    /** What the handler answered, such as `noActionableNowPlayingItem` or `commandFailed`; `success` when it did not fail. */
    readonly status: string;

    constructor(reason: string, status: string) {
        super(`The device refused the command (reason: ${reason}, status: ${status}).`);
        this.name = 'CommandRefusedError';
        this.reason = reason;
        this.status = status;
    }

    static from(error: SendCommandError): CommandRefusedError {
        const refused = new CommandRefusedError(
            nameOf(Proto.SendError_Enum[error.sendError], error.sendError),
            nameOf(Proto.HandlerReturnStatus_Enum[error.handlerReturnStatus], error.handlerReturnStatus)
        );

        refused.cause = error;

        return refused;
    }
}

/** Returns the enum member name in lower camel case, or the number for a value the protocol definitions do not know. */
function nameOf(name: string | undefined, value: number): string {
    return name ? name[0].toLowerCase() + name.slice(1) : String(value);
}

/** Returns the session a capability needs, or throws an {@link UnavailableError} when its protocol is down. */
export function requireSession<T>(session: T | undefined, capability: string): T {
    if (!session) {
        throw new UnavailableError(capability, 'disconnected');
    }

    return session;
}
