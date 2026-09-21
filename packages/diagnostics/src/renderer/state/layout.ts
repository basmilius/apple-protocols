import { create } from 'zustand';
import { panelIds } from '@/panels/registry';
import {
    type CellAt,
    type CellRef,
    cleanLayout,
    closeCell,
    drop,
    focusCell,
    focusDirection,
    resizeCells,
    resizeColumns,
    showIn,
    singleLayout,
    type SplitDirection,
    type SplitLayout,
    type SplitZone
} from '@/shell/split';

const KEY = 'diagnostics.layout';

const WELCOME: CellRef = {deviceId: null, panelId: 'welcome'};

/** Where the log console hangs: beside the grid or under it. */
export type ConsoleDock = 'right' | 'bottom';

/** How wide the console is beside the grid, and how tall it is under it. */
export const CONSOLE_SIZE: Record<ConsoleDock, { initial: number; min: number; max(): number }> = {
    right: {initial: 420, min: 320, max: () => Math.max(320, window.innerWidth - 480)},
    bottom: {initial: 280, min: 160, max: () => Math.max(160, window.innerHeight - 240)}
};

type LayoutState = {
    layout: SplitLayout;
    sidebarOpen: boolean;
    consoleOpen: boolean;
    consoleDock: ConsoleDock;
    consoleSize: Record<ConsoleDock, number>;
    /* The devices whose panels are unfolded in the sidebar. The device in the focused cell is
       always unfolded on top of these, which is why it is not written here. */
    expanded: readonly string[];
    focusAt(at: CellAt): void;
    focusStep(direction: SplitDirection): void;
    dropAt(ref: CellRef, at: CellAt, zone: SplitZone): void;
    show(ref: CellRef, at?: CellAt): void;
    setCell(at: CellAt, ref: Partial<CellRef>): void;
    close(at: CellAt): void;
    split(direction: 'right' | 'down', at?: CellAt): void;
    resizeColumn(index: number, before: number, after: number): void;
    resizeCell(column: number, index: number, before: number, after: number): void;
    toggleSidebar(): void;
    toggleConsole(): void;
    setConsoleDock(dock: ConsoleDock): void;
    setConsoleSize(dock: ConsoleDock, size: number): void;
    toggleExpanded(deviceId: string): void;
};

const restore = (): SplitLayout => {
    try {
        const raw = localStorage.getItem(KEY);

        if (raw === null) {
            return singleLayout(WELCOME);
        }

        return cleanLayout(JSON.parse(raw) as SplitLayout, panelIds()) ?? singleLayout(WELCOME);
    } catch {
        return singleLayout(WELCOME);
    }
};

const persist = (layout: SplitLayout): SplitLayout => {
    localStorage.setItem(KEY, JSON.stringify(layout));
    return layout;
};

const flag = (key: string, fallback: boolean): boolean => {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
};

const restoreDock = (): ConsoleDock => (localStorage.getItem('diagnostics.console.dock') === 'bottom' ? 'bottom' : 'right');

const restoreSize = (dock: ConsoleDock): number => {
    const bounds = CONSOLE_SIZE[dock];
    const stored = Number(localStorage.getItem(`diagnostics.console.size.${dock}`));
    return Number.isFinite(stored) && stored >= bounds.min ? stored : bounds.initial;
};

const restoreExpanded = (): string[] => {
    try {
        const raw = localStorage.getItem('diagnostics.sidebar.expanded');
        return raw === null ? [] : (JSON.parse(raw) as string[]);
    } catch {
        return [];
    }
};

export const useLayout = create<LayoutState>((set, get) => ({
    layout: restore(),
    sidebarOpen: flag('diagnostics.sidebar', true),
    consoleOpen: flag('diagnostics.console', false),
    consoleDock: restoreDock(),
    consoleSize: {right: restoreSize('right'), bottom: restoreSize('bottom')},
    expanded: restoreExpanded(),
    focusAt(at) {
        set({layout: persist(focusCell(get().layout, at))});
    },
    focusStep(direction) {
        set({layout: persist(focusDirection(get().layout, direction))});
    },
    dropAt(ref, at, zone) {
        set({layout: persist(drop(get().layout, ref, at, zone))});
    },
    show(ref, at) {
        set({layout: persist(showIn(get().layout, ref, at))});
    },
    setCell(at, ref) {
        const layout = get().layout;
        const cell = layout.columns[at.column]?.cells[at.cell];

        if (!cell) {
            return;
        }

        set({layout: persist(drop(layout, {deviceId: cell.deviceId, panelId: cell.panelId, ...ref}, at, 'center'))});
    },
    close(at) {
        const next = closeCell(get().layout, at);
        set({layout: persist(next ?? singleLayout(WELCOME))});
    },
    split(direction, at) {
        const layout = get().layout;
        const target = at ?? layout.focus;
        const cell = layout.columns[target.column]?.cells[target.cell];
        set({layout: persist(drop(layout, cell ? {deviceId: cell.deviceId, panelId: cell.panelId} : WELCOME, target, direction))});
    },
    resizeColumn(index, before, after) {
        set({layout: persist(resizeColumns(get().layout, index, before, after))});
    },
    resizeCell(column, index, before, after) {
        set({layout: persist(resizeCells(get().layout, column, index, before, after))});
    },
    toggleSidebar() {
        const sidebarOpen = !get().sidebarOpen;
        localStorage.setItem('diagnostics.sidebar', sidebarOpen ? '1' : '0');
        set({sidebarOpen});
    },
    toggleConsole() {
        const consoleOpen = !get().consoleOpen;
        localStorage.setItem('diagnostics.console', consoleOpen ? '1' : '0');
        set({consoleOpen});
    },
    setConsoleDock(consoleDock) {
        localStorage.setItem('diagnostics.console.dock', consoleDock);
        set({consoleDock, consoleOpen: true});
    },
    setConsoleSize(dock, size) {
        localStorage.setItem(`diagnostics.console.size.${dock}`, String(size));
        set({consoleSize: {...get().consoleSize, [dock]: size}});
    },
    toggleExpanded(deviceId) {
        const current = get().expanded;
        const expanded = current.includes(deviceId) ? current.filter(id => id !== deviceId) : [...current, deviceId];
        localStorage.setItem('diagnostics.sidebar.expanded', JSON.stringify(expanded));
        set({expanded});
    }
}));

export { WELCOME };
