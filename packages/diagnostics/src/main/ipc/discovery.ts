import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';

export function registerDiscovery(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'device:discover', async () => {
        return await ctx.discovery.refresh(true);
    });

    handle(ipcMain, ctx, 'device:rescan', async () => {
        ctx.discovery.clearCache();
        return await ctx.discovery.refresh(false);
    });

    handle(ipcMain, ctx, 'device:list-paired', async () => {
        return ctx.discovery.listPaired();
    });
}
