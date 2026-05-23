import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { invoke, on } from '@renderer/app/ipc';
import type { LogEntry, LogGroup } from '@shared/snapshots';

const MAX_BUFFER = 2000;

export const useLogStore = defineStore('logs', () => {
    const entries = shallowRef<LogEntry[]>([]);
    const groups = ref<Set<LogGroup>>(new Set<LogGroup>(['debug', 'error', 'info', 'net', 'warn']));

    on('log:entry', (entry) => {
        const next = entries.value.slice(-MAX_BUFFER + 1);
        next.push(entry);
        entries.value = next;
    });

    async function loadSnapshot(): Promise<void> {
        const snapshot = await invoke('logs:snapshot', undefined as never);
        entries.value = snapshot.slice(-MAX_BUFFER);
    }

    async function clear(): Promise<void> {
        await invoke('logs:clear', undefined as never);
        entries.value = [];
    }

    async function setGroups(next: LogGroup[]): Promise<void> {
        await invoke('logs:set-groups', {groups: next});
        groups.value = new Set(next);
    }

    return {
        entries,
        groups,
        loadSnapshot,
        clear,
        setGroups
    };
});
