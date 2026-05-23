import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@renderer/app/ipc';
import type { DeviceInfo } from '@shared/snapshots';

export const useDeviceListStore = defineStore('device-list', () => {
    const discovered = ref<DeviceInfo[]>([]);
    const paired = ref<DeviceInfo[]>([]);
    const isScanning = ref(false);
    const lastScanError = ref<string | undefined>(undefined);

    async function scan(): Promise<void> {
        isScanning.value = true;
        lastScanError.value = undefined;

        try {
            discovered.value = await invoke('device:discover', undefined as never);
        } catch (err) {
            lastScanError.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isScanning.value = false;
        }
    }

    async function rescan(): Promise<void> {
        isScanning.value = true;
        lastScanError.value = undefined;

        try {
            discovered.value = await invoke('device:rescan', undefined as never);
        } catch (err) {
            lastScanError.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isScanning.value = false;
        }
    }

    async function loadPaired(): Promise<void> {
        paired.value = await invoke('device:list-paired', undefined as never);
    }

    return {
        discovered,
        paired,
        isScanning,
        lastScanError,
        scan,
        rescan,
        loadPaired
    };
});
