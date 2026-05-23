import type { FluxIconName } from '@flux-ui/types';
import { isRef, onMounted, type Ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useUiStore } from '@renderer/store';

export function defineTitle(icon: FluxIconName, title: string | Ref<string | undefined> | undefined): void {
    const {setIcon, setTitle} = useUiStore();

    onBeforeRouteLeave(() => {
        setIcon();
        setTitle();
    });

    onMounted(() => {
        setIcon(icon);

        if (isRef(title)) {
            return;
        }

        setTitle(title);
    });

    if (!isRef(title)) {
        return;
    }

    watch(title, setTitle, {immediate: true});
}
