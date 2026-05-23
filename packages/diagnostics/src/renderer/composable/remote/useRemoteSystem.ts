import { invoke } from '@renderer/app/ipc';

export function useRemoteSystem() {
    return {
        async toggleCaptions(): Promise<void> {
            await invoke('remote:system', {action: 'captions'});
        },
        async setAppearance(mode: 'light' | 'dark'): Promise<void> {
            await invoke('remote:system', {action: mode});
        },
        async siriStart(): Promise<void> {
            await invoke('remote:system', {action: 'siri-start'});
        },
        async siriStop(): Promise<void> {
            await invoke('remote:system', {action: 'siri-stop'});
        },
        async findRemote(enabled: boolean = true): Promise<void> {
            await invoke('remote:system', {action: enabled ? 'find-remote-on' : 'find-remote-off'});
        }
    };
}
