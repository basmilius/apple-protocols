import { ref } from 'vue';
import { invoke } from '@renderer/app/ipc';
import type { DeviceProtocol } from '@shared/snapshots';

export function useVerify() {
    const isVerifying = ref(false);
    const result = ref<'ok' | null>(null);
    const error = ref<string | undefined>(undefined);
    const usedProtocol = ref<DeviceProtocol | null>(null);

    async function verify(deviceId: string, protocol?: DeviceProtocol): Promise<DeviceProtocol> {
        isVerifying.value = true;
        error.value = undefined;
        result.value = null;
        usedProtocol.value = null;

        try {
            const response = await invoke('pairing:verify', {deviceId, protocol});
            result.value = 'ok';
            usedProtocol.value = response.protocol;
            return response.protocol;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isVerifying.value = false;
        }
    }

    return {
        isVerifying,
        result,
        error,
        usedProtocol,
        verify
    };
}
