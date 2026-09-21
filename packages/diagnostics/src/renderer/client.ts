import type { EventChannel, EventMap, InvokeChannel, InvokeRequest, InvokeResponse } from '@shared/contract';

/**
 * The renderer's end of the contract. Everything that talks to main goes through here, so a panel
 * never touches `window.diagnostics` and a channel keeps one call site to type against.
 */
export function invoke<C extends InvokeChannel>(channel: C, request: InvokeRequest<C>): Promise<InvokeResponse<C>> {
    return window.diagnostics.invoke(channel, request);
}

export function on<C extends EventChannel>(channel: C, listener: (payload: EventMap[C]) => void): () => void {
    return window.diagnostics.on(channel, listener);
}

/** What a `device:call` refused or failed with, as one line. */
export function messageOf(error: unknown, fallback = 'Something went wrong.'): string {
    if (error instanceof Error) {
        return error.message || fallback;
    }

    if (typeof error === 'string' && error.length > 0) {
        return error;
    }

    return fallback;
}
