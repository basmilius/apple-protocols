import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { invoke } from '@renderer/app/ipc';
import { useConnectionStore } from '@renderer/store';

export function useVolume() {
    const store = useConnectionStore();
    const {snapshot} = storeToRefs(store);

    const percent = computed(() => snapshot.value.volume.level);
    const level = computed(() => percent.value / 100);

    return {
        level,
        percent,
        muted: computed(() => snapshot.value.volume.muted),
        available: computed(() => snapshot.value.volume.available),
        async set(value: number): Promise<void> {
            await invoke('volume:set', {level: value});
        },
        async setPercent(value: number): Promise<void> {
            await invoke('volume:set', {level: value / 100});
        },
        async up(): Promise<void> {
            await invoke('volume:adjust', {direction: 'up'});
        },
        async down(): Promise<void> {
            await invoke('volume:adjust', {direction: 'down'});
        },
        async mute(): Promise<void> {
            await invoke('volume:mute', {muted: true});
        },
        async unmute(): Promise<void> {
            await invoke('volume:mute', {muted: false});
        },
        async toggleMute(): Promise<void> {
            await invoke('volume:toggle-mute', undefined as never);
        }
    };
}
