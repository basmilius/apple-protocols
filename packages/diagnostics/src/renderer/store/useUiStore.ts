import { defineStore } from 'pinia';
import type { FluxIconName } from '@flux-ui/types';
import { ref, watch } from 'vue';

export const useUiStore = defineStore('ui', () => {
    const icon = ref<FluxIconName>();
    const title = ref<string>();

    function setIcon(newIcon?: FluxIconName): void {
        icon.value = newIcon;
    }

    function setTitle(newTitle?: string): void {
        title.value = newTitle;
    }

    watch(title, value => {
        document.title = value ? `${value} | Apple Diagnostics` : 'Apple Diagnostics';
    });

    return {
        icon,
        title,
        setIcon,
        setTitle
    };
});
