import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '@renderer/store';

export function usePlaybackState() {
    const store = useConnectionStore();
    const {snapshot} = storeToRefs(store);

    const state = computed(() => snapshot.value.nowPlaying.playbackState);
    const duration = computed(() => snapshot.value.nowPlaying.duration);
    const elapsed = computed(() => snapshot.value.nowPlaying.elapsedTime);

    return {
        state,
        isPlaying: computed(() => state.value === 'Playing'),
        isPaused: computed(() => state.value === 'Paused'),
        isStopped: computed(() => state.value === 'Stopped'),
        duration,
        elapsed,
        progress: computed(() => {
            if (duration.value <= 0) {
                return 0;
            }
            return Math.min(1, Math.max(0, elapsed.value / duration.value));
        })
    };
}
