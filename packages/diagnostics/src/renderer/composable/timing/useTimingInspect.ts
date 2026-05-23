import { ref } from 'vue';
import { invoke } from '@renderer/app/ipc';
import type { TimingInspectEntry } from '@shared/snapshots';

export function useTimingInspect() {
    const entries = ref<TimingInspectEntry[]>([]);
    const isInspecting = ref(false);
    const error = ref<string | undefined>(undefined);

    async function inspect(): Promise<TimingInspectEntry[]> {
        isInspecting.value = true;
        error.value = undefined;

        try {
            entries.value = await invoke('timing:inspect', undefined as never);
            return entries.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isInspecting.value = false;
        }
    }

    return {
        entries,
        isInspecting,
        error,
        inspect
    };
}
