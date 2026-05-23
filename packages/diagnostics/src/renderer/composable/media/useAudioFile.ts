import { onScopeDispose, ref } from 'vue';
import { invoke, on } from '@renderer/app/ipc';
import type { PickedFile } from '@shared/snapshots';

export function useAudioFile() {
    const currentFile = ref<PickedFile | null>(null);
    const isStreaming = ref(false);
    const error = ref<string | undefined>(undefined);

    const off = on('media:playback-ended', ({kind}) => {
        if (kind === 'file') {
            isStreaming.value = false;
        }
    });

    onScopeDispose(off);

    async function pickFile(filters?: {name: string; extensions: string[]}[]): Promise<PickedFile | null> {
        const file = await invoke('media:pick-file', {filters});
        currentFile.value = file;
        return file;
    }

    async function streamFile(path?: string): Promise<void> {
        const target = path ?? currentFile.value?.path;

        if (!target) {
            throw new Error('No file selected — call pickFile() first');
        }

        error.value = undefined;
        try {
            await invoke('media:stream-file', {path: target});
            isStreaming.value = true;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        }
    }

    async function stopStream(): Promise<void> {
        await invoke('media:stop-stream', undefined as never);
        isStreaming.value = false;
    }

    return {
        currentFile,
        isStreaming,
        error,
        pickFile,
        streamFile,
        stopStream
    };
}
