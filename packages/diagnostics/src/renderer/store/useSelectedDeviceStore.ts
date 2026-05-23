import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { DeviceInfo } from '@shared/snapshots';

export const useSelectedDeviceStore = defineStore('selected-device', () => {
    const device = ref<DeviceInfo | null>(null);

    function select(value: DeviceInfo | null): void {
        device.value = value;
    }

    function clear(): void {
        device.value = null;
    }

    return {
        device,
        select,
        clear
    };
});
