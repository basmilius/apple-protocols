import { create } from 'zustand';

const KEY = 'diagnostics.workspace';

/** The panel a device opens on, and the one a stored choice falls back to when it no longer applies. */
export const DEFAULT_PANEL = 'overview';

/** The rail's log console, next to the ids of the tools panels. */
export const CONSOLE_TOOL = 'console';

export const SIDE_PANEL_SIZE = {
    initial: 420,
    min: 320,
    max: (): number => Math.max(320, window.innerWidth - 640)
};

type Stored = {
    readonly deviceId: string | null;
    readonly panels: Readonly<Record<string, string>>;
};

type LayoutState = Stored & {
    tool: string | null;
    sidePanelWidth: number;
    selectDevice(deviceId: string | null): void;
    show(panelId: string): void;
    toggleTool(tool: string): void;
    setSidePanelWidth(width: number): void;
};

const restore = (): Stored => {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Stored> | null;

        return {deviceId: stored?.deviceId ?? null, panels: stored?.panels ?? {}};
    } catch {
        return {deviceId: null, panels: {}};
    }
};

const restoreWidth = (): number => {
    const stored = Number(localStorage.getItem('diagnostics.sidePanel.width'));

    return Number.isFinite(stored) && stored >= SIDE_PANEL_SIZE.min ? stored : SIDE_PANEL_SIZE.initial;
};

/** The panel the selected device shows. Every device remembers its own. */
export const currentPanel = (state: Stored): string => (state.deviceId === null ? DEFAULT_PANEL : (state.panels[state.deviceId] ?? DEFAULT_PANEL));

export const useLayout = create<LayoutState>((set, get) => {
    const save = (stored: Stored): void => {
        localStorage.setItem(KEY, JSON.stringify(stored));
        set(stored);
    };

    return {
        ...restore(),
        tool: localStorage.getItem('diagnostics.tool'),
        sidePanelWidth: restoreWidth(),
        selectDevice(deviceId) {
            save({deviceId, panels: get().panels});
        },
        show(panelId) {
            const {deviceId, panels} = get();

            if (deviceId !== null) {
                save({deviceId, panels: {...panels, [deviceId]: panelId}});
            }
        },
        toggleTool(tool) {
            const next = get().tool === tool ? null : tool;

            if (next === null) {
                localStorage.removeItem('diagnostics.tool');
            } else {
                localStorage.setItem('diagnostics.tool', next);
            }

            set({tool: next});
        },
        setSidePanelWidth(sidePanelWidth) {
            localStorage.setItem('diagnostics.sidePanel.width', String(sidePanelWidth));
            set({sidePanelWidth});
        }
    };
});
