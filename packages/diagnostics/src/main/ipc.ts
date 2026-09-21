import { ipcMain } from 'electron';
import type { InvokeChannel, InvokeRequest, InvokeResponse } from '@shared/contract';

export type InvokeHandler<C extends InvokeChannel> = (request: InvokeRequest<C>) => InvokeResponse<C> | Promise<InvokeResponse<C>>;

const handlers = new Map<InvokeChannel, InvokeHandler<InvokeChannel>>();

/**
 * Registers one typed channel. A handler that throws would reach the renderer as an opaque
 * `Error invoking remote method`, so every failure is turned into a message the caller can read.
 */
export function handle<C extends InvokeChannel>(channel: C, handler: InvokeHandler<C>): void {
    handlers.set(channel, handler as unknown as InvokeHandler<InvokeChannel>);

    ipcMain.handle(channel, async (_event, request: InvokeRequest<C>) => {
        try {
            return await handler(request);
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : String(error));
        }
    });
}

/** Answers a channel whose implementation is left to a later panel. */
export function handleUnimplemented(channel: InvokeChannel): void {
    ipcMain.handle(channel, () => {
        throw new Error(`Channel '${channel}' is declared in the contract but not implemented yet.`);
    });
}

/** Runs a channel's handler from inside main, which is how the agent bridge reaches every channel. */
export async function invoke<C extends InvokeChannel>(channel: C, request: InvokeRequest<C>): Promise<InvokeResponse<C>> {
    const handler = handlers.get(channel);

    if (handler === undefined) {
        throw new Error(`Channel '${channel}' has no handler.`);
    }

    return await handler(request) as InvokeResponse<C>;
}
