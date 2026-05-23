import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';

export function registerMultiRoom(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'multi-room:prepare', async (_, {deviceIds}) => {
        return await ctx.multiRoom.prepare(deviceIds);
    });

    handle(ipcMain, ctx, 'multi-room:stream-url', async (_, {url}) => {
        ctx.multiRoom.streamUrl(url)
            .then(() => ctx.broadcaster('media:playback-ended', {kind: 'multi-room'}))
            .catch(() => {});
        return null;
    });

    handle(ipcMain, ctx, 'multi-room:stream-file', async (_, {path}) => {
        ctx.multiRoom.streamFile(path)
            .then(() => ctx.broadcaster('media:playback-ended', {kind: 'multi-room'}))
            .catch(() => {});
        return null;
    });

    handle(ipcMain, ctx, 'multi-room:stop', async () => {
        await ctx.multiRoom.stop();
        return null;
    });

    handle(ipcMain, ctx, 'multi-room:add', async (_, {deviceId}) => {
        return await ctx.multiRoom.add(deviceId);
    });

    handle(ipcMain, ctx, 'multi-room:remove', async (_, {deviceId}) => {
        await ctx.multiRoom.remove(deviceId);
        return null;
    });

    handle(ipcMain, ctx, 'multi-room:targets', () => {
        return ctx.multiRoom.targets();
    });
}
