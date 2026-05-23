import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '@renderer/store';

export function useDeviceMetadata() {
    const store = useConnectionStore();
    const {snapshot} = storeToRefs(store);

    const device = computed(() => snapshot.value.device);

    return {
        device,
        isAppleTV: computed(() => device.value?.type === 'appletv'),
        isHomePod: computed(() => device.value?.type === 'homepod' || device.value?.type === 'homepod-mini'),
        model: computed(() => device.value?.model ?? ''),
        address: computed(() => device.value?.address ?? ''),
        name: computed(() => device.value?.name ?? ''),
        port: computed(() => device.value?.port ?? 0)
    };
}
