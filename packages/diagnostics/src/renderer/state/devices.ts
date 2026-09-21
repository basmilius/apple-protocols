import { create } from 'zustand';
import type { DeviceEvent, DiscoveredDeviceInfo, LogEntry, StateSnapshot } from '@shared/contract';
import { invoke, on } from '@/client';

/** Enough scrollback to follow a connect without letting a chatty data stream eat the renderer. */
const MAX_EVENTS = 4000;
const MAX_LOGS = 5000;

type DevicesState = {
    devices: readonly DiscoveredDeviceInfo[];
    snapshots: Readonly<Record<string, StateSnapshot>>;
    events: readonly DeviceEvent[];
    logs: readonly LogEntry[];
    scanning: boolean;
    busy: Readonly<Record<string, boolean>>;
    eventsPaused: boolean;
    logsPaused: boolean;
    scan(rescan?: boolean): Promise<void>;
    connect(deviceId: string): Promise<void>;
    disconnect(deviceId: string): Promise<void>;
    clearEvents(): void;
    clearLogs(): Promise<void>;
    setEventsPaused(paused: boolean): void;
    setLogsPaused(paused: boolean): void;
};

const bounded = <T>(items: readonly T[], added: T, max: number): T[] => {
    const next = [...items, added];
    return next.length > max ? next.slice(next.length - max) : next;
};

export const useDevices = create<DevicesState>((set, get) => ({
    devices: [],
    snapshots: {},
    events: [],
    logs: [],
    scanning: false,
    busy: {},
    eventsPaused: false,
    logsPaused: false,
    async scan(rescan = false) {
        if (get().scanning) {
            return;
        }

        set({scanning: true});

        try {
            set({devices: await invoke('discovery:scan', {rescan})});
        } finally {
            set({scanning: false});
        }
    },
    async connect(deviceId) {
        set({busy: {...get().busy, [deviceId]: true}});

        try {
            const snapshot = await invoke('device:connect', {deviceId});
            set({snapshots: {...get().snapshots, [deviceId]: snapshot}});
        } finally {
            set({busy: {...get().busy, [deviceId]: false}});
        }
    },
    async disconnect(deviceId) {
        set({busy: {...get().busy, [deviceId]: true}});

        try {
            await invoke('device:disconnect', {deviceId});
        } finally {
            set({busy: {...get().busy, [deviceId]: false}});
        }
    },
    clearEvents() {
        set({events: []});
    },
    async clearLogs() {
        await invoke('log:clear', undefined);
        set({logs: []});
    },
    setEventsPaused(eventsPaused) {
        set({eventsPaused});
    },
    setLogsPaused(logsPaused) {
        set({logsPaused});
    }
}));

/** Wires the pushes from main into the store. Called once, before the first render. */
export async function startDevices(): Promise<void> {
    on('discovery:changed', devices => useDevices.setState({devices}));

    on('device:snapshot', snapshot => {
        useDevices.setState(state => ({snapshots: {...state.snapshots, [snapshot.deviceId]: snapshot}}));
    });

    on('device:event', event => {
        if (useDevices.getState().eventsPaused) {
            return;
        }

        useDevices.setState(state => ({events: bounded(state.events, event, MAX_EVENTS)}));
    });

    on('log:entry', entry => {
        if (useDevices.getState().logsPaused) {
            return;
        }

        useDevices.setState(state => ({logs: bounded(state.logs, entry, MAX_LOGS)}));
    });

    useDevices.setState({logs: await invoke('log:history', undefined)});
    await useDevices.getState().scan();
}
