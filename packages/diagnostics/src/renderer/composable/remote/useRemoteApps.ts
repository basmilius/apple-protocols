import { ref } from 'vue';
import { invoke } from '@renderer/app/ipc';
import type { AppInfo } from '@shared/snapshots';

export function useRemoteApps() {
    const apps = ref<AppInfo[]>([]);
    const isLoading = ref(false);
    const error = ref<string | undefined>(undefined);

    async function refresh(): Promise<AppInfo[]> {
        isLoading.value = true;
        error.value = undefined;

        try {
            apps.value = await invoke('remote:apps:list', undefined as never);
            return apps.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isLoading.value = false;
        }
    }

    async function launch(bundleId: string): Promise<void> {
        await invoke('remote:apps:launch', {bundleId});
    }

    return {
        apps,
        isLoading,
        error,
        refresh,
        launch
    };
}
