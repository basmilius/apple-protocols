import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';

export function registerVolume(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'volume:set', async (_, {level}) => {
        const device = ctx.activeDevice.requireDevice();
        await device.volume.set(level);
        return null;
    });

    handle(ipcMain, ctx, 'volume:adjust', async (_, {direction}) => {
        const device = ctx.activeDevice.requireDevice();

        if (direction === 'up') {
            await device.volume.up();
        } else {
            await device.volume.down();
        }

        return null;
    });

    handle(ipcMain, ctx, 'volume:mute', async (_, {muted}) => {
        const device = ctx.activeDevice.requireDevice();

        if (muted) {
            await device.volume.mute();
        } else {
            await device.volume.unmute();
        }

        return null;
    });

    handle(ipcMain, ctx, 'volume:toggle-mute', async () => {
        const device = ctx.activeDevice.requireDevice();
        await device.volume.toggleMute();
        return null;
    });
}
