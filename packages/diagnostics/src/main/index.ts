import { app, BrowserWindow } from 'electron';
import { configure } from '@basmilius/apple-sdk';
import { type DeviceEvent, type EventChannel, type EventMap, type StateSnapshot } from '@shared/contract';
import { registerMediaChannels } from './channels/media';
import { registerToolsChannels } from './channels/tools';
import { handle } from './ipc';
import { LogBuffer } from './logs';
import { SessionManager, type SessionHost } from './session';
import { StorageQueue } from './storage';
import { applyTheme, createWindow } from './window';

const storage = new StorageQueue();
const logs = new LogBuffer();

let window: BrowserWindow | null = null;

const send = <C extends EventChannel>(channel: C, payload: EventMap[C]): void => {
    if (window !== null && !window.isDestroyed()) {
        window.webContents.send(channel, payload);
    }
};

const host: SessionHost = {
    emitEvent: (event: DeviceEvent) => send('device:event', event),
    emitSnapshot: (snapshot: StateSnapshot) => send('device:snapshot', snapshot),
    emitDiscovery: () => send('discovery:changed', sessions.list())
};

const sessions = new SessionManager(host, storage.storage);

const registerChannels = (): void => {
    handle('app:info', () => ({
        platform: process.platform,
        versions: {electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node},
        storagePath: storage.path
    }));

    handle('app:theme', theme => {
        applyTheme(window, theme);
    });

    handle('discovery:scan', async request => await sessions.discover(request?.rescan === true));
    handle('discovery:list', () => sessions.list());

    handle('device:connect', async request => await sessions.connect(request.deviceId));
    handle('device:disconnect', async request => {
        await sessions.disconnect(request.deviceId);
    });
    handle('device:snapshot', request => sessions.snapshot(request.deviceId));
    handle('device:call', async request => await sessions.call(request));

    handle('log:history', () => logs.entries);
    handle('log:clear', () => {
        logs.clear();
    });

    registerMediaChannels({sessions, storage, send});
    registerToolsChannels({sessions, storage, send});
};

const start = async (): Promise<void> => {
    // The sink sees every group whether or not it prints, so no group is enabled: the app's own
    // console stays quiet and the log console still gets everything.
    logs.install();
    logs.onListener(entry => send('log:entry', entry));

    await storage.load();
    configure({storage: storage.storage});

    registerChannels();

    window = createWindow();
    window.on('closed', () => {
        window = null;
    });
};

app.whenReady().then(start);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        window = createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    void sessions.shutdown();
});
