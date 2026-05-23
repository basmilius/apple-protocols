import { onScopeDispose, ref } from 'vue';
import { invoke, on } from '@renderer/app/ipc';

export function useSineWave() {
    const isPlaying = ref(false);
    const frequency = ref(440);
    const durationSec = ref(60);
    const error = ref<string | undefined>(undefined);

    const off = on('media:playback-ended', ({kind}) => {
        if (kind === 'sine') {
            isPlaying.value = false;
        }
    });

    onScopeDispose(off);

    async function start(options: {frequency?: number; durationSec?: number} = {}): Promise<void> {
        const freq = options.frequency ?? frequency.value;
        const dur = options.durationSec ?? durationSec.value;

        frequency.value = freq;
        durationSec.value = dur;
        error.value = undefined;

        try {
            await invoke('media:stream-sine', {frequency: freq, durationSec: dur});
            isPlaying.value = true;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        }
    }

    async function stop(): Promise<void> {
        await invoke('media:stop-sine', undefined as never);
        isPlaying.value = false;
    }

    return {
        isPlaying,
        frequency,
        durationSec,
        error,
        start,
        stop
    };
}
