import { invoke } from '@renderer/app/ipc';

export function usePlaybackControls() {
    return {
        async play(): Promise<void> {
            await invoke('playback:command', {action: 'play'});
        },
        async pause(): Promise<void> {
            await invoke('playback:command', {action: 'pause'});
        },
        async playPause(): Promise<void> {
            await invoke('playback:command', {action: 'playPause'});
        },
        async stop(): Promise<void> {
            await invoke('playback:command', {action: 'stop'});
        },
        async next(): Promise<void> {
            await invoke('playback:command', {action: 'next'});
        },
        async previous(): Promise<void> {
            await invoke('playback:command', {action: 'previous'});
        }
    };
}
