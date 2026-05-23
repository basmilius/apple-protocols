import { storeToRefs } from 'pinia';
import { useConnectionStore } from '@renderer/store';

export function useDeviceConnection() {
    const store = useConnectionStore();
    const {snapshot, isConnected, isConnecting, error, lastRecoveryAttempt} = storeToRefs(store);

    return {
        snapshot,
        isConnected,
        isConnecting,
        error,
        lastRecoveryAttempt,
        connect: store.connect,
        connectByIp: store.connectByIp,
        disconnect: store.disconnect,
        refresh: store.refresh
    };
}
