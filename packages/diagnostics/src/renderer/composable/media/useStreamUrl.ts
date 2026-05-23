import { onScopeDispose, ref } from 'vue';
import { invoke, on } from '@renderer/app/ipc';

export function useStreamUrl() {
    const isStreaming = ref(false);
    const error = ref<string | undefined>(undefined);

    const off = on('media:playback-ended', ({kind}) => {
        if (kind === 'stream') {
            isStreaming.value = false;
        }
    });

    onScopeDispose(off);

    async function stream(url: string): Promise<void> {
        error.value = undefined;
        try {
            await invoke('media:stream-url', {url});
            isStreaming.value = true;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        }
    }

    async function stop(): Promise<void> {
        await invoke('media:stop-stream', undefined as never);
        isStreaming.value = false;
    }

    return {
        isStreaming,
        error,
        stream,
        stop
    };
}
