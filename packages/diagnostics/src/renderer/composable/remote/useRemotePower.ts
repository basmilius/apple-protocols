import { invoke } from '@renderer/app/ipc';

export function useRemotePower() {
    return {
        async wake(): Promise<void> {
            await invoke('remote:power', {action: 'on'});
        },
        async suspend(): Promise<void> {
            await invoke('remote:power', {action: 'off'});
        },
        async toggle(): Promise<void> {
            await invoke('remote:power', {action: 'toggle'});
        }
    };
}
