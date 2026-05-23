import { onScopeDispose, ref } from 'vue';
import { invoke, on } from '@renderer/app/ipc';

export function usePlayUrl() {
    const isPlaying = ref(false);
    const error = ref<string | undefined>(undefined);

    const off = on('media:playback-ended', ({kind}) => {
        if (kind === 'url') {
            isPlaying.value = false;
        }
    });

    onScopeDispose(off);

    async function play(url: string, position?: number): Promise<void> {
        error.value = undefined;
        try {
            await invoke('media:play-url', {url, position});
            isPlaying.value = true;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        }
    }

    async function stop(): Promise<void> {
        await invoke('media:stop-url', undefined as never);
        isPlaying.value = false;
    }

    return {
        isPlaying,
        error,
        play,
        stop
    };
}
