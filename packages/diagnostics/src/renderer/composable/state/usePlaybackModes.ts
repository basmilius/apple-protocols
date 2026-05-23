import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { invoke } from '@renderer/app/ipc';
import { useConnectionStore } from '@renderer/store';
import type { RepeatModeInput, ShuffleModeInput } from '@shared/ipc';

export function usePlaybackModes() {
    const store = useConnectionStore();
    const {snapshot} = storeToRefs(store);

    return {
        shuffle: computed(() => snapshot.value.nowPlaying.shuffleMode),
        repeat: computed(() => snapshot.value.nowPlaying.repeatMode),
        shuffleSupported: computed(() => snapshot.value.nowPlaying.shuffleSupported),
        repeatSupported: computed(() => snapshot.value.nowPlaying.repeatSupported),
        async advanceShuffle(): Promise<void> {
            await invoke('playback:command', {action: 'advanceShuffle'});
        },
        async advanceRepeat(): Promise<void> {
            await invoke('playback:command', {action: 'advanceRepeat'});
        },
        async setShuffle(mode: ShuffleModeInput): Promise<void> {
            await invoke('playback:set-shuffle', {mode});
        },
        async setRepeat(mode: RepeatModeInput): Promise<void> {
            await invoke('playback:set-repeat', {mode});
        }
    };
}
