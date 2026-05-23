import { storeToRefs } from 'pinia';
import { usePairingStore } from '@renderer/store';

export function usePairingFlow() {
    const store = usePairingStore();
    const {phase, protocol, deviceId, deviceName, error} = storeToRefs(store);

    return {
        phase,
        protocol,
        deviceId,
        deviceName,
        error,
        start: store.start,
        submitPin: store.submitPin,
        cancel: store.cancel,
        reset: store.reset
    };
}
