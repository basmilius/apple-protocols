import { reporter } from '@basmilius/apple-common';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { ActiveDeviceService } from './domain/activeDevice';
import { AudioSourceFactory } from './domain/audioSourceFactory';
import { createStorage } from './domain/storage';
import { DiscoveryCache } from './domain/discoveryCache';
import { LogCollector } from './domain/logCollector';
import { MultiRoomService } from './domain/multiRoom';
import { NtpServerService } from './domain/ntpServer';
import { PairingSessionService } from './domain/pairingSession';
import { PtpMasterService } from './domain/ptpMaster';
import { type Broadcaster, type IpcContext, registerIpcHandlers } from './ipc';

reporter.all();

let context: IpcContext | null = null;

async function createMainWindow(): Promise<void> {
    const window = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1080,
        minHeight: 720,
        backgroundColor: '#101014',
        title: 'Apple Diagnostics',
        autoHideMenuBar: true,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 15, y: 15 },
        webPreferences: {
            preload: join(__dirname, '../preload/index.mjs'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    window.on('ready-to-show', () => {
        window.show();
    });

    window.webContents.setWindowOpenHandler(({url}) => {
        void shell.openExternal(url);
        return {action: 'deny'};
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        await window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        await window.loadFile(join(__dirname, '../renderer/index.html'));
    }
}

const broadcaster: Broadcaster = (channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    }
};

app.whenReady().then(async () => {
    const storage = await createStorage();
    const discovery = new DiscoveryCache(storage);
    const logs = new LogCollector();
    const ntp = new NtpServerService();
    const ptp = new PtpMasterService();

    const activeDevice = new ActiveDeviceService(storage, discovery, () => ntp.instance);
    const pairing = new PairingSessionService(storage, discovery);
    const multiRoom = new MultiRoomService(storage, discovery, () => ntp.instance);
    const audioFactory = new AudioSourceFactory();

    logs.install();

    activeDevice.on('connected', (info) => broadcaster('device:connected', info));
    activeDevice.on('disconnected', (payload) => broadcaster('device:disconnected', payload));
    activeDevice.on('state', (snapshot) => broadcaster('device:state', snapshot));
    activeDevice.on('recovering', (payload) => broadcaster('device:recovering', payload));
    activeDevice.on('recovery-failed', () => broadcaster('device:recovery-failed', null));

    pairing.on('started', (payload) => broadcaster('pairing:started', payload));
    pairing.on('pinRequested', () => broadcaster('pairing:pin-requested', null));
    pairing.on('ended', (result) => broadcaster('pairing:ended', result));
    pairing.on('unpaired', (payload) => broadcaster('pairing:unpaired', payload));

    multiRoom.addListener((event) => broadcaster('media:multi-room-target-changed', event));

    ntp.addListener((snapshot) => broadcaster('timing:ntp:state', snapshot));
    ptp.addListener((snapshot) => broadcaster('timing:ptp:state', snapshot));

    logs.addListener((entry) => broadcaster('log:entry', entry));

    context = {
        storage,
        discovery,
        activeDevice,
        pairing,
        ntp,
        ptp,
        multiRoom,
        audioFactory,
        logs,
        broadcaster
    };

    registerIpcHandlers(ipcMain, context);

    await createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            void createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('quit', async () => {
    if (!context) {
        return;
    }

    try {
        await context.activeDevice.disconnect();
    } catch {
        // Ignore.
    }

    try {
        await context.multiRoom.stop();
    } catch {
        // Ignore.
    }

    context.ntp.stop();
    context.ptp.stop();
    context.logs.uninstall();
});
