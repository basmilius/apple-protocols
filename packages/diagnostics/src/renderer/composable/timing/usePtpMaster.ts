import { storeToRefs } from 'pinia';
import { useTimingStore } from '@renderer/store';

export function usePtpMaster() {
    const store = useTimingStore();
    const {ptp} = storeToRefs(store);

    return {
        state: ptp,
        start: store.startPtp,
        stop: store.stopPtp,
        refresh: store.refreshPtp
    };
}
