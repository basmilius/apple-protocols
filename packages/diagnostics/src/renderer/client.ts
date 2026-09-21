import type { EventChannel, EventMap, InvokeChannel, InvokeRequest, InvokeResponse } from '@shared/contract';

/** Typed renderer access to the IPC contract. */
export function invoke<C extends InvokeChannel>(channel: C, request: InvokeRequest<C>): Promise<InvokeResponse<C>> {
    return window.diagnostics.invoke(channel, request);
}

export function on<C extends EventChannel>(channel: C, listener: (payload: EventMap[C]) => void): () => void {
    return window.diagnostics.on(channel, listener);
}

export function messageOf(error: unknown, fallback = 'Something went wrong.'): string {
    if (error instanceof Error) {
        return error.message || fallback;
    }

    if (typeof error === 'string' && error.length > 0) {
        return error;
    }

    return fallback;
}
