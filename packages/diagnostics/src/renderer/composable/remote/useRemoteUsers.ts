import { ref } from 'vue';
import { invoke } from '@renderer/app/ipc';
import type { UserInfo } from '@shared/snapshots';

export function useRemoteUsers() {
    const users = ref<UserInfo[]>([]);
    const isLoading = ref(false);
    const error = ref<string | undefined>(undefined);

    async function refresh(): Promise<UserInfo[]> {
        isLoading.value = true;
        error.value = undefined;

        try {
            users.value = await invoke('remote:users:list', undefined as never);
            return users.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            isLoading.value = false;
        }
    }

    async function switchTo(accountId: string): Promise<void> {
        await invoke('remote:users:switch', {accountId});
    }

    return {
        users,
        isLoading,
        error,
        refresh,
        switchTo
    };
}
