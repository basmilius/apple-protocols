import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';

export function registerLogs(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'logs:snapshot', () => ctx.logs.snapshot());

    handle(ipcMain, ctx, 'logs:clear', () => {
        ctx.logs.clear();
        return null;
    });

    handle(ipcMain, ctx, 'logs:set-groups', (_, {groups}) => {
        ctx.logs.setGroups(groups);
        return null;
    });
}
