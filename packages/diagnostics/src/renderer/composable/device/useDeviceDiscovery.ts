import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useDeviceListStore } from '@renderer/store';

export function useDeviceDiscovery() {
    const store = useDeviceListStore();
    const {discovered, isScanning, lastScanError} = storeToRefs(store);

    return {
        devices: discovered,
        isScanning: computed(() => isScanning.value),
        error: computed(() => lastScanError.value),
        scan: store.scan,
        rescan: store.rescan
    };
}
