import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '@renderer/store';

export function useNowPlaying() {
    const store = useConnectionStore();
    const {snapshot} = storeToRefs(store);

    return {
        title: computed(() => snapshot.value.nowPlaying.title),
        artist: computed(() => snapshot.value.nowPlaying.artist),
        album: computed(() => snapshot.value.nowPlaying.album),
        genre: computed(() => snapshot.value.nowPlaying.genre),
        app: computed(() => snapshot.value.nowPlaying.app),
        bundleId: computed(() => snapshot.value.nowPlaying.bundleIdentifier),
        artworkUrl: computed(() => snapshot.value.nowPlaying.artworkUrl),
        mediaType: computed(() => snapshot.value.nowPlaying.mediaType)
    };
}
