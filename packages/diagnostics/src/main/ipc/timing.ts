import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';
import { inspectDevices, runFlow } from '../domain/timingFlow';

export function registerTiming(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'timing:ntp:state', () => ctx.ntp.snapshot());
    handle(ipcMain, ctx, 'timing:ntp:start', async () => await ctx.ntp.start());
    handle(ipcMain, ctx, 'timing:ntp:stop', () => ctx.ntp.stop());

    handle(ipcMain, ctx, 'timing:ptp:state', () => ctx.ptp.snapshot());
    handle(ipcMain, ctx, 'timing:ptp:start', async (_, {address}) => await ctx.ptp.start(address));
    handle(ipcMain, ctx, 'timing:ptp:stop', () => ctx.ptp.stop());

    handle(ipcMain, ctx, 'timing:inspect', async () => {
        return await inspectDevices(ctx.discovery);
    });

    handle(ipcMain, ctx, 'timing:flow', async (_, {deviceId, mode}) => {
        return await runFlow(ctx.storage, ctx.discovery, deviceId, mode);
    });
}
