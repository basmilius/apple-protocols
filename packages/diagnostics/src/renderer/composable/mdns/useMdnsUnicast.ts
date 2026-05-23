import { ref } from 'vue';
import { invoke } from '@renderer/app/ipc';
import type { MdnsResult } from '@shared/snapshots';

export function useMdnsUnicast() {
    const results = ref<MdnsResult[]>([]);
    const isScanning = ref(false);
    const error = ref<string | undefined>(undefined);

    async function scan(address: string, options: {services?: string[]; timeout?: number} = {}): Promise<MdnsResult[]> {
        isScanning.value = true;
        error.value = undefined;

        try {
            results.value = await invoke('mdns:unicast', {address, services: options.services, timeout: options.timeout});
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
