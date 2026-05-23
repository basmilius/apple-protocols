import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '@renderer/store';

export function useArtwork() {
    const store = useConnectionStore();
    const {snapshot} = storeToRefs(store);

    return {
        url: computed(() => snapshot.value.nowPlaying.artworkUrl)
    };
}
