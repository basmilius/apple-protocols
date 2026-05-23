import { BrowserWindow, dialog, type IpcMain } from 'electron';
import { basename } from 'node:path';
import { statSync } from 'node:fs';
import { handle, type IpcContext } from './index';

export function registerMedia(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'media:play-url', async (_, {url, position}) => {
        const device = ctx.activeDevice.requireDevice();
        await ctx.activeDevice.ensureMediaTimingServer();
        await device.media.playUrl(url, position ?? 0);

        device.media.waitForPlaybackEnd()
            .then(() => ctx.broadcaster('media:playback-ended', {kind: 'url'}))
            .catch(() => {});

        return null;
    });

    handle(ipcMain, ctx, 'media:stop-url', () => {
        const device = ctx.activeDevice.requireDevice();
        device.media.stopPlayUrl();
        return null;
    });

    handle(ipcMain, ctx, 'media:pick-file', async (_, {filters}) => {
        const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

        const result = await dialog.showOpenDialog(window!, {
            properties: ['openFile'],
            filters: filters ?? [
                {name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a']},
                {name: 'All files', extensions: ['*']}
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        const path = result.filePaths[0];
        const stat = statSync(path);

        return {
            path,
            name: basename(path),
            size: stat.size
        };
    });

    handle(ipcMain, ctx, 'media:stream-file', async (_, {path}) => {
        const device = ctx.activeDevice.requireDevice();
        await ctx.activeDevice.ensureMediaTimingServer();

        const source = await ctx.audioFactory.fromFile(path);

        device.media.streamAudio(source)
            .then(() => ctx.broadcaster('media:playback-ended', {kind: 'file'}))
            .catch(() => {});

        return null;
    });

    handle(ipcMain, ctx, 'media:stream-url', async (_, {url}) => {
        const device = ctx.activeDevice.requireDevice();
        await ctx.activeDevice.ensureMediaTimingServer();

        const source = await ctx.audioFactory.fromUrl(url);

        device.media.streamAudio(source)
            .then(() => ctx.broadcaster('media:playback-ended', {kind: 'stream'}))
            .catch(() => {});

        return null;
    });

    handle(ipcMain, ctx, 'media:stop-stream', () => {
        const device = ctx.activeDevice.requireDevice();
        device.media.stopStreamAudio();
        return null;
    });

    handle(ipcMain, ctx, 'media:stream-sine', async (_, {frequency, durationSec}) => {
        const device = ctx.activeDevice.requireDevice();
        await ctx.activeDevice.ensureMediaTimingServer();

        const source = ctx.audioFactory.sineWave(durationSec ?? 60, frequency);

        device.media.streamAudio(source)
            .then(() => ctx.broadcaster('media:playback-ended', {kind: 'sine'}))
            .catch(() => {});

        return null;
    });

    handle(ipcMain, ctx, 'media:stop-sine', () => {
        const device = ctx.activeDevice.requireDevice();
        device.media.stopStreamAudio();
        return null;
    });
}
