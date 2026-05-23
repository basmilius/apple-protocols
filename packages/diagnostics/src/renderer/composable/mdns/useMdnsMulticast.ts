import { ref } from 'vue';
import { invoke } from '@renderer/app/ipc';
import type { MdnsResult } from '@shared/snapshots';

export function useMdnsMulticast() {
    const results = ref<MdnsResult[]>([]);
    const isScanning = ref(false);
    const error = ref<string | undefined>(undefined);

    async function scan(options: {services?: string[]; timeout?: number} = {}): Promise<MdnsResult[]> {
        isScanning.value = true;
        error.value = undefined;

        try {
            results.value = await invoke('mdns:multicast', options);
            return results.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isScanning.value = false;
        }
    }

    return {
        results,
        isScanning,
        error,
        scan
    };
}
