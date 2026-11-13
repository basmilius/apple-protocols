import { create } from 'zustand';
import type { DeviceEvent, DiscoveredDeviceInfo, LogEntry, StateSnapshot, TrafficRecord } from '@shared/contract';
import { invoke, on } from '@/client';
import { Capture } from './capture';

/** Enough scrollback to follow a connect without letting a chatty data stream eat the renderer. */
const MAX_EVENTS = 4000;
const MAX_LOGS = 5000;

type DevicesState = {
    devices: readonly DiscoveredDeviceInfo[];
    snapshots: Readonly<Record<string, StateSnapshot>>;
    events: readonly DeviceEvent[];
    logs: readonly LogEntry[];
    traffic: readonly TrafficRecord[];
    clearTraffic(): Promise<void>;
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

const eventCapture = new Capture<DeviceEvent>(MAX_EVENTS);
const logCapture = new Capture<LogEntry>(MAX_LOGS);
const trafficCapture = new Capture<TrafficRecord>(1000);
let flushTimer: ReturnType<typeof setTimeout> | undefined;
const flushSoon = (): void => {
    if (flushTimer !== undefined) return;
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        useDevices.setState({events: eventCapture.snapshot(), logs: logCapture.snapshot(), traffic: trafficCapture.snapshot()});
    }, 50);
};

export const useDevices = create<DevicesState>((set, get) => ({
    devices: [],
    snapshots: {},
    events: [],
    logs: [],
    traffic: [],
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
        eventCapture.clear();
        set({events: []});
    },
    async clearLogs() {
        await invoke('log:clear', undefined);
        logCapture.clear();
        set({logs: []});
    },
    async clearTraffic() {
        await invoke('traffic:clear', undefined);
        trafficCapture.clear();
        set({traffic: []});
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

        eventCapture.push(event);
        flushSoon();
    });

    on('log:entry', entry => {
        if (useDevices.getState().logsPaused) {
            return;
        }

        logCapture.push(entry);
        flushSoon();
    });

    on('traffic:entry', record => {trafficCapture.push(record); flushSoon();});
    const [logs, traffic] = await Promise.all([invoke('log:history', undefined), invoke('traffic:history', undefined)]);
    const currentLogs = logCapture.snapshot();
    const currentTraffic = trafficCapture.snapshot();
    logCapture.clear();
    trafficCapture.clear();
    const mergedLogs = new Map([...logs, ...currentLogs].map(entry => [entry.id, entry]));
    const mergedTraffic = new Map([...traffic, ...currentTraffic].map(entry => [entry.id, entry]));
    for (const entry of [...mergedLogs.values()].sort((a, b) => a.id - b.id)) logCapture.push(entry);
    for (const entry of [...mergedTraffic.values()].sort((a, b) => a.id - b.id)) trafficCapture.push(entry);
    flushSoon();
    await useDevices.getState().scan();
}
