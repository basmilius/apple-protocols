import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';

export function registerPairing(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'pairing:start', async (_, {deviceId, protocol}) => {
        await ctx.pairing.start(deviceId, protocol);
        return null;
    });

    handle(ipcMain, ctx, 'pairing:submit-pin', (_, {pin}) => {
        ctx.pairing.submitPin(pin);
        return null;
    });

    handle(ipcMain, ctx, 'pairing:cancel', () => {
        ctx.pairing.cancel();
        return null;
    });

    handle(ipcMain, ctx, 'pairing:unpair', async (_, {deviceId, protocol}) => {
        await ctx.pairing.unpair(deviceId, protocol);
        return null;
    });

    handle(ipcMain, ctx, 'pairing:verify', async (_, {deviceId, protocol}) => {
        const used = await ctx.pairing.verify(deviceId, protocol);
        return {protocol: used, ok: true as const};
    });
}
