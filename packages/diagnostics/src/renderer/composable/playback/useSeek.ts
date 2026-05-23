import { invoke } from '@renderer/app/ipc';

export function useSeek() {
    return {
        async seek(position: number): Promise<void> {
            await invoke('playback:seek', {position});
        },
        async skipForward(seconds: number = 15): Promise<void> {
            await invoke('playback:skip', {direction: 'forward', seconds});
        },
        async skipBackward(seconds: number = 15): Promise<void> {
            await invoke('playback:skip', {direction: 'backward', seconds});
        }
    };
}
