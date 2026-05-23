import { onScopeDispose, ref } from 'vue';
import { invoke, on } from '@renderer/app/ipc';
import type { MultiRoomTarget } from '@shared/snapshots';

export function useMultiRoom() {
    const targets = ref<MultiRoomTarget[]>([]);
    const isStreaming = ref(false);
    const error = ref<string | undefined>(undefined);

    const offChange = on('media:multi-room-target-changed', (event) => {
        const next = [...targets.value];
        const index = next.findIndex(t => t.deviceId === event.deviceId);
        const status = event.status;

        if (status === 'removed') {
            if (index >= 0) {
                next.splice(index, 1);
            }
        } else if (index >= 0) {
            next[index] = {...next[index], status, error: event.error};
        } else {
            next.push({deviceId: event.deviceId, deviceName: event.deviceId, status, error: event.error});
        }

        targets.value = next;
    });

    const offEnd = on('media:playback-ended', ({kind}) => {
        if (kind === 'multi-room') {
            isStreaming.value = false;
        }
    });

    onScopeDispose(() => {
        offChange();
        offEnd();
    });

    async function prepare(deviceIds: string[]): Promise<MultiRoomTarget[]> {
        error.value = undefined;
        try {
            targets.value = await invoke('multi-room:prepare', {deviceIds});
            return targets.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        }
    }

    async function add(deviceId: string): Promise<MultiRoomTarget> {
        const target = await invoke('multi-room:add', {deviceId});
        targets.value = await invoke('multi-room:targets', undefined as never);
        return target;
    }

    async function remove(deviceId: string): Promise<void> {
        await invoke('multi-room:remove', {deviceId});
        targets.value = await invoke('multi-room:targets', undefined as never);
    }

    async function streamUrl(url: string): Promise<void> {
        error.value = undefined;
        try {
            await invoke('multi-room:stream-url', {url});
            isStreaming.value = true;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        }
    }

    async function streamFile(path: string): Promise<void> {
        error.value = undefined;
        try {
            await invoke('multi-room:stream-file', {path});
            isStreaming.value = true;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        }
    }

    async function stop(): Promise<void> {
        await invoke('multi-room:stop', undefined as never);
        isStreaming.value = false;
    }

    async function refreshTargets(): Promise<MultiRoomTarget[]> {
        targets.value = await invoke('multi-room:targets', undefined as never);
        return targets.value;
    }

    return {
        targets,
        isStreaming,
        error,
        prepare,
        add,
        remove,
        streamUrl,
        streamFile,
        stop,
        refreshTargets
    };
}
