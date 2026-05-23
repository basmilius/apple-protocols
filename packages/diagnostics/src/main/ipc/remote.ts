import type { RemoteController, SystemController } from '@basmilius/apple-sdk';
import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';
import type { NavigationButton, SystemAction } from '@shared/ipc';

export function registerRemote(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'remote:navigate', async (_, {button}) => {
        const device = ctx.activeDevice.requireAppleTV();
        await navigate(device.remote, button);
        return null;
    });

    handle(ipcMain, ctx, 'remote:power', async (_, {action}) => {
        const device = ctx.activeDevice.requireAppleTV();

        if (action === 'on') {
            await device.remote.wake();
        } else if (action === 'off') {
            await device.remote.suspend();
        } else {
            const state = ctx.activeDevice.snapshot().power?.state;
            if (state === 'awake') {
                await device.remote.suspend();
            } else {
                await device.remote.wake();
            }
        }

        return null;
    });

    handle(ipcMain, ctx, 'remote:gesture', async (_, payload) => {
        const device = ctx.activeDevice.requireAppleTV();
        const transport = payload.transport ?? 'airplay';

        if (payload.type === 'swipe') {
            if (transport === 'companionLink') {
                if (!device.companionLink) {
                    throw new Error('Companion Link not available');
                }
                await device.companionLink.swipe(payload.direction, payload.duration);
            } else {
                await device.remote.swipe(payload.direction, payload.duration);
            }
        } else {
            if (transport === 'companionLink') {
                if (!device.companionLink) {
                    throw new Error('Companion Link not available');
                }
                await device.companionLink.tap(payload.x, payload.y);
            } else {
                await device.remote.tap(payload.x, payload.y, payload.finger);
            }
        }

        return null;
    });

    handle(ipcMain, ctx, 'remote:text', async (_, {action, text}) => {
        const device = ctx.activeDevice.requireAppleTV();

        switch (action) {
            case 'set':
                await device.keyboard.type(text ?? '');
                break;
            case 'append':
                await device.keyboard.append(text ?? '');
                break;
            case 'clear':
                await device.keyboard.clear();
                break;
        }

        return null;
    });

    handle(ipcMain, ctx, 'remote:hid', async (_, {usagePage, usage, kind, duration}) => {
        const device = ctx.activeDevice.requireAppleTV();

        switch (kind) {
            case 'press':
                await device.remote.pressAndRelease(usagePage, usage);
                break;
            case 'long':
                await device.remote.longPress(usagePage, usage, duration);
                break;
            case 'double':
                await device.remote.doublePress(usagePage, usage);
                break;
        }

        return null;
    });

    handle(ipcMain, ctx, 'remote:apps:list', async () => {
        const device = ctx.activeDevice.requireAppleTV();
        if (!device.apps) {
            throw new Error('Companion Link not available for app listing');
        }
        const apps = await device.apps.list();
        return apps.map(app => ({bundleId: app.bundleId, name: app.name}));
    });

    handle(ipcMain, ctx, 'remote:apps:launch', async (_, {bundleId}) => {
        const device = ctx.activeDevice.requireAppleTV();
        if (!device.apps) {
            throw new Error('Companion Link not available for app launching');
        }
        await device.apps.launch(bundleId);
        return null;
    });

    handle(ipcMain, ctx, 'remote:users:list', async () => {
        const device = ctx.activeDevice.requireAppleTV();
        if (!device.accounts) {
            throw new Error('Companion Link not available for user listing');
        }
        const users = await device.accounts.list();
        return users.map(user => ({accountId: user.accountId, name: user.name}));
    });

    handle(ipcMain, ctx, 'remote:users:switch', async (_, {accountId}) => {
        const device = ctx.activeDevice.requireAppleTV();
        if (!device.accounts) {
            throw new Error('Companion Link not available for switching users');
        }
        await device.accounts.switch(accountId);
        return null;
    });

    handle(ipcMain, ctx, 'remote:system', async (_, {action}) => {
        const device = ctx.activeDevice.requireAppleTV();
        if (!device.system) {
            throw new Error('Companion Link not available for system actions');
        }
        await applySystemAction(device.system, action);
        return null;
    });
}

async function navigate(remote: RemoteController, button: NavigationButton): Promise<void> {
    switch (button) {
        case 'up': await remote.up(); break;
        case 'down': await remote.down(); break;
        case 'left': await remote.left(); break;
        case 'right': await remote.right(); break;
        case 'select': await remote.select(); break;
        case 'menu': await remote.menu(); break;
        case 'home': await remote.home(); break;
        case 'topMenu': await remote.topMenu(); break;
        case 'back': await remote.menu(); break;
        case 'channelUp': await remote.channelUp(); break;
        case 'channelDown': await remote.channelDown(); break;
    }
}

async function applySystemAction(
    system: SystemController,
    action: SystemAction
): Promise<void> {
    switch (action) {
        case 'captions':
            await system.toggleCaptions();
            break;
        case 'dark':
            await system.setAppearance('dark');
            break;
        case 'light':
            await system.setAppearance('light');
            break;
        case 'siri-start':
            await system.siriStart();
            break;
        case 'siri-stop':
            await system.siriStop();
            break;
        case 'find-remote-on':
            await system.setFindingMode(true);
            break;
        case 'find-remote-off':
            await system.setFindingMode(false);
            break;
    }
}
