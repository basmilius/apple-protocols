import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, type IpcMainInvokeEvent, nativeTheme, screen, shell } from 'electron';
import { appWindowNavigation, createTheme, createWindowState, fileStorage, isExternalLink, type WindowState } from '@adecore/shell';
import type { ThemeRequest } from '@shared/contract';

const here = fileURLToPath(new URL('.', import.meta.url));

/* Initial dark background, replaced with the resolved theme before the window paints. */
const DEFAULT_BACKGROUND = '#0d0d10';

const theme = createTheme({
    nativeTheme,
    windows: () => BrowserWindow.getAllWindows(),
    background: DEFAULT_BACKGROUND,
    overlay: {
        height: 48,
        colors: {
            light: {color: '#ffffff', symbolColor: '#18181b'},
            dark: {color: '#131316', symbolColor: '#ececf1'}
        }
    }
});

let state: WindowState | null = null;

const isDiagnosticsUrl = (url: string): boolean => {
    if (process.env.ELECTRON_RENDERER_URL) {
        return appWindowNavigation(url, new URL(process.env.ELECTRON_RENDERER_URL).origin) === 'allow';
    }

    try {
        const parsed = new URL(url);
        return parsed.protocol === 'file:' && fileURLToPath(parsed) === join(here, '../renderer/index.html');
    } catch {
        return false;
    }
};

export const isDiagnosticsSender = (event: IpcMainInvokeEvent): boolean =>
    BrowserWindow.fromWebContents(event.sender) !== null && event.senderFrame?.parent === null && isDiagnosticsUrl(event.senderFrame.url);

export function createWindow(): BrowserWindow {
    if (state === null) {
        const directory = app.getPath('userData');
        mkdirSync(directory, {recursive: true});
        state = createWindowState({
            storage: fileStorage(join(directory, 'window-state.json')),
            displays: () => screen.getAllDisplays(),
            defaults: {width: 1440, height: 900}
        });
    }

    const window = new BrowserWindow({
        ...state.bounds('diagnostics'),
        ...theme.windowOptions(),
        minWidth: 960,
        minHeight: 600,
        show: false,
        webPreferences: {
            preload: join(here, '../preload/index.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    state.track('diagnostics', window);
    window.once('ready-to-show', () => window.show());

    const openExternal = (url: string): void => {
        if (isExternalLink(url)) {
            void shell.openExternal(url);
        }
    };

    window.webContents.setWindowOpenHandler(({url}) => {
        openExternal(url);
        return {action: 'deny'};
    });

    /* A navigated page would inherit the diagnostics bridge. Keep it on the app's own URL. */
    window.webContents.on('will-navigate', (event, url) => {
        if (!isDiagnosticsUrl(url)) {
            event.preventDefault();
            openExternal(url);
        }
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        void window.loadFile(join(here, '../renderer/index.html'));
    }

    return window;
}

/** Match the renderer theme for resize/reload backgrounds and native menus. */
export function applyTheme(request: ThemeRequest): void {
    theme.apply(request);
}

app.on('will-quit', () => state?.flush());
