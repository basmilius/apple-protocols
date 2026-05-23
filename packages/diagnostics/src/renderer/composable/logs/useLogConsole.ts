import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useLogStore } from '@renderer/store';

export function useLogConsole() {
    const store = useLogStore();
    const {entries, groups} = storeToRefs(store);

    return {
        entries,
        groups: computed(() => Array.from(groups.value)),
        loadSnapshot: store.loadSnapshot,
        clear: store.clear,
        setGroups: store.setGroups
    };
}
