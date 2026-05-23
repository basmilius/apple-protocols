import { ref } from 'vue';
import { invoke } from '@renderer/app/ipc';
import type { TimingFlowMode, TimingFlowReport } from '@shared/snapshots';

export function useTimingFlow() {
    const report = ref<TimingFlowReport | null>(null);
    const isRunning = ref(false);
    const error = ref<string | undefined>(undefined);

    async function run(deviceId: string, mode: TimingFlowMode): Promise<TimingFlowReport> {
        isRunning.value = true;
        error.value = undefined;

        try {
            report.value = await invoke('timing:flow', {deviceId, mode});
            return report.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isRunning.value = false;
        }
    }

    return {
        report,
        isRunning,
        error,
        run
    };
}
