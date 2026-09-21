import { useCallback, useEffect, useMemo, useState } from 'react';
import { type CallRoot, type DebugGroup, type DeviceEvent, type DeviceEventSource, type DiscoveredDeviceInfo, isCallFailure, type LogEntry, type StateSnapshot } from '@shared/contract';
import { invoke } from '@/client';
import { useDevices } from '@/state/devices';

export type DeviceHandle = {
    readonly device: DiscoveredDeviceInfo | null;
    readonly snapshot: StateSnapshot | null;
    readonly connected: boolean;
    readonly busy: boolean;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
};

export function useDevice(deviceId: string | null): DeviceHandle {
    const devices = useDevices(state => state.devices);
    const snapshots = useDevices(state => state.snapshots);
    const busyMap = useDevices(state => state.busy);
    const connect = useDevices(state => state.connect);
    const disconnect = useDevices(state => state.disconnect);

    /* Building the object inside a store selector would cause a render loop. */
    return useMemo(() => {
        const device = deviceId === null ? null : (devices.find(candidate => candidate.id === deviceId) ?? null);
        const snapshot = deviceId === null ? null : (snapshots[deviceId] ?? null);

        return {
            device,
            snapshot,
            connected: snapshot?.connection.connected ?? false,
            busy: deviceId !== null && busyMap[deviceId] === true,
            connect: async () => {
                if (deviceId !== null) {
                    await connect(deviceId);
                }
            },
            disconnect: async () => {
                if (deviceId !== null) {
                    await disconnect(deviceId);
                }
            }
        };
    }, [deviceId, devices, snapshots, busyMap, connect, disconnect]);
}

export type DeviceCall = (root: CallRoot, path: string, args?: readonly unknown[]) => Promise<unknown>;

/** Rejects failed `device:call` results so command buttons can display the error directly. */
export function useDeviceCall(deviceId: string | null): DeviceCall {
    return useCallback(
        async (root, path, args) => {
            if (deviceId === null) {
                throw new Error('This panel has no device.');
            }

            const result = await invoke('device:call', {deviceId, root, path, args});

            if (isCallFailure(result)) {
                throw new Error(`${result.error.name}: ${result.error.message}`);
            }

            return result.value;
        },
        [deviceId]
    );
}

const TICK_MS = 500;

export type Playhead = {
    readonly elapsedTime: number;
    readonly playbackRate: number;
    readonly playbackState: string;
};

/**
 * Extrapolates playback between snapshots, which can be minutes apart.
 *
 * @param updatedAt - Snapshot timestamp in milliseconds.
 * @returns Elapsed playback time in seconds.
 */
export function usePlayhead(playhead: Playhead | null, updatedAt: number | undefined): number {
    const playing = playhead !== null && playhead.playbackState === 'Playing' && playhead.playbackRate !== 0;
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!playing) {
            return;
        }

        setNow(Date.now());

        const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);

        return () => window.clearInterval(timer);
    }, [playing, playhead?.elapsedTime, updatedAt]);

    if (playhead === null) {
        return 0;
    }

    if (!playing || updatedAt === undefined) {
        return playhead.elapsedTime;
    }

    return Math.max(0, playhead.elapsedTime + ((now - updatedAt) / 1000) * playhead.playbackRate);
}

export type EventFilter = {
    readonly sources?: readonly DeviceEventSource[];
    readonly names?: readonly string[];
    readonly limit?: number;
};

/** The forwarded events for one device, newest last. */
export function useDeviceEvents(deviceId: string | null, filter: EventFilter = {}): readonly DeviceEvent[] {
    const events = useDevices(state => state.events);
    const {sources, names, limit = 1000} = filter;

    return useMemo(() => {
        const matched = events.filter(event => {
            if (deviceId !== null && event.deviceId !== deviceId) {
                return false;
            }

            if (sources !== undefined && !sources.includes(event.source)) {
                return false;
            }

            return names === undefined || names.includes(event.name);
        });

        return matched.length > limit ? matched.slice(matched.length - limit) : matched;
    }, [events, deviceId, sources, names, limit]);
}

export type LogFilter = {
    readonly groups?: readonly DebugGroup[];
    readonly deviceIds?: readonly string[];
    readonly search?: string;
    readonly limit?: number;
};

export function useLogs(filter: LogFilter = {}): readonly LogEntry[] {
    const logs = useDevices(state => state.logs);
    const {groups, deviceIds, search, limit = 5000} = filter;

    return useMemo(() => {
        const needle = search?.trim().toLowerCase() ?? '';
        const matched = logs.filter(entry => {
            if (groups !== undefined && !groups.includes(entry.group)) {
                return false;
            }

            if (deviceIds !== undefined && (entry.deviceId === null || !deviceIds.includes(entry.deviceId))) {
                return false;
            }

            return needle.length === 0 || entry.message.toLowerCase().includes(needle);
        });

        return matched.length > limit ? matched.slice(matched.length - limit) : matched;
    }, [logs, groups, deviceIds, search, limit]);
}
