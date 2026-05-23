import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';

export function registerConnection(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'device:connect', async (_, {deviceId}) => {
        return await ctx.activeDevice.connect(deviceId);
    });

    handle(ipcMain, ctx, 'device:connect-ip', async (_, {address, port}) => {
        return await ctx.activeDevice.connectByIp(address, port);
    });

    handle(ipcMain, ctx, 'device:disconnect', async () => {
        await ctx.activeDevice.disconnect();
        return null;
    });
}
