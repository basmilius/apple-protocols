import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '@renderer/store';

export function useParticipants() {
    const store = useConnectionStore();
    const {snapshot} = storeToRefs(store);

    return {
        participants: computed(() => snapshot.value.participants)
    };
}
