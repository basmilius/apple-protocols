import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '@renderer/store';

export function useClients() {
    const store = useConnectionStore();
    const {snapshot} = storeToRefs(store);

    const clients = computed(() => snapshot.value.clients);

    return {
        clients,
        active: computed(() => clients.value.find(client => client.isActive) ?? null),
        byBundleId: computed(() => {
            const map = new Map(clients.value.map(client => [client.bundleIdentifier, client]));
            return map;
        })
    };
}
