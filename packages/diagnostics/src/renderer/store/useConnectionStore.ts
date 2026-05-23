import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { invoke, on } from '@renderer/app/ipc';
import { emptyState, type StateSnapshot } from '@shared/snapshots';

export const useConnectionStore = defineStore('connection', () => {
    const snapshot = ref<StateSnapshot>(emptyState());
    const isConnecting = ref(false);
    const error = ref<string | undefined>(undefined);
    const lastRecoveryAttempt = ref<number | null>(null);

    const isConnected = computed(() => snapshot.value.connected);

    on('device:state', (data) => {
        snapshot.value = data;
    });

    on('device:connected', () => {
        isConnecting.value = false;
        error.value = undefined;
    });

    on('device:disconnected', () => {
        snapshot.value = emptyState();
        lastRecoveryAttempt.value = null;
    });

    on('device:recovering', ({attempt}) => {
        lastRecoveryAttempt.value = attempt;
    });

    on('device:recovery-failed', () => {
        lastRecoveryAttempt.value = null;
    });

    async function connect(deviceId: string): Promise<StateSnapshot> {
        isConnecting.value = true;
        error.value = undefined;

        try {
            snapshot.value = await invoke('device:connect', {deviceId});
            return snapshot.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isConnecting.value = false;
        }
    }

    async function connectByIp(address: string, port?: number): Promise<StateSnapshot> {
        isConnecting.value = true;
        error.value = undefined;

        try {
            snapshot.value = await invoke('device:connect-ip', {address, port});
            return snapshot.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isConnecting.value = false;
        }
    }

    async function disconnect(): Promise<void> {
        await invoke('device:disconnect', undefined as never);
        snapshot.value = emptyState();
    }

    async function refresh(): Promise<StateSnapshot> {
        snapshot.value = await invoke('state:snapshot', undefined as never);
        return snapshot.value;
    }

    return {
        snapshot,
        isConnecting,
        isConnected,
        error,
        lastRecoveryAttempt,
        connect,
        connectByIp,
        disconnect,
        refresh
    };
});
