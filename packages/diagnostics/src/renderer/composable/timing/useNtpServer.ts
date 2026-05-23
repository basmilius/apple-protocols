import { storeToRefs } from 'pinia';
import { useTimingStore } from '@renderer/store';

export function useNtpServer() {
    const store = useTimingStore();
    const {ntp} = storeToRefs(store);

    return {
        state: ntp,
        start: store.startNtp,
        stop: store.stopNtp,
        refresh: store.refreshNtp
    };
}
