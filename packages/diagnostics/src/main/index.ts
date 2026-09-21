import { app, BrowserWindow } from 'electron';
import { configure } from '@basmilius/apple-sdk';
import { type DeviceEvent, type EventChannel, type EventMap, type StateSnapshot } from '@shared/contract';
import { AgentServer } from './agent/server';
import { ResumeList } from './agent/resume';
import { registerMediaChannels } from './channels/media';
import { registerToolsChannels } from './channels/tools';
import { handle } from './ipc';
import { LogBuffer } from './logs';
import { Ring } from './ring';
import { SessionManager, type SessionHost } from './session';
import { StorageQueue } from './storage';
import { TrafficBuffer } from './traffic';
import { applyTheme, createWindow } from './window';

/** An agent drives real hardware through the bridge, so a packaged app only opens it when asked to. */
const AGENT_ENABLED = !app.isPackaged || process.argv.includes('--agent') || process.env.DIAGNOSTICS_AGENT === '1';

const storage = new StorageQueue();
const logs = new LogBuffer();
const traffic = new TrafficBuffer();
const events = new Ring<DeviceEvent>(5000, event => event.sequence);
const resume = new ResumeList();

let agent: AgentServer | null = null;
let resuming = false;

let window: BrowserWindow | null = null;

const send = <C extends EventChannel>(channel: C, payload: EventMap[C]): void => {
    if (window !== null && !window.isDestroyed()) {
        window.webContents.send(channel, payload);
    }
};

const host: SessionHost = {
    emitEvent: (event: DeviceEvent) => {
        events.push(event);
        send('device:event', event);
    },
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

    handle('device:connect', async request => {
        const snapshot = await sessions.connect(request.deviceId);
        await resume.add(request.deviceId);

        return snapshot;
    });
    handle('device:disconnect', async request => {
        await resume.remove(request.deviceId);
        await sessions.disconnect(request.deviceId);
    });
    handle('device:snapshot', request => sessions.snapshot(request.deviceId));
    handle('device:call', async request => await sessions.call(request));

    handle('log:history', () => logs.entries);
    handle('log:clear', () => {
        logs.clear();
    });

    handle('traffic:history', () => traffic.ring.entries);
    handle('traffic:clear', () => {
        traffic.ring.clear();
    });

    registerMediaChannels({sessions, storage, send});
    registerToolsChannels({sessions, storage, send});
};

const start = async (): Promise<void> => {
    // The sink sees every group whether or not it prints, so no group is enabled: the app's own
    // console stays quiet and the log console still gets everything.
    logs.install();
    logs.onListener(entry => send('log:entry', entry));

    traffic.install();
    traffic.onListener(record => send('traffic:entry', record));

    await storage.load();
    configure({storage: storage.storage});

    registerChannels();

    window = createWindow();
    window.on('closed', () => {
        window = null;
    });

    if (AGENT_ENABLED) {
        await startAgent();
    }
};

const startAgent = async (): Promise<void> => {
    await resume.load();
    resuming = resume.deviceIds.length > 0;

    agent = new AgentServer({sessions, logs, events, traffic: traffic.ring, isResuming: () => resuming});
    await agent.start();

    if (!resuming) {
        return;
    }

    try {
        await sessions.discover();
        await Promise.allSettled(resume.deviceIds.map(deviceId => sessions.connect(deviceId)));
    } finally {
        resuming = false;
    }
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
    void agent?.stop();
    void sessions.shutdown();
});
