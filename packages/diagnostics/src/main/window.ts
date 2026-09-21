import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, nativeTheme, shell } from 'electron';
import type { ThemeRequest } from '@shared/contract';

const here = fileURLToPath(new URL('.', import.meta.url));

/* Initial dark background, replaced with the resolved theme before the window paints. */
const DEFAULT_BACKGROUND = '#0d0d10';

export function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        show: false,
        backgroundColor: DEFAULT_BACKGROUND,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        trafficLightPosition: {x: 17, y: 17},
        webPreferences: {
            preload: join(here, '../preload/index.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    window.once('ready-to-show', () => window.show());

    window.webContents.setWindowOpenHandler(({url}) => {
        void shell.openExternal(url);
        return {action: 'deny'};
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        void window.loadFile(join(here, '../renderer/index.html'));
    }

    return window;
}

/** Match the renderer theme for resize/reload backgrounds and native menus. */
export function applyTheme(window: BrowserWindow | null, theme: ThemeRequest): void {
    nativeTheme.themeSource = theme.followsSystem ? 'system' : theme.resolved;
    window?.setBackgroundColor(theme.background);
}
