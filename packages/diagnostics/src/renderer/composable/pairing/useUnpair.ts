import { ref } from 'vue';
import { usePairingStore } from '@renderer/store';
import type { DeviceProtocol } from '@shared/snapshots';

export function useUnpair() {
    const store = usePairingStore();
    const isUnpairing = ref(false);
    const error = ref<string | undefined>(undefined);

    async function unpair(deviceId: string, protocol: DeviceProtocol): Promise<void> {
        isUnpairing.value = true;
        error.value = undefined;

        try {
            await store.unpair(deviceId, protocol);
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isUnpairing.value = false;
        }
    }

    return {
        isUnpairing,
        error,
        unpair
    };
}
