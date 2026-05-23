import { storeToRefs } from 'pinia';
import { useDeviceListStore } from '@renderer/store';

export function usePairedDevices() {
    const store = useDeviceListStore();
    const {paired} = storeToRefs(store);

    return {
        paired,
        refresh: store.loadPaired
    };
}
