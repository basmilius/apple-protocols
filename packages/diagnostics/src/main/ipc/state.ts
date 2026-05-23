import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';

export function registerState(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'state:snapshot', () => {
        return ctx.activeDevice.snapshot();
    });
}
