import { invoke } from '@renderer/app/ipc';

export function useRemoteText() {
    return {
        async set(text: string): Promise<void> {
            await invoke('remote:text', {action: 'set', text});
        },
        async append(text: string): Promise<void> {
            await invoke('remote:text', {action: 'append', text});
        },
        async clear(): Promise<void> {
            await invoke('remote:text', {action: 'clear'});
        }
    };
}
