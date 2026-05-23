import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { invoke } from '@renderer/app/ipc';
import { useConnectionStore } from '@renderer/store';

export function usePowerState() {
    const store = useConnectionStore();
    const {snapshot} = storeToRefs(store);

    const state = computed(() => snapshot.value.power?.state ?? 'unknown');

    return {
        state,
        available: computed(() => snapshot.value.power !== null),
        isAwake: computed(() => state.value === 'awake'),
        async on(): Promise<void> {
            await invoke('remote:power', {action: 'on'});
        },
        async off(): Promise<void> {
            await invoke('remote:power', {action: 'off'});
        },
        async toggle(): Promise<void> {
            await invoke('remote:power', {action: 'toggle'});
        }
    };
}
