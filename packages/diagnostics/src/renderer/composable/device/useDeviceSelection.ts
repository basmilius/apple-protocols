import { storeToRefs } from 'pinia';
import { useSelectedDeviceStore } from '@renderer/store';

export function useDeviceSelection() {
    const store = useSelectedDeviceStore();
    const {device} = storeToRefs(store);

    return {
        selected: device,
        select: store.select,
        clear: store.clear
    };
}
